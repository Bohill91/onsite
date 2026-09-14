begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.worker_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  name text not null,
  contact_email text not null,
  phone text not null default '',
  trade text not null default '',
  trade_key text not null default '',
  specialism text not null default '',
  role_key text not null default '',
  grade text not null default '',
  years_experience numeric(4,1),
  location text not null default '',
  location_data jsonb,
  profile_photo_reference text,
  availability_status text not null default 'available',
  next_available_date date,
  private_minimum_day_rate numeric(10,2),
  travel_radius_miles integer not null default 15,
  travel_further_with_accommodation boolean not null default false,
  weekend_preferences jsonb not null default '{"saturday":false,"sunday":false,"weekendOnly":false}'::jsonb,
  founding_worker boolean not null default false,
  referral_code text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worker_profiles_minimum_rate_positive
    check (private_minimum_day_rate is null or private_minimum_day_rate > 0),
  constraint worker_profiles_years_experience_valid
    check (years_experience is null or years_experience between 0 and 80),
  constraint worker_profiles_travel_radius_valid
    check (travel_radius_miles between 1 and 1000)
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company_number text,
  vat_number text,
  vat_registered boolean not null default false,
  phone text not null default '',
  address text not null default '',
  payment_contact text not null default '',
  accounts_email text not null default '',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  role text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, company_id),
  constraint company_memberships_role_valid
    check (role in ('administrator', 'manager', 'supervisor')),
  constraint company_memberships_status_valid
    check (status in ('active', 'invited', 'suspended'))
);

create index if not exists company_memberships_company_idx
  on public.company_memberships(company_id, status);

drop trigger if exists worker_profiles_set_updated_at on public.worker_profiles;
create trigger worker_profiles_set_updated_at
before update on public.worker_profiles
for each row execute function public.set_updated_at();

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

drop trigger if exists company_memberships_set_updated_at on public.company_memberships;
create trigger company_memberships_set_updated_at
before update on public.company_memberships
for each row execute function public.set_updated_at();

alter table public.worker_profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_memberships enable row level security;

drop policy if exists worker_profiles_select_own on public.worker_profiles;
create policy worker_profiles_select_own
on public.worker_profiles for select
to authenticated
using (user_id = auth.uid());

drop policy if exists worker_profiles_update_own on public.worker_profiles;
create policy worker_profiles_update_own
on public.worker_profiles for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists company_memberships_select_own on public.company_memberships;
create policy company_memberships_select_own
on public.company_memberships for select
to authenticated
using (user_id = auth.uid());

drop policy if exists companies_select_for_active_members on public.companies;
create policy companies_select_for_active_members
on public.companies for select
to authenticated
using (
  exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = companies.id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
  )
);

revoke all on public.worker_profiles from anon;
revoke all on public.companies from anon;
revoke all on public.company_memberships from anon;
revoke all on public.worker_profiles from authenticated;
revoke all on public.companies from authenticated;
revoke all on public.company_memberships from authenticated;
grant select on public.worker_profiles to authenticated;
grant update (
  name,
  contact_email,
  phone,
  trade,
  trade_key,
  specialism,
  role_key,
  grade,
  years_experience,
  location,
  location_data,
  profile_photo_reference,
  availability_status,
  next_available_date,
  private_minimum_day_rate,
  travel_radius_miles,
  travel_further_with_accommodation,
  weekend_preferences
) on public.worker_profiles to authenticated;
grant select on public.companies to authenticated;
grant select on public.company_memberships to authenticated;

create or replace function public.create_worker_identity(
  p_user_id uuid,
  p_name text,
  p_contact_email text,
  p_phone text,
  p_trade text,
  p_trade_key text,
  p_specialism text,
  p_role_key text,
  p_grade text,
  p_years_experience numeric,
  p_location text,
  p_location_data jsonb,
  p_profile_photo_reference text,
  p_availability_status text,
  p_private_minimum_day_rate numeric,
  p_travel_radius_miles integer,
  p_travel_further_with_accommodation boolean,
  p_weekend_preferences jsonb,
  p_referral_code text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  worker_profile_id uuid;
begin
  insert into public.worker_profiles (
    user_id, name, contact_email, phone, trade, trade_key, specialism,
    role_key, grade, years_experience, location, location_data,
    profile_photo_reference, availability_status, private_minimum_day_rate,
    travel_radius_miles, travel_further_with_accommodation,
    weekend_preferences, referral_code
  ) values (
    p_user_id, p_name, p_contact_email, coalesce(p_phone, ''),
    coalesce(p_trade, ''), coalesce(p_trade_key, ''),
    coalesce(p_specialism, ''), coalesce(p_role_key, ''),
    coalesce(p_grade, ''), p_years_experience, coalesce(p_location, ''),
    p_location_data, nullif(p_profile_photo_reference, ''),
    coalesce(nullif(p_availability_status, ''), 'available'),
    p_private_minimum_day_rate, coalesce(p_travel_radius_miles, 15),
    coalesce(p_travel_further_with_accommodation, false),
    coalesce(p_weekend_preferences, '{}'::jsonb), nullif(p_referral_code, '')
  )
  returning id into worker_profile_id;
  return worker_profile_id;
end;
$$;

create or replace function public.create_company_identity(
  p_user_id uuid,
  p_name text,
  p_company_number text,
  p_vat_number text,
  p_vat_registered boolean,
  p_phone text,
  p_address text,
  p_payment_contact text,
  p_accounts_email text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_company_id uuid;
begin
  insert into public.companies (
    name, company_number, vat_number, vat_registered, phone, address,
    payment_contact, accounts_email
  ) values (
    p_name, nullif(p_company_number, ''), nullif(p_vat_number, ''),
    coalesce(p_vat_registered, false), coalesce(p_phone, ''),
    coalesce(p_address, ''), coalesce(p_payment_contact, ''),
    coalesce(p_accounts_email, '')
  )
  returning id into new_company_id;

  insert into public.company_memberships (user_id, company_id, role, status)
  values (p_user_id, new_company_id, 'administrator', 'active');

  return new_company_id;
end;
$$;

revoke all on function public.create_worker_identity(
  uuid, text, text, text, text, text, text, text, text, numeric, text,
  jsonb, text, text, numeric, integer, boolean, jsonb, text
) from public, anon, authenticated;
grant execute on function public.create_worker_identity(
  uuid, text, text, text, text, text, text, text, text, numeric, text,
  jsonb, text, text, numeric, integer, boolean, jsonb, text
) to service_role;

revoke all on function public.create_company_identity(
  uuid, text, text, text, boolean, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_company_identity(
  uuid, text, text, text, boolean, text, text, text, text
) to service_role;

commit;
