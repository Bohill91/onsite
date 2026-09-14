# Backend authentication foundation: Phase 1

## Scope

Phase 1 moves account authentication and canonical identity to Supabase without
migrating the rest of OnSite's browser-local application state.

Supabase Auth owns credentials. Postgres owns worker profiles, companies and
company memberships. The browser receives a normalized compatibility principal
whose worker ID, company ID and company role were resolved by the server.

## Setup

1. Create a Supabase project.
2. Apply `supabase/migrations/202609140001_identity_foundation.sql` with the
   Supabase CLI or SQL migration workflow.
3. Copy the names from `.env.example` into the deployment's secret manager.
4. Set `SUPABASE_AUTH_REDIRECT_URL` to the deployed OnSite root URL.
5. Configure the same URL in Supabase Auth's allowed redirect URLs.

Required environment variables:

- `SUPABASE_URL`: Supabase project URL.
- `SUPABASE_ANON_KEY`: public anon key, used only by the Node server in Phase 1.
- `SUPABASE_SERVICE_ROLE_KEY`: privileged server-only key. Never expose it in
  browser JavaScript or commit it.
- `SUPABASE_AUTH_REDIRECT_URL`: destination for password-recovery links.

## Session model

The Node server calls Supabase Auth and writes access/refresh tokens to
`HttpOnly`, `SameSite=Lax` cookies. Production/HTTPS requests also receive the
`Secure` attribute. `/api/auth/session` validates or refreshes those tokens,
then resolves the current canonical principal.

The compatibility principal keeps existing renderers working. Its authority
fields are fixed to the server response:

- workers use `worker_profiles.id` as `id` and `workerId`;
- companies use `companies.id` as `id` and `companyId`;
- company permissions use the active `company_memberships.role`;
- the Supabase Auth user ID is retained separately as `authUserId`.

`onsite_auth_v1` is removed on startup and is not written by the new auth flow.
Legacy `onsite_users_v1` records cannot authenticate a user and are sanitized
to remove old password properties.

## Privacy and authorization

Row-level security permits a worker to select and update only their own worker
profile. Companies cannot query worker profiles, so private minimum-day-rate
data is not exposed to them. Authenticated users may resolve only their own
memberships and companies for which they have an active membership.

Memberships are not client-editable. Worker column grants exclude canonical
identity, Founding Worker and account-status fields. Canonical registration is
performed by service-role-only transactional database functions.

## Deliberate Phase 1 boundaries

- Legacy local accounts are not uploaded or recreated from old passwords.
- Projects, requirements, slots, offers, agreements, attendance, invoices,
  notifications, referrals/rewards, Request Labour drafts and AI history remain
  browser-local.
- Existing document-file capability tokens and storage remain unchanged.
- The AI endpoint remains unprotected in Phase 1 to avoid coupling its current
  local-context workflow to the identity migration before server authorization
  is applied consistently.
- Worker profile photos remain in the existing local prototype storage until a
  later object-storage migration; the canonical table is ready for a reference.
- Secure account deletion needs a separate retention/deletion workflow. The UI
  directs server-authenticated workers to support instead of pretending a local
  deletion revoked their account.
