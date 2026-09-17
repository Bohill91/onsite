# Early Access and Founding Worker foundation

## Purpose

`/early-access` is a public pre-account funnel for Workers and companies. It is
deliberately separate from Supabase Auth and does not create passwords, Auth
users, Worker profiles or Company memberships.

Workers provide only their name, contact details, primary trade/role and home
area. Companies provide a lightweight contact record, operating area and the
main labour categories they use. The full registration and onboarding flows
remain unchanged.

## Canonical storage

Migration `202609170008_early_access_foundation.sql` creates:

- `early_access_signups` for Worker and Company Early Access records;
- `early_access_referrals` for immutable Worker-to-Worker attribution; and
- `early_access_referral_rewards` for the three potential reward rules.

The browser cannot read or mutate these tables directly. RLS is enabled and
all privileges are revoked from `anon` and `authenticated`. The Node server
uses secret-key-only transactional RPCs. Referral relationships use `RESTRICT`
foreign keys and a protective trigger so historical attribution cannot be
silently deleted or reassigned.

The previous `worker-referrals.js` engine remains as legacy browser-local
compatibility for demo/full-account UI. It is not authoritative for public
Early Access signup, Founding Worker status, referral attribution or potential
rewards.

## Founding Worker and referral semantics

Every Worker who joins through the public Early Access form receives Founding
Worker status and a stable, server-issued `OSW-...` code protected by a unique
database index. A supplied referral code is validated inside the same database
transaction that creates the referred Worker and relationship.

Attribution is one-time and immutable. Self-referral is rejected. Exact retries
reuse the existing Worker and code; mismatched email/mobile retries receive a
generic accepted response without stored PII or a referral code, preventing the
endpoint from becoming an account-enumeration mechanism.

The canonical reward rows represent potential future eligibility only:

- £50 to the referrer after the referred Worker completes 5 paid days;
- another £50 to the referrer after 20 paid days; and
- £25 to the referred Worker after their first 5 paid days.

Early Access signup itself never makes a reward payable. Statuses beyond
`joined` must later be advanced from canonical profile, placement, attendance
and payment evidence. No payout processor or fake eligibility calculation is
included here.

## Source and privacy

Only `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, the landing
path and an optional referral code are accepted. Field lengths are validated
and arbitrary query parameters are ignored. Required privacy acknowledgement
is stored separately from optional marketing consent and its timestamp.

Public responses are explicit projections. They never include other signups,
private notes, invitee identities, database internals, Auth data or service
credentials.

## Abuse protection

The Node route enforces JSON, a 32 KiB request limit, strict field validation,
an off-screen honeypot, idempotent database behaviour and an in-memory
per-client rate limit. The in-memory limiter is appropriate for the current
single-process deployment. A distributed edge limiter or Turnstile remains a
recommended production hardening step when the service runs across multiple
instances or faces sustained abuse.

## Confirmation email boundary

Early Access commits before email is attempted. If `RESEND_API_KEY` and
`EARLY_ACCESS_FROM_EMAIL` are configured, the server sends a confirmation via
Resend and records `sent` or `failed`. Without them it records `skipped`. Email
failure never rolls back a valid signup.

`EARLY_ACCESS_BASE_URL` controls referral links in server responses and email.
The intended production value is `https://joinonsite.uk`; the server defaults
to that origin and never stores a Replit preview origin as the canonical link.
No Brevo or Bitly dependency exists.

## Future full-account conversion

`early_access_signups` contains nullable linkage columns for the future Auth
user, Worker profile or Company. A conversion transaction should set those
links while preserving the Early Access row, original timestamp, Founding
Worker status, referral code, source data and referral relationship. This task
does not create Auth users or implement conversion.

## Deployment

1. Review and apply migration `008` through the normal Supabase migration
   workflow. It is not applied automatically by this repository change.
2. Configure `EARLY_ACCESS_BASE_URL=https://joinonsite.uk`.
3. After Resend DNS is verified, configure `RESEND_API_KEY` and
   `EARLY_ACCESS_FROM_EMAIL` in the server-side secret manager.
4. Never expose `SUPABASE_SECRET_KEY` or `RESEND_API_KEY` to browser code.
