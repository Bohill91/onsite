---
name: Booking Protection cancellation rules
description: Invariants for OnSite's automatic Booking Protection (cancellation/notice) system — what must stay true when touching assignment/cancellation code.
---

# Booking Protection invariants

The Protected Booking system pays a worker 1 day's pay when a confirmed booking is cancelled within a short notice window of the start date; otherwise nothing is due.

## Rules that must hold
- **Every un-assignment of a confirmed booking must go through `cancelBooking()`** (or open the cancel modal which calls it). Never set `job.assignedWorkerId = ""` directly on a confirmed booking — that bypasses the notice-window rule and creates no cancellation record.
  - **Why:** a regression once let the admin job dropdown's blank option silently unassign, skipping the rule and the owed payment. The dropdown now reverts and opens the cancel modal instead.
- **`state.cancellations[]` is the single source of truth** for the admin Cancelled Bookings view. `cancelBooking()` unshifts an immutable record there and also writes cancellation metadata onto the job.
- **Company cancellation does NOT affect worker reliability** — intentional per spec. Don't add reliability penalties on cancel.
- **Cancellation records use field names `cancellationPaymentDue` / `cancellationPaymentAmount`** (not `paymentDue`/`amount`, which are only on `computeCancellation()`'s return). Read the record's prefixed fields in toasts/UI.

## Confirmation entry point
- `confirmBooking(job, workerId)` is the only place a Protected Booking begins; it stamps `agreedDayRate` (from `parseDayRate(payRate)`), `startDate`, and clears any prior cancellation residue so a job can be re-booked cleanly.
