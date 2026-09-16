"use strict";

const { createClient } = require("@supabase/supabase-js");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMPANY_ROLES = new Set(["administrator", "manager", "supervisor"]);
const COMPANY_WRITE_ROLES = new Set(["administrator", "manager"]);
const OFFER_STATUSES = new Set(["pending", "accepted", "declined", "expired", "cancelled"]);
const PLACEMENT_STATUSES = new Set(["upcoming", "active", "completed", "cancelled"]);
const DECLINE_REASONS = new Set([
  "Unavailable / In Work",
  "Rate Too Low",
  "Location / Travel",
  "Start Date Not Suitable",
  "Project Duration Not Suitable",
  "Work Activity Not Suitable",
  "Other",
]);

const OFFER_SELECTION = [
  "id",
  "worker_id",
  "project_requirement_id",
  "application_id",
  "prior_offer_id",
  "status",
  "source",
  "offered_day_rate",
  "project_name_snapshot",
  "job_number_snapshot",
  "company_name_snapshot",
  "location_label_snapshot",
  "trade_snapshot",
  "role_snapshot",
  "grade_snapshot",
  "work_activity_snapshot",
  "start_date",
  "estimated_end_date",
  "no_fixed_end_date",
  "duration_label",
  "working_days",
  "shift_start_time",
  "shift_finish_time",
  "accommodation_paid",
  "accommodation_arrangement",
  "accommodation_allowance_per_night",
  "overtime_available",
  "overtime_rates",
  "weekend_rates",
  "expires_at",
  "decline_reason",
  "decline_comment",
  "responded_at",
  "cancelled_at",
  "created_at",
  "updated_at",
  "project_requirements!inner(id,project_id,projects!inner(id,company_id,status))",
  "worker_profiles(id,name,trade,trade_key,specialism,role_key,grade,years_experience,location,profile_photo_reference)",
].join(",");

const PLACEMENT_SELECTION = [
  "id",
  "worker_id",
  "project_requirement_id",
  "accepted_offer_id",
  "application_id",
  "status",
  "agreed_day_rate",
  "project_name_snapshot",
  "job_number_snapshot",
  "company_name_snapshot",
  "location_label_snapshot",
  "trade_snapshot",
  "role_snapshot",
  "grade_snapshot",
  "agreed_work_activity",
  "agreed_start_date",
  "agreed_estimated_end_date",
  "agreed_no_fixed_end_date",
  "agreed_duration_label",
  "agreed_working_days",
  "agreed_shift_start_time",
  "agreed_shift_finish_time",
  "agreed_accommodation_paid",
  "agreed_accommodation_arrangement",
  "agreed_accommodation_allowance_per_night",
  "agreed_overtime_available",
  "agreed_overtime_rates",
  "agreed_weekend_rates",
  "created_at",
  "updated_at",
  "project_requirements!inner(id,project_id,projects!inner(id,company_id,status))",
  "worker_profiles(id,name,trade,trade_key,specialism,role_key,grade,years_experience,location,profile_photo_reference)",
].join(",");

class OfferServiceError extends Error {
  constructor(message, statusCode = 400, code = "OFFER_ERROR") {
    super(message);
    this.name = "OfferServiceError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function cleanText(value, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function firstRecord(value) {
  if (Array.isArray(value)) return value[0] || null;
  return value && typeof value === "object" ? value : null;
}

function requirementFromRecord(row = {}) {
  return firstRecord(row.project_requirements) || firstRecord(row.requirement) || {};
}

function projectFromRecord(row = {}) {
  const requirement = requirementFromRecord(row);
  return firstRecord(requirement.projects) || firstRecord(requirement.project) || {};
}

function workerFromRecord(row = {}) {
  return firstRecord(row.worker_profiles) || firstRecord(row.worker) || {};
}

function dateOnly(value) {
  const text = cleanText(value, 40).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function timeOnly(value) {
  const text = cleanText(value, 16).slice(0, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : "";
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? structuredClone(value)
    : null;
}

function safeWorkerSummary(row = {}) {
  const worker = workerFromRecord(row);
  return {
    id: worker.id || row.worker_id || "",
    name: cleanText(worker.name, 200),
    trade: cleanText(worker.trade, 160),
    tradeKey: cleanText(worker.trade_key, 160),
    specialism: cleanText(worker.specialism, 200),
    roleKey: cleanText(worker.role_key, 160),
    grade: cleanText(worker.grade, 160),
    yearsExperience: worker.years_experience == null ? null : Number(worker.years_experience),
    location: cleanText(worker.location, 300),
    profilePhoto: cleanText(worker.profile_photo_reference, 1000),
  };
}

function offerProjection(row = {}, { company = false } = {}) {
  const project = projectFromRecord(row);
  const offer = {
    id: row.id,
    offerId: row.id,
    workerId: row.worker_id,
    requirementId: row.project_requirement_id,
    projectId: requirementFromRecord(row).project_id || project.id || "",
    applicationId: row.application_id || "",
    priorOfferId: row.prior_offer_id || "",
    status: OFFER_STATUSES.has(row.status) ? row.status : "pending",
    source: cleanText(row.source, 80),
    offeredDayRate: Number(row.offered_day_rate) || null,
    projectName: cleanText(row.project_name_snapshot, 200),
    jobNumber: cleanText(row.job_number_snapshot, 100),
    companyName: cleanText(row.company_name_snapshot, 200),
    location: cleanText(row.location_label_snapshot, 300),
    trade: cleanText(row.trade_snapshot, 160),
    role: cleanText(row.role_snapshot, 200),
    grade: cleanText(row.grade_snapshot, 160),
    workActivity: cleanText(row.work_activity_snapshot, 1000),
    startDate: dateOnly(row.start_date),
    estimatedEndDate: dateOnly(row.estimated_end_date),
    noFixedEndDate: !!row.no_fixed_end_date,
    duration: cleanText(row.duration_label, 120),
    workingDays: Array.isArray(row.working_days) ? [...row.working_days] : [],
    shiftStartTime: timeOnly(row.shift_start_time),
    shiftFinishTime: timeOnly(row.shift_finish_time),
    accommodationPaid: !!row.accommodation_paid,
    accommodationArrangement: cleanText(row.accommodation_arrangement, 120),
    accommodationAllowancePerNight:
      row.accommodation_allowance_per_night == null
        ? null
        : Number(row.accommodation_allowance_per_night),
    overtimeAvailable: !!row.overtime_available,
    overtimeRates: safeObject(row.overtime_rates),
    weekendRates: safeObject(row.weekend_rates),
    expiresAt: row.expires_at || "",
    declineReason: cleanText(row.decline_reason, 200),
    declineComment: cleanText(row.decline_comment, 1000),
    respondedAt: row.responded_at || "",
    cancelledAt: row.cancelled_at || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    canonicalMarketplaceOffer: true,
  };
  if (company) {
    offer.companyId = project.company_id || "";
    offer.worker = safeWorkerSummary(row);
  }
  return offer;
}

function placementProjection(row = {}, { company = false } = {}) {
  const project = projectFromRecord(row);
  const placement = {
    id: row.id,
    placementId: row.id,
    workerId: row.worker_id,
    requirementId: row.project_requirement_id,
    projectId: requirementFromRecord(row).project_id || project.id || "",
    acceptedOfferId: row.accepted_offer_id,
    applicationId: row.application_id || "",
    status: PLACEMENT_STATUSES.has(row.status) ? row.status : "upcoming",
    agreedDayRate: Number(row.agreed_day_rate) || null,
    projectName: cleanText(row.project_name_snapshot, 200),
    jobNumber: cleanText(row.job_number_snapshot, 100),
    companyName: cleanText(row.company_name_snapshot, 200),
    location: cleanText(row.location_label_snapshot, 300),
    trade: cleanText(row.trade_snapshot, 160),
    role: cleanText(row.role_snapshot, 200),
    grade: cleanText(row.grade_snapshot, 160),
    workActivity: cleanText(row.agreed_work_activity, 1000),
    startDate: dateOnly(row.agreed_start_date),
    estimatedEndDate: dateOnly(row.agreed_estimated_end_date),
    noFixedEndDate: !!row.agreed_no_fixed_end_date,
    duration: cleanText(row.agreed_duration_label, 120),
    workingDays: Array.isArray(row.agreed_working_days) ? [...row.agreed_working_days] : [],
    shiftStartTime: timeOnly(row.agreed_shift_start_time),
    shiftFinishTime: timeOnly(row.agreed_shift_finish_time),
    accommodationPaid: !!row.agreed_accommodation_paid,
    accommodationArrangement: cleanText(row.agreed_accommodation_arrangement, 120),
    accommodationAllowancePerNight:
      row.agreed_accommodation_allowance_per_night == null
        ? null
        : Number(row.agreed_accommodation_allowance_per_night),
    overtimeAvailable: !!row.agreed_overtime_available,
    overtimeRates: safeObject(row.agreed_overtime_rates),
    weekendRates: safeObject(row.agreed_weekend_rates),
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    canonicalPlacement: true,
  };
  if (company) {
    placement.companyId = project.company_id || "";
    placement.worker = safeWorkerSummary(row);
  }
  return placement;
}

function databaseContext(error = {}) {
  return [error.constraint, error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ");
}

function unwrapDatabaseResult(result, fallbackMessage) {
  if (result?.error) {
    const databaseCode = result.error.code || "OFFER_DATABASE_ERROR";
    const context = databaseContext(result.error);
    const pendingConflict =
      databaseCode === "23505" && context.includes("worker_offers_one_pending_idx");
    const statusByCode = {
      "22023": 400,
      "22P02": 400,
      "22007": 400,
      "42501": 403,
      P0002: 404,
      P0003: 409,
      "23503": 409,
      "23505": 409,
    };
    const publicCode = pendingConflict
      ? "OFFER_EXISTS"
      : databaseCode === "42501"
        ? "OFFER_PERMISSION_DENIED"
        : databaseCode === "P0002"
          ? "OFFER_NOT_FOUND"
          : databaseCode === "P0003"
            ? "OFFER_STATE_CONFLICT"
            : databaseCode;
    const publicMessage = pendingConflict
      ? "A pending offer already exists for this worker and requirement."
      : ["22023", "22P02", "22007", "42501", "P0002", "P0003"].includes(databaseCode)
        ? result.error.message || fallbackMessage
        : fallbackMessage;
    throw new OfferServiceError(
      publicMessage,
      statusByCode[databaseCode] || Number(result.error.status || result.error.statusCode) || 500,
      publicCode,
    );
  }
  return result && typeof result === "object" && Object.hasOwn(result, "data")
    ? result.data
    : result;
}

function createSupabaseOfferAdapter({ env = process.env, clientFactory = createClient } = {}) {
  const url = cleanText(env.SUPABASE_URL, 500);
  const secretKey = cleanText(env.SUPABASE_SECRET_KEY, 5000);
  if (!url || !secretKey) return { configured: false };
  const admin = clientFactory(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  return {
    configured: true,
    async expireOffers() {
      return unwrapDatabaseResult(
        await admin.rpc("expire_pending_worker_offers"),
        "Offers could not be refreshed.",
      );
    },
    async createOffer(input) {
      const id = unwrapDatabaseResult(
        await admin.rpc("create_worker_offer", {
          p_actor_user_id: input.actorUserId,
          p_worker_id: input.workerId,
          p_project_requirement_id: input.requirementId,
          p_application_id: input.applicationId || null,
          p_prior_offer_id: input.priorOfferId || null,
          p_terms: input.terms,
        }),
        "Offer could not be created.",
      );
      return this.getOffer(id);
    },
    async getOffer(offerId) {
      return unwrapDatabaseResult(
        await admin.from("worker_offers").select(OFFER_SELECTION).eq("id", offerId).maybeSingle(),
        "Offer could not be loaded.",
      );
    },
    async listWorkerOffers(workerId) {
      return unwrapDatabaseResult(
        await admin
          .from("worker_offers")
          .select(OFFER_SELECTION)
          .eq("worker_id", workerId)
          .order("created_at", { ascending: false }),
        "Offers could not be loaded.",
      ) || [];
    },
    async listCompanyOffers(companyId) {
      return unwrapDatabaseResult(
        await admin
          .from("worker_offers")
          .select(OFFER_SELECTION)
          .eq("project_requirements.projects.company_id", companyId)
          .order("created_at", { ascending: false }),
        "Company offers could not be loaded.",
      ) || [];
    },
    async acceptOffer(actorUserId, offerId) {
      return unwrapDatabaseResult(
        await admin.rpc("accept_worker_offer", {
          p_actor_user_id: actorUserId,
          p_offer_id: offerId,
        }),
        "Offer could not be accepted.",
      );
    },
    async declineOffer(actorUserId, offerId, reason, comment) {
      return unwrapDatabaseResult(
        await admin.rpc("decline_worker_offer", {
          p_actor_user_id: actorUserId,
          p_offer_id: offerId,
          p_reason: reason,
          p_comment: comment || null,
        }),
        "Offer could not be declined.",
      );
    },
    async getPlacement(placementId) {
      return unwrapDatabaseResult(
        await admin.from("placements").select(PLACEMENT_SELECTION).eq("id", placementId).maybeSingle(),
        "Placement could not be loaded.",
      );
    },
    async listWorkerPlacements(workerId) {
      return unwrapDatabaseResult(
        await admin
          .from("placements")
          .select(PLACEMENT_SELECTION)
          .eq("worker_id", workerId)
          .order("created_at", { ascending: false }),
        "Placements could not be loaded.",
      ) || [];
    },
    async listCompanyPlacements(companyId) {
      return unwrapDatabaseResult(
        await admin
          .from("placements")
          .select(PLACEMENT_SELECTION)
          .eq("project_requirements.projects.company_id", companyId)
          .order("created_at", { ascending: false }),
        "Company placements could not be loaded.",
      ) || [];
    },
  };
}

function requireWorkerPrincipal(principal) {
  if (!principal?.serverAuthenticated) {
    throw new OfferServiceError("Authentication is required.", 401, "UNAUTHENTICATED");
  }
  const workerId = principal.workerId || principal.id;
  if (
    principal.type !== "worker"
    || !UUID_PATTERN.test(workerId || "")
    || !UUID_PATTERN.test(principal.authUserId || "")
  ) {
    throw new OfferServiceError("Worker access is required.", 403, "WORKER_REQUIRED");
  }
  return { workerId, actorUserId: principal.authUserId };
}

function requireCompanyPrincipal(principal, { write = false } = {}) {
  if (!principal?.serverAuthenticated) {
    throw new OfferServiceError("Authentication is required.", 401, "UNAUTHENTICATED");
  }
  const companyId = principal.companyId || principal.id;
  const role = cleanText(principal.permissionRole || principal.companyRole, 40).toLowerCase();
  if (
    principal.type !== "company"
    || !UUID_PATTERN.test(companyId || "")
    || !UUID_PATTERN.test(principal.authUserId || "")
    || !COMPANY_ROLES.has(role)
  ) {
    throw new OfferServiceError("Company access is required.", 403, "COMPANY_REQUIRED");
  }
  if (write && !COMPANY_WRITE_ROLES.has(role)) {
    throw new OfferServiceError(
      "Your company role cannot manage offers.",
      403,
      "OFFER_PERMISSION_DENIED",
    );
  }
  return { companyId, role, actorUserId: principal.authUserId };
}

function forbidOwnershipClaims(input = {}, { allowWorkerTarget = false } = {}) {
  if (
    input.companyId
    || input.company_id
    || (!allowWorkerTarget && (input.workerId || input.worker_id))
    || input.createdByUserId
    || input.created_by_user_id
    || input.status
  ) {
    throw new OfferServiceError(
      "Offer ownership and status are server-managed.",
      400,
      "OFFER_AUTHORITY_FORBIDDEN",
    );
  }
}

function offerTerms(input = {}) {
  const offeredDayRate = Number(input.offeredDayRate ?? input.dayRate);
  if (!Number.isFinite(offeredDayRate) || offeredDayRate <= 0) {
    throw new OfferServiceError("Enter a valid offered day rate.", 400, "INVALID_OFFER");
  }
  return {
    offered_day_rate: Math.round(offeredDayRate * 100) / 100,
    source: cleanText(input.source, 80) || "application",
    start_date: dateOnly(input.startDate),
    estimated_end_date: dateOnly(input.estimatedEndDate),
    no_fixed_end_date:
      typeof input.noFixedEndDate === "boolean" ? input.noFixedEndDate : undefined,
    duration_label: cleanText(input.duration, 120),
    working_days: Array.isArray(input.workingDays)
      ? input.workingDays.map((value) => cleanText(value, 20)).filter(Boolean)
      : undefined,
    shift_start_time: timeOnly(input.shiftStartTime),
    shift_finish_time: timeOnly(input.shiftFinishTime),
    work_activity: cleanText(input.workActivity, 1000),
    accommodation_paid:
      typeof input.accommodationPaid === "boolean" ? input.accommodationPaid : undefined,
    accommodation_arrangement: cleanText(input.accommodationArrangement, 120),
    accommodation_allowance_per_night:
      input.accommodationAllowancePerNight == null
        ? null
        : Number(input.accommodationAllowancePerNight),
    overtime_available:
      typeof input.overtimeAvailable === "boolean" ? input.overtimeAvailable : undefined,
    overtime_rates: safeObject(input.overtimeRates),
    weekend_rates: safeObject(input.weekendRates),
  };
}

function outcomeError(outcome) {
  const errors = {
    accepted: ["This offer has already been accepted.", "OFFER_ALREADY_ACCEPTED"],
    already_accepted: ["This offer has already been accepted.", "OFFER_ALREADY_ACCEPTED"],
    declined: ["This offer has been declined.", "OFFER_DECLINED"],
    expired: ["This offer has expired.", "OFFER_EXPIRED"],
    cancelled: ["This offer is no longer available.", "OFFER_CANCELLED"],
    capacity_full: ["This labour requirement is now filled.", "PLACEMENT_CAPACITY_FULL"],
    schedule_conflict: ["This placement conflicts with another confirmed assignment.", "PLACEMENT_SCHEDULE_CONFLICT"],
    requirement_closed: ["This labour requirement is no longer open.", "REQUIREMENT_CLOSED"],
  };
  const [message, code] = errors[outcome] || ["This offer has already changed.", "OFFER_CHANGED"];
  return new OfferServiceError(message, 409, code);
}

function createOfferService({ adapter, env = process.env } = {}) {
  const offerAdapter = adapter || createSupabaseOfferAdapter({ env });

  function requireConfigured() {
    if (!offerAdapter.configured) {
      throw new OfferServiceError(
        "Offer persistence is not configured.",
        503,
        "OFFERS_NOT_CONFIGURED",
      );
    }
  }

  async function refreshExpiry() {
    if (typeof offerAdapter.expireOffers === "function") await offerAdapter.expireOffers();
  }

  return {
    configured: !!offerAdapter.configured,

    async create(principal, input = {}) {
      requireConfigured();
      const company = requireCompanyPrincipal(principal, { write: true });
      forbidOwnershipClaims(input, { allowWorkerTarget: true });
      const workerId = cleanText(input.workerId, 80);
      const requirementId = cleanText(input.requirementId, 80);
      const applicationId = cleanText(input.applicationId, 80);
      const priorOfferId = cleanText(input.priorOfferId, 80);
      if (!UUID_PATTERN.test(workerId) || !UUID_PATTERN.test(requirementId)) {
        throw new OfferServiceError("Worker and requirement are required.", 400, "INVALID_OFFER");
      }
      if (applicationId && !UUID_PATTERN.test(applicationId)) {
        throw new OfferServiceError("Application is invalid.", 400, "INVALID_OFFER");
      }
      if (priorOfferId && !UUID_PATTERN.test(priorOfferId)) {
        throw new OfferServiceError("Prior offer is invalid.", 400, "INVALID_OFFER");
      }
      const row = await offerAdapter.createOffer({
        actorUserId: company.actorUserId,
        workerId,
        requirementId,
        applicationId,
        priorOfferId,
        terms: offerTerms({
          ...input,
          source: input.source || (applicationId ? "application" : "direct"),
        }),
      });
      if (!row || projectFromRecord(row).company_id !== company.companyId) {
        throw new OfferServiceError("Offer could not be verified.", 500, "OFFER_OWNERSHIP_ERROR");
      }
      return offerProjection(row, { company: true });
    },

    async listWorkerOffers(principal) {
      requireConfigured();
      const { workerId } = requireWorkerPrincipal(principal);
      await refreshExpiry();
      const rows = await offerAdapter.listWorkerOffers(workerId);
      return (Array.isArray(rows) ? rows : [])
        .filter((row) => row?.worker_id === workerId)
        .map((row) => offerProjection(row));
    },

    async getWorkerOffer(principal, offerId) {
      requireConfigured();
      const { workerId } = requireWorkerPrincipal(principal);
      if (!UUID_PATTERN.test(offerId || "")) {
        throw new OfferServiceError("Offer not found.", 404, "OFFER_NOT_FOUND");
      }
      await refreshExpiry();
      const row = await offerAdapter.getOffer(offerId);
      if (!row || row.worker_id !== workerId) {
        throw new OfferServiceError("Offer not found.", 404, "OFFER_NOT_FOUND");
      }
      return offerProjection(row);
    },

    async listCompanyOffers(principal) {
      requireConfigured();
      const { companyId } = requireCompanyPrincipal(principal);
      await refreshExpiry();
      const rows = await offerAdapter.listCompanyOffers(companyId);
      return (Array.isArray(rows) ? rows : [])
        .filter((row) => projectFromRecord(row).company_id === companyId)
        .map((row) => offerProjection(row, { company: true }));
    },

    async accept(principal, offerId, input = {}) {
      requireConfigured();
      const worker = requireWorkerPrincipal(principal);
      forbidOwnershipClaims(input);
      if (!UUID_PATTERN.test(offerId || "")) {
        throw new OfferServiceError("Offer not found.", 404, "OFFER_NOT_FOUND");
      }
      const result = await offerAdapter.acceptOffer(worker.actorUserId, offerId);
      if (result?.outcome !== "accepted") throw outcomeError(result?.outcome);
      const [offerRow, placementRow] = await Promise.all([
        offerAdapter.getOffer(result.offer_id || offerId),
        offerAdapter.getPlacement(result.placement_id),
      ]);
      if (
        !offerRow
        || offerRow.worker_id !== worker.workerId
        || !placementRow
        || placementRow.worker_id !== worker.workerId
      ) {
        throw new OfferServiceError("Offer acceptance could not be verified.", 500, "OFFER_ACCEPTANCE_ERROR");
      }
      return {
        offer: offerProjection(offerRow),
        placement: placementProjection(placementRow),
      };
    },

    async decline(principal, offerId, input = {}) {
      requireConfigured();
      const worker = requireWorkerPrincipal(principal);
      forbidOwnershipClaims(input);
      if (!UUID_PATTERN.test(offerId || "")) {
        throw new OfferServiceError("Offer not found.", 404, "OFFER_NOT_FOUND");
      }
      const reason = cleanText(input.reason, 200);
      if (!DECLINE_REASONS.has(reason)) {
        throw new OfferServiceError("Choose a valid decline reason.", 400, "INVALID_DECLINE_REASON");
      }
      const result = await offerAdapter.declineOffer(
        worker.actorUserId,
        offerId,
        reason,
        cleanText(input.comment, 1000),
      );
      if (result?.outcome !== "declined") throw outcomeError(result?.outcome);
      const row = await offerAdapter.getOffer(result.offer_id || offerId);
      if (!row || row.worker_id !== worker.workerId) {
        throw new OfferServiceError("Offer decline could not be verified.", 500, "OFFER_DECLINE_ERROR");
      }
      return offerProjection(row);
    },

    async listPlacements(principal) {
      requireConfigured();
      if (principal?.type === "worker") {
        const { workerId } = requireWorkerPrincipal(principal);
        const rows = await offerAdapter.listWorkerPlacements(workerId);
        return (Array.isArray(rows) ? rows : [])
          .filter((row) => row?.worker_id === workerId)
          .map((row) => placementProjection(row));
      }
      const { companyId } = requireCompanyPrincipal(principal);
      const rows = await offerAdapter.listCompanyPlacements(companyId);
      return (Array.isArray(rows) ? rows : [])
        .filter((row) => projectFromRecord(row).company_id === companyId)
        .map((row) => placementProjection(row, { company: true }));
    },
  };
}

module.exports = {
  DECLINE_REASONS,
  OfferServiceError,
  createOfferService,
  createSupabaseOfferAdapter,
  offerProjection,
  placementProjection,
};
