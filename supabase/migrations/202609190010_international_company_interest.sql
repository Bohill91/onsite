begin;

-- Migration 009 made every company signup a UK contractor-programme record.
-- Keep those historical identities intact, but give new company signups an
-- explicit market and country so international interest cannot receive OSC
-- identities, contractor referrals, or account-credit entitlements.
alter table public.early_access_signups
  add column if not exists operating_country_code text,
  add column if not exists registration_market text not null default 'uk',
  add column if not exists uk_operating_acknowledged_at timestamptz,
  add column if not exists international_interest_acknowledged_at timestamptz;

alter table public.early_access_signups
  drop constraint if exists early_access_signups_type_fields_check,
  drop constraint if exists early_access_signups_referral_acknowledgement_check;

alter table public.early_access_signups
  add constraint early_access_signups_registration_market_check
    check (registration_market in ('uk', 'international')),
  add constraint early_access_signups_operating_country_check
    check (operating_country_code is null or operating_country_code ~ '^[A-Z]{2}$'),
  add constraint early_access_signups_type_fields_check
    check (
      (
        signup_type = 'worker'
        and founding_worker
        and referral_code ~ '^OSW-[A-Z0-9]{12,24}$'
        and (referred_by_code is null or referred_by_code ~ '^OSW-[A-Z0-9]{12,24}$')
        and worker_trade_key is not null
        and worker_trade is not null
        and worker_role_key is not null
        and worker_role is not null
        and home_area is not null
        and company_name is null
        and registration_market = 'uk'
      )
      or
      (
        signup_type = 'company'
        and not founding_worker
        and company_name is not null
        and operating_area is not null
        and cardinality(labour_category_keys) > 0
        and (
          (
            registration_market = 'uk'
            and (operating_country_code is null or operating_country_code = 'GB')
            and referral_code ~ '^OSC-[A-Z0-9]{12,24}$'
            and (referred_by_code is null or referred_by_code ~ '^OSC-[A-Z0-9]{12,24}$')
          )
          or
          (
            registration_market = 'international'
            and operating_country_code is not null
            and operating_country_code <> 'GB'
            and referral_code is null
            and referred_by_code is null
          )
        )
      )
    ),
  add constraint early_access_signups_referral_acknowledgement_check
    check (
      (
        signup_type = 'worker'
        and cis_referral_acknowledged_at is not null
        and company_referral_acknowledged_at is null
        and referral_terms_version is not null
        and uk_operating_acknowledged_at is null
        and international_interest_acknowledged_at is null
      )
      or
      (
        signup_type = 'company'
        and registration_market = 'uk'
        and cis_referral_acknowledged_at is null
        and company_referral_acknowledged_at is not null
        and referral_terms_version is not null
        and (
          uk_operating_acknowledged_at is not null
          or operating_country_code is null
        )
        and international_interest_acknowledged_at is null
      )
      or
      (
        signup_type = 'company'
        and registration_market = 'international'
        and cis_referral_acknowledged_at is null
        and company_referral_acknowledged_at is null
        and referral_terms_version is null
        and uk_operating_acknowledged_at is null
        and international_interest_acknowledged_at is not null
      )
    );

create or replace function public.protect_early_access_signup_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.signup_type is distinct from new.signup_type
    or old.email_normalized is distinct from new.email_normalized
    or old.mobile_normalized is distinct from new.mobile_normalized
    or old.referral_code is distinct from new.referral_code
    or old.referred_by_code is distinct from new.referred_by_code
    or old.founding_worker is distinct from new.founding_worker
    or old.registration_market is distinct from new.registration_market
    or old.created_at is distinct from new.created_at
    or (
      old.operating_country_code is not null
      and old.operating_country_code is distinct from new.operating_country_code
    )
    or (
      old.cis_referral_acknowledged_at is not null
      and old.cis_referral_acknowledged_at is distinct from new.cis_referral_acknowledged_at
    )
    or (
      old.company_referral_acknowledged_at is not null
      and old.company_referral_acknowledged_at is distinct from new.company_referral_acknowledged_at
    )
    or (
      old.uk_operating_acknowledged_at is not null
      and old.uk_operating_acknowledged_at is distinct from new.uk_operating_acknowledged_at
    )
    or (
      old.international_interest_acknowledged_at is not null
      and old.international_interest_acknowledged_at is distinct from new.international_interest_acknowledged_at
    )
    or (
      old.referral_terms_version is not null
      and old.referral_terms_version is distinct from new.referral_terms_version
    ) then
    raise exception using
      errcode = '23514',
      message = 'Early Access identity, market and referral fields are immutable.',
      detail = 'EARLY_ACCESS_IDENTITY_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists early_access_signups_protect_identity on public.early_access_signups;
create trigger early_access_signups_protect_identity
before update on public.early_access_signups
for each row execute function public.protect_early_access_signup_identity();

create or replace function public.validate_early_access_signup_programme()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.signup_type = 'worker' and new.cis_referral_acknowledged_at is null then
    raise exception using
      errcode = '23514',
      message = 'CIS referral eligibility acknowledgement is required.',
      detail = 'CIS_REFERRAL_ACKNOWLEDGEMENT_REQUIRED';
  elsif new.signup_type = 'company' and new.registration_market = 'uk'
    and new.company_referral_acknowledged_at is null then
    raise exception using
      errcode = '23514',
      message = 'Company referral eligibility acknowledgement is required.',
      detail = 'COMPANY_REFERRAL_ACKNOWLEDGEMENT_REQUIRED';
  elsif new.signup_type = 'company' and new.registration_market = 'uk'
    and new.operating_country_code is not null
    and new.uk_operating_acknowledged_at is null then
    raise exception using
      errcode = '23514',
      message = 'UK operating acknowledgement is required.',
      detail = 'UK_OPERATING_ACKNOWLEDGEMENT_REQUIRED';
  elsif new.signup_type = 'company' and new.registration_market = 'international'
    and new.international_interest_acknowledged_at is null then
    raise exception using
      errcode = '23514',
      message = 'International-interest acknowledgement is required.',
      detail = 'INTERNATIONAL_INTEREST_ACKNOWLEDGEMENT_REQUIRED';
  end if;
  return new;
end;
$$;

drop trigger if exists early_access_signups_validate_programme on public.early_access_signups;
create trigger early_access_signups_validate_programme
before insert on public.early_access_signups
for each row execute function public.validate_early_access_signup_programme();

create or replace function public.validate_early_access_referral_programme()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  referrer_record public.early_access_signups%rowtype;
  referred_record public.early_access_signups%rowtype;
begin
  select * into referrer_record
  from public.early_access_signups
  where id = new.referrer_signup_id;

  select * into referred_record
  from public.early_access_signups
  where id = new.referred_signup_id;

  if new.programme_type = 'subcontractor_cash' then
    if referrer_record.signup_type <> 'worker'
      or referred_record.signup_type <> 'worker'
      or new.referral_code_snapshot !~ '^OSW-[A-Z0-9]{12,24}$'
      or referrer_record.referral_code is distinct from new.referral_code_snapshot then
      raise exception using
        errcode = '23514',
        message = 'Sub-contractor referrals require two worker signups and an OSW code.',
        detail = 'EARLY_ACCESS_WORKER_REFERRAL_REQUIRED';
    end if;
  elsif new.programme_type = 'contractor_credit' then
    if referrer_record.signup_type <> 'company'
      or referred_record.signup_type <> 'company'
      or referrer_record.registration_market <> 'uk'
      or referred_record.registration_market <> 'uk'
      or referrer_record.company_referral_acknowledged_at is null
      or referred_record.company_referral_acknowledged_at is null
      or new.referral_code_snapshot !~ '^OSC-[A-Z0-9]{12,24}$'
      or referrer_record.referral_code is distinct from new.referral_code_snapshot then
      raise exception using
        errcode = '23514',
        message = 'Contractor referrals require two eligible UK company signups and an OSC code.',
        detail = 'EARLY_ACCESS_COMPANY_REFERRAL_REQUIRED';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists early_access_referrals_validate_programme on public.early_access_referrals;
create trigger early_access_referrals_validate_programme
before insert on public.early_access_referrals
for each row execute function public.validate_early_access_referral_programme();

create or replace function public.join_early_access_company_v3(
  p_company_name text,
  p_first_name text,
  p_last_name text,
  p_email_normalized text,
  p_mobile_normalized text,
  p_operating_country_code text,
  p_registration_market text,
  p_labour_category_keys text[],
  p_labour_categories text[],
  p_operating_area text,
  p_approximate_workers integer,
  p_note text,
  p_issued_referral_code text,
  p_supplied_referral_code text,
  p_uk_operating_acknowledged boolean,
  p_international_interest_acknowledged boolean,
  p_company_acknowledged boolean,
  p_referral_terms_version text,
  p_marketing_consent boolean,
  p_privacy_version text,
  p_utm_source text,
  p_utm_medium text,
  p_utm_campaign text,
  p_utm_content text,
  p_landing_path text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  email_match public.early_access_signups%rowtype;
  mobile_match public.early_access_signups%rowtype;
  signup_record public.early_access_signups%rowtype;
  referrer_record public.early_access_signups%rowtype;
  referral_id uuid;
  referred_count integer;
  supplied_code text := nullif(upper(trim(p_supplied_referral_code)), '');
  lock_left text;
  lock_right text;
begin
  if p_registration_market not in ('uk', 'international')
    or p_operating_country_code is null
    or upper(trim(p_operating_country_code)) !~ '^[A-Z]{2}$'
    or (p_registration_market = 'uk' and upper(trim(p_operating_country_code)) <> 'GB')
    or (p_registration_market = 'international' and upper(trim(p_operating_country_code)) = 'GB') then
    raise exception using errcode = '22023', message = 'The operating country and registration market do not match.', detail = 'INVALID_OPERATING_MARKET';
  end if;

  if p_registration_market = 'uk' then
    if p_uk_operating_acknowledged is not true then
      raise exception using errcode = '23514', message = 'UK operating acknowledgement is required.', detail = 'UK_OPERATING_ACKNOWLEDGEMENT_REQUIRED';
    end if;
    if p_company_acknowledged is not true then
      raise exception using errcode = '23514', message = 'Company referral eligibility acknowledgement is required.', detail = 'COMPANY_REFERRAL_ACKNOWLEDGEMENT_REQUIRED';
    end if;
    if nullif(trim(p_referral_terms_version), '') is null then
      raise exception using errcode = '22023', message = 'Referral terms version is required.';
    end if;
    if p_issued_referral_code !~ '^OSC-[A-Z0-9]{12,24}$' then
      raise exception using errcode = '22023', message = 'The issued referral code is invalid.', detail = 'INVALID_ISSUED_REFERRAL_CODE';
    end if;
    if supplied_code is not null and supplied_code !~ '^OSC-[A-Z0-9]{12,24}$' then
      raise exception using errcode = '22023', message = 'The supplied referral code is invalid.', detail = 'INVALID_REFERRAL_CODE';
    end if;
  else
    if p_international_interest_acknowledged is not true then
      raise exception using errcode = '23514', message = 'International-interest acknowledgement is required.', detail = 'INTERNATIONAL_INTEREST_ACKNOWLEDGEMENT_REQUIRED';
    end if;
    if p_company_acknowledged is true
      or nullif(trim(p_referral_terms_version), '') is not null
      or p_issued_referral_code is not null
      or supplied_code is not null then
      raise exception using errcode = '23514', message = 'International-interest registrations cannot use the UK contractor referral programme.', detail = 'INTERNATIONAL_REFERRAL_NOT_ALLOWED';
    end if;
  end if;

  lock_left := least('company-email:' || p_email_normalized, 'company-mobile:' || p_mobile_normalized);
  lock_right := greatest('company-email:' || p_email_normalized, 'company-mobile:' || p_mobile_normalized);
  perform pg_advisory_xact_lock(hashtextextended(lock_left, 0));
  perform pg_advisory_xact_lock(hashtextextended(lock_right, 0));

  select * into email_match from public.early_access_signups
  where signup_type = 'company' and email_normalized = p_email_normalized;
  select * into mobile_match from public.early_access_signups
  where signup_type = 'company' and mobile_normalized = p_mobile_normalized;

  if email_match.id is not null or mobile_match.id is not null then
    if email_match.id is null or mobile_match.id is null or email_match.id <> mobile_match.id then
      return jsonb_build_object('accepted', true, 'redacted', true, 'created', false);
    end if;
    signup_record := email_match;
    if supplied_code = signup_record.referral_code then
      raise exception using errcode = '23514', message = 'A company cannot refer itself.', detail = 'SELF_REFERRAL';
    end if;
    if coalesce(supplied_code, '') <> coalesce(signup_record.referred_by_code, '') then
      return jsonb_build_object('accepted', true, 'redacted', true, 'created', false);
    end if;
    if signup_record.registration_market = 'uk'
      and signup_record.company_referral_acknowledged_at is null then
      update public.early_access_signups
      set company_referral_acknowledged_at = now(),
          referral_terms_version = p_referral_terms_version
      where id = signup_record.id
      returning * into signup_record;
    end if;
    select count(*)::integer into referred_count
    from public.early_access_referrals
    where referrer_signup_id = signup_record.id;
    return jsonb_build_object(
      'accepted', true, 'created', false, 'signup_id', signup_record.id,
      'first_name', signup_record.first_name, 'company_name', signup_record.company_name,
      'email_normalized', signup_record.email_normalized,
      'registration_market', signup_record.registration_market,
      'operating_country_code', signup_record.operating_country_code,
      'referral_code', signup_record.referral_code,
      'referred_count', referred_count
    );
  end if;

  if supplied_code is not null then
    select * into referrer_record from public.early_access_signups
    where signup_type = 'company'
      and registration_market = 'uk'
      and referral_code = supplied_code;
    if referrer_record.id is null then
      raise exception using errcode = '22023', message = 'The supplied referral code is invalid.', detail = 'INVALID_REFERRAL_CODE';
    end if;
  end if;

  insert into public.early_access_signups (
    signup_type, email_normalized, mobile_normalized, first_name, last_name,
    company_name, operating_country_code, registration_market, operating_area,
    labour_category_keys, labour_categories, approximate_worker_requirement, company_note,
    founding_worker, referral_code, referred_by_code,
    uk_operating_acknowledged_at, international_interest_acknowledged_at,
    company_referral_acknowledged_at, referral_terms_version,
    privacy_acknowledged_at, privacy_version,
    marketing_consent, marketing_consented_at,
    utm_source, utm_medium, utm_campaign, utm_content, landing_path
  ) values (
    'company', p_email_normalized, p_mobile_normalized, p_first_name, p_last_name,
    p_company_name, upper(trim(p_operating_country_code)), p_registration_market, p_operating_area,
    p_labour_category_keys, p_labour_categories, p_approximate_workers, nullif(p_note, ''),
    false,
    case when p_registration_market = 'uk' then p_issued_referral_code else null end,
    case when p_registration_market = 'uk' then supplied_code else null end,
    case when p_registration_market = 'uk' then now() else null end,
    case when p_registration_market = 'international' then now() else null end,
    case when p_registration_market = 'uk' then now() else null end,
    case when p_registration_market = 'uk' then p_referral_terms_version else null end,
    now(), p_privacy_version,
    coalesce(p_marketing_consent, false),
    case when coalesce(p_marketing_consent, false) then now() else null end,
    nullif(p_utm_source, ''), nullif(p_utm_medium, ''), nullif(p_utm_campaign, ''),
    nullif(p_utm_content, ''), p_landing_path
  ) returning * into signup_record;

  if referrer_record.id is not null then
    insert into public.early_access_referrals (
      referrer_signup_id, referred_signup_id, referral_code_snapshot,
      programme_type, programme_phase, status, joined_at
    ) values (
      referrer_record.id, signup_record.id, supplied_code,
      'contractor_credit', 'prelaunch', 'joined', signup_record.created_at
    ) returning id into referral_id;

    insert into public.early_access_referral_rewards (
      referral_id, reward_key, beneficiary_signup_id, amount_pence,
      qualifying_paid_days, status, programme_type, beneficiary_type,
      benefit_type, milestone_type, verification_requirement
    ) values
      (referral_id, 'referred_company_first_booking_credit', signup_record.id, 10000, null, 'potential', 'contractor_credit', 'company', 'account_credit', 'first_qualifying_labour_booking', 'company'),
      (referral_id, 'referrer_company_five_paid_labour_days', referrer_record.id, 10000, 5, 'potential', 'contractor_credit', 'company', 'account_credit', 'qualifying_paid_days', 'company'),
      (referral_id, 'referrer_company_twenty_paid_labour_days', referrer_record.id, 15000, 20, 'potential', 'contractor_credit', 'company', 'account_credit', 'qualifying_paid_days', 'company')
    on conflict (referral_id, reward_key) do nothing;
  end if;

  select count(*)::integer into referred_count
  from public.early_access_referrals
  where referrer_signup_id = signup_record.id;
  return jsonb_build_object(
    'accepted', true, 'created', true, 'signup_id', signup_record.id,
    'first_name', signup_record.first_name, 'company_name', signup_record.company_name,
    'registration_market', signup_record.registration_market,
    'operating_country_code', signup_record.operating_country_code,
    'referral_code', signup_record.referral_code, 'referred_count', referred_count
  );
end;
$$;

revoke all on function public.join_early_access_company_v3(
  text, text, text, text, text, text, text, text[], text[], text, integer, text,
  text, text, boolean, boolean, boolean, text, boolean, text, text, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.join_early_access_company_v3(
  text, text, text, text, text, text, text, text[], text[], text, integer, text,
  text, text, boolean, boolean, boolean, text, boolean, text, text, text, text, text
) to service_role;

revoke all on function public.validate_early_access_referral_programme()
from public, anon, authenticated, service_role;
grant execute on function public.validate_early_access_referral_programme()
to service_role;

commit;