-- Read-only PRE-009 verification.
-- This block is intentionally compatible with migration 008 only.
-- Every statement is a SELECT. A FAIL result must be resolved before 009 is applied.

with checks as (
  select
    'signup counts are available' as check_name,
    case when exists (select 1 from public.early_access_signups)
      or not exists (select 1 from public.early_access_signups)
      then 'PASS' end as result
  union all
  select
    'worker referral codes use OSW format',
    case when not exists (
      select 1
      from public.early_access_signups
      where signup_type = 'worker'
        and (
          referral_code is null
          or referral_code !~ '^OSW-[A-Z0-9]{12,24}$'
        )
    ) then 'PASS' else 'FAIL' end
  union all
  select
    'worker referred-by codes use OSW format',
    case when not exists (
      select 1
      from public.early_access_signups
      where signup_type = 'worker'
        and referred_by_code is not null
        and referred_by_code !~ '^OSW-[A-Z0-9]{12,24}$'
    ) then 'PASS' else 'FAIL' end
  union all
  select
    'company rows have only expected pre-009 referral codes',
    case when not exists (
      select 1
      from public.early_access_signups
      where signup_type = 'company'
        and referral_code is not null
        and referral_code !~ '^OSC-[A-Z0-9]{12,24}$'
    ) then 'PASS' else 'FAIL' end
  union all
  select
    'company referred-by codes are null or OSC',
    case when not exists (
      select 1
      from public.early_access_signups
      where signup_type = 'company'
        and referred_by_code is not null
        and referred_by_code !~ '^OSC-[A-Z0-9]{12,24}$'
    ) then 'PASS' else 'FAIL' end
  union all
  select
    'referral codes are unique',
    case when not exists (
      select referral_code
      from public.early_access_signups
      where referral_code is not null
      group by referral_code
      having count(*) > 1
    ) then 'PASS' else 'FAIL' end
  union all
  select
    'referrals connect two workers with matching snapshots',
    case when not exists (
      select 1
      from public.early_access_referrals referral
      join public.early_access_signups referrer
        on referrer.id = referral.referrer_signup_id
      join public.early_access_signups referred
        on referred.id = referral.referred_signup_id
      where referrer.signup_type <> 'worker'
        or referred.signup_type <> 'worker'
        or referral.referral_code_snapshot !~ '^OSW-[A-Z0-9]{12,24}$'
        or referral.referral_code_snapshot is distinct from referrer.referral_code
    ) then 'PASS' else 'FAIL' end
  union all
  select
    'legacy reward definitions use canonical worker values',
    case when not exists (
      select 1
      from public.early_access_referral_rewards reward
      where
        (
          reward.reward_key = 'referrer_five_paid_days'
          and reward.amount_pence <> 5000
        )
        or (
          reward.reward_key = 'referrer_twenty_paid_days'
          and reward.amount_pence <> 5000
        )
        or (
          reward.reward_key = 'referred_five_paid_days'
          and reward.amount_pence <> 2500
        )
        or reward.reward_key not in (
          'referrer_five_paid_days',
          'referrer_twenty_paid_days',
          'referred_five_paid_days'
        )
        or reward.qualifying_paid_days not in (5, 20)
        or reward.status not in (
          'potential',
          'pending',
          'eligible',
          'credited',
          'cancelled'
        )
    ) then 'PASS' else 'FAIL' end
)
select check_name, result
from checks
order by check_name;

-- Row-level details for any failed preflight checks.
select
  signup_type,
  id,
  referral_code,
  referred_by_code
from public.early_access_signups
where
  (
    signup_type = 'worker'
    and (
      referral_code is null
      or referral_code !~ '^OSW-[A-Z0-9]{12,24}$'
      or (
        referred_by_code is not null
        and referred_by_code !~ '^OSW-[A-Z0-9]{12,24}$'
      )
    )
  )
  or (
    signup_type = 'company'
    and (
      (
        referral_code is not null
        and referral_code !~ '^OSC-[A-Z0-9]{12,24}$'
      )
      or (
        referred_by_code is not null
        and referred_by_code !~ '^OSC-[A-Z0-9]{12,24}$'
      )
    )
  )
order by signup_type, id;

select
  referral.id as referral_id,
  referral.referral_code_snapshot,
  referrer.id as referrer_signup_id,
  referrer.signup_type as referrer_type,
  referrer.referral_code as referrer_code,
  referred.id as referred_signup_id,
  referred.signup_type as referred_type
from public.early_access_referrals referral
join public.early_access_signups referrer
  on referrer.id = referral.referrer_signup_id
join public.early_access_signups referred
  on referred.id = referral.referred_signup_id
where referrer.signup_type <> 'worker'
  or referred.signup_type <> 'worker'
  or referral.referral_code_snapshot !~ '^OSW-[A-Z0-9]{12,24}$'
  or referral.referral_code_snapshot is distinct from referrer.referral_code
order by referral.id;

select
  reward.id,
  reward.reward_key,
  reward.amount_pence,
  reward.qualifying_paid_days,
  reward.status
from public.early_access_referral_rewards reward
where
  (
    reward.reward_key = 'referrer_five_paid_days'
    and reward.amount_pence <> 5000
  )
  or (
    reward.reward_key = 'referrer_twenty_paid_days'
    and reward.amount_pence <> 5000
  )
  or (
    reward.reward_key = 'referred_five_paid_days'
    and reward.amount_pence <> 2500
  )
  or reward.reward_key not in (
    'referrer_five_paid_days',
    'referrer_twenty_paid_days',
    'referred_five_paid_days'
  )
  or reward.qualifying_paid_days not in (5, 20)
  or reward.status not in (
    'potential',
    'pending',
    'eligible',
    'credited',
    'cancelled'
  )
order by reward.id;

select signup_type, count(*) as signup_count
from public.early_access_signups
group by signup_type
order by signup_type;

select
  'signups' as table_name,
  count(*) as row_count
from public.early_access_signups
union all
select 'referrals', count(*)
from public.early_access_referrals
union all
select 'rewards', count(*)
from public.early_access_referral_rewards;