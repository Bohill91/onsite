# Backend Foundation Phase 3A: Marketplace Applications

Phase 3A adds a server-backed worker marketplace boundary and canonical worker
applications. It deliberately stops before offers, placements, agreements, or
attendance are migrated.

## Publication architecture

Workers do not receive rows from `projects` or `project_requirements` directly.
The server reads canonical project data with its server-only Supabase secret and
constructs an explicit allow-listed response in `server-marketplace.js`.

A requirement is worker-visible when:

- its project status is `open` or `active`;
- the requirement has a canonical ID, trade, role, positive quantity, and valid
  advertised worker rate;
- the project has not passed its fixed end date; and
- it matches the authenticated worker's canonical trade when a trade is set.

An open labour request remains visible without a separate manual publication
step, matching the current product behaviour.

The worker response can contain:

- canonical requirement and project IDs;
- company display name, project name, job number, and general location;
- trade, role/specialism, grade, credentials, and work activity;
- required quantity and current Phase 3A vacancy count;
- dates, duration, working days, and shift times;
- worker-facing advertised day rate;
- worker-facing accommodation, overtime, and weekend terms; and
- publication/application availability state.

The response never contains company budget columns, matching preferences,
attendance-manager details, site contacts, exact site addresses or pins,
company memberships, or internal project metadata. Worker-facing pay is derived
on the server and is not accompanied by the source company budget.

## Canonical applications

Migration `202609160004_marketplace_applications.sql` creates
`worker_applications` with:

- UUID `id`;
- canonical `worker_id` and `project_requirement_id` foreign keys;
- `applied` or `withdrawn` status;
- optional worker note and withdrawal reason;
- withdrawal, creation, and update timestamps; and
- a partial unique index preventing more than one active application for the
  same worker and requirement.

Requirements with application history cannot be deleted: the requirement
foreign key uses `ON DELETE RESTRICT`. Because project replacement runs inside
the transactional `save_company_project` RPC, attempting to omit a requirement
that has applications rejects the complete save without changing the project,
its other requirements, or its applications.

Application ownership comes exclusively from the authenticated server
principal. Browser-supplied worker or company IDs are rejected. A worker may
read only their own applications and may only transition their own `applied`
application to `withdrawn`.

RLS permits authenticated workers to select their own rows and active company
members (Administrator, Manager, or Supervisor) to select applications linked
to requirements owned by their company. Mutation grants are reserved for the
trusted server role. Anonymous users have no access.

## Server routes

- `GET /api/jobs`
- `GET /api/jobs/:requirementId`
- `POST /api/jobs/:requirementId/applications`
- `GET /api/applications`
- `PATCH /api/applications/:applicationId`
- `GET /api/company/applications`

All routes require the existing HttpOnly server session. Worker and company
identity, worker ID, company ID, and company role are server-derived.

Company application responses contain only the applicant fields needed for the
current review UI: canonical ID, name, trade, role, grade, experience, general
location, and profile-photo reference. They exclude private minimum day rate,
contact email, phone, auth-user ID, and auth material.

## Frontend compatibility

Authenticated workers load jobs and their applications from the server. The
Job Board uses canonical requirement IDs, and an application remains visible
after reload or local storage clearing because server state is authoritative.

Canonical applications are projected into the legacy `state.applications`
shape with an explicit `canonicalMarketplaceApplication` marker. The legacy
`interested` label is retained only as a compatibility presentation value;
`canonicalStatus` remains `applied` or `withdrawn`. Local state never writes
canonical ownership or status back to the server.

Authenticated companies load applications after canonical projects load. The
Project Labour tab displays active worker applications separately from the
existing offer pipeline. This does not create or imply an offer.

## Privacy and security guarantees

- The Supabase secret key remains server-only.
- Workers cannot use the company project-management API.
- Company budget and matching fields are not serialized to workers.
- Companies cannot query another company's applications through the service or
  RLS policy.
- Worker private minimum rates and auth/contact material are not serialized to
  companies.
- Clearing or editing local storage cannot change canonical application
  ownership, status, or company visibility.

## Phase boundary and current limitations

The following remain browser-local or deferred:

- offers, offer expiry, offer improvement, and company decisions;
- placement slots and confirmed placements;
- agreements, attendance, timesheets, invoices, disputes, and notifications;
- planned absences and complete server-side matching/capacity evaluation;
- worker credentials beyond the canonical profile fields currently available;
- real vacancy reduction from confirmed placements.

The worker-profile foreign key continues to use `ON DELETE CASCADE` to preserve
the existing Phase 1 auth-registration rollback behaviour. OnSite does not yet
have a defined production account-deletion and marketplace-history retention
policy or an anonymised worker record. That policy must be decided before
launch; retaining application history will require an explicit anonymisation or
tombstone design rather than simply changing this foreign key in isolation.

Until placements are canonical, `vacancies` equals the canonical requirement's
`workers_required` quantity. Phase 3B should add canonical offers and placements,
then derive vacancies from placement state while retaining application IDs as
the `application -> offer -> placement` chain root.

## Live setup

Apply this migration in Supabase after review:

`supabase/migrations/202609160004_marketplace_applications.sql`

No credentials belong in source control. The migration is not applied by the
application or by the Phase 3A implementation task.
