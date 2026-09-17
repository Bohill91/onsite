"use strict";

const crypto = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");
const QRCode = require("qrcode");
const {
  ATTENDANCE_STATUSES,
  CAPTURE_METHODS,
  LATE_REASON_CATEGORIES,
  LATE_REASON_REVIEW_OUTCOMES,
  RESOLVED_ATTENDANCE_STATUSES,
  cleanDate,
  projectTimeParts,
  reliabilityInput,
} = require("./attendance-rules.js");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMPANY_ROLES = new Set(["administrator", "manager", "supervisor"]);
const ATTENDANCE_STATUS_SET = new Set(ATTENDANCE_STATUSES);
const LATE_REASON_SET = new Set(LATE_REASON_CATEGORIES);
const LATE_REVIEW_SET = new Set(LATE_REASON_REVIEW_OUTCOMES);

const ATTENDANCE_SELECTION = [
  "id",
  "placement_id",
  "project_id",
  "work_date",
  "expected",
  "status",
  "effective_arrival_at",
  "captured_at",
  "shift_start_snapshot",
  "shift_finish_snapshot",
  "working_days_snapshot",
  "project_timezone_snapshot",
  "minutes_late",
  "capture_method",
  "captured_by_user_id",
  "finalised_at",
  "finalised_by_user_id",
  "weekly_submission_id",
  "worker_reason_category",
  "worker_reason_explanation",
  "worker_reason_submitted_at",
  "worker_reason_revision",
  "worker_reason_review_outcome",
  "worker_reason_reviewed_by_user_id",
  "worker_reason_reviewed_at",
  "worker_reason_review_revision",
  "outcome_reason",
  "capture_latitude",
  "capture_longitude",
  "capture_accuracy_m",
  "created_at",
  "updated_at",
  "placements!inner(id,worker_id,status,project_requirement_id,worker_profiles(id,name,trade,trade_key,specialism,role_key,grade,profile_photo_reference),project_requirements!inner(id,project_id,projects!inner(id,company_id,project_name,job_number,location_label,timezone)))",
  "attendance_events(id,event_type,actor_type,recorded_at,effective_at,metadata,created_at)",
].join(",");

class AttendanceServiceError extends Error {
  constructor(message, statusCode = 400, code = "ATTENDANCE_ERROR") {
    super(message);
    this.name = "AttendanceServiceError";
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

function placementFromAttendance(row = {}) {
  return firstRecord(row.placements) || firstRecord(row.placement) || {};
}

function requirementFromPlacement(placement = {}) {
  return (
    firstRecord(placement.project_requirements) ||
    firstRecord(placement.requirement) ||
    {}
  );
}

function projectFromAttendance(row = {}) {
  const requirement = requirementFromPlacement(placementFromAttendance(row));
  return firstRecord(requirement.projects) || firstRecord(requirement.project) || {};
}

function workerFromAttendance(row = {}) {
  const placement = placementFromAttendance(row);
  return firstRecord(placement.worker_profiles) || firstRecord(placement.worker) || {};
}

function safeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const copy = structuredClone(value);
  [
    "token",
    "raw_token",
    "token_hash",
    "password",
    "access_token",
    "refresh_token",
    "private_minimum_day_rate",
  ].forEach((key) => delete copy[key]);
  return copy;
}

function eventProjection(row = {}) {
  return {
    id: row.id || "",
    type: cleanText(row.event_type || row.type, 80),
    actorType: cleanText(row.actor_type || row.actorType, 40),
    recordedAt: row.recorded_at || row.recordedAt || "",
    effectiveAt: row.effective_at || row.effectiveAt || "",
    metadata: safeMetadata(row.metadata),
    createdAt: row.created_at || row.createdAt || "",
  };
}

function attendanceDayProjection(row = {}, { company = false } = {}) {
  const placement = placementFromAttendance(row);
  const project = projectFromAttendance(row);
  const worker = workerFromAttendance(row);
  const day = {
    id: row.id || "",
    attendanceId: row.id || "",
    placementId: row.placement_id || row.placementId || placement.id || "",
    projectId: row.project_id || row.projectId || project.id || "",
    workDate: row.work_date || row.workDate || "",
    expected: row.expected !== false,
    status: ATTENDANCE_STATUS_SET.has(row.status) ? row.status : "needs_review",
    effectiveArrivalAt: row.effective_arrival_at || row.effectiveArrivalAt || "",
    capturedAt: row.captured_at || row.capturedAt || "",
    shiftStartTime: String(
      row.shift_start_snapshot || row.shiftStartTime || "",
    ).slice(0, 5),
    shiftFinishTime: String(
      row.shift_finish_snapshot || row.shiftFinishTime || "",
    ).slice(0, 5),
    workingDays: Array.isArray(
      row.working_days_snapshot || row.workingDays,
    )
      ? [...(row.working_days_snapshot || row.workingDays)]
      : [],
    timeZone:
      cleanText(row.project_timezone_snapshot || row.timeZone, 120) ||
      "Europe/London",
    minutesLate:
      row.minutes_late == null && row.minutesLate == null
        ? null
        : Number(row.minutes_late ?? row.minutesLate),
    captureMethod: CAPTURE_METHODS.includes(
      row.capture_method || row.captureMethod,
    )
      ? row.capture_method || row.captureMethod
      : "expected_day",
    finalisedAt: row.finalised_at || row.finalisedAt || "",
    weeklySubmissionId:
      row.weekly_submission_id || row.weeklySubmissionId || "",
    latenessReason: row.worker_reason_category
      ? {
          category: cleanText(row.worker_reason_category, 200),
          explanation: cleanText(row.worker_reason_explanation, 2000),
          submittedAt: row.worker_reason_submitted_at || "",
          revision: Number(row.worker_reason_revision) || 0,
          reviewOutcome: LATE_REVIEW_SET.has(
            row.worker_reason_review_outcome,
          )
            ? row.worker_reason_review_outcome
            : "pending",
          reviewedAt: row.worker_reason_reviewed_at || "",
          reviewRevision: Number(row.worker_reason_review_revision) || 0,
        }
      : null,
    outcomeReason: cleanText(row.outcome_reason, 1000),
    project: {
      id: project.id || row.project_id || "",
      name: cleanText(project.project_name, 200),
      jobNumber: cleanText(project.job_number, 100),
      location: cleanText(project.location_label, 300),
      timeZone: cleanText(project.timezone, 120) || "Europe/London",
    },
    events: (Array.isArray(row.attendance_events) ? row.attendance_events : [])
      .slice()
      .sort((left, right) =>
        String(left.recorded_at || "").localeCompare(
          String(right.recorded_at || ""),
        ),
      )
      .map(eventProjection),
    reliabilityInput: reliabilityInput(row),
    createdAt: row.created_at || row.createdAt || "",
    updatedAt: row.updated_at || row.updatedAt || "",
    canonicalAttendance: true,
  };
  if (row.capture_latitude != null && row.capture_longitude != null) {
    day.locationEvidence = {
      latitude: Number(row.capture_latitude),
      longitude: Number(row.capture_longitude),
      accuracyM:
        row.capture_accuracy_m == null ? null : Number(row.capture_accuracy_m),
    };
  }
  if (company) {
    day.worker = {
      id: worker.id || placement.worker_id || "",
      name: cleanText(worker.name, 200),
      trade: cleanText(worker.trade, 160),
      tradeKey: cleanText(worker.trade_key, 160),
      specialism: cleanText(worker.specialism, 200),
      roleKey: cleanText(worker.role_key, 160),
      grade: cleanText(worker.grade, 160),
      profilePhoto: cleanText(worker.profile_photo_reference, 1000),
    };
  }
  return day;
}

function weekSubmissionProjection(row = {}) {
  return {
    id: row.id || "",
    projectId: row.project_id || row.projectId || "",
    weekStart: row.week_start || row.weekStart || "",
    weekEnd: row.week_end || row.weekEnd || "",
    status: cleanText(row.status, 40) || "draft",
    revision: Number(row.submission_revision ?? row.submissionRevision) || 0,
    submittedAt: row.submitted_at || row.submittedAt || "",
    reopenedAt: row.reopened_at || row.reopenedAt || "",
    reopenReason: cleanText(row.reopen_reason || row.reopenReason, 1000),
    createdAt: row.created_at || row.createdAt || "",
    updatedAt: row.updated_at || row.updatedAt || "",
  };
}

function hashCapability(rawToken) {
  return crypto.createHash("sha256").update(rawToken, "utf8").digest("hex");
}

function createCapability(prefix = "osa") {
  return `${prefix}_${crypto.randomBytes(32).toString("base64url")}`;
}

async function capabilityQrSvg(rawToken) {
  const svg = await QRCode.toString(rawToken, {
    type: "svg",
    errorCorrectionLevel: "Q",
    margin: 3,
    width: 512,
    color: { dark: "#18181b", light: "#ffffff" },
  });
  return svg.replace("<svg ", '<svg class="qr-glyph" ');
}

function unwrapDatabaseResult(result, fallbackMessage) {
  if (result?.error) {
    const databaseCode = result.error.code || "ATTENDANCE_DATABASE_ERROR";
    const statusByCode = {
      P0002: 404,
      "42501": 403,
      "23505": 409,
      "22023": 400,
      "23514": 400,
    };
    const applicationCode = cleanText(
      result.error.details || result.error.hint,
      120,
    );
    throw new AttendanceServiceError(
      result.error.message || fallbackMessage,
      statusByCode[databaseCode] || Number(result.error.status) || 500,
      applicationCode || databaseCode,
    );
  }
  return result && typeof result === "object" && Object.hasOwn(result, "data")
    ? result.data
    : result;
}

function createSupabaseAttendanceAdapter({
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
  const rpc = async (name, values, message) =>
    unwrapDatabaseResult(await admin.rpc(name, values), message);
  return {
    configured: true,
    async normalizePlacements() {
      return rpc(
        "normalize_placement_lifecycle",
        {},
        "Placement lifecycle could not be refreshed.",
      );
    },
    async projectAuthority(actorUserId, projectId) {
      return rpc(
        "attendance_project_authority",
        { p_actor_user_id: actorUserId, p_project_id: projectId },
        "Attendance access could not be verified.",
      );
    },
    async listProjectAttendance(actorUserId, projectId, weekStart) {
      await rpc(
        "materialize_project_attendance_week",
        {
          p_actor_user_id: actorUserId,
          p_project_id: projectId,
          p_week_start: weekStart,
        },
        "Project attendance could not be prepared.",
      );
      let query = admin
        .from("attendance_days")
        .select(ATTENDANCE_SELECTION)
        .eq("project_id", projectId)
        .gte("work_date", weekStart);
      const weekEnd = new Date(`${weekStart}T12:00:00.000Z`);
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
      query = query
        .lte("work_date", weekEnd.toISOString().slice(0, 10))
        .order("work_date", { ascending: true })
        .order("created_at", { ascending: true });
      return (
        unwrapDatabaseResult(
          await query,
          "Project attendance could not be loaded.",
        ) || []
      );
    },
    async listWorkerAttendance(workerId) {
      return (
        unwrapDatabaseResult(
          await admin
            .from("attendance_days")
            .select(ATTENDANCE_SELECTION)
            .eq("placements.worker_id", workerId)
            .order("work_date", { ascending: false }),
          "Attendance could not be loaded.",
        ) || []
      );
    },
    async issueSiteToken(values) {
      return firstRecord(await rpc(
        "issue_attendance_site_qr",
        {
          p_actor_user_id: values.actorUserId,
          p_project_id: values.projectId,
          p_work_date: values.workDate || null,
          p_token_hash: values.tokenHash,
          p_expires_at: values.expiresAt || null,
          p_revoke_existing: !!values.revokeExisting,
        },
        "The site QR could not be issued.",
      ));
    },
    async scanSiteToken(values) {
      return rpc(
        "capture_worker_site_qr",
        {
          p_actor_user_id: values.actorUserId,
          p_token_hash: values.tokenHash,
          p_latitude: values.latitude,
          p_longitude: values.longitude,
          p_accuracy_m: values.accuracyM,
        },
        "Site sign-in could not be recorded.",
      );
    },
    async issueWorkerToken(values) {
      return firstRecord(await rpc(
        "issue_worker_attendance_qr",
        {
          p_actor_user_id: values.actorUserId,
          p_token_hash: values.tokenHash,
          p_expires_at: values.expiresAt || null,
        },
        "The worker QR could not be issued.",
      ));
    },
    async scanWorkerToken(values) {
      return rpc(
        "capture_supervisor_worker_qr",
        {
          p_actor_user_id: values.actorUserId,
          p_project_id: values.projectId,
          p_token_hash: values.tokenHash,
          p_observed_arrival_at: values.observedArrivalAt || null,
          p_latitude: values.latitude,
          p_longitude: values.longitude,
          p_accuracy_m: values.accuracyM,
        },
        "Worker sign-in could not be recorded.",
      );
    },
    async markAttendance(values) {
      return rpc(
        "mark_project_attendance",
        {
          p_actor_user_id: values.actorUserId,
          p_project_id: values.projectId,
          p_placement_id: values.placementId,
          p_work_date: values.workDate,
          p_status: values.status,
          p_effective_arrival_at: values.effectiveArrivalAt || null,
          p_reason: values.reason || null,
          p_correction_reason: values.correctionReason || null,
        },
        "Attendance could not be updated.",
      );
    },
    async submitLateReason(values) {
      return rpc(
        "submit_attendance_lateness_reason",
        {
          p_actor_user_id: values.actorUserId,
          p_attendance_day_id: values.attendanceId,
          p_reason_category: values.category,
          p_explanation: values.explanation || null,
        },
        "The lateness reason could not be saved.",
      );
    },
    async reviewLateReason(values) {
      return rpc(
        "review_attendance_lateness_reason",
        {
          p_actor_user_id: values.actorUserId,
          p_attendance_day_id: values.attendanceId,
          p_review_outcome: values.outcome,
          p_reason: values.reason || null,
        },
        "The lateness review could not be saved.",
      );
    },
    async submitWeek(values) {
      return rpc(
        "submit_project_attendance_week",
        {
          p_actor_user_id: values.actorUserId,
          p_project_id: values.projectId,
          p_week_start: values.weekStart,
        },
        "The attendance week could not be submitted.",
      );
    },
    async reopenWeek(values) {
      return rpc(
        "reopen_project_attendance_week",
        {
          p_actor_user_id: values.actorUserId,
          p_project_id: values.projectId,
          p_week_start: values.weekStart,
          p_reason: values.reason,
        },
        "The attendance week could not be reopened.",
      );
    },
    async assignManager(values) {
      return firstRecord(await rpc(
        "assign_project_attendance_manager",
        {
          p_actor_user_id: values.actorUserId,
          p_project_id: values.projectId,
          p_manager_user_id: values.managerUserId || null,
          p_invite_email: values.inviteEmail || null,
          p_display_name: values.displayName || null,
          p_phone: values.phone || null,
        },
        "The Attendance Manager could not be updated.",
      ));
    },
    async getAttendanceDay(attendanceId) {
      return unwrapDatabaseResult(
        await admin
          .from("attendance_days")
          .select(ATTENDANCE_SELECTION)
          .eq("id", attendanceId)
          .maybeSingle(),
        "Attendance could not be loaded.",
      );
    },
    async getWeekSubmission(projectId, weekStart) {
      return unwrapDatabaseResult(
        await admin
          .from("attendance_week_submissions")
          .select("*")
          .eq("project_id", projectId)
          .eq("week_start", weekStart)
          .maybeSingle(),
        "Attendance submission could not be loaded.",
      );
    },
  };
}

function requireAuthenticated(principal) {
  if (!principal?.serverAuthenticated || !UUID_PATTERN.test(principal.authUserId || "")) {
    throw new AttendanceServiceError(
      "Authentication is required.",
      401,
      "UNAUTHENTICATED",
    );
  }
  return { actorUserId: principal.authUserId };
}

function requireWorkerPrincipal(principal) {
  const authenticated = requireAuthenticated(principal);
  if (principal.type !== "worker" || !UUID_PATTERN.test(principal.workerId || principal.id || "")) {
    throw new AttendanceServiceError(
      "Worker access is required.",
      403,
      "WORKER_REQUIRED",
    );
  }
  return {
    ...authenticated,
    workerId: principal.workerId || principal.id,
  };
}

function requireProjectId(projectId) {
  if (!UUID_PATTERN.test(projectId || "")) {
    throw new AttendanceServiceError(
      "Project attendance was not found.",
      404,
      "ATTENDANCE_NOT_FOUND",
    );
  }
}

function requireAttendanceId(attendanceId) {
  if (!UUID_PATTERN.test(attendanceId || "")) {
    throw new AttendanceServiceError(
      "Attendance was not found.",
      404,
      "ATTENDANCE_NOT_FOUND",
    );
  }
}

function validWeekStart(value) {
  const date = cleanDate(value);
  if (!date) {
    throw new AttendanceServiceError(
      "Choose a valid week.",
      400,
      "INVALID_ATTENDANCE_WEEK",
    );
  }
  const day = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  if (day !== 1) {
    throw new AttendanceServiceError(
      "Attendance weeks must start on Monday.",
      400,
      "INVALID_ATTENDANCE_WEEK",
    );
  }
  return date;
}

function currentMonday(now = new Date(), timeZone = "Europe/London") {
  const localDate = projectTimeParts(now, timeZone)?.date;
  const date = new Date(`${localDate || now.toISOString().slice(0, 10)}T12:00:00.000Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function validateGps(input = {}) {
  if (input.latitude == null && input.longitude == null) {
    return { latitude: null, longitude: null, accuracyM: null };
  }
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  const accuracyM = input.accuracyM == null ? null : Number(input.accuracyM);
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    (accuracyM != null && (!Number.isFinite(accuracyM) || accuracyM < 0 || accuracyM > 100000))
  ) {
    throw new AttendanceServiceError(
      "Location evidence is invalid.",
      400,
      "INVALID_LOCATION_EVIDENCE",
    );
  }
  return { latitude, longitude, accuracyM };
}

function forbidAuthorityClaims(input = {}) {
  const forbidden = [
    "actorUserId",
    "workerId",
    "companyId",
    "capturedByUserId",
    "finalisedByUserId",
    "role",
    "serverAuthenticated",
  ];
  if (forbidden.some((key) => Object.hasOwn(input || {}, key))) {
    throw new AttendanceServiceError(
      "Attendance authority is derived from your server session.",
      400,
      "ATTENDANCE_AUTHORITY_CLAIM",
    );
  }
}

function createAttendanceService({
  adapter,
  env = process.env,
  tokenFactory = createCapability,
  clock = () => new Date(),
} = {}) {
  const attendanceAdapter = adapter || createSupabaseAttendanceAdapter({ env });

  function requireConfigured() {
    if (!attendanceAdapter.configured) {
      throw new AttendanceServiceError(
        "Attendance persistence is not configured.",
        503,
        "ATTENDANCE_NOT_CONFIGURED",
      );
    }
  }

  async function normalizePlacements() {
    if (typeof attendanceAdapter.normalizePlacements === "function") {
      await attendanceAdapter.normalizePlacements();
    }
  }

  async function projectAuthority(principal, projectId, capability = "read") {
    requireConfigured();
    requireProjectId(projectId);
    const { actorUserId } = requireAuthenticated(principal);
    const authority = await attendanceAdapter.projectAuthority(actorUserId, projectId);
    if (!authority || authority.allowed === false) {
      throw new AttendanceServiceError(
        "Project attendance was not found.",
        404,
        "ATTENDANCE_NOT_FOUND",
      );
    }
    const role = cleanText(authority.role, 40).toLowerCase();
    const isManager = !!authority.is_attendance_manager;
    const principalCompanyId = principal.companyId || principal.id || "";
    if (
      principal.type === "company" &&
      !isManager &&
      (!COMPANY_ROLES.has(role) || authority.company_id !== principalCompanyId)
    ) {
      throw new AttendanceServiceError(
        "Project attendance was not found.",
        404,
        "ATTENDANCE_NOT_FOUND",
      );
    }
    const allowed = {
      read: COMPANY_ROLES.has(role) || isManager,
      scan: COMPANY_ROLES.has(role) || isManager,
      manage: ["administrator", "manager"].includes(role) || isManager,
      submit: role === "administrator" || isManager,
      reopen: role === "administrator",
      assign_manager: role === "administrator",
    }[capability];
    if (!allowed) {
      throw new AttendanceServiceError(
        "You do not have permission to perform this attendance action.",
        403,
        "ATTENDANCE_PERMISSION_DENIED",
      );
    }
    await normalizePlacements();
    return { actorUserId, authority, role, isManager };
  }

  async function verifiedDay(attendanceId) {
    const row = await attendanceAdapter.getAttendanceDay(attendanceId);
    if (!row) {
      throw new AttendanceServiceError(
        "Attendance was not found.",
        404,
        "ATTENDANCE_NOT_FOUND",
      );
    }
    return row;
  }

  return {
    configured: !!attendanceAdapter.configured,

    async listWorker(principal) {
      requireConfigured();
      const { workerId } = requireWorkerPrincipal(principal);
      await normalizePlacements();
      const rows = await attendanceAdapter.listWorkerAttendance(workerId);
      return (Array.isArray(rows) ? rows : [])
        .filter((row) => placementFromAttendance(row).worker_id === workerId)
        .map((row) => attendanceDayProjection(row));
    },

    async listProject(principal, projectId, { weekStart } = {}) {
      const access = await projectAuthority(principal, projectId, "read");
      const week = validWeekStart(
        weekStart || currentMonday(clock(), access.authority.timezone),
      );
      const rows = await attendanceAdapter.listProjectAttendance(
        access.actorUserId,
        projectId,
        week,
      );
      const attendance = (Array.isArray(rows) ? rows : [])
        .filter((row) => projectFromAttendance(row).id === projectId)
        .map((row) => attendanceDayProjection(row, { company: true }));
      const submission = await attendanceAdapter.getWeekSubmission(
        projectId,
        week,
      );
      return {
        projectId,
        weekStart: week,
        attendance,
        submission: submission ? weekSubmissionProjection(submission) : null,
      };
    },

    async issueSiteQr(principal, projectId, input = {}) {
      forbidAuthorityClaims(input);
      const access = await projectAuthority(principal, projectId, "manage");
      const rawToken = tokenFactory("osa");
      const row = await attendanceAdapter.issueSiteToken({
        actorUserId: access.actorUserId,
        projectId,
        workDate: cleanDate(input.workDate),
        tokenHash: hashCapability(rawToken),
        expiresAt: cleanText(input.expiresAt, 80),
        revokeExisting: !!input.revokeExisting,
      });
      return {
        id: row.id,
        projectId: row.project_id || projectId,
        workDate: row.work_date,
        expiresAt: row.expires_at,
        token: rawToken,
        scanValue: rawToken,
        svg: await capabilityQrSvg(rawToken),
      };
    },

    async scanSiteQr(principal, input = {}) {
      requireConfigured();
      forbidAuthorityClaims(input);
      const worker = requireWorkerPrincipal(principal);
      await normalizePlacements();
      const token = cleanText(input.token, 500);
      if (!token.startsWith("osa_") || token.length < 40) {
        throw new AttendanceServiceError(
          "This site QR is invalid or has expired.",
          400,
          "INVALID_SITE_QR",
        );
      }
      const gps = validateGps(input);
      const result = await attendanceAdapter.scanSiteToken({
        actorUserId: worker.actorUserId,
        tokenHash: hashCapability(token),
        ...gps,
      });
      const row = await verifiedDay(result.attendance_day_id || result.id);
      if (placementFromAttendance(row).worker_id !== worker.workerId) {
        throw new AttendanceServiceError(
          "Site sign-in could not be verified.",
          500,
          "ATTENDANCE_OWNERSHIP_ERROR",
        );
      }
      return {
        outcome: result.outcome || "signed_in",
        attendance: attendanceDayProjection(row),
      };
    },

    async issueWorkerQr(principal, input = {}) {
      requireConfigured();
      forbidAuthorityClaims(input);
      const worker = requireWorkerPrincipal(principal);
      const rawToken = tokenFactory("osw");
      const row = await attendanceAdapter.issueWorkerToken({
        actorUserId: worker.actorUserId,
        tokenHash: hashCapability(rawToken),
        expiresAt: cleanText(input.expiresAt, 80),
      });
      return {
        id: row.id,
        expiresAt: row.expires_at,
        token: rawToken,
        scanValue: rawToken,
        svg: await capabilityQrSvg(rawToken),
      };
    },

    async scanWorkerQr(principal, input = {}) {
      forbidAuthorityClaims(input);
      const projectId = cleanText(input.projectId, 80);
      const access = await projectAuthority(principal, projectId, "scan");
      const token = cleanText(input.token, 500);
      if (!token.startsWith("osw_") || token.length < 40) {
        throw new AttendanceServiceError(
          "This worker QR is invalid or has expired.",
          400,
          "INVALID_WORKER_QR",
        );
      }
      const observedArrivalAt = cleanText(input.observedArrivalAt, 80);
      if (observedArrivalAt) {
        const observed = new Date(observedArrivalAt);
        if (
          Number.isNaN(observed.getTime()) ||
          observed.getTime() > clock().getTime() + 1000
        ) {
          throw new AttendanceServiceError(
            "Observed arrival time cannot be in the future.",
            400,
            "INVALID_OBSERVED_ARRIVAL",
          );
        }
      }
      const gps = validateGps(input);
      const result = await attendanceAdapter.scanWorkerToken({
        actorUserId: access.actorUserId,
        projectId,
        tokenHash: hashCapability(token),
        observedArrivalAt,
        ...gps,
      });
      const row = await verifiedDay(result.attendance_day_id || result.id);
      if (projectFromAttendance(row).id !== projectId) {
        throw new AttendanceServiceError(
          "Worker sign-in could not be verified.",
          500,
          "ATTENDANCE_OWNERSHIP_ERROR",
        );
      }
      return {
        outcome: result.outcome || "signed_in",
        attendance: attendanceDayProjection(row, { company: true }),
      };
    },

    async mark(principal, projectId, input = {}) {
      forbidAuthorityClaims(input);
      const access = await projectAuthority(principal, projectId, "manage");
      const placementId = cleanText(input.placementId, 80);
      const workDate = cleanDate(input.workDate);
      const status = cleanText(input.status, 40);
      if (!UUID_PATTERN.test(placementId) || !workDate || !ATTENDANCE_STATUS_SET.has(status)) {
        throw new AttendanceServiceError(
          "Choose a valid worker, date and attendance status.",
          400,
          "INVALID_ATTENDANCE",
        );
      }
      if (status === "needs_review") {
        throw new AttendanceServiceError(
          "Choose a resolved attendance status.",
          400,
          "ATTENDANCE_UNRESOLVED",
        );
      }
      const correctionReason = cleanText(input.correctionReason, 1000);
      if (correctionReason && access.role !== "administrator") {
        throw new AttendanceServiceError(
          "Only an Administrator can record an attendance correction.",
          403,
          "ATTENDANCE_CORRECTION_ADMIN_REQUIRED",
        );
      }
      const reason = cleanText(input.reason, 1000);
      if (
        ["no_show", "approved_absence", "non_worker_fault", "sent_home"].includes(
          status,
        ) &&
        !reason
      ) {
        throw new AttendanceServiceError(
          "Add a reason for this attendance outcome.",
          400,
          "ATTENDANCE_REASON_REQUIRED",
        );
      }
      const result = await attendanceAdapter.markAttendance({
        actorUserId: access.actorUserId,
        projectId,
        placementId,
        workDate,
        status,
        effectiveArrivalAt: cleanText(input.effectiveArrivalAt, 80),
        reason,
        correctionReason,
      });
      const row = await verifiedDay(result.attendance_day_id || result.id);
      return attendanceDayProjection(row, { company: true });
    },

    async submitLatenessReason(principal, attendanceId, input = {}) {
      requireConfigured();
      forbidAuthorityClaims(input);
      requireAttendanceId(attendanceId);
      const worker = requireWorkerPrincipal(principal);
      const category = cleanText(input.category, 200);
      if (!LATE_REASON_SET.has(category)) {
        throw new AttendanceServiceError(
          "Choose a valid lateness reason.",
          400,
          "INVALID_LATENESS_REASON",
        );
      }
      const result = await attendanceAdapter.submitLateReason({
        actorUserId: worker.actorUserId,
        attendanceId,
        category,
        explanation: cleanText(input.explanation, 2000),
      });
      const row = await verifiedDay(result.attendance_day_id || attendanceId);
      if (placementFromAttendance(row).worker_id !== worker.workerId) {
        throw new AttendanceServiceError(
          "Attendance was not found.",
          404,
          "ATTENDANCE_NOT_FOUND",
        );
      }
      return attendanceDayProjection(row);
    },

    async reviewLatenessReason(principal, projectId, attendanceId, input = {}) {
      forbidAuthorityClaims(input);
      requireAttendanceId(attendanceId);
      const access = await projectAuthority(principal, projectId, "manage");
      const outcome = cleanText(input.outcome, 80);
      if (!new Set(["approved_exception", "rejected"]).has(outcome)) {
        throw new AttendanceServiceError(
          "Choose a valid lateness review outcome.",
          400,
          "INVALID_LATENESS_REVIEW",
        );
      }
      const result = await attendanceAdapter.reviewLateReason({
        actorUserId: access.actorUserId,
        attendanceId,
        outcome,
        reason: cleanText(input.reason, 1000),
      });
      const row = await verifiedDay(result.attendance_day_id || attendanceId);
      if (projectFromAttendance(row).id !== projectId) {
        throw new AttendanceServiceError(
          "Attendance was not found.",
          404,
          "ATTENDANCE_NOT_FOUND",
        );
      }
      return attendanceDayProjection(row, { company: true });
    },

    async submitWeek(principal, projectId, input = {}) {
      forbidAuthorityClaims(input);
      const access = await projectAuthority(principal, projectId, "submit");
      const weekStart = validWeekStart(input.weekStart);
      const result = await attendanceAdapter.submitWeek({
        actorUserId: access.actorUserId,
        projectId,
        weekStart,
      });
      const row = await attendanceAdapter.getWeekSubmission(projectId, weekStart);
      return {
        outcome: result.outcome || "submitted",
        submission: weekSubmissionProjection(row || result),
      };
    },

    async reopenWeek(principal, projectId, input = {}) {
      forbidAuthorityClaims(input);
      const access = await projectAuthority(principal, projectId, "reopen");
      const weekStart = validWeekStart(input.weekStart);
      const reason = cleanText(input.reason, 1000);
      if (!reason) {
        throw new AttendanceServiceError(
          "A reason is required to reopen submitted attendance.",
          400,
          "REOPEN_REASON_REQUIRED",
        );
      }
      const result = await attendanceAdapter.reopenWeek({
        actorUserId: access.actorUserId,
        projectId,
        weekStart,
        reason,
      });
      const row = await attendanceAdapter.getWeekSubmission(projectId, weekStart);
      return {
        outcome: result.outcome || "reopened",
        submission: weekSubmissionProjection(row || result),
      };
    },

    async assignManager(principal, projectId, input = {}) {
      forbidAuthorityClaims(input);
      const access = await projectAuthority(
        principal,
        projectId,
        "assign_manager",
      );
      const managerUserId = cleanText(input.managerUserId, 80);
      const inviteEmail = cleanText(input.inviteEmail, 320).toLowerCase();
      if (managerUserId && !UUID_PATTERN.test(managerUserId)) {
        throw new AttendanceServiceError(
          "Attendance Manager is invalid.",
          400,
          "INVALID_ATTENDANCE_MANAGER",
        );
      }
      if (!managerUserId && !inviteEmail) {
        throw new AttendanceServiceError(
          "Choose an Attendance Manager or provide an invite email.",
          400,
          "INVALID_ATTENDANCE_MANAGER",
        );
      }
      const row = await attendanceAdapter.assignManager({
        actorUserId: access.actorUserId,
        projectId,
        managerUserId,
        inviteEmail,
        displayName: cleanText(input.displayName, 200),
        phone: cleanText(input.phone, 80),
      });
      return {
        id: row.id,
        projectId: row.project_id || projectId,
        userId: row.user_id || "",
        inviteEmail: cleanText(row.invite_email, 320),
        displayName: cleanText(row.display_name, 200),
        phone: cleanText(row.phone, 80),
        status: cleanText(row.status, 40),
        assignedAt: row.assigned_at || "",
        acceptedAt: row.accepted_at || "",
      };
    },
  };
}

module.exports = {
  ATTENDANCE_SELECTION,
  AttendanceServiceError,
  attendanceDayProjection,
  createAttendanceService,
  createCapability,
  createSupabaseAttendanceAdapter,
  hashCapability,
  weekSubmissionProjection,
};
