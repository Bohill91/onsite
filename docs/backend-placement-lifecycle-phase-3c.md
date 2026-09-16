# Backend Foundation Phase 3C: Placement Lifecycle

Phase 3C makes post-acceptance placement lifecycle changes canonical. It builds
on the immutable offer and placement snapshots from Phase 3B and deliberately
does not migrate attendance, payroll, invoicing, timesheets, disputes, or
reliability scoring.

## Current product behavior audited

The existing product supports company release and stand-down reasons, an
immediate-release option, worker notice, extension requests, material shift
change offers, project-transfer offers, and replacement tasks. Those browser
records previously mutated project or booking objects directly. Phase 3C keeps
their terminology and controls, but authenticated sessions now send supported
lifecycle actions to the server. Demo and legacy sessions retain the local
fallback.

## Canonical model

`placements` keeps the original Phase 3B `agreed_*` snapshot unchanged. New
`current_*` columns contain the effective commercial and schedule terms after
accepted changes. An insert trigger initializes them from `agreed_*`, including
placements created by the existing Phase 3B offer-acceptance RPC.

`placement_lifecycle_events` is the append-only audit trail. It records actor
context, reason, requested/effective dates, notice facts, narrowly scoped
metadata, and optional company-only notes. Both placement and actor foreign
keys preserve history: placements use `ON DELETE RESTRICT`; deleted auth actors
become null without deleting the event.

`placement_change_offers` stores worker decisions for `extension` and
`schedule_change`. A placement may have one pending change of each type. The
accepted or declined row remains historical.

## Status and capacity

Placements use `upcoming`, `active`, `completed`, `released`, and `cancelled`.
Only `upcoming` and `active` consume requirement capacity. Lazy server-side
normalization activates placements at their start date, completes fixed-end
placements after their end date, applies scheduled ends, expires unanswered
change offers, and applies accepted future schedule changes. Terminal
placements never reactivate.

No-fixed-end placements are not automatically completed. Company confirmation
is available through the lifecycle service when completion is known.

## Release, stand-down, and worker end

Administrator and Manager may release an own-company placement. Supervisor is
read-only. Standard release requires at least five working days; the helper
excludes weekends. Pre-start stand-down and site-not-ready actions retain the
number of calendar days before start and classify whether the action occurred
within three days. Immediate release records the selected reason and company
assertion only.

Release does not write attendance or reliability evidence and does not
calculate notice or stand-down pay. It stores the dates and classifications a
later commercial engine will need.

The existing worker notice flow is supported through a worker-owned placement
end RPC. The worker can act only on their own placement and cannot submit a
past effective date. The company cannot impersonate this action.

## Extensions and schedule changes

Company proposals are canonical UUID records with a seven-day response window.
Worker acceptance and decline run through one transaction. Acceptance locks the
worker, project, requirement, placement, and change record in the documented
order, revalidates state and overlap, appends audit history, updates effective
terms, and marks the proposal accepted. Any failure rolls the transaction back.

Extensions update only `current_estimated_end_date` and an accepted revised
current rate. Schedule changes update only effective shift, working-day, work
activity, and rate fields. Original `agreed_*` terms remain recoverable.
Accepted future schedule changes are applied lazily on or after their effective
date. Repeated accept/decline attempts return explicit conflict outcomes.

## Transfer and replacement

Project transfer remains a normal new canonical offer against the target
requirement. Acceptance therefore creates a new placement and never rewrites
the source placement's `project_requirement_id`. Canonical overlap checks
prevent acceptance while the source commitment still conflicts. Transfer
provenance is still a compatibility record and is not yet a dedicated backend
relationship.

A released placement stops consuming capacity. The existing replacement prompt
may then create a normal canonical offer; acceptance creates a new placement.
The former placement is never reassigned to another worker. Replacement task
coordination remains browser-local in this phase.

## Roles, RLS, and privacy

New tables have RLS. Workers can select only lifecycle and change rows linked
to their worker profile. Active company members can select only records linked
to their company's requirements. Anonymous access is absent. Authenticated
users have column-limited reads and no direct writes; only the server secret
invokes fixed-search-path `SECURITY DEFINER` RPCs.

Worker responses exclude private company notes, membership data, budgets, and
actor auth IDs. Company projections include only the existing safe roster
summary and exclude worker private minimum rate, auth identity, passwords, and
tokens.

## Frontend compatibility

Canonical placements are projected into existing placement slots, release and
notice summaries, extension state, and shift-change cards. Worker sessions also
receive an in-memory project/booking representation for active and upcoming
canonical placements. Every derived object retains its canonical placement or
change ID and is removed before localStorage persistence. Clearing localStorage
therefore cannot remove or replace canonical lifecycle history.

## Boundaries and remaining decisions

Attendance, QR scans, lateness, no-shows, reliability, timesheets, payroll,
CIS, invoices, disputes, notice-pay calculations, and legal agreement PDFs are
unchanged and non-canonical in this phase. Lifecycle records expose stable
`placement_id` references for those later migrations.

Worker-account deletion and historical anonymisation remain an unresolved
pre-launch retention decision. Phase 3B placements and Phase 3C history use
restrictive foreign keys; no company deletion or worker anonymisation workflow
is added here. Transfer provenance and replacement task state also remain
transitional compatibility concerns.

## Live setup

After review, manually apply:

`supabase/migrations/202609160006_placement_lifecycle.sql`

The application does not apply this migration automatically. No Supabase
credentials are required for local tests and none belong in source control.
