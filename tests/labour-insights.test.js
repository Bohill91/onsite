"use strict";

const assert = require("node:assert/strict");
const insights = require("../labour-insights.js");

const TODAY = "2026-09-01";

const normalized = insights.normalizeInput({
  location: "Manchester",
  trade: "Electrical",
  specialism: "Electrician",
  quantity: "12",
  start: "2026-10-13T07:00",
  estimatedEndDate: "2026-11-20",
  budgetMax: "275",
  workingDays: ["monday", "monday", "friday", "invalid"],
  accommodationPaid: true,
  accommodationArrangement: "nightly_allowance",
  accommodationAllowancePerNight: "45",
});
assert.equal(normalized.workersRequired, 12);
assert.equal(normalized.startDate, "2026-10-13");
assert.deepEqual(normalized.workingDays, ["monday", "friday"]);
assert.equal(normalized.accommodationAllowancePerNight, 45);

const matcherJob = insights.toMatcherJob({
  ...normalized,
  locationData: {
    id: "2643123",
    name: "Manchester",
    adminArea: "Manchester",
    country: "England",
    latitude: 53.48095,
    longitude: -2.23743,
  },
});
assert.deepEqual(matcherJob.sitePin, { lat: 53.48095, lng: -2.23743 });
assert.equal(matcherJob.quantity, 12);

const strong = insights.buildOutlook(
  { trade: "Electrical", specialism: "Electrician", startDate: "2026-10-13", workersRequired: 4 },
  { tradeProfiles: 12, eligible: 9, futureUncommitted: 5 },
  { today: TODAY },
);
assert.equal(strong.level, "strong");

const partial = insights.buildOutlook(
  { trade: "Electrical", specialism: "Electrician", startDate: "2026-09-20", workersRequired: 12 },
  { tradeProfiles: 18, eligible: 8, expectedBeforeStart: 3 },
  { today: TODAY },
);
assert.equal(partial.level, "tight");
assert.match(partial.summary, /most positions/);

const tomorrow = insights.buildOutlook(
  { trade: "Electrical", startDate: "2026-09-02", workersRequired: 4 },
  { tradeProfiles: 8, eligible: 5 },
  { today: TODAY },
);
const sixWeeks = insights.buildOutlook(
  { trade: "Electrical", startDate: "2026-10-13", workersRequired: 4 },
  { tradeProfiles: 8, eligible: 5, futureUncommitted: 2 },
  { today: TODAY },
);
assert.equal(tomorrow.level, "tight");
assert.equal(sixWeeks.level, "strong");

const challenging = insights.buildOutlook(
  { trade: "Electrical", startDate: "2026-09-08", workersRequired: 10 },
  { tradeProfiles: 10, eligible: 2 },
  { today: TODAY },
);
assert.equal(challenging.level, "challenging");

const limited = insights.buildOutlook(
  { trade: "Electrical", workersRequired: 3 },
  { tradeProfiles: 5, eligible: 4 },
  { today: TODAY },
);
assert.equal(limited.level, "limited");
assert.ok(limited.missing.includes("start date"));

const noProfiles = insights.buildOutlook(
  { trade: "Electrical", startDate: "2026-09-20", workersRequired: 3 },
  { tradeProfiles: 0, eligible: 0 },
  { today: TODAY },
);
assert.equal(noProfiles.level, "limited");

const beforeAccommodation = insights.buildOutlook(
  { trade: "Electrical", startDate: "2026-09-20", workersRequired: 4 },
  { tradeProfiles: 7, eligible: 1 },
  { today: TODAY },
);
const afterAccommodation = insights.buildOutlook(
  {
    trade: "Electrical",
    startDate: "2026-09-20",
    workersRequired: 4,
    accommodationPaid: true,
  },
  { tradeProfiles: 7, eligible: 5, accommodationExpanded: 4 },
  { today: TODAY },
);
assert.equal(beforeAccommodation.level, "challenging");
assert.equal(afterAccommodation.level, "good");

const fullyCoveredMultiWorker = insights.buildOutlook(
  { trade: "Electrical", startDate: "2026-09-20", workersRequired: 12 },
  { tradeProfiles: 24, eligible: 12, expectedBeforeStart: 4 },
  { today: TODAY },
);
assert.equal(fullyCoveredMultiWorker.level, "tight");
assert.equal(fullyCoveredMultiWorker.supportedPositions, 12);
assert.equal(fullyCoveredMultiWorker.uncoveredPositions, 0);

const noFixedEnd = insights.toMatcherJob({
  trade: "Electrical",
  startDate: "2026-10-01",
  endDate: "2026-11-01",
  noFixedEndDate: true,
});
assert.equal(noFixedEnd.noFixedEndDate, true);
assert.equal(noFixedEnd.estimatedEndDate, "");

assert.equal(insights.shiftDate("2026-09-25", 7), "2026-10-02");

console.log("labour insights tests passed");
