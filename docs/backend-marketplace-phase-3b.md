# Backend Foundation Phase 3B: Offers and Placements

Phase 3B moves standard job offers and confirmed placements from browser-local
state into canonical Supabase persistence. It builds on canonical identities,
projects, requirements, and worker applications from Phases 1-3A.

## Offer lifecycle

Canonical offers use `pending`, `accepted`, `declined`, `expired`, and
`cancelled`. Administrator and Manager company members can create offers;
Supervisor remains read-only. Ownership is derived through the requirement and
project, never from a browser-supplied company ID.

An offer may reference an active application, but `application_id` is nullable
for specific-worker and other direct offers. Withdrawn applications cannot be
reused as an active offer source. Reissued offers receive a new UUID and may
reference `prior_offer_id`; historical declined, expired, and cancelled rows
are never reset to pending.

Pending offers expire after 24 hours, matching the existing product rule.
Expiry is enforced server-side on reads and responses rather than relying on a
browser timer. Worker and server decline controls use the shared canonical
reasons `Unavailable / In Work`, `Rate Too Low`, `Location / Travel`, `Start
Date Not Suitable`, `Project Duration Not Suitable`, `Work Activity Not
Suitable`, and `Other`. An optional comment is retained on the historical
offer. `Rate Too Low` remains because it is an established worker reason in the
existing offer UI and matching-history behavior.

## Accepted terms and placements

The offer snapshots the worker-facing rate, project/company labels, trade,
role, grade, work activity, dates, duration, working days, shift times,
accommodation, overtime, and weekend terms. It does not contain the company's
budget or the worker's private minimum rate.

Worker acceptance calls `accept_worker_offer`. It locks the worker, resolves
the immutable offer-to-requirement relationship, then locks project,
requirement, and offer in that order. The offer is re-read and revalidated under lock before any
capacity or placement write. Project saves and offer creation also lock project
before requirement; placing the offer lock after those rows avoids a hidden
cycle with restrictive foreign-key checks during requirement deletion. The
transaction verifies ownership, status, expiry, project validity, capacity, and
overlapping canonical commitments, then creates one placement and marks the
offer accepted. The worker lock serializes concurrent acceptances across
different requirements. The placement copies the accepted offer snapshot, so
later project edits cannot change agreed terms.

Placements use the minimal statuses `upcoming`, `active`, `completed`, and
`cancelled`. `upcoming` and `active` consume requirement capacity. Pending,
declined, expired, and cancelled offers do not.

## Capacity and concurrency

Worker marketplace vacancies are now:

`workers_required - upcoming/active canonical placements`

Filled requirements are omitted from normal worker publication and reject new
applications and offers. Multiple pending offers may exist for separate
workers, but the requirement row lock serializes acceptance. The final accepted
placement cancels remaining pending offers for that requirement, preventing an
overfilled roster under concurrent responses.

## Privacy and authorization

RLS permits workers to select only their own offers and placements. Active
company members may select records only through requirements owned by their
company. Anonymous users receive no access. Authenticated clients receive no
direct mutation grants; trusted server routes and fixed-search-path
`SECURITY DEFINER` functions perform mutations with server-derived identity.
The authenticated offer-table grant is column-limited so the internal
`created_by_user_id` audit reference is not browser-readable.

Worker responses exclude company budgets and membership internals. Company
responses include only the worker profile fields required by the existing
candidate and roster UI, excluding private minimum rates, auth IDs, passwords,
email, and phone.

## Application and compatibility behavior

The canonical chain is `application -> offer -> placement` when an offer begins
from an application. Direct offers leave `application_id` null rather than
fabricating an application. Applications remain historical after acceptance;
Phase 3A's `applied`/`withdrawn` model is unchanged.

Authenticated frontend sessions project canonical offers into the existing
offer-card shape and canonical placements into the existing placement-slot
roster shape. These compatibility objects retain canonical IDs and are removed
before localStorage persistence. Legacy/demo sessions continue using the local
lifecycle; authenticated local state cannot override canonical status.

## Integrity and retention

Offer and placement foreign keys to project requirements use `ON DELETE
RESTRICT`. Normal full-array project edits therefore cannot silently erase
marketplace history, and the transactional project-save RPC rolls back the
complete edit when protected history exists.

Worker foreign keys also use `ON DELETE RESTRICT` for the new historical
records. A production worker-account deletion/anonymisation policy remains a
pre-launch decision. Phase 3A applications still retain their previously
documented worker cascade until that policy is designed and migrated safely.

## Phase boundary

Phase 3B does not migrate attendance, QR sign-in, agreements, documents,
timesheets, payments, invoices, disputes, notifications, replacement/release
lifecycle, shift-change offers, project-transfer offers, or automated matching
history. Those existing modules remain local and must not be treated as
canonical backend state.

The next backend phase should move assignment lifecycle changes (release,
replacement, extension, transfer, and completion) onto canonical placements
before attendance is migrated.

## Live setup

After review, manually apply:

`supabase/migrations/202609160005_offers_placements.sql`

The application does not apply this migration automatically. No credentials
belong in source control.
