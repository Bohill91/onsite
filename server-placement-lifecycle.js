"use strict";

const { createClient } = require("@supabase/supabase-js");
const {
  PLACEMENT_STATUSES,
  CHANGE_TYPES,
  CHANGE_STATUSES,
  RELEASE_TYPES,
  RELEASE_REASONS,
  WORKER_END_REASONS,
} = require("./placement-lifecycle-rules.js");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMPANY_ROLES = new Set(["administrator", "manager", "supervisor"]);
const COMPANY_WRITE_ROLES = new Set(["administrator", "manager"]);
const PLACEMENT_STATUS_SET = new Set(PLACEMENT_STATUSES);
const CHANGE_TYPE_SET = new Set(CHANGE_TYPES);
const CHANGE_STATUS_SET = new Set(CHANGE_STATUSES);
const RELEASE_TYPE_SET = new Set(RELEASE_TYPES);
const WORKER_END_REASON_SET = new Set(WORKER_END_REASONS);

const LIFECYCLE_PLACEMENT_SELECTION = [
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
  "current_day_rate",
  "current_work_activity",
  "current_start_date",
  "current_estimated_end_date",
  "current_no_fixed_end_date",
  "current_duration_label",
  "current_working_days",
  "current_shift_start_time",
  "current_shift_finish_time",
  "scheduled_end_date",
  "scheduled_end_type",
  "ended_at",
  "end_reason_code",
  "end_reason_text",
  "created_at",
  "updated_at",
  "project_requirements!inner(id,project_id,projects!inner(id,company_id,status))",
  "worker_profiles(id,name,trade,trade_key,specialism,role_key,grade,years_experience,location,profile_photo_reference)",
  "placement_lifecycle_events(id,placement_id,event_type,initiated_by_type,initiated_by_role,reason_code,reason_text,requested_at,effective_at,notice_days,notice_classification,worker_fault,metadata,private_company_notes,created_at)",
  "placement_change_offers(id,placement_id,status,change_type,proposed_terms,effective_date,expires_at,responded_at,applied_at,decline_reason,decline_comment,created_at,updated_at)",
].join(",");

class PlacementLifecycleError extends Error {
  constructor(message, statusCode = 400, code = "PLACEMENT_LIFECYCLE_ERROR") {
    super(message);
    this.name = "PlacementLifecycleError";
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
    : {};
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

function lifecycleEventProjection(row = {}, { company = false } = {}) {
  const event = {
    id: row.id || "",
    placementId: row.placement_id || "",
    type: cleanText(row.event_type, 80),
    initiatedByType: cleanText(row.initiated_by_type, 40),
    initiatedByRole: cleanText(row.initiated_by_role, 40),
    reasonCode: cleanText(row.reason_code, 200),
    reason: cleanText(row.reason_text, 1000),
    requestedAt: row.requested_at || "",
    effectiveAt: row.effective_at || "",
    noticeDays: row.notice_days == null ? null : Number(row.notice_days),
    noticeClassification: cleanText(row.notice_classification, 120),
    workerFault: !!row.worker_fault,
    metadata: safeObject(row.metadata),
    createdAt: row.created_at || "",
  };
  if (company) event.privateNotes = cleanText(row.private_company_notes, 2000);
  return event;
}

function changeOfferProjection(row = {}) {
  return {
    id: row.id || "",
    changeOfferId: row.id || "",
    placementId: row.placement_id || "",
    status: CHANGE_STATUS_SET.has(row.status) ? row.status : "pending",
    type: CHANGE_TYPE_SET.has(row.change_type) ? row.change_type : "schedule_change",
    proposedTerms: safeObject(row.proposed_terms),
    effectiveDate: dateOnly(row.effective_date),
    expiresAt: row.expires_at || "",
    respondedAt: row.responded_at || "",
    appliedAt: row.applied_at || "",
    declineReason: cleanText(row.decline_reason, 200),
    declineComment: cleanText(row.decline_comment, 1000),
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    canonicalPlacementChange: true,
  };
}

function placementLifecycleProjection(row = {}, { company = false } = {}) {
  const project = projectFromRecord(row);
  const originalTerms = {
    dayRate: Number(row.agreed_day_rate) || null,
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
  };
  const effectiveTerms = {
    dayRate: Number(row.current_day_rate ?? row.agreed_day_rate) || null,
    workActivity: cleanText(row.current_work_activity ?? row.agreed_work_activity, 1000),
    startDate: dateOnly(row.current_start_date ?? row.agreed_start_date),
    estimatedEndDate: dateOnly(
      row.current_estimated_end_date ?? row.agreed_estimated_end_date,
    ),
    noFixedEndDate: !!(row.current_no_fixed_end_date ?? row.agreed_no_fixed_end_date),
    duration: cleanText(row.current_duration_label ?? row.agreed_duration_label, 120),
    workingDays: Array.isArray(row.current_working_days)
      ? [...row.current_working_days]
      : [...originalTerms.workingDays],
    shiftStartTime: timeOnly(row.current_shift_start_time ?? row.agreed_shift_start_time),
    shiftFinishTime: timeOnly(row.current_shift_finish_time ?? row.agreed_shift_finish_time),
  };
  const placement = {
    id: row.id || "",
    placementId: row.id || "",
    workerId: row.worker_id || "",
    requirementId: row.project_requirement_id || "",
    projectId: requirementFromRecord(row).project_id || project.id || "",
    acceptedOfferId: row.accepted_offer_id || "",
    applicationId: row.application_id || "",
    status: PLACEMENT_STATUS_SET.has(row.status) ? row.status : "upcoming",
    projectName: cleanText(row.project_name_snapshot, 200),
    jobNumber: cleanText(row.job_number_snapshot, 100),
    companyName: cleanText(row.company_name_snapshot, 200),
    location: cleanText(row.location_label_snapshot, 300),
    trade: cleanText(row.trade_snapshot, 160),
    role: cleanText(row.role_snapshot, 200),
    grade: cleanText(row.grade_snapshot, 160),
    originalTerms,
    effectiveTerms,
    agreedDayRate: effectiveTerms.dayRate,
    workActivity: effectiveTerms.workActivity,
    startDate: effectiveTerms.startDate,
    estimatedEndDate: effectiveTerms.estimatedEndDate,
    noFixedEndDate: effectiveTerms.noFixedEndDate,
    duration: effectiveTerms.duration,
    workingDays: [...effectiveTerms.workingDays],
    shiftStartTime: effectiveTerms.shiftStartTime,
    shiftFinishTime: effectiveTerms.shiftFinishTime,
    accommodationPaid: originalTerms.accommodationPaid,
    accommodationArrangement: originalTerms.accommodationArrangement,
    accommodationAllowancePerNight: originalTerms.accommodationAllowancePerNight,
    overtimeAvailable: originalTerms.overtimeAvailable,
    overtimeRates: originalTerms.overtimeRates,
    weekendRates: originalTerms.weekendRates,
    scheduledEndDate: dateOnly(row.scheduled_end_date),
    scheduledEndType: cleanText(row.scheduled_end_type, 80),
    endedAt: row.ended_at || "",
    endReasonCode: cleanText(row.end_reason_code, 200),
    endReason: cleanText(row.end_reason_text, 1000),
    lifecycleEvents: (Array.isArray(row.placement_lifecycle_events)
      ? row.placement_lifecycle_events
      : [])
      .map((event) => lifecycleEventProjection(event, { company }))
      .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0)),
    changeOffers: (Array.isArray(row.placement_change_offers)
      ? row.placement_change_offers
      : [])
      .map(changeOfferProjection)
      .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0)),
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
    const databaseCode = result.error.code || "PLACEMENT_DATABASE_ERROR";
    const context = databaseContext(result.error);
    const pendingChange =
      databaseCode === "23505" && context.includes("placement_change_offers_one_pending_type_idx");
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
    const publicCode = pendingChange
      ? "PLACEMENT_CHANGE_EXISTS"
      : databaseCode === "42501"
        ? "PLACEMENT_PERMISSION_DENIED"
        : databaseCode === "P0002"
          ? "PLACEMENT_NOT_FOUND"
          : databaseCode === "P0003"
            ? "PLACEMENT_STATE_CONFLICT"
            : databaseCode;
    const publicMessage = pendingChange
      ? "A pending change of this type already exists for the placement."
      : ["22023", "22P02", "22007", "42501", "P0002", "P0003"].includes(databaseCode)
        ? result.error.message || fallbackMessage
        : fallbackMessage;
    throw new PlacementLifecycleError(
      publicMessage,
      statusByCode[databaseCode] || Number(result.error.status || result.error.statusCode) || 500,
      publicCode,
    );
  }
  return result && typeof result === "object" && Object.hasOwn(result, "data")
    ? result.data
    : result;
}

function createSupabasePlacementLifecycleAdapter({
  env = process.env,
  clientFactory = createClient,
} = {}) {
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
    async normalize() {
      return unwrapDatabaseResult(
        await admin.rpc("normalize_placement_lifecycle"),
        "Placement lifecycle could not be refreshed.",
      );
    },
    async getPlacement(placementId) {
      return unwrapDatabaseResult(
        await admin
          .from("placements")
          .select(LIFECYCLE_PLACEMENT_SELECTION)
          .eq("id", placementId)
          .maybeSingle(),
        "Placement could not be loaded.",
      );
    },
    async listWorkerPlacements(workerId) {
      return unwrapDatabaseResult(
        await admin
          .from("placements")
          .select(LIFECYCLE_PLACEMENT_SELECTION)
          .eq("worker_id", workerId)
          .order("created_at", { ascending: false }),
        "Placements could not be loaded.",
      ) || [];
    },
    async listCompanyPlacements(companyId) {
      return unwrapDatabaseResult(
        await admin
          .from("placements")
          .select(LIFECYCLE_PLACEMENT_SELECTION)
          .eq("project_requirements.projects.company_id", companyId)
          .order("created_at", { ascending: false }),
        "Company placements could not be loaded.",
      ) || [];
    },
    async release(input) {
      return unwrapDatabaseResult(
        await admin.rpc("release_placement", {
          p_actor_user_id: input.actorUserId,
          p_placement_id: input.placementId,
          p_release_type: input.releaseType,
          p_effective_date: input.effectiveDate || null,
          p_reason_code: input.reason,
          p_reason_text: input.reasonText || null,
          p_private_company_notes: input.notes || null,
          p_replacement_requested: !!input.replacementRequested,
        }),
        "Placement could not be released.",
      );
    },
    async requestWorkerEnd(input) {
      return unwrapDatabaseResult(
        await admin.rpc("request_worker_placement_end", {
          p_actor_user_id: input.actorUserId,
          p_placement_id: input.placementId,
          p_effective_date: input.effectiveDate || null,
          p_reason_code: input.reason,
          p_reason_text: input.reasonText || null,
        }),
        "Placement end could not be recorded.",
      );
    },
    async complete(input) {
      return unwrapDatabaseResult(
        await admin.rpc("complete_placement", {
          p_actor_user_id: input.actorUserId,
          p_placement_id: input.placementId,
          p_effective_date: input.effectiveDate || null,
        }),
        "Placement could not be completed.",
      );
    },
    async proposeChange(input) {
      return unwrapDatabaseResult(
        await admin.rpc("propose_placement_change", {
          p_actor_user_id: input.actorUserId,
          p_placement_id: input.placementId,
          p_change_type: input.changeType,
          p_effective_date: input.effectiveDate || null,
          p_proposed_terms: input.proposedTerms,
        }),
        "Placement change could not be proposed.",
      );
    },
    async respondChange(input) {
      return unwrapDatabaseResult(
        await admin.rpc("respond_placement_change", {
          p_actor_user_id: input.actorUserId,
          p_change_offer_id: input.changeOfferId,
          p_accept: !!input.accept,
          p_decline_reason: input.reason || null,
          p_decline_comment: input.comment || null,
        }),
        "Placement change could not be updated.",
      );
    },
  };
}

function requireWorkerPrincipal(principal) {
  if (!principal?.serverAuthenticated) {
    throw new PlacementLifecycleError("Authentication is required.", 401, "UNAUTHENTICATED");
  }
  const workerId = principal.workerId || principal.id;
  if (
    principal.type !== "worker"
    || !UUID_PATTERN.test(workerId || "")
    || !UUID_PATTERN.test(principal.authUserId || "")
  ) {
    throw new PlacementLifecycleError("Worker access is required.", 403, "WORKER_REQUIRED");
  }
  return { workerId, actorUserId: principal.authUserId };
}

function requireCompanyPrincipal(principal, { write = false } = {}) {
  if (!principal?.serverAuthenticated) {
    throw new PlacementLifecycleError("Authentication is required.", 401, "UNAUTHENTICATED");
  }
  const companyId = principal.companyId || principal.id;
  const role = cleanText(principal.permissionRole || principal.companyRole, 40).toLowerCase();
  if (
    principal.type !== "company"
    || !UUID_PATTERN.test(companyId || "")
    || !UUID_PATTERN.test(principal.authUserId || "")
    || !COMPANY_ROLES.has(role)
  ) {
    throw new PlacementLifecycleError("Company access is required.", 403, "COMPANY_REQUIRED");
  }
  if (write && !COMPANY_WRITE_ROLES.has(role)) {
    throw new PlacementLifecycleError(
      "Your company role cannot manage placements.",
      403,
      "PLACEMENT_PERMISSION_DENIED",
    );
  }
  return { companyId, role, actorUserId: principal.authUserId };
}

function forbidAuthorityClaims(input = {}) {
  if (
    input.companyId
    || input.company_id
    || input.workerId
    || input.worker_id
    || input.status
    || input.workerFault
    || input.worker_fault
    || input.noticeClassification
    || input.notice_classification
    || input.noticeDays
    || input.notice_days
  ) {
    throw new PlacementLifecycleError(
      "Placement ownership and lifecycle state are server-managed.",
      400,
      "PLACEMENT_AUTHORITY_FORBIDDEN",
    );
  }
}

function requirePlacementId(placementId) {
  if (!UUID_PATTERN.test(placementId || "")) {
    throw new PlacementLifecycleError("Placement not found.", 404, "PLACEMENT_NOT_FOUND");
  }
  return placementId;
}

function changeOutcomeError(outcome) {
  const errors = {
    accepted: ["This placement change has already been accepted.", "PLACEMENT_CHANGE_ACCEPTED"],
    already_accepted: ["This placement change has already been accepted.", "PLACEMENT_CHANGE_ACCEPTED"],
    declined: ["This placement change has been declined.", "PLACEMENT_CHANGE_DECLINED"],
    already_declined: ["This placement change has been declined.", "PLACEMENT_CHANGE_DECLINED"],
    expired: ["This placement change has expired.", "PLACEMENT_CHANGE_EXPIRED"],
    cancelled: ["This placement change is no longer available.", "PLACEMENT_CHANGE_CANCELLED"],
    placement_ended: ["This placement has ended.", "PLACEMENT_ENDED"],
    schedule_conflict: ["The extension conflicts with another confirmed placement.", "PLACEMENT_SCHEDULE_CONFLICT"],
  };
  const [message, code] = errors[outcome] || ["This placement has already changed.", "PLACEMENT_CHANGED"];
  return new PlacementLifecycleError(message, 409, code);
}

function extensionTerms(input = {}) {
  const estimatedEndDate = dateOnly(input.estimatedEndDate || input.newEndDate);
  if (!estimatedEndDate) {
    throw new PlacementLifecycleError("Choose a valid new end date.", 400, "INVALID_PLACEMENT_CHANGE");
  }
  const dayRate = input.dayRate == null || input.dayRate === "" ? null : Number(input.dayRate);
  if (dayRate != null && (!Number.isFinite(dayRate) || dayRate <= 0)) {
    throw new PlacementLifecycleError("Enter a valid proposed day rate.", 400, "INVALID_PLACEMENT_CHANGE");
  }
  return {
    estimated_end_date: estimatedEndDate,
    ...(dayRate == null ? {} : { day_rate: Math.round(dayRate * 100) / 100 }),
  };
}

function scheduleTerms(input = {}) {
  const shiftStart = timeOnly(input.shiftStartTime || input.proposedShiftStartTime);
  const shiftFinish = timeOnly(input.shiftFinishTime || input.proposedShiftFinishTime);
  if (!shiftStart || !shiftFinish) {
    throw new PlacementLifecycleError("Add valid proposed working hours.", 400, "INVALID_PLACEMENT_CHANGE");
  }
  const dayRate = input.dayRate == null || input.dayRate === "" ? null : Number(input.dayRate);
  if (dayRate != null && (!Number.isFinite(dayRate) || dayRate <= 0)) {
    throw new PlacementLifecycleError("Enter a valid proposed day rate.", 400, "INVALID_PLACEMENT_CHANGE");
  }
  return {
    shift_start_time: shiftStart,
    shift_finish_time: shiftFinish,
    shift_pattern: cleanText(input.shiftPattern || input.proposedShiftPattern, 80),
    ...(dayRate == null ? {} : { day_rate: Math.round(dayRate * 100) / 100 }),
    ...(Array.isArray(input.workingDays)
      ? { working_days: input.workingDays.map((day) => cleanText(day, 20)).filter(Boolean) }
      : {}),
    ...(cleanText(input.workActivity, 1000)
      ? { work_activity: cleanText(input.workActivity, 1000) }
      : {}),
  };
}

function createPlacementLifecycleService({ adapter, env = process.env } = {}) {
  const lifecycleAdapter = adapter || createSupabasePlacementLifecycleAdapter({ env });

  function requireConfigured() {
    if (!lifecycleAdapter.configured) {
      throw new PlacementLifecycleError(
        "Placement lifecycle persistence is not configured.",
        503,
        "PLACEMENT_LIFECYCLE_NOT_CONFIGURED",
      );
    }
  }

  async function normalize() {
    if (typeof lifecycleAdapter.normalize === "function") await lifecycleAdapter.normalize();
  }

  async function ownedPlacement(principal, placementId, { write = false } = {}) {
    requirePlacementId(placementId);
    await normalize();
    const row = await lifecycleAdapter.getPlacement(placementId);
    if (principal?.type === "worker") {
      const worker = requireWorkerPrincipal(principal);
      if (!row || row.worker_id !== worker.workerId) {
        throw new PlacementLifecycleError("Placement not found.", 404, "PLACEMENT_NOT_FOUND");
      }
      return { row, actor: worker, company: false };
    }
    const company = requireCompanyPrincipal(principal, { write });
    if (!row || projectFromRecord(row).company_id !== company.companyId) {
      throw new PlacementLifecycleError("Placement not found.", 404, "PLACEMENT_NOT_FOUND");
    }
    return { row, actor: company, company: true };
  }

  async function proposeChange(principal, placementId, input = {}) {
    requireConfigured();
    const company = requireCompanyPrincipal(principal, { write: true });
    forbidAuthorityClaims(input);
    requirePlacementId(placementId);
    const changeType = cleanText(input.changeType, 80);
    if (!CHANGE_TYPE_SET.has(changeType)) {
      throw new PlacementLifecycleError("Choose a valid placement change type.", 400, "INVALID_PLACEMENT_CHANGE");
    }
    await normalize();
    const changeOfferId = await lifecycleAdapter.proposeChange({
      actorUserId: company.actorUserId,
      placementId,
      changeType,
      effectiveDate: dateOnly(input.effectiveDate),
      proposedTerms:
        changeType === "extension" ? extensionTerms(input) : scheduleTerms(input),
    });
    const row = await lifecycleAdapter.getPlacement(placementId);
    if (!row || projectFromRecord(row).company_id !== company.companyId) {
      throw new PlacementLifecycleError("Placement change could not be verified.", 500, "PLACEMENT_CHANGE_ERROR");
    }
    const placement = placementLifecycleProjection(row, { company: true });
    const changeOffer = placement.changeOffers.find((change) => change.id === changeOfferId);
    if (!changeOffer) {
      throw new PlacementLifecycleError("Placement change could not be verified.", 500, "PLACEMENT_CHANGE_ERROR");
    }
    return { placement, changeOffer };
  }

  async function list(principal) {
    requireConfigured();
    await normalize();
    if (principal?.type === "worker") {
      const { workerId } = requireWorkerPrincipal(principal);
      const rows = await lifecycleAdapter.listWorkerPlacements(workerId);
      return (Array.isArray(rows) ? rows : [])
        .filter((row) => row?.worker_id === workerId)
        .map((row) => placementLifecycleProjection(row));
    }
    const { companyId } = requireCompanyPrincipal(principal);
    const rows = await lifecycleAdapter.listCompanyPlacements(companyId);
    return (Array.isArray(rows) ? rows : [])
      .filter((row) => projectFromRecord(row).company_id === companyId)
      .map((row) => placementLifecycleProjection(row, { company: true }));
  }

  return {
    configured: !!lifecycleAdapter.configured,

    list,

    async get(principal, placementId) {
      requireConfigured();
      const owned = await ownedPlacement(principal, placementId);
      return placementLifecycleProjection(owned.row, { company: owned.company });
    },

    async release(principal, placementId, input = {}) {
      requireConfigured();
      const company = requireCompanyPrincipal(principal, { write: true });
      forbidAuthorityClaims(input);
      requirePlacementId(placementId);
      const releaseType = cleanText(input.releaseType, 80);
      const reason = cleanText(input.reason, 200);
      if (!RELEASE_TYPE_SET.has(releaseType)) {
        throw new PlacementLifecycleError("Choose a valid release type.", 400, "INVALID_RELEASE");
      }
      if (!(RELEASE_REASONS[releaseType] || []).includes(reason)) {
        throw new PlacementLifecycleError("Choose a valid release reason.", 400, "INVALID_RELEASE");
      }
      const result = await lifecycleAdapter.release({
        actorUserId: company.actorUserId,
        placementId,
        releaseType,
        effectiveDate: dateOnly(input.effectiveDate),
        reason,
        reasonText: reason,
        notes: cleanText(input.notes, 2000),
        replacementRequested: !!input.replacementRequested,
      });
      if (!["released", "release_scheduled"].includes(result?.outcome)) {
        throw changeOutcomeError(result?.outcome);
      }
      const row = await lifecycleAdapter.getPlacement(placementId);
      if (!row || projectFromRecord(row).company_id !== company.companyId) {
        throw new PlacementLifecycleError("Release could not be verified.", 500, "PLACEMENT_RELEASE_ERROR");
      }
      return placementLifecycleProjection(row, { company: true });
    },

    async requestWorkerEnd(principal, placementId, input = {}) {
      requireConfigured();
      const worker = requireWorkerPrincipal(principal);
      forbidAuthorityClaims(input);
      requirePlacementId(placementId);
      const reason = cleanText(input.reason, 200);
      if (!WORKER_END_REASON_SET.has(reason)) {
        throw new PlacementLifecycleError("Choose a valid end reason.", 400, "INVALID_WORKER_END");
      }
      const result = await lifecycleAdapter.requestWorkerEnd({
        actorUserId: worker.actorUserId,
        placementId,
        effectiveDate: dateOnly(input.effectiveDate),
        reason,
        reasonText: cleanText(input.notes, 1000) || reason,
      });
      if (!["released", "end_scheduled"].includes(result?.outcome)) {
        throw changeOutcomeError(result?.outcome);
      }
      const row = await lifecycleAdapter.getPlacement(placementId);
      if (!row || row.worker_id !== worker.workerId) {
        throw new PlacementLifecycleError("Placement end could not be verified.", 500, "PLACEMENT_END_ERROR");
      }
      return placementLifecycleProjection(row);
    },

    async complete(principal, placementId, input = {}) {
      requireConfigured();
      const company = requireCompanyPrincipal(principal, { write: true });
      forbidAuthorityClaims(input);
      requirePlacementId(placementId);
      const result = await lifecycleAdapter.complete({
        actorUserId: company.actorUserId,
        placementId,
        effectiveDate: dateOnly(input.effectiveDate),
      });
      if (result?.outcome !== "completed") throw changeOutcomeError(result?.outcome);
      const row = await lifecycleAdapter.getPlacement(placementId);
      if (!row || projectFromRecord(row).company_id !== company.companyId) {
        throw new PlacementLifecycleError("Completion could not be verified.", 500, "PLACEMENT_COMPLETION_ERROR");
      }
      return placementLifecycleProjection(row, { company: true });
    },

    async proposeExtension(principal, placementId, input = {}) {
      return proposeChange(principal, placementId, {
        ...input,
        changeType: "extension",
      });
    },

    proposeChange,

    async listChanges(principal) {
      const placements = await list(principal);
      return placements.flatMap((placement) =>
        placement.changeOffers.map((changeOffer) => ({
          ...changeOffer,
          placement: {
            id: placement.id,
            projectId: placement.projectId,
            projectName: placement.projectName,
            jobNumber: placement.jobNumber,
            companyName: placement.companyName,
            trade: placement.trade,
            role: placement.role,
            location: placement.location,
          },
        })),
      );
    },

    async respondChange(principal, changeOfferId, accept, input = {}) {
      requireConfigured();
      const worker = requireWorkerPrincipal(principal);
      forbidAuthorityClaims(input);
      if (!UUID_PATTERN.test(changeOfferId || "")) {
        throw new PlacementLifecycleError("Placement change not found.", 404, "PLACEMENT_CHANGE_NOT_FOUND");
      }
      const result = await lifecycleAdapter.respondChange({
        actorUserId: worker.actorUserId,
        changeOfferId,
        accept,
        reason: cleanText(input.reason, 200),
        comment: cleanText(input.comment, 1000),
      });
      const expected = accept ? "accepted" : "declined";
      if (result?.outcome !== expected) throw changeOutcomeError(result?.outcome);
      const row = await lifecycleAdapter.getPlacement(result.placement_id);
      if (!row || row.worker_id !== worker.workerId) {
        throw new PlacementLifecycleError("Placement change could not be verified.", 500, "PLACEMENT_CHANGE_ERROR");
      }
      const placement = placementLifecycleProjection(row);
      return {
        placement,
        changeOffer: placement.changeOffers.find((change) => change.id === changeOfferId) || null,
      };
    },
  };
}

module.exports = {
  LIFECYCLE_PLACEMENT_SELECTION,
  PlacementLifecycleError,
  changeOfferProjection,
  createPlacementLifecycleService,
  createSupabasePlacementLifecycleAdapter,
  lifecycleEventProjection,
  placementLifecycleProjection,
};
