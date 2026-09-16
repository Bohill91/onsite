"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  MarketplaceServiceError,
  createMarketplaceService,
  createSupabaseMarketplaceAdapter,
} = require("../server-marketplace.js");

const COMPANY_A = "00000000-0000-4000-8000-000000000001";
const COMPANY_B = "00000000-0000-4000-8000-000000000002";
const PROJECT_A = "00000000-0000-4000-8000-000000000101";
const PROJECT_B = "00000000-0000-4000-8000-000000000102";
const REQUIREMENT_A = "00000000-0000-4000-8000-000000000201";
const REQUIREMENT_B = "00000000-0000-4000-8000-000000000202";
const WORKER_A = "00000000-0000-4000-8000-000000000301";
const WORKER_B = "00000000-0000-4000-8000-000000000302";
const USER_A = "00000000-0000-4000-8000-000000000401";
const USER_B = "00000000-0000-4000-8000-000000000402";

function workerPrincipal(workerId = WORKER_A, overrides = {}) {
  return {
    authUserId: workerId === WORKER_A ? USER_A : USER_B,
    id: workerId,
    workerId,
    type: "worker",
    trade: "Electrical",
    tradeKey: "electrical",
    minRate: 999,
    serverAuthenticated: true,
    ...overrides,
  };
}

function companyPrincipal(companyId = COMPANY_A, role = "Administrator", overrides = {}) {
  return {
    authUserId: companyId === COMPANY_A ? USER_A : USER_B,
    id: companyId,
    companyId,
    type: "company",
    permissionRole: role,
    serverAuthenticated: true,
    ...overrides,
  };
}

function publishedRequirement({
  id = REQUIREMENT_A,
  projectId = PROJECT_A,
  companyId = COMPANY_A,
  status = "open",
  trade = "Electrical",
  tradeKey = "electrical",
  endDate = "2026-12-18",
  fullRate = true,
} = {}) {
  return {
    id,
    project_id: projectId,
    trade,
    trade_key: tradeKey,
    role: "Electrician",
    role_key: "electrician",
    grade: "Skilled",
    required_credential_ids: ["ecs-gold"],
    required_qualifications: "ECS Gold Card",
    work_activity: "Lighting installation",
    workers_required: 4,
    labour_budget_min: 230,
    labour_budget_max: 250,
    worker_receives_full_advertised_rate: fullRate,
    accommodation_paid: true,
    accommodation_arrangement: "nightly_allowance",
    accommodation_allowance_per_night: 45,
    working_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    shift_start_time: "07:30:00",
    shift_finish_time: "16:30:00",
    overtime_available: true,
    overtime_rates: { saturday: "time_and_half" },
    weekend_rates: { saturday: 300 },
    matching_preferences: { requestedWorkerIds: [WORKER_B], preferredFirst: true },
    created_at: "2026-09-16T08:00:00.000Z",
    updated_at: "2026-09-16T08:00:00.000Z",
    projects: {
      id: projectId,
      company_id: companyId,
      job_number: companyId === COMPANY_A ? "HS2-001" : "B-001",
      project_name: companyId === COMPANY_A ? "Northgate Tower" : "Other Site",
      assignment_type: "site_project",
      location_label: "London",
      location_data: { lat: 51.5, lng: -0.1, private: true },
      site_address: "Private exact address",
      site_contact: { name: "Private contact", phone: "07000000000" },
      attendance_manager: { name: "Private manager" },
      start_date: "2026-10-01",
      estimated_end_date: endDate,
      no_fixed_end_date: false,
      duration_label: "12 weeks",
      status,
      internal_metadata: { private: true },
      companies: { name: companyId === COMPANY_A ? "Company A" : "Company B" },
    },
  };
}

function workerProfile(id) {
  return {
    id,
    user_id: id === WORKER_A ? USER_A : USER_B,
    name: id === WORKER_A ? "Alex Carter" : "Jamie Evans",
    contact_email: "private@example.com",
    phone: "07123456789",
    trade: "Electrical",
    trade_key: "electrical",
    specialism: "Electrician",
    role_key: "electrician",
    grade: "Skilled",
    years_experience: 8,
    location: "London",
    profile_photo_reference: "worker-photo.jpg",
    private_minimum_day_rate: 999,
    password: "never-return-this",
  };
}

function fakeMarketplaceAdapter({ leakReads = false } = {}) {
  const requirements = new Map([
    [REQUIREMENT_A, publishedRequirement()],
    [REQUIREMENT_B, publishedRequirement({
      id: REQUIREMENT_B,
      projectId: PROJECT_B,
      companyId: COMPANY_B,
    })],
  ]);
  const applications = new Map();
  let sequence = 500;
  const clone = (value) => structuredClone(value);

  function applicationRow(record) {
    const requirement = requirements.get(record.project_requirement_id);
    return {
      ...record,
      project_requirements: {
        id: requirement.id,
        project_id: requirement.project_id,
        projects: {
          id: requirement.projects.id,
          company_id: requirement.projects.company_id,
          job_number: requirement.projects.job_number,
          project_name: requirement.projects.project_name,
        },
      },
      worker_profiles: workerProfile(record.worker_id),
    };
  }

  return {
    configured: true,
    requirements,
    applications,
    async listPublishedRequirements() {
      return [...requirements.values()].map(clone);
    },
    async getPublishedRequirement(id) {
      return clone(requirements.get(id) || null);
    },
    async findActiveApplication(workerId, requirementId) {
      return clone([...applications.values()].find(
        (row) =>
          row.worker_id === workerId &&
          row.project_requirement_id === requirementId &&
          row.status === "applied",
      ) || null);
    },
    async createApplication(record) {
      const id = `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
      const row = applicationRow({
        ...record,
        id,
        withdrawal_reason: null,
        withdrawn_at: null,
        created_at: "2026-09-16T09:00:00.000Z",
        updated_at: "2026-09-16T09:00:00.000Z",
      });
      applications.set(id, row);
      return clone(row);
    },
    async listWorkerApplications(workerId) {
      const rows = [...applications.values()];
      return rows.filter((row) => leakReads || row.worker_id === workerId).map(clone);
    },
    async getApplication(id) {
      return clone(applications.get(id) || null);
    },
    async withdrawApplication(id, reason) {
      const row = applications.get(id);
      if (!row || row.status !== "applied") return null;
      row.status = "withdrawn";
      row.withdrawal_reason = reason || null;
      row.withdrawn_at = "2026-09-16T10:00:00.000Z";
      row.updated_at = row.withdrawn_at;
      return clone(row);
    },
    async listCompanyApplications() {
      return [...applications.values()].map(clone);
    },
  };
}

async function rejectsCode(promise, code) {
  await assert.rejects(promise, (error) => error instanceof MarketplaceServiceError && error.code === code);
}

test("worker retrieves a published, explicitly allow-listed job projection", async () => {
  const service = createMarketplaceService({
    adapter: fakeMarketplaceAdapter(),
    now: () => new Date("2026-09-16T12:00:00Z"),
  });
  const jobs = await service.listJobs(workerPrincipal());
  assert.equal(jobs.length, 2);
  const job = await service.getJob(workerPrincipal(), REQUIREMENT_A);
  assert.equal(job.requirementId, REQUIREMENT_A);
  assert.equal(job.projectId, PROJECT_A);
  assert.equal(job.companyName, "Company A");
  assert.equal(job.advertisedDayRate, 250);
  assert.equal(job.workerSafeMarketplace, true);
});

test("worker-safe job never exposes company budgets, matching preferences or private site data", async () => {
  const service = createMarketplaceService({ adapter: fakeMarketplaceAdapter() });
  const job = await service.getJob(workerPrincipal(), REQUIREMENT_A);
  const serialized = JSON.stringify(job);
  assert.equal(Object.hasOwn(job, "labour_budget_min"), false);
  assert.equal(Object.hasOwn(job, "labour_budget_max"), false);
  assert.equal(Object.hasOwn(job, "budgetMin"), false);
  assert.equal(Object.hasOwn(job, "budgetMax"), false);
  assert.doesNotMatch(serialized, /matching_preferences|requestedWorkerIds|private exact address/i);
  assert.doesNotMatch(serialized, /site_contact|attendance_manager|internal_metadata/i);
});

test("worker-facing rate is derived without serializing the raw all-in budget", async () => {
  const adapter = fakeMarketplaceAdapter();
  adapter.requirements.set(
    REQUIREMENT_A,
    publishedRequirement({ fullRate: false }),
  );
  const job = await createMarketplaceService({ adapter }).getJob(
    workerPrincipal(),
    REQUIREMENT_A,
  );
  assert.equal(job.advertisedDayRate, Math.floor(250 / 1.15));
  assert.equal(job.weekendRates.saturday, Math.floor(300 / 1.15));
  assert.equal(Object.hasOwn(job, "labourBudgetMax"), false);
});

test("publication eligibility excludes invalid, closed and ended requirements", async () => {
  const adapter = fakeMarketplaceAdapter();
  adapter.requirements.set(
    "00000000-0000-4000-8000-000000000203",
    publishedRequirement({
      id: "00000000-0000-4000-8000-000000000203",
      status: "draft",
    }),
  );
  adapter.requirements.set(
    "00000000-0000-4000-8000-000000000204",
    publishedRequirement({
      id: "00000000-0000-4000-8000-000000000204",
      endDate: "2026-01-01",
    }),
  );
  const service = createMarketplaceService({
    adapter,
    now: () => new Date("2026-09-16T12:00:00Z"),
  });
  assert.deepEqual(
    (await service.listJobs(workerPrincipal())).map((job) => job.requirementId),
    [REQUIREMENT_A, REQUIREMENT_B],
  );
});

test("worker trade is applied server-side to published requirements", async () => {
  const adapter = fakeMarketplaceAdapter();
  adapter.requirements.set(
    REQUIREMENT_B,
    publishedRequirement({
      id: REQUIREMENT_B,
      projectId: PROJECT_B,
      companyId: COMPANY_B,
      trade: "Carpentry",
      tradeKey: "carpentry",
    }),
  );
  const jobs = await createMarketplaceService({ adapter }).listJobs(workerPrincipal());
  assert.deepEqual(jobs.map((job) => job.requirementId), [REQUIREMENT_A]);
});

test("anonymous and company principals cannot browse worker jobs", async () => {
  const service = createMarketplaceService({ adapter: fakeMarketplaceAdapter() });
  await rejectsCode(service.listJobs(null), "UNAUTHENTICATED");
  await rejectsCode(service.listJobs(companyPrincipal()), "WORKER_REQUIRED");
});

test("worker applies to a visible requirement with canonical server identity", async () => {
  const adapter = fakeMarketplaceAdapter();
  const application = await createMarketplaceService({ adapter }).apply(
    workerPrincipal(),
    REQUIREMENT_A,
    { note: "Available from project start." },
  );
  assert.equal(application.workerId, WORKER_A);
  assert.equal(application.requirementId, REQUIREMENT_A);
  assert.equal(application.projectId, PROJECT_A);
  assert.equal(application.status, "applied");
  assert.equal(application.workerNote, "Available from project start.");
});

test("browser-supplied worker or company ownership is rejected", async () => {
  const service = createMarketplaceService({ adapter: fakeMarketplaceAdapter() });
  await rejectsCode(
    service.apply(workerPrincipal(), REQUIREMENT_A, { workerId: WORKER_B }),
    "APPLICATION_OWNERSHIP_FORBIDDEN",
  );
  await rejectsCode(
    service.apply(workerPrincipal(), REQUIREMENT_A, { companyId: COMPANY_B }),
    "APPLICATION_OWNERSHIP_FORBIDDEN",
  );
});

test("duplicate active application is prevented", async () => {
  const service = createMarketplaceService({ adapter: fakeMarketplaceAdapter() });
  await service.apply(workerPrincipal(), REQUIREMENT_A);
  await rejectsCode(
    service.apply(workerPrincipal(), REQUIREMENT_A),
    "APPLICATION_EXISTS",
  );
});

test("worker reads only their own applications even if an adapter over-returns", async () => {
  const adapter = fakeMarketplaceAdapter({ leakReads: true });
  const service = createMarketplaceService({ adapter });
  await service.apply(workerPrincipal(), REQUIREMENT_A);
  await service.apply(workerPrincipal(WORKER_B), REQUIREMENT_A);
  const applications = await service.listWorkerApplications(workerPrincipal());
  assert.equal(applications.length, 1);
  assert.equal(applications[0].workerId, WORKER_A);
});

test("worker can withdraw their own application and the transition is idempotent", async () => {
  const adapter = fakeMarketplaceAdapter();
  const service = createMarketplaceService({ adapter });
  const created = await service.apply(workerPrincipal(), REQUIREMENT_A);
  const withdrawn = await service.withdraw(workerPrincipal(), created.id, {
    status: "withdrawn",
    reason: "No longer available",
  });
  assert.equal(withdrawn.status, "withdrawn");
  assert.equal(withdrawn.withdrawalReason, "No longer available");
  assert.equal((await service.withdraw(workerPrincipal(), created.id)).status, "withdrawn");
});

test("worker cannot mutate another worker application", async () => {
  const adapter = fakeMarketplaceAdapter();
  const service = createMarketplaceService({ adapter });
  const created = await service.apply(workerPrincipal(WORKER_B), REQUIREMENT_A);
  await rejectsCode(
    service.withdraw(workerPrincipal(), created.id),
    "APPLICATION_NOT_FOUND",
  );
});

test("arbitrary application status transitions are rejected", async () => {
  const service = createMarketplaceService({ adapter: fakeMarketplaceAdapter() });
  const created = await service.apply(workerPrincipal(), REQUIREMENT_A);
  await rejectsCode(
    service.withdraw(workerPrincipal(), created.id, { status: "offered" }),
    "INVALID_APPLICATION_TRANSITION",
  );
});

test("application to missing or inaccessible requirement fails closed", async () => {
  const service = createMarketplaceService({ adapter: fakeMarketplaceAdapter() });
  await rejectsCode(
    service.apply(workerPrincipal(), "00000000-0000-4000-8000-000000000999"),
    "JOB_NOT_FOUND",
  );
  await rejectsCode(service.apply(workerPrincipal(), "forged"), "JOB_NOT_FOUND");
});

test("company sees applications only for its own requirements", async () => {
  const adapter = fakeMarketplaceAdapter();
  const service = createMarketplaceService({ adapter });
  await service.apply(workerPrincipal(), REQUIREMENT_A);
  await service.apply(workerPrincipal(WORKER_B), REQUIREMENT_B);
  const companyA = await service.listCompanyApplications(companyPrincipal());
  const companyB = await service.listCompanyApplications(companyPrincipal(COMPANY_B));
  assert.equal(companyA.length, 1);
  assert.equal(companyA[0].projectId, PROJECT_A);
  assert.equal(companyB.length, 1);
  assert.equal(companyB[0].projectId, PROJECT_B);
});

test("Supervisor retains safe read-only company application visibility", async () => {
  const adapter = fakeMarketplaceAdapter();
  const service = createMarketplaceService({ adapter });
  await service.apply(workerPrincipal(), REQUIREMENT_A);
  const applications = await service.listCompanyApplications(
    companyPrincipal(COMPANY_A, "Supervisor"),
  );
  assert.equal(applications.length, 1);
});

test("browser company claims cannot change canonical application visibility", async () => {
  const adapter = fakeMarketplaceAdapter();
  const service = createMarketplaceService({ adapter });
  await service.apply(workerPrincipal(), REQUIREMENT_A);
  await service.apply(workerPrincipal(WORKER_B), REQUIREMENT_B);
  const applications = await service.listCompanyApplications(
    companyPrincipal(COMPANY_A, "Administrator", {
      browserCompanyId: COMPANY_B,
      requestedCompanyId: COMPANY_B,
    }),
  );
  assert.deepEqual(applications.map((item) => item.projectId), [PROJECT_A]);
});

test("company applicant response excludes worker private rate and auth material", async () => {
  const adapter = fakeMarketplaceAdapter();
  const service = createMarketplaceService({ adapter });
  await service.apply(workerPrincipal(), REQUIREMENT_A);
  const [application] = await service.listCompanyApplications(companyPrincipal());
  const serialized = JSON.stringify(application);
  assert.doesNotMatch(serialized, /private_minimum|minRate|contact_email|password|user_id/i);
  assert.equal(application.worker.name, "Alex Carter");
  assert.equal(application.worker.trade, "Electrical");
});

test("worker application response excludes company and authentication secrets", async () => {
  const service = createMarketplaceService({ adapter: fakeMarketplaceAdapter() });
  const application = await service.apply(workerPrincipal(), REQUIREMENT_A);
  const serialized = JSON.stringify(application);
  assert.doesNotMatch(serialized, /company_id|labour_budget|matching_preferences|password|auth/i);
});

test("canonical application survives service reload with a stable ID", async () => {
  const adapter = fakeMarketplaceAdapter();
  const first = createMarketplaceService({ adapter });
  const created = await first.apply(workerPrincipal(), REQUIREMENT_A);
  const second = createMarketplaceService({ adapter });
  const [loaded] = await second.listWorkerApplications(workerPrincipal());
  assert.equal(loaded.id, created.id);
  assert.equal(loaded.requirementId, created.requirementId);
});

test("canonical application persistence is independent of browser local state", async () => {
  const adapter = fakeMarketplaceAdapter();
  const service = createMarketplaceService({ adapter });
  const created = await service.apply(workerPrincipal(), REQUIREMENT_A);
  const clearedBrowserState = { applications: [] };
  assert.equal(clearedBrowserState.applications.length, 0);
  assert.equal((await service.listWorkerApplications(workerPrincipal()))[0].id, created.id);
});

test("marketplace adapter uses only the server secret key and fails closed", () => {
  const calls = [];
  const adapter = createSupabaseMarketplaceAdapter({
    env: {
      SUPABASE_URL: "https://onsite-test.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      SUPABASE_SECRET_KEY: "sb_secret_test",
    },
    clientFactory(url, key, options) {
      calls.push({ url, key, options });
      return {};
    },
  });
  assert.equal(adapter.configured, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].key, "sb_secret_test");
  assert.equal(calls[0].options.auth.persistSession, false);
  assert.equal(JSON.stringify(adapter).includes("sb_secret_test"), false);
  assert.deepEqual(
    createSupabaseMarketplaceAdapter({
      env: { SUPABASE_URL: "https://onsite-test.supabase.co" },
      clientFactory() {
        throw new Error("Incomplete configuration must not create a client.");
      },
    }),
    { configured: false },
  );
});

test("marketplace migration is transactional, RLS-scoped and least privilege", () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "supabase",
      "migrations",
      "202609160004_marketplace_applications.sql",
    ),
    "utf8",
  );
  assert.match(source, /^begin;/);
  assert.match(source, /commit;\s*$/);
  assert.match(source, /create table if not exists public\.worker_applications/);
  assert.match(source, /worker_id uuid not null references public\.worker_profiles\(id\) on delete cascade/);
  assert.match(source, /project_requirement_id uuid not null references public\.project_requirements\(id\) on delete cascade/);
  assert.match(source, /where status = 'applied'/);
  assert.match(source, /alter table public\.worker_applications enable row level security/);
  assert.match(source, /worker\.user_id = auth\.uid\(\)/);
  assert.match(source, /membership\.user_id = auth\.uid\(\)/);
  assert.match(source, /membership\.role in \('administrator', 'manager', 'supervisor'\)/);
  assert.match(source, /revoke all on public\.worker_applications[\s\S]*from public, anon, authenticated, service_role/);
  assert.doesNotMatch(source, /grant (insert|update|delete)[\s\S]*to anon/i);
  assert.doesNotMatch(source, /grant (insert|update|delete)[\s\S]*to authenticated/i);
});

test("frontend and server expose canonical marketplace integration points", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(app, /marketplaceApiRequest\("\/api\/jobs"\)/);
  assert.match(app, /marketplaceApiRequest\("\/api\/applications"\)/);
  assert.match(app, /canonicalMarketplaceApplication/);
  assert.match(
    app,
    /applications: \(state\.applications \|\| \[\]\)\.filter\([\s\S]*!application\.canonicalMarketplaceApplication/,
  );
  assert.match(server, /req\.method === 'GET' && url\.pathname === '\/api\/jobs'/);
  assert.match(server, /req\.method === 'POST' && jobApplicationMatch/);
  assert.match(server, /req\.method === 'PATCH' && applicationMatch/);
  assert.match(server, /url\.pathname === '\/api\/company\/applications'/);
});
