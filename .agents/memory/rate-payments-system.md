---
name: Rate Structure & Payments System
description: Pricing model, role-based money visibility, invoices/payouts, and company restriction gating for OnSite.
---

# Rate Structure & Payments

## Pricing model (core invariant)
- Workers keep a PRIVATE minimum day rate (`worker.minRate`); companies must NEVER see it.
- Companies request labour with a BUDGET (all-in day rate). The engine derives Worker Pay, OnSite Margin, Company Charge.
- **Margin floor:** margin is never below 15% of worker pay (`PRICING.MIN_MARGIN_PCT`). If budget can't cover worker-min + 15%, booking is refused with "Budget too low to secure verified workers".
- `computeBookingPricing({workerMin, budget})` is PURE (no global state) so it runs at booking time and during migration.

## Role-based money visibility (must be preserved on any UI change)
- **Worker** surfaces: only their guaranteed pay + payment status. Never margin/charge.
- **Company** surfaces: only the all-in Company Charge + invoice totals. Never worker pay/min/margin.
- **Admin** (no session user, `getSessionUser()===null`): sees everything in the Payments console.
- The admin Payments tab lives in the ORIGINAL index.html nav (restored via `restoreNav()`); worker/company use `rebuildNav` with their own tab sets, so they never get the tab. `renderAdminPayments(role)` ALSO early-returns and clears `#paymentsContent` when role is non-null — defense in depth.

## Restriction / suspension gating
- `isCompanyRestricted` is a SUPERSET of `isCompanySuspended` (restricted OR suspended).
- **Both posting AND booking confirmation must gate on `isCompanyRestricted`**, not just suspended. jobForm submit and `confirmBooking()` both enforce this. (Regression once existed where confirmBooking only checked suspended — restricted companies could still get bookings.)
- `refreshCompanyRestrictions(companyId)` recomputes flags from overdue invoices: any overdue ⇒ restricted; beyond `SUSPEND_OVERDUE_LIMIT` ⇒ suspended. Reinstate clears `manualRestriction` then re-runs this, so overdue invoices re-restrict automatically.

## Invoices & payouts
- Weekly Mon–Fri invoices generated only from APPROVED attendance (`isInvoiceableAttendance`: onTime/late, supervisor-confirmed if self-reported, no pending dispute). Excludes No Show / disputed / under-review. `generateWeeklyInvoices()` is idempotent (one invoice per company+week, completed weeks only) and runs in render().
- Workers are paid ONLY after client funds received: line payout status gates on `inv.status === "paid"`. Admin "Confirm Payment Received" sets paid; then release single/all sets `line.workerPaid`; `inv.workerPaymentsReleased` is recomputed as "every line paid or held".

## Dates
- `formatDate` intentionally includes time (used app-wide). For date-only strings ("YYYY-MM-DD") like invoice week/due dates, use `formatDateOnly` to avoid a spurious "00:00".
