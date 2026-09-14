(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OnSiteWorkerRatePreferences = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function normalizeMinimumDayRate(value) {
    if (value == null || String(value).trim() === "") return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return Math.round(numeric);
  }

  function minimumRateEligibility({
    minimumDayRate,
    workerFacingDayRate,
    rateKnown = true,
  } = {}) {
    const minimum = normalizeMinimumDayRate(minimumDayRate);
    if (!minimum) {
      return {
        eligible: true,
        constrained: false,
        rateKnown: !!rateKnown,
        reason: "",
      };
    }

    if (!rateKnown) {
      return {
        eligible: true,
        constrained: true,
        rateKnown: false,
        reason: "",
      };
    }

    const workerRate = normalizeMinimumDayRate(workerFacingDayRate);
    return {
      eligible: !!workerRate && workerRate >= minimum,
      constrained: true,
      rateKnown: true,
      reason: workerRate && workerRate >= minimum ? "" : "rate_incompatible",
    };
  }

  function applyMinimumDayRate(record, value) {
    const minimum = normalizeMinimumDayRate(value);
    if (!minimum) {
      return {
        ok: false,
        reason: "Enter a valid minimum day rate",
        record,
      };
    }
    return {
      ok: true,
      minimumDayRate: minimum,
      record: { ...(record || {}), minRate: minimum },
    };
  }

  return {
    normalizeMinimumDayRate,
    minimumRateEligibility,
    applyMinimumDayRate,
  };
});
