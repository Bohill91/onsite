begin;

alter table public.placements
  drop constraint placements_status_valid;

alter table public.placements
  add column current_day_rate numeric(10, 2),
  add column current_work_activity text,
  add column current_start_date date,
  add column current_estimated_end_date date,
  add column current_no_fixed_end_date boolean,
  add column current_duration_label text,
  add column current_working_days text[],
  add column current_shift_start_time time,
  add column current_shift_finish_time time,
  add column scheduled_end_date date,
  add column scheduled_end_type text,
  add column ended_at timestamptz,
  add column end_reason_code text,
  add column end_reason_text text;

update public.placements
set
  current_day_rate = agreed_day_rate,
  current_work_activity = agreed_work_activity,
  current_start_date = agreed_start_date,
  current_estimated_end_date = agreed_estimated_end_date,
  current_no_fixed_end_date = agreed_no_fixed_end_date,
  current_duration_label = agreed_duration_label,
  current_working_days = agreed_working_days,
  current_shift_start_time = agreed_shift_start_time,
  current_shift_finish_time = agreed_shift_finish_time;

alter table public.placements
  alter column current_day_rate set not null,
  alter column current_work_activity set not null,
  alter column current_start_date set not null,
  alter column current_no_fixed_end_date set not null,
  alter column current_duration_label set not null,
  alter column current_working_days set not null,
  alter column current_shift_start_time set not null,
  alter column current_shift_finish_time set not null,
  alter column current_no_fixed_end_date set default false,
  alter column current_duration_label set default '',
  alter column current_working_days set default '{}';

create or replace function public.initialize_placement_current_terms()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.current_day_rate := coalesce(new.current_day_rate, new.agreed_day_rate);
  new.current_work_activity := coalesce(new.current_work_activity, new.agreed_work_activity);
  new.current_start_date := coalesce(new.current_start_date, new.agreed_start_date);
  new.current_estimated_end_date := coalesce(
    new.current_estimated_end_date,
    new.agreed_estimated_end_date
  );
  new.current_no_fixed_end_date := coalesce(
    new.current_no_fixed_end_date,
    new.agreed_no_fixed_end_date
  );
  new.current_duration_label := coalesce(
    new.current_duration_label,
    new.agreed_duration_label
  );
  new.current_working_days := coalesce(new.current_working_days, new.agreed_working_days);
  new.current_shift_start_time := coalesce(
    new.current_shift_start_time,
    new.agreed_shift_start_time
  );
  new.current_shift_finish_time := coalesce(
    new.current_shift_finish_time,
    new.agreed_shift_finish_time
  );
  return new;
end;
$$;

drop trigger if exists placements_initialize_current_terms on public.placements;
create trigger placements_initialize_current_terms
before insert on public.placements
for each row execute function public.initialize_placement_current_terms();

alter table public.placements
  add constraint placements_status_valid
    check (status in ('upcoming', 'active', 'completed', 'released', 'cancelled')),
  add constraint placements_current_rate_valid
    check (current_day_rate > 0),
  add constraint placements_current_dates_valid
    check (
      current_estimated_end_date is null
      or current_estimated_end_date >= current_start_date
    ),
  add constraint placements_scheduled_end_type_valid
    check (
      scheduled_end_type is null
      or scheduled_end_type in ('company_release', 'worker_end')
    );

create table public.placement_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  placement_id uuid not null,
  event_type text not null,
  initiated_by_user_id uuid,
  initiated_by_type text not null default 'system',
  initiated_by_role text,
  reason_code text,
  reason_text text,
  requested_at timestamptz not null default now(),
  effective_at timestamptz,
  notice_days integer,
  notice_classification text,
  worker_fault boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  private_company_notes text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint placement_lifecycle_events_placement_id_fkey
    foreign key (placement_id)
    references public.placements(id)
    on delete restrict,
  constraint placement_lifecycle_events_initiated_by_user_id_fkey
    foreign key (initiated_by_user_id)
    references auth.users(id)
    on delete set null,
  constraint placement_lifecycle_events_type_valid
    check (event_type in (
      'activated',
      'completed',
      'release_scheduled',
      'released',
      'worker_end_requested',
      'change_proposed',
      'change_accepted',
      'change_declined',
      'change_expired',
      'change_applied'
    )),
  constraint placement_lifecycle_events_actor_type_valid
    check (initiated_by_type in ('company', 'worker', 'system')),
  constraint placement_lifecycle_events_notice_days_valid
    check (notice_days is null or notice_days >= 0),
  constraint placement_lifecycle_events_idempotency_unique
    unique (idempotency_key)
);

create table public.placement_change_offers (
  id uuid primary key default gen_random_uuid(),
  placement_id uuid not null,
  status text not null default 'pending',
  change_type text not null,
  proposed_terms jsonb not null,
  effective_date date,
  expires_at timestamptz not null,
  responded_at timestamptz,
  applied_at timestamptz,
  decline_reason text,
  decline_comment text,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint placement_change_offers_placement_id_fkey
    foreign key (placement_id)
    references public.placements(id)
    on delete restrict,
  constraint placement_change_offers_created_by_user_id_fkey
    foreign key (created_by_user_id)
    references auth.users(id)
    on delete set null,
  constraint placement_change_offers_status_valid
    check (status in ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  constraint placement_change_offers_type_valid
    check (change_type in ('extension', 'schedule_change')),
  constraint placement_change_offers_response_consistent
    check (
      (status = 'pending' and responded_at is null)
      or (status in ('accepted', 'declined') and responded_at is not null)
      or status in ('expired', 'cancelled')
    )
);

create index placement_lifecycle_events_placement_created_idx
  on public.placement_lifecycle_events(placement_id, created_at desc);

create index placement_change_offers_placement_created_idx
  on public.placement_change_offers(placement_id, created_at desc);

create unique index placement_change_offers_one_pending_type_idx
  on public.placement_change_offers(placement_id, change_type)
  where status = 'pending';

drop trigger if exists placement_change_offers_set_updated_at
  on public.placement_change_offers;
create trigger placement_change_offers_set_updated_at
before update on public.placement_change_offers
for each row execute function public.set_updated_at();

alter table public.placement_lifecycle_events enable row level security;
alter table public.placement_change_offers enable row level security;

create policy placement_lifecycle_events_select_own
on public.placement_lifecycle_events for select
to authenticated
using (
  exists (
    select 1
    from public.placements placement
    join public.worker_profiles worker on worker.id = placement.worker_id
    where placement.id = placement_lifecycle_events.placement_id
      and worker.user_id = auth.uid()
  )
);

create policy placement_lifecycle_events_select_company
on public.placement_lifecycle_events for select
to authenticated
using (
  exists (
    select 1
    from public.placements placement
    join public.project_requirements requirement
      on requirement.id = placement.project_requirement_id
    join public.projects project on project.id = requirement.project_id
    join public.company_memberships membership
      on membership.company_id = project.company_id
    where placement.id = placement_lifecycle_events.placement_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and membership.role in ('administrator', 'manager', 'supervisor')
  )
);

create policy placement_change_offers_select_own
on public.placement_change_offers for select
to authenticated
using (
  exists (
    select 1
    from public.placements placement
    join public.worker_profiles worker on worker.id = placement.worker_id
    where placement.id = placement_change_offers.placement_id
      and worker.user_id = auth.uid()
  )
);

create policy placement_change_offers_select_company
on public.placement_change_offers for select
to authenticated
using (
  exists (
    select 1
    from public.placements placement
    join public.project_requirements requirement
      on requirement.id = placement.project_requirement_id
    join public.projects project on project.id = requirement.project_id
    join public.company_memberships membership
      on membership.company_id = project.company_id
    where placement.id = placement_change_offers.placement_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and membership.role in ('administrator', 'manager', 'supervisor')
  )
);

create or replace function public.placement_add_working_days(
  p_start date,
  p_days integer
)
returns date
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_date date := p_start;
  v_remaining integer := greatest(coalesce(p_days, 0), 0);
begin
  while v_remaining > 0 loop
    v_date := v_date + 1;
    if extract(isodow from v_date) between 1 and 5 then
      v_remaining := v_remaining - 1;
    end if;
  end loop;
  return v_date;
end;
$$;

create or replace function public.placement_working_days_between(
  p_start date,
  p_finish date
)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select count(*)::integer
  from generate_series(p_start + 1, p_finish, interval '1 day') day
  where extract(isodow from day) between 1 and 5;
$$;

create or replace function public.normalize_placement_lifecycle()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_change public.placement_change_offers%rowtype;
  v_placement public.placements%rowtype;
  v_count integer := 0;
begin
  for v_change in
    select change_offer.*
    from public.placement_change_offers change_offer
    where change_offer.status = 'pending'
      and change_offer.expires_at <= now()
    order by change_offer.expires_at, change_offer.created_at
  loop
    select placement.*
    into v_placement
    from public.placements placement
    where placement.id = v_change.placement_id
    for update;

    select change_offer.*
    into v_change
    from public.placement_change_offers change_offer
    where change_offer.id = v_change.id
      and change_offer.status = 'pending'
      and change_offer.expires_at <= now()
    for update;

    if not found then
      continue;
    end if;

    update public.placement_change_offers
    set status = 'expired'
    where id = v_change.id;

    insert into public.placement_lifecycle_events (
      placement_id,
      event_type,
      initiated_by_type,
      reason_code,
      requested_at,
      effective_at,
      metadata,
      idempotency_key
    ) values (
      v_change.placement_id,
      'change_expired',
      'system',
      v_change.change_type,
      v_change.created_at,
      now(),
      jsonb_build_object('change_offer_id', v_change.id),
      'change_expired:' || v_change.id
    ) on conflict (idempotency_key) do nothing;
    v_count := v_count + 1;
  end loop;

  for v_change in
    select change_offer.*
    from public.placement_change_offers change_offer
    where change_offer.status = 'accepted'
      and change_offer.change_type = 'schedule_change'
      and change_offer.applied_at is null
      and change_offer.effective_date <= current_date
    order by change_offer.effective_date, change_offer.created_at
  loop
    select placement.*
    into v_placement
    from public.placements placement
    where placement.id = v_change.placement_id
    for update;

    select change_offer.*
    into v_change
    from public.placement_change_offers change_offer
    where change_offer.id = v_change.id
      and change_offer.status = 'accepted'
      and change_offer.change_type = 'schedule_change'
      and change_offer.applied_at is null
      and change_offer.effective_date <= current_date
    for update;

    if not found then
      continue;
    end if;

    if v_placement.status in ('upcoming', 'active') then
      update public.placements
      set
        current_day_rate = coalesce(
          nullif(v_change.proposed_terms->>'day_rate', '')::numeric,
          current_day_rate
        ),
        current_working_days = case
          when jsonb_typeof(v_change.proposed_terms->'working_days') = 'array'
            then array(select jsonb_array_elements_text(v_change.proposed_terms->'working_days'))
          else current_working_days
        end,
        current_shift_start_time = coalesce(
          nullif(v_change.proposed_terms->>'shift_start_time', '')::time,
          current_shift_start_time
        ),
        current_shift_finish_time = coalesce(
          nullif(v_change.proposed_terms->>'shift_finish_time', '')::time,
          current_shift_finish_time
        ),
        current_work_activity = coalesce(
          nullif(v_change.proposed_terms->>'work_activity', ''),
          current_work_activity
        )
      where id = v_placement.id;

      update public.placement_change_offers
      set applied_at = now()
      where id = v_change.id;

      insert into public.placement_lifecycle_events (
        placement_id,
        event_type,
        initiated_by_type,
        reason_code,
        requested_at,
        effective_at,
        metadata,
        idempotency_key
      ) values (
        v_placement.id,
        'change_applied',
        'system',
        v_change.change_type,
        v_change.created_at,
        v_change.effective_date::timestamptz,
        jsonb_build_object(
          'change_offer_id', v_change.id,
          'accepted_terms', v_change.proposed_terms
        ),
        'change_applied:' || v_change.id
      ) on conflict (idempotency_key) do nothing;
      v_count := v_count + 1;
    end if;
  end loop;

  for v_placement in
    select placement.*
    from public.placements placement
    where placement.status in ('upcoming', 'active')
      and placement.scheduled_end_date is not null
      and placement.scheduled_end_date <= current_date
    for update skip locked
  loop
    update public.placements
    set
      status = 'released',
      ended_at = coalesce(ended_at, now())
    where id = v_placement.id;

    insert into public.placement_lifecycle_events (
      placement_id,
      event_type,
      initiated_by_type,
      reason_code,
      reason_text,
      requested_at,
      effective_at,
      metadata,
      idempotency_key
    ) values (
      v_placement.id,
      'released',
      'system',
      v_placement.end_reason_code,
      v_placement.end_reason_text,
      coalesce(v_placement.updated_at, now()),
      v_placement.scheduled_end_date::timestamptz,
      jsonb_build_object('scheduled_end_type', v_placement.scheduled_end_type),
      'scheduled_release_effective:' || v_placement.id || ':' || v_placement.scheduled_end_date
    ) on conflict (idempotency_key) do nothing;
    v_count := v_count + 1;
  end loop;

  for v_placement in
    select placement.*
    from public.placements placement
    join public.project_requirements requirement
      on requirement.id = placement.project_requirement_id
    join public.projects project on project.id = requirement.project_id
    where placement.status in ('upcoming', 'active')
      and (
        project.status = 'completed'
        or (
          placement.current_no_fixed_end_date = false
          and placement.current_estimated_end_date < current_date
        )
      )
    for update of placement skip locked
  loop
    update public.placements
    set
      status = 'completed',
      ended_at = coalesce(ended_at, now())
    where id = v_placement.id;

    insert into public.placement_lifecycle_events (
      placement_id,
      event_type,
      initiated_by_type,
      reason_code,
      requested_at,
      effective_at,
      idempotency_key
    ) values (
      v_placement.id,
      'completed',
      'system',
      'natural_completion',
      now(),
      coalesce(v_placement.current_estimated_end_date, current_date)::timestamptz,
      'placement_completed:' || v_placement.id
    ) on conflict (idempotency_key) do nothing;
    v_count := v_count + 1;
  end loop;

  for v_placement in
    select placement.*
    from public.placements placement
    where placement.status = 'upcoming'
      and placement.current_start_date <= current_date
    for update skip locked
  loop
    update public.placements
    set status = 'active'
    where id = v_placement.id;

    insert into public.placement_lifecycle_events (
      placement_id,
      event_type,
      initiated_by_type,
      requested_at,
      effective_at,
      idempotency_key
    ) values (
      v_placement.id,
      'activated',
      'system',
      now(),
      v_placement.current_start_date::timestamptz,
      'placement_activated:' || v_placement.id
    ) on conflict (idempotency_key) do nothing;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.release_placement(
  p_actor_user_id uuid,
  p_placement_id uuid,
  p_release_type text,
  p_effective_date date,
  p_reason_code text,
  p_reason_text text,
  p_private_company_notes text,
  p_replacement_requested boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid;
  v_requirement_id uuid;
  v_project public.projects%rowtype;
  v_requirement public.project_requirements%rowtype;
  v_placement public.placements%rowtype;
  v_role text;
  v_effective_date date;
  v_notice_days integer;
  v_notice_classification text;
  v_worker_fault boolean;
  v_terminal boolean;
  v_event_id uuid;
  v_reason_text text;
  v_private_notes text;
  v_idempotency_key text;
begin
  if p_release_type not in (
    'standard_release',
    'pre_start_stand_down',
    'site_not_ready',
    'immediate_release'
  ) then
    raise exception using errcode = '22023', message = 'Choose a valid release type.';
  end if;
  if nullif(trim(coalesce(p_reason_code, '')), '') is null then
    raise exception using errcode = '22023', message = 'A release reason is required.';
  end if;

  select requirement.project_id, placement.project_requirement_id
  into v_project_id, v_requirement_id
  from public.placements placement
  join public.project_requirements requirement
    on requirement.id = placement.project_requirement_id
  where placement.id = p_placement_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Placement not found.';
  end if;

  select project.*
  into v_project
  from public.projects project
  where project.id = v_project_id
  for update;

  select requirement.*
  into v_requirement
  from public.project_requirements requirement
  where requirement.id = v_requirement_id
    and requirement.project_id = v_project.id
  for update;

  select placement.*
  into v_placement
  from public.placements placement
  where placement.id = p_placement_id
    and placement.project_requirement_id = v_requirement.id
  for update;

  select membership.role
  into v_role
  from public.company_memberships membership
  where membership.company_id = v_project.company_id
    and membership.user_id = p_actor_user_id
    and membership.status = 'active'
    and membership.role in ('administrator', 'manager');

  if v_role is null then
    raise exception using errcode = '42501', message = 'Company cannot release this placement.';
  end if;
  if v_placement.status not in ('upcoming', 'active') then
    return jsonb_build_object('outcome', v_placement.status, 'placement_id', v_placement.id);
  end if;

  if p_release_type = 'standard_release' then
    v_effective_date := coalesce(
      p_effective_date,
      public.placement_add_working_days(current_date, 5)
    );
    if v_effective_date < public.placement_add_working_days(current_date, 5) then
      raise exception using errcode = '22023', message = 'Standard release requires 5 working days notice.';
    end if;
    if not v_placement.current_no_fixed_end_date
      and v_placement.current_estimated_end_date is not null
      and v_effective_date > v_placement.current_estimated_end_date then
      raise exception using errcode = '22023', message = 'The scheduled release cannot be after the placement end date.';
    end if;
    v_notice_days := 5;
    v_notice_classification := 'standard_5_working_days';
    v_terminal := false;
  elsif p_release_type in ('pre_start_stand_down', 'site_not_ready') then
    if v_placement.status <> 'upcoming'
      or v_placement.current_start_date <= current_date then
      raise exception using errcode = '22023', message = 'Pre-start stand-down is only available before the placement starts.';
    end if;
    v_effective_date := current_date;
    v_notice_days := greatest(v_placement.current_start_date - current_date, 0);
    v_notice_classification := case
      when v_notice_days <= 3 then 'pre_start_within_3_calendar_days'
      else 'pre_start_more_than_3_calendar_days'
    end;
    v_terminal := true;
  else
    v_effective_date := current_date;
    v_notice_days := 0;
    v_notice_classification := 'immediate_company_release';
    v_terminal := true;
  end if;

  v_reason_text := coalesce(nullif(trim(p_reason_text), ''), p_reason_code);
  v_private_notes := nullif(left(trim(coalesce(p_private_company_notes, '')), 2000), '');
  v_idempotency_key := concat(
    'company_release:',
    v_placement.id,
    ':',
    p_release_type,
    ':',
    v_effective_date
  );

  if v_placement.scheduled_end_date is not null
    or v_placement.scheduled_end_type is not null then
    select lifecycle_event.id
    into v_event_id
    from public.placement_lifecycle_events lifecycle_event
    where lifecycle_event.placement_id = v_placement.id
      and lifecycle_event.idempotency_key = v_idempotency_key
      and lifecycle_event.reason_code = p_reason_code
      and lifecycle_event.reason_text = v_reason_text
      and lifecycle_event.notice_classification = v_notice_classification
      and lifecycle_event.private_company_notes is not distinct from v_private_notes
      and lifecycle_event.metadata->>'release_type' = p_release_type
      and coalesce(
        (lifecycle_event.metadata->>'replacement_requested')::boolean,
        false
      ) = coalesce(p_replacement_requested, false);

    if v_placement.scheduled_end_date = v_effective_date
      and v_placement.scheduled_end_type = 'company_release'
      and v_placement.end_reason_code = p_reason_code
      and v_placement.end_reason_text = v_reason_text
      and v_event_id is not null then
      return jsonb_build_object(
        'outcome', case when v_terminal then 'released' else 'release_scheduled' end,
        'placement_id', v_placement.id,
        'event_id', v_event_id,
        'effective_date', v_effective_date,
        'notice_days', v_notice_days,
        'notice_classification', v_notice_classification,
        'idempotent', true
      );
    end if;

    raise exception using
      errcode = 'P0003',
      message = 'This placement already has a different scheduled end.';
  end if;

  if not v_terminal and exists (
    select 1
    from public.placement_change_offers change_offer
    where change_offer.placement_id = v_placement.id
      and (
        change_offer.status = 'pending'
        or (change_offer.status = 'accepted' and change_offer.applied_at is null)
      )
      and change_offer.effective_date > v_effective_date
  ) then
    raise exception using
      errcode = 'P0003',
      message = 'A pending placement change occurs after the proposed release date.';
  end if;

  v_worker_fault := p_release_type = 'immediate_release'
    and p_reason_code in (
      'No-show',
      'Health & safety breach',
      'Conduct issue',
      'Poor workmanship',
      'Qualifications issue'
    );

  update public.placements
  set
    status = case when v_terminal then 'released' else status end,
    scheduled_end_date = v_effective_date,
    scheduled_end_type = 'company_release',
    ended_at = case when v_terminal then now() else ended_at end,
    end_reason_code = p_reason_code,
    end_reason_text = v_reason_text
  where id = v_placement.id;

  insert into public.placement_lifecycle_events (
    placement_id,
    event_type,
    initiated_by_user_id,
    initiated_by_type,
    initiated_by_role,
    reason_code,
    reason_text,
    requested_at,
    effective_at,
    notice_days,
    notice_classification,
    worker_fault,
    metadata,
    private_company_notes,
    idempotency_key
  ) values (
    v_placement.id,
    case when v_terminal then 'released' else 'release_scheduled' end,
    p_actor_user_id,
    'company',
    v_role,
    p_reason_code,
    v_reason_text,
    now(),
    v_effective_date::timestamptz,
    v_notice_days,
    v_notice_classification,
    v_worker_fault,
    jsonb_build_object(
      'release_type', p_release_type,
      'replacement_requested', coalesce(p_replacement_requested, false)
    ),
    v_private_notes,
    v_idempotency_key
  ) returning id into v_event_id;

  return jsonb_build_object(
    'outcome', case when v_terminal then 'released' else 'release_scheduled' end,
    'placement_id', v_placement.id,
    'event_id', v_event_id,
    'effective_date', v_effective_date,
    'notice_days', v_notice_days,
    'notice_classification', v_notice_classification
  );
end;
$$;

create or replace function public.request_worker_placement_end(
  p_actor_user_id uuid,
  p_placement_id uuid,
  p_effective_date date,
  p_reason_code text,
  p_reason_text text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker_id uuid;
  v_project_id uuid;
  v_requirement_id uuid;
  v_project public.projects%rowtype;
  v_requirement public.project_requirements%rowtype;
  v_placement public.placements%rowtype;
  v_effective_date date;
  v_notice_days integer;
  v_terminal boolean;
  v_event_id uuid;
  v_reason_text text;
  v_idempotency_key text;
begin
  if nullif(trim(coalesce(p_reason_code, '')), '') is null then
    raise exception using errcode = '22023', message = 'An end reason is required.';
  end if;

  select worker.id
  into v_worker_id
  from public.worker_profiles worker
  where worker.user_id = p_actor_user_id
  for update;

  if v_worker_id is null then
    raise exception using errcode = '42501', message = 'Worker access is required.';
  end if;

  select requirement.project_id, placement.project_requirement_id
  into v_project_id, v_requirement_id
  from public.placements placement
  join public.project_requirements requirement
    on requirement.id = placement.project_requirement_id
  where placement.id = p_placement_id
    and placement.worker_id = v_worker_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Placement not found.';
  end if;

  select project.* into v_project
  from public.projects project
  where project.id = v_project_id
  for update;

  select requirement.* into v_requirement
  from public.project_requirements requirement
  where requirement.id = v_requirement_id
    and requirement.project_id = v_project.id
  for update;

  select placement.* into v_placement
  from public.placements placement
  where placement.id = p_placement_id
    and placement.worker_id = v_worker_id
    and placement.project_requirement_id = v_requirement.id
  for update;

  if v_placement.status not in ('upcoming', 'active') then
    return jsonb_build_object('outcome', v_placement.status, 'placement_id', v_placement.id);
  end if;

  v_effective_date := coalesce(p_effective_date, current_date);
  if v_effective_date < current_date then
    raise exception using errcode = '22023', message = 'The last working day cannot be in the past.';
  end if;
  if v_placement.current_estimated_end_date is not null
    and v_effective_date > v_placement.current_estimated_end_date then
    raise exception using errcode = '22023', message = 'The requested end date is after the agreed placement end.';
  end if;

  v_notice_days := public.placement_working_days_between(current_date, v_effective_date);
  v_terminal := v_effective_date <= current_date;
  v_reason_text := coalesce(nullif(trim(p_reason_text), ''), p_reason_code);
  v_idempotency_key := concat(
    'worker_end:',
    v_placement.id,
    ':',
    v_effective_date
  );

  if v_placement.scheduled_end_date is not null
    or v_placement.scheduled_end_type is not null then
    select lifecycle_event.id
    into v_event_id
    from public.placement_lifecycle_events lifecycle_event
    where lifecycle_event.placement_id = v_placement.id
      and lifecycle_event.idempotency_key = v_idempotency_key
      and lifecycle_event.reason_code = p_reason_code
      and lifecycle_event.reason_text = v_reason_text;

    if v_placement.scheduled_end_date = v_effective_date
      and v_placement.scheduled_end_type = 'worker_end'
      and v_placement.end_reason_code = p_reason_code
      and v_placement.end_reason_text = v_reason_text
      and v_event_id is not null then
      return jsonb_build_object(
        'outcome', case when v_terminal then 'released' else 'end_scheduled' end,
        'placement_id', v_placement.id,
        'event_id', v_event_id,
        'effective_date', v_effective_date,
        'notice_days', v_notice_days,
        'idempotent', true
      );
    end if;

    raise exception using
      errcode = 'P0003',
      message = 'This placement already has a different scheduled end.';
  end if;

  if not v_terminal and exists (
    select 1
    from public.placement_change_offers change_offer
    where change_offer.placement_id = v_placement.id
      and (
        change_offer.status = 'pending'
        or (change_offer.status = 'accepted' and change_offer.applied_at is null)
      )
      and change_offer.effective_date > v_effective_date
  ) then
    raise exception using
      errcode = 'P0003',
      message = 'A pending placement change occurs after the proposed end date.';
  end if;

  update public.placements
  set
    status = case when v_terminal then 'released' else status end,
    scheduled_end_date = v_effective_date,
    scheduled_end_type = 'worker_end',
    ended_at = case when v_terminal then now() else ended_at end,
    end_reason_code = p_reason_code,
    end_reason_text = v_reason_text
  where id = v_placement.id;

  insert into public.placement_lifecycle_events (
    placement_id,
    event_type,
    initiated_by_user_id,
    initiated_by_type,
    reason_code,
    reason_text,
    requested_at,
    effective_at,
    notice_days,
    notice_classification,
    metadata,
    idempotency_key
  ) values (
    v_placement.id,
    'worker_end_requested',
    p_actor_user_id,
    'worker',
    p_reason_code,
    v_reason_text,
    now(),
    v_effective_date::timestamptz,
    v_notice_days,
    'worker_requested_end',
    jsonb_build_object('terminal_immediately', v_terminal),
    v_idempotency_key
  ) returning id into v_event_id;

  return jsonb_build_object(
    'outcome', case when v_terminal then 'released' else 'end_scheduled' end,
    'placement_id', v_placement.id,
    'event_id', v_event_id,
    'effective_date', v_effective_date,
    'notice_days', v_notice_days
  );
end;
$$;

create or replace function public.complete_placement(
  p_actor_user_id uuid,
  p_placement_id uuid,
  p_effective_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid;
  v_requirement_id uuid;
  v_project public.projects%rowtype;
  v_requirement public.project_requirements%rowtype;
  v_placement public.placements%rowtype;
  v_role text;
  v_effective_date date;
  v_idempotency_key text;
begin
  select requirement.project_id, placement.project_requirement_id
  into v_project_id, v_requirement_id
  from public.placements placement
  join public.project_requirements requirement
    on requirement.id = placement.project_requirement_id
  where placement.id = p_placement_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Placement not found.';
  end if;

  select project.* into v_project
  from public.projects project where project.id = v_project_id for update;
  select requirement.* into v_requirement
  from public.project_requirements requirement
  where requirement.id = v_requirement_id and requirement.project_id = v_project.id
  for update;
  select placement.* into v_placement
  from public.placements placement
  where placement.id = p_placement_id
    and placement.project_requirement_id = v_requirement.id
  for update;

  select membership.role into v_role
  from public.company_memberships membership
  where membership.company_id = v_project.company_id
    and membership.user_id = p_actor_user_id
    and membership.status = 'active'
    and membership.role in ('administrator', 'manager');

  if v_role is null then
    raise exception using errcode = '42501', message = 'Company cannot complete this placement.';
  end if;
  if v_placement.status not in ('upcoming', 'active') then
    return jsonb_build_object('outcome', v_placement.status, 'placement_id', v_placement.id);
  end if;

  v_effective_date := coalesce(p_effective_date, current_date);
  if v_effective_date > current_date then
    raise exception using errcode = '22023', message = 'A completion date cannot be in the future.';
  end if;
  if v_effective_date < v_placement.current_start_date then
    raise exception using errcode = '22023', message = 'A completion date cannot be before the placement start date.';
  end if;
  if not v_placement.current_no_fixed_end_date
    and v_placement.current_estimated_end_date is not null
    and v_effective_date > v_placement.current_estimated_end_date then
    raise exception using errcode = '22023', message = 'A completion date cannot be after the placement end date.';
  end if;
  if v_placement.scheduled_end_date is not null
    or v_placement.scheduled_end_type is not null then
    raise exception using
      errcode = 'P0003',
      message = 'This placement already has a scheduled end.';
  end if;

  v_idempotency_key := concat(
    'company_completed:',
    v_placement.id,
    ':',
    v_effective_date
  );
  update public.placements
  set status = 'completed', ended_at = v_effective_date::timestamptz
  where id = v_placement.id;

  insert into public.placement_lifecycle_events (
    placement_id,
    event_type,
    initiated_by_user_id,
    initiated_by_type,
    initiated_by_role,
    reason_code,
    requested_at,
    effective_at,
    idempotency_key
  ) values (
    v_placement.id,
    'completed',
    p_actor_user_id,
    'company',
    v_role,
    'company_confirmed_completion',
    now(),
    v_effective_date::timestamptz,
    v_idempotency_key
  );

  return jsonb_build_object('outcome', 'completed', 'placement_id', v_placement.id);
end;
$$;

create or replace function public.propose_placement_change(
  p_actor_user_id uuid,
  p_placement_id uuid,
  p_change_type text,
  p_effective_date date,
  p_proposed_terms jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid;
  v_requirement_id uuid;
  v_project public.projects%rowtype;
  v_requirement public.project_requirements%rowtype;
  v_placement public.placements%rowtype;
  v_role text;
  v_change_id uuid;
  v_new_end date;
  v_effective_date date;
begin
  if p_change_type not in ('extension', 'schedule_change') then
    raise exception using errcode = '22023', message = 'Choose a valid placement change type.';
  end if;
  if p_proposed_terms is null or jsonb_typeof(p_proposed_terms) <> 'object' then
    raise exception using errcode = '22023', message = 'Proposed terms are required.';
  end if;

  select requirement.project_id, placement.project_requirement_id
  into v_project_id, v_requirement_id
  from public.placements placement
  join public.project_requirements requirement
    on requirement.id = placement.project_requirement_id
  where placement.id = p_placement_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Placement not found.';
  end if;

  select project.* into v_project
  from public.projects project where project.id = v_project_id for update;
  select requirement.* into v_requirement
  from public.project_requirements requirement
  where requirement.id = v_requirement_id and requirement.project_id = v_project.id
  for update;
  select placement.* into v_placement
  from public.placements placement
  where placement.id = p_placement_id
    and placement.project_requirement_id = v_requirement.id
  for update;

  select membership.role into v_role
  from public.company_memberships membership
  where membership.company_id = v_project.company_id
    and membership.user_id = p_actor_user_id
    and membership.status = 'active'
    and membership.role in ('administrator', 'manager');

  if v_role is null then
    raise exception using errcode = '42501', message = 'Company cannot change this placement.';
  end if;
  if v_placement.status not in ('upcoming', 'active') then
    raise exception using errcode = 'P0003', message = 'This placement can no longer be changed.';
  end if;

  if p_change_type = 'extension' then
    if v_placement.scheduled_end_date is not null
      or v_placement.scheduled_end_type is not null then
      raise exception using
        errcode = 'P0003',
        message = 'A placement with a scheduled end cannot be extended.';
    end if;
    if v_placement.current_no_fixed_end_date
      or v_placement.current_estimated_end_date is null then
      raise exception using errcode = '22023', message = 'An open-ended placement cannot be extended.';
    end if;
    begin
      v_new_end := nullif(p_proposed_terms->>'estimated_end_date', '')::date;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'The proposed end date is invalid.';
    end;
    if v_new_end is null or v_new_end <= v_placement.current_estimated_end_date then
      raise exception using errcode = '22023', message = 'The proposed end date must extend the placement.';
    end if;
    if nullif(p_proposed_terms->>'day_rate', '') is not null
      and (p_proposed_terms->>'day_rate')::numeric <= 0 then
      raise exception using errcode = '22023', message = 'The proposed day rate is invalid.';
    end if;
    v_effective_date := v_placement.current_estimated_end_date + 1;
  else
    v_effective_date := p_effective_date;
    if v_effective_date is null or v_effective_date < current_date then
      raise exception using errcode = '22023', message = 'Choose a valid effective date.';
    end if;
    if not v_placement.current_no_fixed_end_date
      and v_placement.current_estimated_end_date is not null
      and v_effective_date > v_placement.current_estimated_end_date then
      raise exception using errcode = '22023', message = 'The change cannot take effect after the placement end date.';
    end if;
    if v_placement.scheduled_end_date is not null
      and v_effective_date > v_placement.scheduled_end_date then
      raise exception using errcode = '22023', message = 'The change cannot take effect after the scheduled end date.';
    end if;
    begin
      perform nullif(p_proposed_terms->>'shift_start_time', '')::time;
      perform nullif(p_proposed_terms->>'shift_finish_time', '')::time;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'The proposed shift times are invalid.';
    end;
    if nullif(p_proposed_terms->>'shift_start_time', '') is null
      or nullif(p_proposed_terms->>'shift_finish_time', '') is null then
      raise exception using errcode = '22023', message = 'Proposed shift times are required.';
    end if;
    if nullif(p_proposed_terms->>'day_rate', '') is not null
      and (p_proposed_terms->>'day_rate')::numeric <= 0 then
      raise exception using errcode = '22023', message = 'The proposed day rate is invalid.';
    end if;
  end if;

  insert into public.placement_change_offers (
    placement_id,
    change_type,
    proposed_terms,
    effective_date,
    expires_at,
    created_by_user_id
  ) values (
    v_placement.id,
    p_change_type,
    p_proposed_terms,
    v_effective_date,
    now() + interval '7 days',
    p_actor_user_id
  ) returning id into v_change_id;

  insert into public.placement_lifecycle_events (
    placement_id,
    event_type,
    initiated_by_user_id,
    initiated_by_type,
    initiated_by_role,
    reason_code,
    requested_at,
    effective_at,
    metadata,
    idempotency_key
  ) values (
    v_placement.id,
    'change_proposed',
    p_actor_user_id,
    'company',
    v_role,
    p_change_type,
    now(),
    v_effective_date::timestamptz,
    jsonb_build_object(
      'change_offer_id', v_change_id,
      'proposed_terms', p_proposed_terms
    ),
    'change_proposed:' || v_change_id
  );

  return v_change_id;
end;
$$;

create or replace function public.respond_placement_change(
  p_actor_user_id uuid,
  p_change_offer_id uuid,
  p_accept boolean,
  p_decline_reason text,
  p_decline_comment text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker_id uuid;
  v_project_id uuid;
  v_requirement_id uuid;
  v_placement_id uuid;
  v_project public.projects%rowtype;
  v_requirement public.project_requirements%rowtype;
  v_placement public.placements%rowtype;
  v_change public.placement_change_offers%rowtype;
  v_new_end date;
  v_applied_at timestamptz;
begin
  select worker.id into v_worker_id
  from public.worker_profiles worker
  where worker.user_id = p_actor_user_id
  for update;

  if v_worker_id is null then
    raise exception using errcode = '42501', message = 'Worker access is required.';
  end if;

  select placement.id, placement.project_requirement_id, requirement.project_id
  into v_placement_id, v_requirement_id, v_project_id
  from public.placement_change_offers change_offer
  join public.placements placement on placement.id = change_offer.placement_id
  join public.project_requirements requirement
    on requirement.id = placement.project_requirement_id
  where change_offer.id = p_change_offer_id
    and placement.worker_id = v_worker_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Placement change not found.';
  end if;

  select project.* into v_project
  from public.projects project where project.id = v_project_id for update;
  select requirement.* into v_requirement
  from public.project_requirements requirement
  where requirement.id = v_requirement_id and requirement.project_id = v_project.id
  for update;
  select placement.* into v_placement
  from public.placements placement
  where placement.id = v_placement_id
    and placement.worker_id = v_worker_id
    and placement.project_requirement_id = v_requirement.id
  for update;
  select change_offer.* into v_change
  from public.placement_change_offers change_offer
  where change_offer.id = p_change_offer_id
    and change_offer.placement_id = v_placement.id
  for update;

  if v_change.status = 'pending' and v_change.expires_at <= now() then
    update public.placement_change_offers
    set status = 'expired'
    where id = v_change.id;
    insert into public.placement_lifecycle_events (
      placement_id, event_type, initiated_by_type, reason_code,
      requested_at, effective_at, metadata, idempotency_key
    ) values (
      v_placement.id, 'change_expired', 'system', v_change.change_type,
      v_change.created_at, now(), jsonb_build_object('change_offer_id', v_change.id),
      'change_expired:' || v_change.id
    ) on conflict (idempotency_key) do nothing;
    return jsonb_build_object('outcome', 'expired', 'change_offer_id', v_change.id);
  end if;

  if v_change.status <> 'pending' then
    return jsonb_build_object(
      'outcome',
      case
        when v_change.status in ('accepted', 'declined')
          then 'already_' || v_change.status
        else v_change.status
      end,
      'change_offer_id',
      v_change.id
    );
  end if;
  if v_placement.status not in ('upcoming', 'active') then
    return jsonb_build_object('outcome', 'placement_ended', 'change_offer_id', v_change.id);
  end if;

  if not coalesce(p_accept, false) then
    update public.placement_change_offers
    set
      status = 'declined',
      responded_at = now(),
      decline_reason = nullif(left(trim(coalesce(p_decline_reason, '')), 200), ''),
      decline_comment = nullif(left(trim(coalesce(p_decline_comment, '')), 1000), '')
    where id = v_change.id;

    insert into public.placement_lifecycle_events (
      placement_id, event_type, initiated_by_user_id, initiated_by_type,
      reason_code, reason_text, requested_at, effective_at, metadata, idempotency_key
    ) values (
      v_placement.id, 'change_declined', p_actor_user_id, 'worker',
      v_change.change_type,
      nullif(left(trim(coalesce(p_decline_reason, '')), 200), ''),
      v_change.created_at, now(), jsonb_build_object('change_offer_id', v_change.id),
      'change_declined:' || v_change.id
    );
    return jsonb_build_object('outcome', 'declined', 'change_offer_id', v_change.id);
  end if;

  if v_change.change_type = 'extension' then
    if v_placement.scheduled_end_date is not null
      or v_placement.scheduled_end_type is not null then
      return jsonb_build_object(
        'outcome',
        'scheduled_end_conflict',
        'change_offer_id',
        v_change.id
      );
    end if;
    v_new_end := nullif(v_change.proposed_terms->>'estimated_end_date', '')::date;
    if v_new_end is null
      or v_placement.current_estimated_end_date is null
      or v_new_end <= v_placement.current_estimated_end_date then
      raise exception using errcode = 'P0003', message = 'The extension terms are no longer valid.';
    end if;
    if exists (
      select 1
      from public.placements other
      where other.worker_id = v_worker_id
        and other.id <> v_placement.id
        and other.status in ('upcoming', 'active')
        and daterange(
          other.current_start_date,
          coalesce(other.current_estimated_end_date, 'infinity'::date),
          '[]'
        ) && daterange(v_placement.current_estimated_end_date + 1, v_new_end, '[]')
    ) then
      return jsonb_build_object('outcome', 'schedule_conflict', 'change_offer_id', v_change.id);
    end if;

    update public.placements
    set
      current_estimated_end_date = v_new_end,
      current_no_fixed_end_date = false,
      current_day_rate = coalesce(
        nullif(v_change.proposed_terms->>'day_rate', '')::numeric,
        current_day_rate
      )
    where id = v_placement.id;
    v_applied_at := now();
  elsif (
    (
      not v_placement.current_no_fixed_end_date
      and v_placement.current_estimated_end_date is not null
      and v_change.effective_date > v_placement.current_estimated_end_date
    )
    or (
      v_placement.scheduled_end_date is not null
      and v_change.effective_date > v_placement.scheduled_end_date
    )
  ) then
    return jsonb_build_object(
      'outcome',
      'scheduled_end_conflict',
      'change_offer_id',
      v_change.id
    );
  elsif v_change.effective_date <= current_date then
    update public.placements
    set
      current_day_rate = coalesce(
        nullif(v_change.proposed_terms->>'day_rate', '')::numeric,
        current_day_rate
      ),
      current_working_days = case
        when jsonb_typeof(v_change.proposed_terms->'working_days') = 'array'
          then array(select jsonb_array_elements_text(v_change.proposed_terms->'working_days'))
        else current_working_days
      end,
      current_shift_start_time = coalesce(
        nullif(v_change.proposed_terms->>'shift_start_time', '')::time,
        current_shift_start_time
      ),
      current_shift_finish_time = coalesce(
        nullif(v_change.proposed_terms->>'shift_finish_time', '')::time,
        current_shift_finish_time
      ),
      current_work_activity = coalesce(
        nullif(v_change.proposed_terms->>'work_activity', ''),
        current_work_activity
      )
    where id = v_placement.id;
    v_applied_at := now();
  end if;

  update public.placement_change_offers
  set status = 'accepted', responded_at = now(), applied_at = v_applied_at
  where id = v_change.id;

  insert into public.placement_lifecycle_events (
    placement_id,
    event_type,
    initiated_by_user_id,
    initiated_by_type,
    reason_code,
    requested_at,
    effective_at,
    metadata,
    idempotency_key
  ) values (
    v_placement.id,
    'change_accepted',
    p_actor_user_id,
    'worker',
    v_change.change_type,
    v_change.created_at,
    coalesce(v_change.effective_date, current_date)::timestamptz,
    jsonb_build_object(
      'change_offer_id', v_change.id,
      'accepted_terms', v_change.proposed_terms,
      'applied_immediately', v_applied_at is not null
    ),
    'change_accepted:' || v_change.id
  );

  return jsonb_build_object(
    'outcome', 'accepted',
    'change_offer_id', v_change.id,
    'placement_id', v_placement.id,
    'applied', v_applied_at is not null
  );
end;
$$;

revoke all on public.placement_lifecycle_events
  from public, anon, authenticated, service_role;
revoke all on public.placement_change_offers
  from public, anon, authenticated, service_role;

grant select (
  id,
  placement_id,
  event_type,
  initiated_by_type,
  initiated_by_role,
  reason_code,
  reason_text,
  requested_at,
  effective_at,
  notice_days,
  notice_classification,
  worker_fault,
  metadata,
  created_at
) on public.placement_lifecycle_events to authenticated;
grant select on public.placement_lifecycle_events to service_role;

grant select (
  id,
  placement_id,
  status,
  change_type,
  proposed_terms,
  effective_date,
  expires_at,
  responded_at,
  applied_at,
  decline_reason,
  decline_comment,
  created_at,
  updated_at
) on public.placement_change_offers to authenticated;
grant select on public.placement_change_offers to service_role;

revoke all on function public.placement_add_working_days(date, integer)
  from public, anon, authenticated;
revoke all on function public.initialize_placement_current_terms()
  from public, anon, authenticated;
revoke all on function public.placement_working_days_between(date, date)
  from public, anon, authenticated;
revoke all on function public.normalize_placement_lifecycle()
  from public, anon, authenticated;
revoke all on function public.release_placement(uuid, uuid, text, date, text, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.request_worker_placement_end(uuid, uuid, date, text, text)
  from public, anon, authenticated;
revoke all on function public.complete_placement(uuid, uuid, date)
  from public, anon, authenticated;
revoke all on function public.propose_placement_change(uuid, uuid, text, date, jsonb)
  from public, anon, authenticated;
revoke all on function public.respond_placement_change(uuid, uuid, boolean, text, text)
  from public, anon, authenticated;

grant execute on function public.normalize_placement_lifecycle()
  to service_role;
grant execute on function public.release_placement(uuid, uuid, text, date, text, text, text, boolean)
  to service_role;
grant execute on function public.request_worker_placement_end(uuid, uuid, date, text, text)
  to service_role;
grant execute on function public.complete_placement(uuid, uuid, date)
  to service_role;
grant execute on function public.propose_placement_change(uuid, uuid, text, date, jsonb)
  to service_role;
grant execute on function public.respond_placement_change(uuid, uuid, boolean, text, text)
  to service_role;

commit;
