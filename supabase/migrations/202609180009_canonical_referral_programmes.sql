begin;

-- Migration 008 introduced the worker Early Access programme. Extend that
-- model in place so existing OSW identities and entitlements remain intact.
drop trigger if exists early_access_signups_protect_identity on public.early_access_signups;

alter table public.early_access_signups
  drop constraint if exists early_access_signups_referral_code_check,
  drop constraint if exists early_access_signups_referred_by_code_check,
  drop constraint if exists early_access_signups_type_fields_check;

alter table public.early_access_signups
  add column if not exists cis_referral_acknowledged_at timestamptz,
  add column if not exists company_referral_acknowledged_at timestamptz,
  add column if not exists referral_terms_version text;

-- Companies registered before the contractor programme receive one stable,
-- non-sequential OSC identity without changing any existing OSW identity.
update public.early_access_signups
set referral_code = 'OSC-' || upper(
  substring(replace(gen_random_uuid()::text, '-', '') from 1 for 12)
  || substring(replace(gen_random_uuid()::text, '-', '') from 25 for 8)
)
where signup_type = 'company'
  and referral_code is null;

alter table public.early_access_signups
  add constraint early_access_signups_referral_code_check
    check (referral_code is null or referral_code ~ '^OS[WC]-[A-Z0-9]{12,24}$'),
  add constraint early_access_signups_referred_by_code_check
    check (referred_by_code is null or referred_by_code ~ '^OS[WC]-[A-Z0-9]{12,24}$'),
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
      )
      or
      (
        signup_type = 'company'
        and not founding_worker
        and referral_code ~ '^OSC-[A-Z0-9]{12,24}$'
        and (referred_by_code is null or referred_by_code ~ '^OSC-[A-Z0-9]{12,24}$')
        and company_name is not null
        and operating_area is not null
        and cardinality(labour_category_keys) > 0
      )
    ),
  add constraint early_access_signups_referral_acknowledgement_check
    check (
      (
        cis_referral_acknowledged_at is null
        and company_referral_acknowledged_at is null
        and referral_terms_version is null
      )
      or
      (
        signup_type = 'worker'
        and cis_referral_acknowledged_at is not null
        and company_referral_acknowledged_at is null
        and referral_terms_version is not null
      )
      or
      (
        signup_type = 'company'
        and cis_referral_acknowledged_at is null
        and company_referral_acknowledged_at is not null
        and referral_terms_version is not null
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
    or old.created_at is distinct from new.created_at
    or (
      old.cis_referral_acknowledged_at is not null
      and old.cis_referral_acknowledged_at is distinct from new.cis_referral_acknowledged_at
    )
    or (
      old.company_referral_acknowledged_at is not null
      and old.company_referral_acknowledged_at is distinct from new.company_referral_acknowledged_at
    )
    or (
      old.referral_terms_version is not null
      and old.referral_terms_version is distinct from new.referral_terms_version
    ) then
    raise exception using
      errcode = '23514',
      message = 'Early Access identity and referral fields are immutable.',
      detail = 'EARLY_ACCESS_IDENTITY_IMMUTABLE';
  end if;
  return new;
end;
$$;

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
  elsif new.signup_type = 'company' and new.company_referral_acknowledged_at is null then
    raise exception using
      errcode = '23514',
      message = 'Company referral eligibility acknowledgement is required.',
      detail = 'COMPANY_REFERRAL_ACKNOWLEDGEMENT_REQUIRED';
  end if;
  return new;
end;
$$;

drop trigger if exists early_access_signups_validate_programme on public.early_access_signups;
create trigger early_access_signups_validate_programme
before insert on public.early_access_signups
for each row execute function public.validate_early_access_signup_programme();

drop trigger if exists early_access_referrals_validate_workers on public.early_access_referrals;
drop trigger if exists early_access_referrals_protect_identity on public.early_access_referrals;

alter table public.early_access_referrals
  drop constraint if exists early_access_referrals_code_check;

alter table public.early_access_referrals
  add column if not exists programme_type text not null default 'subcontractor_cash',
  add column if not exists first_qualifying_booking_at timestamptz,
  add constraint early_access_referrals_code_check
    check (referral_code_snapshot ~ '^OS[WC]-[A-Z0-9]{12,24}$'),
  add constraint early_access_referrals_programme_check
    check (programme_type in ('subcontractor_cash', 'contractor_credit'));

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
    or old.programme_type is distinct from new.programme_type
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

create trigger early_access_referrals_protect_identity
before update or delete on public.early_access_referrals
for each row execute function public.protect_early_access_referral_identity();

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
      or new.referral_code_snapshot !~ '^OSC-[A-Z0-9]{12,24}$'
      or referrer_record.referral_code is distinct from new.referral_code_snapshot then
      raise exception using
        errcode = '23514',
        message = 'Contractor referrals require two company signups and an OSC code.',
        detail = 'EARLY_ACCESS_COMPANY_REFERRAL_REQUIRED';
    end if;
  end if;
  return new;
end;
$$;

do $$
begin
  if exists (
    select 1
    from public.early_access_referrals referral
    join public.early_access_signups referrer
      on referrer.id = referral.referrer_signup_id
    where referral.referral_code_snapshot is distinct from referrer.referral_code
  ) then
    raise exception using
      errcode = '23514',
      message = 'Existing Early Access referral snapshots do not match their referrer codes.',
      detail = 'EARLY_ACCESS_REFERRAL_SNAPSHOT_MISMATCH';
  end if;
end;
$$;

create trigger early_access_referrals_validate_programme
before insert or update on public.early_access_referrals
for each row execute function public.validate_early_access_referral_programme();

alter table public.early_access_referral_rewards
  drop constraint if exists early_access_referral_rewards_key_check,
  drop constraint if exists early_access_referral_rewards_amount_check,
  drop constraint if exists early_access_referral_rewards_days_check,
  drop constraint if exists early_access_referral_rewards_status_check;

alter table public.early_access_referral_rewards
  alter column qualifying_paid_days drop not null,
  add column if not exists programme_type text not null default 'subcontractor_cash',
  add column if not exists beneficiary_type text not null default 'worker',
  add column if not exists benefit_type text not null default 'cash',
  add column if not exists milestone_type text not null default 'qualifying_paid_days',
  add column if not exists verification_requirement text not null default 'cis',
  add column if not exists qualifying_evidence_key text,
  add column if not exists verification_confirmed_at timestamptz,
  add column if not exists payable_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists voided_at timestamptz,
  add constraint early_access_referral_rewards_key_check check (
    reward_key in (
      'referrer_five_paid_days',
      'referrer_twenty_paid_days',
      'referred_five_paid_days',
      'referred_company_first_booking_credit',
      'referrer_company_five_paid_labour_days',
      'referrer_company_twenty_paid_labour_days'
    )
  ),
  add constraint early_access_referral_rewards_amount_check check (
    (reward_key = 'referrer_five_paid_days' and amount_pence = 5000)
    or (reward_key = 'referrer_twenty_paid_days' and amount_pence = 5000)
    or (reward_key = 'referred_five_paid_days' and amount_pence = 2500)
    or (reward_key = 'referred_company_first_booking_credit' and amount_pence = 10000)
    or (reward_key = 'referrer_company_five_paid_labour_days' and amount_pence = 10000)
    or (reward_key = 'referrer_company_twenty_paid_labour_days' and amount_pence = 15000)
  ),
  add constraint early_access_referral_rewards_days_check check (
    (milestone_type = 'first_qualifying_labour_booking' and qualifying_paid_days is null)
    or (milestone_type = 'qualifying_paid_days' and qualifying_paid_days in (5, 20))
  ),
  add constraint early_access_referral_rewards_programme_check
    check (programme_type in ('subcontractor_cash', 'contractor_credit')),
  add constraint early_access_referral_rewards_beneficiary_check
    check (beneficiary_type in ('worker', 'company')),
  add constraint early_access_referral_rewards_benefit_check
    check (benefit_type in ('cash', 'account_credit')),
  add constraint early_access_referral_rewards_milestone_check
    check (milestone_type in ('qualifying_paid_days', 'first_qualifying_labour_booking')),
  add constraint early_access_referral_rewards_verification_check
    check (verification_requirement in ('cis', 'company')),
  add constraint early_access_referral_rewards_consistency_check check (
    (
      reward_key in (
        'referrer_five_paid_days',
        'referrer_twenty_paid_days',
        'referred_five_paid_days'
      )
      and programme_type = 'subcontractor_cash'
      and beneficiary_type = 'worker'
      and benefit_type = 'cash'
      and milestone_type = 'qualifying_paid_days'
      and verification_requirement = 'cis'
    )
    or
    (
      reward_key in (
        'referred_company_first_booking_credit',
        'referrer_company_five_paid_labour_days',
        'referrer_company_twenty_paid_labour_days'
      )
      and programme_type = 'contractor_credit'
      and beneficiary_type = 'company'
      and benefit_type = 'account_credit'
      and verification_requirement = 'company'
    )
  ),
  add constraint early_access_referral_rewards_status_check check (
    status in (
      'potential',
      'earned_pending_verification',
      'payable',
      'paid',
      'void',
      'pending',
      'eligible',
      'credited',
      'cancelled'
    )
  ),
  add constraint early_access_referral_rewards_evidence_key_check check (
    qualifying_evidence_key is null
    or btrim(qualifying_evidence_key) <> ''
  ),
  add constraint early_access_referral_rewards_lifecycle_check check (
    (
      status = 'potential'
      and payable_at is null
      and paid_at is null
      and voided_at is null
    )
    or (
      status = 'earned_pending_verification'
      and qualifying_evidence_key is not null
      and btrim(qualifying_evidence_key) <> ''
      and verification_confirmed_at is null
      and payable_at is null
      and paid_at is null
      and voided_at is null
    )
    or (
      status = 'payable'
      and qualifying_evidence_key is not null
      and btrim(qualifying_evidence_key) <> ''
      and verification_confirmed_at is not null
      and payable_at is not null
      and paid_at is null
      and voided_at is null
    )
    or (
      status = 'paid'
      and benefit_type = 'cash'
      and qualifying_evidence_key is not null
      and btrim(qualifying_evidence_key) <> ''
      and verification_confirmed_at is not null
      and payable_at is not null
      and paid_at is not null
      and paid_at >= payable_at
      and voided_at is null
    )
    or (
      status = 'void'
      and voided_at is not null
      and paid_at is null
    )
    or (
      status = 'credited'
      and benefit_type = 'account_credit'
      and qualifying_evidence_key is not null
      and btrim(qualifying_evidence_key) <> ''
      and verification_confirmed_at is not null
      and payable_at is not null
      and paid_at is null
      and voided_at is null
    )
    or (
      status in ('pending', 'eligible', 'cancelled')
      and payable_at is null
      and paid_at is null
      and voided_at is null
    )
  );

create unique index if not exists early_access_referral_rewards_evidence_unique
  on public.early_access_referral_rewards (qualifying_evidence_key)
  where qualifying_evidence_key is not null;

create or replace function public.validate_early_access_referral_entitlement()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  referral_record public.early_access_referrals%rowtype;
  beneficiary_signup_type text;
  expected_beneficiary_id uuid;
begin
  select * into referral_record
  from public.early_access_referrals
  where id = new.referral_id;

  select signup_type into beneficiary_signup_type
  from public.early_access_signups
  where id = new.beneficiary_signup_id;

  if new.reward_key in ('referred_five_paid_days', 'referred_company_first_booking_credit') then
    expected_beneficiary_id := referral_record.referred_signup_id;
  else
    expected_beneficiary_id := referral_record.referrer_signup_id;
  end if;

  if referral_record.programme_type is distinct from new.programme_type
    or expected_beneficiary_id is distinct from new.beneficiary_signup_id
    or beneficiary_signup_type is distinct from new.beneficiary_type then
    raise exception using
      errcode = '23514',
      message = 'Referral entitlement does not match its canonical programme or beneficiary.',
      detail = 'EARLY_ACCESS_ENTITLEMENT_PROGRAMME_MISMATCH';
  end if;
  return new;
end;
$$;

drop trigger if exists early_access_referral_rewards_validate_entitlement
on public.early_access_referral_rewards;
create trigger early_access_referral_rewards_validate_entitlement
before insert or update on public.early_access_referral_rewards
for each row execute function public.validate_early_access_referral_entitlement();

create or replace function public.protect_early_access_referral_reward_transition()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'potential' then
      raise exception using
        errcode = '23514',
        message = 'New Early Access rewards must start as potential.',
        detail = 'EARLY_ACCESS_REWARD_INITIAL_STATUS';
    end if;
    return new;
  end if;

  if old.status is not distinct from new.status then
    return new;
  end if;

  if old.status in ('paid', 'credited', 'void', 'cancelled', 'pending', 'eligible') then
    raise exception using
      errcode = '23514',
      message = 'Terminal or legacy Early Access reward statuses cannot transition.',
      detail = 'EARLY_ACCESS_REWARD_STATUS_TERMINAL';
  end if;

  if new.status in ('pending', 'eligible', 'cancelled') then
    raise exception using
      errcode = '23514',
      message = 'Legacy Early Access reward statuses cannot be newly assigned.',
      detail = 'EARLY_ACCESS_REWARD_LEGACY_STATUS';
  end if;

  if old.status = 'potential'
    and new.status not in ('earned_pending_verification', 'void') then
    raise exception using
      errcode = '23514',
      message = 'Potential rewards may only become earned-pending-verification or void.',
      detail = 'EARLY_ACCESS_REWARD_INVALID_TRANSITION';
  elsif old.status = 'earned_pending_verification'
    and new.status not in ('payable', 'void') then
    raise exception using
      errcode = '23514',
      message = 'Earned rewards may only become payable or void.',
      detail = 'EARLY_ACCESS_REWARD_INVALID_TRANSITION';
  elsif old.status = 'payable'
    and new.status not in ('paid', 'credited', 'void') then
    raise exception using
      errcode = '23514',
      message = 'Payable rewards may only become paid, credited, or void.',
      detail = 'EARLY_ACCESS_REWARD_INVALID_TRANSITION';
  else
    raise exception using
      errcode = '23514',
      message = 'The Early Access reward status transition is not permitted.',
      detail = 'EARLY_ACCESS_REWARD_INVALID_TRANSITION';
  end if;

  return new;
end;
$$;

drop trigger if exists early_access_referral_rewards_protect_transition
on public.early_access_referral_rewards;
create trigger early_access_referral_rewards_protect_transition
before insert or update of status on public.early_access_referral_rewards
for each row execute function public.protect_early_access_referral_reward_transition();

create table if not exists public.early_access_referral_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  reward_id uuid not null
    references public.early_access_referral_rewards(id) on delete restrict,
  company_signup_id uuid not null
    references public.early_access_signups(id) on delete restrict,
  entry_type text not null,
  amount_pence integer not null,
  idempotency_key text not null unique,
  external_reference text,
  reversal_of_ledger_id uuid
    references public.early_access_referral_credit_ledger(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint early_access_referral_credit_ledger_type_check
    check (entry_type in ('earned', 'applied', 'reversed')),
  constraint early_access_referral_credit_ledger_amount_check
    check (amount_pence <> 0),
  constraint early_access_referral_credit_ledger_reversal_check
    check (
      (
        entry_type in ('earned', 'applied')
        and reversal_of_ledger_id is null
      )
      or (
        entry_type = 'reversed'
        and reversal_of_ledger_id is not null
      )
    )
);

create unique index if not exists early_access_referral_credit_ledger_reversal_unique
  on public.early_access_referral_credit_ledger (reversal_of_ledger_id)
  where reversal_of_ledger_id is not null;

create unique index if not exists early_access_referral_credit_ledger_reward_earned_unique
  on public.early_access_referral_credit_ledger (reward_id)
  where entry_type = 'earned';

create or replace function public.validate_early_access_referral_credit_ledger()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  reward_record public.early_access_referral_rewards%rowtype;
  previous_record public.early_access_referral_credit_ledger%rowtype;
  current_balance bigint;
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = '23503',
      message = 'Early Access credit ledger entries cannot be deleted.',
      detail = 'EARLY_ACCESS_CREDIT_LEDGER_APPEND_ONLY';
  end if;

  if tg_op = 'UPDATE' then
    raise exception using
      errcode = '23514',
      message = 'Early Access credit ledger entries are append-only.',
      detail = 'EARLY_ACCESS_CREDIT_LEDGER_APPEND_ONLY';
  end if;

  select reward.*
  into reward_record
  from public.early_access_referral_rewards reward
  where reward.id = new.reward_id;

  if reward_record.id is null
    or reward_record.programme_type <> 'contractor_credit'
    or reward_record.benefit_type <> 'account_credit'
    or reward_record.beneficiary_type <> 'company'
    or reward_record.beneficiary_signup_id is distinct from new.company_signup_id then
    raise exception using
      errcode = '23514',
      message = 'Credit ledger entries must belong to the reward beneficiary company.',
      detail = 'EARLY_ACCESS_CREDIT_LEDGER_REWARD_MISMATCH';
  end if;

  if new.entry_type = 'earned' then
    if new.amount_pence <> reward_record.amount_pence
      or new.amount_pence <= 0
      or new.reversal_of_ledger_id is not null then
      raise exception using
        errcode = '23514',
        message = 'Earned credit must equal its authorised positive reward amount.',
        detail = 'EARLY_ACCESS_CREDIT_LEDGER_EARNED_AMOUNT';
    end if;
  elsif new.entry_type = 'applied' then
    if new.amount_pence >= 0
      or abs(new.amount_pence) > reward_record.amount_pence
      or new.reversal_of_ledger_id is not null then
      raise exception using
        errcode = '23514',
        message = 'Applied credit must be a bounded negative amount.',
        detail = 'EARLY_ACCESS_CREDIT_LEDGER_APPLIED_AMOUNT';
    end if;
  elsif new.entry_type = 'reversed' then
    select previous.*
    into previous_record
    from public.early_access_referral_credit_ledger previous
    where previous.id = new.reversal_of_ledger_id;

    if previous_record.id is null
      or previous_record.entry_type not in ('earned', 'applied')
      or previous_record.reward_id is distinct from new.reward_id
      or previous_record.company_signup_id is distinct from new.company_signup_id
      or new.amount_pence <> -previous_record.amount_pence then
      raise exception using
        errcode = '23514',
        message = 'A reversal must exactly reverse a prior posting for the same reward and company.',
        detail = 'EARLY_ACCESS_CREDIT_LEDGER_REVERSAL_INVALID';
    end if;
  end if;

  select coalesce(sum(amount_pence), 0)::bigint
  into current_balance
  from public.early_access_referral_credit_ledger existing
  where existing.reward_id = new.reward_id
    and existing.company_signup_id = new.company_signup_id;

  if current_balance + new.amount_pence < 0 then
    raise exception using
      errcode = '23514',
      message = 'Credit ledger balance cannot become negative.',
      detail = 'EARLY_ACCESS_CREDIT_LEDGER_NEGATIVE_BALANCE';
  end if;

  return new;
end;
$$;

drop trigger if exists early_access_referral_credit_ledger_validate
on public.early_access_referral_credit_ledger;
create trigger early_access_referral_credit_ledger_validate
before insert or update or delete on public.early_access_referral_credit_ledger
for each row execute function public.validate_early_access_referral_credit_ledger();

alter table public.early_access_referral_credit_ledger enable row level security;
revoke all on public.early_access_referral_credit_ledger
from public, anon, authenticated, service_role;

create or replace function public.join_early_access_worker_v2(
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
  p_cis_acknowledged boolean,
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
  if p_cis_acknowledged is not true then
    raise exception using
      errcode = '23514',
      message = 'CIS referral eligibility acknowledgement is required.',
      detail = 'CIS_REFERRAL_ACKNOWLEDGEMENT_REQUIRED';
  end if;
  if nullif(trim(p_referral_terms_version), '') is null then
    raise exception using errcode = '22023', message = 'Referral terms version is required.';
  end if;
  if p_issued_referral_code !~ '^OSW-[A-Z0-9]{12,24}$' then
    raise exception using errcode = '22023', message = 'The issued referral code is invalid.', detail = 'INVALID_ISSUED_REFERRAL_CODE';
  end if;
  if supplied_code is not null and supplied_code !~ '^OSW-[A-Z0-9]{12,24}$' then
    raise exception using errcode = '22023', message = 'The supplied referral code is invalid.', detail = 'INVALID_REFERRAL_CODE';
  end if;

  lock_left := least('worker-email:' || p_email_normalized, 'worker-mobile:' || p_mobile_normalized);
  lock_right := greatest('worker-email:' || p_email_normalized, 'worker-mobile:' || p_mobile_normalized);
  perform pg_advisory_xact_lock(hashtextextended(lock_left, 0));
  perform pg_advisory_xact_lock(hashtextextended(lock_right, 0));

  select * into email_match from public.early_access_signups
  where signup_type = 'worker' and email_normalized = p_email_normalized;
  select * into mobile_match from public.early_access_signups
  where signup_type = 'worker' and mobile_normalized = p_mobile_normalized;

  if email_match.id is not null or mobile_match.id is not null then
    if email_match.id is null or mobile_match.id is null or email_match.id <> mobile_match.id then
      return jsonb_build_object('accepted', true, 'redacted', true, 'created', false);
    end if;
    signup_record := email_match;
    if supplied_code = signup_record.referral_code then
      raise exception using errcode = '23514', message = 'A worker cannot refer themselves.', detail = 'SELF_REFERRAL';
    end if;
    if coalesce(supplied_code, '') <> coalesce(signup_record.referred_by_code, '') then
      return jsonb_build_object('accepted', true, 'redacted', true, 'created', false);
    end if;
    if signup_record.cis_referral_acknowledged_at is null then
      update public.early_access_signups
      set cis_referral_acknowledged_at = now(),
          referral_terms_version = p_referral_terms_version
      where id = signup_record.id
      returning * into signup_record;
    end if;
    select count(*)::integer into referred_count
    from public.early_access_referrals
    where referrer_signup_id = signup_record.id;
    return jsonb_build_object(
      'accepted', true, 'created', false, 'signup_id', signup_record.id,
      'first_name', signup_record.first_name,
      'email_normalized', signup_record.email_normalized,
      'founding_worker', signup_record.founding_worker,
      'referral_code', signup_record.referral_code,
      'referred_count', referred_count
    );
  end if;

  if supplied_code is not null then
    select * into referrer_record from public.early_access_signups
    where signup_type = 'worker' and referral_code = supplied_code;
    if referrer_record.id is null then
      raise exception using errcode = '22023', message = 'The supplied referral code is invalid.', detail = 'INVALID_REFERRAL_CODE';
    end if;
  end if;

  insert into public.early_access_signups (
    signup_type, email_normalized, mobile_normalized, first_name, last_name,
    worker_trade_key, worker_trade, worker_role_key, worker_role, home_area,
    founding_worker, referral_code, referred_by_code,
    cis_referral_acknowledged_at, referral_terms_version,
    privacy_acknowledged_at, privacy_version,
    marketing_consent, marketing_consented_at,
    utm_source, utm_medium, utm_campaign, utm_content, landing_path
  ) values (
    'worker', p_email_normalized, p_mobile_normalized, p_first_name, p_last_name,
    p_trade_key, p_trade, p_role_key, p_role, p_home_area,
    true, p_issued_referral_code, supplied_code,
    now(), p_referral_terms_version,
    now(), p_privacy_version,
    coalesce(p_marketing_consent, false),
    case when coalesce(p_marketing_consent, false) then now() else null end,
    nullif(p_utm_source, ''), nullif(p_utm_medium, ''),
    nullif(p_utm_campaign, ''), nullif(p_utm_content, ''), p_landing_path
  ) returning * into signup_record;

  if referrer_record.id is not null then
    insert into public.early_access_referrals (
      referrer_signup_id, referred_signup_id, referral_code_snapshot,
      programme_type, programme_phase, status, joined_at
    ) values (
      referrer_record.id, signup_record.id, supplied_code,
      'subcontractor_cash', 'prelaunch', 'joined', signup_record.created_at
    ) returning id into referral_id;

    insert into public.early_access_referral_rewards (
      referral_id, reward_key, beneficiary_signup_id, amount_pence,
      qualifying_paid_days, status, programme_type, beneficiary_type,
      benefit_type, milestone_type, verification_requirement
    ) values
      (referral_id, 'referrer_five_paid_days', referrer_record.id, 5000, 5, 'potential', 'subcontractor_cash', 'worker', 'cash', 'qualifying_paid_days', 'cis'),
      (referral_id, 'referrer_twenty_paid_days', referrer_record.id, 5000, 20, 'potential', 'subcontractor_cash', 'worker', 'cash', 'qualifying_paid_days', 'cis'),
      (referral_id, 'referred_five_paid_days', signup_record.id, 2500, 5, 'potential', 'subcontractor_cash', 'worker', 'cash', 'qualifying_paid_days', 'cis')
    on conflict (referral_id, reward_key) do nothing;
  end if;

  select count(*)::integer into referred_count
  from public.early_access_referrals
  where referrer_signup_id = signup_record.id;
  return jsonb_build_object(
    'accepted', true, 'created', true, 'signup_id', signup_record.id,
    'first_name', signup_record.first_name,
    'email_normalized', signup_record.email_normalized,
    'founding_worker', true,
    'referral_code', signup_record.referral_code,
    'referred_count', referred_count
  );
end;
$$;

create or replace function public.join_early_access_company_v2(
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
  p_issued_referral_code text,
  p_supplied_referral_code text,
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
  if p_company_acknowledged is not true then
    raise exception using
      errcode = '23514',
      message = 'Company referral eligibility acknowledgement is required.',
      detail = 'COMPANY_REFERRAL_ACKNOWLEDGEMENT_REQUIRED';
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
    if signup_record.company_referral_acknowledged_at is null then
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
      'first_name', signup_record.first_name,
      'company_name', signup_record.company_name,
      'email_normalized', signup_record.email_normalized,
      'referral_code', signup_record.referral_code,
      'referred_count', referred_count
    );
  end if;

  if supplied_code is not null then
    select * into referrer_record from public.early_access_signups
    where signup_type = 'company' and referral_code = supplied_code;
    if referrer_record.id is null then
      raise exception using errcode = '22023', message = 'The supplied referral code is invalid.', detail = 'INVALID_REFERRAL_CODE';
    end if;
  end if;

  insert into public.early_access_signups (
    signup_type, email_normalized, mobile_normalized, first_name, last_name,
    company_name, operating_area, labour_category_keys, labour_categories,
    approximate_worker_requirement, company_note,
    founding_worker, referral_code, referred_by_code,
    company_referral_acknowledged_at, referral_terms_version,
    privacy_acknowledged_at, privacy_version,
    marketing_consent, marketing_consented_at,
    utm_source, utm_medium, utm_campaign, utm_content, landing_path
  ) values (
    'company', p_email_normalized, p_mobile_normalized, p_first_name, p_last_name,
    p_company_name, p_operating_area, p_labour_category_keys, p_labour_categories,
    p_approximate_workers, nullif(p_note, ''),
    false, p_issued_referral_code, supplied_code,
    now(), p_referral_terms_version,
    now(), p_privacy_version,
    coalesce(p_marketing_consent, false),
    case when coalesce(p_marketing_consent, false) then now() else null end,
    nullif(p_utm_source, ''), nullif(p_utm_medium, ''),
    nullif(p_utm_campaign, ''), nullif(p_utm_content, ''), p_landing_path
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
    'first_name', signup_record.first_name,
    'company_name', signup_record.company_name,
    'email_normalized', signup_record.email_normalized,
    'referral_code', signup_record.referral_code,
    'referred_count', referred_count
  );
end;
$$;

-- The original RPCs cannot satisfy the new mandatory acknowledgements.
revoke execute on function public.join_early_access_worker(
  text, text, text, text, text, text, text, text, text, text, text,
  boolean, text, text, text, text, text, text
) from service_role;
revoke execute on function public.join_early_access_company(
  text, text, text, text, text, text[], text[], text, integer, text,
  boolean, text, text, text, text, text, text
) from service_role;

revoke all on function public.validate_early_access_signup_programme()
from public, anon, authenticated, service_role;
revoke all on function public.validate_early_access_referral_programme()
from public, anon, authenticated, service_role;
revoke all on function public.validate_early_access_referral_entitlement()
from public, anon, authenticated, service_role;
revoke all on function public.protect_early_access_referral_reward_transition()
from public, anon, authenticated, service_role;
revoke all on function public.validate_early_access_referral_credit_ledger()
from public, anon, authenticated, service_role;

revoke all on function public.join_early_access_worker_v2(
  text, text, text, text, text, text, text, text, text, text, text,
  boolean, text, boolean, text, text, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.join_early_access_worker_v2(
  text, text, text, text, text, text, text, text, text, text, text,
  boolean, text, boolean, text, text, text, text, text, text
) to service_role;

revoke all on function public.join_early_access_company_v2(
  text, text, text, text, text, text[], text[], text, integer, text,
  text, text, boolean, text, boolean, text, text, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.join_early_access_company_v2(
  text, text, text, text, text, text[], text[], text, integer, text,
  text, text, boolean, text, boolean, text, text, text, text, text, text
) to service_role;

commit;
