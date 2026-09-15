begin;

-- Secret-key requests run as service_role. RLS is bypassed for that role, but
-- PostgreSQL object privileges are still required for canonical identity reads.
grant usage on schema public to service_role;
grant select on table
  public.worker_profiles,
  public.companies,
  public.company_memberships
to service_role;

-- Phase 1 exposes only these worker-owned profile changes through the server.
grant update (
  availability_status,
  next_available_date,
  private_minimum_day_rate
) on table public.worker_profiles to service_role;

-- A worker profile is account-owned Phase 1 identity data. Removing the Auth
-- user should remove this profile without affecting future marketplace history.
alter table public.worker_profiles
  drop constraint if exists worker_profiles_user_id_fkey;

alter table public.worker_profiles
  add constraint worker_profiles_user_id_fkey
  foreign key (user_id)
  references auth.users(id)
  on delete cascade;

commit;
