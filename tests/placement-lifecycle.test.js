"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  PlacementLifecycleError,
  createPlacementLifecycleService,
  createSupabasePlacementLifecycleAdapter,
  placementLifecycleProjection,
} = require("../server-placement-lifecycle.js");
const {
  CAPACITY_STATUSES,
  TERMINAL_STATUSES,
} = require("../placement-lifecycle-rules.js");

const COMPANY_A = "00000000-0000-4000-8000-000000000001";
const COMPANY_B = "00000000-0000-4000-8000-000000000002";
const ADMIN_A = "00000000-0000-4000-8000-000000000011";
const ADMIN_B = "00000000-0000-4000-8000-000000000014";
const MANAGER_A = "00000000-0000-4000-8000-000000000012";
const SUPERVISOR_A = "00000000-0000-4000-8000-000000000013";
const WORKER_A = "00000000-0000-4000-8000-000000000101";
const WORKER_B = "00000000-0000-4000-8000-000000000102";
const WORKER_USER_A = "00000000-0000-4000-8000-000000000111";
const WORKER_USER_B = "00000000-0000-4000-8000-000000000112";
const PROJECT_A = "00000000-0000-4000-8000-000000000201";
const PROJECT_B = "00000000-0000-4000-8000-000000000202";
const REQUIREMENT_A = "00000000-0000-4000-8000-000000000301";
const PLACEMENT_A = "00000000-0000-4000-8000-000000000401";
const PLACEMENT_B = "00000000-0000-4000-8000-000000000402";
const TEST_TODAY = "2026-09-16";
const TEST_NOW = "2026-09-16T10:00:00.000Z";

function companyPrincipal(role = "Administrator", companyId = COMPANY_A) {
  const user = {
    administrator: ADMIN_A,
    manager: MANAGER_A,
    supervisor: SUPERVISOR_A,
  }[role.toLowerCase()] || ADMIN_A;
  const actorUserId = companyId === COMPANY_B ? ADMIN_B : user;
  return {
    type: "company",
    id: companyId,
    companyId,
    authUserId: actorUserId,
    permissionRole: role,
    serverAuthenticated: true,
  };
}

function workerPrincipal(workerId = WORKER_A) {
  return {
    type: "worker",
    id: workerId,
    workerId,
    authUserId: workerId === WORKER_A ? WORKER_USER_A : WORKER_USER_B,
    serverAuthenticated: true,
  };
}

function placementRow(overrides = {}) {
  return {
    id: PLACEMENT_A,
    worker_id: WORKER_A,
    project_requirement_id: REQUIREMENT_A,
    accepted_offer_id: "00000000-0000-4000-8000-000000000501",
    application_id: "00000000-0000-4000-8000-000000000601",
    status: "upcoming",
    agreed_day_rate: 250,
    project_name_snapshot: "Northgate Tower",
    job_number_snapshot: "HS2-001",
    company_name_snapshot: "Company A",
    location_label_snapshot: "London",
    trade_snapshot: "Electrical",
    role_snapshot: "Electrician",
    grade_snapshot: "Skilled",
    agreed_work_activity: "Lighting installation",
    agreed_start_date: "2026-10-01",
    agreed_estimated_end_date: "2026-12-18",
    agreed_no_fixed_end_date: false,
    agreed_duration_label: "12 weeks",
    agreed_working_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    agreed_shift_start_time: "07:30:00",
    agreed_shift_finish_time: "16:30:00",
    agreed_accommodation_paid: true,
    agreed_accommodation_arrangement: "allowance",
    agreed_accommodation_allowance_per_night: 45,
    agreed_overtime_available: true,
    agreed_overtime_rates: { afterHours: "time_and_a_half" },
    agreed_weekend_rates: { saturday: 300 },
    current_day_rate: 250,
    current_work_activity: "Lighting installation",
    current_start_date: "2026-10-01",
    current_estimated_end_date: "2026-12-18",
    current_no_fixed_end_date: false,
    current_duration_label: "12 weeks",
    current_working_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    current_shift_start_time: "07:30:00",
    current_shift_finish_time: "16:30:00",
    scheduled_end_date: null,
    scheduled_end_type: null,
    ended_at: null,
    end_reason_code: null,
    end_reason_text: null,
    created_at: "2026-09-16T08:00:00.000Z",
    updated_at: "2026-09-16T08:00:00.000Z",
    project_requirements: {
      id: REQUIREMENT_A,
      project_id: PROJECT_A,
      projects: { id: PROJECT_A, company_id: COMPANY_A, status: "open" },
    },
    worker_profiles: {
      id: WORKER_A,
      name: "Alice Carter",
      trade: "Electrical",
      trade_key: "electrical",
      specialism: "Electrician",
      role_key: "electrician",
      grade: "Skilled",
      years_experience: 8,
      location: "London",
      profile_photo_reference: "photo-ref",
      private_minimum_day_rate: 220,
      user_id: WORKER_USER_A,
    },
    placement_lifecycle_events: [],
    placement_change_offers: [],
    ...overrides,
  };
}

function fakeLifecycleAdapter() {
  const clone = (value) => structuredClone(value);
  const placements = new Map([
    [PLACEMENT_A, placementRow()],
    [PLACEMENT_B, placementRow({
      id: PLACEMENT_B,
      worker_id: WORKER_B,
      project_name_snapshot: "Other Project",
      project_requirements: {
        id: "00000000-0000-4000-8000-000000000302",
        project_id: PROJECT_B,
        projects: { id: PROJECT_B, company_id: COMPANY_B, status: "open" },
      },
      worker_profiles: { id: WORKER_B, name: "Ben Evans", private_minimum_day_rate: 300 },
    })],
  ]);
  let changeSequence = 700;
  let eventSequence = 800;
  let failNextResponse = false;
  const placementLookupIds = [];
  const uuid = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
  const actorCompany = (userId) => {
    if ([ADMIN_A, MANAGER_A, SUPERVISOR_A].includes(userId)) return COMPANY_A;
    return COMPANY_B;
  };
  const actorRole = (userId) => {
    if (userId === MANAGER_A) return "manager";
    if (userId === SUPERVISOR_A) return "supervisor";
    return "administrator";
  };
  const actorWorker = (userId) => userId === WORKER_USER_A ? WORKER_A : WORKER_B;

  function addEvent(row, values) {
    row.placement_lifecycle_events.unshift({
      id: uuid(++eventSequence),
      placement_id: row.id,
      initiated_by_role: null,
      notice_days: null,
      notice_classification: null,
      worker_fault: false,
      metadata: {},
      private_company_notes: null,
      created_at: new Date().toISOString(),
      ...values,
    });
  }

  const adapter = {
    configured: true,
    placements,
    setFailNextResponse(value) { failNextResponse = value; },
    placementLookupIds,
    async normalize() {
      for (const row of placements.values()) {
        if (
          ["upcoming", "active"].includes(row.status)
          && row.scheduled_end_date
          && row.scheduled_end_date <= TEST_TODAY
        ) {
          row.status = "released";
          row.ended_at ||= TEST_NOW;
        } else if (
          ["upcoming", "active"].includes(row.status)
          && !row.current_no_fixed_end_date
          && row.current_estimated_end_date < TEST_TODAY
        ) {
          row.status = "completed";
          row.ended_at ||= TEST_NOW;
        } else if (row.status === "upcoming" && row.current_start_date <= TEST_TODAY) {
          row.status = "active";
        }
      }
    },
    async getPlacement(id) {
      placementLookupIds.push(id);
      if (!/^[0-9a-f-]{36}$/i.test(id || "")) {
        throw new PlacementLifecycleError(
          `invalid input syntax for type uuid: "${String(id)}"`,
          400,
          "22P02",
        );
      }
      return clone(placements.get(id) || null);
    },
    async listWorkerPlacements(workerId) {
      return clone([...placements.values()].filter((row) => row.worker_id === workerId));
    },
    async listCompanyPlacements(companyId) {
      return clone([...placements.values()].filter(
        (row) => row.project_requirements.projects.company_id === companyId,
      ));
    },
    async release(input) {
      const row = placements.get(input.placementId);
      if (!row || row.project_requirements.projects.company_id !== actorCompany(input.actorUserId)) {
        throw new PlacementLifecycleError("Company cannot release this placement.", 403, "PLACEMENT_PERMISSION_DENIED");
      }
      const terminal = input.releaseType !== "standard_release";
      const effectiveDate = input.effectiveDate || (terminal ? TEST_TODAY : "2026-09-23");
      const reasonText = input.reasonText || input.reason;
      const idempotencyKey = `company_release:${row.id}:${input.releaseType}:${effectiveDate}`;
      if (row.scheduled_end_date || row.scheduled_end_type) {
        const existing = row.placement_lifecycle_events.find(
          (event) => event.idempotency_key === idempotencyKey,
        );
        const equivalent =
          row.scheduled_end_date === effectiveDate
          && row.scheduled_end_type === "company_release"
          && row.end_reason_code === input.reason
          && row.end_reason_text === reasonText
          && existing?.private_company_notes === (input.notes || null)
          && existing?.metadata?.release_type === input.releaseType
          && !!existing?.metadata?.replacement_requested === !!input.replacementRequested;
        if (equivalent) {
          return {
            outcome: terminal ? "released" : "release_scheduled",
            placement_id: row.id,
            event_id: existing.id,
            idempotent: true,
          };
        }
        throw new PlacementLifecycleError(
          "This placement already has a different scheduled end.",
          409,
          "PLACEMENT_STATE_CONFLICT",
        );
      }
      if (
        !terminal
        && !row.current_no_fixed_end_date
        && row.current_estimated_end_date
        && effectiveDate > row.current_estimated_end_date
      ) {
        throw new PlacementLifecycleError(
          "The scheduled release cannot be after the placement end date.",
          400,
          "INVALID_RELEASE",
        );
      }
      row.scheduled_end_date = effectiveDate;
      row.scheduled_end_type = "company_release";
      row.end_reason_code = input.reason;
      row.end_reason_text = reasonText;
      if (terminal) {
        row.status = "released";
        row.ended_at = TEST_NOW;
      }
      addEvent(row, {
        event_type: terminal ? "released" : "release_scheduled",
        initiated_by_type: "company",
        initiated_by_role: actorRole(input.actorUserId),
        reason_code: input.reason,
        reason_text: input.reasonText,
        requested_at: TEST_NOW,
        effective_at: `${effectiveDate}T00:00:00.000Z`,
        notice_days: terminal ? 0 : 5,
        notice_classification: terminal ? "immediate_company_release" : "standard_5_working_days",
        worker_fault: input.releaseType === "immediate_release" && input.reason === "No-show",
        metadata: { release_type: input.releaseType, replacement_requested: input.replacementRequested },
        private_company_notes: input.notes || null,
        idempotency_key: idempotencyKey,
      });
      return { outcome: terminal ? "released" : "release_scheduled", placement_id: row.id };
    },
    async requestWorkerEnd(input) {
      const row = placements.get(input.placementId);
      if (!row || row.worker_id !== actorWorker(input.actorUserId)) {
        throw new PlacementLifecycleError("Placement not found.", 404, "PLACEMENT_NOT_FOUND");
      }
      const effectiveDate = input.effectiveDate || "2026-09-23";
      const reasonText = input.reasonText || input.reason;
      const idempotencyKey = `worker_end:${row.id}:${effectiveDate}`;
      if (row.scheduled_end_date || row.scheduled_end_type) {
        const existing = row.placement_lifecycle_events.find(
          (event) => event.idempotency_key === idempotencyKey,
        );
        if (
          row.scheduled_end_date === effectiveDate
          && row.scheduled_end_type === "worker_end"
          && row.end_reason_code === input.reason
          && row.end_reason_text === reasonText
          && existing
        ) {
          return {
            outcome: effectiveDate <= TEST_TODAY ? "released" : "end_scheduled",
            placement_id: row.id,
            event_id: existing.id,
            idempotent: true,
          };
        }
        throw new PlacementLifecycleError(
          "This placement already has a different scheduled end.",
          409,
          "PLACEMENT_STATE_CONFLICT",
        );
      }
      row.scheduled_end_date = effectiveDate;
      row.scheduled_end_type = "worker_end";
      row.end_reason_code = input.reason;
      row.end_reason_text = reasonText;
      if (effectiveDate <= TEST_TODAY) {
        row.status = "released";
        row.ended_at = TEST_NOW;
      }
      addEvent(row, {
        event_type: "worker_end_requested",
        initiated_by_type: "worker",
        reason_code: input.reason,
        reason_text: input.reasonText,
        requested_at: TEST_NOW,
        effective_at: `${row.scheduled_end_date}T00:00:00.000Z`,
        notice_days: 5,
        notice_classification: "worker_requested_end",
        idempotency_key: idempotencyKey,
      });
      return {
        outcome: effectiveDate <= TEST_TODAY ? "released" : "end_scheduled",
        placement_id: row.id,
      };
    },
    async complete(input) {
      const row = placements.get(input.placementId);
      if (!row || row.project_requirements.projects.company_id !== actorCompany(input.actorUserId)) {
        throw new PlacementLifecycleError("Placement not found.", 404, "PLACEMENT_NOT_FOUND");
      }
      const effectiveDate = input.effectiveDate || TEST_TODAY;
      if (effectiveDate > TEST_TODAY) {
        throw new PlacementLifecycleError(
          "A completion date cannot be in the future.",
          400,
          "INVALID_COMPLETION_DATE",
        );
      }
      if (effectiveDate < row.current_start_date) {
        throw new PlacementLifecycleError(
          "A completion date cannot be before the placement start date.",
          400,
          "INVALID_COMPLETION_DATE",
        );
      }
      if (
        !row.current_no_fixed_end_date
        && row.current_estimated_end_date
        && effectiveDate > row.current_estimated_end_date
      ) {
        throw new PlacementLifecycleError(
          "A completion date cannot be after the placement end date.",
          400,
          "INVALID_COMPLETION_DATE",
        );
      }
      if (row.scheduled_end_date || row.scheduled_end_type) {
        throw new PlacementLifecycleError(
          "This placement already has a scheduled end.",
          409,
          "PLACEMENT_STATE_CONFLICT",
        );
      }
      row.status = "completed";
      row.ended_at = `${effectiveDate}T00:00:00.000Z`;
      addEvent(row, {
        event_type: "completed",
        initiated_by_type: "company",
        reason_code: "company_confirmed_completion",
        requested_at: TEST_NOW,
        effective_at: row.ended_at,
        idempotency_key: `company_completed:${row.id}:${effectiveDate}`,
      });
      return { outcome: "completed", placement_id: row.id };
    },
    async proposeChange(input) {
      const row = placements.get(input.placementId);
      if (!row || row.project_requirements.projects.company_id !== actorCompany(input.actorUserId)) {
        throw new PlacementLifecycleError("Company cannot change this placement.", 403, "PLACEMENT_PERMISSION_DENIED");
      }
      if (!["upcoming", "active"].includes(row.status)) {
        throw new PlacementLifecycleError(
          "This placement can no longer be changed.",
          409,
          "PLACEMENT_STATE_CONFLICT",
        );
      }
      if (input.changeType === "extension" && row.scheduled_end_date) {
        throw new PlacementLifecycleError(
          "A placement with a scheduled end cannot be extended.",
          409,
          "PLACEMENT_STATE_CONFLICT",
        );
      }
      if (
        input.changeType === "schedule_change"
        && (
          (
            !row.current_no_fixed_end_date
            && row.current_estimated_end_date
            && input.effectiveDate > row.current_estimated_end_date
          )
          || (row.scheduled_end_date && input.effectiveDate > row.scheduled_end_date)
        )
      ) {
        throw new PlacementLifecycleError(
          "The change cannot take effect after the placement ends.",
          400,
          "INVALID_PLACEMENT_CHANGE",
        );
      }
      const id = uuid(++changeSequence);
      row.placement_change_offers.unshift({
        id,
        placement_id: row.id,
        status: "pending",
        change_type: input.changeType,
        proposed_terms: clone(input.proposedTerms),
        effective_date: input.effectiveDate || row.current_estimated_end_date,
        expires_at: "2099-01-01T00:00:00.000Z",
        responded_at: null,
        applied_at: null,
        decline_reason: null,
        decline_comment: null,
        created_at: "2026-09-16T10:00:00.000Z",
        updated_at: "2026-09-16T10:00:00.000Z",
      });
      addEvent(row, {
        event_type: "change_proposed",
        initiated_by_type: "company",
        reason_code: input.changeType,
        requested_at: "2026-09-16T10:00:00.000Z",
        effective_at: `${input.effectiveDate || row.current_estimated_end_date}T00:00:00.000Z`,
        metadata: { change_offer_id: id, proposed_terms: clone(input.proposedTerms) },
      });
      return id;
    },
    async respondChange(input) {
      for (const row of placements.values()) {
        const change = row.placement_change_offers.find((item) => item.id === input.changeOfferId);
        if (!change) continue;
        if (row.worker_id !== actorWorker(input.actorUserId)) {
          throw new PlacementLifecycleError("Placement change not found.", 404, "PLACEMENT_CHANGE_NOT_FOUND");
        }
        if (change.status !== "pending") {
          return {
            outcome: ["accepted", "declined"].includes(change.status)
              ? `already_${change.status}`
              : change.status,
            change_offer_id: change.id,
          };
        }
        if (change.expires_at <= "2026-09-16T10:00:00.000Z") {
          change.status = "expired";
          return { outcome: "expired", change_offer_id: change.id };
        }
        if (!["upcoming", "active"].includes(row.status)) {
          return { outcome: "placement_ended", change_offer_id: change.id };
        }
        if (failNextResponse) {
          failNextResponse = false;
          throw new PlacementLifecycleError("Atomic change failed.", 409, "PLACEMENT_STATE_CONFLICT");
        }
        if (
          input.accept
          && (
            (change.change_type === "extension" && row.scheduled_end_date)
            || (
              change.change_type === "schedule_change"
              && (
                (
                  !row.current_no_fixed_end_date
                  && row.current_estimated_end_date
                  && change.effective_date > row.current_estimated_end_date
                )
                || (row.scheduled_end_date && change.effective_date > row.scheduled_end_date)
              )
            )
          )
        ) {
          return {
            outcome: "scheduled_end_conflict",
            change_offer_id: change.id,
          };
        }
        change.status = input.accept ? "accepted" : "declined";
        change.responded_at = "2026-09-16T11:00:00.000Z";
        change.decline_reason = input.reason || null;
        change.decline_comment = input.comment || null;
        if (input.accept && change.change_type === "extension") {
          row.current_estimated_end_date = change.proposed_terms.estimated_end_date;
          if (change.proposed_terms.day_rate) row.current_day_rate = change.proposed_terms.day_rate;
          change.applied_at = change.responded_at;
        }
        if (input.accept && change.change_type === "schedule_change") {
          row.current_shift_start_time = change.proposed_terms.shift_start_time;
          row.current_shift_finish_time = change.proposed_terms.shift_finish_time;
          change.applied_at = change.responded_at;
        }
        addEvent(row, {
          event_type: input.accept ? "change_accepted" : "change_declined",
          initiated_by_type: "worker",
          reason_code: change.change_type,
          reason_text: input.reason || null,
          requested_at: change.created_at,
          effective_at: change.responded_at,
          metadata: { change_offer_id: change.id, accepted_terms: clone(change.proposed_terms) },
        });
        return {
          outcome: change.status,
          change_offer_id: change.id,
          ...(input.accept ? { placement_id: row.id } : {}),
        };
      }
      throw new PlacementLifecycleError("Placement change not found.", 404, "PLACEMENT_CHANGE_NOT_FOUND");
    },
  };
  return adapter;
}

test("projection keeps original and effective terms distinct and strips private worker data", () => {
  const row = placementRow({
    current_day_rate: 275,
    current_estimated_end_date: "2027-01-15",
    placement_lifecycle_events: [{
      id: "event-1",
      placement_id: PLACEMENT_A,
      event_type: "release_scheduled",
      initiated_by_type: "company",
      initiated_by_role: "manager",
      reason_code: "Site no longer requires worker",
      reason_text: "Site no longer requires worker",
      requested_at: "2026-09-16T10:00:00.000Z",
      effective_at: "2026-09-23T00:00:00.000Z",
      notice_days: 5,
      notice_classification: "standard_5_working_days",
      worker_fault: false,
      metadata: {},
      private_company_notes: "Internal note",
      created_at: "2026-09-16T10:00:00.000Z",
    }],
  });
  const workerView = placementLifecycleProjection(row);
  assert.equal(workerView.originalTerms.dayRate, 250);
  assert.equal(workerView.effectiveTerms.dayRate, 275);
  assert.equal(workerView.originalTerms.estimatedEndDate, "2026-12-18");
  assert.equal(workerView.effectiveTerms.estimatedEndDate, "2027-01-15");
  assert.equal(workerView.lifecycleEvents[0].privateNotes, undefined);
  assert.equal(workerView.worker, undefined);
  assert.equal(JSON.stringify(workerView).includes("private_minimum_day_rate"), false);
  assert.equal(placementLifecycleProjection(row, { company: true }).lifecycleEvents[0].privateNotes, "Internal note");
});

test("normalization activates upcoming placements while terminal statuses stay non-capacity", async () => {
  const adapter = fakeLifecycleAdapter();
  adapter.placements.get(PLACEMENT_A).current_start_date = "2026-09-01";
  const service = createPlacementLifecycleService({ adapter });
  const placements = await service.list(workerPrincipal());
  assert.equal(placements[0].status, "active");
  assert.deepEqual(CAPACITY_STATUSES, ["upcoming", "active"]);
  assert.deepEqual(TERMINAL_STATUSES, ["completed", "released", "cancelled"]);
  adapter.placements.get(PLACEMENT_A).status = "released";
  await service.list(workerPrincipal());
  assert.equal(adapter.placements.get(PLACEMENT_A).status, "released");
});

test("administrator and manager can release an own-company placement with audited notice facts", async () => {
  for (const role of ["Administrator", "Manager"]) {
    const adapter = fakeLifecycleAdapter();
    const service = createPlacementLifecycleService({ adapter });
    const released = await service.release(companyPrincipal(role), PLACEMENT_A, {
      releaseType: "standard_release",
      effectiveDate: "2026-09-23",
      reason: "Site no longer requires worker",
      notes: "Programme reduced",
      replacementRequested: true,
    });
    assert.equal(released.scheduledEndDate, "2026-09-23");
    assert.equal(released.lifecycleEvents[0].noticeDays, 5);
    assert.equal(released.lifecycleEvents[0].noticeClassification, "standard_5_working_days");
    assert.equal(released.lifecycleEvents[0].privateNotes, "Programme reduced");
    assert.equal("reliability" in adapter.placements.get(PLACEMENT_A), false);
    assert.equal("attendance" in adapter.placements.get(PLACEMENT_A), false);
  }
});

test("immediate release is explicit, historical, and does not fabricate attendance", async () => {
  const adapter = fakeLifecycleAdapter();
  const service = createPlacementLifecycleService({ adapter });
  const released = await service.release(companyPrincipal(), PLACEMENT_A, {
    releaseType: "immediate_release",
    reason: "No-show",
  });
  assert.equal(released.status, "released");
  assert.equal(released.lifecycleEvents[0].workerFault, true);
  assert.equal(released.lifecycleEvents[0].metadata.release_type, "immediate_release");
  assert.equal(Object.keys(adapter.placements.get(PLACEMENT_A)).some((key) => key.includes("attendance")), false);
});

test("supervisor, cross-company caller, and browser authority claims cannot release", async () => {
  const service = createPlacementLifecycleService({ adapter: fakeLifecycleAdapter() });
  const input = { releaseType: "standard_release", reason: "Other" };
  await assert.rejects(
    service.release(companyPrincipal("Supervisor"), PLACEMENT_A, input),
    (error) => error.code === "PLACEMENT_PERMISSION_DENIED",
  );
  await assert.rejects(
    service.release(companyPrincipal("Administrator", COMPANY_B), PLACEMENT_A, input),
    (error) => ["PLACEMENT_PERMISSION_DENIED", "PLACEMENT_NOT_FOUND"].includes(error.code),
  );
  await assert.rejects(
    service.release(companyPrincipal(), PLACEMENT_A, { ...input, companyId: COMPANY_B }),
    (error) => error.code === "PLACEMENT_AUTHORITY_FORBIDDEN",
  );
});

test("worker can request an end only for their own canonical placement", async () => {
  const adapter = fakeLifecycleAdapter();
  const service = createPlacementLifecycleService({ adapter });
  const placement = await service.requestWorkerEnd(workerPrincipal(), PLACEMENT_A, {
    effectiveDate: "2026-09-23",
    reason: "Project no longer suitable",
  });
  assert.equal(placement.scheduledEndType, "worker_end");
  assert.equal(placement.lifecycleEvents[0].initiatedByType, "worker");
  await assert.rejects(
    service.requestWorkerEnd(workerPrincipal(WORKER_B), PLACEMENT_A, {
      effectiveDate: "2026-09-23",
      reason: "Project no longer suitable",
    }),
    (error) => error.code === "PLACEMENT_NOT_FOUND",
  );
});

test("company completion preserves the placement and removes it from committed capacity", async () => {
  const adapter = fakeLifecycleAdapter();
  adapter.placements.get(PLACEMENT_A).current_start_date = "2026-09-01";
  const service = createPlacementLifecycleService({ adapter });
  const placement = await service.complete(companyPrincipal(), PLACEMENT_A, {
    effectiveDate: TEST_TODAY,
  });
  assert.equal(placement.id, PLACEMENT_A);
  assert.equal(placement.status, "completed");
  assert.equal(placement.lifecycleEvents[0].type, "completed");
  assert.equal(CAPACITY_STATUSES.includes(placement.status), false);
  await assert.rejects(
    service.complete(companyPrincipal("Supervisor"), PLACEMENT_B, {}),
    (error) => error.code === "PLACEMENT_PERMISSION_DENIED",
  );
});

test("manual completion rejects future and invalid historical dates without releasing capacity", async () => {
  const adapter = fakeLifecycleAdapter();
  const row = adapter.placements.get(PLACEMENT_A);
  row.current_start_date = "2026-09-01";
  const service = createPlacementLifecycleService({ adapter });

  await assert.rejects(
    service.complete(companyPrincipal(), PLACEMENT_A, {
      effectiveDate: "2026-09-17",
    }),
    (error) => error.code === "INVALID_COMPLETION_DATE",
  );
  assert.equal(row.status, "upcoming");
  assert.equal(CAPACITY_STATUSES.includes(row.status), true);
  assert.equal(row.placement_lifecycle_events.length, 0);

  await assert.rejects(
    service.complete(companyPrincipal(), PLACEMENT_A, {
      effectiveDate: "2026-08-31",
    }),
    (error) => error.code === "INVALID_COMPLETION_DATE",
  );
  assert.equal(row.status, "upcoming");
});

test("standard company release retries are idempotent and conflicting schedules fail", async () => {
  const adapter = fakeLifecycleAdapter();
  const service = createPlacementLifecycleService({ adapter });
  const input = {
    releaseType: "standard_release",
    effectiveDate: "2026-09-23",
    reason: "Site no longer requires worker",
    notes: "Programme reduced",
    replacementRequested: true,
  };

  await service.release(companyPrincipal(), PLACEMENT_A, input);
  const first = structuredClone(adapter.placements.get(PLACEMENT_A));
  await service.release(companyPrincipal(), PLACEMENT_A, input);
  const afterRetry = adapter.placements.get(PLACEMENT_A);
  assert.equal(afterRetry.placement_lifecycle_events.length, 1);
  assert.equal(
    afterRetry.placement_lifecycle_events[0].id,
    first.placement_lifecycle_events[0].id,
  );
  assert.equal(afterRetry.status, "upcoming");

  await assert.rejects(
    service.release(companyPrincipal(), PLACEMENT_A, {
      ...input,
      effectiveDate: "2026-09-24",
    }),
    (error) => error.code === "PLACEMENT_STATE_CONFLICT",
  );
  assert.equal(afterRetry.scheduled_end_date, "2026-09-23");
  assert.equal(afterRetry.placement_lifecycle_events.length, 1);
});

test("worker scheduled-end retries are idempotent and conflicting requests fail", async () => {
  const adapter = fakeLifecycleAdapter();
  const service = createPlacementLifecycleService({ adapter });
  const input = {
    effectiveDate: "2026-09-23",
    reason: "Project no longer suitable",
    notes: "Changing assignment",
  };

  await service.requestWorkerEnd(workerPrincipal(), PLACEMENT_A, input);
  const firstEvent = adapter.placements.get(PLACEMENT_A).placement_lifecycle_events[0];
  await service.requestWorkerEnd(workerPrincipal(), PLACEMENT_A, input);
  const row = adapter.placements.get(PLACEMENT_A);
  assert.equal(row.placement_lifecycle_events.length, 1);
  assert.equal(row.placement_lifecycle_events[0].id, firstEvent.id);

  await assert.rejects(
    service.requestWorkerEnd(workerPrincipal(), PLACEMENT_A, {
      ...input,
      effectiveDate: "2026-09-24",
    }),
    (error) => error.code === "PLACEMENT_STATE_CONFLICT",
  );
  assert.equal(row.scheduled_end_date, "2026-09-23");
  assert.equal(row.placement_lifecycle_events.length, 1);
});

test("schedule changes cannot outlive fixed or scheduled placement ends", async () => {
  const adapter = fakeLifecycleAdapter();
  const service = createPlacementLifecycleService({ adapter });
  const fields = {
    changeType: "schedule_change",
    shiftStartTime: "20:00",
    shiftFinishTime: "05:00",
  };

  await assert.rejects(
    service.proposeChange(companyPrincipal(), PLACEMENT_A, {
      ...fields,
      effectiveDate: "2026-12-19",
    }),
    (error) => error.code === "INVALID_PLACEMENT_CHANGE",
  );

  const row = adapter.placements.get(PLACEMENT_A);
  row.scheduled_end_date = "2026-10-10";
  row.scheduled_end_type = "company_release";
  await assert.rejects(
    service.proposeChange(companyPrincipal(), PLACEMENT_A, {
      ...fields,
      effectiveDate: "2026-10-11",
    }),
    (error) => error.code === "INVALID_PLACEMENT_CHANGE",
  );

  const valid = await service.proposeChange(companyPrincipal(), PLACEMENT_A, {
    ...fields,
    effectiveDate: "2026-10-10",
  });
  assert.equal(valid.changeOffer.effectiveDate, "2026-10-10");
});

test("extensions reject scheduled ends at proposal and acceptance time", async () => {
  const adapter = fakeLifecycleAdapter();
  const service = createPlacementLifecycleService({ adapter });
  const row = adapter.placements.get(PLACEMENT_A);
  row.scheduled_end_date = "2026-10-10";
  row.scheduled_end_type = "company_release";
  await assert.rejects(
    service.proposeExtension(companyPrincipal(), PLACEMENT_A, {
      estimatedEndDate: "2027-01-15",
    }),
    (error) => error.code === "PLACEMENT_STATE_CONFLICT",
  );

  row.scheduled_end_date = null;
  row.scheduled_end_type = null;
  const proposed = await service.proposeExtension(companyPrincipal(), PLACEMENT_A, {
    estimatedEndDate: "2027-01-15",
  });
  row.scheduled_end_date = "2026-10-10";
  row.scheduled_end_type = "worker_end";
  await assert.rejects(
    service.respondChange(workerPrincipal(), proposed.changeOffer.id, true),
    (error) => error.code === "PLACEMENT_SCHEDULED_END_CONFLICT",
  );
  assert.equal(row.current_estimated_end_date, "2026-12-18");
  assert.equal(row.placement_change_offers[0].status, "pending");
});

test("normalization releases capacity only when an end becomes effective", async () => {
  const adapter = fakeLifecycleAdapter();
  const service = createPlacementLifecycleService({ adapter });
  const row = adapter.placements.get(PLACEMENT_A);
  const natural = adapter.placements.get(PLACEMENT_B);
  row.current_start_date = "2026-09-01";
  row.status = "active";
  row.scheduled_end_date = "2026-09-17";
  row.scheduled_end_type = "company_release";
  natural.current_start_date = "2026-09-01";
  natural.current_estimated_end_date = "2026-09-17";
  natural.status = "active";

  await service.list(workerPrincipal());
  assert.equal(row.status, "active");
  assert.equal(CAPACITY_STATUSES.includes(row.status), true);
  await service.list(workerPrincipal(WORKER_B));
  assert.equal(natural.status, "active");

  row.scheduled_end_date = TEST_TODAY;
  natural.current_estimated_end_date = "2026-09-15";
  await service.list(workerPrincipal());
  await service.list(workerPrincipal(WORKER_B));
  assert.equal(row.status, "released");
  assert.equal(CAPACITY_STATUSES.includes(row.status), false);
  assert.equal(natural.status, "completed");
  assert.equal(CAPACITY_STATUSES.includes(natural.status), false);

  await service.list(workerPrincipal());
  await service.list(workerPrincipal(WORKER_B));
  assert.equal(row.status, "released");
  assert.equal(natural.status, "completed");
});

test("extension acceptance updates effective terms atomically and preserves accepted terms", async () => {
  const adapter = fakeLifecycleAdapter();
  const service = createPlacementLifecycleService({ adapter });
  const proposed = await service.proposeExtension(companyPrincipal(), PLACEMENT_A, {
    estimatedEndDate: "2027-01-15",
    dayRate: 275,
  });
  assert.match(proposed.changeOffer.id, /^[0-9a-f-]{36}$/i);
  const accepted = await service.respondChange(
    workerPrincipal(),
    proposed.changeOffer.id,
    true,
  );
  assert.equal(accepted.placement.originalTerms.estimatedEndDate, "2026-12-18");
  assert.equal(accepted.placement.originalTerms.dayRate, 250);
  assert.equal(accepted.placement.effectiveTerms.estimatedEndDate, "2027-01-15");
  assert.equal(accepted.placement.effectiveTerms.dayRate, 275);
  assert.equal(accepted.outcome, "accepted");
  assert.equal(accepted.placementId, PLACEMENT_A);
  assert.equal(accepted.changeOfferId, proposed.changeOffer.id);
  const acceptedEvents = adapter.placements.get(PLACEMENT_A).placement_lifecycle_events
    .filter((event) => event.event_type === "change_accepted");
  assert.equal(acceptedEvents.length, 1);
  await assert.rejects(
    service.respondChange(workerPrincipal(), proposed.changeOffer.id, true),
    (error) => error.code === "PLACEMENT_CHANGE_ACCEPTED",
  );
  assert.equal(
    adapter.placements.get(PLACEMENT_A).placement_lifecycle_events
      .filter((event) => event.event_type === "change_accepted").length,
    1,
  );
  assert.equal(adapter.placementLookupIds.every((id) => /^[0-9a-f-]{36}$/i.test(id)), true);
  const reloaded = await service.get(workerPrincipal(), PLACEMENT_A);
  assert.equal(reloaded.id, PLACEMENT_A);
  assert.equal(reloaded.effectiveTerms.estimatedEndDate, "2027-01-15");
});

test("declined, expired, duplicate, foreign, and failed change responses remain safe", async () => {
  const adapter = fakeLifecycleAdapter();
  const service = createPlacementLifecycleService({ adapter });
  const decline = await service.proposeExtension(companyPrincipal(), PLACEMENT_A, {
    estimatedEndDate: "2027-01-10",
  });
  const declined = await service.respondChange(
    workerPrincipal(),
    decline.changeOffer.id,
    false,
    { reason: "Extension not suitable", comment: "Already committed elsewhere" },
  );
  assert.equal(declined.outcome, "declined");
  assert.equal(declined.placementId, PLACEMENT_A);
  assert.equal(declined.changeOfferId, decline.changeOffer.id);
  assert.equal(declined.changeOffer.status, "declined");
  assert.equal(declined.changeOffer.placementId, PLACEMENT_A);
  assert.equal(declined.changeOffer.declineReason, "Extension not suitable");
  assert.equal(declined.changeOffer.declineComment, "Already committed elsewhere");
  assert.equal(declined.placement.originalTerms.estimatedEndDate, "2026-12-18");
  const declinedRow = adapter.placements.get(PLACEMENT_A);
  const persistedDecline = declinedRow.placement_change_offers.find(
    (change) => change.id === decline.changeOffer.id,
  );
  assert.equal(persistedDecline.status, "declined");
  assert.equal(persistedDecline.decline_reason, "Extension not suitable");
  assert.equal(persistedDecline.decline_comment, "Already committed elsewhere");
  assert.ok(persistedDecline.responded_at);
  assert.equal(
    declinedRow.placement_lifecycle_events
      .filter((event) => event.event_type === "change_declined").length,
    1,
  );
  const fresh = await service.get(workerPrincipal(), PLACEMENT_A);
  assert.equal(
    fresh.changeOffers.find((change) => change.id === decline.changeOffer.id)?.status,
    "declined",
  );
  await assert.rejects(
    service.respondChange(workerPrincipal(), decline.changeOffer.id, false),
    (error) => error.code === "PLACEMENT_CHANGE_DECLINED",
  );
  assert.equal(
    declinedRow.placement_lifecycle_events
      .filter((event) => event.event_type === "change_declined").length,
    1,
  );
  assert.equal(adapter.placementLookupIds.every((id) => /^[0-9a-f-]{36}$/i.test(id)), true);

  const foreign = await service.proposeExtension(companyPrincipal(), PLACEMENT_A, {
    estimatedEndDate: "2027-01-11",
  });
  await assert.rejects(
    service.respondChange(workerPrincipal(WORKER_B), foreign.changeOffer.id, true),
    (error) => error.code === "PLACEMENT_CHANGE_NOT_FOUND",
  );

  const row = adapter.placements.get(PLACEMENT_A);
  const pending = row.placement_change_offers.find((item) => item.id === foreign.changeOffer.id);
  pending.expires_at = "2020-01-01T00:00:00.000Z";
  await assert.rejects(
    service.respondChange(workerPrincipal(), foreign.changeOffer.id, true),
    (error) => error.code === "PLACEMENT_CHANGE_EXPIRED",
  );
  assert.equal(adapter.placementLookupIds.every((id) => /^[0-9a-f-]{36}$/i.test(id)), true);

  const atomic = await service.proposeExtension(companyPrincipal(), PLACEMENT_A, {
    estimatedEndDate: "2027-01-12",
  });
  adapter.setFailNextResponse(true);
  const before = structuredClone(adapter.placements.get(PLACEMENT_A));
  await assert.rejects(
    service.respondChange(workerPrincipal(), atomic.changeOffer.id, true),
    (error) => error.code === "PLACEMENT_STATE_CONFLICT",
  );
  assert.deepEqual(adapter.placements.get(PLACEMENT_A), before);
});

test("terminal and conflict placement-change outcomes never trigger invalid UUID reloads", async () => {
  const terminalAdapter = fakeLifecycleAdapter();
  const terminalService = createPlacementLifecycleService({ adapter: terminalAdapter });
  const terminalChange = await terminalService.proposeExtension(
    companyPrincipal(),
    PLACEMENT_A,
    { estimatedEndDate: "2027-01-10" },
  );
  terminalAdapter.placements.get(PLACEMENT_A).status = "completed";
  await assert.rejects(
    terminalService.respondChange(
      workerPrincipal(),
      terminalChange.changeOffer.id,
      false,
      { reason: "No longer required" },
    ),
    (error) => error.code === "PLACEMENT_ENDED",
  );
  assert.equal(
    terminalAdapter.placements.get(PLACEMENT_A).placement_change_offers[0].status,
    "pending",
  );
  assert.equal(
    terminalAdapter.placementLookupIds.every((id) => /^[0-9a-f-]{36}$/i.test(id)),
    true,
  );

  for (const [outcome, code] of [
    ["schedule_conflict", "PLACEMENT_SCHEDULE_CONFLICT"],
    ["scheduled_end_conflict", "PLACEMENT_SCHEDULED_END_CONFLICT"],
    ["cancelled", "PLACEMENT_CHANGE_CANCELLED"],
  ]) {
    const adapter = fakeLifecycleAdapter();
    const service = createPlacementLifecycleService({ adapter });
    const proposed = await service.proposeExtension(companyPrincipal(), PLACEMENT_A, {
      estimatedEndDate: "2027-01-10",
    });
    adapter.respondChange = async () => ({
      outcome,
      change_offer_id: proposed.changeOffer.id,
    });
    await assert.rejects(
      service.respondChange(workerPrincipal(), proposed.changeOffer.id, true),
      (error) => error.code === code,
    );
    assert.equal(
      adapter.placementLookupIds.every((id) => /^[0-9a-f-]{36}$/i.test(id)),
      true,
    );
  }
});

test("material schedule changes require worker acceptance before effective terms change", async () => {
  const adapter = fakeLifecycleAdapter();
  const service = createPlacementLifecycleService({ adapter });
  const proposed = await service.proposeChange(companyPrincipal("Manager"), PLACEMENT_A, {
    changeType: "schedule_change",
    effectiveDate: "2026-10-05",
    shiftStartTime: "20:00",
    shiftFinishTime: "05:00",
    shiftPattern: "Nights",
  });
  assert.equal(adapter.placements.get(PLACEMENT_A).current_shift_start_time, "07:30:00");
  await service.respondChange(workerPrincipal(), proposed.changeOffer.id, true);
  assert.equal(adapter.placements.get(PLACEMENT_A).agreed_shift_start_time, "07:30:00");
  assert.equal(adapter.placements.get(PLACEMENT_A).current_shift_start_time, "20:00");
});

test("worker and company listings are ownership-filtered and privacy allow-listed", async () => {
  const service = createPlacementLifecycleService({ adapter: fakeLifecycleAdapter() });
  const workerRows = await service.list(workerPrincipal());
  const companyRows = await service.list(companyPrincipal());
  assert.deepEqual(workerRows.map((row) => row.id), [PLACEMENT_A]);
  assert.deepEqual(companyRows.map((row) => row.id), [PLACEMENT_A]);
  assert.equal(JSON.stringify(workerRows).includes("private_company_notes"), false);
  assert.equal(JSON.stringify(companyRows).includes("private_minimum_day_rate"), false);
  assert.equal(JSON.stringify(companyRows).includes("user_id"), false);
});

test("Supabase lifecycle adapter is server-secret-only and fails closed", () => {
  assert.equal(createSupabasePlacementLifecycleAdapter({ env: {} }).configured, false);
  let captured = null;
  const adapter = createSupabasePlacementLifecycleAdapter({
    env: {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "public-key",
      SUPABASE_SECRET_KEY: "server-secret",
    },
    clientFactory(url, key, options) {
      captured = { url, key, options };
      return {};
    },
  });
  assert.equal(adapter.configured, true);
  assert.equal(captured.key, "server-secret");
  assert.notEqual(captured.key, "public-key");
  assert.equal(captured.options.auth.persistSession, false);
});

test("migration preserves history, least privilege, capacity states, and atomic change locking", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "../supabase/migrations/202609160006_placement_lifecycle.sql"),
    "utf8",
  );
  assert.match(sql, /^begin;/);
  assert.match(sql, /commit;\s*$/);
  assert.match(sql, /placement_lifecycle_events_placement_id_fkey[\s\S]*on delete restrict/);
  assert.match(sql, /placement_change_offers_placement_id_fkey[\s\S]*on delete restrict/);
  assert.match(sql, /placements_initialize_current_terms/);
  assert.match(sql, /new\.current_day_rate := coalesce\(new\.current_day_rate, new\.agreed_day_rate\)/);
  assert.match(sql, /check \(status in \('upcoming', 'active', 'completed', 'released', 'cancelled'\)\)/);
  assert.match(sql, /placement\.status in \('upcoming', 'active'\)/);
  assert.match(sql, /current_no_fixed_end_date = false[\s\S]*current_estimated_end_date < current_date/);
  assert.match(
    sql,
    /placement_add_working_days[\s\S]*extract\(isodow from v_date\) between 1 and 5/,
  );
  assert.match(sql, /set search_path = public, pg_temp/g);
  assert.match(sql, /revoke all on public\.placement_lifecycle_events[\s\S]*authenticated/);
  assert.match(sql, /grant execute on function public\.respond_placement_change[\s\S]*to service_role/);
  assert.doesNotMatch(sql, /grant (insert|update|delete)[\s\S]*to authenticated/i);
  assert.match(
    sql,
    /status = 'pending'[\s\S]*select placement\.\*[\s\S]*for update;[\s\S]*select change_offer\.\*[\s\S]*for update;[\s\S]*set status = 'expired'/,
  );
  assert.match(sql, /select placement\.\*[\s\S]*for update;[\s\S]*select change_offer\.\*[\s\S]*for update;/);
  assert.match(sql, /A completion date cannot be in the future/);
  assert.match(sql, /A completion date cannot be before the placement start date/);
  assert.match(sql, /company_release:[\s\S]*p_release_type[\s\S]*v_effective_date/);
  assert.match(sql, /worker_end:[\s\S]*v_placement\.id[\s\S]*v_effective_date/);
  assert.doesNotMatch(sql, /company_release:' \|\| v_placement\.id \|\| ':' \|\| gen_random_uuid/);
  assert.doesNotMatch(sql, /worker_end:' \|\| v_placement\.id \|\| ':' \|\| gen_random_uuid/);
  assert.match(sql, /A placement with a scheduled end cannot be extended/);
  assert.match(sql, /The change cannot take effect after the placement end date/);
  assert.match(sql, /The change cannot take effect after the scheduled end date/);
  assert.match(sql, /scheduled_end_conflict/);
  assert.doesNotMatch(sql, /update public\.placements\s+set\s+agreed_/i);
  assert.doesNotMatch(sql, /update public\.placements\s+set\s+project_requirement_id/i);
  assert.doesNotMatch(sql, /insert into public\.(attendance|timesheets|invoices|worker_reliability)/i);
});

test("transfer and replacement retain new-offer/new-placement identity", () => {
  const appSource = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
  const serverSource = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  const offerMigration = fs.readFileSync(
    path.join(__dirname, "../supabase/migrations/202609160005_offers_placements.sql"),
    "utf8",
  );
  const transferStart = appSource.indexOf("async function createProjectTransferOffer");
  const transferEnd = appSource.indexOf("function openShiftChangeModal", transferStart);
  const transferSource = appSource.slice(transferStart, transferEnd);
  assert.ok(transferStart > -1 && transferEnd > transferStart);
  assert.match(
    transferSource,
    /createJobOffer\(\s*toJob\.id,\s*worker\.id,\s*"project_transfer"/,
  );
  assert.match(appSource, /marketplaceApiRequest\("\/api\/offers"/);
  assert.match(appSource, /marketplaceApiRequest\(`\/api\/offers\/\$\{app\.id\}\/accept`/);
  assert.doesNotMatch(transferSource, /marketplaceApiRequest\([^)]*transfer/i);
  assert.doesNotMatch(serverSource, /\/api\/(?:project-)?transfers?/i);
  assert.match(appSource, /const canonicalSource = source !== "shift_change"/);
  assert.match(appSource, /createReplacementTask/);
  assert.match(offerMigration, /insert into public\.placements/);
  assert.match(offerMigration, /project_requirement_id[\s\S]*p_project_requirement_id/);
  assert.doesNotMatch(offerMigration, /update public\.placements\s+set\s+worker_id/i);
  assert.doesNotMatch(offerMigration, /update public\.placements\s+set\s+project_requirement_id/i);
});

test("frontend derives canonical compatibility records without persisting duplicate authority", () => {
  const source = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
  assert.match(source, /canonicalPlacementForJobWorker/);
  assert.match(source, /canonicalWorkerPlacementProject/);
  assert.match(source, /canonicalPlacementLifecycle/);
  assert.match(source, /!job\.canonicalWorkerPlacementProject/);
  assert.match(source, /\/api\/placements\/\$\{canonicalPlacement\.id\}\/release/);
  assert.match(source, /\/api\/placements\/\$\{canonicalPlacement\.id\}\/worker-end/);
  assert.match(source, /\/api\/placements\/\$\{canonicalPlacement\.id\}\/extensions/);
  assert.match(source, /\/api\/placement-changes\/\$\{canonicalChangeId\}\/accept/);
  assert.match(source, /const canonicalSource = source !== "shift_change"/);
});

test("server routes expose only authenticated lifecycle operations", () => {
  const source = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  assert.match(source, /resolveAuthenticatedPrincipal\(req\)/);
  assert.match(source, /const releaseMatch = url\.pathname\.match/);
  assert.match(source, /const workerEndMatch = url\.pathname\.match/);
  assert.match(source, /const acceptChangeMatch = url\.pathname\.match/);
  assert.match(source, /const declineChangeMatch = url\.pathname\.match/);
  assert.match(source, /placementLifecycleService\.release/);
  assert.match(source, /placementLifecycleService\.requestWorkerEnd/);
  assert.match(source, /placementLifecycleService\.respondChange/);
  assert.match(
    source,
    /if \(req\.method === 'POST' && declineChangeMatch\)[\s\S]*placementLifecycleService\.respondChange\([\s\S]*false,[\s\S]*sendJson\(res, 200, result, responseHeaders\)/,
  );
});
