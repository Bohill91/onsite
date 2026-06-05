---
name: OnSite Architecture & Role Nav
description: How role-based nav works in the OnSite app — dynamic nav rebuild, session key, render dispatch, dashboard restore.
---

## Role-based nav system

Workers get: Home(dashboard), Jobs(jobs), Bookings(attendance), Profile(profile)
Contractors get: Home(dashboard), Requests(add), Workforce(workers), Account(account)
Admin/demo: restores original nav (all 5 tabs)

**Key mechanism:**
- `ORIG_TOP_NAV`, `ORIG_BOTTOM_NAV`, `ORIG_DASHBOARD` constants capture original HTML at page load
- `rebuildNav(tabDefs, activeId)` replaces both `.tab-nav` and `.bottom-nav` innerHTML then calls `bindTabEvents()`
- `restoreNav()` + `document.getElementById("tab-dashboard").innerHTML = ORIG_DASHBOARD` restores admin state
- `switchTab()` uses dynamic `querySelectorAll("[data-tab]")` (not cached) so rebuilt navs work

**Why:** Static cached NodeLists break after innerHTML rebuild. Dynamic query ensures correct buttons always found.

**Render dispatch in `render()`:**
- worker: renderWorkerHome, renderWorkerJobBoard, renderWorkerAttendance, renderWorkerProfile
- company: renderContractorHome, renderWorkers, renderAttendance, renderContractorAccount
- admin: renderStats, renderActivity, renderWorkers, renderJobs, renderMatches, renderAttendance

**Null guards needed:** `renderStats()` and `renderMatches()` check for element existence since dashboard is replaced for workers/contractors.

## User types
- Internal type key: `"worker"` | `"company"` (keep as-is, display "Contractor" in UI)
- Auth session: `localStorage.getItem("onsite_auth_v1")`
- User store: `"onsite_users_v1"`
- Attendance: `"onsite_attendance_v1"`
- State (workers/jobs): `"sitematch_v2"`

## Job model
Has: id, trade, location, start, duration, quantity, payRate, assignedWorkerId, siteAddress, sitePin, siteContact, arrivalInstructions, parking, ppe, gateAccess, sitePhotos
