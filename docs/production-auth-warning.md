# Production authentication status

OnSite Backend Foundation Phase 1 uses Supabase Auth for ordinary worker and
company authentication. Access and refresh tokens are held in secure,
same-site, HttpOnly server cookies. New registrations no longer write passwords
or authoritative principals to browser storage.

Deployments must apply the identity migration and configure the environment
variables documented in `backend-auth-phase-1.md`. Without that configuration,
the static application still starts but real registration and login return an
explicit `AUTH_NOT_CONFIGURED` response.

New deployments must configure `SUPABASE_PUBLISHABLE_KEY` for ordinary Auth
operations and `SUPABASE_SECRET_KEY` for trusted server operations. The secret
key bypasses Row Level Security, so it must remain in the server-side deployment
secret manager and must never be committed or exposed to the browser.

Legacy `onsite_users_v1` data is not an authentication source. On startup the
compatibility list is retained for unmigrated UI data but any old password
properties are removed. Projects, offers, attendance, payments and other
marketplace data remain browser-local pending later backend phases.
