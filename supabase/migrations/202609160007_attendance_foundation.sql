begin;

alter table public.projects
  add column if not exists timezone text not null default 'Europe/London';

create or replace function public.is_valid_iana_timezone(p_timezone text)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from pg_catalog.pg_timezone_names timezone_name
    where timezone_name.name = p_timezone
  );
$$;

alter table public.projects
  drop constraint if exists projects_timezone_valid;

alter table public.projects
  add constraint projects_timezone_valid
  check (public.is_valid_iana_timezone(timezone));

create table public.project_attendance_managers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  user_id uuid,
  invite_email text,
  display_name text,
  phone text,
  status text not null default 'pending',
  assigned_by_user_id uuid not null,
  assigned_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_attendance_managers_project_id_fkey
    foreign key (project_id)
    references public.projects(id)
    on delete restrict,
  constraint project_attendance_managers_user_id_fkey
    foreign key (user_id)
    references auth.users(id)
    on delete restrict,
  constraint project_attendance_managers_assigned_by_user_id_fkey
    foreign key (assigned_by_user_id)
    references auth.users(id)
    on delete restrict,
  constraint project_attendance_managers_project_unique unique (project_id),
  constraint project_attendance_managers_status_valid
    check (status in ('pending', 'active', 'revoked')),
  constraint project_attendance_managers_identity_present
    check (user_id is not null or nullif(trim(invite_email), '') is not null),
  constraint project_attendance_managers_active_user_required
    check (status <> 'active' or user_id is not null)
);

create table public.attendance_week_submissions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  week_start date not null,
  week_end date not null,
  status text not null default 'draft',
  submitted_by_user_id uuid,
  submitted_at timestamptz,
  reopened_by_user_id uuid,
  reopened_at timestamptz,
  reopen_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_week_submissions_project_id_fkey
    foreign key (project_id)
    references public.projects(id)
    on delete restrict,
  constraint attendance_week_submissions_submitted_by_user_id_fkey
    foreign key (submitted_by_user_id)
    references auth.users(id)
    on delete set null,
  constraint attendance_week_submissions_reopened_by_user_id_fkey
    foreign key (reopened_by_user_id)
    references auth.users(id)
    on delete set null,
  constraint attendance_week_submissions_project_week_unique
    unique (project_id, week_start),
  constraint attendance_week_submissions_dates_valid
    check (week_end = week_start + 6),
  constraint attendance_week_submissions_monday_valid
    check (extract(isodow from week_start) = 1),
  constraint attendance_week_submissions_status_valid
    check (status in ('draft', 'submitted', 'reopened')),
  constraint attendance_week_submissions_state_valid
    check (
      (status = 'draft' and submitted_at is null)
      or (status = 'submitted' and submitted_at is not null)
      or (status = 'reopened' and submitted_at is not null and reopened_at is not null)
    )
);

create table public.attendance_days (
  id uuid primary key default gen_random_uuid(),
  placement_id uuid not null,
  project_id uuid not null,
  work_date date not null,
  expected boolean not null default true,
  status text not null default 'needs_review',
  effective_arrival_at timestamptz,
  captured_at timestamptz,
  shift_start_snapshot time not null,
  shift_finish_snapshot time not null,
  working_days_snapshot text[] not null default '{}',
  project_timezone_snapshot text not null default 'Europe/London',
  minutes_late integer,
  capture_method text not null default 'expected_day',
  captured_by_user_id uuid,
  finalised_at timestamptz,
  finalised_by_user_id uuid,
  weekly_submission_id uuid,
  worker_reason_category text,
  worker_reason_explanation text,
  worker_reason_submitted_at timestamptz,
  worker_reason_review_outcome text,
  worker_reason_reviewed_by_user_id uuid,
  worker_reason_reviewed_at timestamptz,
  outcome_reason text,
  private_company_notes text,
  capture_latitude double precision,
  capture_longitude double precision,
  capture_accuracy_m double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_days_placement_id_fkey
    foreign key (placement_id)
    references public.placements(id)
    on delete restrict,
  constraint attendance_days_project_id_fkey
    foreign key (project_id)
    references public.projects(id)
    on delete restrict,
  constraint attendance_days_captured_by_user_id_fkey
    foreign key (captured_by_user_id)
    references auth.users(id)
    on delete set null,
  constraint attendance_days_finalised_by_user_id_fkey
    foreign key (finalised_by_user_id)
    references auth.users(id)
    on delete set null,
  constraint attendance_days_weekly_submission_id_fkey
    foreign key (weekly_submission_id)
    references public.attendance_week_submissions(id)
    on delete restrict,
  constraint attendance_days_worker_reason_reviewed_by_user_id_fkey
    foreign key (worker_reason_reviewed_by_user_id)
    references auth.users(id)
    on delete set null,
  constraint attendance_days_placement_work_date_unique
    unique (placement_id, work_date),
  constraint attendance_days_status_valid
    check (status in (
      'needs_review',
      'on_time',
      'late',
      'no_show',
      'approved_absence',
      'non_worker_fault',
      'sent_home'
    )),
  constraint attendance_days_capture_method_valid
    check (capture_method in (
      'expected_day',
      'worker_site_qr',
      'supervisor_worker_qr',
      'attendance_manager_manual',
      'administrator_override'
    )),
  constraint attendance_days_minutes_late_valid
    check (minutes_late is null or minutes_late >= 0),
  constraint attendance_days_arrival_status_valid
    check (
      (status in ('on_time', 'late') and effective_arrival_at is not null)
      or status not in ('on_time', 'late')
    ),
  constraint attendance_days_late_minutes_valid
    check (
      (status = 'late' and minutes_late is not null)
      or status <> 'late'
    ),
  constraint attendance_days_reason_review_valid
    check (
      worker_reason_review_outcome is null
      or worker_reason_review_outcome in (
        'pending',
        'approved_exception',
        'rejected',
        'not_required'
      )
    ),
  constraint attendance_days_location_valid
    check (
      (capture_latitude is null and capture_longitude is null)
      or (
        capture_latitude between -90 and 90
        and capture_longitude between -180 and 180
      )
    ),
  constraint attendance_days_accuracy_valid
    check (capture_accuracy_m is null or capture_accuracy_m between 0 and 100000),
  constraint attendance_days_timezone_valid
    check (public.is_valid_iana_timezone(project_timezone_snapshot))
);

create table public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  attendance_day_id uuid not null,
  placement_id uuid not null,
  event_type text not null,
  actor_user_id uuid,
  actor_type text not null,
  recorded_at timestamptz not null default now(),
  effective_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  private_company_notes text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint attendance_events_attendance_day_id_fkey
    foreign key (attendance_day_id)
    references public.attendance_days(id)
    on delete restrict,
  constraint attendance_events_placement_id_fkey
    foreign key (placement_id)
    references public.placements(id)
    on delete restrict,
  constraint attendance_events_actor_user_id_fkey
    foreign key (actor_user_id)
    references auth.users(id)
    on delete set null,
  constraint attendance_events_type_valid
    check (event_type in (
      'worker_site_qr_scan',
      'supervisor_worker_qr_scan',
      'attendance_created',
      'marked_on_time',
      'marked_late',
      'marked_no_show',
      'marked_non_worker_fault',
      'marked_approved_absence',
      'marked_sent_home',
      'arrival_corrected',
      'worker_lateness_reason_submitted',
      'lateness_exception_approved',
      'lateness_exception_rejected',
      'week_submitted',
      'week_reopened',
      'admin_correction'
    )),
  constraint attendance_events_actor_type_valid
    check (actor_type in ('worker', 'supervisor', 'attendance_manager', 'company', 'administrator', 'system')),
  constraint attendance_events_idempotency_unique unique (idempotency_key),
  constraint attendance_events_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create table public.attendance_site_qr_tokens (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  work_date date not null,
  token_hash text not null,
  issued_by_user_id uuid not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint attendance_site_qr_tokens_project_id_fkey
    foreign key (project_id)
    references public.projects(id)
    on delete restrict,
  constraint attendance_site_qr_tokens_issued_by_user_id_fkey
    foreign key (issued_by_user_id)
    references auth.users(id)
    on delete restrict,
  constraint attendance_site_qr_tokens_hash_unique unique (token_hash),
  constraint attendance_site_qr_tokens_hash_valid
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint attendance_site_qr_tokens_expiry_valid
    check (expires_at > issued_at),
  constraint attendance_site_qr_tokens_revocation_valid
    check (revoked_at is null or revoked_at >= issued_at)
);

create table public.worker_attendance_qr_tokens (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null,
  token_hash text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint worker_attendance_qr_tokens_worker_id_fkey
    foreign key (worker_id)
    references public.worker_profiles(id)
    on delete cascade,
  constraint worker_attendance_qr_tokens_hash_unique unique (token_hash),
  constraint worker_attendance_qr_tokens_hash_valid
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint worker_attendance_qr_tokens_expiry_valid
    check (expires_at > issued_at),
  constraint worker_attendance_qr_tokens_revocation_valid
    check (revoked_at is null or revoked_at >= issued_at)
);

create index project_attendance_managers_user_project_idx
  on public.project_attendance_managers(user_id, project_id)
  where status = 'active';

create index attendance_days_project_date_idx
  on public.attendance_days(project_id, work_date, status);

create index attendance_days_placement_date_idx
  on public.attendance_days(placement_id, work_date desc);

create index attendance_days_submission_idx
  on public.attendance_days(weekly_submission_id)
  where weekly_submission_id is not null;

create index attendance_events_day_created_idx
  on public.attendance_events(attendance_day_id, created_at);

create index attendance_events_placement_created_idx
  on public.attendance_events(placement_id, created_at desc);

create index attendance_site_qr_tokens_lookup_idx
  on public.attendance_site_qr_tokens(token_hash, expires_at)
  where revoked_at is null;

create index attendance_site_qr_tokens_project_date_idx
  on public.attendance_site_qr_tokens(project_id, work_date, issued_at desc);

create index worker_attendance_qr_tokens_lookup_idx
  on public.worker_attendance_qr_tokens(token_hash, expires_at)
  where revoked_at is null;

create or replace function public.set_attendance_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger project_attendance_managers_set_updated_at
before update on public.project_attendance_managers
for each row execute function public.set_attendance_updated_at();

create trigger attendance_week_submissions_set_updated_at
before update on public.attendance_week_submissions
for each row execute function public.set_attendance_updated_at();

create trigger attendance_days_set_updated_at
before update on public.attendance_days
for each row execute function public.set_attendance_updated_at();

create or replace function public.validate_attendance_day_links()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_project_id uuid;
begin
  select requirement.project_id into v_project_id
  from public.placements placement
  join public.project_requirements requirement
    on requirement.id = placement.project_requirement_id
  where placement.id = new.placement_id;

  if v_project_id is null or v_project_id <> new.project_id then
    raise exception using
      errcode = '23514',
      message = 'Attendance placement does not belong to the project.',
      detail = 'ATTENDANCE_PROJECT_MISMATCH';
  end if;

  if new.weekly_submission_id is not null and not exists (
    select 1
    from public.attendance_week_submissions submission
    where submission.id = new.weekly_submission_id
      and submission.project_id = new.project_id
      and new.work_date between submission.week_start and submission.week_end
  ) then
    raise exception using
      errcode = '23514',
      message = 'Attendance submission does not match the project week.',
      detail = 'ATTENDANCE_SUBMISSION_MISMATCH';
  end if;

  return new;
end;
$$;

create trigger attendance_days_validate_links
before insert or update on public.attendance_days
for each row execute function public.validate_attendance_day_links();

create or replace function public.prevent_attendance_event_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using
    errcode = '42501',
    message = 'Attendance audit events are append-only.';
end;
$$;

create trigger attendance_events_prevent_update
before update on public.attendance_events
for each row execute function public.prevent_attendance_event_mutation();

create trigger attendance_events_prevent_delete
before delete on public.attendance_events
for each row execute function public.prevent_attendance_event_mutation();

create or replace function public.attendance_project_authority(
  p_actor_user_id uuid,
  p_project_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_project public.projects%rowtype;
  v_role text;
  v_is_attendance_manager boolean := false;
begin
  select * into v_project
  from public.projects project
  where project.id = p_project_id;

  if not found then
    return jsonb_build_object('allowed', false);
  end if;

  select membership.role into v_role
  from public.company_memberships membership
  where membership.company_id = v_project.company_id
    and membership.user_id = p_actor_user_id
    and membership.status = 'active'
  limit 1;

  select exists (
    select 1
    from public.project_attendance_managers manager
    where manager.project_id = p_project_id
      and manager.user_id = p_actor_user_id
      and manager.status = 'active'
      and manager.revoked_at is null
  ) into v_is_attendance_manager;

  return jsonb_build_object(
    'allowed', v_role is not null or v_is_attendance_manager,
    'company_id', v_project.company_id,
    'role', coalesce(v_role, ''),
    'is_attendance_manager', v_is_attendance_manager,
    'timezone', v_project.timezone
  );
end;
$$;

create or replace function public.attendance_require_authority(
  p_actor_user_id uuid,
  p_project_id uuid,
  p_capability text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_authority jsonb;
  v_role text;
  v_manager boolean;
  v_allowed boolean := false;
begin
  v_authority := public.attendance_project_authority(p_actor_user_id, p_project_id);
  v_role := coalesce(v_authority->>'role', '');
  v_manager := coalesce((v_authority->>'is_attendance_manager')::boolean, false);

  v_allowed := case p_capability
    when 'read' then v_role in ('administrator', 'manager', 'supervisor') or v_manager
    when 'scan' then v_role in ('administrator', 'manager', 'supervisor') or v_manager
    when 'manage' then v_role in ('administrator', 'manager') or v_manager
    when 'submit' then v_role = 'administrator' or v_manager
    when 'reopen' then v_role = 'administrator'
    when 'assign_manager' then v_role = 'administrator'
    else false
  end;

  if not v_allowed then
    raise exception using
      errcode = '42501',
      message = 'Attendance permission denied.',
      detail = 'ATTENDANCE_PERMISSION_DENIED';
  end if;
  return v_authority;
end;
$$;

create or replace function public.attendance_placement_terms(
  p_placement public.placements,
  p_work_date date
)
returns table (
  working_days text[],
  shift_start_time time,
  shift_finish_time time
)
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v_change public.placement_change_offers%rowtype;
begin
  working_days := p_placement.agreed_working_days;
  shift_start_time := p_placement.agreed_shift_start_time;
  shift_finish_time := p_placement.agreed_shift_finish_time;

  for v_change in
    select change_offer.*
    from public.placement_change_offers change_offer
    where change_offer.placement_id = p_placement.id
      and change_offer.status = 'accepted'
      and change_offer.change_type = 'schedule_change'
      and change_offer.effective_date <= p_work_date
    order by change_offer.effective_date, change_offer.created_at, change_offer.id
  loop
    if jsonb_typeof(v_change.proposed_terms->'working_days') = 'array' then
      working_days := array(
        select jsonb_array_elements_text(v_change.proposed_terms->'working_days')
      );
    end if;
    shift_start_time := coalesce(
      nullif(v_change.proposed_terms->>'shift_start_time', '')::time,
      shift_start_time
    );
    shift_finish_time := coalesce(
      nullif(v_change.proposed_terms->>'shift_finish_time', '')::time,
      shift_finish_time
    );
  end loop;

  return next;
end;
$$;

create or replace function public.attendance_placement_expected(
  p_placement public.placements,
  p_work_date date
)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select
    p_placement.status in ('upcoming', 'active')
    and p_work_date >= p_placement.current_start_date
    and (
      p_placement.scheduled_end_date is null
      or p_work_date <= p_placement.scheduled_end_date
    )
    and (
      p_placement.current_no_fixed_end_date
      or p_placement.current_estimated_end_date is null
      or p_work_date <= p_placement.current_estimated_end_date
    )
    and exists (
      select 1
      from unnest(terms.working_days) working_day
      where lower(trim(working_day)) = lower(trim(to_char(p_work_date, 'FMDay')))
    )
  from public.attendance_placement_terms(p_placement, p_work_date) terms;
$$;

create or replace function public.attendance_arrival_minutes_late(
  p_arrival_at timestamptz,
  p_work_date date,
  p_shift_start time,
  p_timezone text
)
returns integer
language sql
stable
set search_path = pg_catalog, public
as $$
  select greatest(
    0,
    floor(
      extract(epoch from (
        (p_arrival_at at time zone p_timezone)
        - (p_work_date::timestamp + p_shift_start)
      )) / 60
    )::integer
  );
$$;

create or replace function public.attendance_event_actor_type(
  p_actor_user_id uuid,
  p_project_id uuid
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_authority jsonb;
begin
  if exists (
    select 1 from public.worker_profiles worker
    where worker.user_id = p_actor_user_id
  ) then
    return 'worker';
  end if;
  v_authority := public.attendance_project_authority(p_actor_user_id, p_project_id);
  if coalesce(v_authority->>'role', '') = 'administrator' then return 'administrator'; end if;
  if coalesce((v_authority->>'is_attendance_manager')::boolean, false) then return 'attendance_manager'; end if;
  if coalesce(v_authority->>'role', '') = 'supervisor' then return 'supervisor'; end if;
  return 'company';
end;
$$;

create or replace function public.materialize_project_attendance_week(
  p_actor_user_id uuid,
  p_project_id uuid,
  p_week_start date
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_project public.projects%rowtype;
  v_placement public.placements%rowtype;
  v_terms record;
  v_date date;
  v_created integer := 0;
begin
  perform public.attendance_require_authority(p_actor_user_id, p_project_id, 'read');
  if extract(isodow from p_week_start) <> 1 then
    raise exception using errcode = '22023', message = 'Attendance week must start on Monday.', detail = 'INVALID_ATTENDANCE_WEEK';
  end if;

  select * into v_project
  from public.projects project
  where project.id = p_project_id
  for update;

  for v_placement in
    select placement.*
    from public.placements placement
    join public.project_requirements requirement
      on requirement.id = placement.project_requirement_id
    where requirement.project_id = p_project_id
    order by placement.id
    for update of placement
  loop
    for v_date in
      select generate_series(p_week_start, p_week_start + 6, interval '1 day')::date
    loop
      select * into v_terms
      from public.attendance_placement_terms(v_placement, v_date);
      if public.attendance_placement_expected(v_placement, v_date) then
        insert into public.attendance_days (
          placement_id,
          project_id,
          work_date,
          expected,
          status,
          shift_start_snapshot,
          shift_finish_snapshot,
          working_days_snapshot,
          project_timezone_snapshot,
          capture_method
        ) values (
          v_placement.id,
          p_project_id,
          v_date,
          true,
          'needs_review',
          v_terms.shift_start_time,
          v_terms.shift_finish_time,
          v_terms.working_days,
          v_project.timezone,
          'expected_day'
        )
        on conflict (placement_id, work_date) do nothing;
        if found then v_created := v_created + 1; end if;
        update public.attendance_days
        set expected = true,
            shift_start_snapshot = v_terms.shift_start_time,
            shift_finish_snapshot = v_terms.shift_finish_time,
            working_days_snapshot = v_terms.working_days,
            project_timezone_snapshot = v_project.timezone
        where placement_id = v_placement.id
          and work_date = v_date
          and finalised_at is null
          and capture_method = 'expected_day'
          and effective_arrival_at is null;
      else
        update public.attendance_days
        set expected = false
        where placement_id = v_placement.id
          and work_date = v_date
          and finalised_at is null
          and capture_method = 'expected_day'
          and effective_arrival_at is null;
      end if;
    end loop;
  end loop;
  return v_created;
end;
$$;

create or replace function public.issue_attendance_site_qr(
  p_actor_user_id uuid,
  p_project_id uuid,
  p_work_date date,
  p_token_hash text,
  p_expires_at timestamptz default null,
  p_revoke_existing boolean default false
)
returns public.attendance_site_qr_tokens
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_project public.projects%rowtype;
  v_work_date date;
  v_day_end timestamptz;
  v_expiry timestamptz;
  v_row public.attendance_site_qr_tokens%rowtype;
begin
  perform public.attendance_require_authority(p_actor_user_id, p_project_id, 'manage');
  select * into v_project from public.projects project where project.id = p_project_id for update;
  if v_project.status not in ('open', 'active') then
    raise exception using errcode = '22023', message = 'Site sign-in is not available for this project.', detail = 'PROJECT_NOT_ACTIVE';
  end if;
  v_work_date := coalesce(p_work_date, (now() at time zone v_project.timezone)::date);
  v_day_end := ((v_work_date + 1)::timestamp at time zone v_project.timezone);
  v_expiry := least(coalesce(p_expires_at, v_day_end), v_day_end);
  if p_token_hash !~ '^[0-9a-f]{64}$' or v_expiry <= now() then
    raise exception using errcode = '22023', message = 'Site QR details are invalid.', detail = 'INVALID_SITE_QR';
  end if;
  if v_work_date < v_project.start_date
    or (not v_project.no_fixed_end_date and v_project.estimated_end_date is not null and v_work_date > v_project.estimated_end_date) then
    raise exception using errcode = '22023', message = 'The site QR date is outside the project dates.', detail = 'SITE_QR_OUTSIDE_PROJECT';
  end if;
  if p_revoke_existing then
    update public.attendance_site_qr_tokens
    set revoked_at = now()
    where project_id = p_project_id
      and work_date = v_work_date
      and revoked_at is null;
  end if;
  insert into public.attendance_site_qr_tokens (
    project_id, work_date, token_hash, issued_by_user_id, expires_at
  ) values (
    p_project_id, v_work_date, p_token_hash, p_actor_user_id, v_expiry
  ) returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.issue_worker_attendance_qr(
  p_actor_user_id uuid,
  p_token_hash text,
  p_expires_at timestamptz default null
)
returns public.worker_attendance_qr_tokens
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_worker public.worker_profiles%rowtype;
  v_expiry timestamptz;
  v_row public.worker_attendance_qr_tokens%rowtype;
begin
  select * into v_worker
  from public.worker_profiles worker
  where worker.user_id = p_actor_user_id;
  if not found then
    raise exception using errcode = '42501', message = 'Worker access is required.', detail = 'WORKER_REQUIRED';
  end if;
  v_expiry := least(coalesce(p_expires_at, now() + interval '5 minutes'), now() + interval '10 minutes');
  if p_token_hash !~ '^[0-9a-f]{64}$' or v_expiry <= now() then
    raise exception using errcode = '22023', message = 'Worker QR details are invalid.', detail = 'INVALID_WORKER_QR';
  end if;
  update public.worker_attendance_qr_tokens
  set revoked_at = now()
  where worker_id = v_worker.id and revoked_at is null;
  insert into public.worker_attendance_qr_tokens (
    worker_id, token_hash, expires_at
  ) values (
    v_worker.id, p_token_hash, v_expiry
  ) returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.capture_worker_site_qr(
  p_actor_user_id uuid,
  p_token_hash text,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy_m double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_token public.attendance_site_qr_tokens%rowtype;
  v_project public.projects%rowtype;
  v_worker public.worker_profiles%rowtype;
  v_placement public.placements%rowtype;
  v_terms record;
  v_day public.attendance_days%rowtype;
  v_arrival timestamptz := clock_timestamp();
  v_minutes integer;
  v_status text;
  v_existing_arrival timestamptz;
begin
  select * into v_token
  from public.attendance_site_qr_tokens token
  where token.token_hash = p_token_hash
    and token.revoked_at is null
    and token.expires_at > now();
  if not found then
    raise exception using errcode = '22023', message = 'This site QR is invalid or has expired.', detail = 'INVALID_SITE_QR';
  end if;
  select * into v_project from public.projects project where project.id = v_token.project_id for update;
  select * into v_token
  from public.attendance_site_qr_tokens token
  where token.id = v_token.id
    and token.revoked_at is null
    and token.expires_at > now()
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'This site QR is invalid or has expired.', detail = 'INVALID_SITE_QR';
  end if;
  if (v_arrival at time zone v_project.timezone)::date <> v_token.work_date then
    raise exception using errcode = '22023', message = 'This site QR is not valid today.', detail = 'SITE_QR_WRONG_DATE';
  end if;
  select * into v_worker from public.worker_profiles worker where worker.user_id = p_actor_user_id;
  if not found then
    raise exception using errcode = '42501', message = 'Worker access is required.', detail = 'WORKER_REQUIRED';
  end if;
  select placement.* into v_placement
  from public.placements placement
  join public.project_requirements requirement on requirement.id = placement.project_requirement_id
  where placement.worker_id = v_worker.id
    and requirement.project_id = v_token.project_id
    and public.attendance_placement_expected(placement, v_token.work_date)
  order by placement.id
  limit 1
  for update of placement;
  if not found then
    raise exception using errcode = '42501', message = 'You are not expected on this project today.', detail = 'NOT_EXPECTED_TODAY';
  end if;
  select * into v_terms
  from public.attendance_placement_terms(v_placement, v_token.work_date);
  v_minutes := public.attendance_arrival_minutes_late(
    v_arrival,
    v_token.work_date,
    v_terms.shift_start_time,
    v_project.timezone
  );
  v_status := case when v_minutes <= 10 then 'on_time' else 'late' end;
  select day.effective_arrival_at into v_existing_arrival
  from public.attendance_days day
  where day.placement_id = v_placement.id and day.work_date = v_token.work_date;
  if v_existing_arrival is not null and v_existing_arrival <= v_arrival then
    select * into v_day from public.attendance_days day
    where day.placement_id = v_placement.id and day.work_date = v_token.work_date;
    return jsonb_build_object('outcome', 'already_signed_in', 'attendance_day_id', v_day.id);
  end if;
  insert into public.attendance_days (
    placement_id, project_id, work_date, expected, status,
    effective_arrival_at, captured_at, shift_start_snapshot,
    shift_finish_snapshot, working_days_snapshot, project_timezone_snapshot,
    minutes_late, capture_method, captured_by_user_id,
    capture_latitude, capture_longitude, capture_accuracy_m
  ) values (
    v_placement.id, v_project.id, v_token.work_date, true, v_status,
    v_arrival, v_arrival, v_terms.shift_start_time,
    v_terms.shift_finish_time, v_terms.working_days,
    v_project.timezone, v_minutes, 'worker_site_qr', p_actor_user_id,
    p_latitude, p_longitude, p_accuracy_m
  )
  on conflict (placement_id, work_date) do update set
    status = case
      when attendance_days.effective_arrival_at is null
        or excluded.effective_arrival_at < attendance_days.effective_arrival_at
      then excluded.status else attendance_days.status end,
    effective_arrival_at = least(
      coalesce(attendance_days.effective_arrival_at, excluded.effective_arrival_at),
      excluded.effective_arrival_at
    ),
    captured_at = case
      when attendance_days.effective_arrival_at is null
        or excluded.effective_arrival_at < attendance_days.effective_arrival_at
      then excluded.captured_at else attendance_days.captured_at end,
    minutes_late = case
      when attendance_days.effective_arrival_at is null
        or excluded.effective_arrival_at < attendance_days.effective_arrival_at
      then excluded.minutes_late else attendance_days.minutes_late end,
    capture_method = case
      when attendance_days.effective_arrival_at is null
        or excluded.effective_arrival_at < attendance_days.effective_arrival_at
      then excluded.capture_method else attendance_days.capture_method end,
    captured_by_user_id = case
      when attendance_days.effective_arrival_at is null
        or excluded.effective_arrival_at < attendance_days.effective_arrival_at
      then excluded.captured_by_user_id else attendance_days.captured_by_user_id end,
    shift_start_snapshot = case
      when attendance_days.effective_arrival_at is null
      then excluded.shift_start_snapshot else attendance_days.shift_start_snapshot end,
    shift_finish_snapshot = case
      when attendance_days.effective_arrival_at is null
      then excluded.shift_finish_snapshot else attendance_days.shift_finish_snapshot end,
    working_days_snapshot = case
      when attendance_days.effective_arrival_at is null
      then excluded.working_days_snapshot else attendance_days.working_days_snapshot end,
    capture_latitude = case
      when attendance_days.effective_arrival_at is null
        or excluded.effective_arrival_at < attendance_days.effective_arrival_at
      then excluded.capture_latitude else attendance_days.capture_latitude end,
    capture_longitude = case
      when attendance_days.effective_arrival_at is null
        or excluded.effective_arrival_at < attendance_days.effective_arrival_at
      then excluded.capture_longitude else attendance_days.capture_longitude end,
    capture_accuracy_m = case
      when attendance_days.effective_arrival_at is null
        or excluded.effective_arrival_at < attendance_days.effective_arrival_at
      then excluded.capture_accuracy_m else attendance_days.capture_accuracy_m end
  where attendance_days.finalised_at is null
  returning * into v_day;
  if v_day.id is null then
    raise exception using errcode = '22023', message = 'Submitted attendance cannot be changed by scanning.', detail = 'ATTENDANCE_SUBMITTED';
  end if;
  insert into public.attendance_events (
    attendance_day_id, placement_id, event_type, actor_user_id,
    actor_type, recorded_at, effective_at, metadata, idempotency_key
  ) values (
    v_day.id, v_placement.id, 'worker_site_qr_scan', p_actor_user_id,
    'worker', v_arrival, v_arrival,
    jsonb_build_object('capture_method', 'worker_site_qr'),
    'worker_site_qr_scan:' || v_day.id::text
  ) on conflict (idempotency_key) do nothing;
  return jsonb_build_object('outcome', 'signed_in', 'attendance_day_id', v_day.id);
end;
$$;

create or replace function public.capture_supervisor_worker_qr(
  p_actor_user_id uuid,
  p_project_id uuid,
  p_token_hash text,
  p_observed_arrival_at timestamptz default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy_m double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_token public.worker_attendance_qr_tokens%rowtype;
  v_project public.projects%rowtype;
  v_placement public.placements%rowtype;
  v_terms record;
  v_day public.attendance_days%rowtype;
  v_capture timestamptz := clock_timestamp();
  v_arrival timestamptz := coalesce(p_observed_arrival_at, clock_timestamp());
  v_work_date date;
  v_minutes integer;
  v_status text;
  v_actor_type text;
begin
  perform public.attendance_require_authority(p_actor_user_id, p_project_id, 'scan');
  select * into v_project from public.projects project where project.id = p_project_id for update;
  select * into v_token
  from public.worker_attendance_qr_tokens token
  where token.token_hash = p_token_hash
    and token.revoked_at is null
    and token.expires_at > now()
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'This worker QR is invalid or has expired.', detail = 'INVALID_WORKER_QR';
  end if;
  if v_arrival > v_capture then
    raise exception using errcode = '22023', message = 'Observed arrival cannot be in the future.', detail = 'INVALID_OBSERVED_ARRIVAL';
  end if;
  v_work_date := (v_capture at time zone v_project.timezone)::date;
  if (v_arrival at time zone v_project.timezone)::date <> v_work_date then
    raise exception using errcode = '22023', message = 'Observed arrival must be for the current project work date.', detail = 'INVALID_OBSERVED_ARRIVAL';
  end if;
  select placement.* into v_placement
  from public.placements placement
  join public.project_requirements requirement on requirement.id = placement.project_requirement_id
  where placement.worker_id = v_token.worker_id
    and requirement.project_id = p_project_id
    and public.attendance_placement_expected(placement, v_work_date)
  order by placement.id
  limit 1
  for update of placement;
  if not found then
    raise exception using errcode = '42501', message = 'This worker is not expected on the project today.', detail = 'NOT_EXPECTED_TODAY';
  end if;
  select * into v_terms
  from public.attendance_placement_terms(v_placement, v_work_date);
  v_minutes := public.attendance_arrival_minutes_late(
    v_arrival, v_work_date, v_terms.shift_start_time, v_project.timezone
  );
  v_status := case when v_minutes <= 10 then 'on_time' else 'late' end;
  v_actor_type := public.attendance_event_actor_type(p_actor_user_id, p_project_id);
  insert into public.attendance_days (
    placement_id, project_id, work_date, expected, status,
    effective_arrival_at, captured_at, shift_start_snapshot,
    shift_finish_snapshot, working_days_snapshot, project_timezone_snapshot,
    minutes_late, capture_method, captured_by_user_id,
    capture_latitude, capture_longitude, capture_accuracy_m
  ) values (
    v_placement.id, p_project_id, v_work_date, true, v_status,
    v_arrival, v_capture, v_terms.shift_start_time,
    v_terms.shift_finish_time, v_terms.working_days,
    v_project.timezone, v_minutes, 'supervisor_worker_qr', p_actor_user_id,
    p_latitude, p_longitude, p_accuracy_m
  )
  on conflict (placement_id, work_date) do update set
    status = case
      when attendance_days.effective_arrival_at is null
        or excluded.effective_arrival_at < attendance_days.effective_arrival_at
      then excluded.status else attendance_days.status end,
    effective_arrival_at = least(
      coalesce(attendance_days.effective_arrival_at, excluded.effective_arrival_at),
      excluded.effective_arrival_at
    ),
    captured_at = case
      when attendance_days.effective_arrival_at is null
        or excluded.effective_arrival_at < attendance_days.effective_arrival_at
      then excluded.captured_at else attendance_days.captured_at end,
    minutes_late = case
      when attendance_days.effective_arrival_at is null
        or excluded.effective_arrival_at < attendance_days.effective_arrival_at
      then excluded.minutes_late else attendance_days.minutes_late end,
    capture_method = case
      when attendance_days.effective_arrival_at is null
        or excluded.effective_arrival_at < attendance_days.effective_arrival_at
      then excluded.capture_method else attendance_days.capture_method end,
    captured_by_user_id = case
      when attendance_days.effective_arrival_at is null
        or excluded.effective_arrival_at < attendance_days.effective_arrival_at
      then excluded.captured_by_user_id else attendance_days.captured_by_user_id end,
    shift_start_snapshot = case
      when attendance_days.effective_arrival_at is null
      then excluded.shift_start_snapshot else attendance_days.shift_start_snapshot end,
    shift_finish_snapshot = case
      when attendance_days.effective_arrival_at is null
      then excluded.shift_finish_snapshot else attendance_days.shift_finish_snapshot end,
    working_days_snapshot = case
      when attendance_days.effective_arrival_at is null
      then excluded.working_days_snapshot else attendance_days.working_days_snapshot end,
    capture_latitude = case
      when attendance_days.effective_arrival_at is null
        or excluded.effective_arrival_at < attendance_days.effective_arrival_at
      then coalesce(excluded.capture_latitude, attendance_days.capture_latitude)
      else attendance_days.capture_latitude end,
    capture_longitude = case
      when attendance_days.effective_arrival_at is null
        or excluded.effective_arrival_at < attendance_days.effective_arrival_at
      then coalesce(excluded.capture_longitude, attendance_days.capture_longitude)
      else attendance_days.capture_longitude end,
    capture_accuracy_m = case
      when attendance_days.effective_arrival_at is null
        or excluded.effective_arrival_at < attendance_days.effective_arrival_at
      then coalesce(excluded.capture_accuracy_m, attendance_days.capture_accuracy_m)
      else attendance_days.capture_accuracy_m end
  where attendance_days.finalised_at is null
  returning * into v_day;
  if v_day.id is null then
    raise exception using errcode = '22023', message = 'Submitted attendance cannot be changed by scanning.', detail = 'ATTENDANCE_SUBMITTED';
  end if;
  insert into public.attendance_events (
    attendance_day_id, placement_id, event_type, actor_user_id,
    actor_type, recorded_at, effective_at, metadata, idempotency_key
  ) values (
    v_day.id, v_placement.id, 'supervisor_worker_qr_scan', p_actor_user_id,
    v_actor_type, v_capture, v_arrival,
    jsonb_build_object('capture_method', 'supervisor_worker_qr'),
    'supervisor_worker_qr_scan:' || v_day.id::text || ':' || p_actor_user_id::text
  ) on conflict (idempotency_key) do nothing;
  return jsonb_build_object('outcome', 'signed_in', 'attendance_day_id', v_day.id);
end;
$$;

create or replace function public.mark_project_attendance(
  p_actor_user_id uuid,
  p_project_id uuid,
  p_placement_id uuid,
  p_work_date date,
  p_status text,
  p_effective_arrival_at timestamptz default null,
  p_reason text default null,
  p_correction_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_authority jsonb;
  v_project public.projects%rowtype;
  v_placement public.placements%rowtype;
  v_terms record;
  v_day public.attendance_days%rowtype;
  v_submission public.attendance_week_submissions%rowtype;
  v_previous jsonb;
  v_minutes integer;
  v_capture_method text;
  v_actor_type text;
  v_event_type text;
begin
  v_authority := public.attendance_require_authority(p_actor_user_id, p_project_id, 'manage');
  select * into v_project from public.projects project where project.id = p_project_id for update;
  if p_work_date > (clock_timestamp() at time zone v_project.timezone)::date then
    raise exception using errcode = '22023', message = 'Future attendance cannot be resolved.', detail = 'ATTENDANCE_FUTURE_DATE';
  end if;
  select placement.* into v_placement
  from public.placements placement
  join public.project_requirements requirement on requirement.id = placement.project_requirement_id
  where placement.id = p_placement_id and requirement.project_id = p_project_id
  for update of placement;
  if not found or not public.attendance_placement_expected(v_placement, p_work_date) then
    raise exception using errcode = '22023', message = 'The worker is not expected on this project date.', detail = 'NOT_EXPECTED_TODAY';
  end if;
  select * into v_terms
  from public.attendance_placement_terms(v_placement, p_work_date);
  if p_status not in ('on_time', 'late', 'no_show', 'approved_absence', 'non_worker_fault', 'sent_home') then
    raise exception using errcode = '22023', message = 'Choose a resolved attendance status.', detail = 'INVALID_ATTENDANCE';
  end if;
  if nullif(trim(p_correction_reason), '') is not null
    and coalesce(v_authority->>'role', '') <> 'administrator' then
    raise exception using errcode = '42501', message = 'Only an Administrator can record an attendance correction.', detail = 'ATTENDANCE_CORRECTION_ADMIN_REQUIRED';
  end if;
  select * into v_submission
  from public.attendance_week_submissions submission
  where submission.project_id = p_project_id
    and p_work_date between submission.week_start and submission.week_end
  for update;
  if found and v_submission.status = 'submitted' then
    raise exception using errcode = '22023', message = 'Reopen submitted attendance before making a correction.', detail = 'ATTENDANCE_SUBMITTED';
  end if;
  if found and v_submission.status = 'reopened'
    and nullif(trim(p_correction_reason), '') is null then
    raise exception using errcode = '22023', message = 'Add a reason for this attendance correction.', detail = 'ATTENDANCE_CORRECTION_REASON_REQUIRED';
  end if;
  select * into v_day
  from public.attendance_days day
  where day.placement_id = p_placement_id and day.work_date = p_work_date
  for update;
  if not found then
    insert into public.attendance_days (
      placement_id, project_id, work_date, expected, status,
      shift_start_snapshot, shift_finish_snapshot, working_days_snapshot,
      project_timezone_snapshot, capture_method
    ) values (
      v_placement.id, p_project_id, p_work_date, true, 'needs_review',
      v_terms.shift_start_time, v_terms.shift_finish_time,
      v_terms.working_days, v_project.timezone, 'expected_day'
    ) returning * into v_day;
  elsif v_day.finalised_at is null
    and v_day.capture_method = 'expected_day'
    and v_day.effective_arrival_at is null then
    update public.attendance_days
    set expected = true,
        shift_start_snapshot = v_terms.shift_start_time,
        shift_finish_snapshot = v_terms.shift_finish_time,
        working_days_snapshot = v_terms.working_days,
        project_timezone_snapshot = v_project.timezone
    where id = v_day.id
    returning * into v_day;
  end if;
  v_previous := jsonb_build_object(
    'status', v_day.status,
    'effective_arrival_at', v_day.effective_arrival_at,
    'minutes_late', v_day.minutes_late
  );
  if p_status in ('on_time', 'late') then
    p_effective_arrival_at := coalesce(p_effective_arrival_at, v_day.effective_arrival_at);
    if p_effective_arrival_at is null
      or (p_effective_arrival_at at time zone v_project.timezone)::date <> p_work_date
      or p_effective_arrival_at > clock_timestamp() then
      raise exception using errcode = '22023', message = 'A valid observed arrival time is required.', detail = 'INVALID_OBSERVED_ARRIVAL';
    end if;
    v_minutes := public.attendance_arrival_minutes_late(
      p_effective_arrival_at,
      p_work_date,
      v_day.shift_start_snapshot,
      v_day.project_timezone_snapshot
    );
    p_status := case when v_minutes <= 10 then 'on_time' else 'late' end;
  else
    p_effective_arrival_at := null;
    v_minutes := null;
  end if;
  if p_status in ('no_show', 'non_worker_fault', 'approved_absence') and nullif(trim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'Add a reason for this attendance outcome.', detail = 'ATTENDANCE_REASON_REQUIRED';
  end if;
  v_actor_type := public.attendance_event_actor_type(p_actor_user_id, p_project_id);
  v_capture_method := case
    when coalesce(v_authority->>'role', '') = 'administrator' then 'administrator_override'
    else 'attendance_manager_manual'
  end;
  update public.attendance_days
  set status = p_status,
      effective_arrival_at = p_effective_arrival_at,
      captured_at = coalesce(captured_at, clock_timestamp()),
      minutes_late = v_minutes,
      capture_method = v_capture_method,
      captured_by_user_id = p_actor_user_id,
      outcome_reason = nullif(trim(p_reason), '')
  where id = v_day.id
  returning * into v_day;
  v_event_type := case p_status
    when 'on_time' then 'marked_on_time'
    when 'late' then 'marked_late'
    when 'no_show' then 'marked_no_show'
    when 'approved_absence' then 'marked_approved_absence'
    when 'non_worker_fault' then 'marked_non_worker_fault'
    else 'marked_sent_home'
  end;
  insert into public.attendance_events (
    attendance_day_id, placement_id, event_type, actor_user_id,
    actor_type, effective_at, metadata, private_company_notes, idempotency_key
  ) values (
    v_day.id, v_day.placement_id,
    case when p_correction_reason is not null then 'admin_correction' else v_event_type end,
    p_actor_user_id, v_actor_type, p_effective_arrival_at,
    jsonb_build_object(
      'previous', v_previous,
      'new', jsonb_build_object('status', p_status, 'effective_arrival_at', p_effective_arrival_at, 'minutes_late', v_minutes),
      'reason', coalesce(p_reason, '')
    ),
    nullif(trim(p_correction_reason), ''),
    'attendance_mark:' || v_day.id::text || ':' || md5(
      p_status || ':' || coalesce(p_effective_arrival_at::text, '') || ':' ||
      coalesce(p_reason, '') || ':' || coalesce(p_correction_reason, '')
    )
  ) on conflict (idempotency_key) do nothing;
  return jsonb_build_object('outcome', 'updated', 'attendance_day_id', v_day.id);
end;
$$;

create or replace function public.submit_attendance_lateness_reason(
  p_actor_user_id uuid,
  p_attendance_day_id uuid,
  p_reason_category text,
  p_explanation text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_worker public.worker_profiles%rowtype;
  v_day public.attendance_days%rowtype;
  v_placement public.placements%rowtype;
begin
  select * into v_worker from public.worker_profiles worker where worker.user_id = p_actor_user_id;
  if not found then
    raise exception using errcode = '42501', message = 'Worker access is required.', detail = 'WORKER_REQUIRED';
  end if;
  select * into v_day from public.attendance_days day where day.id = p_attendance_day_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Attendance was not found.', detail = 'ATTENDANCE_NOT_FOUND';
  end if;
  select * into v_placement from public.placements placement where placement.id = v_day.placement_id;
  if v_placement.worker_id <> v_worker.id or v_day.status <> 'late' then
    raise exception using errcode = '42501', message = 'This lateness reason cannot be updated.', detail = 'ATTENDANCE_PERMISSION_DENIED';
  end if;
  if v_day.finalised_at is not null then
    raise exception using errcode = '22023', message = 'Reopen submitted attendance before changing the lateness reason.', detail = 'ATTENDANCE_SUBMITTED';
  end if;
  if p_reason_category not in (
    'Public transport disruption', 'Road traffic', 'Vehicle breakdown',
    'Family emergency', 'Medical appointment', 'Strike disruption', 'Other'
  ) then
    raise exception using errcode = '22023', message = 'Choose a valid lateness reason.', detail = 'INVALID_LATENESS_REASON';
  end if;
  update public.attendance_days
  set worker_reason_category = p_reason_category,
      worker_reason_explanation = nullif(trim(p_explanation), ''),
      worker_reason_submitted_at = clock_timestamp(),
      worker_reason_review_outcome = 'pending',
      worker_reason_reviewed_by_user_id = null,
      worker_reason_reviewed_at = null
  where id = v_day.id returning * into v_day;
  insert into public.attendance_events (
    attendance_day_id, placement_id, event_type, actor_user_id,
    actor_type, metadata, idempotency_key
  ) values (
    v_day.id, v_day.placement_id, 'worker_lateness_reason_submitted',
    p_actor_user_id, 'worker',
    jsonb_build_object('reason_category', p_reason_category),
    'lateness_reason:' || v_day.id::text || ':' || extract(epoch from v_day.worker_reason_submitted_at)::bigint::text
  );
  return jsonb_build_object('outcome', 'submitted', 'attendance_day_id', v_day.id);
end;
$$;

create or replace function public.review_attendance_lateness_reason(
  p_actor_user_id uuid,
  p_attendance_day_id uuid,
  p_review_outcome text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_day public.attendance_days%rowtype;
  v_actor_type text;
  v_event_type text;
begin
  select * into v_day from public.attendance_days day where day.id = p_attendance_day_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Attendance was not found.', detail = 'ATTENDANCE_NOT_FOUND';
  end if;
  perform public.attendance_require_authority(p_actor_user_id, v_day.project_id, 'manage');
  if v_day.finalised_at is not null then
    raise exception using errcode = '22023', message = 'Reopen submitted attendance before reviewing the lateness reason.', detail = 'ATTENDANCE_SUBMITTED';
  end if;
  if v_day.status <> 'late' or v_day.worker_reason_category is null
    or p_review_outcome not in ('approved_exception', 'rejected') then
    raise exception using errcode = '22023', message = 'This lateness reason cannot be reviewed.', detail = 'INVALID_LATENESS_REVIEW';
  end if;
  update public.attendance_days
  set worker_reason_review_outcome = p_review_outcome,
      worker_reason_reviewed_by_user_id = p_actor_user_id,
      worker_reason_reviewed_at = clock_timestamp()
  where id = v_day.id returning * into v_day;
  v_actor_type := public.attendance_event_actor_type(p_actor_user_id, v_day.project_id);
  v_event_type := case when p_review_outcome = 'approved_exception'
    then 'lateness_exception_approved' else 'lateness_exception_rejected' end;
  insert into public.attendance_events (
    attendance_day_id, placement_id, event_type, actor_user_id,
    actor_type, metadata, private_company_notes, idempotency_key
  ) values (
    v_day.id, v_day.placement_id, v_event_type, p_actor_user_id,
    v_actor_type,
    jsonb_build_object('review_outcome', p_review_outcome),
    nullif(trim(p_reason), ''),
    'lateness_review:' || v_day.id::text || ':' || extract(epoch from v_day.worker_reason_reviewed_at)::bigint::text
  );
  return jsonb_build_object('outcome', p_review_outcome, 'attendance_day_id', v_day.id);
end;
$$;

create or replace function public.submit_project_attendance_week(
  p_actor_user_id uuid,
  p_project_id uuid,
  p_week_start date
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_submission public.attendance_week_submissions%rowtype;
  v_unresolved integer;
  v_now timestamptz := clock_timestamp();
begin
  perform public.attendance_require_authority(p_actor_user_id, p_project_id, 'submit');
  perform public.materialize_project_attendance_week(p_actor_user_id, p_project_id, p_week_start);
  perform 1 from public.projects project where project.id = p_project_id for update;
  perform 1
  from public.placements placement
  join public.project_requirements requirement on requirement.id = placement.project_requirement_id
  where requirement.project_id = p_project_id
  order by placement.id
  for update of placement;
  select count(*) into v_unresolved
  from public.attendance_days day
  where day.project_id = p_project_id
    and day.work_date between p_week_start and p_week_start + 6
    and day.expected
    and day.status = 'needs_review';
  if v_unresolved > 0 then
    raise exception using errcode = '22023', message = 'Resolve every expected attendance day before submitting the week.', detail = 'ATTENDANCE_WEEK_UNRESOLVED';
  end if;
  insert into public.attendance_week_submissions (
    project_id, week_start, week_end, status,
    submitted_by_user_id, submitted_at
  ) values (
    p_project_id, p_week_start, p_week_start + 6, 'submitted',
    p_actor_user_id, v_now
  )
  on conflict (project_id, week_start) do update set
    status = 'submitted',
    submitted_by_user_id = excluded.submitted_by_user_id,
    submitted_at = excluded.submitted_at
  where attendance_week_submissions.status in ('draft', 'reopened')
  returning * into v_submission;
  if v_submission.id is null then
    select * into v_submission
    from public.attendance_week_submissions submission
    where submission.project_id = p_project_id and submission.week_start = p_week_start;
    return jsonb_build_object('outcome', 'already_submitted', 'submission_id', v_submission.id);
  end if;
  update public.attendance_days
  set finalised_at = v_now,
      finalised_by_user_id = p_actor_user_id,
      weekly_submission_id = v_submission.id
  where project_id = p_project_id
    and work_date between p_week_start and p_week_start + 6
    and expected;
  insert into public.attendance_events (
    attendance_day_id, placement_id, event_type, actor_user_id,
    actor_type, metadata, idempotency_key
  )
  select day.id, day.placement_id, 'week_submitted', p_actor_user_id,
    public.attendance_event_actor_type(p_actor_user_id, p_project_id),
    jsonb_build_object('submission_id', v_submission.id, 'week_start', p_week_start),
    'week_submitted:' || v_submission.id::text || ':' || day.id::text
  from public.attendance_days day
  where day.weekly_submission_id = v_submission.id
  on conflict (idempotency_key) do nothing;
  return jsonb_build_object('outcome', 'submitted', 'submission_id', v_submission.id);
end;
$$;

create or replace function public.reopen_project_attendance_week(
  p_actor_user_id uuid,
  p_project_id uuid,
  p_week_start date,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_submission public.attendance_week_submissions%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  perform public.attendance_require_authority(p_actor_user_id, p_project_id, 'reopen');
  if nullif(trim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'A reason is required to reopen attendance.', detail = 'REOPEN_REASON_REQUIRED';
  end if;
  perform 1 from public.projects project where project.id = p_project_id for update;
  select * into v_submission
  from public.attendance_week_submissions submission
  where submission.project_id = p_project_id and submission.week_start = p_week_start
  for update;
  if not found or v_submission.status <> 'submitted' then
    raise exception using errcode = '22023', message = 'Only submitted attendance can be reopened.', detail = 'ATTENDANCE_NOT_SUBMITTED';
  end if;
  update public.attendance_week_submissions
  set status = 'reopened',
      reopened_by_user_id = p_actor_user_id,
      reopened_at = v_now,
      reopen_reason = trim(p_reason)
  where id = v_submission.id returning * into v_submission;
  update public.attendance_days
  set finalised_at = null,
      finalised_by_user_id = null
  where weekly_submission_id = v_submission.id;
  insert into public.attendance_events (
    attendance_day_id, placement_id, event_type, actor_user_id,
    actor_type, metadata, private_company_notes, idempotency_key
  )
  select day.id, day.placement_id, 'week_reopened', p_actor_user_id,
    'administrator', jsonb_build_object('submission_id', v_submission.id),
    trim(p_reason),
    'week_reopened:' || v_submission.id::text || ':' || day.id::text || ':' || extract(epoch from v_now)::bigint::text
  from public.attendance_days day
  where day.weekly_submission_id = v_submission.id;
  return jsonb_build_object('outcome', 'reopened', 'submission_id', v_submission.id);
end;
$$;

create or replace function public.assign_project_attendance_manager(
  p_actor_user_id uuid,
  p_project_id uuid,
  p_manager_user_id uuid default null,
  p_invite_email text default null,
  p_display_name text default null,
  p_phone text default null
)
returns public.project_attendance_managers
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.project_attendance_managers%rowtype;
  v_status text;
begin
  perform public.attendance_require_authority(p_actor_user_id, p_project_id, 'assign_manager');
  perform 1 from public.projects project where project.id = p_project_id for update;
  if p_manager_user_id is null and nullif(lower(trim(p_invite_email)), '') is null then
    raise exception using errcode = '22023', message = 'Choose an Attendance Manager or provide an invite email.', detail = 'INVALID_ATTENDANCE_MANAGER';
  end if;
  if p_manager_user_id is not null and not exists (
    select 1 from auth.users auth_user where auth_user.id = p_manager_user_id
  ) then
    raise exception using errcode = '22023', message = 'Attendance Manager account was not found.', detail = 'INVALID_ATTENDANCE_MANAGER';
  end if;
  v_status := case when p_manager_user_id is null then 'pending' else 'active' end;
  insert into public.project_attendance_managers (
    project_id, user_id, invite_email, display_name, phone, status,
    assigned_by_user_id, assigned_at, accepted_at, revoked_at
  ) values (
    p_project_id, p_manager_user_id, nullif(lower(trim(p_invite_email)), ''),
    nullif(trim(p_display_name), ''), nullif(trim(p_phone), ''), v_status,
    p_actor_user_id, clock_timestamp(),
    case when v_status = 'active' then clock_timestamp() else null end,
    null
  )
  on conflict (project_id) do update set
    user_id = excluded.user_id,
    invite_email = excluded.invite_email,
    display_name = excluded.display_name,
    phone = excluded.phone,
    status = excluded.status,
    assigned_by_user_id = excluded.assigned_by_user_id,
    assigned_at = excluded.assigned_at,
    accepted_at = excluded.accepted_at,
    revoked_at = null
  returning * into v_row;
  return v_row;
end;
$$;

alter table public.project_attendance_managers enable row level security;
alter table public.attendance_week_submissions enable row level security;
alter table public.attendance_days enable row level security;
alter table public.attendance_events enable row level security;
alter table public.attendance_site_qr_tokens enable row level security;
alter table public.worker_attendance_qr_tokens enable row level security;

create policy project_attendance_managers_select_authorised
on public.project_attendance_managers for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.projects project
    join public.company_memberships membership on membership.company_id = project.company_id
    where project.id = project_attendance_managers.project_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
  )
);

create policy attendance_days_select_worker_own
on public.attendance_days for select
to authenticated
using (
  exists (
    select 1
    from public.placements placement
    join public.worker_profiles worker on worker.id = placement.worker_id
    where placement.id = attendance_days.placement_id
      and worker.user_id = auth.uid()
  )
);

create policy attendance_days_select_project_authorised
on public.attendance_days for select
to authenticated
using (
  exists (
    select 1
    from public.projects project
    join public.company_memberships membership on membership.company_id = project.company_id
    where project.id = attendance_days.project_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
  )
  or exists (
    select 1 from public.project_attendance_managers manager
    where manager.project_id = attendance_days.project_id
      and manager.user_id = auth.uid()
      and manager.status = 'active'
      and manager.revoked_at is null
  )
);

create policy attendance_events_select_authorised
on public.attendance_events for select
to authenticated
using (
  exists (
    select 1 from public.attendance_days day
    where day.id = attendance_events.attendance_day_id
      and (
        exists (
          select 1
          from public.placements placement
          join public.worker_profiles worker on worker.id = placement.worker_id
          where placement.id = day.placement_id and worker.user_id = auth.uid()
        )
        or exists (
          select 1
          from public.projects project
          join public.company_memberships membership on membership.company_id = project.company_id
          where project.id = day.project_id
            and membership.user_id = auth.uid()
            and membership.status = 'active'
        )
        or exists (
          select 1 from public.project_attendance_managers manager
          where manager.project_id = day.project_id
            and manager.user_id = auth.uid()
            and manager.status = 'active'
            and manager.revoked_at is null
        )
      )
  )
);

create policy attendance_week_submissions_select_project_authorised
on public.attendance_week_submissions for select
to authenticated
using (
  exists (
    select 1
    from public.projects project
    join public.company_memberships membership on membership.company_id = project.company_id
    where project.id = attendance_week_submissions.project_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
  )
  or exists (
    select 1 from public.project_attendance_managers manager
    where manager.project_id = attendance_week_submissions.project_id
      and manager.user_id = auth.uid()
      and manager.status = 'active'
      and manager.revoked_at is null
  )
);

revoke all on table public.project_attendance_managers from public, anon, authenticated, service_role;
revoke all on table public.attendance_week_submissions from public, anon, authenticated, service_role;
revoke all on table public.attendance_days from public, anon, authenticated, service_role;
revoke all on table public.attendance_events from public, anon, authenticated, service_role;
revoke all on table public.attendance_site_qr_tokens from public, anon, authenticated, service_role;
revoke all on table public.worker_attendance_qr_tokens from public, anon, authenticated, service_role;

grant select on public.project_attendance_managers to authenticated, service_role;
grant select on public.attendance_week_submissions to authenticated, service_role;
grant select (
  id, placement_id, project_id, work_date, expected, status,
  effective_arrival_at, captured_at, shift_start_snapshot,
  shift_finish_snapshot, working_days_snapshot, project_timezone_snapshot,
  minutes_late, capture_method, finalised_at, weekly_submission_id,
  worker_reason_category, worker_reason_explanation,
  worker_reason_submitted_at, worker_reason_review_outcome,
  worker_reason_reviewed_at, outcome_reason,
  capture_latitude, capture_longitude, capture_accuracy_m,
  created_at, updated_at
) on public.attendance_days to authenticated;
grant select on public.attendance_days to service_role;
grant select (
  id, attendance_day_id, placement_id, event_type, actor_type,
  recorded_at, effective_at, metadata, created_at
) on public.attendance_events to authenticated;
grant select on public.attendance_events to service_role;
grant select on public.attendance_site_qr_tokens to service_role;
grant select on public.worker_attendance_qr_tokens to service_role;
grant insert, update on public.project_attendance_managers to service_role;
grant insert, update on public.attendance_week_submissions to service_role;
grant insert, update on public.attendance_days to service_role;
grant insert on public.attendance_events to service_role;
grant insert, update on public.attendance_site_qr_tokens to service_role;
grant insert, update, delete on public.worker_attendance_qr_tokens to service_role;

revoke all on function public.is_valid_iana_timezone(text) from public, anon, authenticated;
revoke all on function public.validate_attendance_day_links() from public, anon, authenticated;
revoke all on function public.attendance_project_authority(uuid, uuid) from public, anon, authenticated;
revoke all on function public.attendance_require_authority(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.attendance_placement_terms(public.placements, date) from public, anon, authenticated;
revoke all on function public.attendance_placement_expected(public.placements, date) from public, anon, authenticated;
revoke all on function public.attendance_arrival_minutes_late(timestamptz, date, time, text) from public, anon, authenticated;
revoke all on function public.attendance_event_actor_type(uuid, uuid) from public, anon, authenticated;
revoke all on function public.materialize_project_attendance_week(uuid, uuid, date) from public, anon, authenticated;
revoke all on function public.issue_attendance_site_qr(uuid, uuid, date, text, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.issue_worker_attendance_qr(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.capture_worker_site_qr(uuid, text, double precision, double precision, double precision) from public, anon, authenticated;
revoke all on function public.capture_supervisor_worker_qr(uuid, uuid, text, timestamptz, double precision, double precision, double precision) from public, anon, authenticated;
revoke all on function public.mark_project_attendance(uuid, uuid, uuid, date, text, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.submit_attendance_lateness_reason(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.review_attendance_lateness_reason(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.submit_project_attendance_week(uuid, uuid, date) from public, anon, authenticated;
revoke all on function public.reopen_project_attendance_week(uuid, uuid, date, text) from public, anon, authenticated;
revoke all on function public.assign_project_attendance_manager(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;

grant execute on function public.is_valid_iana_timezone(text) to service_role;
grant execute on function public.validate_attendance_day_links() to service_role;
grant execute on function public.attendance_project_authority(uuid, uuid) to service_role;
grant execute on function public.attendance_require_authority(uuid, uuid, text) to service_role;
grant execute on function public.attendance_placement_terms(public.placements, date) to service_role;
grant execute on function public.attendance_placement_expected(public.placements, date) to service_role;
grant execute on function public.attendance_arrival_minutes_late(timestamptz, date, time, text) to service_role;
grant execute on function public.attendance_event_actor_type(uuid, uuid) to service_role;
grant execute on function public.materialize_project_attendance_week(uuid, uuid, date) to service_role;
grant execute on function public.issue_attendance_site_qr(uuid, uuid, date, text, timestamptz, boolean) to service_role;
grant execute on function public.issue_worker_attendance_qr(uuid, text, timestamptz) to service_role;
grant execute on function public.capture_worker_site_qr(uuid, text, double precision, double precision, double precision) to service_role;
grant execute on function public.capture_supervisor_worker_qr(uuid, uuid, text, timestamptz, double precision, double precision, double precision) to service_role;
grant execute on function public.mark_project_attendance(uuid, uuid, uuid, date, text, timestamptz, text, text) to service_role;
grant execute on function public.submit_attendance_lateness_reason(uuid, uuid, text, text) to service_role;
grant execute on function public.review_attendance_lateness_reason(uuid, uuid, text, text) to service_role;
grant execute on function public.submit_project_attendance_week(uuid, uuid, date) to service_role;
grant execute on function public.reopen_project_attendance_week(uuid, uuid, date, text) to service_role;
grant execute on function public.assign_project_attendance_manager(uuid, uuid, uuid, text, text, text) to service_role;

commit;
