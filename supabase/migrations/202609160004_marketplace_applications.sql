begin;

create table if not exists public.worker_applications (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.worker_profiles(id) on delete cascade,
  project_requirement_id uuid not null references public.project_requirements(id) on delete cascade,
  status text not null default 'applied',
  worker_note text,
  withdrawal_reason text,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worker_applications_status_valid
    check (status in ('applied', 'withdrawn')),
  constraint worker_applications_withdrawal_valid
    check (
      (status = 'applied' and withdrawn_at is null)
      or (status = 'withdrawn' and withdrawn_at is not null)
    )
);

create unique index if not exists worker_applications_one_active_idx
  on public.worker_applications(worker_id, project_requirement_id)
  where status = 'applied';

create index if not exists worker_applications_worker_created_idx
  on public.worker_applications(worker_id, created_at desc);

create index if not exists worker_applications_requirement_created_idx
  on public.worker_applications(project_requirement_id, created_at desc);

drop trigger if exists worker_applications_set_updated_at
  on public.worker_applications;
create trigger worker_applications_set_updated_at
before update on public.worker_applications
for each row execute function public.set_updated_at();

alter table public.worker_applications enable row level security;

drop policy if exists worker_applications_select_own
  on public.worker_applications;
create policy worker_applications_select_own
on public.worker_applications for select
to authenticated
using (
  exists (
    select 1
    from public.worker_profiles worker
    where worker.id = worker_applications.worker_id
      and worker.user_id = auth.uid()
  )
);

drop policy if exists worker_applications_select_company_requirements
  on public.worker_applications;
create policy worker_applications_select_company_requirements
on public.worker_applications for select
to authenticated
using (
  exists (
    select 1
    from public.project_requirements requirement
    join public.projects project
      on project.id = requirement.project_id
    join public.company_memberships membership
      on membership.company_id = project.company_id
    where requirement.id = worker_applications.project_requirement_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and membership.role in ('administrator', 'manager', 'supervisor')
  )
);

revoke all on public.worker_applications
  from public, anon, authenticated, service_role;
grant select on public.worker_applications
  to authenticated, service_role;
grant insert (
  worker_id,
  project_requirement_id,
  status,
  worker_note
) on public.worker_applications to service_role;
grant update (
  status,
  withdrawal_reason,
  withdrawn_at
) on public.worker_applications to service_role;

commit;
