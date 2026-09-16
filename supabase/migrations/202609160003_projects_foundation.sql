begin;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  created_by_user_id uuid references auth.users(id) on delete set null,
  job_number text not null,
  project_name text not null,
  assignment_type text not null default 'site_project',
  client_reference text not null default '',
  location_label text not null,
  location_data jsonb,
  site_name text not null default '',
  site_reference text not null default '',
  site_address text not null,
  site_pin jsonb,
  arrival_point_confirmed boolean not null default false,
  start_date date not null,
  shift_start_time time not null,
  estimated_end_date date,
  no_fixed_end_date boolean not null default false,
  shift_finish_time time not null,
  working_days text[] not null default '{}',
  duration_label text not null default '',
  site_contact jsonb not null default '{}'::jsonb,
  attendance_manager jsonb not null default '{}'::jsonb,
  arrival_instructions text not null default '',
  parking_information text not null default '',
  ppe_requirements text not null default '',
  additional_notes text not null default '',
  site_photo_metadata jsonb not null default '{}'::jsonb,
  vehicle_arrangement text not null default '',
  notice_period_days integer not null default 5,
  request_version integer not null default 1,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_assignment_type_valid
    check (assignment_type in ('site_project', 'mobile_reactive', 'ongoing_placement')),
  constraint projects_status_valid
    check (status in ('draft', 'open', 'active', 'completed', 'cancelled', 'archived')),
  constraint projects_dates_valid
    check (no_fixed_end_date or (estimated_end_date is not null and estimated_end_date >= start_date)),
  constraint projects_notice_period_valid
    check (notice_period_days between 1 and 365),
  constraint projects_request_version_valid
    check (request_version >= 1)
);

create table if not exists public.project_requirements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  client_reference text,
  sort_order integer not null default 0,
  trade text not null,
  trade_key text not null default '',
  role text not null,
  role_key text not null default '',
  grade text not null default '',
  required_credential_ids text[] not null default '{}',
  required_qualifications text not null default '',
  work_activity text not null,
  workers_required integer not null,
  labour_budget_min numeric(12,2),
  labour_budget_max numeric(12,2) not null,
  worker_receives_full_advertised_rate boolean not null default true,
  accommodation_paid boolean not null default false,
  accommodation_arrangement text not null default '',
  accommodation_allowance_per_night numeric(12,2),
  working_days text[] not null default '{}',
  shift_start_time time not null,
  shift_finish_time time not null,
  overtime_available boolean not null default false,
  overtime_rates jsonb,
  weekend_rates jsonb,
  labour_schedule jsonb not null default '[]'::jsonb,
  matching_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_requirements_workers_required_valid
    check (workers_required between 1 and 10000),
  constraint project_requirements_budget_valid
    check (
      labour_budget_max > 0
      and (labour_budget_min is null or labour_budget_min > 0)
      and (labour_budget_min is null or labour_budget_min <= labour_budget_max)
    ),
  constraint project_requirements_allowance_valid
    check (accommodation_allowance_per_night is null or accommodation_allowance_per_night > 0)
);

create index if not exists projects_company_status_start_idx
  on public.projects(company_id, status, start_date);
create index if not exists projects_company_updated_idx
  on public.projects(company_id, updated_at desc);
create index if not exists project_requirements_project_order_idx
  on public.project_requirements(project_id, sort_order, created_at);

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists project_requirements_set_updated_at on public.project_requirements;
create trigger project_requirements_set_updated_at
before update on public.project_requirements
for each row execute function public.set_updated_at();

alter table public.projects enable row level security;
alter table public.project_requirements enable row level security;

drop policy if exists projects_select_active_company_members on public.projects;
create policy projects_select_active_company_members
on public.projects for select
to authenticated
using (
  exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = projects.company_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
  )
);

drop policy if exists projects_insert_company_managers on public.projects;
create policy projects_insert_company_managers
on public.projects for insert
to authenticated
with check (
  created_by_user_id = auth.uid()
  and exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = projects.company_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and membership.role in ('administrator', 'manager')
  )
);

drop policy if exists projects_update_company_managers on public.projects;
create policy projects_update_company_managers
on public.projects for update
to authenticated
using (
  exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = projects.company_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and membership.role in ('administrator', 'manager')
  )
)
with check (
  exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = projects.company_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and membership.role in ('administrator', 'manager')
  )
);

drop policy if exists project_requirements_select_active_company_members
  on public.project_requirements;
create policy project_requirements_select_active_company_members
on public.project_requirements for select
to authenticated
using (
  exists (
    select 1
    from public.projects project
    join public.company_memberships membership
      on membership.company_id = project.company_id
    where project.id = project_requirements.project_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
  )
);

drop policy if exists project_requirements_insert_company_managers
  on public.project_requirements;
create policy project_requirements_insert_company_managers
on public.project_requirements for insert
to authenticated
with check (
  exists (
    select 1
    from public.projects project
    join public.company_memberships membership
      on membership.company_id = project.company_id
    where project.id = project_requirements.project_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and membership.role in ('administrator', 'manager')
  )
);

drop policy if exists project_requirements_update_company_managers
  on public.project_requirements;
create policy project_requirements_update_company_managers
on public.project_requirements for update
to authenticated
using (
  exists (
    select 1
    from public.projects project
    join public.company_memberships membership
      on membership.company_id = project.company_id
    where project.id = project_requirements.project_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and membership.role in ('administrator', 'manager')
  )
)
with check (
  exists (
    select 1
    from public.projects project
    join public.company_memberships membership
      on membership.company_id = project.company_id
    where project.id = project_requirements.project_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and membership.role in ('administrator', 'manager')
  )
);

drop policy if exists project_requirements_delete_company_managers
  on public.project_requirements;
create policy project_requirements_delete_company_managers
on public.project_requirements for delete
to authenticated
using (
  exists (
    select 1
    from public.projects project
    join public.company_memberships membership
      on membership.company_id = project.company_id
    where project.id = project_requirements.project_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and membership.role in ('administrator', 'manager')
  )
);

revoke all on public.projects from anon, authenticated, service_role;
revoke all on public.project_requirements from anon, authenticated, service_role;
grant select on public.projects to authenticated, service_role;
grant select on public.project_requirements to authenticated, service_role;

create or replace function public.save_company_project(
  p_actor_user_id uuid,
  p_project_id uuid,
  p_project jsonb,
  p_requirements jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_role text;
  v_membership_count integer;
  v_project_id uuid;
  v_requirement jsonb;
  v_requirement_id uuid;
  v_requirement_id_text text;
  v_seen_requirement_ids uuid[] := '{}'::uuid[];
begin
  select count(*)
  into v_membership_count
  from public.company_memberships membership
  where membership.user_id = p_actor_user_id
    and membership.status = 'active';

  if v_membership_count <> 1 then
    raise exception using
      errcode = '42501',
      message = 'Exactly one active company membership is required.';
  end if;

  select membership.company_id, membership.role
  into v_company_id, v_role
  from public.company_memberships membership
  where membership.user_id = p_actor_user_id
    and membership.status = 'active';

  if v_role not in ('administrator', 'manager') then
    raise exception using
      errcode = '42501',
      message = 'Company role cannot manage projects.';
  end if;

  if p_project_id is null then
    insert into public.projects (
      company_id,
      created_by_user_id,
      job_number,
      project_name,
      assignment_type,
      client_reference,
      location_label,
      location_data,
      site_name,
      site_reference,
      site_address,
      site_pin,
      arrival_point_confirmed,
      start_date,
      shift_start_time,
      estimated_end_date,
      no_fixed_end_date,
      shift_finish_time,
      working_days,
      duration_label,
      site_contact,
      attendance_manager,
      arrival_instructions,
      parking_information,
      ppe_requirements,
      additional_notes,
      site_photo_metadata,
      vehicle_arrangement,
      notice_period_days,
      request_version,
      status
    ) values (
      v_company_id,
      p_actor_user_id,
      p_project->>'job_number',
      p_project->>'project_name',
      p_project->>'assignment_type',
      coalesce(p_project->>'client_reference', ''),
      p_project->>'location_label',
      p_project->'location_data',
      coalesce(p_project->>'site_name', ''),
      coalesce(p_project->>'site_reference', ''),
      p_project->>'site_address',
      p_project->'site_pin',
      coalesce((p_project->>'arrival_point_confirmed')::boolean, false),
      (p_project->>'start_date')::date,
      (p_project->>'shift_start_time')::time,
      nullif(p_project->>'estimated_end_date', '')::date,
      coalesce((p_project->>'no_fixed_end_date')::boolean, false),
      (p_project->>'shift_finish_time')::time,
      array(select jsonb_array_elements_text(coalesce(p_project->'working_days', '[]'::jsonb))),
      coalesce(p_project->>'duration_label', ''),
      coalesce(p_project->'site_contact', '{}'::jsonb),
      coalesce(p_project->'attendance_manager', '{}'::jsonb),
      coalesce(p_project->>'arrival_instructions', ''),
      coalesce(p_project->>'parking_information', ''),
      coalesce(p_project->>'ppe_requirements', ''),
      coalesce(p_project->>'additional_notes', ''),
      coalesce(p_project->'site_photo_metadata', '{}'::jsonb),
      coalesce(p_project->>'vehicle_arrangement', ''),
      coalesce((p_project->>'notice_period_days')::integer, 5),
      coalesce((p_project->>'request_version')::integer, 1),
      coalesce(p_project->>'status', 'open')
    ) returning id into v_project_id;
  else
    update public.projects
    set
      job_number = p_project->>'job_number',
      project_name = p_project->>'project_name',
      assignment_type = p_project->>'assignment_type',
      client_reference = coalesce(p_project->>'client_reference', ''),
      location_label = p_project->>'location_label',
      location_data = p_project->'location_data',
      site_name = coalesce(p_project->>'site_name', ''),
      site_reference = coalesce(p_project->>'site_reference', ''),
      site_address = p_project->>'site_address',
      site_pin = p_project->'site_pin',
      arrival_point_confirmed = coalesce((p_project->>'arrival_point_confirmed')::boolean, false),
      start_date = (p_project->>'start_date')::date,
      shift_start_time = (p_project->>'shift_start_time')::time,
      estimated_end_date = nullif(p_project->>'estimated_end_date', '')::date,
      no_fixed_end_date = coalesce((p_project->>'no_fixed_end_date')::boolean, false),
      shift_finish_time = (p_project->>'shift_finish_time')::time,
      working_days = array(select jsonb_array_elements_text(coalesce(p_project->'working_days', '[]'::jsonb))),
      duration_label = coalesce(p_project->>'duration_label', ''),
      site_contact = coalesce(p_project->'site_contact', '{}'::jsonb),
      attendance_manager = coalesce(p_project->'attendance_manager', '{}'::jsonb),
      arrival_instructions = coalesce(p_project->>'arrival_instructions', ''),
      parking_information = coalesce(p_project->>'parking_information', ''),
      ppe_requirements = coalesce(p_project->>'ppe_requirements', ''),
      additional_notes = coalesce(p_project->>'additional_notes', ''),
      site_photo_metadata = coalesce(p_project->'site_photo_metadata', '{}'::jsonb),
      vehicle_arrangement = coalesce(p_project->>'vehicle_arrangement', ''),
      notice_period_days = coalesce((p_project->>'notice_period_days')::integer, 5),
      request_version = coalesce((p_project->>'request_version')::integer, 1),
      status = coalesce(p_project->>'status', 'open')
    where id = p_project_id
      and company_id = v_company_id
    returning id into v_project_id;

    if v_project_id is null then
      raise exception using errcode = 'P0002', message = 'Project not found.';
    end if;
  end if;

  if p_requirements is not null then
    if jsonb_typeof(p_requirements) <> 'array' then
      raise exception using errcode = '22023', message = 'Requirements must be an array.';
    end if;

    for v_requirement in
      select value from jsonb_array_elements(p_requirements)
    loop
      v_requirement_id_text := nullif(v_requirement->>'id', '');
      if v_requirement_id_text is not null then
        begin
          v_requirement_id := v_requirement_id_text::uuid;
        exception when invalid_text_representation then
          raise exception using errcode = '22023', message = 'Requirement ID is invalid.';
        end;

        update public.project_requirements
        set
          client_reference = nullif(v_requirement->>'client_reference', ''),
          sort_order = coalesce((v_requirement->>'sort_order')::integer, 0),
          trade = v_requirement->>'trade',
          trade_key = coalesce(v_requirement->>'trade_key', ''),
          role = v_requirement->>'role',
          role_key = coalesce(v_requirement->>'role_key', ''),
          grade = coalesce(v_requirement->>'grade', ''),
          required_credential_ids = array(select jsonb_array_elements_text(coalesce(v_requirement->'required_credential_ids', '[]'::jsonb))),
          required_qualifications = coalesce(v_requirement->>'required_qualifications', ''),
          work_activity = v_requirement->>'work_activity',
          workers_required = (v_requirement->>'workers_required')::integer,
          labour_budget_min = nullif(v_requirement->>'labour_budget_min', '')::numeric,
          labour_budget_max = (v_requirement->>'labour_budget_max')::numeric,
          worker_receives_full_advertised_rate = coalesce((v_requirement->>'worker_receives_full_advertised_rate')::boolean, true),
          accommodation_paid = coalesce((v_requirement->>'accommodation_paid')::boolean, false),
          accommodation_arrangement = coalesce(v_requirement->>'accommodation_arrangement', ''),
          accommodation_allowance_per_night = nullif(v_requirement->>'accommodation_allowance_per_night', '')::numeric,
          working_days = array(select jsonb_array_elements_text(coalesce(v_requirement->'working_days', '[]'::jsonb))),
          shift_start_time = (v_requirement->>'shift_start_time')::time,
          shift_finish_time = (v_requirement->>'shift_finish_time')::time,
          overtime_available = coalesce((v_requirement->>'overtime_available')::boolean, false),
          overtime_rates = v_requirement->'overtime_rates',
          weekend_rates = v_requirement->'weekend_rates',
          labour_schedule = coalesce(v_requirement->'labour_schedule', '[]'::jsonb),
          matching_preferences = coalesce(v_requirement->'matching_preferences', '{}'::jsonb)
        where id = v_requirement_id
          and project_id = v_project_id;

        if not found then
          raise exception using errcode = 'P0002', message = 'Project requirement not found.';
        end if;
      else
        insert into public.project_requirements (
          project_id,
          client_reference,
          sort_order,
          trade,
          trade_key,
          role,
          role_key,
          grade,
          required_credential_ids,
          required_qualifications,
          work_activity,
          workers_required,
          labour_budget_min,
          labour_budget_max,
          worker_receives_full_advertised_rate,
          accommodation_paid,
          accommodation_arrangement,
          accommodation_allowance_per_night,
          working_days,
          shift_start_time,
          shift_finish_time,
          overtime_available,
          overtime_rates,
          weekend_rates,
          labour_schedule,
          matching_preferences
        ) values (
          v_project_id,
          nullif(v_requirement->>'client_reference', ''),
          coalesce((v_requirement->>'sort_order')::integer, 0),
          v_requirement->>'trade',
          coalesce(v_requirement->>'trade_key', ''),
          v_requirement->>'role',
          coalesce(v_requirement->>'role_key', ''),
          coalesce(v_requirement->>'grade', ''),
          array(select jsonb_array_elements_text(coalesce(v_requirement->'required_credential_ids', '[]'::jsonb))),
          coalesce(v_requirement->>'required_qualifications', ''),
          v_requirement->>'work_activity',
          (v_requirement->>'workers_required')::integer,
          nullif(v_requirement->>'labour_budget_min', '')::numeric,
          (v_requirement->>'labour_budget_max')::numeric,
          coalesce((v_requirement->>'worker_receives_full_advertised_rate')::boolean, true),
          coalesce((v_requirement->>'accommodation_paid')::boolean, false),
          coalesce(v_requirement->>'accommodation_arrangement', ''),
          nullif(v_requirement->>'accommodation_allowance_per_night', '')::numeric,
          array(select jsonb_array_elements_text(coalesce(v_requirement->'working_days', '[]'::jsonb))),
          (v_requirement->>'shift_start_time')::time,
          (v_requirement->>'shift_finish_time')::time,
          coalesce((v_requirement->>'overtime_available')::boolean, false),
          v_requirement->'overtime_rates',
          v_requirement->'weekend_rates',
          coalesce(v_requirement->'labour_schedule', '[]'::jsonb),
          coalesce(v_requirement->'matching_preferences', '{}'::jsonb)
        ) returning id into v_requirement_id;
      end if;

      v_seen_requirement_ids := array_append(v_seen_requirement_ids, v_requirement_id);
    end loop;

    delete from public.project_requirements
    where project_id = v_project_id
      and not (id = any(v_seen_requirement_ids));
  end if;

  return v_project_id;
end;
$$;

revoke all on function public.save_company_project(uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_company_project(uuid, uuid, jsonb, jsonb)
  to service_role;

commit;
