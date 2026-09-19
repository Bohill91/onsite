-- Read-only PRE-010 verification.
-- This block is compatible with the migration-009 schema only.
-- Resolve every FAIL before applying migration 010. No statement mutates data.

with checks as (
  select
    'all company referral identities use OSC codes' as check_name,
    case when not exists (
      select 1 from public.early_access_signups
      where signup_type = 'company'
        and (referral_code is null or referral_code !~ '^OSC-[A-Z0-9]{12,24}$')
    ) then 'PASS' else 'FAIL' end as result
  union all
  select
    'company referral attribution uses OSC codes',
    case when not exists (
      select 1 from public.early_access_signups
      where signup_type = 'company'
        and referred_by_code is not null
        and referred_by_code !~ '^OSC-[A-Z0-9]{12,24}$'
    ) then 'PASS' else 'FAIL' end
  union all
  select
    'contractor referrals have company endpoints',
    case when not exists (
      select 1
      from public.early_access_referrals referral
      join public.early_access_signups referrer on referrer.id = referral.referrer_signup_id
      join public.early_access_signups referred on referred.id = referral.referred_signup_id
      where referral.programme_type = 'contractor_credit'
        and (referrer.signup_type <> 'company' or referred.signup_type <> 'company')
    ) then 'PASS' else 'FAIL' end
  union all
  select
    'company referral snapshots match referrer codes',
    case when not exists (
      select 1
      from public.early_access_referrals referral
      join public.early_access_signups referrer on referrer.id = referral.referrer_signup_id
      where referral.programme_type = 'contractor_credit'
        and referral.referral_code_snapshot is distinct from referrer.referral_code
    ) then 'PASS' else 'FAIL' end
)
select check_name, result
from checks
order by check_name;

select
  signup_type,
  id,
  referral_code,
  referred_by_code,
  company_referral_acknowledged_at
from public.early_access_signups
where signup_type = 'company'
  and (
    referral_code is null
    or referral_code !~ '^OSC-[A-Z0-9]{12,24}$'
    or (referred_by_code is not null and referred_by_code !~ '^OSC-[A-Z0-9]{12,24}$')
  )
order by id;

select
  referral.id as referral_id,
  referral.programme_type,
  referral.referral_code_snapshot,
  referrer.id as referrer_signup_id,
  referrer.signup_type as referrer_type,
  referred.id as referred_signup_id,
  referred.signup_type as referred_type
from public.early_access_referrals referral
join public.early_access_signups referrer on referrer.id = referral.referrer_signup_id
join public.early_access_signups referred on referred.id = referral.referred_signup_id
where referral.programme_type = 'contractor_credit'
  and (
    referrer.signup_type <> 'company'
    or referred.signup_type <> 'company'
    or referral.referral_code_snapshot is distinct from referrer.referral_code
  )
order by referral.id;

select 'early_access_signups' as table_name, count(*) as row_count
from public.early_access_signups
union all
select 'early_access_referrals', count(*)
from public.early_access_referrals
union all
select 'early_access_referral_rewards', count(*)
from public.early_access_referral_rewards;