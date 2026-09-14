"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  authTokensFromRequest,
  clearSessionCookies,
  createAuthService,
  sessionCookies,
} = require("../server-auth.js");

function fakeAdapter() {
  let sequence = 0;
  const users = new Map();
  const credentials = new Map();
  const workers = new Map();
  const memberships = new Map();
  const companies = new Map();
  const tokens = new Map();
  const calls = { signOut: 0, reset: 0 };

  function sessionFor(user) {
    const session = {
      access_token: `access-${user.id}-${++sequence}`,
      refresh_token: `refresh-${user.id}-${sequence}`,
      expires_in: 3600,
      user,
    };
    tokens.set(session.access_token, user);
    tokens.set(session.refresh_token, user);
    return session;
  }

  return {
    configured: true,
    calls,
    workers,
    memberships,
    companies,

    async signUp({ email, password, metadata }) {
      if (credentials.has(email)) throw new Error("User already registered");
      const user = {
        id: `auth-${++sequence}`,
        email,
        user_metadata: { ...metadata },
      };
      users.set(user.id, user);
      credentials.set(email, { password, userId: user.id });
      return { user, session: sessionFor(user) };
    },

    async signInWithPassword({ email, password }) {
      const credential = credentials.get(email);
      if (!credential || credential.password !== password) return {};
      const user = users.get(credential.userId);
      return { user, session: sessionFor(user) };
    },

    async getUser(token) {
      const user = tokens.get(token);
      if (!user) throw new Error("Invalid token");
      return user;
    },

    async refreshSession(refreshToken) {
      const user = tokens.get(refreshToken);
      if (!user) throw new Error("Invalid refresh token");
      const session = sessionFor(user);
      return { user, session };
    },

    async signOut() {
      calls.signOut += 1;
    },

    async requestPasswordReset(email) {
      calls.reset += 1;
      calls.resetEmail = email;
    },

    async resetPassword({ accessToken, password }) {
      const user = tokens.get(accessToken);
      if (!user) throw new Error("Invalid recovery session");
      credentials.get(user.email).password = password;
    },

    async deleteAuthUser(userId) {
      users.delete(userId);
      workers.delete(userId);
      memberships.delete(userId);
    },

    async createWorkerIdentity(userId, profile) {
      workers.set(userId, {
        id: `worker-${userId}`,
        user_id: userId,
        name: profile.name,
        contact_email: profile.email,
        phone: profile.phone,
        trade: profile.trade,
        trade_key: profile.tradeKey,
        specialism: profile.specialism,
        role_key: profile.roleKey,
        grade: profile.grade,
        years_experience: profile.yearsExperience,
        location: profile.location,
        location_data: profile.locationData,
        availability_status: profile.availabilityStatus,
        private_minimum_day_rate: profile.minimumDayRate,
        travel_radius_miles: profile.travelRadiusMiles,
        travel_further_with_accommodation: profile.travelFurtherWithAccommodation,
        weekend_preferences: profile.weekendPreferences,
        founding_worker: false,
        referral_code: profile.referralCode,
        status: "pending",
      });
    },

    async createCompanyIdentity(userId, input) {
      const company = {
        id: `company-${++sequence}`,
        name: input.name,
        company_number: input.companyNumber,
        vat_number: input.vatNumber,
        vat_registered: input.vatRegistered,
        phone: input.phone,
        address: input.address,
        payment_contact: input.paymentContact,
        accounts_email: input.accountsEmail,
        status: "pending",
      };
      companies.set(company.id, company);
      memberships.set(userId, [{
        user_id: userId,
        company_id: company.id,
        role: "administrator",
        status: "active",
        created_at: new Date().toISOString(),
        companies: company,
      }]);
    },

    async getWorkerProfileByUserId(userId) {
      return workers.get(userId) || null;
    },

    async getCompanyMembershipsByUserId(userId) {
      return memberships.get(userId) || [];
    },

    async updateWorkerProfile(workerId, changes) {
      const entry = Array.from(workers.entries()).find(([, profile]) => profile.id === workerId);
      if (!entry) throw new Error("Worker not found");
      const [userId, profile] = entry;
      const updated = { ...profile, ...changes };
      workers.set(userId, updated);
      return updated;
    },
  };
}

const workerInput = {
  name: "Sam Taylor",
  email: "sam@example.com",
  phone: "07700900000",
  password: "safe-password-1",
  trade: "Electrical",
  tradeKey: "electrical",
  specialism: "Electrician",
  roleKey: "electrician",
  grade: "Electrician",
  yearsExperience: 8,
  location: "Leeds",
  locationData: { name: "Leeds", region: "Yorkshire" },
  minimumDayRate: 240,
  travelRadiusMiles: 35,
  travelFurtherWithAccommodation: true,
  referralCode: "OSW-ABC123DEF456",
};

async function run() {
  const adapter = fakeAdapter();
  const service = createAuthService({ adapter, env: {} });

  const workerRegistration = await service.registerWorker(workerInput);
  assert.equal(workerRegistration.principal.type, "worker");
  assert.equal(workerRegistration.principal.workerId, workerRegistration.principal.id);
  assert.equal(workerRegistration.principal.authUserId.startsWith("auth-"), true);
  assert.equal(workerRegistration.principal.minRate, 240);
  assert.equal(adapter.workers.get(workerRegistration.principal.authUserId).password, undefined);
  assert.equal(adapter.workers.get(workerRegistration.principal.authUserId).referral_code, workerInput.referralCode);

  const companyRegistration = await service.registerCompany({
    name: "Luke Bohill",
    companyName: "BES",
    email: "luke@example.com",
    phone: "07700900111",
    password: "safe-password-2",
    address: "Leeds",
    companyNumber: "12345678",
    vatNumber: "GB123456789",
    vatRegistered: true,
    companyId: "browser-injected-company",
    role: "Supervisor",
  });
  assert.equal(companyRegistration.principal.type, "company");
  assert.equal(companyRegistration.principal.permissionRole, "Administrator");
  assert.equal(companyRegistration.principal.companyRole, "Administrator");
  assert.equal(companyRegistration.principal.companyId, companyRegistration.principal.id);
  assert.notEqual(companyRegistration.principal.companyId, "browser-injected-company");
  assert.equal(companyRegistration.principal.minRate, undefined);

  const workerLogin = await service.login({
    email: workerInput.email,
    password: workerInput.password,
    type: "company",
    workerId: "browser-worker",
  });
  assert.equal(workerLogin.principal.type, "worker");
  assert.equal(workerLogin.principal.workerId, workerRegistration.principal.workerId);

  const restored = await service.restoreSession({
    accessToken: workerLogin.session.access_token,
  });
  assert.equal(restored.principal.workerId, workerRegistration.principal.workerId);
  assert.equal(restored.principal.type, "worker");

  const refreshed = await service.restoreSession({
    accessToken: "expired-access-token",
    refreshToken: workerLogin.session.refresh_token,
  });
  assert.equal(refreshed.principal.workerId, workerRegistration.principal.workerId);
  assert.ok(refreshed.session.access_token);

  const workerUserId = workerRegistration.principal.authUserId;
  adapter.memberships.set(workerUserId, [{
    user_id: "another-auth-user",
    company_id: "unrelated-company",
    role: "administrator",
    status: "active",
    companies: { id: "unrelated-company", name: "Unrelated" },
  }]);
  const unrelatedMembershipIgnored = await service.resolvePrincipal({
    id: workerUserId,
    email: workerInput.email,
  });
  assert.equal(unrelatedMembershipIgnored.type, "worker");
  assert.notEqual(unrelatedMembershipIgnored.companyId, "unrelated-company");
  adapter.memberships.delete(workerUserId);

  const updated = await service.updateWorkerProfile({
    accessToken: workerLogin.session.access_token,
    changes: { minimumDayRate: 265 },
  });
  assert.equal(updated.principal.minRate, 265);
  assert.equal(companyRegistration.principal.minRate, undefined);

  await service.requestPasswordReset({ email: workerInput.email });
  assert.equal(adapter.calls.reset, 1);
  assert.equal(adapter.calls.resetEmail, workerInput.email);
  await service.resetPassword({
    accessToken: workerLogin.session.access_token,
    refreshToken: workerLogin.session.refresh_token,
    password: "replacement-password",
  });
  const relogin = await service.login({
    email: workerInput.email,
    password: "replacement-password",
  });
  assert.equal(relogin.principal.workerId, workerRegistration.principal.workerId);

  await service.logout({
    accessToken: relogin.session.access_token,
    refreshToken: relogin.session.refresh_token,
  });
  assert.equal(adapter.calls.signOut, 1);

  const request = {
    headers: {
      cookie: "onsite_access_token=cookie-access; onsite_refresh_token=cookie-refresh",
      authorization: "Bearer bearer-access",
      "x-forwarded-proto": "https",
    },
  };
  assert.deepEqual(authTokensFromRequest(request), {
    accessToken: "bearer-access",
    refreshToken: "cookie-refresh",
  });
  const cookies = sessionCookies(request, {
    access_token: "access",
    refresh_token: "refresh",
    expires_in: 120,
  });
  assert.equal(cookies.length, 2);
  assert.match(cookies[0], /HttpOnly/);
  assert.match(cookies[0], /SameSite=Lax/);
  assert.match(cookies[0], /Secure/);
  assert.match(clearSessionCookies(request)[0], /Max-Age=0/);

  const unconfigured = createAuthService({ adapter: { configured: false }, env: {} });
  await assert.rejects(
    () => unconfigured.login({ email: "a@example.com", password: "password" }),
    (error) => error.code === "AUTH_NOT_CONFIGURED" && error.statusCode === 503,
  );

  const authSource = fs.readFileSync(path.join(__dirname, "..", "auth.js"), "utf8");
  const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const migrationSource = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "supabase",
      "migrations",
      "202609140001_identity_foundation.sql",
    ),
    "utf8",
  );
  assert.doesNotMatch(authSource, /getUsers\(\)\.find\([^\n]+u\.password/);
  assert.doesNotMatch(authSource, /localStorage\.setItem\(AUTH_SESSION_KEY/);
  assert.doesNotMatch(appSource, /localStorage\.(getItem|setItem)\(["']onsite_auth_v1/);
  assert.match(authSource, /AUTHORITY_FIELDS/);
  assert.match(authSource, /'permissionRole'/);
  assert.match(authSource, /'companyRole'/);
  assert.match(authSource, /'workerId'/);
  assert.match(authSource, /saveUsers\(getUsers\(\)\)/);
  assert.match(migrationSource, /create table if not exists public\.worker_profiles/);
  assert.match(migrationSource, /create table if not exists public\.companies/);
  assert.match(migrationSource, /create table if not exists public\.company_memberships/);
  assert.match(migrationSource, /worker_profiles_select_own/);
  assert.match(migrationSource, /company_memberships_select_own/);
  assert.match(migrationSource, /private_minimum_day_rate/);
  assert.match(migrationSource, /grant execute[\s\S]+to service_role/);
  assert.doesNotMatch(migrationSource, /attendance manager/i);

  console.log("server auth foundation tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
