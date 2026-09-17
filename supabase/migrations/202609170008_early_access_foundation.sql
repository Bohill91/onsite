begin;

create table if not exists public.early_access_signups (
  id uuid primary key default gen_random_uuid(),
  signup_type text not null,
  email_normalized text not null,
  mobile_normalized text not null,
  first_name text not null,
  last_name text not null,
  worker_trade_key text,
  worker_trade text,
  worker_role_key text,
  worker_role text,
  home_area text,
  founding_worker boolean not null default false,
  referral_code text,
  referred_by_code text,
  company_name text,
  operating_area text,
  labour_category_keys text[] not null default '{}',
  labour_categories text[] not null default '{}',
  approximate_worker_requirement integer,
  company_note text,
  privacy_acknowledged_at timestamptz not null default now(),
  privacy_version text not null,
  marketing_consent boolean not null default false,
  marketing_consented_at timestamptz,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  landing_path text not null default '/early-access',
  email_delivery_status text not null default 'pending',
  email_delivery_updated_at timestamptz not null default now(),
  converted_auth_user_id uuid references auth.users(id) on delete set null,
  converted_worker_profile_id uuid references public.worker_profiles(id) on delete set null,
  converted_company_id uuid references public.companies(id) on delete set null,
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint early_access_signups_type_check
    check (signup_type in ('worker', 'company')),
  constraint early_access_signups_email_normalized_check
    check (email_normalized = lower(trim(email_normalized)) and position('@' in email_normalized) > 1),
  constraint early_access_signups_mobile_normalized_check
    check (mobile_normalized ~ '^\+[1-9][0-9]{7,14}$'),
  constraint early_access_signups_referral_code_check
    check (referral_code is null or referral_code ~ '^OSW-[A-Z0-9]{12,24}$'),
  constraint early_access_signups_referred_by_code_check
    check (referred_by_code is null or referred_by_code ~ '^OSW-[A-Z0-9]{12,24}$'),
  constraint early_access_signups_marketing_timestamp_check
    check (
      (marketing_consent and marketing_consented_at is not null)
      or (not marketing_consent and marketing_consented_at is null)
    ),
  constraint early_access_signups_delivery_status_check
    check (email_delivery_status in ('pending', 'skipped', 'sent', 'failed')),
  constraint early_access_signups_approximate_workers_check
    check (
      approximate_worker_requirement is null
      or approximate_worker_requirement between 1 and 100000
    ),
  constraint early_access_signups_type_fields_check
    check (
      (
        signup_type = 'worker'
        and founding_worker
        and referral_code is not null
        and worker_trade_key is not null
        and worker_trade is not null
        and worker_role_key is not null
        and worker_role is not null
        and home_area is not null
        and company_name is null
      )
      or
      (
        signup_type = 'company'
        and not founding_worker
        and referral_code is null
        and company_name is not null
        and operating_area is not null
        and cardinality(labour_category_keys) > 0
      )
    )
);

create unique index if not exists early_access_signups_type_email_unique
  on public.early_access_signups (signup_type, email_normalized);

create unique index if not exists early_access_signups_type_mobile_unique
  on public.early_access_signups (signup_type, mobile_normalized);

create unique index if not exists early_access_signups_referral_code_unique
  on public.early_access_signups (referral_code)
  where referral_code is not null;

create table if not exists public.early_access_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_signup_id uuid not null
    references public.early_access_signups(id) on delete restrict,
  referred_signup_id uuid not null unique
    references public.early_access_signups(id) on delete restrict,
  referral_code_snapshot text not null,
  programme_phase text not null default 'prelaunch',
  status text not null default 'joined',
  joined_at timestamptz not null default now(),
  profile_completed_at timestamptz,
  started_work_at timestamptz,
  five_paid_days_at timestamptz,
  twenty_paid_days_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint early_access_referrals_not_self_check
    check (referrer_signup_id <> referred_signup_id),
  constraint early_access_referrals_code_check
    check (referral_code_snapshot ~ '^OSW-[A-Z0-9]{12,24}$'),
  constraint early_access_referrals_phase_check
    check (programme_phase in ('prelaunch', 'live')),
  constraint early_access_referrals_status_check
    check (status in ('joined', 'profile_completed', 'started_work', 'five_paid_days', 'twenty_paid_days'))
);

create index if not exists early_access_referrals_referrer_idx
  on public.early_access_referrals (referrer_signup_id, joined_at);

create table if not exists public.early_access_referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null
    references public.early_access_referrals(id) on delete restrict,
  reward_key text not null,
  beneficiary_signup_id uuid not null
    references public.early_access_signups(id) on delete restrict,
  amount_pence integer not null,
  qualifying_paid_days integer not null,
  status text not null default 'potential',
  qualified_at timestamptz,
  credited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint early_access_referral_rewards_unique unique (referral_id, reward_key),
  constraint early_access_referral_rewards_key_check
    check (reward_key in ('referrer_five_paid_days', 'referrer_twenty_paid_days', 'referred_five_paid_days')),
  constraint early_access_referral_rewards_amount_check
    check (amount_pence > 0),
  constraint early_access_referral_rewards_days_check
    check (qualifying_paid_days in (5, 20)),
  constraint early_access_referral_rewards_status_check
    check (status in ('potential', 'pending', 'eligible', 'credited', 'cancelled'))
);

drop trigger if exists early_access_signups_set_updated_at on public.early_access_signups;
create trigger early_access_signups_set_updated_at
before update on public.early_access_signups
for each row execute function public.set_updated_at();

drop trigger if exists early_access_referrals_set_updated_at on public.early_access_referrals;
create trigger early_access_referrals_set_updated_at
before update on public.early_access_referrals
for each row execute function public.set_updated_at();

drop trigger if exists early_access_referral_rewards_set_updated_at on public.early_access_referral_rewards;
create trigger early_access_referral_rewards_set_updated_at
before update on public.early_access_referral_rewards
for each row execute function public.set_updated_at();

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
    or old.created_at is distinct from new.created_at then
    raise exception using
      errcode = '23514',
      message = 'Early Access identity and referral fields are immutable.',
      detail = 'EARLY_ACCESS_IDENTITY_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists early_access_signups_protect_identity on public.early_access_signups;
create trigger early_access_signups_protect_identity
before update on public.early_access_signups
for each row execute function public.protect_early_access_signup_identity();

create or replace function public.protect_early_access_referral_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = '23503',
      message = 'Early Access referral history cannot be deleted.',
      detail = 'EARLY_ACCESS_REFERRAL_HISTORY_RESTRICTED';
  end if;
  if old.referrer_signup_id is distinct from new.referrer_signup_id
    or old.referred_signup_id is distinct from new.referred_signup_id
    or old.referral_code_snapshot is distinct from new.referral_code_snapshot
    or old.joined_at is distinct from new.joined_at
    or old.created_at is distinct from new.created_at then
    raise exception using
      errcode = '23514',
      message = 'Early Access referral attribution is immutable.',
      detail = 'EARLY_ACCESS_REFERRAL_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists early_access_referrals_protect_identity on public.early_access_referrals;
create trigger early_access_referrals_protect_identity
before update or delete on public.early_access_referrals
for each row execute function public.protect_early_access_referral_identity();

create or replace function public.validate_early_access_referral_workers()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  referrer_type text;
  referred_type text;
begin
  select signup_type into referrer_type
  from public.early_access_signups
  where id = new.referrer_signup_id;

  select signup_type into referred_type
  from public.early_access_signups
  where id = new.referred_signup_id;

  if referrer_type <> 'worker' or referred_type <> 'worker' then
    raise exception using
      errcode = '23514',
      message = 'Early Access referrals may only connect worker signups.',
      detail = 'EARLY_ACCESS_WORKER_REFERRAL_REQUIRED';
  end if;
  return new;
end;
$$;

drop trigger if exists early_access_referrals_validate_workers on public.early_access_referrals;
create trigger early_access_referrals_validate_workers
before insert on public.early_access_referrals
for each row execute function public.validate_early_access_referral_workers();

create or replace function public.join_early_access_worker(
  p_first_name text,
  p_last_name text,
  p_email_normalized text,
  p_mobile_normalized text,
  p_trade_key text,
  p_trade text,
  p_role_key text,
  p_role text,
  p_home_area text,
  p_issued_referral_code text,
  p_supplied_referral_code text,
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
set search_path = public
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
  lock_left := least('worker-email:' || p_email_normalized, 'worker-mobile:' || p_mobile_normalized);
  lock_right := greatest('worker-email:' || p_email_normalized, 'worker-mobile:' || p_mobile_normalized);
  perform pg_advisory_xact_lock(hashtextextended(lock_left, 0));
  perform pg_advisory_xact_lock(hashtextextended(lock_right, 0));

  select * into email_match
  from public.early_access_signups
  where signup_type = 'worker' and email_normalized = p_email_normalized;

  select * into mobile_match
  from public.early_access_signups
  where signup_type = 'worker' and mobile_normalized = p_mobile_normalized;

  if email_match.id is not null or mobile_match.id is not null then
    if email_match.id is null
      or mobile_match.id is null
      or email_match.id <> mobile_match.id then
      return jsonb_build_object('accepted', true, 'redacted', true, 'created', false);
    end if;

    signup_record := email_match;
    if supplied_code = signup_record.referral_code then
      raise exception using
        errcode = '23514',
        message = 'A worker cannot refer themselves.',
        detail = 'SELF_REFERRAL';
    end if;
    if coalesce(supplied_code, '') <> coalesce(signup_record.referred_by_code, '') then
      return jsonb_build_object('accepted', true, 'redacted', true, 'created', false);
    end if;

    select count(*)::integer into referred_count
    from public.early_access_referrals
    where referrer_signup_id = signup_record.id;

    return jsonb_build_object(
      'accepted', true,
      'created', false,
      'signup_id', signup_record.id,
      'first_name', signup_record.first_name,
      'email_normalized', signup_record.email_normalized,
      'founding_worker', signup_record.founding_worker,
      'referral_code', signup_record.referral_code,
      'referred_count', referred_count
    );
  end if;

  if p_issued_referral_code !~ '^OSW-[A-Z0-9]{12,24}$' then
    raise exception using
      errcode = '22023',
      message = 'The issued referral code is invalid.',
      detail = 'INVALID_ISSUED_REFERRAL_CODE';
  end if;

  if supplied_code is not null then
    select * into referrer_record
    from public.early_access_signups
    where signup_type = 'worker' and referral_code = supplied_code;
    if referrer_record.id is null then
      raise exception using
        errcode = '22023',
        message = 'The supplied referral code is invalid.',
        detail = 'INVALID_REFERRAL_CODE';
    end if;
  end if;

  insert into public.early_access_signups (
    signup_type, email_normalized, mobile_normalized, first_name, last_name,
    worker_trade_key, worker_trade, worker_role_key, worker_role, home_area,
    founding_worker, referral_code, referred_by_code,
    privacy_acknowledged_at, privacy_version,
    marketing_consent, marketing_consented_at,
    utm_source, utm_medium, utm_campaign, utm_content, landing_path
  ) values (
    'worker', p_email_normalized, p_mobile_normalized, p_first_name, p_last_name,
    p_trade_key, p_trade, p_role_key, p_role, p_home_area,
    true, p_issued_referral_code, supplied_code,
    now(), p_privacy_version,
    coalesce(p_marketing_consent, false),
    case when coalesce(p_marketing_consent, false) then now() else null end,
    nullif(p_utm_source, ''), nullif(p_utm_medium, ''),
    nullif(p_utm_campaign, ''), nullif(p_utm_content, ''), p_landing_path
  ) returning * into signup_record;

  if referrer_record.id is not null then
    insert into public.early_access_referrals (
      referrer_signup_id, referred_signup_id, referral_code_snapshot,
      programme_phase, status, joined_at
    ) values (
      referrer_record.id, signup_record.id, supplied_code,
      'prelaunch', 'joined', signup_record.created_at
    ) returning id into referral_id;

    insert into public.early_access_referral_rewards (
      referral_id, reward_key, beneficiary_signup_id,
      amount_pence, qualifying_paid_days, status
    ) values
      (referral_id, 'referrer_five_paid_days', referrer_record.id, 5000, 5, 'potential'),
      (referral_id, 'referrer_twenty_paid_days', referrer_record.id, 5000, 20, 'potential'),
      (referral_id, 'referred_five_paid_days', signup_record.id, 2500, 5, 'potential');
  end if;

  select count(*)::integer into referred_count
  from public.early_access_referrals
  where referrer_signup_id = signup_record.id;

  return jsonb_build_object(
    'accepted', true,
    'created', true,
    'signup_id', signup_record.id,
    'first_name', signup_record.first_name,
    'email_normalized', signup_record.email_normalized,
    'founding_worker', true,
    'referral_code', signup_record.referral_code,
    'referred_count', referred_count
  );
end;
$$;

create or replace function public.join_early_access_company(
  p_company_name text,
  p_first_name text,
  p_last_name text,
  p_email_normalized text,
  p_mobile_normalized text,
  p_labour_category_keys text[],
  p_labour_categories text[],
  p_operating_area text,
  p_approximate_workers integer,
  p_note text,
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
set search_path = public
as $$
declare
  email_match public.early_access_signups%rowtype;
  mobile_match public.early_access_signups%rowtype;
  signup_record public.early_access_signups%rowtype;
  lock_left text;
  lock_right text;
begin
  lock_left := least('company-email:' || p_email_normalized, 'company-mobile:' || p_mobile_normalized);
  lock_right := greatest('company-email:' || p_email_normalized, 'company-mobile:' || p_mobile_normalized);
  perform pg_advisory_xact_lock(hashtextextended(lock_left, 0));
  perform pg_advisory_xact_lock(hashtextextended(lock_right, 0));

  select * into email_match
  from public.early_access_signups
  where signup_type = 'company' and email_normalized = p_email_normalized;

  select * into mobile_match
  from public.early_access_signups
  where signup_type = 'company' and mobile_normalized = p_mobile_normalized;

  if email_match.id is not null or mobile_match.id is not null then
    if email_match.id is null
      or mobile_match.id is null
      or email_match.id <> mobile_match.id then
      return jsonb_build_object('accepted', true, 'redacted', true, 'created', false);
    end if;
    signup_record := email_match;
    return jsonb_build_object(
      'accepted', true,
      'created', false,
      'signup_id', signup_record.id,
      'first_name', signup_record.first_name,
      'company_name', signup_record.company_name,
      'email_normalized', signup_record.email_normalized
    );
  end if;

  insert into public.early_access_signups (
    signup_type, email_normalized, mobile_normalized, first_name, last_name,
    company_name, operating_area, labour_category_keys, labour_categories,
    approximate_worker_requirement, company_note,
    privacy_acknowledged_at, privacy_version,
    marketing_consent, marketing_consented_at,
    utm_source, utm_medium, utm_campaign, utm_content, landing_path
  ) values (
    'company', p_email_normalized, p_mobile_normalized, p_first_name, p_last_name,
    p_company_name, p_operating_area, p_labour_category_keys, p_labour_categories,
    p_approximate_workers, nullif(p_note, ''),
    now(), p_privacy_version,
    coalesce(p_marketing_consent, false),
    case when coalesce(p_marketing_consent, false) then now() else null end,
    nullif(p_utm_source, ''), nullif(p_utm_medium, ''),
    nullif(p_utm_campaign, ''), nullif(p_utm_content, ''), p_landing_path
  ) returning * into signup_record;

  return jsonb_build_object(
    'accepted', true,
    'created', true,
    'signup_id', signup_record.id,
    'first_name', signup_record.first_name,
    'company_name', signup_record.company_name,
    'email_normalized', signup_record.email_normalized
  );
end;
$$;

create or replace function public.set_early_access_email_delivery_status(
  p_signup_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('skipped', 'sent', 'failed') then
    raise exception using
      errcode = '22023',
      message = 'Invalid Early Access email status.',
      detail = 'INVALID_EMAIL_DELIVERY_STATUS';
  end if;
  update public.early_access_signups
  set email_delivery_status = p_status,
      email_delivery_updated_at = now()
  where id = p_signup_id;
end;
$$;

alter table public.early_access_signups enable row level security;
alter table public.early_access_referrals enable row level security;
alter table public.early_access_referral_rewards enable row level security;

revoke all on public.early_access_signups from public, anon, authenticated, service_role;
revoke all on public.early_access_referrals from public, anon, authenticated, service_role;
revoke all on public.early_access_referral_rewards from public, anon, authenticated, service_role;

grant select, insert, update on public.early_access_signups to service_role;
grant select, insert, update on public.early_access_referrals to service_role;
grant select, insert, update on public.early_access_referral_rewards to service_role;

revoke all on function public.join_early_access_worker(
  text, text, text, text, text, text, text, text, text, text, text,
  boolean, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.join_early_access_worker(
  text, text, text, text, text, text, text, text, text, text, text,
  boolean, text, text, text, text, text, text
) to service_role;

revoke all on function public.join_early_access_company(
  text, text, text, text, text, text[], text[], text, integer, text,
  boolean, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.join_early_access_company(
  text, text, text, text, text, text[], text[], text, integer, text,
  boolean, text, text, text, text, text, text
) to service_role;

revoke all on function public.set_early_access_email_delivery_status(uuid, text)
from public, anon, authenticated;
grant execute on function public.set_early_access_email_delivery_status(uuid, text)
to service_role;

commit;
