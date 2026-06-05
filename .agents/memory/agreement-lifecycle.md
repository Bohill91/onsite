---
name: Digital Job Agreement lifecycle
description: How job agreements gate bookings and the rules that keep stale agreements from corrupting state
---

# Digital Job Agreement lifecycle

A confirmed booking is not workable until its agreement is `active` (both worker
and company have signed). Worker check-in, GPS attendance, and site navigation
are all gated on this.

## Core rules (learned the hard way)

- **Only the job's CURRENT agreement may toggle `job.bookingActive`.** Any code
  that recomputes activation must verify `job.agreementId === agr.id` before
  mutating the booking. A job can accumulate several agreement records over its
  life (re-bookings, declines, cancellations); all but one are history.
  **Why:** a detached agreement signed by an old worker/company was able to
  reactivate or re-gate a live booking when activation was keyed only on jobId.

- **Detached agreements must be terminalized, not just unlinked.** Whenever you
  clear `job.agreementId` (decline, company cancel, cancelBooking, or
  reassignment to a different worker), also set the old agreement to a terminal
  status (`declined_by_worker` / `cancelled`). Keep the record in
  `state.agreements` as permanent history, but terminal status makes it
  read-only and non-actionable. **How to apply:** guard every accept/decline/
  cancel action with an "is this still the job's live, non-terminal agreement?"
  check.

- **Legacy / no-agreement bookings stay workable.** Bookings created before this
  feature have no `agreementId`; the gate treats missing agreementId as active
  so old flows keep working. Backfill on load marks legacy confirmed bookings as
  fully accepted/active.

- **Backfill runs on a local state, not the global one.** Migration runs before
  the global `state` is assigned, so the backfill/cleanup operates on the passed
  `s` and must inline its own recompute (the shared recompute reads global
  `state`). The pure agreement builder must never touch global `state`.

- **Single-tenant demo ownership.** The contractor views show all jobs (not
  filtered by company). Treat a company session as the owner of an agreement
  when its companyId matches OR the agreement has no companyId (seeded/legacy);
  claim ownership on first company sign so it sticks afterwards.
