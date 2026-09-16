"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  ProjectServiceError,
  createProjectService,
  createSupabaseProjectAdapter,
} = require("../server-projects.js");

const COMPANY_A = "00000000-0000-4000-8000-000000000001";
const COMPANY_B = "00000000-0000-4000-8000-000000000002";
const USER_A = "00000000-0000-4000-8000-000000000011";
const USER_B = "00000000-0000-4000-8000-000000000012";

function principal(companyId = COMPANY_A, role = "Administrator") {
  return {
    authUserId: companyId === COMPANY_A ? USER_A : USER_B,
    id: companyId,
    companyId,
    type: "company",
    permissionRole: role,
    serverAuthenticated: true,
  };
}

function projectInput(overrides = {}) {
  return {
    project: {
      jobNumber: "HS2-001",
      projectName: "Northgate Tower",
      assignmentType: "site_project",
      location: "London",
      locationData: { label: "London", region: "London" },
      siteAddress: "1 Northgate Road, London",
      sitePin: { lat: 51.51, lng: -0.12 },
      arrivalPointConfirmed: true,
      start: "2026-10-01T07:30",
      shiftStartTime: "07:30",
      estimatedEndDate: "2026-12-18",
      noFixedEndDate: false,
      shiftFinishTime: "16:30",
      workingDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      siteContact: { name: "Luke Bohill", phone: "07123456789" },
      attendanceManager: { name: "Luke Bohill", email: "luke@example.com" },
      companyId: COMPANY_B,
      companyName: "Forged Company",
      createdByUserId: USER_B,
      ...overrides.project,
    },
    requirements: overrides.requirements || [
      {
        id: "local-electricians",
        trade: "Electrical",
        specialism: "Electrician",
        grade: "Skilled",
        workActivity: "Lighting installation",
        quantity: 4,
        budgetMin: 230,
        budgetMax: 250,
        requiredCredentialIds: ["ecs-gold"],
        workingDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
        shiftStartTime: "07:30",
        shiftFinishTime: "16:30",
      },
      {
        id: "local-improvers",
        trade: "Electrical",
        specialism: "Electrical Improver",
        grade: "Improver",
        workActivity: "Containment installation",
        quantity: 2,
        budgetMax: 170,
        workingDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
        shiftStartTime: "07:30",
        shiftFinishTime: "16:30",
      },
    ],
  };
}

function fakeProjectAdapter() {
  const projects = new Map();
  let projectSequence = 100;
  let requirementSequence = 500;
  const uuid = (value) =>
    `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
  const clone = (value) => structuredClone(value);

  function projectRow(project, id, existing = {}) {
    return {
      ...existing,
      id,
      company_id: project.companyId,
      created_by_user_id: existing.created_by_user_id || "server-user",
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
      companies: { name: project.companyId === COMPANY_A ? "Company A" : "Company B" },
      created_at: existing.created_at || "2026-09-16T08:00:00.000Z",
      updated_at: "2026-09-16T08:00:00.000Z",
    };
  }

  function requirementRow(requirement, projectId, existingId = "") {
    return {
      id: existingId || uuid(++requirementSequence),
      project_id: projectId,
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
      created_at: "2026-09-16T08:00:00.000Z",
      updated_at: "2026-09-16T08:00:00.000Z",
    };
  }

  return {
    configured: true,
    projects,
    async listCompanyProjects(companyId) {
      return [...projects.values()]
        .filter((row) => row.company_id === companyId)
        .map(clone);
    },
    async getCompanyProject(companyId, projectId) {
      const row = projects.get(projectId);
      return row?.company_id === companyId ? clone(row) : null;
    },
    async saveCompanyProject({ projectId, project, requirements }) {
      const id = projectId || uuid(++projectSequence);
      const existing = projects.get(id);
      if (projectId && (!existing || existing.company_id !== project.companyId)) {
        throw new ProjectServiceError("Project not found.", 404, "PROJECT_NOT_FOUND");
      }
      const row = projectRow(project, id, existing);
      if (requirements == null) {
        row.project_requirements = clone(existing?.project_requirements || []);
      } else {
        const previous = existing?.project_requirements || [];
        row.project_requirements = requirements.map((requirement) => {
          if (requirement.id) {
            const owned = previous.find((item) => item.id === requirement.id);
            const belongsElsewhere = [...projects.values()].some(
              (candidate) =>
                candidate.id !== id &&
                candidate.project_requirements?.some((item) => item.id === requirement.id),
            );
            if (!owned || belongsElsewhere) {
              throw new ProjectServiceError(
                "Project requirement not found.",
                404,
                "PROJECT_NOT_FOUND",
              );
            }
          }
          return requirementRow(requirement, id, requirement.id);
        });
      }
      projects.set(id, clone(row));
      return clone(row);
    },
  };
}

async function rejectsCode(promise, code) {
  await assert.rejects(promise, (error) => error?.code === code);
}

test("project service enforces authentication, company type and server roles", async () => {
  const service = createProjectService({ adapter: fakeProjectAdapter() });
  await rejectsCode(service.create(null, projectInput()), "UNAUTHENTICATED");
  await rejectsCode(
    service.create({ type: "worker", serverAuthenticated: true }, projectInput()),
    "COMPANY_REQUIRED",
  );
  await rejectsCode(
    service.create({ ...principal(), serverAuthenticated: false }, projectInput()),
    "UNAUTHENTICATED",
  );
  await rejectsCode(
    service.create(principal(COMPANY_A, "Supervisor"), projectInput()),
    "PROJECT_PERMISSION_DENIED",
  );
});

test("company creates a canonical UUID project with multiple requirements", async () => {
  const adapter = fakeProjectAdapter();
  const service = createProjectService({ adapter });
  const created = await service.create(principal(), projectInput());
  assert.match(created.id, /^[0-9a-f-]{36}$/i);
  assert.equal(created.canonicalProject, true);
  assert.equal(created.companyId, COMPANY_A);
  assert.equal(created.companyName, "Company A");
  assert.equal(created.labourRequirements.length, 2);
  assert.equal(created.labourRequirements[0].clientReferenceId, "local-electricians");
  assert.notEqual(created.labourRequirements[0].id, "local-electricians");
  assert.equal(adapter.projects.get(created.id).company_id, COMPANY_A);
  assert.equal(adapter.projects.get(created.id).created_by_user_id, "server-user");
});

test("browser ownership fields and role claims cannot forge project ownership", async () => {
  const service = createProjectService({ adapter: fakeProjectAdapter() });
  const created = await service.create(principal(), projectInput({
    project: {
      companyId: COMPANY_B,
      companyName: "Company B",
      permissionRole: "Administrator",
      createdByUserId: USER_B,
    },
  }));
  assert.equal(created.companyId, COMPANY_A);
  const createdForB = await service.create(
    principal(COMPANY_B, "Manager"),
    projectInput({ project: { companyId: COMPANY_A } }),
  );
  assert.equal(createdForB.companyId, COMPANY_B);
});

test("company lists and reads only its own projects without existence leakage", async () => {
  const service = createProjectService({ adapter: fakeProjectAdapter() });
  const projectA = await service.create(principal(), projectInput());
  const projectB = await service.create(
    principal(COMPANY_B, "Manager"),
    projectInput({ project: { jobNumber: "B-001", projectName: "Company B Site" } }),
  );
  assert.deepEqual((await service.list(principal())).map((item) => item.id), [projectA.id]);
  assert.deepEqual(
    (await service.list(principal(COMPANY_B, "Supervisor"))).map((item) => item.id),
    [projectB.id],
  );
  assert.equal((await service.get(principal(), projectA.id)).id, projectA.id);
  await rejectsCode(service.get(principal(), projectB.id), "PROJECT_NOT_FOUND");
  await rejectsCode(
    service.update(principal(), projectB.id, { project: { projectName: "Forged" } }),
    "PROJECT_NOT_FOUND",
  );
});

test("owned project updates preserve requirements when they are omitted", async () => {
  const service = createProjectService({ adapter: fakeProjectAdapter() });
  const created = await service.create(principal(), projectInput());
  const updated = await service.update(principal(COMPANY_A, "Manager"), created.id, {
    project: { projectName: "Northgate Tower Updated" },
  });
  assert.equal(updated.projectName, "Northgate Tower Updated");
  assert.equal(updated.labourRequirements.length, 2);
  assert.equal(updated.id, created.id);
});

test("requirement replacement cannot mutate another company's requirement", async () => {
  const adapter = fakeProjectAdapter();
  const service = createProjectService({ adapter });
  const projectA = await service.create(principal(), projectInput());
  const projectB = await service.create(
    principal(COMPANY_B),
    projectInput({ project: { jobNumber: "B-002", projectName: "Other Site" } }),
  );
  const foreignRequirement = projectB.labourRequirements[0];
  await rejectsCode(
    service.update(principal(), projectA.id, {
      requirements: [
        {
          ...projectInput().requirements[0],
          id: foreignRequirement.id,
        },
      ],
    }),
    "PROJECT_NOT_FOUND",
  );
  const untouched = await service.get(principal(COMPANY_B), projectB.id);
  assert.equal(untouched.labourRequirements.length, 2);
  assert.equal(untouched.labourRequirements[0].quantity, 4);
});

test("owned requirement updates stay attached to their canonical project", async () => {
  const service = createProjectService({ adapter: fakeProjectAdapter() });
  const created = await service.create(principal(), projectInput());
  const electrician = created.labourRequirements[0];
  const updated = await service.update(principal(), created.id, {
    requirements: [
      {
        ...electrician,
        quantity: 6,
      },
    ],
  });
  assert.equal(updated.labourRequirements.length, 1);
  assert.equal(updated.labourRequirements[0].id, electrician.id);
  assert.equal(updated.labourRequirements[0].quantity, 6);
  assert.equal(updated.labourRequirements[0].clientReferenceId, "local-electricians");
});

test("canonical project persists across service reload and client-state clearing", async () => {
  const adapter = fakeProjectAdapter();
  const firstService = createProjectService({ adapter });
  const created = await firstService.create(principal(), projectInput());
  const secondService = createProjectService({ adapter });
  const loaded = await secondService.get(principal(), created.id);
  assert.equal(loaded.id, created.id);
  assert.equal(loaded.projectName, "Northgate Tower");
  assert.equal(loaded.companyId, COMPANY_A);
  assert.equal((await secondService.list(principal())).length, 1);
});

test("project and requirement validation fail closed", async (t) => {
  const service = createProjectService({ adapter: fakeProjectAdapter() });
  await t.test("required project fields", async () => {
    await rejectsCode(
      service.create(principal(), projectInput({ project: { projectName: "" } })),
      "INVALID_PROJECT",
    );
  });
  await t.test("worker count", async () => {
    const input = projectInput();
    input.requirements[0].quantity = 0;
    await rejectsCode(service.create(principal(), input), "INVALID_REQUIREMENT");
  });
  await t.test("budget maximum", async () => {
    const input = projectInput();
    input.requirements[0].budgetMax = -1;
    await rejectsCode(service.create(principal(), input), "INVALID_REQUIREMENT");
  });
  await t.test("budget range", async () => {
    const input = projectInput();
    input.requirements[0].budgetMin = 300;
    input.requirements[0].budgetMax = 250;
    await rejectsCode(service.create(principal(), input), "INVALID_REQUIREMENT");
  });
  await t.test("at least one requirement", async () => {
    await rejectsCode(
      service.create(principal(), projectInput({ requirements: [] })),
      "INVALID_REQUIREMENT",
    );
  });
  await t.test("confirmed site entrance", async () => {
    await rejectsCode(
      service.create(
        principal(),
        projectInput({ project: { arrivalPointConfirmed: false } }),
      ),
      "INVALID_PROJECT",
    );
  });
});

test("worker principals cannot read private projects or labour budgets", async () => {
  const service = createProjectService({ adapter: fakeProjectAdapter() });
  const created = await service.create(principal(), projectInput());
  const worker = {
    type: "worker",
    serverAuthenticated: true,
    workerId: "00000000-0000-4000-8000-000000000099",
  };
  await rejectsCode(service.list(worker), "COMPANY_REQUIRED");
  await rejectsCode(service.get(worker, created.id), "COMPANY_REQUIRED");
});

test("Supabase project adapter is secret-key-only and fails closed", () => {
  const calls = [];
  const adapter = createSupabaseProjectAdapter({
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

  const incomplete = createSupabaseProjectAdapter({
    env: {
      SUPABASE_URL: "https://onsite-test.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    },
    clientFactory() {
      throw new Error("Incomplete configuration must not create a client.");
    },
  });
  assert.deepEqual(incomplete, { configured: false });
});

test("migration is transactional, ownership-scoped and least privilege", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "supabase", "migrations", "202609160003_projects_foundation.sql"),
    "utf8",
  );
  assert.match(source, /^begin;/);
  assert.match(source, /commit;\s*$/);
  assert.match(source, /create table if not exists public\.projects/);
  assert.match(source, /create table if not exists public\.project_requirements/);
  assert.match(source, /alter table public\.projects enable row level security/);
  assert.match(source, /alter table public\.project_requirements enable row level security/);
  assert.match(source, /membership\.user_id = auth\.uid\(\)/);
  assert.match(source, /membership\.status = 'active'/);
  assert.match(source, /membership\.role in \('administrator', 'manager'\)/);
  assert.match(source, /revoke all on public\.projects from anon, authenticated, service_role/);
  assert.doesNotMatch(source, /grant (insert|update|delete).* to anon/i);
  assert.match(source, /grant execute on function public\.save_company_project[\s\S]*to service_role/);
  assert.match(source, /labour_budget_min numeric/);
  assert.match(source, /labour_budget_max numeric/);
});

test("frontend and server expose the canonical project integration points", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(app, /projectApiRequest\("\/api\/projects"/);
  assert.match(app, /canonicalProjectWritePayload/);
  assert.match(app, /canonicalProject === true/);
  assert.match(server, /req\.method === 'GET' && url\.pathname === '\/api\/projects'/);
  assert.match(server, /req\.method === 'POST' && url\.pathname === '\/api\/projects'/);
  assert.match(server, /req\.method === 'PATCH' && projectMatch/);
});
