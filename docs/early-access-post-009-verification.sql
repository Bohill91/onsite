-- Read-only POST-009 verification.
-- Run only after migration 009 has been applied.
-- Every statement is a SELECT. Empty violation queries and PASS results are expected.

select
  'signups by type' as check_name,
  signup_type,
  count(*) as row_count
from public.early_access_signups
group by signup_type
order by signup_type;

select
  'referral codes' as check_name,
  signup_type,
  count(*) as row_count,
  count(*) filter (
    where referral_code ~ (
      case when signup_type = 'worker'
        then '^OSW-[A-Z0-9]{12,24}$'
        else '^OSC-[A-Z0-9]{12,24}$'
      end
    )
  ) as valid_code_count
from public.early_access_signups
group by signup_type
order by signup_type;

select referral_code, count(*) as row_count
from public.early_access_signups
where referral_code is not null
group by referral_code
having count(*) > 1
order by referral_code;

select
  signup_type,
  id,
  referral_code,
  referred_by_code,
  cis_referral_acknowledged_at,
  company_referral_acknowledged_at,
  referral_terms_version
from public.early_access_signups
where
  (
    signup_type = 'worker'
    and (
      referral_code !~ '^OSW-[A-Z0-9]{12,24}$'
      or (
        referred_by_code is not null
        and referred_by_code !~ '^OSW-[A-Z0-9]{12,24}$'
      )
      or cis_referral_acknowledged_at is null
      or company_referral_acknowledged_at is not null
      or referral_terms_version is null
    )
  )
  or (
    signup_type = 'company'
    and (
      referral_code !~ '^OSC-[A-Z0-9]{12,24}$'
      or (
        referred_by_code is not null
        and referred_by_code !~ '^OSC-[A-Z0-9]{12,24}$'
      )
      or cis_referral_acknowledged_at is not null
      or company_referral_acknowledged_at is null
      or referral_terms_version is null
    )
  )
order by signup_type, id;

select
  referral.id as referral_id,
  referral.programme_type,
  referral.referral_code_snapshot,
  referrer.signup_type as referrer_type,
  referrer.referral_code as referrer_code,
  referred.signup_type as referred_type
from public.early_access_referrals referral
join public.early_access_signups referrer
  on referrer.id = referral.referrer_signup_id
join public.early_access_signups referred
  on referred.id = referral.referred_signup_id
where not (
  (
    referral.programme_type = 'subcontractor_cash'
    and referrer.signup_type = 'worker'
    and referred.signup_type = 'worker'
    and referral.referral_code_snapshot ~ '^OSW-[A-Z0-9]{12,24}$'
    and referral.referral_code_snapshot = referrer.referral_code
  )
  or (
    referral.programme_type = 'contractor_credit'
    and referrer.signup_type = 'company'
    and referred.signup_type = 'company'
    and referral.referral_code_snapshot ~ '^OSC-[A-Z0-9]{12,24}$'
    and referral.referral_code_snapshot = referrer.referral_code
  )
)
order by referral.id;

select
  reward.id,
  reward.reward_key,
  reward.amount_pence,
  reward.qualifying_paid_days,
  reward.programme_type,
  reward.beneficiary_type,
  reward.benefit_type,
  reward.milestone_type,
  reward.verification_requirement,
  reward.status
from public.early_access_referral_rewards reward
where not (
  (
    reward.reward_key = 'referrer_five_paid_days'
    and reward.amount_pence = 5000
    and reward.qualifying_paid_days = 5
    and reward.programme_type = 'subcontractor_cash'
    and reward.beneficiary_type = 'worker'
    and reward.benefit_type = 'cash'
    and reward.milestone_type = 'qualifying_paid_days'
    and reward.verification_requirement = 'cis'
  )
  or (
    reward.reward_key = 'referrer_twenty_paid_days'
    and reward.amount_pence = 5000
    and reward.qualifying_paid_days = 20
    and reward.programme_type = 'subcontractor_cash'
    and reward.beneficiary_type = 'worker'
    and reward.benefit_type = 'cash'
    and reward.milestone_type = 'qualifying_paid_days'
    and reward.verification_requirement = 'cis'
  )
  or (
    reward.reward_key = 'referred_five_paid_days'
    and reward.amount_pence = 2500
    and reward.qualifying_paid_days = 5
    and reward.programme_type = 'subcontractor_cash'
    and reward.beneficiary_type = 'worker'
    and reward.benefit_type = 'cash'
    and reward.milestone_type = 'qualifying_paid_days'
    and reward.verification_requirement = 'cis'
  )
  or (
    reward.reward_key = 'referred_company_first_booking_credit'
    and reward.amount_pence = 10000
    and reward.qualifying_paid_days is null
    and reward.programme_type = 'contractor_credit'
    and reward.beneficiary_type = 'company'
    and reward.benefit_type = 'account_credit'
    and reward.milestone_type = 'first_qualifying_labour_booking'
    and reward.verification_requirement = 'company'
  )
  or (
    reward.reward_key = 'referrer_company_five_paid_labour_days'
    and reward.amount_pence = 10000
    and reward.qualifying_paid_days = 5
    and reward.programme_type = 'contractor_credit'
    and reward.beneficiary_type = 'company'
    and reward.benefit_type = 'account_credit'
    and reward.milestone_type = 'qualifying_paid_days'
    and reward.verification_requirement = 'company'
  )
  or (
    reward.reward_key = 'referrer_company_twenty_paid_labour_days'
    and reward.amount_pence = 15000
    and reward.qualifying_paid_days = 20
    and reward.programme_type = 'contractor_credit'
    and reward.beneficiary_type = 'company'
    and reward.benefit_type = 'account_credit'
    and reward.milestone_type = 'qualifying_paid_days'
    and reward.verification_requirement = 'company'
  )
)
order by reward.id;

select
  reward.id,
  reward.reward_key,
  reward.status,
  reward.benefit_type,
  reward.qualifying_evidence_key,
  reward.verification_confirmed_at,
  reward.payable_at,
  reward.paid_at,
  reward.voided_at
from public.early_access_referral_rewards reward
where
  (
    reward.status in ('earned_pending_verification', 'payable', 'paid', 'credited')
    and (
      reward.qualifying_evidence_key is null
      or btrim(reward.qualifying_evidence_key) = ''
    )
  )
  or (
    reward.status in ('payable', 'paid', 'credited')
    and reward.verification_confirmed_at is null
  )
  or (reward.status in ('payable', 'paid', 'credited') and reward.payable_at is null)
  or (reward.status = 'paid' and reward.paid_at is null)
  or (reward.status = 'paid' and reward.benefit_type <> 'cash')
  or (reward.status = 'credited' and reward.benefit_type <> 'account_credit')
  or (reward.status = 'paid' and reward.paid_at < reward.payable_at)
  or (reward.status = 'void' and reward.voided_at is null)
order by reward.id;

select
  qualifying_evidence_key,
  count(*) as reward_count
from public.early_access_referral_rewards
where qualifying_evidence_key is not null
group by qualifying_evidence_key
having count(*) > 1
order by qualifying_evidence_key;

select
  reward.id as reward_id,
  reward.reward_key,
  reward.beneficiary_signup_id,
  referral.programme_type,
  referral.referrer_signup_id,
  referral.referred_signup_id
from public.early_access_referral_rewards reward
join public.early_access_referrals referral
  on referral.id = reward.referral_id
where
  reward.programme_type is distinct from referral.programme_type
  or reward.beneficiary_signup_id is distinct from (
    case
      when reward.reward_key in (
        'referred_five_paid_days',
        'referred_company_first_booking_credit'
      )
      then referral.referred_signup_id
      else referral.referrer_signup_id
    end
  );

select
  ledger.id,
  ledger.reward_id,
  ledger.company_signup_id,
  ledger.entry_type,
  ledger.amount_pence,
  reward.programme_type,
  reward.benefit_type,
  reward.beneficiary_type,
  reward.beneficiary_signup_id
from public.early_access_referral_credit_ledger ledger
join public.early_access_referral_rewards reward
  on reward.id = ledger.reward_id
where reward.programme_type <> 'contractor_credit'
  or reward.benefit_type <> 'account_credit'
  or reward.beneficiary_type <> 'company'
  or ledger.company_signup_id <> reward.beneficiary_signup_id
  or ledger.amount_pence = 0;

select
  entry_type,
  count(*) as row_count,
  min(amount_pence) as min_amount_pence,
  max(amount_pence) as max_amount_pence
from public.early_access_referral_credit_ledger
group by entry_type
order by entry_type;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
  has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
  has_table_privilege('service_role', c.oid, 'SELECT') as service_role_select,
  has_table_privilege('anon', c.oid, 'INSERT') as anon_insert,
  has_table_privilege('authenticated', c.oid, 'INSERT') as authenticated_insert,
  has_table_privilege('service_role', c.oid, 'INSERT') as service_role_insert
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'early_access_signups',
    'early_access_referrals',
    'early_access_referral_rewards',
    'early_access_referral_credit_ledger'
  )
order by c.relname;

select
  p.oid::regprocedure as function_signature,
  p.prosecdef as security_definer,
  pg_get_functiondef(p.oid) ~* 'set search_path = pg_catalog, public'
    as hardened_search_path,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'join_early_access_worker',
    'join_early_access_worker_v2',
    'join_early_access_company',
    'join_early_access_company_v2',
    'protect_early_access_referral_reward_transition',
    'validate_early_access_referral_credit_ledger'
  )
order by p.proname, function_signature::text;

select
  c.relname as table_name,
  con.conname as constraint_name,
  con.contype as constraint_type,
  con.convalidated as validated,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'early_access_signups',
    'early_access_referrals',
    'early_access_referral_rewards',
    'early_access_referral_credit_ledger'
  )
order by c.relname, con.conname;

select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and (
    tablename in (
      'early_access_signups',
      'early_access_referrals',
      'early_access_referral_rewards',
      'early_access_referral_credit_ledger'
    )
    or indexname like 'early_access_referral_%'
  )
order by tablename, indexname;

select
  n.nspname as schema_name,
  c.relname as table_name,
  t.tgname as trigger_name,
  pg_get_triggerdef(t.oid) as trigger_definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal
  and n.nspname = 'public'
  and (
    t.tgname like 'early_access_referral%'
    or t.tgname like 'early_access_signups%'
  )
order by c.relname, t.tgname;

select
  'table counts' as check_name,
  table_name,
  row_count
from (
  select 'early_access_signups' as table_name, count(*) as row_count
  from public.early_access_signups
  union all
  select 'early_access_referrals', count(*)
  from public.early_access_referrals
  union all
  select 'early_access_referral_rewards', count(*)
  from public.early_access_referral_rewards
  union all
  select 'early_access_referral_credit_ledger', count(*)
  from public.early_access_referral_credit_ledger
) counts
order by table_name;