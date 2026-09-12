"use strict";

const assert = require("node:assert/strict");
const events = require("../marketplace-events.js");
const slots = require("../placement-slots.js");

function append(state, eventType, occurredAt, details = {}, key = "") {
  return events.append(
    state,
    {
      eventType,
      occurredAt,
      actorType: details.actorType || "system",
      companyId: "company-1",
      projectId: "project-1",
      ...details,
    },
    { idempotencyKey: key || `${eventType}:${occurredAt}` },
  );
}

const privacyState = {};
const first = append(
  privacyState,
  events.EVENT_TYPES.REQUEST_POSTED,
  "2026-09-01T08:00:00.000Z",
  {
    metadata: {
      tradeKey: "electrical",
      locationId: "manchester",
      gpsLat: 53.48,
      gpsLongitude: -2.24,
      workerPrivateMinimumRate: 220,
      homeAddress: "Private address",
      documentContents: "Private document",
      nested: { matchScore: 91, backgroundCheckDetails: "Private result" },
    },
  },
  "request-posted-project-1-v1",
);
assert.equal(first.ok, true);
assert.equal(first.duplicate, false);
assert.ok(first.event.eventId);
assert.equal(first.event.metadata.tradeKey, "electrical");
assert.equal(first.event.metadata.nested.matchScore, 91);
assert.equal("gpsLat" in first.event.metadata, false);
assert.equal("gpsLongitude" in first.event.metadata, false);
assert.equal("workerPrivateMinimumRate" in first.event.metadata, false);
assert.equal("homeAddress" in first.event.metadata, false);
assert.equal("documentContents" in first.event.metadata, false);
assert.equal("backgroundCheckDetails" in first.event.metadata.nested, false);
assert.equal(Object.isFrozen(first.event), true);
assert.equal(Object.isFrozen(first.event.metadata), true);

const reloadedState = {
  marketplaceEvents: [JSON.parse(JSON.stringify(first.event))],
};
events.list(reloadedState);
assert.equal(Object.isFrozen(reloadedState.marketplaceEvents[0]), true);
assert.equal(Object.isFrozen(reloadedState.marketplaceEvents[0].metadata), true);

const duplicate = append(
  privacyState,
  events.EVENT_TYPES.REQUEST_POSTED,
  "2026-09-01T08:00:00.000Z",
  { metadata: { tradeKey: "changed" } },
  "request-posted-project-1-v1",
);
assert.equal(duplicate.duplicate, true);
assert.equal(privacyState.marketplaceEvents.length, 1);
assert.equal(privacyState.marketplaceEvents[0].metadata.tradeKey, "electrical");

assert.equal(events.nextRequestVersion(undefined), 2);
assert.equal(events.nextRequestVersion(4), 5);

const offerOne = events.offerAttemptIdentity([], {
  projectId: "project-1",
  requirementId: "requirement-1",
  slotId: "slot-1",
  applicationId: "application-1",
  occurredAt: "2026-09-01T08:01:00.000Z",
});
const applications = [{
  offerAttemptId: offerOne.offerAttemptId,
  offerChainId: offerOne.offerChainId,
  offerAttemptNumber: offerOne.attemptNumber,
}];
const offerTwo = events.offerAttemptIdentity(applications, {
  projectId: "project-1",
  requirementId: "requirement-1",
  slotId: "slot-1",
  applicationId: "application-2",
  occurredAt: "2026-09-01T09:00:00.000Z",
});
assert.equal(offerOne.attemptNumber, 1);
assert.equal(offerTwo.attemptNumber, 2);
assert.equal(offerOne.offerChainId, offerTwo.offerChainId);
assert.notEqual(offerOne.offerAttemptId, offerTwo.offerAttemptId);

const project = {
  id: "project-1",
  start: "2026-10-01",
  estimatedEndDate: "2026-10-31",
  trade: "Electrical",
  labourRequirements: [{
    trade: "Electrical",
    specialism: "General Electrical",
    grade: "Skilled",
    quantity: 2,
    budgetMax: 250,
  }],
};
const workerOne = { id: "worker-1", trade: "Electrical", grade: "Skilled" };
const workerTwo = { id: "worker-2", trade: "Electrical", grade: "Skilled" };
slots.ensureProject(project, {
  workers: [workerOne, workerTwo],
  now: "2026-09-01T08:00:00.000Z",
});
const requirementId = project.labourRequirements[0].requirementId;
const appOne = {
  id: "application-1",
  jobId: project.id,
  workerId: workerOne.id,
  requirementId,
  status: "interested",
};
const appTwo = {
  id: "application-2",
  jobId: project.id,
  workerId: workerTwo.id,
  requirementId,
  status: "interested",
};
assert.equal(slots.reserveSlot(project, workerOne, appOne, [project]).ok, true);
assert.equal(slots.confirmSlot(project, workerOne, appOne, [project]).ok, true);
assert.equal(slots.reserveSlot(project, workerTwo, appTwo, [project]).ok, true);
assert.equal(slots.confirmSlot(project, workerTwo, appTwo, [project]).ok, true);
assert.notEqual(appOne.placementSlotId, appTwo.placementSlotId);

const lifecycle = { marketplaceEvents: [] };
const sequence = [
  events.EVENT_TYPES.REQUEST_POSTED,
  events.EVENT_TYPES.MATCH_GENERATED,
  events.EVENT_TYPES.OFFER_SENT,
  events.EVENT_TYPES.OFFER_ACCEPTED_WORKER,
  events.EVENT_TYPES.COMPANY_ACCEPTED,
  events.EVENT_TYPES.BOOKING_CONFIRMED,
  events.EVENT_TYPES.SLOT_FILLED,
  events.EVENT_TYPES.AGREEMENT_ACTIVE,
  events.EVENT_TYPES.PROJECT_EXTENDED,
  events.EVENT_TYPES.ASSIGNMENT_STARTED,
  events.EVENT_TYPES.SLOT_RELEASED,
  events.EVENT_TYPES.REPLACEMENT_REQUESTED,
  events.EVENT_TYPES.REPLACEMENT_OFFERED,
  events.EVENT_TYPES.REPLACEMENT_FILLED,
];
sequence.forEach((eventType, index) => {
  append(
    lifecycle,
    eventType,
    `2026-09-${String(index + 1).padStart(2, "0")}T08:00:00.000Z`,
    {
      requirementId,
      slotId: appOne.placementSlotId,
      workerId: index < 10 ? workerOne.id : workerTwo.id,
      applicationId: index < 10 ? appOne.id : appTwo.id,
      offerAttemptId: index < 10 ? offerOne.offerAttemptId : offerTwo.offerAttemptId,
    },
    `lifecycle:${eventType}`,
  );
});
assert.deepEqual(
  events.list(lifecycle, { projectId: project.id }).map((event) => event.eventType),
  sequence,
);

const outcomes = { marketplaceEvents: [] };
[
  events.EVENT_TYPES.OFFER_DECLINED_WORKER,
  events.EVENT_TYPES.OFFER_EXPIRED,
  events.EVENT_TYPES.OFFER_SUPERSEDED,
  events.EVENT_TYPES.COMPANY_DECLINED,
].forEach((eventType, index) => {
  append(
    outcomes,
    eventType,
    `2026-10-0${index + 1}T09:00:00.000Z`,
    {
      requirementId,
      slotId: appOne.placementSlotId,
      offerAttemptId: index < 2 ? offerOne.offerAttemptId : offerTwo.offerAttemptId,
    },
    `outcome:${eventType}`,
  );
});
assert.equal(events.list(outcomes).length, 4);
assert.equal(events.list(outcomes)[0].eventType, events.EVENT_TYPES.OFFER_DECLINED_WORKER);
assert.equal(events.list(outcomes)[3].eventType, events.EVENT_TYPES.COMPANY_DECLINED);

const released = slots.releaseWorker(project, workerOne.id, {
  status: "immediate_release",
  reason: "Project requirement changed",
});
assert.equal(released.ok, true);
const replacement = {
  id: "application-replacement",
  jobId: project.id,
  workerId: "worker-3",
  requirementId,
  placementSlotId: appOne.placementSlotId,
  status: "interested",
};
const workerThree = { id: "worker-3", trade: "Electrical", grade: "Skilled" };
assert.equal(slots.reserveSlot(project, workerThree, replacement, [project]).ok, true);
assert.equal(slots.confirmSlot(project, workerThree, replacement, [project]).ok, true);
assert.equal(replacement.placementSlotId, appOne.placementSlotId);

const assignmentStarts = { marketplaceEvents: [] };
append(
  assignmentStarts,
  events.EVENT_TYPES.ASSIGNMENT_STARTED,
  "2026-10-01T07:30:00.000Z",
  {
    slotId: appOne.placementSlotId,
    workerId: workerOne.id,
    applicationId: appOne.id,
  },
  `assignment_started:${project.id}:${appOne.placementSlotId}:${appOne.id}`,
);
append(
  assignmentStarts,
  events.EVENT_TYPES.ASSIGNMENT_STARTED,
  "2026-10-15T07:30:00.000Z",
  {
    slotId: replacement.placementSlotId,
    workerId: workerThree.id,
    applicationId: replacement.id,
  },
  `assignment_started:${project.id}:${replacement.placementSlotId}:${replacement.id}`,
);
assert.equal(events.list(assignmentStarts).length, 2);

console.log("marketplace event history tests passed");
