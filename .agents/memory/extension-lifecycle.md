---
name: Booking extension & worker reallocation lifecycle
description: How OnSite auto-reminds, auto-ends, and re-arms bookings around their estimated end date, and the rules that must hold.
---

# Booking extension / reallocation lifecycle

A confirmed booking carries an `estimatedEndDate`. A render-time engine
(`processExtensionLifecycle`) only advances bookings whose `extensionStatus === "pending"`:
14 calendar days out → `available_soon` + first reminder; 7 days → second reminder;
within notice period (working days, default 5) and still pending → `ending_as_planned`
+ `available_from_end_date`, freeing the worker.

**Rule — never hold a worker past the estimated end date unless they accept.**
**Why:** core product promise. **How to apply:** when a worker accepts an extension
(`acceptExtension`), commit the new dates/rate then set `extensionStatus` back to
`"pending"` (NOT a terminal `"extended"`) so the engine re-arms against the *new* end
date. A terminal status would freeze the booking and silently hold the worker past any
future overrun. Use the transient `extensionJustExtended` flag to show the "confirmed"
note; the engine clears it once the booking re-enters the 14-day window.

**Rule — declining an extension must not touch reliability; there are no company
reliability scores.** `declineExtension` only flips status/availability and logs.

**Matching gate:** `getMatches` offers a currently-booked worker to another job only
when `isReallocatable(theirBooking)` is true AND `newJob.start >= their estimatedEndDate`;
it labels them "Available from X" and gives `available_soon` a small composite bump.
