# Backend Foundation Phase 2: Company Projects

Phase 2 moves company projects and their labour requirements from browser-only
state to canonical Supabase/Postgres records. It builds on the Phase 1 server
session and identity model.

## Canonical ownership

`projects.company_id` is assigned by the server from the authenticated user's
single active `company_memberships` row. The project API ignores browser-sent
company names, company IDs, roles, creator IDs, timestamps and canonical IDs.

An active Administrator or Manager may create and update projects. An active
Supervisor may read projects owned by their company but cannot mutate them.
Workers cannot use the company project-management API.

## Data responsibilities

`projects` stores information shared by the whole project: job number, project
name, assignment type, location and site details, dates and shift pattern,
contacts, attendance responsibility, arrival instructions, photo metadata and
project status.

`project_requirements` stores independently addressable labour demand: trade,
role/specialism, grade, credentials, work activity, quantity, private company
budget range, working pattern, overtime, accommodation, labour schedule and
matching preferences. A project can contain any number of requirements.

Photo and document binaries are not moved by this phase. Project photo metadata
may reference existing storage, while the existing document architecture remains
unchanged.

## API

All routes require the Phase 1 HttpOnly session:

- `GET /api/projects` lists projects owned by the authenticated company.
- `POST /api/projects` creates a project and its requirements atomically.
- `GET /api/projects/:id` returns one owned project.
- `PATCH /api/projects/:id` updates an owned project and optionally replaces its
  requirement set atomically.

Cross-company reads and mutations return the same not-found response. The API
uses `SUPABASE_SECRET_KEY` only on the server and passes the authenticated auth
user ID to the restricted `save_company_project` database function.

## Database security

The migration enables RLS on both tables. Authenticated direct reads require an
active membership in the owning company. Direct worker reads are denied because
workers do not have a company membership. Mutations require Administrator or
Manager membership and are performed by the server-only function; the browser
does not receive table write grants. `anon` receives no access.

Company labour budget values remain inside the company-management records. No
worker/public projection is introduced in this phase.

## Frontend compatibility bridge

Authenticated company pages load canonical projects from `/api/projects`.
Returned records are projected into `state.jobs` with the canonical project and
requirement UUIDs so the existing matching, attendance, offer, placement and
document modules can continue operating without a second project identity.

Legacy local-only projects are not uploaded automatically and are not treated as
owned company projects in an authenticated company session. Local compatibility
fields for the not-yet-migrated modules are preserved when a canonical project is
refreshed. Clearing local storage therefore removes those local-only module
records, but the canonical project and requirement data reload from the server.

## Apply the migration

After review, apply this forward migration to the target Supabase project:

`supabase/migrations/202609160003_projects_foundation.sql`

The migration is transactional and depends on the Phase 1 identity migrations.
Do not edit or reapply the earlier Phase 1 migrations. Configure Supabase using
the server-only environment variables documented in
`docs/backend-auth-phase-1.md`; never commit real keys.

## Intentionally deferred

The following remain browser/local-state systems in Phase 2: worker job-board
publication, matching, applications, offers, placement slots, agreements,
attendance, pre-start/document ACLs, notifications, marketplace event history,
referrals, invoices and payments. The server project projection is a temporary
compatibility boundary, not production persistence for those modules.

Phase 3 should introduce a worker-safe published requirement projection and move
offer/application/placement lifecycle state to server-enforced persistence. It
must not grant workers direct access to private project records or company
budgets.
