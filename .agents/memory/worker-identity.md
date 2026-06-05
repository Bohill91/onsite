---
name: Worker identity & duplicate prevention
description: How OnSite stops poor-reliability workers from resetting their score by deleting and re-registering.
---

# Worker identity records (anti-reset)

A **WorkerIdentityRecord** is a permanent record kept SEPARATELY from the login account, in localStorage key `onsite_identities_v1` (login accounts live in `onsite_users_v1`, app state in `sitematch_v2`). It survives account deletion on purpose.

**Why:** A worker with a bad reliability record could otherwise delete their account and sign up again with a new email/phone to get a clean 100% score. The identity record + matching defeats that.

**How to apply:**
- Matching happens only at sign-up (auth.js worker step 3), via `registerWorkerIdentity(user)` in app.js. Match priority is UTR → CSCS/ECS card → DOB+legal name → phone/email history. On a match it links the new login (`currentUserAccountId` + `previousUserAccountIds`), restores `reliabilityScore`, sets `flagged` + `matchedFields` + `pendingAccountId`, and (if previously deleted/suspended) flips status to `under_review`.
- **Reliability must be sourced at the identity level, not the account level.** `getWorkerStats(workerId)` aggregates attendance across `linkedAccountIds(workerId)` (current + previous logins). Restoring only `user.reliability` is NOT enough — once new records accrue under the new id, account-scoped scoring would shed the old impact. Keep attendance records keyed by account id but always aggregate by linked ids.
- **Admin-only views must self-clear AND be called on every render.** `renderAdminDuplicateReview()` (and `renderAdminAttendanceReview()`) early-return with `el.innerHTML = ""` when `getSessionUser()` is truthy. Because contractors have a Workers/Workforce tab containing `#adminDupeReview`, the render call MUST run in all branches (it's called unconditionally at the end of `render()`), or stale admin cards from the initial null-user render leak into a contractor session.
- **Privacy:** never show full old emails/phones/IDs even to admin — use `maskEmail`/`maskTail`. The retention privacy note text is required wording; it lives in the worker profile delete section and the admin duplicate panel.
- Admin actions on identities: `confirmIdentityMatch`, `rejectIdentityMatch` (splits the pending account into a fresh identity), `mergeIdentities`, `reactivateIdentity`.
