"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  EarlyAccessAdapterError,
  EarlyAccessServiceError,
  createEarlyAccessRateLimiter,
  createEarlyAccessService,
  createSupabaseEarlyAccessAdapter,
  earlyAccessClientKey,
  normalizeCompanyInput,
  normalizeWorkerInput,
  referralCode,
} = require("../server-early-access.js");

const rootDir = path.resolve(__dirname, "..");

function workerInput(overrides = {}) {
  return {
    firstName: "Sam",
    lastName: "Taylor",
    email: "SAM@example.com",
    mobile: "07700 900123",
    tradeKey: "electrical",
    roleKey: "electrician",
    homeArea: "LS1",
    referralCode: "",
    privacyAcknowledged: true,
    marketingConsent: false,
    source: {
      utmSource: "LinkedIn",
      utmMedium: "social",
      utmCampaign: "founding-workers",
      utmContent: "launch-post",
      landingPath: "/early-access",
      ignored: "never stored",
    },
    ...overrides,
  };
}

function companyInput(overrides = {}) {
  return {
    companyName: "Apex Construction Ltd",
    firstName: "Luke",
    lastName: "Bohill",
    email: "luke@apex.example",
    mobile: "0113 555 0101",
    labourCategoryKeys: ["electrical", "plumbing_heating"],
    operatingArea: "Yorkshire",
    approximateWorkers: 25,
    note: "Regional M&E projects",
    privacyAcknowledged: true,
    marketingConsent: true,
    source: { landingPath: "/early-access" },
    ...overrides,
  };
}

function fakeAdapter() {
  const workers = new Map();
  const companies = new Map();
  const referrals = [];
  const rewards = [];
  const deliveryStatuses = new Map();
  let sequence = 0;

  function id() {
    sequence += 1;
    return `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
  }

  function findByEmailOrMobile(records, input) {
    const values = [...records.values()];
    return {
      email: values.find((row) => row.email_normalized === input.email),
      mobile: values.find((row) => row.mobile_normalized === input.mobile),
    };
  }

  function workerResult(row, created) {
    return {
      accepted: true,
      created,
      signup_id: row.id,
      first_name: row.first_name,
      email_normalized: row.email_normalized,
      founding_worker: true,
      referral_code: row.referral_code,
      referred_count: referrals.filter((entry) => entry.referrer_signup_id === row.id).length,
    };
  }

  return {
    configured: true,
    workers,
    companies,
    referrals,
    rewards,
    deliveryStatuses,
    async joinWorker(input) {
      const existing = findByEmailOrMobile(workers, input);
      if (existing.email || existing.mobile) {
        if (!existing.email || !existing.mobile || existing.email.id !== existing.mobile.id) {
          return { accepted: true, redacted: true, created: false };
        }
        const row = existing.email;
        if (input.suppliedReferralCode === row.referral_code) {
          throw new EarlyAccessAdapterError("Self referral", "23514", "SELF_REFERRAL");
        }
        if ((input.suppliedReferralCode || "") !== (row.referred_by_code || "")) {
          return { accepted: true, redacted: true, created: false };
        }
        return workerResult(row, false);
      }
      if ([...workers.values()].some((row) => row.referral_code === input.issuedReferralCode)) {
        throw new EarlyAccessAdapterError(
          "Referral code collision",
          "REFERRAL_CODE_COLLISION",
          "referral_code",
        );
      }
      const referrer = input.suppliedReferralCode
        ? [...workers.values()].find((row) => row.referral_code === input.suppliedReferralCode)
        : null;
      if (input.suppliedReferralCode && !referrer) {
        throw new EarlyAccessAdapterError("Invalid referral", "22023", "INVALID_REFERRAL_CODE");
      }
      const row = {
        id: id(),
        first_name: input.firstName,
        last_name: input.lastName,
        email_normalized: input.email,
        mobile_normalized: input.mobile,
        referral_code: input.issuedReferralCode,
        referred_by_code: input.suppliedReferralCode || null,
        source: structuredClone(input.source),
        founding_worker: true,
      };
      workers.set(row.id, row);
      if (referrer) {
        const referral = {
          id: id(),
          referrer_signup_id: referrer.id,
          referred_signup_id: row.id,
          referral_code_snapshot: referrer.referral_code,
          status: "joined",
        };
        referrals.push(referral);
        rewards.push(
          { referral_id: referral.id, key: "referrer_five_paid_days", amount_pence: 5000, status: "potential" },
          { referral_id: referral.id, key: "referrer_twenty_paid_days", amount_pence: 5000, status: "potential" },
          { referral_id: referral.id, key: "referred_five_paid_days", amount_pence: 2500, status: "potential" },
        );
      }
      return workerResult(row, true);
    },
    async joinCompany(input) {
      const existing = findByEmailOrMobile(companies, input);
      if (existing.email || existing.mobile) {
        if (!existing.email || !existing.mobile || existing.email.id !== existing.mobile.id) {
          return { accepted: true, redacted: true, created: false };
        }
        return {
          accepted: true,
          created: false,
          signup_id: existing.email.id,
          first_name: existing.email.first_name,
          company_name: existing.email.company_name,
          email_normalized: existing.email.email_normalized,
        };
      }
      const row = {
        id: id(),
        first_name: input.firstName,
        company_name: input.companyName,
        email_normalized: input.email,
        mobile_normalized: input.mobile,
        labour_category_keys: [...input.labourCategoryKeys],
      };
      companies.set(row.id, row);
      return {
        accepted: true,
        created: true,
        signup_id: row.id,
        first_name: row.first_name,
        company_name: row.company_name,
        email_normalized: row.email_normalized,
      };
    },
    async setEmailDeliveryStatus(signupId, status) {
      deliveryStatuses.set(signupId, status);
    },
  };
}

function service(adapter, options = {}) {
  let codeSequence = options.codes || [
    "OSW-AAAAAAAAAAAAAAAA",
    "OSW-BBBBBBBBBBBBBBBB",
    "OSW-CCCCCCCCCCCCCCCC",
  ];
  return createEarlyAccessService({
    adapter,
    emailProvider: options.emailProvider || { configured: false },
    env: { EARLY_ACCESS_BASE_URL: "https://joinonsite.uk" },
    codeGenerator: () => codeSequence.shift() || "OSW-ZZZZZZZZZZZZZZZZ",
  });
}

test("worker input is canonicalised with allow-listed source attribution", () => {
  const value = normalizeWorkerInput(workerInput());
  assert.equal(value.email, "sam@example.com");
  assert.equal(value.mobile, "+447700900123");
  assert.equal(value.tradeKey, "electrical");
  assert.equal(value.roleKey, "electrician");
  assert.deepEqual(Object.keys(value.source), [
    "utmSource",
    "utmMedium",
    "utmCampaign",
    "utmContent",
    "landingPath",
  ]);
  assert.equal(value.source.utmSource, "linkedin");
  assert.equal(Object.hasOwn(value.source, "ignored"), false);
});

test("server-issued referral codes use the canonical unpredictable format", () => {
  const first = referralCode();
  const second = referralCode();
  assert.match(first, /^OSW-[A-Z0-9]{16}$/);
  assert.match(second, /^OSW-[A-Z0-9]{16}$/);
  assert.notEqual(first, second);
});

test("Supabase Early Access adapter uses only the server-side secret key", () => {
  const calls = [];
  const adapter = createSupabaseEarlyAccessAdapter({
    env: {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "public-key",
      SUPABASE_SECRET_KEY: "server-secret",
    },
    clientFactory(...args) {
      calls.push(args);
      return { rpc() {} };
    },
  });
  assert.equal(adapter.configured, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "https://example.supabase.co");
  assert.equal(calls[0][1], "server-secret");
  assert.notEqual(calls[0][1], "public-key");
  assert.deepEqual(calls[0][2], {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
});

test("valid worker signup is canonical, Founding Worker and password-free", async () => {
  const adapter = fakeAdapter();
  const result = await service(adapter).joinWorker(workerInput());
  assert.equal(adapter.workers.size, 1);
  assert.equal(result.foundingWorker, true);
  assert.equal(result.referralCode, "OSW-AAAAAAAAAAAAAAAA");
  assert.equal(result.referralUrl, "https://joinonsite.uk/early-access?ref=OSW-AAAAAAAAAAAAAAAA");
  assert.deepEqual(result.referralProgress, { joinedCount: 0 });
  assert.deepEqual(Object.keys(result), [
    "ok",
    "signupType",
    "message",
    "foundingWorker",
    "firstName",
    "referralCode",
    "referralUrl",
    "referralProgress",
  ]);
  assert.equal(Object.hasOwn(adapter.workers.values().next().value, "password"), false);
  assert.equal([...adapter.deliveryStatuses.values()][0], "skipped");
});

test("worker duplicate retry reuses the stable code without duplicate people", async () => {
  const adapter = fakeAdapter();
  const firstService = service(adapter);
  const first = await firstService.joinWorker(workerInput());
  const second = await service(adapter, { codes: ["OSW-BBBBBBBBBBBBBBBB"] })
    .joinWorker(workerInput());
  assert.equal(adapter.workers.size, 1);
  assert.equal(second.referralCode, first.referralCode);
  assert.equal(adapter.referrals.length, 0);
});

test("mismatched duplicate identity is accepted without leaking code or PII", async () => {
  const adapter = fakeAdapter();
  await service(adapter).joinWorker(workerInput());
  const response = await service(adapter).joinWorker(workerInput({ mobile: "07700 900999" }));
  assert.equal(response.ok, true);
  assert.equal(response.referralCode, "");
  assert.equal(response.referralUrl, "");
  assert.equal(adapter.workers.size, 1);
});

test("company signup and duplicate retry remain password-free and idempotent", async () => {
  const adapter = fakeAdapter();
  const earlyAccess = service(adapter);
  const first = await earlyAccess.joinCompany(companyInput());
  const second = await earlyAccess.joinCompany(companyInput());
  assert.equal(first.companyName, "Apex Construction Ltd");
  assert.equal(second.companyName, first.companyName);
  assert.equal(adapter.companies.size, 1);
  assert.equal(Object.hasOwn(adapter.companies.values().next().value, "password"), false);
});

test("canonical referral attribution works across service instances", async () => {
  const adapter = fakeAdapter();
  const referrer = await service(adapter).joinWorker(workerInput());
  const referred = await service(adapter, { codes: ["OSW-BBBBBBBBBBBBBBBB"] }).joinWorker(workerInput({
    firstName: "Jamie",
    email: "jamie@example.com",
    mobile: "07700 900456",
    referralCode: referrer.referralCode,
  }));
  assert.equal(referred.foundingWorker, true);
  assert.equal(adapter.referrals.length, 1);
  assert.equal(adapter.rewards.length, 3);
  assert.deepEqual(adapter.rewards.map((reward) => reward.amount_pence), [5000, 5000, 2500]);
  assert.ok(adapter.rewards.every((reward) => reward.status === "potential"));
  const referrerRetry = await service(adapter).joinWorker(workerInput());
  assert.equal(referrerRetry.referralProgress.joinedCount, 1);
});

test("invalid, self and changed referral attribution are safely handled", async () => {
  const adapter = fakeAdapter();
  const referrer = await service(adapter).joinWorker(workerInput());
  await assert.rejects(
    service(adapter, { codes: ["OSW-BBBBBBBBBBBBBBBB"] }).joinWorker(workerInput({
      email: "invalid@example.com",
      mobile: "07700 900222",
      referralCode: "OSW-NOTAREALCODE12",
    })),
    (error) => error instanceof EarlyAccessServiceError && error.code === "INVALID_REFERRAL_CODE",
  );
  await assert.rejects(
    service(adapter).joinWorker(workerInput({ referralCode: referrer.referralCode })),
    (error) => error instanceof EarlyAccessServiceError && error.code === "SELF_REFERRAL",
  );
  const secondReferrer = await service(adapter, { codes: ["OSW-BBBBBBBBBBBBBBBB"] }).joinWorker(workerInput({
    firstName: "Chris",
    email: "chris@example.com",
    mobile: "07700 900333",
  }));
  const referredInput = workerInput({
    firstName: "Jamie",
    email: "jamie@example.com",
    mobile: "07700 900444",
    referralCode: referrer.referralCode,
  });
  await service(adapter, { codes: ["OSW-CCCCCCCCCCCCCCCC"] }).joinWorker(referredInput);
  const changed = await service(adapter).joinWorker({
    ...referredInput,
    referralCode: secondReferrer.referralCode,
  });
  assert.equal(changed.referralCode, "");
  assert.equal(adapter.referrals.length, 1);
  assert.equal(adapter.referrals[0].referral_code_snapshot, referrer.referralCode);
});

test("referral code collisions retry without creating duplicate signups", async () => {
  const adapter = fakeAdapter();
  await service(adapter).joinWorker(workerInput());
  const result = await service(adapter, {
    codes: ["OSW-AAAAAAAAAAAAAAAA", "OSW-BBBBBBBBBBBBBBBB"],
  }).joinWorker(workerInput({
    firstName: "Jamie",
    email: "jamie@example.com",
    mobile: "07700 900555",
  }));
  assert.equal(result.referralCode, "OSW-BBBBBBBBBBBBBBBB");
  assert.equal(adapter.workers.size, 2);
});

test("invalid fields, privacy omission and excessive source values fail closed", () => {
  assert.throws(() => normalizeWorkerInput(workerInput({ email: "invalid" })), /valid email/i);
  assert.throws(() => normalizeWorkerInput(workerInput({ privacyAcknowledged: false })), /privacy/i);
  assert.throws(() => normalizeWorkerInput(workerInput({ tradeKey: "made_up" })), /valid trade/i);
  assert.throws(() => normalizeWorkerInput(workerInput({
    source: { landingPath: "/early-access", utmSource: "x".repeat(121) },
  })), /too long/i);
  assert.throws(() => normalizeCompanyInput(companyInput({ labourCategoryKeys: [] })), /category/i);
});

test("email absence and provider failure never lose a valid signup", async () => {
  const withoutEmail = fakeAdapter();
  await service(withoutEmail).joinWorker(workerInput());
  assert.equal([...withoutEmail.deliveryStatuses.values()][0], "skipped");

  const failedEmail = fakeAdapter();
  await service(failedEmail, {
    emailProvider: {
      configured: true,
      async sendWorker() { throw new Error("provider unavailable"); },
      async sendCompany() { throw new Error("provider unavailable"); },
    },
  }).joinCompany(companyInput());
  assert.equal(failedEmail.companies.size, 1);
  assert.equal([...failedEmail.deliveryStatuses.values()][0], "failed");
});

test("client identity ignores forwarding headers unless proxy trust is explicit", () => {
  const req = {
    socket: { remoteAddress: "192.0.2.10" },
    headers: { "x-forwarded-for": "198.51.100.20" },
  };
  assert.equal(earlyAccessClientKey(req, { env: {} }), "192.0.2.10");
  assert.equal(
    earlyAccessClientKey({
      ...req,
      headers: { "x-forwarded-for": "203.0.113.30" },
    }, { env: { EARLY_ACCESS_TRUST_PROXY: "false" } }),
    "192.0.2.10",
  );
  assert.equal(
    earlyAccessClientKey(req, { env: { EARLY_ACCESS_TRUST_PROXY: "1" } }),
    "192.0.2.10",
  );
});

test("trusted proxy mode uses the rightmost valid forwarded IP and falls back safely", () => {
  const env = { EARLY_ACCESS_TRUST_PROXY: "true" };
  assert.equal(earlyAccessClientKey({
    socket: { remoteAddress: "192.0.2.10" },
    headers: { "x-forwarded-for": "198.51.100.20, malformed, 203.0.113.30" },
  }, { env }), "203.0.113.30");
  assert.equal(earlyAccessClientKey({
    socket: { remoteAddress: "192.0.2.10" },
    headers: { "x-forwarded-for": "malformed, still-not-an-ip" },
  }, { env }), "192.0.2.10");
});

test("rate limiter enforces a bounded in-memory request window", () => {
  const limiter = createEarlyAccessRateLimiter({ maxRequests: 2, windowMs: 1000 });
  assert.equal(limiter.consume("client", 0).allowed, true);
  assert.equal(limiter.consume("client", 100).allowed, true);
  assert.equal(limiter.consume("client", 200).allowed, false);
  assert.equal(limiter.consume("client", 1100).allowed, true);
});

test("rate limiter fails closed at capacity without disrupting active buckets", () => {
  const limiter = createEarlyAccessRateLimiter({
    maxRequests: 2,
    windowMs: 1000,
    maxEntries: 2,
  });
  assert.equal(limiter.consume("first", 0).allowed, true);
  assert.equal(limiter.consume("second", 0).allowed, true);
  const atCapacity = limiter.consume("third", 100);
  assert.equal(atCapacity.allowed, false);
  assert.equal(atCapacity.retryAfterSeconds, 1);
  assert.equal(limiter.size(), 2);
  assert.equal(limiter.consume("first", 200).allowed, true);
  assert.equal(limiter.consume("first", 300).allowed, false);
  assert.equal(limiter.size(), 2);
});

test("rate limiter reclaims expired buckets before admitting a new key", () => {
  const limiter = createEarlyAccessRateLimiter({
    maxRequests: 1,
    windowMs: 1000,
    maxEntries: 2,
  });
  limiter.consume("first", 0);
  limiter.consume("second", 0);
  assert.equal(limiter.consume("third", 1001).allowed, true);
  assert.equal(limiter.size(), 1);
});

test("migration 008 locks down tables and preserves historical referral records", () => {
  const sql = fs.readFileSync(
    path.join(rootDir, "supabase/migrations/202609170008_early_access_foundation.sql"),
    "utf8",
  );
  assert.match(sql, /^begin;/i);
  assert.match(sql, /create table if not exists public\.early_access_signups/i);
  assert.match(sql, /create table if not exists public\.early_access_referrals/i);
  assert.match(sql, /create table if not exists public\.early_access_referral_rewards/i);
  assert.match(sql, /referrer_signup_id[\s\S]*on delete restrict/i);
  assert.match(sql, /referred_signup_id[\s\S]*on delete restrict/i);
  assert.match(sql, /enable row level security/gi);
  assert.match(sql, /revoke all on public\.early_access_signups from public, anon, authenticated, service_role/i);
  assert.doesNotMatch(sql, /grant (?:select|insert|update|delete)[^;]* to (?:anon|authenticated)/i);
  assert.doesNotMatch(
    sql,
    /grant (?:select|insert|update|delete)[^;]*on public\.early_access_[^;]*to service_role/i,
  );
  [
    "protect_early_access_signup_identity",
    "protect_early_access_referral_identity",
    "validate_early_access_referral_workers",
  ].forEach((functionName) => {
    assert.match(
      sql,
      new RegExp(`revoke all on function public\\.${functionName}\\(\\)[\\s\\S]*?from public, anon, authenticated, service_role`, "i"),
    );
  });
  const securityDefinerFunctions = [
    "join_early_access_worker",
    "join_early_access_company",
    "set_early_access_email_delivery_status",
  ];
  securityDefinerFunctions.forEach((functionName) => {
    const start = sql.indexOf(`create or replace function public.${functionName}`);
    const end = sql.indexOf("$$;", start);
    assert.notEqual(start, -1);
    assert.notEqual(end, -1);
    const definition = sql.slice(start, end + 3);
    assert.match(definition, /security definer/i);
    assert.match(definition, /set search_path = pg_catalog, public/i);
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${functionName}[\\s\\S]*?to service_role`, "i"),
    );
  });
  assert.equal(
    (sql.match(/grant execute on function public\./gi) || []).length,
    securityDefinerFunctions.length,
  );
  assert.match(sql, /EARLY_ACCESS_REFERRAL_IMMUTABLE/);
  assert.match(sql, /commit;\s*$/i);
});

test("public UI is password-free, API-backed and has sub-contractor and hiring-company paths", () => {
  const html = fs.readFileSync(path.join(rootDir, "early-access.html"), "utf8");
  const client = fs.readFileSync(path.join(rootDir, "early-access.js"), "utf8");
  const css = fs.readFileSync(path.join(rootDir, "early-access.css"), "utf8");
  assert.match(html, /id="workerEarlyAccessForm"/);
  assert.match(html, /id="companyEarlyAccessForm"/);
  assert.match(html, /I'm looking for work/);
  assert.match(html, /I'm hiring/);
  assert.match(html, /FOR CIS SUB-CONTRACTORS/);
  assert.match(html, /FOR UK CONTRACTORS/);
  assert.match(html, /Join OnSite Early Access/);
  assert.doesNotMatch(html, /Founding Worker/);
  assert.doesNotMatch(html, /\bWorker\b/);
  assert.doesNotMatch(html, /type="password"/);
  assert.match(client, /\/api\/early-access\/\$\{type\}/);
  assert.doesNotMatch(client, /\/api\/auth\//);
  assert.doesNotMatch(client, /localStorage/);
  assert.doesNotMatch(`${html}\n${client}`, /SUPABASE_SECRET_KEY|RESEND_API_KEY/);
  assert.match(client, /searchParams|URLSearchParams/);
  assert.match(client, /\.get\("ref"\)/);
  assert.match(client, /data-copy-referral/);
  assert.match(client, /data-share-referral/);
  assert.match(client, /referralProgress\?\.joinedCount/);
  assert.match(html, /name="viewport"/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /@media \(max-width: 420px\)/);
});
