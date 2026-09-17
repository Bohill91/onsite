# Backend Phase 4: Canonical Attendance and QR

Phase 4 moves authenticated production attendance from browser storage to
Supabase/Postgres. Every attendance day is anchored to a canonical placement and
is recorded in the project's IANA timezone. The migration is forward-only and
has not been applied to a live Supabase project.

## Canonical model

`attendance_days` contains one row per `placement_id` and work date. It stores
the resolved project, expected state, status, observed arrival, server capture
time, capture method, shift and working-day snapshots, project timezone
snapshot, minutes late, optional GPS evidence, lateness reason/review state and
weekly-finalisation references. A validation trigger rejects a project or weekly
submission that does not match the placement and work date.

`attendance_events` is the append-only audit trail. It records the event type,
placement, actor, server-recorded time, effective time, allow-listed metadata
and an idempotency key. Update and delete triggers reject event mutation.

`attendance_week_submissions` stores the single canonical review state for each
project/Monday week. `project_attendance_managers` stores one project-scoped
manager assignment or pending invite. `attendance_site_qr_tokens` and
`worker_attendance_qr_tokens` store only SHA-256 capability hashes and expiry or
revocation state.

The `projects.timezone` field uses an IANA name validated against PostgreSQL's
timezone catalogue. Existing and UK projects default to `Europe/London`. The
current project editor does not expose non-UK timezone selection yet; ordinary
project edits preserve the canonical database value.

## Attendance Manager authority

Attendance Manager is project-scoped. An active assignment can read and manage
that project's daily attendance, review lateness reasons, scan a worker QR and
submit the week. It grants no company membership, company-wide authority,
payroll access or access to another project.

Company roles remain server-derived:

- Administrator can read/manage attendance, assign the Attendance Manager,
  submit, reopen and correct.
- Manager can read and manage unresolved attendance.
- Supervisor can read and perform the worker-QR scan flow, but cannot manually
  resolve or submit attendance.
- Attendance Manager can manage and submit only their assigned project.

Pending invite details can be stored, but email transport and invite acceptance
are intentionally deferred. Until a pending assignment is linked to an auth
user, it grants no authority.

## Expected work days

Before attendance operations, the server normalises due placement lifecycle
changes. An expected day then requires an `upcoming` or `active` placement,
`current_start_date` reached, no passed `scheduled_end_date`, no passed fixed
current end date, and the work date present in `current_working_days`.

Accepted Phase 3C schedule changes are resolved by each attendance work date,
including changes accepted now for later in the same week. Until a row is
observed, manually resolved or finalised, rematerialisation can refresh its
expected state and shift snapshot from those accepted terms. Once attendance is
captured or submitted, its snapshot is retained as history. A scheduled release
remains eligible until its canonical end becomes effective. Released, completed
or cancelled placements do not create future expected days.

## Daily site QR

An authorised company user or Attendance Manager asks the server for a project
work-date QR. The server creates 256 bits of cryptographic randomness, stores
only its SHA-256 hash, constrains expiry to the end of that project-local day,
and returns the raw capability plus a standards-compliant SVG only in that issue
response. Regeneration revokes active codes for the same project/date.

A worker scan authenticates the worker, resolves the capability server-side,
derives project/date from the token, validates an eligible canonical placement,
uses server receipt time, calculates status and minutes late, and atomically
upserts the unique placement/date row. Repeated scans do not create another day
or duplicate audit event. A code from another project, a different date, an
expired code or a revoked code fails closed.

The browser keeps the issued raw code only in memory. It is not added to the
local attendance store. The existing A4 sign-in sheet renders the real QR SVG.
The worker scan modal uses browser camera QR detection where available and a
manual capability-entry fallback where it is not.

## Worker QR and supervisor scan

An authenticated worker can request a short-lived opaque presentation QR. The
server revokes the worker's previous active presentation token and caps the new
token at ten minutes. The QR contains no worker ID, email, phone, tax data or
other PII.

An authorised project user scans the worker QR. The server resolves the worker
and eligible placement, records actual server capture time separately from an
optional observed arrival, rejects future or wrong-work-date observations, and
audits the actor. This prevents a delayed supervisor scan from automatically
making the worker late. Concurrent worker/site and supervisor/worker scans keep
the earliest valid effective arrival and its matching capture evidence.

## Status and timing rules

Canonical daily statuses are `needs_review`, `on_time`, `late`, `no_show`,
`approved_absence`, `non_worker_fault` and `sent_home`. Capture methods are
`expected_day`, `worker_site_qr`, `supervisor_worker_qr`,
`attendance_manager_manual` and `administrator_override`.

The existing OnSite ten-minute grace period is now centralised in
`attendance-rules.js` and enforced again inside the database RPCs. Arrival is
calculated against the snapshotted shift start in the project timezone, including
DST. The browser cannot assert On time or Late for a QR scan.

No scan never becomes a No show automatically. Materialised expected days remain
Needs review until an authorised human resolves them. No show,
`non_worker_fault` and `approved_absence` require a reason. Site-not-ready,
project delay, stand-down, access and QR/technical failures can therefore remain
explicit, non-penalising facts instead of worker No shows.

## Lateness reasons and policy boundary

Late workers can submit one of the existing categories: Public transport
disruption, Road traffic, Vehicle breakdown, Family emergency, Medical
appointment or Other. Strike disruption is included as the intended additional
category. Submitting or reviewing a reason never changes the original arrival.
An authorised reviewer can record `approved_exception` or `rejected`; both
actions are audited.

The current product does not encode an exact ordinary monthly allowance or a
separate strike allowance/cap. `LATE_EXCEPTION_POLICY` records that explicit
`product_policy_required` state. Phase 4 does not invent a threshold or silently
score exceptions. A submitted week must be reopened before its lateness reason
or review can change.

## Weekly submission and corrections

Submitting a Monday-based project week materialises all expected days, locks the
project and placements in deterministic order, and fails while any expected day
is Needs review. A successful transaction creates or updates the one weekly
submission, stamps every expected day with its submission/finalisation actor and
time, and appends `week_submitted` events.

Only an Administrator can reopen a submitted week, and a reason is mandatory.
Reopening retains daily rows, capture events and the submission identity, clears
the daily finalisation lock and appends `week_reopened` history. Later manual
changes require an Administrator correction reason and store previous/new status
and timing, reason, actor and timestamp as an append-only event. Submitted rows
reject scans and edits until reopened.

## Reliability boundary

Only finalised canonical attendance produces a reliability input. The allow-
listed input states whether a final day was On time, Late, No show,
non-penalising, or an approved lateness exception. Placement release, offer
decline, application history or company opinion do not create an attendance
penalty.

The browser's historical reliability presentation remains for compatibility.
Its category thresholds and recency weighting have not been promoted to a
canonical scoring engine because the requested 30-day/category policy is not
fully defined in existing code. A later phase should consume these canonical
inputs after that product policy is approved.

## API

All routes use the Phase 1 HttpOnly session and server principal:

- `GET /api/attendance`
- `POST /api/attendance/scan`
- `POST /api/attendance/worker-qr`
- `POST /api/attendance/worker-qr/scan`
- `POST /api/attendance/:attendanceId/lateness-reason`
- `GET /api/projects/:projectId/attendance?weekStart=YYYY-MM-DD`
- `POST /api/projects/:projectId/attendance/qr`
- `POST /api/projects/:projectId/attendance/mark`
- `POST /api/projects/:projectId/attendance/:attendanceId/lateness-review`
- `POST /api/projects/:projectId/attendance/week/submit`
- `POST /api/projects/:projectId/attendance/week/reopen`
- `POST /api/projects/:projectId/attendance-manager`

Browser-supplied company, worker, actor, role and finaliser claims are rejected.
Responses use explicit projections and do not include private minimum rates,
auth internals, company private notes or token hashes.

## RLS, privacy and retention

RLS is enabled on all six new tables. Authenticated direct access is read-only
and scoped to a worker's own attendance or an authorised project. Token tables
have no authenticated read policy. All mutations run through server-only RPCs
using `SUPABASE_SECRET_KEY`; authenticated users receive no broad table writes
or RPC execute grants. Every security-definer function has a fixed search path.

Exact optional GPS evidence is returned only to the worker whose record it is or
an authorised project attendance user. GPS is bounded but is not mandatory or
the sole attendance authority. No photo evidence subsystem was added because
the current product has no canonical attendance-photo flow; future evidence
must use the existing protected document/file architecture.

Attendance rows and events use history-preserving `ON DELETE RESTRICT` links to
projects, placements and submissions. Ephemeral worker QR capabilities alone
use cascade deletion with the worker profile. The wider worker-history
retention/anonymisation decision remains a pre-launch policy dependency.

## Frontend compatibility

Authenticated worker and company views load canonical attendance and derive the
existing UI-compatible objects in memory. Canonical rows are explicitly
excluded from `onsite_attendance_v1` persistence. Clearing local storage does
not delete canonical attendance. Deliberately isolated demo/non-authenticated
flows continue using local data and the legacy visual QR glyph.

Existing browser planned absences are not imported or treated as canonical. An
authorised reviewer can record an approved absence, and an unscanned day stays
Needs review, so missing canonical holiday data cannot create an automatic
penalty.

The authenticated worker UI submits a lateness reason canonically once the
worker has a Late attendance day. The separate proactive pre-shift ETA/reporting
workflow remains compatibility-only until OnSite has a canonical notification
or shift-exception model; it is not used as final attendance or reliability
authority.

## Future boundary

Phase 4 does not implement payroll, invoices, CIS/VAT, payment approval,
timesheet payment, disputes, advanced geofencing, facial recognition or
biometrics. Weekly-finalised daily rows are the durable input boundary for a
future timesheet and payment phase.

## Migration review

Review and then apply, separately from this code deployment:

`supabase/migrations/202609160007_attendance_foundation.sql`

The migration is wrapped in `begin`/`commit`, adds no live credentials, and must
not be applied until its schema, RPC, RLS, grants and retention behavior have
been approved against the target Supabase project.
