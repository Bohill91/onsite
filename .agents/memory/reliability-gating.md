---
name: Reliability gating & attendance statuses
description: How attendance statuses affect (or don't affect) a worker's reliability score in OnSite.
---

# Reliability gating

Only confirmed, countable attendance moves a worker's reliability score.

**Rule:** `getWorkerStats` counts a record toward reliability only if its status is in `COUNTABLE_STATUSES` (`onTime`/`late`/`noShow`) AND it is either supervisor-marked or supervisor-confirmed (`!r.selfReported || r.supervisorConfirmed`). Records under an active dispute (`disputeStatus === "pending"`) are frozen out entirely.

**Why:** Workers self-report via QR check-in and delay/absence reports. A worker's own scan or report must never change their public-facing score until a supervisor confirms it — otherwise people could inflate or dodge their reliability themselves. Statuses `checkedIn`, `unconfirmed`, `excused`, `sentHome`, `reportedIssue` are intentionally non-countable.

**How to apply:**
- Any NEW attendance status must be deliberately added to `COUNTABLE_STATUSES` only if it should affect the score, and to `SUPERVISOR_DECISIONS` if a supervisor can pick it from the approval card. `notRequired` must stay in `SUPERVISOR_DECISIONS` (a regression removed it once) even though it is non-countable.
- Worker self-report writes set `selfReported:true, supervisorConfirmed:false`. `submitDayAttendance` is the single point that flips records to `supervisorConfirmed:true` (carrying over `checkInTime`/`suggestedStatus`/`scanToken`/`reportedIssue` from the prior same-day record).
- Daily site QR codes live in `state.siteCodes`; `activeSiteCode(jobId)` returns today's non-expired code. A worker scan only succeeds against an active code. Timing helpers: `GRACE_MIN`=10 (on-time window), `CUTOFF_MIN`=60 (past = unconfirmed).
- 90-day exception counter (`getExceptionInfo`) flags `excused`+`reportedIssue`: 4+ = warning, 7+ = review. Admin-only (null session) audit view; not shown to companies.
