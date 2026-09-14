"use strict";

const { createClient } = require("@supabase/supabase-js");

const ACCESS_COOKIE = "onsite_access_token";
const REFRESH_COOKIE = "onsite_refresh_token";
const COMPANY_ROLES = new Set(["administrator", "manager", "supervisor"]);

class AuthServiceError extends Error {
  constructor(message, statusCode = 400, code = "AUTH_ERROR") {
    super(message);
    this.name = "AuthServiceError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function cleanText(value, maxLength = 240) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanEmail(value) {
  const email = cleanText(value, 320).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthServiceError("Enter a valid email address.", 400, "INVALID_EMAIL");
  }
  return email;
}

function cleanPassword(value) {
  if (typeof value !== "string" || value.length < 8 || value.length > 200) {
    throw new AuthServiceError(
      "Password must be between 8 and 200 characters.",
      400,
      "INVALID_PASSWORD",
    );
  }
  return value;
}

function optionalNumber(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === "" || value == null) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return number;
}

function displayRole(role) {
  const normalized = cleanText(role, 40).toLowerCase();
  if (!COMPANY_ROLES.has(normalized)) return "";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function firstRecord(value) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function unwrapResult(result, fallbackMessage) {
  if (result?.error) {
    const status = Number(result.error.status || result.error.statusCode) || 400;
    throw new AuthServiceError(
      result.error.message || fallbackMessage,
      status === 400 ? 400 : status,
      result.error.code || "SUPABASE_ERROR",
    );
  }
  return result?.data ?? result;
}

function createSupabaseAuthAdapter({ env = process.env, clientFactory = createClient } = {}) {
  const url = cleanText(env.SUPABASE_URL, 500);
  const publishableKey = cleanText(env.SUPABASE_PUBLISHABLE_KEY, 5000);
  const secretKey = cleanText(env.SUPABASE_SECRET_KEY, 5000);
  const configured = !!(url && publishableKey && secretKey);

  if (!configured) {
    return { configured: false };
  }

  const commonOptions = {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
      flowType: "implicit",
    },
  };
  const publicClient = clientFactory(url, publishableKey, commonOptions);
  const admin = clientFactory(url, secretKey, commonOptions);
  const sessionClient = () => clientFactory(url, publishableKey, commonOptions);

  return {
    configured: true,

    async signUp({ email, password, metadata }) {
      return unwrapResult(
        await publicClient.auth.signUp({ email, password, options: { data: metadata } }),
        "Account registration failed.",
      );
    },

    async signInWithPassword({ email, password }) {
      return unwrapResult(
        await publicClient.auth.signInWithPassword({ email, password }),
        "Sign in failed.",
      );
    },

    async getUser(accessToken) {
      const data = unwrapResult(
        await publicClient.auth.getUser(accessToken),
        "The authenticated session is invalid.",
      );
      return data?.user || null;
    },

    async refreshSession(refreshToken) {
      return unwrapResult(
        await publicClient.auth.refreshSession({ refresh_token: refreshToken }),
        "The authenticated session has expired.",
      );
    },

    async signOut(accessToken, refreshToken) {
      if (!accessToken) return;
      if (typeof admin.auth.admin.signOut === "function") {
        const result = await admin.auth.admin.signOut(accessToken, "global");
        if (!result?.error) return;
      }
      if (!refreshToken) return;
      const client = sessionClient();
      const sessionResult = await client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (!sessionResult.error) await client.auth.signOut({ scope: "global" });
    },

    async requestPasswordReset(email, redirectTo) {
      return unwrapResult(
        await publicClient.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined),
        "Password recovery could not be started.",
      );
    },

    async resetPassword({ accessToken, refreshToken, password }) {
      const client = sessionClient();
      unwrapResult(
        await client.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        }),
        "The password recovery session is invalid.",
      );
      return unwrapResult(
        await client.auth.updateUser({ password }),
        "Password reset failed.",
      );
    },

    async deleteAuthUser(userId) {
      return unwrapResult(
        await admin.auth.admin.deleteUser(userId),
        "Account rollback failed.",
      );
    },

    async createWorkerIdentity(userId, profile) {
      return unwrapResult(
        await admin.rpc("create_worker_identity", {
          p_user_id: userId,
          p_name: profile.name,
          p_contact_email: profile.email,
          p_phone: profile.phone,
          p_trade: profile.trade,
          p_trade_key: profile.tradeKey,
          p_specialism: profile.specialism,
          p_role_key: profile.roleKey,
          p_grade: profile.grade,
          p_years_experience: profile.yearsExperience,
          p_location: profile.location,
          p_location_data: profile.locationData,
          p_profile_photo_reference: profile.profilePhotoReference,
          p_availability_status: profile.availabilityStatus,
          p_private_minimum_day_rate: profile.minimumDayRate,
          p_travel_radius_miles: profile.travelRadiusMiles,
          p_travel_further_with_accommodation: profile.travelFurtherWithAccommodation,
          p_weekend_preferences: profile.weekendPreferences,
          p_referral_code: profile.referralCode,
        }),
        "Worker profile creation failed.",
      );
    },

    async createCompanyIdentity(userId, company) {
      return unwrapResult(
        await admin.rpc("create_company_identity", {
          p_user_id: userId,
          p_name: company.name,
          p_company_number: company.companyNumber,
          p_vat_number: company.vatNumber,
          p_vat_registered: company.vatRegistered,
          p_phone: company.phone,
          p_address: company.address,
          p_payment_contact: company.paymentContact,
          p_accounts_email: company.accountsEmail,
        }),
        "Company creation failed.",
      );
    },

    async getWorkerProfileByUserId(userId) {
      const result = await admin
        .from("worker_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      return unwrapResult(result, "Worker profile lookup failed.");
    },

    async getCompanyMembershipsByUserId(userId) {
      const result = await admin
        .from("company_memberships")
        .select("user_id, company_id, role, status, created_at, companies(*)")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("created_at", { ascending: true });
      return unwrapResult(result, "Company membership lookup failed.") || [];
    },

    async updateWorkerProfile(workerId, changes) {
      const result = await admin
        .from("worker_profiles")
        .update(changes)
        .eq("id", workerId)
        .select("*")
        .single();
      return unwrapResult(result, "Worker profile update failed.");
    },
  };
}

function normalizeWorkerPrincipal(authUser, profile) {
  return {
    authUserId: authUser.id,
    id: profile.id,
    workerId: profile.id,
    type: "worker",
    name: profile.name || authUser.user_metadata?.full_name || "Worker",
    email: authUser.email || profile.contact_email || "",
    phone: profile.phone || "",
    trade: profile.trade || "",
    tradeKey: profile.trade_key || "",
    specialism: profile.specialism || "",
    roleKey: profile.role_key || "",
    grade: profile.grade || profile.specialism || "",
    yearsExp: profile.years_experience ?? "",
    location: profile.location || "",
    locationData: profile.location_data || null,
    profilePhoto: profile.profile_photo_reference || "",
    availability: profile.availability_status || "available",
    nextAvailableDate: profile.next_available_date || "",
    minRate: profile.private_minimum_day_rate ?? undefined,
    travelRadiusMiles: profile.travel_radius_miles ?? 15,
    travelFurtherWithAccommodation: !!profile.travel_further_with_accommodation,
    weekendPreferences: profile.weekend_preferences || {
      saturday: false,
      sunday: false,
      weekendOnly: false,
    },
    foundingWorker: !!profile.founding_worker,
    verificationStatus: profile.status || "pending",
    serverAuthenticated: true,
  };
}

function normalizeCompanyPrincipal(authUser, membership) {
  const company = firstRecord(membership.companies) || membership.company || {};
  const role = displayRole(membership.role);
  if (!role || membership.status !== "active" || !company.id) {
    throw new AuthServiceError(
      "No active company membership is available for this account.",
      403,
      "COMPANY_MEMBERSHIP_REQUIRED",
    );
  }
  return {
    authUserId: authUser.id,
    id: company.id,
    companyId: company.id,
    type: "company",
    name: authUser.user_metadata?.full_name || authUser.email || "Company user",
    email: authUser.email || "",
    phone: authUser.user_metadata?.phone || company.phone || "",
    companyName: company.name || "Company",
    companyNumber: company.company_number || "",
    regNumber: company.company_number || "",
    vatNumber: company.vat_number || "",
    vatRegistered: !!company.vat_registered,
    address: company.address || "",
    paymentContact: company.payment_contact || "",
    accountsEmail: company.accounts_email || "",
    permissionRole: role,
    companyRole: role,
    membershipStatus: membership.status,
    verificationStatus: company.status || "pending",
    companyVerificationStatus: company.status || "pending",
    serverAuthenticated: true,
  };
}

function createAuthService({ adapter, env = process.env } = {}) {
  const authAdapter = adapter || createSupabaseAuthAdapter({ env });
  const configured = !!authAdapter.configured;

  function requireConfigured() {
    if (!configured) {
      throw new AuthServiceError(
        "Server authentication is not configured.",
        503,
        "AUTH_NOT_CONFIGURED",
      );
    }
  }

  async function resolvePrincipal(authUser) {
    requireConfigured();
    if (!authUser?.id) {
      throw new AuthServiceError("Authentication is required.", 401, "UNAUTHENTICATED");
    }

    const workerProfile = await authAdapter.getWorkerProfileByUserId(authUser.id);
    const memberships = (await authAdapter.getCompanyMembershipsByUserId(authUser.id))
      .filter((membership) =>
        membership?.user_id === authUser.id && membership.status === "active",
      );

    if (workerProfile && memberships.length) {
      throw new AuthServiceError(
        "This account has conflicting OnSite identities.",
        409,
        "IDENTITY_CONFLICT",
      );
    }
    if (workerProfile) return normalizeWorkerPrincipal(authUser, workerProfile);
    if (memberships.length) return normalizeCompanyPrincipal(authUser, memberships[0]);
    throw new AuthServiceError(
      "This account does not have an OnSite profile.",
      403,
      "PROFILE_REQUIRED",
    );
  }

  async function rollbackAuthUser(userId) {
    if (!userId || typeof authAdapter.deleteAuthUser !== "function") return;
    try {
      await authAdapter.deleteAuthUser(userId);
    } catch (error) {
      console.error("[Auth] Could not roll back incomplete registration:", error.message);
    }
  }

  const service = {
    configured,

    async registerWorker(input = {}) {
      requireConfigured();
      const email = cleanEmail(input.email);
      const password = cleanPassword(input.password);
      const name = cleanText(input.name, 160);
      if (!name) throw new AuthServiceError("Full name is required.");
      const minimumDayRate = optionalNumber(input.minimumDayRate, { min: 1, max: 100000 });
      if (!minimumDayRate) throw new AuthServiceError("Enter a valid minimum day rate.");
      const profile = {
        name,
        email,
        phone: cleanText(input.phone, 60),
        trade: cleanText(input.trade, 120),
        tradeKey: cleanText(input.tradeKey, 120),
        specialism: cleanText(input.specialism, 160),
        roleKey: cleanText(input.roleKey, 160),
        grade: cleanText(input.grade || input.specialism, 160),
        yearsExperience: optionalNumber(input.yearsExperience, { min: 0, max: 80 }),
        location: cleanText(input.location, 300),
        locationData: input.locationData && typeof input.locationData === "object"
          ? input.locationData
          : null,
        profilePhotoReference: cleanText(input.profilePhotoReference, 1000),
        availabilityStatus: cleanText(input.availabilityStatus, 40) || "available",
        minimumDayRate,
        travelRadiusMiles: optionalNumber(input.travelRadiusMiles, { min: 1, max: 1000 }) || 15,
        travelFurtherWithAccommodation: !!input.travelFurtherWithAccommodation,
        weekendPreferences: input.weekendPreferences && typeof input.weekendPreferences === "object"
          ? input.weekendPreferences
          : { saturday: false, sunday: false, weekendOnly: false },
        referralCode: cleanText(input.referralCode, 80).toUpperCase(),
      };
      if (!profile.phone || !profile.trade || !profile.specialism || !profile.location) {
        throw new AuthServiceError("Complete all required worker details.");
      }

      const auth = await authAdapter.signUp({
        email,
        password,
        metadata: { account_type: "worker", full_name: name, phone: profile.phone },
      });
      if (!auth?.user?.id) throw new AuthServiceError("Worker account creation failed.");
      try {
        await authAdapter.createWorkerIdentity(auth.user.id, profile);
        const principal = await resolvePrincipal(auth.user);
        return {
          principal,
          session: auth.session || null,
          requiresEmailConfirmation: !auth.session,
        };
      } catch (error) {
        await rollbackAuthUser(auth.user.id);
        throw error;
      }
    },

    async registerCompany(input = {}) {
      requireConfigured();
      const email = cleanEmail(input.email);
      const password = cleanPassword(input.password);
      const company = {
        name: cleanText(input.companyName, 200),
        companyNumber: cleanText(input.companyNumber, 80),
        vatNumber: cleanText(input.vatNumber, 80),
        vatRegistered: !!input.vatRegistered,
        phone: cleanText(input.phone, 60),
        address: cleanText(input.address, 500),
        paymentContact: cleanText(input.paymentContact, 160),
        accountsEmail: input.accountsEmail ? cleanEmail(input.accountsEmail) : "",
      };
      const name = cleanText(input.name, 160);
      if (!company.name || !name || !company.phone) {
        throw new AuthServiceError("Complete all required company details.");
      }
      const auth = await authAdapter.signUp({
        email,
        password,
        metadata: { account_type: "company", full_name: name, phone: company.phone },
      });
      if (!auth?.user?.id) throw new AuthServiceError("Company account creation failed.");
      try {
        await authAdapter.createCompanyIdentity(auth.user.id, company);
        const principal = await resolvePrincipal(auth.user);
        return {
          principal,
          session: auth.session || null,
          requiresEmailConfirmation: !auth.session,
        };
      } catch (error) {
        await rollbackAuthUser(auth.user.id);
        throw error;
      }
    },

    async login(input = {}) {
      requireConfigured();
      const auth = await authAdapter.signInWithPassword({
        email: cleanEmail(input.email),
        password: cleanPassword(input.password),
      });
      if (!auth?.user || !auth?.session) {
        throw new AuthServiceError("Incorrect email or password.", 401, "INVALID_LOGIN");
      }
      return { principal: await resolvePrincipal(auth.user), session: auth.session };
    },

    async restoreSession({ accessToken, refreshToken } = {}) {
      requireConfigured();
      let session = null;
      let user = null;
      if (accessToken) {
        try {
          user = await authAdapter.getUser(accessToken);
        } catch (_) {}
      }
      if (!user && refreshToken) {
        const refreshed = await authAdapter.refreshSession(refreshToken);
        session = refreshed?.session || null;
        user = refreshed?.user || session?.user || null;
        if (!user && session?.access_token) user = await authAdapter.getUser(session.access_token);
      }
      if (!user) {
        throw new AuthServiceError("Authentication is required.", 401, "UNAUTHENTICATED");
      }
      return { principal: await resolvePrincipal(user), session };
    },

    async logout({ accessToken, refreshToken } = {}) {
      requireConfigured();
      await authAdapter.signOut(accessToken, refreshToken);
      return { ok: true };
    },

    async requestPasswordReset(input = {}) {
      requireConfigured();
      const email = cleanEmail(input.email);
      const configuredRedirect = cleanText(env.SUPABASE_AUTH_REDIRECT_URL, 1000);
      await authAdapter.requestPasswordReset(email, configuredRedirect || undefined);
      return { ok: true };
    },

    async adoptSession({ accessToken, refreshToken } = {}) {
      requireConfigured();
      if (!accessToken || !refreshToken) {
        throw new AuthServiceError("The password recovery link is invalid or expired.", 401);
      }
      const user = await authAdapter.getUser(accessToken);
      return {
        principal: await resolvePrincipal(user),
        session: { access_token: accessToken, refresh_token: refreshToken },
      };
    },

    async resetPassword({ accessToken, refreshToken, password } = {}) {
      requireConfigured();
      cleanPassword(password);
      if (!accessToken || !refreshToken) {
        throw new AuthServiceError("The password recovery session has expired.", 401);
      }
      await authAdapter.resetPassword({ accessToken, refreshToken, password });
      return { ok: true };
    },

    async updateWorkerProfile({ accessToken, refreshToken, changes = {} } = {}) {
      const restored = await service.restoreSession({ accessToken, refreshToken });
      if (restored.principal.type !== "worker") {
        throw new AuthServiceError("Only workers can update this profile.", 403);
      }
      const update = {};
      if (Object.hasOwn(changes, "minimumDayRate")) {
        const minimum = optionalNumber(changes.minimumDayRate, { min: 1, max: 100000 });
        if (!minimum) throw new AuthServiceError("Enter a valid minimum day rate.");
        update.private_minimum_day_rate = minimum;
      }
      if (Object.hasOwn(changes, "availabilityStatus")) {
        const availability = cleanText(changes.availabilityStatus, 40).toLowerCase();
        if (!new Set(["available", "not available"]).has(availability)) {
          throw new AuthServiceError("Choose a valid availability status.");
        }
        update.availability_status = availability;
      }
      if (Object.hasOwn(changes, "nextAvailableDate")) {
        const date = cleanText(changes.nextAvailableDate, 10);
        if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          throw new AuthServiceError("Choose a valid next available date.");
        }
        update.next_available_date = date || null;
      }
      if (!Object.keys(update).length) {
        throw new AuthServiceError("No supported profile changes were provided.");
      }
      const profile = await authAdapter.updateWorkerProfile(
        restored.principal.workerId,
        update,
      );
      return {
        principal: normalizeWorkerPrincipal(
          {
            id: restored.principal.authUserId,
            email: restored.principal.email,
            user_metadata: { full_name: restored.principal.name },
          },
          profile,
        ),
        session: restored.session,
      };
    },

    resolvePrincipal,
  };
  return service;
}

function parseCookies(header = "") {
  return String(header)
    .split(";")
    .reduce((cookies, part) => {
      const index = part.indexOf("=");
      if (index < 0) return cookies;
      const key = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      if (!key) return cookies;
      try {
        cookies[key] = decodeURIComponent(value);
      } catch (_) {
        cookies[key] = value;
      }
      return cookies;
    }, {});
}

function authTokensFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const authorization = String(req.headers.authorization || "");
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  return {
    accessToken: bearer || cookies[ACCESS_COOKIE] || "",
    refreshToken: cookies[REFRESH_COOKIE] || "",
  };
}

function requestIsSecure(req) {
  return process.env.NODE_ENV === "production" ||
    String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
}

function cookieValue(name, value, { maxAge, secure }) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function sessionCookies(req, session) {
  if (!session?.access_token || !session?.refresh_token) return [];
  const secure = requestIsSecure(req);
  return [
    cookieValue(ACCESS_COOKIE, session.access_token, {
      maxAge: Number(session.expires_in) || 3600,
      secure,
    }),
    cookieValue(REFRESH_COOKIE, session.refresh_token, {
      maxAge: 60 * 60 * 24 * 30,
      secure,
    }),
  ];
}

function clearSessionCookies(req) {
  const secure = requestIsSecure(req);
  return [
    cookieValue(ACCESS_COOKIE, "", { maxAge: 0, secure }),
    cookieValue(REFRESH_COOKIE, "", { maxAge: 0, secure }),
  ];
}

module.exports = {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  AuthServiceError,
  authTokensFromRequest,
  clearSessionCookies,
  createAuthService,
  createSupabaseAuthAdapter,
  normalizeCompanyPrincipal,
  normalizeWorkerPrincipal,
  parseCookies,
  sessionCookies,
};
