"use strict";

const assert = require("node:assert/strict");
const capacity = require("../labour-capacity.js");

const TODAY = "2026-09-01";

function worker(id, overrides = {}) {
  return {
    id,
    availability: "available",
    plannedAbsences: [],
    ...overrides,
  };
}

function committedProject(id, workerId, start, end, overrides = {}) {
  const noFixedEndDate = !!overrides.noFixedEndDate;
  return {
    id,
    start,
    estimatedEndDate: noFixedEndDate ? "" : end,
    noFixedEndDate,
    workingDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    bookingStatus: "confirmed",
    placementSlots: [
      {
        slotId: `slot-${id}`,
        workerId,
        status: "confirmed",
        filledAt: "2026-08-01T09:00:00.000Z",
      },
    ],
    ...overrides,
  };
}

function evaluate(person, start, end, projects = [], extra = {}) {
  return capacity.workerCapacityForRange(person, start, end, {
    projects,
    today: TODAY,
    requestedWorkingDays: [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
    ],
    ...extra,
  });
}

// A. An available worker with no assignment has current and future capacity.
const freeWorker = worker("free");
assert.equal(
  evaluate(freeWorker, TODAY, "2026-09-04").state,
  capacity.CAPACITY_STATES.AVAILABLE_NOW,
);
assert.equal(
  evaluate(freeWorker, "2026-10-01", "2026-10-30").state,
  capacity.CAPACITY_STATES.FUTURE_UNCOMMITTED,
);

// B. A reliable current-project end can make a worker available by the new start.
const endingWorker = worker("ending", { availability: "not available" });
const endingProject = committedProject(
  "ending-project",
  endingWorker.id,
  "2026-08-01",
  "2026-09-30",
);
const availableByStart = evaluate(
  endingWorker,
  "2026-10-05",
  "2026-10-30",
  [endingProject],
);
assert.equal(availableByStart.state, capacity.CAPACITY_STATES.AVAILABLE_BY_START);
assert.equal(availableByStart.expectedAvailableDate, "2026-10-01");

// C. A current confirmed assignment blocks overlapping requested dates.
assert.equal(
  evaluate(endingWorker, "2026-09-14", "2026-10-02", [endingProject]).state,
  capacity.CAPACITY_STATES.COMMITTED_OVERLAP,
);

// D. A future confirmed assignment reserves its future dates.
const futureWorker = worker("future");
const futureProject = committedProject(
  "future-project",
  futureWorker.id,
  "2026-10-03",
  "2026-11-30",
);
assert.equal(
  evaluate(futureWorker, "2026-10-12", "2026-10-30", [futureProject]).state,
  capacity.CAPACITY_STATES.COMMITTED_OVERLAP,
);

// E. Adjacent projects remain valid, including a free gap before a future booking.
const adjacentProject = committedProject(
  "adjacent-project",
  futureWorker.id,
  "2026-09-01",
  "2026-10-02",
);
assert.equal(
  evaluate(futureWorker, "2026-10-03", "2026-10-30", [adjacentProject]).eligible,
  true,
);
assert.equal(
  evaluate(futureWorker, "2026-10-01", "2026-10-02", [futureProject]).eligible,
  true,
);

// F. Absence at the start blocks matching; a short later absence is a penalty only.
const absentWorker = worker("absent", {
  plannedAbsences: [{ id: "absence-hard", startDate: "2026-10-05", endDate: "2026-10-06" }],
});
assert.equal(
  evaluate(absentWorker, "2026-10-05", "2026-10-16").state,
  capacity.CAPACITY_STATES.ABSENCE_CONFLICT,
);
const partialAbsence = evaluate(
  worker("partial", {
    plannedAbsences: [{ startDate: "2026-10-12", endDate: "2026-10-12" }],
  }),
  "2026-10-05",
  "2026-10-16",
);
assert.equal(partialAbsence.eligible, true);
assert.ok(partialAbsence.absencePenalty > 0);

// G. The next-available date must be on or before the requested start.
const laterWorker = worker("later", {
  availability: "not available",
  nextAvailableDate: "2026-10-06",
});
assert.equal(
  evaluate(laterWorker, "2026-10-05", "2026-10-30").state,
  capacity.CAPACITY_STATES.AVAILABILITY_UNKNOWN,
);
assert.equal(
  evaluate(laterWorker, "2026-10-06", "2026-10-30").state,
  capacity.CAPACITY_STATES.AVAILABLE_BY_START,
);

// H. A confirmed assignment with no fixed end blocks future planning conservatively.
const ongoingWorker = worker("ongoing");
const ongoingProject = committedProject(
  "ongoing-project",
  ongoingWorker.id,
  "2026-08-01",
  "",
  { noFixedEndDate: true },
);
assert.equal(
  evaluate(ongoingWorker, "2027-01-04", "2027-01-29", [ongoingProject]).state,
  capacity.CAPACITY_STATES.NO_FIXED_END_CONFLICT,
);

// I. A release returns capacity from its effective date, while earlier dates stay blocked.
const releaseWorker = worker("release");
const releaseProject = committedProject(
  "release-project",
  releaseWorker.id,
  "2026-09-01",
  "2026-10-30",
);
const release = {
  id: "release-record",
  jobId: releaseProject.id,
  workerId: releaseWorker.id,
  placementSlotId: "slot-release-project",
  releaseStatus: "pending_effective_date",
  effectiveDate: "2026-10-01",
  releaseGivenAt: "2026-09-20T09:00:00.000Z",
};
assert.equal(
  evaluate(releaseWorker, "2026-09-28", "2026-09-30", [releaseProject], {
    releases: [release],
  }).state,
  capacity.CAPACITY_STATES.COMMITTED_OVERLAP,
);
assert.equal(
  evaluate(releaseWorker, "2026-10-01", "2026-10-30", [releaseProject], {
    releases: [release],
  }).eligible,
  true,
);

// J. Extending one project cannot consume capacity already confirmed elsewhere.
const extensionWorker = worker("extension");
const projectA = committedProject(
  "project-a",
  extensionWorker.id,
  "2026-09-01",
  "2026-10-20",
);
const projectB = committedProject(
  "project-b",
  extensionWorker.id,
  "2026-10-21",
  "2026-11-30",
);
assert.equal(
  evaluate(extensionWorker, "2026-10-21", "2026-10-30", [projectA, projectB], {
    ignoreProjectIds: [projectA.id],
    skipWorkerAvailability: true,
  }).state,
  capacity.CAPACITY_STATES.COMMITTED_OVERLAP,
);

// K. Rate changes never affect the capacity decision.
const expensiveRequest = { advertisedRate: 1000, budgetMax: 1000 };
const standardRequest = { advertisedRate: 250, budgetMax: 250 };
assert.equal(
  evaluate(endingWorker, "2026-09-14", "2026-09-18", [endingProject], expensiveRequest).state,
  capacity.CAPACITY_STATES.COMMITTED_OVERLAP,
);
assert.equal(
  evaluate(endingWorker, "2026-09-14", "2026-09-18", [endingProject], standardRequest).state,
  capacity.CAPACITY_STATES.COMMITTED_OVERLAP,
);

// L. Capacity remains worker-specific on multi-worker projects.
const multiProject = committedProject(
  "multi-project",
  "multi-committed",
  "2026-10-01",
  "2026-10-30",
);
multiProject.placementSlots.push({
  slotId: "slot-open",
  workerId: "",
  status: "open",
});
assert.equal(
  evaluate(worker("multi-committed"), "2026-10-05", "2026-10-16", [multiProject]).eligible,
  false,
);
assert.equal(
  evaluate(worker("multi-free"), "2026-10-05", "2026-10-16", [multiProject]).eligible,
  true,
);

// Missing dates remain uncertain rather than being fabricated.
const unknownProject = committedProject(
  "unknown-project",
  "unknown-worker",
  "",
  "",
);
assert.equal(
  evaluate(worker("unknown-worker"), "2026-10-05", "2026-10-16", [unknownProject]).state,
  capacity.CAPACITY_STATES.AVAILABILITY_UNKNOWN,
);

console.log("forward labour capacity tests passed");
