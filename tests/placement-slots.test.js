"use strict";

const assert = require("node:assert/strict");
const slots = require("../placement-slots.js");

function project(quantity = 1, overrides = {}) {
  return {
    id: overrides.id || `project-${quantity}`,
    start: "2026-10-01",
    estimatedEndDate: "2026-10-31",
    trade: "Electrical",
    specialism: "General Electrical",
    quantity,
    labourRequirements: overrides.labourRequirements || [
      {
        trade: "Electrical",
        specialism: "General Electrical",
        grade: "Skilled",
        quantity,
        budgetMax: 250,
      },
    ],
    ...overrides,
  };
}

function worker(id, grade = "Skilled") {
  return { id, trade: "Electrical", specialism: "General Electrical", grade };
}

function application(id, jobId, workerId, status = "offered", extra = {}) {
  return { id, jobId, workerId, status, ...extra };
}

// A-C: requested quantities materialize as stable slots only at project level.
[1, 3, 10].forEach((quantity) => {
  const job = project(quantity);
  slots.ensureProject(job, { now: "2026-09-01T09:00:00.000Z" });
  assert.equal(job.placementSlots.length, quantity);
  assert.equal(new Set(job.placementSlots.map((slot) => slot.slotId)).size, quantity);
  const requirementId = job.labourRequirements[0].requirementId;
  assert.ok(requirementId);
  slots.ensureProject(job, { now: "2026-09-02T09:00:00.000Z" });
  assert.equal(job.labourRequirements[0].requirementId, requirementId);
  assert.equal(job.placementSlots.length, quantity, "reload must not duplicate slots");
});

const reorderedLegacy = project(2, {
  id: "legacy-reordered",
  labourRequirements: [
    { trade: "Electrical", specialism: "General Electrical", grade: "Skilled", quantity: 1 },
    { trade: "Electrical", specialism: "Testing", grade: "Approved", quantity: 1 },
  ],
});
slots.ensureRequirementIds(reorderedLegacy);
const requirementIdsByRole = Object.fromEntries(
  reorderedLegacy.labourRequirements.map((item) => [item.specialism, item.requirementId]),
);
const reorderedCopy = project(2, {
  id: reorderedLegacy.id,
  labourRequirements: [
    { trade: "Electrical", specialism: "Testing", grade: "Approved", quantity: 1 },
    { trade: "Electrical", specialism: "General Electrical", grade: "Skilled", quantity: 1 },
  ],
});
slots.ensureRequirementIds(reorderedCopy);
assert.equal(
  reorderedCopy.labourRequirements.find((item) => item.specialism === "Testing").requirementId,
  requirementIdsByRole.Testing,
  "legacy requirement identity must not depend on array position",
);
const duplicateLegacy = project(2, {
  id: "legacy-duplicate",
  labourRequirements: [
    { trade: "Electrical", specialism: "General Electrical", grade: "Skilled", quantity: 2 },
    { trade: "Electrical", specialism: "General Electrical", grade: "Skilled", quantity: 2 },
  ],
});
slots.ensureRequirementIds(duplicateLegacy);
assert.equal(duplicateLegacy.labourRequirements.length, 1);

// D-E: workers occupy distinct slots and duplicate overlapping allocation is blocked.
const multi = project(3, { id: "multi" });
const alice = worker("worker-alice");
const ben = worker("worker-ben");
const aliceApp = application("app-alice", multi.id, alice.id, "under_company_review");
const benApp = application("app-ben", multi.id, ben.id, "under_company_review");
slots.ensureProject(multi, {
  applications: [aliceApp, benApp],
  workers: [alice, ben],
  now: "2026-09-01T09:00:00.000Z",
});
assert.equal(slots.confirmSlot(multi, alice, aliceApp, [multi]).ok, true);
assert.equal(slots.confirmSlot(multi, ben, benApp, [multi]).ok, true);
assert.notEqual(aliceApp.placementSlotId, benApp.placementSlotId);
assert.deepEqual(slots.counts(multi), {
  required: 3,
  filled: 2,
  open: 1,
  underOffer: 0,
  committed: 2,
});
const duplicateApp = application("app-alice-2", multi.id, alice.id, "under_company_review");
assert.equal(slots.confirmSlot(multi, alice, duplicateApp, [multi]).ok, false);

const overlap = project(1, { id: "overlap" });
slots.ensureProject(overlap);
assert.equal(
  slots.confirmSlot(
    overlap,
    alice,
    application("app-overlap", overlap.id, alice.id, "under_company_review"),
    [multi, overlap],
  ).ok,
  false,
);

// F-G: release preserves history and a replacement reuses the affected slot.
const releasedSlotId = aliceApp.placementSlotId;
assert.equal(
  slots.releaseWorker(multi, alice.id, {
    status: "immediate_release",
    reason: "Site requirement changed",
  }).ok,
  true,
);
const releasedSlot = multi.placementSlots.find((slot) => slot.slotId === releasedSlotId);
assert.equal(releasedSlot.status, slots.SLOT_STATUS.RELEASED);
assert.equal(releasedSlot.history[0].workerId, alice.id);
const cara = worker("worker-cara");
const caraApp = application("app-cara", multi.id, cara.id, "under_company_review", {
  requirementId: releasedSlot.requirementId,
  placementSlotId: releasedSlotId,
});
assert.equal(slots.confirmSlot(multi, cara, caraApp, [multi]).ok, true);
assert.equal(caraApp.placementSlotId, releasedSlotId);
assert.equal(releasedSlot.history[0].workerId, alice.id);

// H-J: increases add slots, decreases retire open slots, committed history wins.
const requirementId = multi.labourRequirements[0].requirementId;
assert.equal(slots.adjustRequirementQuantity(multi, requirementId, 5).added, 2);
assert.equal(slots.counts(multi).required, 5);
assert.equal(slots.adjustRequirementQuantity(multi, requirementId, 2).retired, 3);
assert.equal(slots.counts(multi).required, 2);
const conflict = slots.adjustRequirementQuantity(multi, requirementId, 1);
assert.equal(conflict.ok, false);
assert.match(conflict.reason, /committed or historical placements/);
assert.equal(slots.counts(multi).required, 2);

// K-L and migration cases: refresh is idempotent and legacy allocations survive.
const serialized = JSON.parse(JSON.stringify(multi));
slots.ensureProject(serialized, {
  applications: [aliceApp, benApp, caraApp],
  workers: [alice, ben, cara],
});
assert.equal(slots.counts(serialized).required, 2);
assert.deepEqual(new Set(slots.assignedWorkerIds(serialized)), new Set([ben.id, cara.id]));

const legacySingle = project(1, {
  id: "legacy-single",
  assignedWorkerId: "legacy-worker",
  labourRequirements: undefined,
});
slots.ensureProject(legacySingle, { workers: [worker("legacy-worker")] });
assert.equal(slots.counts(legacySingle).filled, 1);
assert.equal(legacySingle.placementSlots[0].workerId, "legacy-worker");

const legacyMultiple = project(3, {
  id: "legacy-multiple",
  assignedWorkerId: "legacy-one",
  assignedWorkerIds: ["legacy-one", "legacy-two"],
});
slots.ensureProject(legacyMultiple, {
  workers: [worker("legacy-one"), worker("legacy-two")],
});
assert.equal(slots.counts(legacyMultiple).filled, 2);
assert.equal(slots.counts(legacyMultiple).open, 1);

const legacyOverCapacity = project(1, {
  id: "legacy-over-capacity",
  assignedWorkerIds: ["over-one", "over-two"],
});
slots.ensureProject(legacyOverCapacity, {
  workers: [worker("over-one"), worker("over-two")],
});
assert.equal(legacyOverCapacity.labourRequirements[0].quantity, 2);
assert.equal(slots.counts(legacyOverCapacity).filled, 2);
assert.equal(slots.counts(legacyOverCapacity).required, 2);

const completed = project(1, {
  id: "legacy-completed",
  completed: true,
  completedAt: "2026-11-01T12:00:00.000Z",
  assignedWorkerId: "completed-worker",
});
slots.ensureProject(completed, { workers: [worker("completed-worker")] });
assert.equal(completed.placementSlots[0].status, slots.SLOT_STATUS.COMPLETED);

const legacyHistory = project(2, { id: "legacy-history" });
const releasedApplication = application(
  "released-app",
  legacyHistory.id,
  "released-worker",
  "confirmed",
);
const legacyRelease = {
  id: "release-one",
  jobId: legacyHistory.id,
  workerId: "released-worker",
  releaseType: "immediate_release",
  releasedAt: "2026-09-15T12:00:00.000Z",
  reason: "Assignment changed",
};
const legacyReplacement = {
  id: "replacement-one",
  jobId: legacyHistory.id,
  linkedReleaseId: legacyRelease.id,
};
slots.linkLegacyHistory(legacyHistory, {
  workers: [worker("released-worker")],
  applications: [releasedApplication],
  releases: [legacyRelease],
  replacementTasks: [legacyReplacement],
});
assert.ok(legacyRelease.requirementId);
assert.ok(legacyRelease.placementSlotId);
assert.equal(legacyReplacement.placementSlotId, legacyRelease.placementSlotId);
assert.equal(releasedApplication.status, "released");
assert.equal(slots.counts(legacyHistory).filled, 0);
assert.equal(
  legacyHistory.placementSlots
    .find((slot) => slot.slotId === legacyRelease.placementSlotId)
    .history[0].workerId,
  legacyRelease.workerId,
);

const ongoing = project(1, {
  id: "ongoing",
  noFixedEndDate: true,
  ongoing: true,
  estimatedEndDate: "",
});
const future = project(1, {
  id: "future-overlap",
  start: "2027-01-01",
  estimatedEndDate: "2027-01-31",
});
const ongoingWorker = worker("ongoing-worker");
slots.ensureProject(ongoing);
assert.equal(
  slots.confirmSlot(
    ongoing,
    ongoingWorker,
    application("ongoing-app", ongoing.id, ongoingWorker.id, "under_company_review"),
    [ongoing],
  ).ok,
  true,
);
slots.ensureProject(future);
assert.equal(
  slots.confirmSlot(
    future,
    ongoingWorker,
    application("future-app", future.id, ongoingWorker.id, "under_company_review"),
    [ongoing, future],
  ).ok,
  false,
  "open-ended assignments must block future overlapping placements",
);

console.log("placement slot lifecycle tests passed");
