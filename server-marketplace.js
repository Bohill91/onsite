"use strict";

const { createClient } = require("@supabase/supabase-js");
const taxonomy = require("./taxonomy.js");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMPANY_ROLES = new Set(["administrator", "manager", "supervisor"]);
const PUBLISHED_PROJECT_STATUSES = new Set(["open", "active"]);
const APPLICATION_STATUSES = new Set(["applied", "withdrawn"]);

const PUBLISHED_REQUIREMENT_SELECTION = [
  "id",
  "project_id",
  "trade",
  "trade_key",
  "role",
  "role_key",
  "grade",
  "required_credential_ids",
  "required_qualifications",
  "work_activity",
  "workers_required",
  "labour_budget_max",
  "worker_receives_full_advertised_rate",
  "accommodation_paid",
  "accommodation_arrangement",
  "accommodation_allowance_per_night",
  "working_days",
  "shift_start_time",
  "shift_finish_time",
  "overtime_available",
  "overtime_rates",
  "weekend_rates",
  "created_at",
  "updated_at",
  "placements(id,status)",
  "projects!inner(id,company_id,job_number,project_name,assignment_type,location_label,start_date,estimated_end_date,no_fixed_end_date,duration_label,status,companies(name))",
].join(",");

const APPLICATION_SELECTION = [
  "id",
  "worker_id",
  "project_requirement_id",
  "status",
  "worker_note",
  "withdrawal_reason",
  "withdrawn_at",
  "created_at",
  "updated_at",
  "project_requirements(id,project_id,projects(id,company_id,job_number,project_name))",
  "worker_profiles(id,name,trade,trade_key,specialism,role_key,grade,years_experience,location,profile_photo_reference)",
].join(",");

class MarketplaceServiceError extends Error {
  constructor(message, statusCode = 400, code = "MARKETPLACE_ERROR") {
    super(message);
    this.name = "MarketplaceServiceError";
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

function dateOnly(value) {
  const text = cleanText(value, 40).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function timeOnly(value) {
  const text = cleanText(value, 16).slice(0, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : "";
}

function projectFromRequirement(row = {}) {
  return firstRecord(row.projects) || firstRecord(row.project) || {};
}

function requirementFromApplication(row = {}) {
  return firstRecord(row.project_requirements) || firstRecord(row.requirement) || {};
}

function projectFromApplication(row = {}) {
  return projectFromRequirement(requirementFromApplication(row));
}

function advertisedWorkerRate(row = {}) {
  const advertised = Number(row.labour_budget_max);
  if (!Number.isFinite(advertised) || advertised <= 0) return null;
  if (row.worker_receives_full_advertised_rate !== false) {
    return Math.round(advertised * 100) / 100;
  }
  return Math.floor(advertised / 1.15);
}

function confirmedPlacementCount(row = {}) {
  return (Array.isArray(row.placements) ? row.placements : []).filter((placement) =>
    ["upcoming", "active"].includes(cleanText(placement?.status, 32)),
  ).length;
}

function availableVacancies(row = {}) {
  return Math.max(0, (Number(row.workers_required) || 0) - confirmedPlacementCount(row));
}

function workerFacingWeekendRates(row = {}) {
  const rates = row.weekend_rates;
  if (!rates || typeof rates !== "object" || Array.isArray(rates)) return null;
  const result = {};
  ["saturday", "sunday"].forEach((day) => {
    const value = Number(rates[day]);
    if (!Number.isFinite(value) || value <= 0) return;
    result[day] = row.worker_receives_full_advertised_rate !== false
      ? Math.round(value * 100) / 100
      : Math.floor(value / 1.15);
  });
  return Object.keys(result).length ? result : null;
}

function publicationEligible(row, today = new Date().toISOString().slice(0, 10)) {
  const project = projectFromRequirement(row);
  if (!UUID_PATTERN.test(row?.id || "") || !UUID_PATTERN.test(project?.id || "")) return false;
  if (!PUBLISHED_PROJECT_STATUSES.has(cleanText(project.status, 32))) return false;
  if (!cleanText(row.trade, 160) || !cleanText(row.role, 200)) return false;
  if (!Number.isInteger(Number(row.workers_required)) || Number(row.workers_required) < 1) return false;
  if (availableVacancies(row) < 1) return false;
  const endDate = dateOnly(project.estimated_end_date);
  if (!project.no_fixed_end_date && endDate && endDate < today) return false;
  return advertisedWorkerRate(row) != null;
}

function workerSafeRequirement(row = {}) {
  const project = projectFromRequirement(row);
  const company = firstRecord(project.companies) || {};
  const advertisedDayRate = advertisedWorkerRate(row);
  const startDate = dateOnly(project.start_date);
  return {
    id: row.id,
    requirementId: row.id,
    projectId: project.id,
    companyName: cleanText(company.name || project.company_name, 200),
    projectName: cleanText(project.project_name, 200),
    jobNumber: cleanText(project.job_number, 100),
    assignmentType: cleanText(project.assignment_type, 40),
    location: cleanText(project.location_label, 300),
    trade: cleanText(row.trade, 160),
    tradeKey: cleanText(row.trade_key, 160),
    role: cleanText(row.role, 200),
    specialism: cleanText(row.role, 200),
    roleKey: cleanText(row.role_key, 160),
    grade: cleanText(row.grade, 160),
    requiredCredentialIds: Array.isArray(row.required_credential_ids)
      ? row.required_credential_ids.map((value) => cleanText(value, 200)).filter(Boolean)
      : [],
    requiredQualifications: cleanText(row.required_qualifications, 2000),
    workActivity: cleanText(row.work_activity, 1000),
    quantity: Number(row.workers_required) || 1,
    workersRequired: Number(row.workers_required) || 1,
    vacancies: availableVacancies(row),
    startDate,
    start: startDate ? `${startDate}T${timeOnly(row.shift_start_time) || "00:00"}` : "",
    estimatedEndDate: dateOnly(project.estimated_end_date),
    noFixedEndDate: !!project.no_fixed_end_date,
    duration: cleanText(project.duration_label, 120),
    workingDays: Array.isArray(row.working_days) ? [...row.working_days] : [],
    shiftStartTime: timeOnly(row.shift_start_time),
    shiftFinishTime: timeOnly(row.shift_finish_time),
    advertisedDayRate,
    accommodationPaid: !!row.accommodation_paid,
    accommodationArrangement: cleanText(row.accommodation_arrangement, 80),
    accommodationAllowancePerNight:
      row.accommodation_allowance_per_night == null
        ? null
        : Number(row.accommodation_allowance_per_night),
    overtimeAvailable: !!row.overtime_available,
    overtimeRates:
      row.overtime_rates && typeof row.overtime_rates === "object"
        ? structuredClone(row.overtime_rates)
        : null,
    weekendRates: workerFacingWeekendRates(row),
    status: "open",
    applicationAvailable: availableVacancies(row) > 0,
    workerSafeMarketplace: true,
    publishedAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

function workerApplication(row = {}) {
  const requirement = requirementFromApplication(row);
  const project = projectFromApplication(row);
  return {
    id: row.id,
    applicationId: row.id,
    workerId: row.worker_id,
    requirementId: row.project_requirement_id,
    projectId: requirement.project_id || project.id || "",
    status: APPLICATION_STATUSES.has(row.status) ? row.status : "applied",
    workerNote: cleanText(row.worker_note, 2000),
    withdrawalReason: cleanText(row.withdrawal_reason, 1000),
    withdrawnAt: row.withdrawn_at || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

function companyApplication(row = {}) {
  const application = workerApplication(row);
  const project = projectFromApplication(row);
  const worker = firstRecord(row.worker_profiles) || firstRecord(row.worker) || {};
  return {
    ...application,
    projectName: cleanText(project.project_name, 200),
    jobNumber: cleanText(project.job_number, 100),
    worker: {
      id: worker.id || row.worker_id,
      name: cleanText(worker.name, 200),
      trade: cleanText(worker.trade, 160),
      tradeKey: cleanText(worker.trade_key, 160),
      specialism: cleanText(worker.specialism, 200),
      roleKey: cleanText(worker.role_key, 160),
      grade: cleanText(worker.grade, 160),
      yearsExperience:
        worker.years_experience == null ? null : Number(worker.years_experience),
      location: cleanText(worker.location, 300),
      profilePhoto: cleanText(worker.profile_photo_reference, 1000),
    },
  };
}

function unwrapDatabaseResult(result, fallbackMessage) {
  if (result?.error) {
    const databaseCode = result.error.code || "MARKETPLACE_DATABASE_ERROR";
    const statusByCode = {
      "23505": 409,
      "23503": 404,
      "42501": 403,
      P0002: 404,
    };
    throw new MarketplaceServiceError(
      result.error.message || fallbackMessage,
      statusByCode[databaseCode] || Number(result.error.status || result.error.statusCode) || 500,
      databaseCode === "23505" ? "APPLICATION_EXISTS" : databaseCode,
    );
  }
  return result && typeof result === "object" && Object.hasOwn(result, "data")
    ? result.data
    : result;
}

function createSupabaseMarketplaceAdapter({ env = process.env, clientFactory = createClient } = {}) {
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
    async listPublishedRequirements() {
      return unwrapDatabaseResult(
        await admin
          .from("project_requirements")
          .select(PUBLISHED_REQUIREMENT_SELECTION)
          .in("projects.status", ["open", "active"])
          .order("created_at", { ascending: false }),
        "Published jobs could not be loaded.",
      ) || [];
    },
    async getPublishedRequirement(requirementId) {
      return unwrapDatabaseResult(
        await admin
          .from("project_requirements")
          .select(PUBLISHED_REQUIREMENT_SELECTION)
          .eq("id", requirementId)
          .maybeSingle(),
        "Published job could not be loaded.",
      );
    },
    async findActiveApplication(workerId, requirementId) {
      return unwrapDatabaseResult(
        await admin
          .from("worker_applications")
          .select(APPLICATION_SELECTION)
          .eq("worker_id", workerId)
          .eq("project_requirement_id", requirementId)
          .eq("status", "applied")
          .maybeSingle(),
        "Application could not be checked.",
      );
    },
    async createApplication(record) {
      return unwrapDatabaseResult(
        await admin
          .from("worker_applications")
          .insert(record)
          .select(APPLICATION_SELECTION)
          .single(),
        "Application could not be created.",
      );
    },
    async listWorkerApplications(workerId) {
      return unwrapDatabaseResult(
        await admin
          .from("worker_applications")
          .select(APPLICATION_SELECTION)
          .eq("worker_id", workerId)
          .order("created_at", { ascending: false }),
        "Applications could not be loaded.",
      ) || [];
    },
    async getApplication(applicationId) {
      return unwrapDatabaseResult(
        await admin
          .from("worker_applications")
          .select(APPLICATION_SELECTION)
          .eq("id", applicationId)
          .maybeSingle(),
        "Application could not be loaded.",
      );
    },
    async withdrawApplication(applicationId, reason) {
      return unwrapDatabaseResult(
        await admin
          .from("worker_applications")
          .update({
            status: "withdrawn",
            withdrawal_reason: reason || null,
            withdrawn_at: new Date().toISOString(),
          })
          .eq("id", applicationId)
          .eq("status", "applied")
          .select(APPLICATION_SELECTION)
          .maybeSingle(),
        "Application could not be withdrawn.",
      );
    },
    async listCompanyApplications(companyId) {
      return unwrapDatabaseResult(
        await admin
          .from("worker_applications")
          .select(APPLICATION_SELECTION)
          .eq("project_requirements.projects.company_id", companyId)
          .order("created_at", { ascending: false }),
        "Company applications could not be loaded.",
      ) || [];
    },
  };
}

function requireWorkerPrincipal(principal) {
  if (!principal?.serverAuthenticated) {
    throw new MarketplaceServiceError("Authentication is required.", 401, "UNAUTHENTICATED");
  }
  const workerId = principal.workerId || principal.id;
  if (principal.type !== "worker" || !UUID_PATTERN.test(workerId || "")) {
    throw new MarketplaceServiceError("Worker access is required.", 403, "WORKER_REQUIRED");
  }
  return { workerId, trade: principal.trade || "", tradeKey: principal.tradeKey || "" };
}

function requireCompanyPrincipal(principal) {
  if (!principal?.serverAuthenticated) {
    throw new MarketplaceServiceError("Authentication is required.", 401, "UNAUTHENTICATED");
  }
  const companyId = principal.companyId || principal.id;
  const role = cleanText(principal.permissionRole || principal.companyRole, 40).toLowerCase();
  if (
    principal.type !== "company"
    || !UUID_PATTERN.test(companyId || "")
    || !COMPANY_ROLES.has(role)
  ) {
    throw new MarketplaceServiceError("Company access is required.", 403, "COMPANY_REQUIRED");
  }
  return { companyId, role };
}

function requirementMatchesWorker(row, worker) {
  const workerTradeKey =
    taxonomy.tradeKeyFor(worker.tradeKey || worker.trade) ||
    cleanText(worker.tradeKey || worker.trade, 160).toLowerCase();
  const requirementTradeKey =
    taxonomy.tradeKeyFor(row.trade_key || row.trade) ||
    cleanText(row.trade_key || row.trade, 160).toLowerCase();
  if (workerTradeKey && requirementTradeKey) return workerTradeKey === requirementTradeKey;
  const workerTrade = cleanText(worker.trade, 160).toLowerCase();
  return !workerTrade || cleanText(row.trade, 160).toLowerCase() === workerTrade;
}

function createMarketplaceService({ adapter, env = process.env, now = () => new Date() } = {}) {
  const marketplaceAdapter = adapter || createSupabaseMarketplaceAdapter({ env });

  function requireConfigured() {
    if (!marketplaceAdapter.configured) {
      throw new MarketplaceServiceError(
        "Marketplace persistence is not configured.",
        503,
        "MARKETPLACE_NOT_CONFIGURED",
      );
    }
  }

  async function visibleRequirement(principal, requirementId) {
    const worker = requireWorkerPrincipal(principal);
    if (!UUID_PATTERN.test(requirementId || "")) {
      throw new MarketplaceServiceError("Published job not found.", 404, "JOB_NOT_FOUND");
    }
    const row = await marketplaceAdapter.getPublishedRequirement(requirementId);
    const today = now().toISOString().slice(0, 10);
    if (!row || !publicationEligible(row, today) || !requirementMatchesWorker(row, worker)) {
      throw new MarketplaceServiceError("Published job not found.", 404, "JOB_NOT_FOUND");
    }
    return { row, worker };
  }

  return {
    configured: !!marketplaceAdapter.configured,

    async listJobs(principal) {
      requireConfigured();
      const worker = requireWorkerPrincipal(principal);
      const today = now().toISOString().slice(0, 10);
      const rows = await marketplaceAdapter.listPublishedRequirements();
      return (Array.isArray(rows) ? rows : [])
        .filter((row) => publicationEligible(row, today) && requirementMatchesWorker(row, worker))
        .map(workerSafeRequirement);
    },

    async getJob(principal, requirementId) {
      requireConfigured();
      const { row } = await visibleRequirement(principal, requirementId);
      return workerSafeRequirement(row);
    },

    async apply(principal, requirementId, input = {}) {
      requireConfigured();
      const { worker } = await visibleRequirement(principal, requirementId);
      if (input.workerId || input.worker_id || input.companyId || input.company_id) {
        throw new MarketplaceServiceError(
          "Application ownership is derived from the authenticated worker.",
          400,
          "APPLICATION_OWNERSHIP_FORBIDDEN",
        );
      }
      const existing = await marketplaceAdapter.findActiveApplication(worker.workerId, requirementId);
      if (existing) {
        throw new MarketplaceServiceError(
          "You have already applied to this requirement.",
          409,
          "APPLICATION_EXISTS",
        );
      }
      const row = await marketplaceAdapter.createApplication({
        worker_id: worker.workerId,
        project_requirement_id: requirementId,
        status: "applied",
        worker_note: cleanText(input.workerNote || input.note, 2000) || null,
      });
      return workerApplication(row);
    },

    async listWorkerApplications(principal) {
      requireConfigured();
      const { workerId } = requireWorkerPrincipal(principal);
      const rows = await marketplaceAdapter.listWorkerApplications(workerId);
      return (Array.isArray(rows) ? rows : [])
        .filter((row) => row?.worker_id === workerId)
        .map(workerApplication);
    },

    async withdraw(principal, applicationId, input = {}) {
      requireConfigured();
      const { workerId } = requireWorkerPrincipal(principal);
      if (!UUID_PATTERN.test(applicationId || "")) {
        throw new MarketplaceServiceError("Application not found.", 404, "APPLICATION_NOT_FOUND");
      }
      if (input.workerId || input.worker_id || input.companyId || input.company_id) {
        throw new MarketplaceServiceError(
          "Application ownership is derived from the authenticated worker.",
          400,
          "APPLICATION_OWNERSHIP_FORBIDDEN",
        );
      }
      const requestedStatus = cleanText(input.status, 32) || "withdrawn";
      if (requestedStatus !== "withdrawn") {
        throw new MarketplaceServiceError(
          "Only application withdrawal is supported.",
          400,
          "INVALID_APPLICATION_TRANSITION",
        );
      }
      const existing = await marketplaceAdapter.getApplication(applicationId);
      if (!existing || existing.worker_id !== workerId) {
        throw new MarketplaceServiceError("Application not found.", 404, "APPLICATION_NOT_FOUND");
      }
      if (existing.status === "withdrawn") return workerApplication(existing);
      if (existing.status !== "applied") {
        throw new MarketplaceServiceError(
          "This application cannot be withdrawn.",
          409,
          "INVALID_APPLICATION_TRANSITION",
        );
      }
      const updated = await marketplaceAdapter.withdrawApplication(
        applicationId,
        cleanText(input.reason, 1000),
      );
      if (!updated) {
        throw new MarketplaceServiceError(
          "This application has already changed.",
          409,
          "APPLICATION_CHANGED",
        );
      }
      return workerApplication(updated);
    },

    async listCompanyApplications(principal) {
      requireConfigured();
      const { companyId } = requireCompanyPrincipal(principal);
      const rows = await marketplaceAdapter.listCompanyApplications(companyId);
      return (Array.isArray(rows) ? rows : [])
        .filter((row) => projectFromApplication(row)?.company_id === companyId)
        .map(companyApplication);
    },
  };
}

module.exports = {
  MarketplaceServiceError,
  advertisedWorkerRate,
  availableVacancies,
  companyApplication,
  createMarketplaceService,
  createSupabaseMarketplaceAdapter,
  publicationEligible,
  workerApplication,
  workerSafeRequirement,
};
