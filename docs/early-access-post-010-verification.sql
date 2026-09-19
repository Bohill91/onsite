-- Read-only POST-010 verification.
-- Run after migration 010. Every statement is a SELECT.

with checks as (
  select
    'market column and v3 company RPC exist' as check_name,
    case when exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'early_access_signups'
        and column_name = 'registration_market'
    ) and to_regprocedure('public.join_early_access_company_v3(text,text,text,text,text,text,text,text[],text[],text,integer,text,text,text,boolean,boolean,boolean,text,boolean,text,text,text,text,text,text)') is not null
      then 'PASS' else 'FAIL' end as result
  union all
  select
    'registration market values are explicit',
    case when not exists (
      select 1 from public.early_access_signups
      where registration_market not in ('uk', 'international')
         or registration_market is null
    ) then 'PASS' else 'FAIL' end
  union all
  select
    'international records have no OSC identity or UK acknowledgement',
    case when not exists (
      select 1 from public.early_access_signups
      where signup_type = 'company'
        and registration_market = 'international'
        and (
          referral_code is not null
          or referred_by_code is not null
          or company_referral_acknowledged_at is not null
          or referral_terms_version is not null
          or international_interest_acknowledged_at is null
          or operating_country_code is null
          or operating_country_code = 'GB'
        )
    ) then 'PASS' else 'FAIL' end
  union all
  select
    'contractor-credit referrals remain UK-only',
    case when not exists (
      select 1
      from public.early_access_referrals referral
      join public.early_access_signups referrer on referrer.id = referral.referrer_signup_id
      join public.early_access_signups referred on referred.id = referral.referred_signup_id
      where referral.programme_type = 'contractor_credit'
        and (
          referrer.registration_market <> 'uk'
          or referred.registration_market <> 'uk'
          or referrer.company_referral_acknowledged_at is null
          or referred.company_referral_acknowledged_at is null
        )
    ) then 'PASS' else 'FAIL' end
  union all
  select
    'international records have no rewards',
    case when not exists (
      select 1
      from public.early_access_referral_rewards reward
      join public.early_access_referrals referral on referral.id = reward.referral_id
      join public.early_access_signups beneficiary on beneficiary.id = reward.beneficiary_signup_id
      where beneficiary.signup_type = 'company'
        and beneficiary.registration_market = 'international'
    ) then 'PASS' else 'FAIL' end
)
select check_name, result
from checks
order by check_name;

select
  id,
  company_name,
  operating_country_code,
  registration_market,
  referral_code,
  referred_by_code,
  company_referral_acknowledged_at,
  uk_operating_acknowledged_at,
  international_interest_acknowledged_at
from public.early_access_signups
where signup_type = 'company'
order by created_at, id;

select
  referral.id as referral_id,
  referral.programme_type,
  referrer.registration_market as referrer_market,
  referred.registration_market as referred_market,
  referral.referral_code_snapshot
from public.early_access_referrals referral
join public.early_access_signups referrer on referrer.id = referral.referrer_signup_id
join public.early_access_signups referred on referred.id = referral.referred_signup_id
where referral.programme_type = 'contractor_credit'
order by referral.created_at, referral.id;

select
  registration_market,
  operating_country_code,
  count(*) as signup_count
from public.early_access_signups
where signup_type = 'company'
group by registration_market, operating_country_code
order by registration_market, operating_country_code;