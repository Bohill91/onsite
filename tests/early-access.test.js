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
  createResendEarlyAccessEmailProvider,
  createSupabaseEarlyAccessAdapter,
  earlyAccessClientKey,
  normalizeCompanyInput,
  normalizeWorkerInput,
  referralCode,
} = require("../server-early-access.js");
const { normalisePhone } = require("../phone-utils.js");

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
    cisAcknowledged: true,
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
    referralCode: "",
    companyReferralAcknowledged: true,
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

  function companyResult(row, created) {
    return {
      accepted: true,
      created,
      signup_id: row.id,
      first_name: row.first_name,
      company_name: row.company_name,
      email_normalized: row.email_normalized,
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
        cis_referral_acknowledged: input.cisAcknowledged,
        referral_terms_version: input.referralTermsVersion,
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
          programme_type: "subcontractor_cash",
          status: "joined",
        };
        referrals.push(referral);
        rewards.push(
          { referral_id: referral.id, key: "referrer_five_paid_days", amount_pence: 5000, benefit_type: "cash", verification_requirement: "cis", status: "potential" },
          { referral_id: referral.id, key: "referrer_twenty_paid_days", amount_pence: 5000, benefit_type: "cash", verification_requirement: "cis", status: "potential" },
          { referral_id: referral.id, key: "referred_five_paid_days", amount_pence: 2500, benefit_type: "cash", verification_requirement: "cis", status: "potential" },
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
        const row = existing.email;
        if (input.suppliedReferralCode === row.referral_code) {
          throw new EarlyAccessAdapterError("Self referral", "23514", "SELF_REFERRAL");
        }
        if ((input.suppliedReferralCode || "") !== (row.referred_by_code || "")) {
          return { accepted: true, redacted: true, created: false };
        }
        return companyResult(row, false);
      }
      if ([...companies.values()].some((row) => row.referral_code === input.issuedReferralCode)) {
        throw new EarlyAccessAdapterError(
          "Referral code collision",
          "REFERRAL_CODE_COLLISION",
          "referral_code",
        );
      }
      const referrer = input.suppliedReferralCode
        ? [...companies.values()].find((row) => row.referral_code === input.suppliedReferralCode)
        : null;
      if (input.suppliedReferralCode && !referrer) {
        throw new EarlyAccessAdapterError("Invalid referral", "22023", "INVALID_REFERRAL_CODE");
      }
      const row = {
        id: id(),
        first_name: input.firstName,
        company_name: input.companyName,
        email_normalized: input.email,
        mobile_normalized: input.mobile,
        labour_category_keys: [...input.labourCategoryKeys],
        referral_code: input.issuedReferralCode,
        referred_by_code: input.suppliedReferralCode || null,
        company_referral_acknowledged: input.companyReferralAcknowledged,
        referral_terms_version: input.referralTermsVersion,
      };
      companies.set(row.id, row);
      if (referrer) {
        const referral = {
          id: id(),
          referrer_signup_id: referrer.id,
          referred_signup_id: row.id,
          referral_code_snapshot: referrer.referral_code,
          programme_type: "contractor_credit",
          status: "joined",
        };
        referrals.push(referral);
        rewards.push(
          { referral_id: referral.id, key: "referred_company_first_booking_credit", amount_pence: 10000, benefit_type: "account_credit", verification_requirement: "company", status: "potential" },
          { referral_id: referral.id, key: "referrer_company_five_paid_labour_days", amount_pence: 10000, benefit_type: "account_credit", verification_requirement: "company", status: "potential" },
          { referral_id: referral.id, key: "referrer_company_twenty_paid_labour_days", amount_pence: 15000, benefit_type: "account_credit", verification_requirement: "company", status: "potential" },
        );
      }
      return companyResult(row, true);
    },
    async setEmailDeliveryStatus(signupId, status) {
      deliveryStatuses.set(signupId, status);
    },
  };
}

function service(adapter, options = {}) {
  const workerCodes = options.codes || options.workerCodes || [
    "OSW-AAAAAAAAAAAAAAAA",
    "OSW-BBBBBBBBBBBBBBBB",
    "OSW-CCCCCCCCCCCCCCCC",
  ];
  const companyCodes = options.companyCodes || [
    "OSC-AAAAAAAAAAAAAAAA",
    "OSC-BBBBBBBBBBBBBBBB",
    "OSC-CCCCCCCCCCCCCCCC",
  ];
  return createEarlyAccessService({
    adapter,
    emailProvider: options.emailProvider || { configured: false },
    env: { EARLY_ACCESS_BASE_URL: "https://joinonsite.uk" },
    codeGenerator: (prefix) => prefix === "OSC"
      ? companyCodes.shift() || "OSC-ZZZZZZZZZZZZZZZZ"
      : workerCodes.shift() || "OSW-ZZZZZZZZZZZZZZZZ",
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

test("phone normalisation supports selected countries and pasted international formats", () => {
  assert.equal(normalisePhone("07700 900123", "GB"), "+447700900123");
  assert.equal(normalisePhone("+447700900123", "GB"), "+447700900123");
  assert.equal(normalisePhone("0044 07700 900123", "GB"), "+447700900123");
  assert.equal(normalisePhone("+4407700900123", "GB"), "+447700900123");
  assert.equal(normalisePhone("087 123 4567", "IE"), "+353871234567");
  assert.equal(normalisePhone("+353871234567", "GB"), "+353871234567");
  assert.equal(normalisePhone("not a phone", "GB"), "");
});

test("server-issued referral codes use the canonical unpredictable format", () => {
  const first = referralCode("OSW");
  const second = referralCode("OSW");
  const company = referralCode("OSC");
  assert.match(first, /^OSW-[A-Z0-9]{16}$/);
  assert.match(second, /^OSW-[A-Z0-9]{16}$/);
  assert.match(company, /^OSC-[A-Z0-9]{16}$/);
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

test("Supabase adapter uses acknowledgement-aware programme RPCs", async () => {
  const calls = [];
  const adapter = createSupabaseEarlyAccessAdapter({
    env: {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SECRET_KEY: "server-secret",
    },
    clientFactory() {
      return {
        async rpc(name, params) {
          calls.push({ name, params });
          return { data: { accepted: true }, error: null };
        },
      };
    },
  });
  await adapter.joinWorker(normalizeWorkerInput(workerInput({ mobile: "+447700900123" })));
  await adapter.joinCompany({
    ...normalizeCompanyInput(companyInput({ mobile: "+441135550101" })),
    issuedReferralCode: "OSC-AAAAAAAAAAAAAAAA",
  });
  assert.equal(calls[0].name, "join_early_access_worker_v2");
  assert.equal(calls[0].params.p_cis_acknowledged, true);
  assert.equal(calls[1].name, "join_early_access_company_v2");
  assert.equal(calls[1].params.p_company_acknowledged, true);
  assert.equal(calls[1].params.p_issued_referral_code, "OSC-AAAAAAAAAAAAAAAA");
});

test("valid worker signup is canonical, Founding Worker and password-free", async () => {
  const adapter = fakeAdapter();
  const result = await service(adapter).joinWorker(workerInput());
  assert.equal(adapter.workers.size, 1);
  assert.equal(result.foundingWorker, true);
  assert.equal(result.referralCode, "OSW-AAAAAAAAAAAAAAAA");
  assert.equal(result.referralUrl, "https://joinonsite.uk/early-access?ref=OSW-AAAAAAAAAAAAAAAA");
  assert.equal(result.emailDeliveryStatus, "skipped");
  assert.deepEqual(result.referralProgress, { joinedCount: 0 });
  assert.deepEqual(Object.keys(result), [
    "ok",
    "signupType",
    "message",
    "foundingWorker",
    "firstName",
    "referralCode",
    "referralUrl",
    "emailDeliveryStatus",
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
  assert.equal(first.referralCode, "OSC-AAAAAAAAAAAAAAAA");
  assert.equal(second.referralCode, first.referralCode);
  assert.equal(first.referralUrl, "https://joinonsite.uk/early-access?ref=OSC-AAAAAAAAAAAAAAAA");
  assert.equal(adapter.companies.size, 1);
  assert.equal(Object.hasOwn(adapter.companies.values().next().value, "password"), false);
});

test("contractor referrals create fixed non-cash entitlements and immutable attribution", async () => {
  const adapter = fakeAdapter();
  const referrer = await service(adapter).joinCompany(companyInput());
  const referredInput = companyInput({
    companyName: "Northgate M&E Ltd",
    firstName: "Jamie",
    email: "jamie@northgate.example",
    mobile: "07700 900456",
    referralCode: referrer.referralCode,
  });
  const referred = await service(adapter, {
    companyCodes: ["OSC-BBBBBBBBBBBBBBBB"],
  }).joinCompany(referredInput);
  assert.equal(referred.referralCode, "OSC-BBBBBBBBBBBBBBBB");
  assert.equal(adapter.referrals.length, 1);
  assert.equal(adapter.referrals[0].programme_type, "contractor_credit");
  assert.deepEqual(
    adapter.rewards.map((reward) => reward.amount_pence),
    [10000, 10000, 15000],
  );
  assert.ok(adapter.rewards.every((reward) => reward.benefit_type === "account_credit"));
  assert.ok(adapter.rewards.every((reward) => reward.status === "potential"));
  assert.equal(
    adapter.rewards
      .filter((reward) => reward.key.startsWith("referrer_company_"))
      .reduce((sum, reward) => sum + reward.amount_pence, 0),
    25000,
  );

  const retry = await service(adapter, {
    companyCodes: ["OSC-CCCCCCCCCCCCCCCC"],
  }).joinCompany(referredInput);
  assert.equal(retry.referralCode, referred.referralCode);
  assert.equal(adapter.referrals.length, 1);
  assert.equal(adapter.rewards.length, 3);

  await assert.rejects(
    service(adapter).joinCompany(companyInput({ referralCode: referrer.referralCode })),
    (error) => error instanceof EarlyAccessServiceError && error.code === "SELF_REFERRAL",
  );
});

test("OSW and OSC referral namespaces cannot cross programmes", async () => {
  const adapter = fakeAdapter();
  const worker = await service(adapter).joinWorker(workerInput());
  const company = await service(adapter).joinCompany(companyInput());
  await assert.rejects(
    service(adapter).joinCompany(companyInput({
      companyName: "Wrong Route Ltd",
      email: "wrong-company@example.com",
      mobile: "07700 900777",
      referralCode: worker.referralCode,
    })),
    (error) => error instanceof EarlyAccessServiceError && error.code === "INVALID_REFERRAL_CODE",
  );
  await assert.rejects(
    service(adapter).joinWorker(workerInput({
      email: "wrong-worker@example.com",
      mobile: "07700 900778",
      referralCode: company.referralCode,
    })),
    (error) => error instanceof EarlyAccessServiceError && error.code === "INVALID_REFERRAL_CODE",
  );
  assert.equal(adapter.referrals.length, 0);
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

test("contractor referral code collisions retry with the OSC namespace", async () => {
  const adapter = fakeAdapter();
  await service(adapter).joinCompany(companyInput());
  const result = await service(adapter, {
    companyCodes: ["OSC-AAAAAAAAAAAAAAAA", "OSC-BBBBBBBBBBBBBBBB"],
  }).joinCompany(companyInput({
    companyName: "Northgate M&E Ltd",
    email: "northgate@example.com",
    mobile: "07700 900888",
  }));
  assert.equal(result.referralCode, "OSC-BBBBBBBBBBBBBBBB");
  assert.equal(adapter.companies.size, 2);
});

test("invalid fields, privacy omission and excessive source values fail closed", () => {
  assert.throws(() => normalizeWorkerInput(workerInput({ email: "invalid" })), /valid email/i);
  assert.throws(() => normalizeWorkerInput(workerInput({ privacyAcknowledged: false })), /privacy/i);
  assert.throws(() => normalizeWorkerInput(workerInput({ tradeKey: "made_up" })), /valid trade/i);
  assert.throws(() => normalizeWorkerInput(workerInput({
    source: { landingPath: "/early-access", utmSource: "x".repeat(121) },
  })), /too long/i);
  assert.throws(() => normalizeCompanyInput(companyInput({ labourCategoryKeys: [] })), /category/i);
  assert.throws(
    () => normalizeWorkerInput(workerInput({ cisAcknowledged: false })),
    (error) => error.code === "CIS_REFERRAL_ACKNOWLEDGEMENT_REQUIRED",
  );
  assert.throws(
    () => normalizeCompanyInput(companyInput({ companyReferralAcknowledged: false })),
    (error) => error.code === "COMPANY_REFERRAL_ACKNOWLEDGEMENT_REQUIRED",
  );
});

test("email absence and provider failure never lose a valid signup", async () => {
  const withoutEmail = fakeAdapter();
  const skipped = await service(withoutEmail).joinWorker(workerInput());
  assert.equal(skipped.emailDeliveryStatus, "skipped");
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

test("Resend provider uses the professional Early Access confirmation copy", async () => {
  const requests = [];
  const provider = createResendEarlyAccessEmailProvider({
    env: {
      RESEND_API_KEY: "test-key",
      EARLY_ACCESS_FROM_EMAIL: "OnSite <hello@example.com>",
      EARLY_ACCESS_BASE_URL: "https://joinonsite.uk",
    },
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return { ok: true, status: 200 };
    },
  });
  await provider.sendWorker({
    email_normalized: "sam@example.com",
    first_name: "Sam",
    referral_code: "OSW-AAAAAAAAAAAAAAAA",
  });
  await provider.sendCompany({
    email_normalized: "luke@example.com",
    first_name: "Luke",
    company_name: "Apex Construction Ltd",
    referral_code: "OSC-AAAAAAAAAAAAAAAA",
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[0].subject, "You're registered for OnSite Early Access");
  assert.match(requests[0].text, /OSW-AAAAAAAAAAAAAAAA/);
  assert.match(requests[0].text, /https:\/\/joinonsite\.uk\/early-access\?ref=OSW-AAAAAAAAAAAAAAAA/);
  assert.match(requests[0].text, /5 paid days/);
  assert.match(requests[0].text, /20 paid days/);
  assert.match(requests[0].text, /do not need to complete paid work/i);
  assert.match(requests[0].text, /CIS verification/i);
  assert.doesNotMatch(`${requests[0].text}\n${requests[0].html}`, /Founding Worker/);
  assert.equal(requests[1].subject, "You're registered for OnSite Early Access");
  assert.match(requests[1].text, /contractor onboarding/);
  assert.match(requests[1].text, /OSC-AAAAAAAAAAAAAAAA/);
  assert.match(requests[1].text, /first qualifying labour booking/i);
  assert.match(requests[1].text, /£100 credit/i);
  assert.match(requests[1].text, /£150 credit/i);
  assert.match(requests[1].text, /not cash and cannot be withdrawn/i);
  assert.doesNotMatch(`${requests[1].text}\n${requests[1].html}`, /CIS verification|cash reward/i);
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

test("migration 009 extends referrals without weakening programme or reward authority", () => {
  const sql = fs.readFileSync(
    path.join(rootDir, "supabase/migrations/202609180009_canonical_referral_programmes.sql"),
    "utf8",
  );
  assert.match(sql, /^begin;/i);
  assert.match(sql, /where signup_type = 'company'[\s\S]*and referral_code is null/i);
  assert.match(sql, /OSC-\[A-Z0-9\]/i);
  assert.match(sql, /programme_type in \('subcontractor_cash', 'contractor_credit'\)/i);
  assert.match(sql, /benefit_type in \('cash', 'account_credit'\)/i);
  assert.match(sql, /earned_pending_verification/i);
  assert.match(sql, /'payable'/i);
  assert.match(sql, /'paid'/i);
  assert.match(sql, /'void'/i);
  assert.match(sql, /referrer_company_five_paid_labour_days'[\s\S]*10000/i);
  assert.match(sql, /referrer_company_twenty_paid_labour_days'[\s\S]*15000/i);
  assert.match(sql, /referred_company_first_booking_credit'[\s\S]*10000/i);
  assert.match(sql, /create table if not exists public\.early_access_referral_credit_ledger/i);
  assert.match(sql, /early_access_referral_rewards_evidence_unique/i);
  assert.match(sql, /validate_early_access_referral_entitlement/i);
  assert.match(sql, /EARLY_ACCESS_ENTITLEMENT_PROGRAMME_MISMATCH/i);
  assert.match(sql, /referrer_record\.referral_code is distinct from new\.referral_code_snapshot/i);
  assert.match(sql, /EARLY_ACCESS_REFERRAL_SNAPSHOT_MISMATCH/i);
  assert.match(sql, /early_access_referral_rewards_evidence_key_check/i);
  assert.match(sql, /early_access_referral_rewards_lifecycle_check/i);
  assert.match(sql, /protect_early_access_referral_reward_transition/i);
  assert.match(sql, /EARLY_ACCESS_REWARD_INITIAL_STATUS/i);
  assert.match(sql, /EARLY_ACCESS_REWARD_INVALID_TRANSITION/i);
  assert.match(sql, /paid_at >= payable_at/i);
  assert.match(sql, /status = 'paid'[\s\S]*benefit_type = 'cash'/i);
  assert.match(sql, /status = 'credited'[\s\S]*benefit_type = 'account_credit'/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on public\.early_access_referral_credit_ledger/i);
  assert.match(sql, /validate_early_access_referral_credit_ledger/i);
  assert.match(sql, /EARLY_ACCESS_CREDIT_LEDGER_REWARD_MISMATCH/i);
  assert.match(sql, /EARLY_ACCESS_CREDIT_LEDGER_REVERSAL_INVALID/i);
  assert.match(sql, /EARLY_ACCESS_CREDIT_LEDGER_NEGATIVE_BALANCE/i);
  assert.match(sql, /reversal_of_ledger_id/i);
  assert.match(sql, /revoke execute on function public\.join_early_access_worker[\s\S]*from service_role/i);
  assert.match(sql, /revoke execute on function public\.join_early_access_company[\s\S]*from service_role/i);
  assert.match(sql, /grant execute on function public\.join_early_access_worker_v2[\s\S]*to service_role/i);
  assert.match(sql, /grant execute on function public\.join_early_access_company_v2[\s\S]*to service_role/i);
  assert.doesNotMatch(sql, /grant (?:select|insert|update|delete)[^;]*to (?:anon|authenticated)/i);
  assert.doesNotMatch(sql, /attendance/i);
  assert.match(sql, /commit;\s*$/i);
});

test("verification SQL keeps pre-009 checks compatible with migration 008", () => {
  const preflight = fs.readFileSync(
    path.join(rootDir, "docs/early-access-pre-009-verification.sql"),
    "utf8",
  );
  const postflight = fs.readFileSync(
    path.join(rootDir, "docs/early-access-post-009-verification.sql"),
    "utf8",
  );
  [
    "early_access_referral_credit_ledger",
    "qualifying_evidence_key",
    "programme_type",
    "benefit_type",
    "verification_confirmed_at",
  ].forEach((name) => assert.doesNotMatch(preflight, new RegExp(name, "i")));
  [
    "early_access_referral_credit_ledger",
    "qualifying_evidence_key",
    "programme_type",
    "benefit_type",
    "verification_confirmed_at",
    "protect_early_access_referral_reward_transition",
  ].forEach((name) => assert.match(postflight, new RegExp(name, "i")));
  assert.doesNotMatch(
    preflight,
    /^\s*(insert|update|delete|alter|create|drop|grant|revoke)\b/im,
  );
  assert.doesNotMatch(
    postflight,
    /^\s*(insert|update|delete|alter|create|drop|grant|revoke)\b/im,
  );
});

test("migration 008 remains byte-for-byte unchanged", () => {
  const current = fs.readFileSync(
    path.join(rootDir, "supabase/migrations/202609170008_early_access_foundation.sql"),
    "utf8",
  );
  const baseline = require("node:child_process")
    .execFileSync(
      "git",
      ["show", "HEAD:supabase/migrations/202609170008_early_access_foundation.sql"],
      { encoding: "utf8" },
    );
  assert.equal(current, baseline);
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
  assert.match(html, /Register for OnSite Early Access/);
  assert.match(html, /Register your interest and we'll notify you when profile setup opens/);
  assert.match(html, /Register your interest and we'll contact you when contractor access opens/);
  assert.match(html, /We'll contact you when contractor onboarding opens/);
  assert.match(html, /start setting up your labour requirements/);
  assert.match(html, /Register for Early Access/);
  assert.match(html, /Earn up to £100 per qualifying referral/);
  assert.match(html, /name="cisAcknowledged"[^>]*required/);
  assert.match(html, /name="companyReferralAcknowledged"[^>]*required/);
  assert.match(html, /id="eaCompanyReferralCode"/);
  assert.match(html, /ONSITE SUB-CONTRACTOR REFERRAL PROGRAMME/);
  assert.match(html, /Registration alone does not qualify for a reward/);
  assert.match(html, /Additional £50 referral reward/);
  assert.doesNotMatch(html, /Founding Worker/);
  assert.doesNotMatch(html, /\bWorker\b/);
  assert.doesNotMatch(html, /type="password"/);
  assert.match(client, /\/api\/early-access\/\$\{type\}/);
  assert.doesNotMatch(client, /\/api\/auth\//);
  assert.doesNotMatch(client, /localStorage/);
  assert.doesNotMatch(`${html}\n${client}`, /SUPABASE_SECRET_KEY|RESEND_API_KEY/);
  assert.match(client, /searchParams|URLSearchParams/);
  assert.match(client, /\.get\("ref"\)/);
  assert.match(client, /startsWith\("OSC-"\)/);
  assert.match(client, /Earn up to £250 in OnSite credit per qualifying contractor referral/);
  assert.match(client, /OnSite credit is not cash and cannot be withdrawn/);
  assert.match(client, /companyReferralAcknowledged/);
  assert.match(client, /cisAcknowledged/);
  assert.match(client, /data-copy-referral/);
  assert.match(client, /data-share-referral/);
  assert.doesNotMatch(client, /referralProgress\?\.joinedCount/);
  assert.match(client, /Registrations through this link are attributed to you automatically/);
  assert.match(html, /name="mobileCountry"/);
  assert.match(client, /normalisePhone/);
  assert.match(html, /name="viewport"/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /@media \(max-width: 420px\)/);
});
