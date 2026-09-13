(function initWorkerReferrals(globalScope) {
  "use strict";

  const PROGRAMME_VERSION = 1;
  const PROGRAMME_PHASES = Object.freeze({
    PRELAUNCH: "prelaunch",
    LIVE: "live",
  });
  const REFERRAL_STATUSES = Object.freeze({
    INVITED: "invited",
    JOINED_EARLY_ACCESS: "joined_early_access",
    JOINED: "joined",
    PROFILE_COMPLETED: "profile_completed",
    STARTED_WORK: "started_work",
    FIVE_PAID_DAYS: "five_paid_days",
    TWENTY_PAID_DAYS: "twenty_paid_days",
  });
  const REWARD_STATUSES = Object.freeze({
    POTENTIAL: "potential",
    PENDING: "pending",
    EARNED: "earned",
    CREDITED: "credited",
  });
  const REWARD_DEFINITIONS = Object.freeze({
    referrerFivePaidDays: Object.freeze({
      beneficiary: "referrer",
      amountPence: 5000,
      paidDayThreshold: 5,
    }),
    referrerTwentyPaidDays: Object.freeze({
      beneficiary: "referrer",
      amountPence: 5000,
      paidDayThreshold: 20,
    }),
    referredFivePaidDays: Object.freeze({
      beneficiary: "referred",
      amountPence: 2500,
      paidDayThreshold: 5,
    }),
  });
  const INVITE_DEDUPE_WINDOW_MS = 60000;

  function cleanId(value) {
    return String(value || "").trim();
  }

  function isoTimestamp(value) {
    if (value == null || value === "") return "";
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
  }

  function phaseValue(value) {
    return value === PROGRAMME_PHASES.LIVE
      ? PROGRAMME_PHASES.LIVE
      : PROGRAMME_PHASES.PRELAUNCH;
  }

  function hashCode(value, seed) {
    let hash = seed >>> 0;
    const input = String(value || "");
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function referralCodeForSeed(seed) {
    const stableSeed = cleanId(seed);
    if (!stableSeed) return "";
    const left = hashCode(stableSeed, 2166136261).toString(36).toUpperCase();
    const right = hashCode(stableSeed.split("").reverse().join(""), 2246822519)
      .toString(36)
      .toUpperCase();
    return `OSW-${`${left}${right}`.padStart(12, "0").slice(0, 12)}`;
  }

  function normalizeReferralCode(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
  }

  function workerIdentitySeed(worker) {
    return cleanId(worker?.identityId || worker?.id || worker?.userAccountId);
  }

  function ensureWorkerReferralCode(worker, workers = []) {
    if (!worker || !cleanId(worker.id || worker.userAccountId)) return "";
    const existing = normalizeReferralCode(worker.referralCode);
    if (existing) {
      worker.referralCode = existing;
      return existing;
    }
    const identityId = cleanId(worker.identityId);
    const identityCode = identityId
      ? workers.find(
          (candidate) =>
            candidate !== worker &&
            cleanId(candidate?.identityId) === identityId &&
            normalizeReferralCode(candidate?.referralCode),
        )?.referralCode
      : "";
    const code =
      normalizeReferralCode(identityCode) || referralCodeForSeed(workerIdentitySeed(worker));
    worker.referralCode = code;
    return code;
  }

  function defaultReward(key, referral, phase) {
    const definition = REWARD_DEFINITIONS[key];
    const beneficiaryWorkerId =
      definition.beneficiary === "referrer"
        ? referral.referrerWorkerId
        : referral.referredWorkerId;
    return {
      rewardKey: key,
      beneficiaryWorkerId,
      amountPence: definition.amountPence,
      paidDayThreshold: definition.paidDayThreshold,
      status:
        phaseValue(phase) === PROGRAMME_PHASES.PRELAUNCH
          ? REWARD_STATUSES.POTENTIAL
          : REWARD_STATUSES.PENDING,
      qualifiedAt: "",
      earnedAt: "",
      creditedAt: "",
    };
  }

  function normalizeReward(reward, key, referral, phase) {
    const base = defaultReward(key, referral, phase);
    const creditedAt = isoTimestamp(reward?.creditedAt);
    const earnedAt = isoTimestamp(reward?.earnedAt || reward?.qualifiedAt);
    return {
      ...base,
      ...(reward && typeof reward === "object" ? reward : {}),
      rewardKey: key,
      beneficiaryWorkerId: base.beneficiaryWorkerId,
      amountPence: base.amountPence,
      paidDayThreshold: base.paidDayThreshold,
      status: creditedAt
        ? REWARD_STATUSES.CREDITED
        : earnedAt
          ? REWARD_STATUSES.EARNED
          : [REWARD_STATUSES.POTENTIAL, REWARD_STATUSES.PENDING].includes(
                reward?.status,
              )
            ? reward.status
            : base.status,
      qualifiedAt: isoTimestamp(reward?.qualifiedAt || earnedAt),
      earnedAt,
      creditedAt,
    };
  }

  function normalizeReferral(record, phase) {
    if (!record || typeof record !== "object") return null;
    const referrerWorkerId = cleanId(record.referrerWorkerId);
    const referredWorkerId = cleanId(record.referredWorkerId);
    if (!referrerWorkerId || !referredWorkerId) return null;
    const joinedAt =
      isoTimestamp(record.joinedAt || record.createdAt) || new Date(0).toISOString();
    const programmePhaseAtJoin = phaseValue(record.programmePhaseAtJoin);
    const normalized = {
      id: cleanId(record.id) || `worker-referral:${referrerWorkerId}:${referredWorkerId}`,
      referrerWorkerId,
      referredWorkerId,
      referralCode: normalizeReferralCode(record.referralCode),
      invitationId: cleanId(record.invitationId),
      createdAt: isoTimestamp(record.createdAt || joinedAt) || joinedAt,
      joinedAt,
      programmePhaseAtJoin,
      foundingWorker:
        record.foundingWorker == null
          ? programmePhaseAtJoin === PROGRAMME_PHASES.PRELAUNCH
          : !!record.foundingWorker,
      status:
        record.status ||
        (programmePhaseAtJoin === PROGRAMME_PHASES.PRELAUNCH
          ? REFERRAL_STATUSES.JOINED_EARLY_ACCESS
          : REFERRAL_STATUSES.JOINED),
      milestones: {
        joinedAt,
        profileCompletedAt: isoTimestamp(record.milestones?.profileCompletedAt),
        startedWorkAt: isoTimestamp(record.milestones?.startedWorkAt),
        paidDayCount: Math.max(0, Math.floor(Number(record.milestones?.paidDayCount) || 0)),
        fivePaidDaysAt: isoTimestamp(record.milestones?.fivePaidDaysAt),
        twentyPaidDaysAt: isoTimestamp(record.milestones?.twentyPaidDaysAt),
      },
      rewards: {},
    };
    Object.keys(REWARD_DEFINITIONS).forEach((key) => {
      normalized.rewards[key] = normalizeReward(
        record.rewards?.[key],
        key,
        normalized,
        phase,
      );
    });
    return normalized;
  }

  function normalizeInvite(invite) {
    if (!invite || typeof invite !== "object") return null;
    const referrerWorkerId = cleanId(invite.referrerWorkerId);
    if (!referrerWorkerId) return null;
    const invitedAt =
      isoTimestamp(invite.invitedAt || invite.createdAt) || new Date(0).toISOString();
    return {
      id: cleanId(invite.id) || `worker-referral-invite:${referrerWorkerId}:${invitedAt}`,
      referrerWorkerId,
      referralCode: normalizeReferralCode(invite.referralCode),
      status: invite.status === "joined" ? "joined" : REFERRAL_STATUSES.INVITED,
      channel: ["share", "copy_link"].includes(invite.channel)
        ? invite.channel
        : "share",
      invitedAt,
      joinedAt: isoTimestamp(invite.joinedAt),
      referredWorkerId: cleanId(invite.referredWorkerId),
    };
  }

  function ensureReferralState(state, workers = [], options = {}) {
    if (!state || typeof state !== "object") return state;
    const configuredPhase = phaseValue(
      options.phase || state.workerReferralProgramme?.phase,
    );
    state.workerReferralProgramme = {
      version: PROGRAMME_VERSION,
      phase: configuredPhase,
      launchAt: isoTimestamp(state.workerReferralProgramme?.launchAt),
    };
    if (!Array.isArray(state.workerReferralInvites)) state.workerReferralInvites = [];
    if (!Array.isArray(state.workerReferrals)) state.workerReferrals = [];
    workers.forEach((worker) => ensureWorkerReferralCode(worker, workers));
    state.workerReferralInvites = state.workerReferralInvites
      .map(normalizeInvite)
      .filter(Boolean)
      .filter(
        (invite, index, list) =>
          list.findIndex((candidate) => candidate.id === invite.id) === index,
      );
    const seenReferredWorkers = new Set();
    state.workerReferrals = state.workerReferrals
      .map((record) => normalizeReferral(record, configuredPhase))
      .filter(Boolean)
      .sort((left, right) => left.joinedAt.localeCompare(right.joinedAt))
      .filter((record) => {
        if (seenReferredWorkers.has(record.referredWorkerId)) return false;
        seenReferredWorkers.add(record.referredWorkerId);
        return true;
      });
    return state;
  }

  function findReferrerByCode(workers, code) {
    const normalizedCode = normalizeReferralCode(code);
    if (!normalizedCode) return null;
    return (
      workers.find(
        (worker) =>
          normalizeReferralCode(ensureWorkerReferralCode(worker, workers)) ===
          normalizedCode,
      ) || null
    );
  }

  function validateReferralCode(state, workers, code) {
    ensureReferralState(state, workers);
    const normalizedCode = normalizeReferralCode(code);
    if (!normalizedCode) return { ok: true, empty: true, code: "" };
    const referrer = findReferrerByCode(workers, normalizedCode);
    return referrer
      ? { ok: true, code: normalizedCode, referrerWorkerId: cleanId(referrer.id) }
      : { ok: false, code: normalizedCode, reason: "Referral code not recognised" };
  }

  function sameWorkerIdentity(left, right) {
    const leftId = cleanId(left?.id || left?.userAccountId);
    const rightId = cleanId(right?.id || right?.userAccountId);
    if (leftId && rightId && leftId === rightId) return true;
    const leftIdentity = cleanId(left?.identityId);
    const rightIdentity = cleanId(right?.identityId);
    return !!leftIdentity && leftIdentity === rightIdentity;
  }

  function attributeReferral(state, workers, referredWorker, code, options = {}) {
    ensureReferralState(state, workers, options);
    const referredWorkerId = cleanId(referredWorker?.id || referredWorker?.userAccountId);
    const normalizedCode = normalizeReferralCode(code);
    if (!referredWorkerId || !normalizedCode) {
      return { ok: false, reason: "A worker and valid referral code are required" };
    }
    const existing = state.workerReferrals.find(
      (record) => record.referredWorkerId === referredWorkerId,
    );
    if (existing) {
      const sameCode = existing.referralCode === normalizedCode;
      return sameCode
        ? { ok: true, duplicate: true, referral: existing }
        : {
            ok: false,
            reason: "This worker already has a referral attribution",
            referral: existing,
          };
    }
    const referrer = findReferrerByCode(workers, normalizedCode);
    if (!referrer) return { ok: false, reason: "Referral code not recognised" };
    if (sameWorkerIdentity(referrer, referredWorker)) {
      return { ok: false, reason: "Workers cannot refer themselves" };
    }
    const now = isoTimestamp(options.now) || new Date().toISOString();
    const phase = phaseValue(
      options.phase || state.workerReferralProgramme?.phase,
    );
    const pendingInvite = state.workerReferralInvites.find(
      (invite) =>
        invite.referrerWorkerId === cleanId(referrer.id) &&
        invite.referralCode === normalizedCode &&
        invite.status === REFERRAL_STATUSES.INVITED,
    );
    const referral = normalizeReferral(
      {
        id: `worker-referral:${cleanId(referrer.id)}:${referredWorkerId}`,
        referrerWorkerId: cleanId(referrer.id),
        referredWorkerId,
        referralCode: normalizedCode,
        invitationId: pendingInvite?.id || "",
        createdAt: pendingInvite?.invitedAt || now,
        joinedAt: now,
        programmePhaseAtJoin: phase,
        foundingWorker: phase === PROGRAMME_PHASES.PRELAUNCH,
        status:
          phase === PROGRAMME_PHASES.PRELAUNCH
            ? REFERRAL_STATUSES.JOINED_EARLY_ACCESS
            : REFERRAL_STATUSES.JOINED,
      },
      phase,
    );
    state.workerReferrals.push(referral);
    if (pendingInvite) {
      pendingInvite.status = "joined";
      pendingInvite.joinedAt = now;
      pendingInvite.referredWorkerId = referredWorkerId;
    }
    referredWorker.foundingWorker = referral.foundingWorker;
    return { ok: true, duplicate: false, referral, referrer };
  }

  function recordInvitation(state, workers, referrerWorker, options = {}) {
    ensureReferralState(state, workers, options);
    const referrerWorkerId = cleanId(
      referrerWorker?.id || referrerWorker?.userAccountId,
    );
    if (!referrerWorkerId) return { ok: false, reason: "Worker not found" };
    const referralCode = ensureWorkerReferralCode(referrerWorker, workers);
    const now = isoTimestamp(options.now) || new Date().toISOString();
    const nowMs = new Date(now).getTime();
    const channel = options.channel === "copy_link" ? "copy_link" : "share";
    const duplicate = state.workerReferralInvites.find(
      (invite) =>
        invite.referrerWorkerId === referrerWorkerId &&
        invite.channel === channel &&
        Math.abs(nowMs - new Date(invite.invitedAt).getTime()) <
          INVITE_DEDUPE_WINDOW_MS,
    );
    if (duplicate) return { ok: true, duplicate: true, invitation: duplicate };
    const invitation = normalizeInvite({
      id: `worker-referral-invite:${referrerWorkerId}:${nowMs}`,
      referrerWorkerId,
      referralCode,
      status: REFERRAL_STATUSES.INVITED,
      channel,
      invitedAt: now,
    });
    state.workerReferralInvites.push(invitation);
    return { ok: true, duplicate: false, invitation };
  }

  function updateReward(reward, paidDayCount, phase, now) {
    if (reward.creditedAt) {
      reward.status = REWARD_STATUSES.CREDITED;
      return;
    }
    if (reward.earnedAt) {
      reward.status = REWARD_STATUSES.EARNED;
      return;
    }
    if (
      phase === PROGRAMME_PHASES.LIVE &&
      paidDayCount >= reward.paidDayThreshold
    ) {
      reward.status = REWARD_STATUSES.EARNED;
      reward.qualifiedAt = reward.qualifiedAt || now;
      reward.earnedAt = reward.earnedAt || now;
      return;
    }
    reward.status =
      phase === PROGRAMME_PHASES.PRELAUNCH
        ? REWARD_STATUSES.POTENTIAL
        : REWARD_STATUSES.PENDING;
  }

  function syncReferralProgress(record, evidence = {}, options = {}) {
    if (!record) return null;
    const phase = phaseValue(options.phase);
    const now = isoTimestamp(options.now) || new Date().toISOString();
    const profileCompletedAt = isoTimestamp(evidence.profileCompletedAt);
    const startedWorkAt = isoTimestamp(evidence.startedWorkAt);
    const paidDayCount = Math.max(
      record.milestones.paidDayCount,
      Math.floor(Number(evidence.paidDayCount) || 0),
    );
    if ((evidence.profileCompleted || profileCompletedAt) && !record.milestones.profileCompletedAt) {
      record.milestones.profileCompletedAt = profileCompletedAt || now;
    }
    if ((evidence.startedWork || startedWorkAt) && !record.milestones.startedWorkAt) {
      record.milestones.startedWorkAt = startedWorkAt || now;
    }
    record.milestones.paidDayCount = paidDayCount;
    if (paidDayCount >= 5 && !record.milestones.fivePaidDaysAt) {
      record.milestones.fivePaidDaysAt = now;
    }
    if (paidDayCount >= 20 && !record.milestones.twentyPaidDaysAt) {
      record.milestones.twentyPaidDaysAt = now;
    }
    Object.values(record.rewards).forEach((reward) =>
      updateReward(reward, paidDayCount, phase, now),
    );
    if (phase === PROGRAMME_PHASES.PRELAUNCH) {
      record.status = REFERRAL_STATUSES.JOINED_EARLY_ACCESS;
    } else if (paidDayCount >= 20) {
      record.status = REFERRAL_STATUSES.TWENTY_PAID_DAYS;
    } else if (paidDayCount >= 5) {
      record.status = REFERRAL_STATUSES.FIVE_PAID_DAYS;
    } else if (record.milestones.startedWorkAt) {
      record.status = REFERRAL_STATUSES.STARTED_WORK;
    } else if (record.milestones.profileCompletedAt) {
      record.status = REFERRAL_STATUSES.PROFILE_COMPLETED;
    } else {
      record.status = REFERRAL_STATUSES.JOINED;
    }
    return record;
  }

  function syncAllReferralProgress(state, workers, evidenceForWorker, options = {}) {
    ensureReferralState(state, workers, options);
    const before = JSON.stringify(state.workerReferrals);
    state.workerReferrals.forEach((record) => {
      const evidence =
        typeof evidenceForWorker === "function"
          ? evidenceForWorker(record.referredWorkerId, record) || {}
          : {};
      syncReferralProgress(record, evidence, {
        phase: state.workerReferralProgramme.phase,
        now: options.now,
      });
    });
    return {
      changed: before !== JSON.stringify(state.workerReferrals),
      referrals: state.workerReferrals,
    };
  }

  function referralSummary(state, workerIds, options = {}) {
    const ids = new Set((Array.isArray(workerIds) ? workerIds : [workerIds]).map(cleanId));
    const referrals = (state?.workerReferrals || []).filter((record) =>
      ids.has(cleanId(record.referrerWorkerId)),
    );
    const invitations = (state?.workerReferralInvites || []).filter((invite) =>
      ids.has(cleanId(invite.referrerWorkerId)),
    );
    const programmePhase = phaseValue(
      options.phase || state?.workerReferralProgramme?.phase,
    );
    const joinedEarlyAccess = referrals.filter(
      (record) => record.programmePhaseAtJoin === PROGRAMME_PHASES.PRELAUNCH,
    );
    const earnedPence = referrals.reduce(
      (sum, record) =>
        sum +
        [record.rewards.referrerFivePaidDays, record.rewards.referrerTwentyPaidDays]
          .filter((reward) =>
            [REWARD_STATUSES.EARNED, REWARD_STATUSES.CREDITED].includes(
              reward.status,
            ),
          )
          .reduce((rewardSum, reward) => rewardSum + reward.amountPence, 0),
      0,
    );
    return {
      phase: programmePhase,
      invitedCount: Math.max(invitations.length, referrals.length),
      joinedCount: referrals.length,
      joinedEarlyAccessCount: joinedEarlyAccess.length,
      potentialRewardPence: joinedEarlyAccess.length * 10000,
      earnedRewardPence: earnedPence,
      invitations,
      referrals,
    };
  }

  function referralForReferredWorker(state, workerIds) {
    const ids = new Set((Array.isArray(workerIds) ? workerIds : [workerIds]).map(cleanId));
    return (
      (state?.workerReferrals || []).find((record) =>
        ids.has(cleanId(record.referredWorkerId)),
      ) || null
    );
  }

  const api = Object.freeze({
    PROGRAMME_VERSION,
    PROGRAMME_PHASES,
    REFERRAL_STATUSES,
    REWARD_STATUSES,
    REWARD_DEFINITIONS,
    referralCodeForSeed,
    normalizeReferralCode,
    ensureWorkerReferralCode,
    ensureReferralState,
    validateReferralCode,
    attributeReferral,
    recordInvitation,
    syncReferralProgress,
    syncAllReferralProgress,
    referralSummary,
    referralForReferredWorker,
  });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.OnSiteWorkerReferrals = api;
})(typeof window !== "undefined" ? window : globalThis);
