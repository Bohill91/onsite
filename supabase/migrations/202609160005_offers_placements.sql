begin;

create table public.worker_offers (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null,
  project_requirement_id uuid not null,
  application_id uuid,
  prior_offer_id uuid,
  status text not null default 'pending',
  source text not null default 'application',
  offered_day_rate numeric(10, 2) not null,
  project_name_snapshot text not null,
  job_number_snapshot text not null default '',
  company_name_snapshot text not null,
  location_label_snapshot text not null,
  trade_snapshot text not null,
  role_snapshot text not null,
  grade_snapshot text not null default '',
  work_activity_snapshot text not null,
  start_date date not null,
  estimated_end_date date,
  no_fixed_end_date boolean not null default false,
  duration_label text not null default '',
  working_days text[] not null default '{}',
  shift_start_time time not null,
  shift_finish_time time not null,
  accommodation_paid boolean not null default false,
  accommodation_arrangement text not null default '',
  accommodation_allowance_per_night numeric(10, 2),
  overtime_available boolean not null default false,
  overtime_rates jsonb,
  weekend_rates jsonb,
  expires_at timestamptz not null,
  decline_reason text,
  decline_comment text,
  responded_at timestamptz,
  cancelled_at timestamptz,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worker_offers_worker_id_fkey
    foreign key (worker_id)
    references public.worker_profiles(id)
    on delete restrict,
  constraint worker_offers_project_requirement_id_fkey
    foreign key (project_requirement_id)
    references public.project_requirements(id)
    on delete restrict,
  constraint worker_offers_application_id_fkey
    foreign key (application_id)
    references public.worker_applications(id)
    on delete restrict,
  constraint worker_offers_prior_offer_id_fkey
    foreign key (prior_offer_id)
    references public.worker_offers(id)
    on delete restrict,
  constraint worker_offers_created_by_user_id_fkey
    foreign key (created_by_user_id)
    references auth.users(id)
    on delete set null,
  constraint worker_offers_status_valid
    check (status in ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  constraint worker_offers_rate_valid
    check (offered_day_rate > 0),
  constraint worker_offers_dates_valid
    check (estimated_end_date is null or estimated_end_date >= start_date),
  constraint worker_offers_decline_valid
    check (
      status <> 'declined'
      or (decline_reason is not null and responded_at is not null)
    )
);

create unique index worker_offers_one_pending_idx
  on public.worker_offers(worker_id, project_requirement_id)
  where status = 'pending';

create index worker_offers_worker_created_idx
  on public.worker_offers(worker_id, created_at desc);

create index worker_offers_requirement_created_idx
  on public.worker_offers(project_requirement_id, created_at desc);

create index worker_offers_application_idx
  on public.worker_offers(application_id)
  where application_id is not null;

create table public.placements (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null,
  project_requirement_id uuid not null,
  accepted_offer_id uuid not null,
  application_id uuid,
  status text not null default 'upcoming',
  agreed_day_rate numeric(10, 2) not null,
  project_name_snapshot text not null,
  job_number_snapshot text not null default '',
  company_name_snapshot text not null,
  location_label_snapshot text not null,
  trade_snapshot text not null,
  role_snapshot text not null,
  grade_snapshot text not null default '',
  agreed_work_activity text not null,
  agreed_start_date date not null,
  agreed_estimated_end_date date,
  agreed_no_fixed_end_date boolean not null default false,
  agreed_duration_label text not null default '',
  agreed_working_days text[] not null default '{}',
  agreed_shift_start_time time not null,
  agreed_shift_finish_time time not null,
  agreed_accommodation_paid boolean not null default false,
  agreed_accommodation_arrangement text not null default '',
  agreed_accommodation_allowance_per_night numeric(10, 2),
  agreed_overtime_available boolean not null default false,
  agreed_overtime_rates jsonb,
  agreed_weekend_rates jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint placements_worker_id_fkey
    foreign key (worker_id)
    references public.worker_profiles(id)
    on delete restrict,
  constraint placements_project_requirement_id_fkey
    foreign key (project_requirement_id)
    references public.project_requirements(id)
    on delete restrict,
  constraint placements_accepted_offer_id_fkey
    foreign key (accepted_offer_id)
    references public.worker_offers(id)
    on delete restrict,
  constraint placements_application_id_fkey
    foreign key (application_id)
    references public.worker_applications(id)
    on delete restrict,
  constraint placements_status_valid
    check (status in ('upcoming', 'active', 'completed', 'cancelled')),
  constraint placements_rate_valid
    check (agreed_day_rate > 0),
  constraint placements_dates_valid
    check (
      agreed_estimated_end_date is null
      or agreed_estimated_end_date >= agreed_start_date
    ),
  constraint placements_accepted_offer_unique
    unique (accepted_offer_id)
);

create unique index placements_one_committed_worker_requirement_idx
  on public.placements(worker_id, project_requirement_id)
  where status in ('upcoming', 'active');

create index placements_worker_created_idx
  on public.placements(worker_id, created_at desc);

create index placements_requirement_created_idx
  on public.placements(project_requirement_id, created_at desc);

drop trigger if exists worker_offers_set_updated_at on public.worker_offers;
create trigger worker_offers_set_updated_at
before update on public.worker_offers
for each row execute function public.set_updated_at();

drop trigger if exists placements_set_updated_at on public.placements;
create trigger placements_set_updated_at
before update on public.placements
for each row execute function public.set_updated_at();

alter table public.worker_offers enable row level security;
alter table public.placements enable row level security;

create policy worker_offers_select_own
on public.worker_offers for select
to authenticated
using (
  exists (
    select 1
    from public.worker_profiles worker
    where worker.id = worker_offers.worker_id
      and worker.user_id = auth.uid()
  )
);

create policy worker_offers_select_company
on public.worker_offers for select
to authenticated
using (
  exists (
    select 1
    from public.project_requirements requirement
    join public.projects project on project.id = requirement.project_id
    join public.company_memberships membership on membership.company_id = project.company_id
    where requirement.id = worker_offers.project_requirement_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and membership.role in ('administrator', 'manager', 'supervisor')
  )
);

create policy placements_select_own
on public.placements for select
to authenticated
using (
  exists (
    select 1
    from public.worker_profiles worker
    where worker.id = placements.worker_id
      and worker.user_id = auth.uid()
  )
);

create policy placements_select_company
on public.placements for select
to authenticated
using (
  exists (
    select 1
    from public.project_requirements requirement
    join public.projects project on project.id = requirement.project_id
    join public.company_memberships membership on membership.company_id = project.company_id
    where requirement.id = placements.project_requirement_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and membership.role in ('administrator', 'manager', 'supervisor')
  )
);

create or replace function public.expire_pending_worker_offers()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  update public.worker_offers
  set status = 'expired'
  where status = 'pending'
    and expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.create_worker_offer(
  p_actor_user_id uuid,
  p_worker_id uuid,
  p_project_requirement_id uuid,
  p_application_id uuid,
  p_prior_offer_id uuid,
  p_terms jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_requirement public.project_requirements%rowtype;
  v_project public.projects%rowtype;
  v_company_name text;
  v_application public.worker_applications%rowtype;
  v_prior public.worker_offers%rowtype;
  v_offer_id uuid;
  v_offered_rate numeric(10, 2);
  v_start_date date;
  v_end_date date;
  v_shift_start time;
  v_shift_finish time;
  v_working_days text[];
  v_filled integer;
begin
  if not exists (
    select 1
    from public.company_memberships membership
    join public.projects project on project.company_id = membership.company_id
    join public.project_requirements requirement on requirement.project_id = project.id
    where membership.user_id = p_actor_user_id
      and membership.status = 'active'
      and membership.role in ('administrator', 'manager')
      and requirement.id = p_project_requirement_id
  ) then
    raise exception using errcode = '42501', message = 'Company cannot create this offer.';
  end if;

  select requirement.*
  into v_requirement
  from public.project_requirements requirement
  where requirement.id = p_project_requirement_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Labour requirement not found.';
  end if;

  select project.*
  into v_project
  from public.projects project
  where project.id = v_requirement.project_id;

  select company.name
  into v_company_name
  from public.companies company
  where company.id = v_project.company_id;

  if v_project.status not in ('open', 'active') then
    raise exception using errcode = 'P0003', message = 'This labour requirement is not open.';
  end if;

  if not exists (select 1 from public.worker_profiles worker where worker.id = p_worker_id) then
    raise exception using errcode = 'P0002', message = 'Worker not found.';
  end if;

  if p_application_id is not null then
    select application.*
    into v_application
    from public.worker_applications application
    where application.id = p_application_id
      and application.worker_id = p_worker_id
      and application.project_requirement_id = p_project_requirement_id
      and application.status = 'applied';
    if not found then
      raise exception using errcode = 'P0002', message = 'Application not found.';
    end if;
  end if;

  if p_prior_offer_id is not null then
    select offer.*
    into v_prior
    from public.worker_offers offer
    where offer.id = p_prior_offer_id
      and offer.worker_id = p_worker_id
      and offer.project_requirement_id = p_project_requirement_id
      and offer.status in ('declined', 'expired', 'cancelled');
    if not found then
      raise exception using errcode = 'P0002', message = 'Prior offer not found.';
    end if;
  end if;

  update public.worker_offers
  set status = 'expired'
  where status = 'pending'
    and expires_at <= now();

  select count(*)
  into v_filled
  from public.placements placement
  where placement.project_requirement_id = p_project_requirement_id
    and placement.status in ('upcoming', 'active');

  if v_filled >= v_requirement.workers_required then
    raise exception using errcode = 'P0003', message = 'This labour requirement is already filled.';
  end if;

  begin
    v_offered_rate := nullif(p_terms->>'offered_day_rate', '')::numeric;
    v_start_date := coalesce(nullif(p_terms->>'start_date', '')::date, v_project.start_date);
    v_end_date := coalesce(
      nullif(p_terms->>'estimated_end_date', '')::date,
      v_project.estimated_end_date
    );
    v_shift_start := coalesce(
      nullif(p_terms->>'shift_start_time', '')::time,
      v_requirement.shift_start_time,
      v_project.shift_start_time
    );
    v_shift_finish := coalesce(
      nullif(p_terms->>'shift_finish_time', '')::time,
      v_requirement.shift_finish_time,
      v_project.shift_finish_time
    );
  exception when invalid_text_representation then
    raise exception using errcode = '22023', message = 'Offer terms are invalid.';
  end;

  if v_offered_rate is null or v_offered_rate <= 0 then
    raise exception using errcode = '22023', message = 'A valid offered day rate is required.';
  end if;
  if v_end_date is not null and v_end_date < v_start_date then
    raise exception using errcode = '22023', message = 'Offer dates are invalid.';
  end if;
  if v_shift_start is null or v_shift_finish is null then
    raise exception using errcode = '22023', message = 'Offer shift times are required.';
  end if;

  v_working_days := case
    when jsonb_typeof(p_terms->'working_days') = 'array'
      then array(select jsonb_array_elements_text(p_terms->'working_days'))
    else v_requirement.working_days
  end;

  insert into public.worker_offers (
    worker_id,
    project_requirement_id,
    application_id,
    prior_offer_id,
    source,
    offered_day_rate,
    project_name_snapshot,
    job_number_snapshot,
    company_name_snapshot,
    location_label_snapshot,
    trade_snapshot,
    role_snapshot,
    grade_snapshot,
    work_activity_snapshot,
    start_date,
    estimated_end_date,
    no_fixed_end_date,
    duration_label,
    working_days,
    shift_start_time,
    shift_finish_time,
    accommodation_paid,
    accommodation_arrangement,
    accommodation_allowance_per_night,
    overtime_available,
    overtime_rates,
    weekend_rates,
    expires_at,
    created_by_user_id
  ) values (
    p_worker_id,
    p_project_requirement_id,
    p_application_id,
    p_prior_offer_id,
    coalesce(nullif(p_terms->>'source', ''), 'application'),
    v_offered_rate,
    v_project.project_name,
    v_project.job_number,
    v_company_name,
    v_project.location_label,
    v_requirement.trade,
    v_requirement.role,
    v_requirement.grade,
    coalesce(nullif(p_terms->>'work_activity', ''), v_requirement.work_activity),
    v_start_date,
    v_end_date,
    coalesce((p_terms->>'no_fixed_end_date')::boolean, v_project.no_fixed_end_date),
    coalesce(nullif(p_terms->>'duration_label', ''), v_project.duration_label),
    coalesce(v_working_days, '{}'),
    v_shift_start,
    v_shift_finish,
    coalesce((p_terms->>'accommodation_paid')::boolean, v_requirement.accommodation_paid),
    coalesce(p_terms->>'accommodation_arrangement', v_requirement.accommodation_arrangement, ''),
    coalesce(
      nullif(p_terms->>'accommodation_allowance_per_night', '')::numeric,
      v_requirement.accommodation_allowance_per_night
    ),
    coalesce((p_terms->>'overtime_available')::boolean, v_requirement.overtime_available),
    coalesce(p_terms->'overtime_rates', v_requirement.overtime_rates),
    coalesce(p_terms->'weekend_rates', v_requirement.weekend_rates),
    now() + interval '24 hours',
    p_actor_user_id
  ) returning id into v_offer_id;

  return v_offer_id;
end;
$$;

create or replace function public.accept_worker_offer(
  p_actor_user_id uuid,
  p_offer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker_id uuid;
  v_offer public.worker_offers%rowtype;
  v_requirement public.project_requirements%rowtype;
  v_project_status text;
  v_filled integer;
  v_placement_id uuid;
begin
  select worker.id
  into v_worker_id
  from public.worker_profiles worker
  where worker.user_id = p_actor_user_id
  for update;

  if v_worker_id is null then
    raise exception using errcode = '42501', message = 'Worker access is required.';
  end if;

  select offer.*
  into v_offer
  from public.worker_offers offer
  where offer.id = p_offer_id
    and offer.worker_id = v_worker_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Offer not found.';
  end if;

  if v_offer.status = 'pending' and v_offer.expires_at <= now() then
    update public.worker_offers set status = 'expired' where id = v_offer.id;
    return jsonb_build_object('outcome', 'expired', 'offer_id', v_offer.id);
  end if;

  if v_offer.status = 'accepted' then
    return jsonb_build_object('outcome', 'already_accepted', 'offer_id', v_offer.id);
  end if;

  if v_offer.status <> 'pending' then
    return jsonb_build_object('outcome', v_offer.status, 'offer_id', v_offer.id);
  end if;

  select requirement.*
  into v_requirement
  from public.project_requirements requirement
  where requirement.id = v_offer.project_requirement_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Labour requirement not found.';
  end if;

  select project.status
  into v_project_status
  from public.projects project
  where project.id = v_requirement.project_id;

  if v_project_status not in ('open', 'active') then
    return jsonb_build_object('outcome', 'requirement_closed', 'offer_id', v_offer.id);
  end if;

  select count(*)
  into v_filled
  from public.placements placement
  where placement.project_requirement_id = v_requirement.id
    and placement.status in ('upcoming', 'active');

  if v_filled >= v_requirement.workers_required then
    return jsonb_build_object('outcome', 'capacity_full', 'offer_id', v_offer.id);
  end if;

  if exists (
    select 1
    from public.placements placement
    where placement.worker_id = v_worker_id
      and placement.status in ('upcoming', 'active')
      and daterange(
        placement.agreed_start_date,
        coalesce(placement.agreed_estimated_end_date, 'infinity'::date),
        '[]'
      ) && daterange(
        v_offer.start_date,
        coalesce(v_offer.estimated_end_date, 'infinity'::date),
        '[]'
      )
  ) then
    return jsonb_build_object('outcome', 'schedule_conflict', 'offer_id', v_offer.id);
  end if;

  insert into public.placements (
    worker_id,
    project_requirement_id,
    accepted_offer_id,
    application_id,
    status,
    agreed_day_rate,
    project_name_snapshot,
    job_number_snapshot,
    company_name_snapshot,
    location_label_snapshot,
    trade_snapshot,
    role_snapshot,
    grade_snapshot,
    agreed_work_activity,
    agreed_start_date,
    agreed_estimated_end_date,
    agreed_no_fixed_end_date,
    agreed_duration_label,
    agreed_working_days,
    agreed_shift_start_time,
    agreed_shift_finish_time,
    agreed_accommodation_paid,
    agreed_accommodation_arrangement,
    agreed_accommodation_allowance_per_night,
    agreed_overtime_available,
    agreed_overtime_rates,
    agreed_weekend_rates
  ) values (
    v_offer.worker_id,
    v_offer.project_requirement_id,
    v_offer.id,
    v_offer.application_id,
    case when v_offer.start_date <= current_date then 'active' else 'upcoming' end,
    v_offer.offered_day_rate,
    v_offer.project_name_snapshot,
    v_offer.job_number_snapshot,
    v_offer.company_name_snapshot,
    v_offer.location_label_snapshot,
    v_offer.trade_snapshot,
    v_offer.role_snapshot,
    v_offer.grade_snapshot,
    v_offer.work_activity_snapshot,
    v_offer.start_date,
    v_offer.estimated_end_date,
    v_offer.no_fixed_end_date,
    v_offer.duration_label,
    v_offer.working_days,
    v_offer.shift_start_time,
    v_offer.shift_finish_time,
    v_offer.accommodation_paid,
    v_offer.accommodation_arrangement,
    v_offer.accommodation_allowance_per_night,
    v_offer.overtime_available,
    v_offer.overtime_rates,
    v_offer.weekend_rates
  ) returning id into v_placement_id;

  update public.worker_offers
  set status = 'accepted', responded_at = now()
  where id = v_offer.id and status = 'pending';

  select count(*)
  into v_filled
  from public.placements placement
  where placement.project_requirement_id = v_requirement.id
    and placement.status in ('upcoming', 'active');

  if v_filled >= v_requirement.workers_required then
    update public.worker_offers
    set status = 'cancelled', cancelled_at = now()
    where project_requirement_id = v_requirement.id
      and status = 'pending'
      and id <> v_offer.id;
  end if;

  return jsonb_build_object(
    'outcome', 'accepted',
    'offer_id', v_offer.id,
    'placement_id', v_placement_id
  );
end;
$$;

create or replace function public.decline_worker_offer(
  p_actor_user_id uuid,
  p_offer_id uuid,
  p_reason text,
  p_comment text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker_id uuid;
  v_offer public.worker_offers%rowtype;
  v_allowed_reasons constant text[] := array[
    'Unavailable / In Work',
    'Rate Too Low',
    'Location / Travel',
    'Start Date Not Suitable',
    'Project Duration Not Suitable',
    'Work Activity Not Suitable',
    'Other'
  ];
begin
  select worker.id
  into v_worker_id
  from public.worker_profiles worker
  where worker.user_id = p_actor_user_id;

  if v_worker_id is null then
    raise exception using errcode = '42501', message = 'Worker access is required.';
  end if;

  select offer.*
  into v_offer
  from public.worker_offers offer
  where offer.id = p_offer_id
    and offer.worker_id = v_worker_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Offer not found.';
  end if;

  if v_offer.status = 'pending' and v_offer.expires_at <= now() then
    update public.worker_offers set status = 'expired' where id = v_offer.id;
    return jsonb_build_object('outcome', 'expired', 'offer_id', v_offer.id);
  end if;

  if v_offer.status <> 'pending' then
    return jsonb_build_object('outcome', v_offer.status, 'offer_id', v_offer.id);
  end if;

  if p_reason is null or not (p_reason = any(v_allowed_reasons)) then
    raise exception using errcode = '22023', message = 'Choose a valid decline reason.';
  end if;

  update public.worker_offers
  set
    status = 'declined',
    decline_reason = p_reason,
    decline_comment = nullif(left(trim(coalesce(p_comment, '')), 1000), ''),
    responded_at = now()
  where id = v_offer.id;

  return jsonb_build_object('outcome', 'declined', 'offer_id', v_offer.id);
end;
$$;

revoke all on public.worker_offers from public, anon, authenticated, service_role;
revoke all on public.placements from public, anon, authenticated, service_role;
grant select (
  id,
  worker_id,
  project_requirement_id,
  application_id,
  prior_offer_id,
  status,
  source,
  offered_day_rate,
  project_name_snapshot,
  job_number_snapshot,
  company_name_snapshot,
  location_label_snapshot,
  trade_snapshot,
  role_snapshot,
  grade_snapshot,
  work_activity_snapshot,
  start_date,
  estimated_end_date,
  no_fixed_end_date,
  duration_label,
  working_days,
  shift_start_time,
  shift_finish_time,
  accommodation_paid,
  accommodation_arrangement,
  accommodation_allowance_per_night,
  overtime_available,
  overtime_rates,
  weekend_rates,
  expires_at,
  decline_reason,
  decline_comment,
  responded_at,
  cancelled_at,
  created_at,
  updated_at
) on public.worker_offers to authenticated;
grant select on public.worker_offers to service_role;
grant select on public.placements to authenticated, service_role;

revoke all on function public.expire_pending_worker_offers() from public, anon, authenticated;
revoke all on function public.create_worker_offer(uuid, uuid, uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.accept_worker_offer(uuid, uuid) from public, anon, authenticated;
revoke all on function public.decline_worker_offer(uuid, uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.expire_pending_worker_offers() to service_role;
grant execute on function public.create_worker_offer(uuid, uuid, uuid, uuid, uuid, jsonb)
  to service_role;
grant execute on function public.accept_worker_offer(uuid, uuid) to service_role;
grant execute on function public.decline_worker_offer(uuid, uuid, text, text)
  to service_role;

commit;
