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
    async normalize() {
      for (const row of placements.values()) {
        if (row.status === "upcoming" && row.current_start_date <= "2026-09-16") {
          row.status = "active";
        }
      }
    },
    async getPlacement(id) { return clone(placements.get(id) || null); },
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
      const effectiveDate = input.effectiveDate || (terminal ? "2026-09-16" : "2026-09-23");
      row.scheduled_end_date = effectiveDate;
      row.scheduled_end_type = "company_release";
      row.end_reason_code = input.reason;
      row.end_reason_text = input.reasonText;
      if (terminal) {
        row.status = "released";
        row.ended_at = "2026-09-16T10:00:00.000Z";
      }
      addEvent(row, {
        event_type: terminal ? "released" : "release_scheduled",
        initiated_by_type: "company",
        initiated_by_role: actorRole(input.actorUserId),
        reason_code: input.reason,
        reason_text: input.reasonText,
        requested_at: "2026-09-16T10:00:00.000Z",
        effective_at: `${effectiveDate}T00:00:00.000Z`,
        notice_days: terminal ? 0 : 5,
        notice_classification: terminal ? "immediate_company_release" : "standard_5_working_days",
        worker_fault: input.releaseType === "immediate_release" && input.reason === "No-show",
        metadata: { release_type: input.releaseType, replacement_requested: input.replacementRequested },
        private_company_notes: input.notes || null,
      });
      return { outcome: terminal ? "released" : "release_scheduled", placement_id: row.id };
    },
    async requestWorkerEnd(input) {
      const row = placements.get(input.placementId);
      if (!row || row.worker_id !== actorWorker(input.actorUserId)) {
        throw new PlacementLifecycleError("Placement not found.", 404, "PLACEMENT_NOT_FOUND");
      }
      row.scheduled_end_date = input.effectiveDate || "2026-09-23";
      row.scheduled_end_type = "worker_end";
      row.end_reason_code = input.reason;
      row.end_reason_text = input.reasonText;
      addEvent(row, {
        event_type: "worker_end_requested",
        initiated_by_type: "worker",
        reason_code: input.reason,
        reason_text: input.reasonText,
        requested_at: "2026-09-16T10:00:00.000Z",
        effective_at: `${row.scheduled_end_date}T00:00:00.000Z`,
        notice_days: 5,
        notice_classification: "worker_requested_end",
      });
      return { outcome: "end_scheduled", placement_id: row.id };
    },
    async complete(input) {
      const row = placements.get(input.placementId);
      if (!row || row.project_requirements.projects.company_id !== actorCompany(input.actorUserId)) {
        throw new PlacementLifecycleError("Placement not found.", 404, "PLACEMENT_NOT_FOUND");
      }
      row.status = "completed";
      row.ended_at = "2026-12-18T17:00:00.000Z";
      addEvent(row, {
        event_type: "completed",
        initiated_by_type: "company",
        reason_code: "company_confirmed_completion",
        requested_at: row.ended_at,
        effective_at: row.ended_at,
      });
      return { outcome: "completed", placement_id: row.id };
    },
    async proposeChange(input) {
      const row = placements.get(input.placementId);
      if (!row || row.project_requirements.projects.company_id !== actorCompany(input.actorUserId)) {
        throw new PlacementLifecycleError("Company cannot change this placement.", 403, "PLACEMENT_PERMISSION_DENIED");
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
        if (failNextResponse) {
          failNextResponse = false;
          throw new PlacementLifecycleError("Atomic change failed.", 409, "PLACEMENT_STATE_CONFLICT");
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
        return { outcome: change.status, change_offer_id: change.id, placement_id: row.id };
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
  const service = createPlacementLifecycleService({ adapter });
  const placement = await service.complete(companyPrincipal(), PLACEMENT_A, {
    effectiveDate: "2026-12-18",
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
    { reason: "Extension not suitable" },
  );
  assert.equal(declined.changeOffer.status, "declined");
  assert.equal(declined.placement.originalTerms.estimatedEndDate, "2026-12-18");
  await assert.rejects(
    service.respondChange(workerPrincipal(), decline.changeOffer.id, false),
    (error) => error.code === "PLACEMENT_CHANGE_DECLINED",
  );

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
  assert.doesNotMatch(sql, /update public\.placements\s+set\s+agreed_/i);
  assert.doesNotMatch(sql, /update public\.placements\s+set\s+project_requirement_id/i);
  assert.doesNotMatch(sql, /insert into public\.(attendance|timesheets|invoices|worker_reliability)/i);
});

test("transfer and replacement retain new-offer/new-placement identity", () => {
  const appSource = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
  const offerMigration = fs.readFileSync(
    path.join(__dirname, "../supabase/migrations/202609160005_offers_placements.sql"),
    "utf8",
  );
  assert.match(appSource, /createJobOffer\([\s\S]*"project_transfer"/);
  assert.match(appSource, /const canonicalSource = source !== "shift_change"/);
  assert.match(appSource, /createReplacementTask/);
  assert.match(offerMigration, /insert into public\.placements/);
  assert.doesNotMatch(offerMigration, /update public\.placements\s+set\s+worker_id/i);
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
});
