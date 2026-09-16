(function initPlacementLifecycleRules(globalScope) {
  "use strict";

  const PLACEMENT_STATUSES = Object.freeze([
    "upcoming",
    "active",
    "completed",
    "released",
    "cancelled",
  ]);
  const CAPACITY_STATUSES = Object.freeze(["upcoming", "active"]);
  const TERMINAL_STATUSES = Object.freeze(["completed", "released", "cancelled"]);
  const CHANGE_TYPES = Object.freeze(["extension", "schedule_change"]);
  const CHANGE_STATUSES = Object.freeze([
    "pending",
    "accepted",
    "declined",
    "expired",
    "cancelled",
  ]);
  const RELEASE_TYPES = Object.freeze([
    "standard_release",
    "pre_start_stand_down",
    "site_not_ready",
    "immediate_release",
  ]);
  const RELEASE_REASONS = Object.freeze({
    standard_release: Object.freeze([
      "Site no longer requires worker",
      "Project phase complete",
      "Reduction in labour required",
      "Performance concern",
      "Other",
    ]),
    pre_start_stand_down: Object.freeze([
      "Project delayed",
      "Project cancelled",
      "Site not ready",
      "Labour no longer required",
      "Other",
    ]),
    site_not_ready: Object.freeze([
      "Site not ready",
      "Materials delayed",
      "Access issue",
      "Programme changed",
      "Other",
    ]),
    immediate_release: Object.freeze([
      "No-show",
      "Health & safety breach",
      "Conduct issue",
      "Poor workmanship",
      "Qualifications issue",
      "Site no longer requires worker",
      "Other",
    ]),
  });
  const WORKER_END_REASONS = Object.freeze([
    "Project no longer suitable",
    "Start another assignment",
    "Personal circumstances",
    "Travel / location issue",
    "Health or medical reason",
    "Other",
  ]);

  const api = Object.freeze({
    PLACEMENT_STATUSES,
    CAPACITY_STATUSES,
    TERMINAL_STATUSES,
    CHANGE_TYPES,
    CHANGE_STATUSES,
    RELEASE_TYPES,
    RELEASE_REASONS,
    WORKER_END_REASONS,
  });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.OnSitePlacementLifecycleRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
