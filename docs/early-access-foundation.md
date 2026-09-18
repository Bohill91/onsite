# Early Access and referral programme foundation

## Purpose

`/early-access` is a public pre-account funnel for Workers and companies. It is
deliberately separate from Supabase Auth and does not create passwords, Auth
users, Worker profiles or Company memberships.

Workers provide only their name, contact details, primary trade/role and home
area. Companies provide a lightweight contact record, operating area and the
main labour categories they use. The full registration and onboarding flows
remain unchanged.

## Canonical storage

Migration `202609170008_early_access_foundation.sql` creates the original
worker foundation. Append-only migration
`202609180009_canonical_referral_programmes.sql` preserves those records and
extends the model with:

- `early_access_signups` for Worker and Company Early Access records;
- `early_access_referrals` for immutable, programme-typed attribution;
- `early_access_referral_rewards` for cash and account-credit entitlements; and
- `early_access_referral_credit_ledger` as the locked-down future integration
  boundary for applying contractor credit to eligible OnSite charges.

The browser cannot read or mutate these tables directly. RLS is enabled and
all privileges are revoked from `anon` and `authenticated`. The Node server
uses secret-key-only transactional RPCs. Referral relationships use `RESTRICT`
foreign keys and a protective trigger so historical attribution cannot be
silently deleted or reassigned.

The previous `worker-referrals.js` engine remains as legacy browser-local
compatibility for demo/full-account UI. It is not authoritative for public
Early Access signup, referral attribution, verification, entitlement or payout.

## Sub-contractor referral programme

Every sub-contractor who joins through the public Early Access form receives a
stable, server-issued `OSW-...` code protected by a unique database index. A
supplied referral code is validated inside the same database transaction that
creates the referred sub-contractor and relationship. OSW codes can only
attribute worker-to-worker referrals.

Attribution is one-time and immutable. Self-referral is rejected. Exact retries
reuse the existing Worker and code; mismatched email/mobile retries receive a
generic accepted response without stored PII or a referral code, preventing the
endpoint from becoming an account-enumeration mechanism.

The standard cash entitlements are:

- £50 to the referrer after the referred Worker completes 5 paid days;
- another £50 to the referrer after 20 paid days; and
- £25 to the referred Worker after their first 5 paid days.

A referrer does not need to accept work, hold a placement, be available or
complete any personal paid days. A legitimate CIS sub-contractor may maintain
an OnSite account entirely for referrals. Account setup and CIS verification
are required before cash becomes payable. Registration alone earns nothing.

Entitlements follow `potential` → `earned_pending_verification` → `payable` →
`paid`, with `void` available for invalidated entitlements. The database rejects
skipped or regressive canonical transitions, requires trusted evidence before
earned/payable/settled states, requires verification before payable, and permits
`paid` only for cash rewards. A retained legacy `credited` state is restricted
to verified account-credit rewards and is terminal. Reaching a milestone before
CIS verification retains the entitlement in
`earned_pending_verification`; this repository does not make payments or mark
anything paid.

## Contractor referral programme

Each company signup receives a stable, server-issued `OSC-...` code. OSC codes
can only attribute company-to-company referrals. The standard non-cash account
credit entitlements are:

- £100 for the referred contractor towards its first qualifying labour booking;
- £100 for the referring contractor after 5 qualifying paid labour days; and
- another £150 for the referring contractor after 20 qualifying paid labour
  days, for a maximum standard referrer credit of £250.

Contractor referral credit is represented in pence, remains distinct from
worker cash rewards, is non-withdrawable and non-transferable, and may
eventually be applied only against eligible OnSite charges without creating a
negative invoice. A verified contractor account is required before earned
 credit can be applied. The credit ledger has no browser or authenticated-user
 write grant, is append-only, and validates the reward programme, account-credit
 benefit, company beneficiary, authorised amount, posting direction and reversal
 reference. Invoice redemption is intentionally not implemented yet, so the
 ledger remains write-locked until that future integration is designed.

OSW and OSC attribution cannot cross programmes. Attribution is immutable, one
referrer may be attached to a signup, first valid attribution wins, duplicate
signup does not create another identity, and self-referral is rejected.

## Qualifying paid-day boundary

A qualifying paid day is not an attendance event. It must ultimately be a
canonical OnSite workday that has reached the approved/paid state through the
future timesheet and payment system. For contractor milestones, one worker
completing five qualifying days and five workers completing one qualifying day
each both equal five paid labour days.

Migration 009 stores idempotent entitlement rows and a nullable unique evidence
key for the future payment integration. Non-empty evidence is required before
an entitlement can become earned, payable, paid or credited, but the migration
does not pretend to validate that evidence. No signup, QR scan or attendance
record advances a cash reward or company credit. The future canonical payment
service must supply trusted paid-work evidence, promote earned entitlements only
after the required CIS/company verification, and write contractor credit ledger
entries through server authority.

## Source and privacy

Only `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, the landing
path and an optional programme-compatible referral code are accepted. Field
lengths are validated and arbitrary query parameters are ignored. Required
privacy acknowledgement, the programme-specific CIS/company acknowledgement,
and optional marketing consent are stored independently. Transactional signup
confirmation remains independent of marketing consent.

Public responses are explicit projections. They never include other signups,
private notes, invitee identities, database internals, Auth data or service
credentials.

## Abuse protection

The Node route enforces JSON, a 32 KiB request limit, strict field validation,
an off-screen honeypot, idempotent database behaviour and an in-memory
per-client rate limit. The limiter retains at most 10,000 active client buckets,
reclaims expired buckets at capacity and fails closed for new clients while all
retained buckets are active. It is appropriate for the current single-process
deployment. A distributed edge limiter or Turnstile remains a recommended
production hardening step when the service runs across multiple instances or
faces sustained abuse.

By default the limiter identifies clients only from the transport peer address
and ignores forwarding headers. `EARLY_ACCESS_TRUST_PROXY=true` enables use of
the rightmost valid `X-Forwarded-For` address. Enable it only behind a trusted
production reverse proxy that sanitises or appends that header as expected;
never enable it for direct, untrusted client connections.

## Confirmation email boundary

Early Access commits before email is attempted. If `RESEND_API_KEY` and
`EARLY_ACCESS_FROM_EMAIL` are configured, the server sends a confirmation via
Resend and records `sent` or `failed`. Without them it records `skipped`. Email
failure never rolls back a valid signup.

`EARLY_ACCESS_BASE_URL` controls referral links in server responses and email.
The intended production value is `https://joinonsite.uk`; the server defaults
to that origin and never stores a Replit preview origin as the canonical link.
No Brevo or Bitly dependency exists.

## Canonical trade and role taxonomy

OnSite uses one shared trade taxonomy for Early Access, worker registration,
Request Labour, job requirements and matching. Generic site-wide management
belongs under **Site Management & Supervision**. Management and supervision
for a specific package belongs under that package instead: for example,
Electrical Manager and Electrical Supervisor are Electrical roles, while
Mechanical Manager and Mechanical Supervisor are Mechanical Pipework roles.

Trade and role keys are stable machine-readable identifiers and must be kept
when labels are refined. Existing display-value aliases may be accepted for
backwards compatibility, but new UI selections and persisted payloads should
use the canonical trade and role keys. A role name containing “Manager” or
“Supervisor” never creates cross-trade matching by itself; matching retains the
trade key.

## Future full-account conversion

`early_access_signups` contains nullable linkage columns for the future Auth
user, Worker profile or Company. A conversion transaction should set those
links while preserving the Early Access row, original timestamp, referral
code, programme acknowledgement, source data and referral relationship. This
task does not create Auth users or implement conversion.

## Deployment

1. Review and apply migrations `008` and then `009` through the normal Supabase
   migration workflow. Neither migration is applied automatically by this
   repository change.
2. Configure `EARLY_ACCESS_BASE_URL=https://joinonsite.uk`.
3. After Resend DNS is verified, configure `RESEND_API_KEY` and
   `EARLY_ACCESS_FROM_EMAIL` in the server-side secret manager.
4. Never expose `SUPABASE_SECRET_KEY` or `RESEND_API_KEY` to browser code.
