(function initOfferDeclineReasons(globalScope) {
  "use strict";

  const WORKER_DECLINE_REASONS = Object.freeze([
    "Unavailable / In Work",
    "Rate Too Low",
    "Location / Travel",
    "Start Date Not Suitable",
    "Project Duration Not Suitable",
    "Work Activity Not Suitable",
    "Other",
  ]);

  const api = Object.freeze({ WORKER_DECLINE_REASONS });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.OnSiteOfferDeclineReasons = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
