"use strict";

const { createClient } = require("@supabase/supabase-js");

const COMPANY_ROLES = new Set(["administrator", "manager", "supervisor"]);
const PROJECT_MUTATION_ROLES = new Set(["administrator", "manager"]);
const ASSIGNMENT_TYPES = new Set([
  "site_project",
  "mobile_reactive",
  "ongoing_placement",
]);
const PROJECT_STATUSES = new Set([
  "draft",
  "open",
  "active",
  "completed",
  "cancelled",
  "archived",
]);
const WORKING_DAYS = new Set([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROTECTED_REQUIREMENT_CONSTRAINTS = new Map([
  [
    "worker_applications_project_requirement_id_fkey",
    "This labour requirement has worker applications and cannot be removed.",
  ],
  [
    "worker_offers_project_requirement_id_fkey",
    "This labour requirement has worker offers and cannot be removed.",
  ],
  [
    "placements_project_requirement_id_fkey",
    "This labour requirement has worker placements and cannot be removed.",
  ],
]);

class ProjectServiceError extends Error {
  constructor(message, statusCode = 400, code = "PROJECT_ERROR") {
    super(message);
    this.name = "ProjectServiceError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function cleanText(value, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cloneObject(value) {
  const source = plainObject(value);
  return Object.keys(source).length ? JSON.parse(JSON.stringify(source)) : null;
}

function cleanDate(value, field, { required = false } = {}) {
  const text = cleanText(value, 32).slice(0, 10);
  if (!text) {
    if (required) throw new ProjectServiceError(`${field} is required.`, 400, "INVALID_PROJECT");
    return "";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new ProjectServiceError(`${field} must be a valid date.`, 400, "INVALID_PROJECT");
  }
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new ProjectServiceError(`${field} must be a valid date.`, 400, "INVALID_PROJECT");
  }
  return text;
}

function cleanTime(value, field, { required = false } = {}) {
  const text = cleanText(value, 16).slice(0, 5);
  if (!text) {
    if (required) throw new ProjectServiceError(`${field} is required.`, 400, "INVALID_PROJECT");
    return "";
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) {
    throw new ProjectServiceError(`${field} must be a valid time.`, 400, "INVALID_PROJECT");
  }
  return text;
}

function positiveNumber(value, field, { required = false, max = 1000000 } = {}) {
  if (value === "" || value == null) {
    if (required) throw new ProjectServiceError(`${field} is required.`, 400, "INVALID_REQUIREMENT");
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > max) {
    throw new ProjectServiceError(`${field} must be a positive number.`, 400, "INVALID_REQUIREMENT");
  }
  return Math.round(number * 100) / 100;
}

function positiveInteger(value, field, { required = false, max = 10000 } = {}) {
  if (value === "" || value == null) {
    if (required) throw new ProjectServiceError(`${field} is required.`, 400, "INVALID_REQUIREMENT");
    return null;
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > max) {
    throw new ProjectServiceError(`${field} must be a whole number of at least 1.`, 400, "INVALID_REQUIREMENT");
  }
  return number;
}

function cleanStringArray(value, maxItems = 100, maxLength = 200) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .slice(0, maxItems)
    .map((item) => cleanText(item, maxLength))
    .filter(Boolean)));
}

function normalizeWorkingDays(value) {
  return cleanStringArray(value, 7, 16).filter((day) => WORKING_DAYS.has(day));
}

function startParts(project) {
  const raw = cleanText(project.startDate || project.start, 40);
  return {
    date: raw.slice(0, 10),
    time: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw) ? raw.slice(11, 16) : "",
  };
}

function normalizeContact(value, { email = false } = {}) {
  const source = plainObject(value);
  const result = {
    name: cleanText(source.name, 160),
    phone: cleanText(source.phone, 60),
  };
  if (email) result.email = cleanText(source.email, 320).toLowerCase();
  return result;
}

function normalizeSitePin(value) {
  const source = plainObject(value);
  if (source.lat == null || source.lng == null) return null;
  const lat = Number(source.lat);
  const lng = Number(source.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new ProjectServiceError("Site entrance coordinates are invalid.", 400, "INVALID_PROJECT");
  }
  return { lat, lng };
}

function normalizePhotoMetadata(value) {
  const source = plainObject(value);
  const result = {};
  ["entrance", "welfare", "gate", "other"].forEach((key) => {
    const photo = plainObject(source[key]);
    if (!Object.keys(photo).length) return;
    result[key] = {
      photoType: key,
      label: cleanText(photo.label, 120),
      fileName: cleanText(photo.fileName, 300),
      uploadedAt: cleanText(photo.uploadedAt, 40),
      reference: cleanText(photo.reference || photo.storageReference, 1000),
    };
  });
  return result;
}

function normalizeProjectInput(input = {}, { existing = null } = {}) {
  const source = { ...(existing || {}), ...plainObject(input) };
  const parts = startParts(source);
  const assignmentType = cleanText(source.assignmentType || source.jobType, 40) || "site_project";
  if (!ASSIGNMENT_TYPES.has(assignmentType)) {
    throw new ProjectServiceError("Choose a valid assignment type.", 400, "INVALID_PROJECT");
  }
  const jobNumber = cleanText(source.jobNumber, 100);
  const projectName = cleanText(source.projectName, 200);
  const location = cleanText(source.location || source.locationLabel, 300);
  if (!jobNumber || !projectName || !location) {
    throw new ProjectServiceError(
      "Job number, project name and location are required.",
      400,
      "INVALID_PROJECT",
    );
  }
  const startDate = cleanDate(parts.date, "Project start date", { required: true });
  const shiftStartTime = cleanTime(
    source.shiftStartTime || parts.time,
    "Shift start time",
    { required: true },
  );
  const shiftFinishTime = cleanTime(source.shiftFinishTime, "Shift finish time", { required: true });
  const noFixedEndDate = !!source.noFixedEndDate;
  const estimatedEndDate = noFixedEndDate
    ? ""
    : cleanDate(source.estimatedEndDate || source.endDate, "Estimated end date", { required: true });
  if (estimatedEndDate && estimatedEndDate < startDate) {
    throw new ProjectServiceError(
      "Estimated end date cannot be before the project start date.",
      400,
      "INVALID_PROJECT",
    );
  }
  const workingDays = normalizeWorkingDays(source.workingDays);
  if (!workingDays.length) {
    throw new ProjectServiceError("Select at least one working day.", 400, "INVALID_PROJECT");
  }
  const siteAddress = cleanText(source.siteAddress, 1000);
  const siteContact = normalizeContact(source.siteContact);
  if (!siteAddress || !siteContact.name || !siteContact.phone) {
    throw new ProjectServiceError(
      "Site address and site contact details are required.",
      400,
      "INVALID_PROJECT",
    );
  }
  const sitePin = normalizeSitePin(source.sitePin);
  if (
    assignmentType !== "mobile_reactive" &&
    (!sitePin || !source.arrivalPointConfirmed)
  ) {
    throw new ProjectServiceError("Confirm the exact site entrance.", 400, "INVALID_PROJECT");
  }
  const status = cleanText(source.status, 32) || "open";
  if (!PROJECT_STATUSES.has(status)) {
    throw new ProjectServiceError("Choose a valid project status.", 400, "INVALID_PROJECT");
  }
  return {
    jobNumber,
    projectName,
    assignmentType,
    clientReference: cleanText(source.clientReference, 200),
    location,
    locationData: cloneObject(source.locationData),
    siteName: cleanText(source.siteName, 300),
    siteReference: cleanText(source.siteRef || source.siteReference, 200),
    siteAddress,
    sitePin,
    arrivalPointConfirmed: !!source.arrivalPointConfirmed,
    startDate,
    shiftStartTime,
    estimatedEndDate,
    noFixedEndDate,
    shiftFinishTime,
    workingDays,
    duration: cleanText(source.duration || source.durationLabel, 120),
    siteContact,
    attendanceManager: normalizeContact(source.attendanceManager, { email: true }),
    arrivalInstructions: cleanText(source.arrivalInstructions, 4000),
    parking: cleanText(source.parking || source.parkingInformation, 2000),
    ppe: cleanText(source.ppe || source.ppeRequirements, 2000),
    gateAccess: cleanText(source.gateAccess || source.additionalNotes, 4000),
    sitePhotoMeta: normalizePhotoMetadata(source.sitePhotoMeta || source.sitePhotoMetadata),
    vehicleArrangement: cleanText(source.vehicleArrangement, 80),
    noticePeriodDays: positiveInteger(source.noticePeriodDays || 5, "Notice period", { max: 365 }),
    requestVersion: positiveInteger(source.requestVersion || 1, "Request version", { max: 1000000 }),
    status,
  };
}

function normalizeLabourSchedule(value, project) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).map((period) => {
    const source = plainObject(period);
    const startDate = cleanDate(source.startDate, "Labour schedule start date", { required: true });
    const endDate = cleanDate(source.endDate, "Labour schedule end date", { required: true });
    if (endDate < startDate) {
      throw new ProjectServiceError("Labour schedule end date must follow its start date.", 400, "INVALID_REQUIREMENT");
    }
    if (startDate < project.startDate || (project.estimatedEndDate && endDate > project.estimatedEndDate)) {
      throw new ProjectServiceError("Labour schedule periods must sit within the project dates.", 400, "INVALID_REQUIREMENT");
    }
    return {
      startDate,
      endDate,
      quantity: positiveInteger(source.quantity, "Labour schedule quantity", { required: true }),
      notes: cleanText(source.notes || source.phase, 500),
    };
  });
}

function normalizeRequirementInput(input, project, index, { allowCanonicalId = false } = {}) {
  const source = plainObject(input);
  const trade = cleanText(source.trade, 160);
  const role = cleanText(source.specialism || source.role, 200);
  const workActivity = cleanText(source.workActivity, 1000);
  if (!trade || !role || !workActivity) {
    throw new ProjectServiceError(
      "Each labour requirement needs a trade, role and work activity.",
      400,
      "INVALID_REQUIREMENT",
    );
  }
  const quantity = positiveInteger(
    source.quantity ?? source.workersRequired,
    "Workers required",
    { required: true },
  );
  const budgetMin = positiveNumber(source.budgetMin, "Minimum labour budget");
  const budgetMax = positiveNumber(source.budgetMax, "Daily labour rate", { required: true });
  if (budgetMin != null && budgetMin > budgetMax) {
    throw new ProjectServiceError(
      "Minimum labour budget cannot exceed the maximum labour budget.",
      400,
      "INVALID_REQUIREMENT",
    );
  }
  const rawId = cleanText(source.requirementId || source.id, 120);
  const canonicalId = allowCanonicalId && UUID_PATTERN.test(rawId) ? rawId : "";
  const clientReferenceId = cleanText(
    source.clientReferenceId || source.legacyRequirementId || rawId,
    160,
  );
  const workingDays = normalizeWorkingDays(source.workingDays || project.workingDays);
  const shiftStartTime = cleanTime(
    source.shiftStartTime || project.shiftStartTime,
    "Requirement shift start time",
    { required: true },
  );
  const shiftFinishTime = cleanTime(
    source.shiftFinishTime || project.shiftFinishTime,
    "Requirement shift finish time",
    { required: true },
  );
  const allowance = positiveNumber(
    source.accommodationAllowancePerNight,
    "Accommodation allowance",
  );
  return {
    id: canonicalId,
    clientReferenceId,
    sortOrder: index,
    trade,
    tradeKey: cleanText(source.tradeKey, 160),
    role,
    roleKey: cleanText(source.roleKey, 160),
    grade: cleanText(source.grade, 160),
    requiredCredentialIds: cleanStringArray(source.requiredCredentialIds, 100, 200),
    requiredQualifications: cleanText(source.requiredQualifications, 2000),
    workActivity,
    quantity,
    budgetMin,
    budgetMax,
    workerReceivesFullAdvertisedRate: source.workerReceivesFullAdvertisedRate !== false,
    accommodationPaid: !!source.accommodationPaid,
    accommodationArrangement: cleanText(source.accommodationArrangement, 80),
    accommodationAllowancePerNight: allowance,
    workingDays,
    shiftStartTime,
    shiftFinishTime,
    overtimeAvailable: !!source.overtimeAvailable,
    overtimeRates: cloneObject(source.overtimeRates),
    weekendRates: cloneObject(
      source.weekendRates || {
        saturday: source.saturdayRate ?? null,
        sunday: source.sundayRate ?? null,
      },
    ),
    labourSchedule: normalizeLabourSchedule(source.labourSchedule, project),
    matchingPreferences: {
      requestedWorkerIds: cleanStringArray(
        source.requestedWorkerIds || source.preferredWorkerIds,
        500,
        160,
      ),
      preferredFirst: !!source.preferredFirst,
    },
  };
}

function normalizeRequirements(value, project, { allowCanonicalIds = false } = {}) {
  if (!Array.isArray(value) || !value.length) {
    throw new ProjectServiceError(
      "Add at least one labour requirement.",
      400,
      "INVALID_REQUIREMENT",
    );
  }
  return value.slice(0, 100).map((requirement, index) =>
    normalizeRequirementInput(requirement, project, index, {
      allowCanonicalId: allowCanonicalIds,
    }));
}

function databaseRequirementPayload(requirement) {
  return {
    id: requirement.id || null,
    client_reference: requirement.clientReferenceId || null,
    sort_order: requirement.sortOrder,
    trade: requirement.trade,
    trade_key: requirement.tradeKey,
    role: requirement.role,
    role_key: requirement.roleKey,
    grade: requirement.grade,
    required_credential_ids: requirement.requiredCredentialIds,
    required_qualifications: requirement.requiredQualifications,
    work_activity: requirement.workActivity,
    workers_required: requirement.quantity,
    labour_budget_min: requirement.budgetMin,
    labour_budget_max: requirement.budgetMax,
    worker_receives_full_advertised_rate: requirement.workerReceivesFullAdvertisedRate,
    accommodation_paid: requirement.accommodationPaid,
    accommodation_arrangement: requirement.accommodationArrangement,
    accommodation_allowance_per_night: requirement.accommodationAllowancePerNight,
    working_days: requirement.workingDays,
    shift_start_time: requirement.shiftStartTime,
    shift_finish_time: requirement.shiftFinishTime,
    overtime_available: requirement.overtimeAvailable,
    overtime_rates: requirement.overtimeRates,
    weekend_rates: requirement.weekendRates,
    labour_schedule: requirement.labourSchedule,
    matching_preferences: requirement.matchingPreferences,
  };
}

function databaseProjectPayload(project) {
  return {
    job_number: project.jobNumber,
    project_name: project.projectName,
    assignment_type: project.assignmentType,
    client_reference: project.clientReference,
    location_label: project.location,
    location_data: project.locationData,
    site_name: project.siteName,
    site_reference: project.siteReference,
    site_address: project.siteAddress,
    site_pin: project.sitePin,
    arrival_point_confirmed: project.arrivalPointConfirmed,
    start_date: project.startDate,
    shift_start_time: project.shiftStartTime,
    estimated_end_date: project.estimatedEndDate || null,
    no_fixed_end_date: project.noFixedEndDate,
    shift_finish_time: project.shiftFinishTime,
    working_days: project.workingDays,
    duration_label: project.duration,
    site_contact: project.siteContact,
    attendance_manager: project.attendanceManager,
    arrival_instructions: project.arrivalInstructions,
    parking_information: project.parking,
    ppe_requirements: project.ppe,
    additional_notes: project.gateAccess,
    site_photo_metadata: project.sitePhotoMeta,
    vehicle_arrangement: project.vehicleArrangement,
    notice_period_days: project.noticePeriodDays,
    request_version: project.requestVersion,
    status: project.status,
  };
}

function databaseRequirementToClient(row = {}) {
  return {
    id: row.id,
    requirementId: row.id,
    clientReferenceId: row.client_reference || "",
    legacyRequirementId: row.client_reference || "",
    trade: row.trade || "",
    tradeKey: row.trade_key || "",
    role: row.role || "",
    specialism: row.role || "",
    roleKey: row.role_key || "",
    grade: row.grade || "",
    requiredCredentialIds: row.required_credential_ids || [],
    requiredQualifications: row.required_qualifications || "",
    workActivity: row.work_activity || "",
    quantity: Number(row.workers_required) || 1,
    budgetMin: row.labour_budget_min == null ? null : Number(row.labour_budget_min),
    budgetMax: row.labour_budget_max == null ? null : Number(row.labour_budget_max),
    workerReceivesFullAdvertisedRate: row.worker_receives_full_advertised_rate !== false,
    accommodationPaid: !!row.accommodation_paid,
    accommodationArrangement: row.accommodation_arrangement || "",
    accommodationAllowancePerNight:
      row.accommodation_allowance_per_night == null
        ? null
        : Number(row.accommodation_allowance_per_night),
    workingDays: row.working_days || [],
    shiftStartTime: String(row.shift_start_time || "").slice(0, 5),
    shiftFinishTime: String(row.shift_finish_time || "").slice(0, 5),
    overtimeAvailable: !!row.overtime_available,
    overtimeRates: row.overtime_rates || null,
    weekendRates: row.weekend_rates || null,
    saturdayRate: row.weekend_rates?.saturday ?? null,
    sundayRate: row.weekend_rates?.sunday ?? null,
    labourSchedule: row.labour_schedule || [],
    requestedWorkerIds: row.matching_preferences?.requestedWorkerIds || [],
    preferredWorkerIds: row.matching_preferences?.requestedWorkerIds || [],
    preferredFirst: !!row.matching_preferences?.preferredFirst,
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

function databaseProjectToClient(row = {}) {
  const requirements = (row.project_requirements || row.requirements || [])
    .slice()
    .sort((left, right) => (Number(left.sort_order) || 0) - (Number(right.sort_order) || 0))
    .map(databaseRequirementToClient);
  const first = requirements[0] || {};
  const shiftStartTime = String(row.shift_start_time || "").slice(0, 5);
  const startDate = row.start_date || "";
  return {
    id: row.id,
    canonicalProject: true,
    companyId: row.company_id,
    companyName: row.companies?.name || row.company_name || "",
    createdByUserId: row.created_by_user_id || "",
    jobNumber: row.job_number || "",
    projectName: row.project_name || "",
    assignmentType: row.assignment_type || "site_project",
    jobType: row.assignment_type || "site_project",
    ongoing: row.assignment_type === "ongoing_placement",
    clientReference: row.client_reference || "",
    location: row.location_label || "",
    locationData: row.location_data || null,
    siteName: row.site_name || "",
    siteRef: row.site_reference || "",
    siteAddress: row.site_address || "",
    sitePin: row.site_pin || null,
    arrivalPointConfirmed: !!row.arrival_point_confirmed,
    start: startDate ? `${startDate}T${shiftStartTime || "00:00"}` : "",
    startDate: startDate ? `${startDate}T${shiftStartTime || "00:00"}` : "",
    shiftStartTime,
    estimatedEndDate: row.estimated_end_date || "",
    noFixedEndDate: !!row.no_fixed_end_date,
    shiftFinishTime: String(row.shift_finish_time || "").slice(0, 5),
    workingDays: row.working_days || [],
    defaultWorkingDays: row.working_days || [],
    duration: row.duration_label || "",
    siteContact: row.site_contact || { name: "", phone: "" },
    attendanceManager: row.attendance_manager || null,
    arrivalInstructions: row.arrival_instructions || "",
    parking: row.parking_information || "",
    ppe: row.ppe_requirements || "",
    gateAccess: row.additional_notes || "",
    sitePhotoMeta: row.site_photo_metadata || {},
    vehicleArrangement: row.vehicle_arrangement || "",
    noticePeriodDays: Number(row.notice_period_days) || 5,
    requestVersion: Number(row.request_version) || 1,
    status: row.status || "open",
    createdAt: row.created_at || "",
    postedAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    labourRequirements: requirements,
    trade: first.trade || "",
    tradeKey: first.tradeKey || "",
    role: first.role || "",
    specialism: first.specialism || "",
    roleKey: first.roleKey || "",
    quantity: first.quantity || 1,
    budgetMin: first.budgetMin ?? null,
    budgetMax: first.budgetMax ?? null,
    workerReceivesFullAdvertisedRate: first.workerReceivesFullAdvertisedRate !== false,
    requiredCredentialIds: first.requiredCredentialIds || [],
    requiredQualifications: first.requiredQualifications || "",
    workActivity: first.workActivity || "",
    accommodationPaid: !!first.accommodationPaid,
    accommodationArrangement: first.accommodationArrangement || "",
    accommodationAllowancePerNight: first.accommodationAllowancePerNight ?? null,
    overtimeAvailable: !!first.overtimeAvailable,
    overtimeRates: first.overtimeRates || null,
    weekendRates: first.weekendRates || null,
    requestedWorkerIds: first.requestedWorkerIds || [],
    preferredWorkerIds: first.preferredWorkerIds || [],
    preferredFirst: !!first.preferredFirst,
  };
}

function unwrapDatabaseResult(result, fallbackMessage) {
  if (result?.error) {
    const databaseCode = result.error.code || "PROJECT_DATABASE_ERROR";
    const databaseContext = [
      result.error.constraint,
      result.error.message,
      result.error.details,
      result.error.hint,
    ]
      .filter(Boolean)
      .join(" ");
    const protectedRequirementConstraint = databaseCode === "23503"
      ? [...PROTECTED_REQUIREMENT_CONSTRAINTS.keys()].find((constraint) =>
          databaseContext.includes(constraint),
        )
      : "";
    const protectedRequirementDelete = !!protectedRequirementConstraint;
    const statusByCode = {
      P0002: 404,
      "42501": 403,
      "23505": 409,
      "22023": 400,
      "23514": 400,
    };
    const status = protectedRequirementDelete
      ? 409
      : statusByCode[databaseCode] ||
        Number(result.error.status || result.error.statusCode) ||
        500;
    const code = protectedRequirementDelete
      ? "PROJECT_REQUIREMENT_HAS_APPLICATIONS"
      : databaseCode === "P0002"
        ? "PROJECT_NOT_FOUND"
        : databaseCode === "42501"
          ? "PROJECT_PERMISSION_DENIED"
          : databaseCode;
    const message = protectedRequirementDelete
      ? PROTECTED_REQUIREMENT_CONSTRAINTS.get(protectedRequirementConstraint)
      : result.error.message || fallbackMessage;
    throw new ProjectServiceError(message, status, code);
  }
  return result && typeof result === "object" && Object.hasOwn(result, "data")
    ? result.data
    : result;
}

function createSupabaseProjectAdapter({ env = process.env, clientFactory = createClient } = {}) {
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
  const selection = "*, companies(name), project_requirements(*)";
  return {
    configured: true,
    async listCompanyProjects(companyId) {
      return unwrapDatabaseResult(
        await admin
          .from("projects")
          .select(selection)
          .eq("company_id", companyId)
          .order("created_at", { ascending: false }),
        "Projects could not be loaded.",
      ) || [];
    },
    async getCompanyProject(companyId, projectId) {
      return unwrapDatabaseResult(
        await admin
          .from("projects")
          .select(selection)
          .eq("company_id", companyId)
          .eq("id", projectId)
          .maybeSingle(),
        "Project could not be loaded.",
      );
    },
    async saveCompanyProject({ actorUserId, projectId = null, project, requirements }) {
      const savedId = unwrapDatabaseResult(
        await admin.rpc("save_company_project", {
          p_actor_user_id: actorUserId,
          p_project_id: projectId,
          p_project: databaseProjectPayload(project),
          p_requirements:
            requirements == null
              ? null
              : requirements.map(databaseRequirementPayload),
        }),
        "Project could not be saved.",
      );
      return this.getCompanyProject(project.companyId, savedId);
    },
  };
}

function requireCompanyPrincipal(principal) {
  if (!principal?.serverAuthenticated) {
    throw new ProjectServiceError("Authentication is required.", 401, "UNAUTHENTICATED");
  }
  if (principal.type !== "company" || !UUID_PATTERN.test(principal.companyId || "")) {
    throw new ProjectServiceError("Company access is required.", 403, "COMPANY_REQUIRED");
  }
  const role = cleanText(principal.permissionRole || principal.companyRole, 40).toLowerCase();
  if (!COMPANY_ROLES.has(role)) {
    throw new ProjectServiceError("An active company membership is required.", 403, "COMPANY_REQUIRED");
  }
  return { companyId: principal.companyId, role };
}

function requireProjectMutation(principal) {
  const company = requireCompanyPrincipal(principal);
  if (!UUID_PATTERN.test(principal.authUserId || "")) {
    throw new ProjectServiceError("Authentication is required.", 401, "UNAUTHENTICATED");
  }
  if (!PROJECT_MUTATION_ROLES.has(company.role)) {
    throw new ProjectServiceError(
      "Your company role cannot manage projects.",
      403,
      "PROJECT_PERMISSION_DENIED",
    );
  }
  return company;
}

function createProjectService({ adapter, env = process.env } = {}) {
  const projectAdapter = adapter || createSupabaseProjectAdapter({ env });

  function requireConfigured() {
    if (!projectAdapter.configured) {
      throw new ProjectServiceError(
        "Project persistence is not configured.",
        503,
        "PROJECTS_NOT_CONFIGURED",
      );
    }
  }

  async function ownedProject(principal, projectId) {
    const { companyId } = requireCompanyPrincipal(principal);
    if (!UUID_PATTERN.test(projectId || "")) {
      throw new ProjectServiceError("Project not found.", 404, "PROJECT_NOT_FOUND");
    }
    const row = await projectAdapter.getCompanyProject(companyId, projectId);
    if (!row || row.company_id !== companyId) {
      throw new ProjectServiceError("Project not found.", 404, "PROJECT_NOT_FOUND");
    }
    return row;
  }

  return {
    configured: !!projectAdapter.configured,

    async list(principal) {
      requireConfigured();
      const { companyId } = requireCompanyPrincipal(principal);
      const rows = await projectAdapter.listCompanyProjects(companyId);
      return (Array.isArray(rows) ? rows : [])
        .filter((row) => row?.company_id === companyId)
        .map(databaseProjectToClient);
    },

    async get(principal, projectId) {
      requireConfigured();
      return databaseProjectToClient(await ownedProject(principal, projectId));
    },

    async create(principal, input = {}) {
      requireConfigured();
      const { companyId } = requireProjectMutation(principal);
      const project = normalizeProjectInput(input.project || input);
      const requirements = normalizeRequirements(
        input.requirements || input.labourRequirements || input.project?.labourRequirements,
        project,
      );
      const row = await projectAdapter.saveCompanyProject({
        actorUserId: principal.authUserId,
        project: { ...project, companyId },
        requirements,
      });
      if (!row || row.company_id !== companyId) {
        throw new ProjectServiceError("Project ownership could not be verified.", 500, "PROJECT_OWNERSHIP_ERROR");
      }
      return databaseProjectToClient(row);
    },

    async update(principal, projectId, input = {}) {
      requireConfigured();
      const { companyId } = requireProjectMutation(principal);
      const currentRow = await ownedProject(principal, projectId);
      const current = databaseProjectToClient(currentRow);
      const project = normalizeProjectInput(input.project || input, { existing: current });
      const suppliedRequirements =
        input.requirements ||
        input.labourRequirements ||
        input.project?.labourRequirements;
      const requirements = suppliedRequirements == null
        ? null
        : normalizeRequirements(suppliedRequirements, project, { allowCanonicalIds: true });
      const row = await projectAdapter.saveCompanyProject({
        actorUserId: principal.authUserId,
        projectId,
        project: { ...project, companyId },
        requirements,
      });
      if (!row || row.company_id !== companyId) {
        throw new ProjectServiceError("Project not found.", 404, "PROJECT_NOT_FOUND");
      }
      return databaseProjectToClient(row);
    },
  };
}

module.exports = {
  ProjectServiceError,
  createProjectService,
  createSupabaseProjectAdapter,
  databaseProjectToClient,
  normalizeProjectInput,
  normalizeRequirements,
};
