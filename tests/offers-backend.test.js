"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  OfferServiceError,
  createOfferService,
  createSupabaseOfferAdapter,
} = require("../server-offers.js");
const {
  WORKER_DECLINE_REASONS,
} = require("../offer-decline-reasons.js");

const COMPANY_A = "00000000-0000-4000-8000-000000000001";
const COMPANY_B = "00000000-0000-4000-8000-000000000002";
const USER_ADMIN_A = "00000000-0000-4000-8000-000000000011";
const USER_MANAGER_A = "00000000-0000-4000-8000-000000000012";
const USER_SUPERVISOR_A = "00000000-0000-4000-8000-000000000013";
const USER_ADMIN_B = "00000000-0000-4000-8000-000000000014";
const WORKER_A = "00000000-0000-4000-8000-000000000101";
const WORKER_B = "00000000-0000-4000-8000-000000000102";
const WORKER_C = "00000000-0000-4000-8000-000000000103";
const WORKER_USER_A = "00000000-0000-4000-8000-000000000111";
const WORKER_USER_B = "00000000-0000-4000-8000-000000000112";
const WORKER_USER_C = "00000000-0000-4000-8000-000000000113";
const PROJECT_A = "00000000-0000-4000-8000-000000000201";
const PROJECT_B = "00000000-0000-4000-8000-000000000202";
const REQUIREMENT_A = "00000000-0000-4000-8000-000000000301";
const REQUIREMENT_B = "00000000-0000-4000-8000-000000000302";
const APPLICATION_A = "00000000-0000-4000-8000-000000000401";
const APPLICATION_B = "00000000-0000-4000-8000-000000000402";

function companyPrincipal(role = "Administrator", companyId = COMPANY_A) {
  const userByRole = {
    administrator: companyId === COMPANY_A ? USER_ADMIN_A : USER_ADMIN_B,
    manager: USER_MANAGER_A,
    supervisor: USER_SUPERVISOR_A,
  };
  return {
    type: "company",
    id: companyId,
    companyId,
    authUserId: userByRole[role.toLowerCase()] || USER_ADMIN_A,
    permissionRole: role,
    serverAuthenticated: true,
  };
}

function workerPrincipal(workerId = WORKER_A) {
  const userIds = {
    [WORKER_A]: WORKER_USER_A,
    [WORKER_B]: WORKER_USER_B,
    [WORKER_C]: WORKER_USER_C,
  };
  return {
    type: "worker",
    id: workerId,
    workerId,
    authUserId: userIds[workerId],
    serverAuthenticated: true,
  };
}

function offerInput(overrides = {}) {
  return {
    workerId: WORKER_A,
    requirementId: REQUIREMENT_A,
    applicationId: APPLICATION_A,
    source: "application",
    offeredDayRate: 250,
    startDate: "2026-10-01",
    estimatedEndDate: "2026-12-18",
    duration: "12 weeks",
    workingDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    shiftStartTime: "07:30",
    shiftFinishTime: "16:30",
    workActivity: "Lighting installation",
    accommodationPaid: true,
    accommodationArrangement: "allowance",
    accommodationAllowancePerNight: 45,
    overtimeAvailable: true,
    overtimeRates: { afterHours: "time_and_a_half" },
    weekendRates: { saturday: 300, sunday: 350 },
    ...overrides,
  };
}

function fakeOfferAdapter() {
  const clone = (value) => structuredClone(value);
  const offers = new Map();
  const placements = new Map();
  let offerSequence = 500;
  let placementSequence = 600;
  let failPlacementInsert = false;
  const uuid = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
  const companies = new Map([
    [COMPANY_A, { id: COMPANY_A, name: "Company A" }],
    [COMPANY_B, { id: COMPANY_B, name: "Company B" }],
  ]);
  const projects = new Map([
    [PROJECT_A, {
      id: PROJECT_A,
      company_id: COMPANY_A,
      status: "open",
      project_name: "Northgate Tower",
      job_number: "HS2-001",
      location_label: "London",
      start_date: "2026-10-01",
      estimated_end_date: "2026-12-18",
      no_fixed_end_date: false,
      duration_label: "12 weeks",
    }],
    [PROJECT_B, {
      id: PROJECT_B,
      company_id: COMPANY_B,
      status: "open",
      project_name: "Nexus",
      job_number: "M2055",
      location_label: "Manchester",
      start_date: "2026-11-01",
      estimated_end_date: "2026-12-01",
      no_fixed_end_date: false,
      duration_label: "4 weeks",
    }],
  ]);
  const requirements = new Map([
    [REQUIREMENT_A, {
      id: REQUIREMENT_A,
      project_id: PROJECT_A,
      workers_required: 2,
      trade: "Electrical",
      role: "Electrician",
      grade: "Skilled",
      work_activity: "Lighting installation",
      working_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      shift_start_time: "07:30",
      shift_finish_time: "16:30",
    }],
    [REQUIREMENT_B, {
      id: REQUIREMENT_B,
      project_id: PROJECT_B,
      workers_required: 1,
      trade: "Electrical",
      role: "Electrician",
      grade: "Skilled",
      work_activity: "Testing",
      working_days: ["monday"],
      shift_start_time: "08:00",
      shift_finish_time: "17:00",
    }],
  ]);
  const workers = new Map([
    [WORKER_A, { id: WORKER_A, user_id: WORKER_USER_A, name: "Alice Carter", trade: "Electrical", grade: "Skilled", private_minimum_day_rate: 220, password_hash: "secret" }],
    [WORKER_B, { id: WORKER_B, user_id: WORKER_USER_B, name: "Ben Evans", trade: "Electrical", grade: "Skilled", private_minimum_day_rate: 230, password_hash: "secret" }],
    [WORKER_C, { id: WORKER_C, user_id: WORKER_USER_C, name: "Cara Jones", trade: "Electrical", grade: "Skilled", private_minimum_day_rate: 240, password_hash: "secret" }],
  ]);
  const applications = new Map([
    [APPLICATION_A, { id: APPLICATION_A, worker_id: WORKER_A, project_requirement_id: REQUIREMENT_A, status: "applied" }],
    [APPLICATION_B, { id: APPLICATION_B, worker_id: WORKER_B, project_requirement_id: REQUIREMENT_A, status: "applied" }],
  ]);

  function actorCompany(actorUserId) {
    if ([USER_ADMIN_A, USER_MANAGER_A, USER_SUPERVISOR_A].includes(actorUserId)) return COMPANY_A;
    if (actorUserId === USER_ADMIN_B) return COMPANY_B;
    return "";
  }

  function relation(requirementId) {
    const requirement = requirements.get(requirementId);
    const project = projects.get(requirement?.project_id);
    return {
      id: requirement?.id,
      project_id: project?.id,
      projects: project ? { id: project.id, company_id: project.company_id, status: project.status } : null,
    };
  }

  function workerRelation(workerId) {
    const worker = workers.get(workerId);
    return worker ? {
      ...worker,
      trade_key: "electrical",
      specialism: "Electrician",
      role_key: "electrician",
      years_experience: 8,
      location: "London",
      profile_photo_reference: "",
    } : null;
  }

  function offerRow(input, id) {
    const requirement = requirements.get(input.requirementId);
    const project = projects.get(requirement.project_id);
    const company = companies.get(project.company_id);
    const terms = input.terms;
    return {
      id,
      worker_id: input.workerId,
      project_requirement_id: input.requirementId,
      application_id: input.applicationId || null,
      prior_offer_id: input.priorOfferId || null,
      status: "pending",
      source: terms.source,
      offered_day_rate: terms.offered_day_rate,
      project_name_snapshot: project.project_name,
      job_number_snapshot: project.job_number,
      company_name_snapshot: company.name,
      location_label_snapshot: project.location_label,
      trade_snapshot: requirement.trade,
      role_snapshot: requirement.role,
      grade_snapshot: requirement.grade,
      work_activity_snapshot: terms.work_activity || requirement.work_activity,
      start_date: terms.start_date || project.start_date,
      estimated_end_date: terms.estimated_end_date || project.estimated_end_date,
      no_fixed_end_date: terms.no_fixed_end_date,
      duration_label: terms.duration_label || project.duration_label,
      working_days: terms.working_days || requirement.working_days,
      shift_start_time: terms.shift_start_time || requirement.shift_start_time,
      shift_finish_time: terms.shift_finish_time || requirement.shift_finish_time,
      accommodation_paid: terms.accommodation_paid,
      accommodation_arrangement: terms.accommodation_arrangement,
      accommodation_allowance_per_night: terms.accommodation_allowance_per_night,
      overtime_available: terms.overtime_available,
      overtime_rates: terms.overtime_rates,
      weekend_rates: terms.weekend_rates,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      decline_reason: null,
      decline_comment: null,
      responded_at: null,
      cancelled_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      project_requirements: relation(input.requirementId),
      worker_profiles: workerRelation(input.workerId),
    };
  }

  function placementRow(offer, id) {
    return {
      id,
      worker_id: offer.worker_id,
      project_requirement_id: offer.project_requirement_id,
      accepted_offer_id: offer.id,
      application_id: offer.application_id,
      status: offer.start_date <= new Date().toISOString().slice(0, 10) ? "active" : "upcoming",
      agreed_day_rate: offer.offered_day_rate,
      project_name_snapshot: offer.project_name_snapshot,
      job_number_snapshot: offer.job_number_snapshot,
      company_name_snapshot: offer.company_name_snapshot,
      location_label_snapshot: offer.location_label_snapshot,
      trade_snapshot: offer.trade_snapshot,
      role_snapshot: offer.role_snapshot,
      grade_snapshot: offer.grade_snapshot,
      agreed_work_activity: offer.work_activity_snapshot,
      agreed_start_date: offer.start_date,
      agreed_estimated_end_date: offer.estimated_end_date,
      agreed_no_fixed_end_date: offer.no_fixed_end_date,
      agreed_duration_label: offer.duration_label,
      agreed_working_days: offer.working_days,
      agreed_shift_start_time: offer.shift_start_time,
      agreed_shift_finish_time: offer.shift_finish_time,
      agreed_accommodation_paid: offer.accommodation_paid,
      agreed_accommodation_arrangement: offer.accommodation_arrangement,
      agreed_accommodation_allowance_per_night: offer.accommodation_allowance_per_night,
      agreed_overtime_available: offer.overtime_available,
      agreed_overtime_rates: offer.overtime_rates,
      agreed_weekend_rates: offer.weekend_rates,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      project_requirements: relation(offer.project_requirement_id),
      worker_profiles: workerRelation(offer.worker_id),
    };
  }

  const adapter = {
    configured: true,
    offers,
    placements,
    requirements,
    applications,
    projects,
    setFailPlacementInsert(value) {
      failPlacementInsert = value;
    },
    async expireOffers() {
      let count = 0;
      for (const offer of offers.values()) {
        if (offer.status === "pending" && new Date(offer.expires_at).getTime() <= Date.now()) {
          offer.status = "expired";
          count += 1;
        }
      }
      return count;
    },
    async createOffer(input) {
      const requirement = requirements.get(input.requirementId);
      const project = projects.get(requirement?.project_id);
      if (!project || project.company_id !== actorCompany(input.actorUserId)) {
        throw new OfferServiceError("Company cannot create this offer.", 403, "OFFER_PERMISSION_DENIED");
      }
      if (!["open", "active"].includes(project.status)) {
        throw new OfferServiceError("This labour requirement is not open.", 409, "OFFER_STATE_CONFLICT");
      }
      if (!workers.has(input.workerId)) {
        throw new OfferServiceError("Worker not found.", 404, "OFFER_NOT_FOUND");
      }
      if (input.applicationId) {
        const application = applications.get(input.applicationId);
        if (
          !application
          || application.worker_id !== input.workerId
          || application.project_requirement_id !== input.requirementId
          || application.status !== "applied"
        ) {
          throw new OfferServiceError("Application not found.", 404, "OFFER_NOT_FOUND");
        }
      }
      if (input.priorOfferId) {
        const prior = offers.get(input.priorOfferId);
        if (!prior || prior.worker_id !== input.workerId || prior.project_requirement_id !== input.requirementId || prior.status === "pending") {
          throw new OfferServiceError("Prior offer not found.", 404, "OFFER_NOT_FOUND");
        }
      }
      const filled = [...placements.values()].filter(
        (placement) => placement.project_requirement_id === input.requirementId && ["upcoming", "active"].includes(placement.status),
      ).length;
      if (filled >= requirement.workers_required) {
        throw new OfferServiceError("This labour requirement is already filled.", 409, "OFFER_STATE_CONFLICT");
      }
      if ([...offers.values()].some((offer) => offer.worker_id === input.workerId && offer.project_requirement_id === input.requirementId && offer.status === "pending")) {
        throw new OfferServiceError("A pending offer already exists for this worker and requirement.", 409, "OFFER_EXISTS");
      }
      const id = uuid(++offerSequence);
      offers.set(id, offerRow(input, id));
      return clone(offers.get(id));
    },
    async getOffer(id) {
      return clone(offers.get(id) || null);
    },
    async listWorkerOffers() {
      return [...offers.values()].map(clone);
    },
    async listCompanyOffers() {
      return [...offers.values()].map(clone);
    },
    async acceptOffer(actorUserId, offerId) {
      const offer = offers.get(offerId);
      const worker = [...workers.values()].find((item) => item.user_id === actorUserId);
      if (!offer || !worker || offer.worker_id !== worker.id) {
        throw new OfferServiceError("Offer not found.", 404, "OFFER_NOT_FOUND");
      }
      if (offer.status === "pending" && new Date(offer.expires_at).getTime() <= Date.now()) {
        offer.status = "expired";
        return { outcome: "expired", offer_id: offer.id };
      }
      if (offer.status !== "pending") {
        return {
          outcome: offer.status === "accepted" ? "already_accepted" : offer.status,
          offer_id: offer.id,
        };
      }
      const requirement = requirements.get(offer.project_requirement_id);
      const project = projects.get(requirement?.project_id);
      if (!project || !["open", "active"].includes(project.status)) {
        return { outcome: "requirement_closed", offer_id: offer.id };
      }
      const filled = [...placements.values()].filter(
        (placement) => placement.project_requirement_id === offer.project_requirement_id && ["upcoming", "active"].includes(placement.status),
      ).length;
      if (filled >= requirement.workers_required) return { outcome: "capacity_full", offer_id: offer.id };
      const scheduleConflict = [...placements.values()].some((placement) => {
        if (placement.worker_id !== worker.id || !["upcoming", "active"].includes(placement.status)) {
          return false;
        }
        const placementEnd = placement.agreed_estimated_end_date || "9999-12-31";
        const offerEnd = offer.estimated_end_date || "9999-12-31";
        return placement.agreed_start_date <= offerEnd && offer.start_date <= placementEnd;
      });
      if (scheduleConflict) return { outcome: "schedule_conflict", offer_id: offer.id };
      if (failPlacementInsert) throw new Error("simulated placement insert failure");
      const placementId = uuid(++placementSequence);
      const placement = placementRow(offer, placementId);
      placements.set(placementId, placement);
      offer.status = "accepted";
      offer.responded_at = new Date().toISOString();
      const nowFilled = filled + 1;
      if (nowFilled >= requirement.workers_required) {
        for (const candidate of offers.values()) {
          if (candidate.id !== offer.id && candidate.project_requirement_id === requirement.id && candidate.status === "pending") {
            candidate.status = "cancelled";
            candidate.cancelled_at = new Date().toISOString();
          }
        }
      }
      return { outcome: "accepted", offer_id: offer.id, placement_id: placementId };
    },
    async declineOffer(actorUserId, offerId, reason, comment) {
      const offer = offers.get(offerId);
      const worker = [...workers.values()].find((item) => item.user_id === actorUserId);
      if (!offer || !worker || offer.worker_id !== worker.id) {
        throw new OfferServiceError("Offer not found.", 404, "OFFER_NOT_FOUND");
      }
      if (offer.status !== "pending") return { outcome: offer.status, offer_id: offer.id };
      offer.status = "declined";
      offer.decline_reason = reason;
      offer.decline_comment = comment || null;
      offer.responded_at = new Date().toISOString();
      return { outcome: "declined", offer_id: offer.id };
    },
    async getPlacement(id) {
      return clone(placements.get(id) || null);
    },
    async listWorkerPlacements() {
      return [...placements.values()].map(clone);
    },
    async listCompanyPlacements() {
      return [...placements.values()].map(clone);
    },
  };
  return adapter;
}

async function rejectsCode(promise, code) {
  await assert.rejects(promise, (error) => error?.code === code);
}

test("offer creation requires authentication", async () => {
  const service = createOfferService({ adapter: fakeOfferAdapter() });
  await rejectsCode(service.create(null, offerInput()), "UNAUTHENTICATED");
});

test("worker cannot create a company offer", async () => {
  const service = createOfferService({ adapter: fakeOfferAdapter() });
  await rejectsCode(service.create(workerPrincipal(), offerInput()), "COMPANY_REQUIRED");
});

test("Supervisor has read-only offer access", async () => {
  const service = createOfferService({ adapter: fakeOfferAdapter() });
  await rejectsCode(service.create(companyPrincipal("Supervisor"), offerInput()), "OFFER_PERMISSION_DENIED");
  assert.deepEqual(await service.listCompanyOffers(companyPrincipal("Supervisor")), []);
});

test("Administrator and Manager can create canonical offers", async () => {
  for (const role of ["Administrator", "Manager"]) {
    const adapter = fakeOfferAdapter();
    const service = createOfferService({ adapter });
    const offer = await service.create(companyPrincipal(role), offerInput());
    assert.equal(offer.status, "pending");
    assert.equal(offer.companyId, COMPANY_A);
  }
});

test("cross-company requirement offer is denied without existence leakage", async () => {
  const service = createOfferService({ adapter: fakeOfferAdapter() });
  await rejectsCode(
    service.create(companyPrincipal(), offerInput({ requirementId: REQUIREMENT_B, applicationId: "" })),
    "OFFER_PERMISSION_DENIED",
  );
});

test("offer authority rejects browser-owned company and status fields", async () => {
  const service = createOfferService({ adapter: fakeOfferAdapter() });
  await rejectsCode(service.create(companyPrincipal(), offerInput({ companyId: COMPANY_B })), "OFFER_AUTHORITY_FORBIDDEN");
  await rejectsCode(service.create(companyPrincipal(), offerInput({ status: "accepted" })), "OFFER_AUTHORITY_FORBIDDEN");
});

test("offer target worker and application relationship are validated", async () => {
  const service = createOfferService({ adapter: fakeOfferAdapter() });
  await rejectsCode(service.create(companyPrincipal(), offerInput({ workerId: "00000000-0000-4000-8000-000000000999" })), "OFFER_NOT_FOUND");
  await rejectsCode(service.create(companyPrincipal(), offerInput({ workerId: WORKER_B })), "OFFER_NOT_FOUND");
});

test("direct offer does not fabricate an application", async () => {
  const service = createOfferService({ adapter: fakeOfferAdapter() });
  const offer = await service.create(
    companyPrincipal(),
    offerInput({ workerId: WORKER_C, applicationId: "", source: undefined }),
  );
  assert.equal(offer.applicationId, "");
  assert.equal(offer.source, "direct");
});

test("withdrawn application cannot be reused as an active offer source", async () => {
  const adapter = fakeOfferAdapter();
  adapter.applications.get(APPLICATION_A).status = "withdrawn";
  const service = createOfferService({ adapter });
  await rejectsCode(service.create(companyPrincipal(), offerInput()), "OFFER_NOT_FOUND");
  assert.equal(adapter.offers.size, 0);
});

test("company offer response excludes worker private rate and auth material", async () => {
  const service = createOfferService({ adapter: fakeOfferAdapter() });
  const offer = await service.create(companyPrincipal(), offerInput());
  const serialized = JSON.stringify(offer);
  assert.doesNotMatch(serialized, /private_minimum|password|user_id/i);
});

test("worker lists only their own offers even if adapter over-returns", async () => {
  const adapter = fakeOfferAdapter();
  const service = createOfferService({ adapter });
  await service.create(companyPrincipal(), offerInput());
  await service.create(companyPrincipal(), offerInput({ workerId: WORKER_B, applicationId: APPLICATION_B }));
  const offers = await service.listWorkerOffers(workerPrincipal(WORKER_A));
  assert.equal(offers.length, 1);
  assert.equal(offers[0].workerId, WORKER_A);
});

test("worker cannot open another worker offer", async () => {
  const adapter = fakeOfferAdapter();
  const service = createOfferService({ adapter });
  const offer = await service.create(companyPrincipal(), offerInput());
  await rejectsCode(service.getWorkerOffer(workerPrincipal(WORKER_B), offer.id), "OFFER_NOT_FOUND");
});

test("browser worker identity cannot redirect acceptance", async () => {
  const service = createOfferService({ adapter: fakeOfferAdapter() });
  const offer = await service.create(companyPrincipal(), offerInput());
  await rejectsCode(service.accept(workerPrincipal(), offer.id, { workerId: WORKER_B }), "OFFER_AUTHORITY_FORBIDDEN");
});

test("pending valid offer acceptance creates exactly one linked placement", async () => {
  const adapter = fakeOfferAdapter();
  const service = createOfferService({ adapter });
  const offer = await service.create(companyPrincipal(), offerInput());
  const accepted = await service.accept(workerPrincipal(), offer.id);
  assert.equal(accepted.offer.status, "accepted");
  assert.equal(accepted.placement.acceptedOfferId, offer.id);
  assert.equal(adapter.placements.size, 1);
});

test("placement snapshots the exact accepted commercial and schedule terms", async () => {
  const adapter = fakeOfferAdapter();
  const service = createOfferService({ adapter });
  const offer = await service.create(companyPrincipal(), offerInput());
  const { placement } = await service.accept(workerPrincipal(), offer.id);
  assert.equal(placement.agreedDayRate, 250);
  assert.equal(placement.startDate, "2026-10-01");
  assert.equal(placement.shiftStartTime, "07:30");
  assert.equal(placement.workActivity, "Lighting installation");
  assert.equal(placement.accommodationAllowancePerNight, 45);
});

test("accepted snapshots do not change when requirement data changes", async () => {
  const adapter = fakeOfferAdapter();
  const service = createOfferService({ adapter });
  const offer = await service.create(companyPrincipal(), offerInput());
  const accepted = await service.accept(workerPrincipal(), offer.id);
  adapter.requirements.get(REQUIREMENT_A).work_activity = "Changed later";
  const [loaded] = await service.listPlacements(workerPrincipal());
  assert.equal(loaded.id, accepted.placement.id);
  assert.equal(loaded.workActivity, "Lighting installation");
});

test("second acceptance is rejected and cannot duplicate placement", async () => {
  const adapter = fakeOfferAdapter();
  const service = createOfferService({ adapter });
  const offer = await service.create(companyPrincipal(), offerInput());
  await service.accept(workerPrincipal(), offer.id);
  await rejectsCode(service.accept(workerPrincipal(), offer.id), "OFFER_ALREADY_ACCEPTED");
  assert.equal(adapter.placements.size, 1);
});

test("expired offer cannot be accepted and canonical expiry persists", async () => {
  const adapter = fakeOfferAdapter();
  const service = createOfferService({ adapter });
  const offer = await service.create(companyPrincipal(), offerInput());
  adapter.offers.get(offer.id).expires_at = new Date(Date.now() - 1000).toISOString();
  await rejectsCode(service.accept(workerPrincipal(), offer.id), "OFFER_EXPIRED");
  assert.equal(adapter.offers.get(offer.id).status, "expired");
  assert.equal(adapter.placements.size, 0);
});

test("declined and cancelled offers cannot be accepted", async () => {
  for (const status of ["declined", "cancelled"]) {
    const adapter = fakeOfferAdapter();
    const service = createOfferService({ adapter });
    const offer = await service.create(companyPrincipal(), offerInput());
    adapter.offers.get(offer.id).status = status;
    await rejectsCode(
      service.accept(workerPrincipal(), offer.id),
      status === "declined" ? "OFFER_DECLINED" : "OFFER_CANCELLED",
    );
  }
});

test("another worker cannot accept an offer", async () => {
  const service = createOfferService({ adapter: fakeOfferAdapter() });
  const offer = await service.create(companyPrincipal(), offerInput());
  await rejectsCode(service.accept(workerPrincipal(WORKER_B), offer.id), "OFFER_NOT_FOUND");
});

test("acceptance failure rolls back offer and placement state", async () => {
  const adapter = fakeOfferAdapter();
  const service = createOfferService({ adapter });
  const offer = await service.create(companyPrincipal(), offerInput());
  adapter.setFailPlacementInsert(true);
  await assert.rejects(service.accept(workerPrincipal(), offer.id), /simulated/);
  assert.equal(adapter.offers.get(offer.id).status, "pending");
  assert.equal(adapter.placements.size, 0);
});

test("project closure after offer creation blocks placement acceptance", async () => {
  const adapter = fakeOfferAdapter();
  const service = createOfferService({ adapter });
  const offer = await service.create(companyPrincipal(), offerInput());
  adapter.projects.get(PROJECT_A).status = "cancelled";
  await rejectsCode(service.accept(workerPrincipal(), offer.id), "REQUIREMENT_CLOSED");
  assert.equal(adapter.offers.get(offer.id).status, "pending");
  assert.equal(adapter.placements.size, 0);
});

test("closed project cannot receive a new pending offer", async () => {
  const adapter = fakeOfferAdapter();
  adapter.projects.get(PROJECT_A).status = "completed";
  const service = createOfferService({ adapter });
  await rejectsCode(service.create(companyPrincipal(), offerInput()), "OFFER_STATE_CONFLICT");
  assert.equal(adapter.offers.size, 0);
});

test("overlapping canonical placement blocks offer acceptance", async () => {
  const adapter = fakeOfferAdapter();
  const service = createOfferService({ adapter });
  const offer = await service.create(companyPrincipal(), offerInput());
  adapter.placements.set(
    "00000000-0000-4000-8000-000000000699",
    {
      worker_id: WORKER_A,
      project_requirement_id: REQUIREMENT_B,
      status: "upcoming",
      agreed_start_date: "2026-09-28",
      agreed_estimated_end_date: "2026-10-15",
    },
  );
  await rejectsCode(
    service.accept(workerPrincipal(), offer.id),
    "PLACEMENT_SCHEDULE_CONFLICT",
  );
  assert.equal(adapter.offers.get(offer.id).status, "pending");
});

test("confirmed placements reduce capacity while pending offers do not", async () => {
  const adapter = fakeOfferAdapter();
  const service = createOfferService({ adapter });
  const first = await service.create(companyPrincipal(), offerInput());
  await service.create(companyPrincipal(), offerInput({ workerId: WORKER_B, applicationId: APPLICATION_B }));
  assert.equal(adapter.placements.size, 0);
  await service.accept(workerPrincipal(), first.id);
  assert.equal(adapter.placements.size, 1);
});

test("final vacancy acceptance fills requirement and cancels excess pending offers", async () => {
  const adapter = fakeOfferAdapter();
  adapter.requirements.get(REQUIREMENT_A).workers_required = 1;
  const service = createOfferService({ adapter });
  const first = await service.create(companyPrincipal(), offerInput());
  const second = await service.create(companyPrincipal(), offerInput({ workerId: WORKER_B, applicationId: APPLICATION_B }));
  await service.accept(workerPrincipal(), first.id);
  assert.equal(adapter.offers.get(second.id).status, "cancelled");
  await rejectsCode(service.accept(workerPrincipal(WORKER_B), second.id), "OFFER_CANCELLED");
});

test("capacity-full requirement rejects new offers", async () => {
  const adapter = fakeOfferAdapter();
  adapter.requirements.get(REQUIREMENT_A).workers_required = 1;
  const service = createOfferService({ adapter });
  const first = await service.create(companyPrincipal(), offerInput());
  await service.accept(workerPrincipal(), first.id);
  await rejectsCode(
    service.create(companyPrincipal(), offerInput({ workerId: WORKER_C, applicationId: "" })),
    "OFFER_STATE_CONFLICT",
  );
});

test("worker can decline with every canonical frontend reason", async () => {
  for (const reason of WORKER_DECLINE_REASONS) {
    const adapter = fakeOfferAdapter();
    const service = createOfferService({ adapter });
    const offer = await service.create(companyPrincipal(), offerInput());
    const declined = await service.decline(workerPrincipal(), offer.id, {
      reason,
      comment: "Optional worker context.",
    });
    assert.equal(declined.status, "declined");
    assert.equal(declined.declineReason, reason);
    assert.equal(declined.declineComment, "Optional worker context.");
    assert.equal(adapter.placements.size, 0);
  }
});

test("invalid decline reason and another worker decline fail closed", async () => {
  const adapter = fakeOfferAdapter();
  const service = createOfferService({ adapter });
  const offer = await service.create(companyPrincipal(), offerInput());
  await rejectsCode(service.decline(workerPrincipal(), offer.id, { reason: "Anything" }), "INVALID_DECLINE_REASON");
  await rejectsCode(service.decline(workerPrincipal(WORKER_B), offer.id, { reason: "Other" }), "OFFER_NOT_FOUND");
});

test("re-offer creates a new ID and preserves declined history", async () => {
  const adapter = fakeOfferAdapter();
  const service = createOfferService({ adapter });
  const first = await service.create(companyPrincipal(), offerInput());
  await service.decline(workerPrincipal(), first.id, { reason: "Rate Too Low" });
  const second = await service.create(companyPrincipal(), offerInput({
    priorOfferId: first.id,
    offeredDayRate: 275,
  }));
  assert.notEqual(second.id, first.id);
  assert.equal(second.priorOfferId, first.id);
  assert.equal(adapter.offers.get(first.id).status, "declined");
  assert.equal(adapter.offers.get(first.id).offered_day_rate, 250);
  assert.equal(second.offeredDayRate, 275);
});

test("worker and company placement lists are ownership-scoped", async () => {
  const adapter = fakeOfferAdapter();
  const service = createOfferService({ adapter });
  const offerA = await service.create(companyPrincipal(), offerInput());
  await service.accept(workerPrincipal(), offerA.id);
  const offerB = await service.create(
    companyPrincipal("Administrator", COMPANY_B),
    offerInput({ workerId: WORKER_B, requirementId: REQUIREMENT_B, applicationId: "", startDate: "2026-11-01" }),
  );
  await service.accept(workerPrincipal(WORKER_B), offerB.id);
  assert.deepEqual((await service.listPlacements(workerPrincipal())).map((item) => item.workerId), [WORKER_A]);
  assert.deepEqual((await service.listPlacements(companyPrincipal())).map((item) => item.companyId), [COMPANY_A]);
  assert.deepEqual(
    (await service.listPlacements(companyPrincipal("Administrator", COMPANY_B))).map((item) => item.companyId),
    [COMPANY_B],
  );
});

test("canonical placement survives service reload and is independent of localStorage", async () => {
  const adapter = fakeOfferAdapter();
  const firstService = createOfferService({ adapter });
  const offer = await firstService.create(companyPrincipal(), offerInput());
  const accepted = await firstService.accept(workerPrincipal(), offer.id);
  const secondService = createOfferService({ adapter });
  const [loaded] = await secondService.listPlacements(workerPrincipal());
  assert.equal(loaded.id, accepted.placement.id);
  assert.equal(loaded.acceptedOfferId, offer.id);
});

test("worker offer and placement projections exclude company budgets and auth material", async () => {
  const adapter = fakeOfferAdapter();
  const service = createOfferService({ adapter });
  const offer = await service.create(companyPrincipal(), offerInput());
  const accepted = await service.accept(workerPrincipal(), offer.id);
  const serialized = JSON.stringify(accepted);
  assert.doesNotMatch(serialized, /labour_budget|minim.*rate|password|created_by_user_id/i);
});

test("Supabase offer adapter is secret-key-only and fails closed", () => {
  const calls = [];
  const adapter = createSupabaseOfferAdapter({
    env: {
      SUPABASE_URL: "https://onsite-test.supabase.co",
      SUPABASE_SECRET_KEY: "sb_secret_test",
    },
    clientFactory(url, key, options) {
      calls.push({ url, key, options });
      return {};
    },
  });
  assert.equal(adapter.configured, true);
  assert.equal(calls[0].key, "sb_secret_test");
  assert.equal(calls[0].options.auth.persistSession, false);
  assert.equal(JSON.stringify(adapter).includes("sb_secret_test"), false);
  assert.deepEqual(createSupabaseOfferAdapter({ env: {} }), { configured: false });
});

test("offers and placements migration is atomic, restrictive and least privilege", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "supabase", "migrations", "202609160005_offers_placements.sql"),
    "utf8",
  );
  assert.match(source, /^begin;/);
  assert.match(source, /commit;\s*$/);
  assert.match(source, /create table public\.worker_offers/);
  assert.match(source, /create table public\.placements/);
  assert.match(source, /constraint worker_offers_project_requirement_id_fkey[\s\S]*on delete restrict/);
  assert.match(source, /constraint placements_project_requirement_id_fkey[\s\S]*on delete restrict/);
  assert.match(source, /constraint placements_accepted_offer_unique/);
  assert.match(source, /where worker\.user_id = p_actor_user_id\s+for update;/);
  assert.match(source, /for update;/i);
  assert.match(source, /daterange\([\s\S]*schedule_conflict/);
  assert.match(source, /create or replace function public\.accept_worker_offer/);
  assert.match(source, /security definer[\s\S]*set search_path = public, pg_temp/);
  assert.match(source, /membership\.role in \('administrator', 'manager'\)/);
  assert.match(source, /alter table public\.worker_offers enable row level security/);
  assert.match(source, /alter table public\.placements enable row level security/);
  assert.doesNotMatch(source, /grant (insert|update|delete)[\s\S]*to authenticated/i);
  assert.doesNotMatch(source, /grant (insert|update|delete)[\s\S]*to anon/i);
  assert.doesNotMatch(source, /grant (insert|update|delete)[^;]*to service_role/i);
  assert.match(source, /application\.status = 'applied'/);
  const sqlDeclineReasonBlock = source.match(
    /v_allowed_reasons constant text\[\] := array\[([\s\S]*?)\];/,
  );
  assert.ok(sqlDeclineReasonBlock);
  assert.deepEqual(
    [...sqlDeclineReasonBlock[1].matchAll(/'([^']+)'/g)].map((match) => match[1]),
    WORKER_DECLINE_REASONS,
  );
  const authenticatedOfferGrant = source.match(
    /grant select \(([\s\S]*?)\) on public\.worker_offers to authenticated;/,
  );
  assert.ok(authenticatedOfferGrant);
  assert.doesNotMatch(authenticatedOfferGrant[1], /created_by_user_id/);
});

test("offer transactions follow the project-save lock order", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "..", "supabase", "migrations", "202609160005_offers_placements.sql"),
    "utf8",
  );
  const projectMigration = fs.readFileSync(
    path.join(__dirname, "..", "supabase", "migrations", "202609160003_projects_foundation.sql"),
    "utf8",
  );
  const createBody = migration.slice(
    migration.indexOf("create or replace function public.create_worker_offer"),
    migration.indexOf("create or replace function public.accept_worker_offer"),
  );
  const acceptBody = migration.slice(
    migration.indexOf("create or replace function public.accept_worker_offer"),
    migration.indexOf("create or replace function public.decline_worker_offer"),
  );
  const saveBody = projectMigration.slice(
    projectMigration.indexOf("create or replace function public.save_company_project"),
  );
  const createProjectLock = createBody.indexOf("where project.id = v_project_id\n  for update;");
  const createRequirementLock = createBody.indexOf(
    "and requirement.project_id = v_project.id\n  for update;",
  );
  const createStatusCheck = createBody.indexOf(
    "if v_project.status not in ('open', 'active') then",
  );
  const offerInsert = createBody.indexOf("insert into public.worker_offers");
  const acceptWorkerLock = acceptBody.indexOf(
    "where worker.user_id = p_actor_user_id\n  for update;",
  );
  const acceptOfferLock = acceptBody.indexOf(
    "and offer.project_requirement_id = v_requirement.id\n  for update;",
  );
  const acceptProjectLock = acceptBody.indexOf("where project.id = v_project_id\n  for update;");
  const acceptRequirementLock = acceptBody.indexOf(
    "and requirement.project_id = v_project.id\n  for update;",
  );
  const acceptStatusCheck = acceptBody.indexOf(
    "if v_project.status not in ('open', 'active') then",
  );
  const capacityCount = acceptBody.indexOf("select count(*)", acceptRequirementLock);
  const placementInsert = acceptBody.indexOf("insert into public.placements");

  assert.ok(createProjectLock >= 0 && createProjectLock < createRequirementLock);
  assert.ok(createRequirementLock < createStatusCheck);
  assert.ok(createStatusCheck < offerInsert);
  assert.ok(acceptWorkerLock >= 0 && acceptWorkerLock < acceptProjectLock);
  assert.ok(acceptProjectLock < acceptRequirementLock);
  assert.ok(acceptRequirementLock < acceptOfferLock);
  assert.ok(acceptOfferLock < acceptStatusCheck);
  assert.ok(acceptRequirementLock < capacityCount);
  assert.ok(capacityCount < placementInsert);
  assert.ok(acceptStatusCheck < placementInsert);
  assert.ok(saveBody.indexOf("update public.projects") < saveBody.indexOf("update public.project_requirements"));
});

test("frontend and backend use one canonical worker decline-reason module", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const index = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.match(app, /OnSiteOfferDeclineReasons\?\.WORKER_DECLINE_REASONS/);
  assert.ok(
    index.indexOf('src="offer-decline-reasons.js"') < index.indexOf('src="app.js"'),
  );
  assert.equal(WORKER_DECLINE_REASONS.includes("Rate Too Low"), true);
});

test("offer and placement history blocks ordinary requirement deletion", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "..", "supabase", "migrations", "202609160005_offers_placements.sql"),
    "utf8",
  );
  const projectServer = fs.readFileSync(path.join(__dirname, "..", "server-projects.js"), "utf8");
  assert.match(migration, /worker_offers_project_requirement_id_fkey[\s\S]*on delete restrict/);
  assert.match(migration, /placements_project_requirement_id_fkey[\s\S]*on delete restrict/);
  assert.match(projectServer, /worker_offers_project_requirement_id_fkey/);
  assert.match(projectServer, /placements_project_requirement_id_fkey/);
  assert.match(projectServer, /PROJECT_REQUIREMENT_HAS_APPLICATIONS/);
});

test("server and frontend expose canonical offer and placement integration points", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  assert.match(server, /req\.method === 'POST' && url\.pathname === '\/api\/offers'/);
  assert.match(server, /const acceptMatch = url\.pathname\.match\(\/\^\\\/api\\\/offers/);
  assert.match(server, /url\.pathname === '\/api\/placements'/);
  assert.match(app, /canonicalMarketplaceOffer/);
  assert.match(app, /canonicalPlacement/);
  assert.match(app, /marketplaceApiRequest\(`\/api\/offers\/\$\{app\.id\}\/accept`/);
});
