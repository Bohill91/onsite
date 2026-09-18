"use strict";

const crypto = require("node:crypto");
const net = require("node:net");
const { createClient } = require("@supabase/supabase-js");
const taxonomy = require("./taxonomy.js");
const { normalisePhone } = require("./phone-utils.js");

const PRIVACY_VERSION = "early-access-v1";
const REFERRAL_TERMS_VERSION = "referral-programmes-v1";
const REFERRAL_CODE_PATTERN = /^OS[WC]-[A-Z0-9]{12,24}$/;
const REFERRAL_CODE_PATTERNS = Object.freeze({
  worker: /^OSW-[A-Z0-9]{12,24}$/,
  company: /^OSC-[A-Z0-9]{12,24}$/,
});
const SOURCE_FIELDS = Object.freeze([
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "utmContent",
]);

class EarlyAccessServiceError extends Error {
  constructor(message, statusCode = 400, code = "EARLY_ACCESS_ERROR") {
    super(message);
    this.name = "EarlyAccessServiceError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

class EarlyAccessAdapterError extends Error {
  constructor(message, code = "EARLY_ACCESS_ADAPTER_ERROR", details = "") {
    super(message);
    this.name = "EarlyAccessAdapterError";
    this.code = code;
    this.details = details;
  }
}

function strictText(value, field, maxLength, { required = false } = {}) {
  const text = typeof value === "string" ? value.trim() : "";
  if (required && !text) {
    throw new EarlyAccessServiceError(`${field} is required.`, 400, "INVALID_SIGNUP");
  }
  if (text.length > maxLength) {
    throw new EarlyAccessServiceError(
      `${field} is too long.`,
      400,
      "INVALID_SIGNUP",
    );
  }
  return text;
}

function normalizeEmail(value) {
  const email = strictText(value, "Email", 320, { required: true }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new EarlyAccessServiceError(
      "Enter a valid email address.",
      400,
      "INVALID_EMAIL",
    );
  }
  return email;
}

function normalizeMobile(value) {
  const mobile = normalisePhone(strictText(value, "Mobile number", 40, { required: true }));
  if (!mobile) {
    throw new EarlyAccessServiceError(
      "Enter a valid telephone number.",
      400,
      "INVALID_MOBILE",
    );
  }
  return mobile;
}

function normalizeReferralCode(value, signupType = "") {
  const code = strictText(value, "Referral code", 32)
    .toUpperCase()
    .replace(/\s+/g, "");
  const pattern = REFERRAL_CODE_PATTERNS[signupType] || REFERRAL_CODE_PATTERN;
  if (code && !pattern.test(code)) {
    throw new EarlyAccessServiceError(
      "That referral code is not valid. Remove it to continue without a referral.",
      400,
      "INVALID_REFERRAL_CODE",
    );
  }
  return code;
}

function normalizeLandingPath(value) {
  const path = strictText(value, "Landing path", 300) || "/early-access";
  if (!path.startsWith("/") || path.startsWith("//") || /[?#]/.test(path)) {
    throw new EarlyAccessServiceError(
      "Landing path is invalid.",
      400,
      "INVALID_SOURCE",
    );
  }
  return path;
}

function normalizeSource(value = {}) {
  const source = {};
  SOURCE_FIELDS.forEach((field) => {
    source[field] = strictText(value?.[field], field, 120).toLowerCase();
  });
  source.landingPath = normalizeLandingPath(value?.landingPath);
  return source;
}

function requirePrivacyAcknowledgement(value) {
  if (value !== true) {
    throw new EarlyAccessServiceError(
      "Confirm that you have read the Early Access privacy information.",
      400,
      "PRIVACY_ACKNOWLEDGEMENT_REQUIRED",
    );
  }
}

function requireReferralAcknowledgement(value, signupType) {
  if (value === true) return;
  const company = signupType === "company";
  throw new EarlyAccessServiceError(
    company
      ? "Confirm the contractor referral eligibility statement."
      : "Confirm the CIS sub-contractor referral eligibility statement.",
    400,
    company
      ? "COMPANY_REFERRAL_ACKNOWLEDGEMENT_REQUIRED"
      : "CIS_REFERRAL_ACKNOWLEDGEMENT_REQUIRED",
  );
}

function normalizeWorkerInput(input = {}) {
  requirePrivacyAcknowledgement(input.privacyAcknowledged);
  requireReferralAcknowledgement(input.cisAcknowledged, "worker");
  const trade = taxonomy.findTrade(input.tradeKey || input.trade);
  const role = taxonomy.findRole(trade?.key, input.roleKey || input.role);
  if (!trade || !role) {
    throw new EarlyAccessServiceError(
      "Choose a valid trade and role.",
      400,
      "INVALID_TRADE_ROLE",
    );
  }
  return {
    firstName: strictText(input.firstName, "First name", 100, { required: true }),
    lastName: strictText(input.lastName, "Last name", 100, { required: true }),
    email: normalizeEmail(input.email),
    mobile: normalizeMobile(input.mobile),
    tradeKey: trade.key,
    trade: trade.name,
    roleKey: role.key,
    role: role.name,
    homeArea: strictText(input.homeArea, "Postcode or home area", 160, {
      required: true,
    }),
    suppliedReferralCode: normalizeReferralCode(input.referralCode, "worker"),
    cisAcknowledged: true,
    referralTermsVersion: REFERRAL_TERMS_VERSION,
    marketingConsent: input.marketingConsent === true,
    privacyVersion: PRIVACY_VERSION,
    source: normalizeSource(input.source),
  };
}

function normalizeCompanyInput(input = {}) {
  requirePrivacyAcknowledgement(input.privacyAcknowledged);
  requireReferralAcknowledgement(input.companyReferralAcknowledged, "company");
  const categoryKeys = Array.isArray(input.labourCategoryKeys)
    ? [...new Set(input.labourCategoryKeys.map((value) => String(value || "").trim()))]
    : [];
  if (!categoryKeys.length || categoryKeys.length > 20) {
    throw new EarlyAccessServiceError(
      "Choose at least one labour category.",
      400,
      "INVALID_LABOUR_CATEGORIES",
    );
  }
  const categories = categoryKeys.map((key) => taxonomy.findTrade(key));
  if (categories.some((category) => !category)) {
    throw new EarlyAccessServiceError(
      "Choose valid labour categories.",
      400,
      "INVALID_LABOUR_CATEGORIES",
    );
  }
  const approximateWorkers = input.approximateWorkers === "" || input.approximateWorkers == null
    ? null
    : Number(input.approximateWorkers);
  if (
    approximateWorkers != null
    && (!Number.isInteger(approximateWorkers) || approximateWorkers < 1 || approximateWorkers > 100000)
  ) {
    throw new EarlyAccessServiceError(
      "Enter a valid approximate worker requirement.",
      400,
      "INVALID_WORKER_REQUIREMENT",
    );
  }
  return {
    companyName: strictText(input.companyName, "Company name", 200, { required: true }),
    firstName: strictText(input.firstName, "Contact first name", 100, { required: true }),
    lastName: strictText(input.lastName, "Contact last name", 100, { required: true }),
    email: normalizeEmail(input.email),
    mobile: normalizeMobile(input.mobile),
    labourCategoryKeys: categories.map((category) => category.key),
    labourCategories: categories.map((category) => category.name),
    operatingArea: strictText(input.operatingArea, "Primary operating area", 200, {
      required: true,
    }),
    approximateWorkers,
    note: strictText(input.note, "Note", 1200),
    suppliedReferralCode: normalizeReferralCode(input.referralCode, "company"),
    companyReferralAcknowledged: true,
    referralTermsVersion: REFERRAL_TERMS_VERSION,
    marketingConsent: input.marketingConsent === true,
    privacyVersion: PRIVACY_VERSION,
    source: normalizeSource(input.source),
  };
}

function referralCode(prefix = "OSW") {
  const namespace = prefix === "OSC" ? "OSC" : "OSW";
  return `${namespace}-${crypto.randomBytes(10).toString("hex").toUpperCase().slice(0, 16)}`;
}

function configuredBaseUrl(env = process.env) {
  const value = String(env.EARLY_ACCESS_BASE_URL || "https://joinonsite.uk").trim();
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid protocol");
    return url.origin;
  } catch (_) {
    return "https://joinonsite.uk";
  }
}

function canonicalReferralUrl(code, env = process.env) {
  if (!code) return "";
  const url = new URL("/early-access", configuredBaseUrl(env));
  url.searchParams.set("ref", code);
  return url.toString();
}

function adapterError(result, fallbackMessage) {
  const error = result?.error;
  if (!error) return null;
  return new EarlyAccessAdapterError(
    error.message || fallbackMessage,
    error.code || "EARLY_ACCESS_DATABASE_ERROR",
    error.details || error.hint || "",
  );
}

function firstRecord(value) {
  if (Array.isArray(value)) return value[0] || null;
  return value && typeof value === "object" ? value : null;
}

function createSupabaseEarlyAccessAdapter({
  env = process.env,
  clientFactory = createClient,
} = {}) {
  const url = String(env.SUPABASE_URL || "").trim();
  const secretKey = String(env.SUPABASE_SECRET_KEY || "").trim();
  if (!url || !secretKey) return { configured: false };
  const admin = clientFactory(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  async function rpc(name, params, fallbackMessage) {
    const result = await admin.rpc(name, params);
    const error = adapterError(result, fallbackMessage);
    if (error) throw error;
    return firstRecord(result.data) || result.data || {};
  }

  return {
    configured: true,
    joinWorker(input) {
      return rpc("join_early_access_worker_v2", {
        p_first_name: input.firstName,
        p_last_name: input.lastName,
        p_email_normalized: input.email,
        p_mobile_normalized: input.mobile,
        p_trade_key: input.tradeKey,
        p_trade: input.trade,
        p_role_key: input.roleKey,
        p_role: input.role,
        p_home_area: input.homeArea,
        p_issued_referral_code: input.issuedReferralCode,
        p_supplied_referral_code: input.suppliedReferralCode || null,
        p_cis_acknowledged: input.cisAcknowledged,
        p_referral_terms_version: input.referralTermsVersion,
        p_marketing_consent: input.marketingConsent,
        p_privacy_version: input.privacyVersion,
        p_utm_source: input.source.utmSource || null,
        p_utm_medium: input.source.utmMedium || null,
        p_utm_campaign: input.source.utmCampaign || null,
        p_utm_content: input.source.utmContent || null,
        p_landing_path: input.source.landingPath,
      }, "Early Access worker signup failed.");
    },
    joinCompany(input) {
      return rpc("join_early_access_company_v2", {
        p_company_name: input.companyName,
        p_first_name: input.firstName,
        p_last_name: input.lastName,
        p_email_normalized: input.email,
        p_mobile_normalized: input.mobile,
        p_labour_category_keys: input.labourCategoryKeys,
        p_labour_categories: input.labourCategories,
        p_operating_area: input.operatingArea,
        p_approximate_workers: input.approximateWorkers,
        p_note: input.note || null,
        p_issued_referral_code: input.issuedReferralCode,
        p_supplied_referral_code: input.suppliedReferralCode || null,
        p_company_acknowledged: input.companyReferralAcknowledged,
        p_referral_terms_version: input.referralTermsVersion,
        p_marketing_consent: input.marketingConsent,
        p_privacy_version: input.privacyVersion,
        p_utm_source: input.source.utmSource || null,
        p_utm_medium: input.source.utmMedium || null,
        p_utm_campaign: input.source.utmCampaign || null,
        p_utm_content: input.source.utmContent || null,
        p_landing_path: input.source.landingPath,
      }, "Early Access company signup failed.");
    },
    setEmailDeliveryStatus(signupId, status) {
      return rpc("set_early_access_email_delivery_status", {
        p_signup_id: signupId,
        p_status: status,
      }, "Early Access email status update failed.");
    },
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createResendEarlyAccessEmailProvider({
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const apiKey = String(env.RESEND_API_KEY || "").trim();
  const from = String(env.EARLY_ACCESS_FROM_EMAIL || "").trim();
  if (!apiKey || !from || typeof fetchImpl !== "function") return { configured: false };

  async function send({ to, subject, text, html }) {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
    });
    if (!response.ok) {
      throw new Error(`Early Access email delivery failed with status ${response.status}.`);
    }
  }

  return {
    configured: true,
    sendWorker(record, envForLinks = env) {
      const url = canonicalReferralUrl(record.referral_code, envForLinks);
      const firstName = escapeHtml(record.first_name);
      const referralCode = escapeHtml(record.referral_code);
      const safeUrl = escapeHtml(url);
      return send({
        to: record.email_normalized,
        subject: "You're registered for OnSite Early Access",
        text: `Hi ${record.first_name},

Your OnSite Early Access registration is confirmed.

We'll email you when profile setup opens.

Your referral code:
${record.referral_code}

Your personal referral link:
${url}

Share your link with CIS sub-contractors you know. When a referred sub-contractor completes 5 paid days through OnSite, you earn £50. When they reach 20 paid days, you earn another £50. They also earn £25 after completing their first 5 paid days.

You do not need to complete paid work through OnSite yourself. You must complete account setup and pass CIS verification before a referral reward can be paid. Registration alone does not qualify for a reward.

Keep this email so you can find your referral link later.

Reliable trades. On demand.

OnSite`,
        html: `<div style="background:#f5f5f2;color:#171717;font-family:Arial,sans-serif;padding:32px 16px">
          <div style="margin:0 auto;max-width:560px;background:#fff;border:1px solid #dedede;border-radius:10px;padding:32px">
            <p style="color:#f97316;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">OnSite Early Access</p>
            <p>Hi ${firstName},</p>
            <h1 style="font-size:24px;line-height:1.2;margin:0 0 16px">Your registration is confirmed.</h1>
            <p>We'll email you when profile setup opens.</p>
            <p style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">Your referral code</p>
            <p style="font-size:20px;font-weight:700;letter-spacing:.08em">${referralCode}</p>
            <p style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">Your personal referral link</p>
            <p><a href="${safeUrl}" style="color:#171717;overflow-wrap:anywhere">${safeUrl}</a></p>
            <p>Share your link with CIS sub-contractors you know. When a referred sub-contractor completes 5 paid days through OnSite, you earn £50. When they reach 20 paid days, you earn another £50. They also earn £25 after completing their first 5 paid days.</p>
            <p>You do not need to complete paid work through OnSite yourself. You must complete account setup and pass CIS verification before a referral reward can be paid. Registration alone does not qualify for a reward.</p>
            <p>Keep this email so you can find your referral link later.</p>
            <p style="font-weight:700;margin-top:28px">Reliable trades. On demand.<br />OnSite</p>
          </div>
        </div>`,
      });
    },
    sendCompany(record, envForLinks = env) {
      const url = canonicalReferralUrl(record.referral_code, envForLinks);
      const firstName = escapeHtml(record.first_name);
      const safeUrl = escapeHtml(url);
      const safeReferralCode = escapeHtml(record.referral_code);
      return send({
        to: record.email_normalized,
        subject: "You're registered for OnSite Early Access",
        text: `Hi ${record.first_name},

Your company is registered for OnSite Early Access.

We'll contact you when contractor onboarding opens.

Your contractor referral code:
${record.referral_code}

Your contractor referral link:
${url}

The referred contractor receives £100 OnSite credit towards its first qualifying labour booking. Your company receives £100 credit when the referred contractor completes 5 paid labour days through OnSite, and another £150 credit when it reaches 20 paid labour days.

Company verification is required before referral credit can be applied. OnSite credit is not cash and cannot be withdrawn. Registration alone earns no credit.

Reliable trades. On demand.

OnSite`,
        html: `<div style="background:#f5f5f2;color:#171717;font-family:Arial,sans-serif;padding:32px 16px">
          <div style="margin:0 auto;max-width:560px;background:#fff;border:1px solid #dedede;border-radius:10px;padding:32px">
            <p style="color:#f97316;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">OnSite Early Access</p>
            <p>Hi ${firstName},</p>
            <h1 style="font-size:24px;line-height:1.2;margin:0 0 16px">Your company is registered.</h1>
            <p>We'll contact you when contractor onboarding opens.</p>
            <p style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">Your contractor referral code</p>
            <p style="font-size:20px;font-weight:700;letter-spacing:.08em">${safeReferralCode}</p>
            <p style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">Your contractor referral link</p>
            <p><a href="${safeUrl}" style="color:#171717;overflow-wrap:anywhere">${safeUrl}</a></p>
            <p>The referred contractor receives £100 OnSite credit towards its first qualifying labour booking. Your company receives £100 credit when the referred contractor completes 5 paid labour days through OnSite, and another £150 credit when it reaches 20 paid labour days.</p>
            <p>Company verification is required before referral credit can be applied. OnSite credit is not cash and cannot be withdrawn. Registration alone earns no credit.</p>
            <p style="font-weight:700;margin-top:28px">Reliable trades. On demand.<br />OnSite</p>
          </div>
        </div>`,
      });
    },
  };
}

function isReferralCodeCollision(error) {
  const details = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return error?.code === "REFERRAL_CODE_COLLISION"
    || (error?.code === "23505" && details.includes("referral_code"));
}

function mapDatabaseError(error) {
  const detail = `${error?.details || ""} ${error?.message || ""}`;
  if (/INVALID_REFERRAL_CODE/i.test(detail)) {
    return new EarlyAccessServiceError(
      "That referral code was not recognised. Remove it to continue without a referral.",
      400,
      "INVALID_REFERRAL_CODE",
    );
  }
  if (/SELF_REFERRAL/i.test(detail)) {
    return new EarlyAccessServiceError(
      "You cannot use your own referral code.",
      400,
      "SELF_REFERRAL",
    );
  }
  return new EarlyAccessServiceError(
    "We could not complete your Early Access request. Please try again.",
    503,
    "EARLY_ACCESS_UNAVAILABLE",
  );
}

function createEarlyAccessService({
  adapter = createSupabaseEarlyAccessAdapter(),
  emailProvider = createResendEarlyAccessEmailProvider(),
  env = process.env,
  codeGenerator = referralCode,
} = {}) {
  async function setDeliveryStatus(signupId, status) {
    if (!signupId || typeof adapter.setEmailDeliveryStatus !== "function") return;
    try {
      await adapter.setEmailDeliveryStatus(signupId, status);
    } catch (_) {
      // Delivery status is operational metadata and must never invalidate a signup.
    }
  }

  async function sendConfirmation(type, record) {
    if (!record?.signup_id || record.created === false) return "not_sent";
    if (!emailProvider.configured) {
      await setDeliveryStatus(record.signup_id, "skipped");
      return "skipped";
    }
    try {
      if (type === "worker") await emailProvider.sendWorker(record, env);
      else await emailProvider.sendCompany(record, env);
      await setDeliveryStatus(record.signup_id, "sent");
      return "sent";
    } catch (_) {
      await setDeliveryStatus(record.signup_id, "failed");
      return "failed";
    }
  }

  function requireConfigured() {
    if (!adapter.configured) {
      throw new EarlyAccessServiceError(
        "Early Access is temporarily unavailable.",
        503,
        "EARLY_ACCESS_NOT_CONFIGURED",
      );
    }
  }

  return {
    configured: !!adapter.configured,
    async joinWorker(input) {
      requireConfigured();
      const normalized = normalizeWorkerInput(input);
      let record;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          record = await adapter.joinWorker({
            ...normalized,
            issuedReferralCode: codeGenerator("OSW"),
          });
          break;
        } catch (error) {
          if (isReferralCodeCollision(error) && attempt < 4) continue;
          throw mapDatabaseError(error);
        }
      }
      if (!record) {
        throw new EarlyAccessServiceError(
          "Early Access is temporarily unavailable.",
          503,
          "EARLY_ACCESS_UNAVAILABLE",
        );
      }
      const emailDeliveryStatus = await sendConfirmation("worker", record);
      const code = String(record.referral_code || "");
      return {
        ok: true,
        signupType: "worker",
        message: "Your Early Access place is confirmed.",
        foundingWorker: true,
        firstName: String(record.first_name || normalized.firstName),
        referralCode: code,
        referralUrl: canonicalReferralUrl(code, env),
        emailDeliveryStatus,
        referralProgress: {
          joinedCount: Math.max(0, Number(record.referred_count) || 0),
        },
      };
    },
    async joinCompany(input) {
      requireConfigured();
      const normalized = normalizeCompanyInput(input);
      let record;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          record = await adapter.joinCompany({
            ...normalized,
            issuedReferralCode: codeGenerator("OSC"),
          });
          break;
        } catch (error) {
          if (isReferralCodeCollision(error) && attempt < 4) continue;
          throw mapDatabaseError(error);
        }
      }
      if (!record) {
        throw new EarlyAccessServiceError(
          "Early Access is temporarily unavailable.",
          503,
          "EARLY_ACCESS_UNAVAILABLE",
        );
      }
      const emailDeliveryStatus = await sendConfirmation("company", record);
      const code = String(record.referral_code || "");
      return {
        ok: true,
        signupType: "company",
        message: "Your company Early Access place is confirmed.",
        companyName: String(record.company_name || normalized.companyName),
        firstName: String(record.first_name || normalized.firstName),
        referralCode: code,
        referralUrl: canonicalReferralUrl(code, env),
        emailDeliveryStatus,
      };
    },
  };
}

function earlyAccessClientKey(req, { env = process.env } = {}) {
  const peerAddress = String(req?.socket?.remoteAddress || "unknown").trim() || "unknown";
  const trustProxy = String(env.EARLY_ACCESS_TRUST_PROXY || "").trim().toLowerCase() === "true";
  if (!trustProxy) return peerAddress;

  const forwardedAddresses = String(req?.headers?.["x-forwarded-for"] || "")
    .split(",")
    .map((value) => value.trim());
  for (let index = forwardedAddresses.length - 1; index >= 0; index -= 1) {
    if (net.isIP(forwardedAddresses[index])) return forwardedAddresses[index];
  }
  return peerAddress;
}

function createEarlyAccessRateLimiter({
  maxRequests = 8,
  windowMs = 15 * 60 * 1000,
  maxEntries = 10_000,
} = {}) {
  const requestLimit = Number.isInteger(maxRequests) && maxRequests > 0 ? maxRequests : 8;
  const durationMs = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 15 * 60 * 1000;
  const entryLimit = Number.isInteger(maxEntries) && maxEntries > 0 ? maxEntries : 10_000;
  const entries = new Map();

  function retryAfterSeconds(expiresAt, now) {
    return Math.max(1, Math.ceil((expiresAt - now) / 1000));
  }

  function purgeExpired(now) {
    let earliestExpiry = Infinity;
    entries.forEach((entry, key) => {
      const expiresAt = entry.startedAt + durationMs;
      if (expiresAt <= now) entries.delete(key);
      else earliestExpiry = Math.min(earliestExpiry, expiresAt);
    });
    return earliestExpiry;
  }

  return {
    consume(key, now = Date.now()) {
      const safeKey = String(key || "unknown");
      const existing = entries.get(safeKey);
      if (existing && now - existing.startedAt < durationMs) {
        existing.count += 1;
        return {
          allowed: existing.count <= requestLimit,
          retryAfterSeconds: retryAfterSeconds(existing.startedAt + durationMs, now),
        };
      }
      if (existing) entries.delete(safeKey);

      if (entries.size >= entryLimit) {
        const earliestExpiry = purgeExpired(now);
        if (entries.size >= entryLimit) {
          return {
            allowed: false,
            retryAfterSeconds: retryAfterSeconds(earliestExpiry, now),
          };
        }
      }

      const entry = { startedAt: now, count: 0 };
      entry.count += 1;
      entries.set(safeKey, entry);
      return {
        allowed: entry.count <= requestLimit,
        retryAfterSeconds: retryAfterSeconds(entry.startedAt + durationMs, now),
      };
    },
    size() {
      return entries.size;
    },
  };
}

module.exports = {
  EarlyAccessAdapterError,
  EarlyAccessServiceError,
  PRIVACY_VERSION,
  REFERRAL_CODE_PATTERN,
  REFERRAL_CODE_PATTERNS,
  REFERRAL_TERMS_VERSION,
  canonicalReferralUrl,
  createEarlyAccessRateLimiter,
  createEarlyAccessService,
  createResendEarlyAccessEmailProvider,
  createSupabaseEarlyAccessAdapter,
  earlyAccessClientKey,
  normalizeCompanyInput,
  normalizeEmail,
  normalizeMobile,
  normalizeReferralCode,
  normalizeSource,
  normalizeWorkerInput,
  referralCode,
};
