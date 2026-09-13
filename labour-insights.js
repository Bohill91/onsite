(function initLabourInsights(globalScope) {
  "use strict";

  const DAY_MS = 86400000;
  const DEFAULT_WORKING_DAYS = Object.freeze([
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
  ]);
  const VALID_WORKING_DAYS = new Set([
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ]);
  const OUTLOOK_LEVELS = Object.freeze({
    STRONG: "strong",
    GOOD: "good",
    TIGHT: "tight",
    CHALLENGING: "challenging",
    LIMITED: "limited",
  });

  function text(value) {
    return String(value || "").trim();
  }

  function positiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function dateOnly(value) {
    const candidate = text(value).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : "";
  }

  function dateOnlyMs(value) {
    const candidate = dateOnly(value);
    if (!candidate) return null;
    const [year, month, day] = candidate.split("-").map(Number);
    const timestamp = Date.UTC(year, month - 1, day);
    const parsed = new Date(timestamp);
    return parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
      ? timestamp
      : null;
  }

  function calendarDaysBetween(from, to) {
    const fromMs = dateOnlyMs(from);
    const toMs = dateOnlyMs(to);
    return fromMs === null || toMs === null
      ? null
      : Math.round((toMs - fromMs) / DAY_MS);
  }

  function shiftDate(value, days) {
    const timestamp = dateOnlyMs(value);
    if (timestamp === null) return "";
    return new Date(timestamp + Number(days || 0) * DAY_MS)
      .toISOString()
      .slice(0, 10);
  }

  function normalizedLocationData(value) {
    if (!value || typeof value !== "object") return null;
    const latitude = Number(value.latitude ?? value.lat);
    const longitude = Number(value.longitude ?? value.lng);
    const name = text(value.name || value.locality);
    const id = text(value.id || value.placeId);
    if (!id || !name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }
    return {
      id,
      name,
      displayName: text(value.displayName) || name,
      adminArea: text(value.adminArea || value.region || value.county),
      country: text(value.country),
      latitude,
      longitude,
    };
  }

  function normalizeWorkingDays(values) {
    const normalized = (Array.isArray(values) ? values : [])
      .map((value) => text(value).toLowerCase())
      .filter((value) => VALID_WORKING_DAYS.has(value));
    return normalized.length
      ? [...new Set(normalized)]
      : [...DEFAULT_WORKING_DAYS];
  }

  function normalizeInput(value = {}) {
    const locationData = normalizedLocationData(value.locationData);
    const noFixedEndDate = !!value.noFixedEndDate;
    const accommodationPaid = !!value.accommodationPaid;
    const accommodationArrangement = accommodationPaid
      ? text(value.accommodationArrangement) || "company_provided"
      : "";
    return {
      location: text(value.location || locationData?.name),
      locationData,
      trade: text(value.trade),
      tradeKey: text(value.tradeKey),
      specialism: text(value.specialism || value.role),
      roleKey: text(value.roleKey),
      workersRequired: Math.max(1, Math.round(positiveNumber(value.workersRequired ?? value.quantity) || 1)),
      requiredCredentialIds: [
        ...new Set(
          (Array.isArray(value.requiredCredentialIds)
            ? value.requiredCredentialIds
            : [])
            .map(text)
            .filter(Boolean),
        ),
      ],
      startDate: dateOnly(value.startDate || value.start),
      endDate: noFixedEndDate
        ? ""
        : dateOnly(value.endDate || value.estimatedEndDate),
      noFixedEndDate,
      dailyRate: positiveNumber(value.dailyRate ?? value.budgetMax),
      shiftStartTime: text(value.shiftStartTime).slice(0, 5),
      shiftFinishTime: text(value.shiftFinishTime).slice(0, 5),
      workingDays: normalizeWorkingDays(value.workingDays),
      accommodationPaid,
      accommodationArrangement,
      accommodationAllowancePerNight:
        accommodationArrangement === "nightly_allowance"
          ? positiveNumber(value.accommodationAllowancePerNight)
          : null,
      workActivity: text(value.workActivity),
    };
  }

  function toMatcherJob(value = {}) {
    const input = normalizeInput(value);
    return {
      id: "labour-insights-scenario",
      trade: input.trade,
      tradeKey: input.tradeKey,
      specialism: input.specialism,
      roleKey: input.roleKey,
      quantity: input.workersRequired,
      requiredCredentialIds: [...input.requiredCredentialIds],
      start: input.startDate,
      startDate: input.startDate,
      estimatedEndDate: input.endDate,
      noFixedEndDate: input.noFixedEndDate,
      budgetMax: input.dailyRate,
      workingDays: [...input.workingDays],
      shiftStartTime: input.shiftStartTime,
      shiftFinishTime: input.shiftFinishTime,
      accommodationPaid: input.accommodationPaid,
      accommodationArrangement: input.accommodationArrangement,
      accommodationAllowancePerNight: input.accommodationAllowancePerNight,
      workActivity: input.workActivity,
      location: input.location,
      locationData: input.locationData ? { ...input.locationData } : null,
      sitePin: input.locationData
        ? {
            lat: input.locationData.latitude,
            lng: input.locationData.longitude,
          }
        : null,
      completed: false,
    };
  }

  function levelLabel(level) {
    return {
      [OUTLOOK_LEVELS.STRONG]: "Strong outlook",
      [OUTLOOK_LEVELS.GOOD]: "Good outlook",
      [OUTLOOK_LEVELS.TIGHT]: "Tight outlook",
      [OUTLOOK_LEVELS.CHALLENGING]: "Challenging outlook",
      [OUTLOOK_LEVELS.LIMITED]: "Limited data",
    }[level] || "Limited data";
  }

  function coverageCopy(required, eligible) {
    if (!eligible) {
      return "Known suitable capacity is currently limited for the requested dates.";
    }
    if (eligible >= required * 2) {
      return "Known suitable capacity is strong relative to the number required.";
    }
    if (eligible >= required) {
      return "Known suitable capacity currently covers the requested positions.";
    }
    if (eligible >= Math.max(1, Math.ceil(required * 0.6))) {
      return "Strong coverage for most positions; remaining capacity is tighter.";
    }
    return "Some suitable capacity is visible, but it does not yet cover most requested positions.";
  }

  function buildOutlook(rawInput = {}, rawSupply = {}, options = {}) {
    const input = normalizeInput(rawInput);
    const today = dateOnly(options.today) || new Date().toISOString().slice(0, 10);
    const required = input.workersRequired;
    const eligible = Math.max(0, Number(rawSupply.eligible) || 0);
    const tradeProfiles = Math.max(0, Number(rawSupply.tradeProfiles) || 0);
    const expectedBeforeStart = Math.max(
      0,
      Number(rawSupply.expectedBeforeStart) || 0,
    );
    const futureUncommitted = Math.max(
      0,
      Number(rawSupply.futureUncommitted) || 0,
    );
    const leadDays = calendarDaysBetween(today, input.startDate);
    const missing = [];
    if (!input.trade) missing.push("trade");
    if (!input.startDate) missing.push("start date");
    if (!input.specialism) missing.push("role / specialism");
    if (!input.locationData) missing.push("verified location");
    if (!input.dailyRate) missing.push("daily rate");

    let level = OUTLOOK_LEVELS.LIMITED;
    if (input.trade && input.startDate && tradeProfiles > 0) {
      const coverage = eligible / required;
      if (coverage >= 2) level = OUTLOOK_LEVELS.STRONG;
      else if (coverage >= 1.15) level = OUTLOOK_LEVELS.GOOD;
      else if (coverage >= 0.6) level = OUTLOOK_LEVELS.TIGHT;
      else level = OUTLOOK_LEVELS.CHALLENGING;

      if (leadDays !== null && leadDays <= 1) {
        if (level === OUTLOOK_LEVELS.STRONG) level = OUTLOOK_LEVELS.GOOD;
        else if (level === OUTLOOK_LEVELS.GOOD) level = OUTLOOK_LEVELS.TIGHT;
        else if (level === OUTLOOK_LEVELS.TIGHT) {
          level = OUTLOOK_LEVELS.CHALLENGING;
        }
      } else if (
        leadDays !== null &&
        leadDays >= 28 &&
        (expectedBeforeStart || futureUncommitted) &&
        coverage >= 1
      ) {
        level = OUTLOOK_LEVELS.STRONG;
      }
    }

    let summary = coverageCopy(required, eligible);
    if (level === OUTLOOK_LEVELS.LIMITED) {
      summary = input.trade
        ? "OnSite does not yet have enough confirmed scenario data to give a dependable fill outlook."
        : "Choose a trade and start date to compare this request with current OnSite capacity.";
    } else if (leadDays !== null && leadDays <= 1) {
      summary += " The short lead time leaves less room for availability to change.";
    } else if (expectedBeforeStart > 0) {
      summary += ` ${expectedBeforeStart} suitable ${expectedBeforeStart === 1 ? "worker is" : "workers are"} expected to become available before the start.`;
    }

    return {
      level,
      label: levelLabel(level),
      summary,
      required,
      eligible,
      supportedPositions: Math.min(required, eligible),
      uncoveredPositions: Math.max(0, required - eligible),
      leadDays,
      missing,
      confidence: missing.length ? "developing" : "complete",
    };
  }

  const api = {
    DEFAULT_WORKING_DAYS,
    OUTLOOK_LEVELS,
    normalizeInput,
    toMatcherJob,
    buildOutlook,
    calendarDaysBetween,
    shiftDate,
  };

  globalScope.OnSiteLabourInsights = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
