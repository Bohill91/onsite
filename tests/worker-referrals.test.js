"use strict";

const assert = require("node:assert/strict");
const referrals = require("../worker-referrals.js");

const PRELAUNCH = referrals.PROGRAMME_PHASES.PRELAUNCH;
const LIVE = referrals.PROGRAMME_PHASES.LIVE;
const NOW = "2026-09-13T09:00:00.000Z";

function worker(id, overrides = {}) {
  return { id, identityId: `identity-${id}`, name: id, ...overrides };
}

function store(phase = PRELAUNCH) {
  return {
    workerReferralProgramme: { phase },
    workerReferralInvites: [],
    workerReferrals: [],
  };
}

// Stable referral codes are deterministic and worker-specific.
assert.equal(
  referrals.referralCodeForSeed("worker-a"),
  referrals.referralCodeForSeed("worker-a"),
);
assert.notEqual(
  referrals.referralCodeForSeed("worker-a"),
  referrals.referralCodeForSeed("worker-b"),
);

// Legacy workers and state gain safe defaults without fabricated referrals.
const legacyState = {};
const legacyWorker = worker("legacy", { referralCode: undefined });
referrals.ensureReferralState(legacyState, [legacyWorker]);
assert.equal(legacyState.workerReferralProgramme.phase, PRELAUNCH);
assert.deepEqual(legacyState.workerReferrals, []);
assert.deepEqual(legacyState.workerReferralInvites, []);
assert.match(legacyWorker.referralCode, /^OSW-[A-Z0-9]{12}$/);

const returningLegacyWorker = worker("legacy-returning", {
  identityId: legacyWorker.identityId,
});
assert.equal(
  referrals.ensureWorkerReferralCode(returningLegacyWorker, [
    legacyWorker,
    returningLegacyWorker,
  ]),
  legacyWorker.referralCode,
);
assert.equal(
  referrals.validateReferralCode(legacyState, [legacyWorker], "OSW-UNKNOWN0000").ok,
  false,
);

const referrer = worker("referrer");
const referred = worker("referred");
const workers = [referrer, referred];
const prelaunchState = store();
referrals.ensureReferralState(prelaunchState, workers);

// Invitation actions are recorded once within the dedupe window.
const invite = referrals.recordInvitation(prelaunchState, workers, referrer, {
  now: NOW,
  channel: "share",
});
assert.equal(invite.ok, true);
assert.equal(invite.duplicate, false);
const duplicateInvite = referrals.recordInvitation(
  prelaunchState,
  workers,
  referrer,
  { now: "2026-09-13T09:00:30.000Z", channel: "share" },
);
assert.equal(duplicateInvite.duplicate, true);
assert.equal(prelaunchState.workerReferralInvites.length, 1);

// A valid prelaunch attribution is immutable and grants Founding Worker state.
const attribution = referrals.attributeReferral(
  prelaunchState,
  workers,
  referred,
  referrer.referralCode,
  { now: NOW },
);
assert.equal(attribution.ok, true);
assert.equal(attribution.referral.foundingWorker, true);
assert.equal(
  attribution.referral.status,
  referrals.REFERRAL_STATUSES.JOINED_EARLY_ACCESS,
);
assert.equal(referred.foundingWorker, true);
assert.equal(prelaunchState.workerReferralInvites[0].status, "joined");

const duplicateAttribution = referrals.attributeReferral(
  prelaunchState,
  workers,
  referred,
  referrer.referralCode,
  { now: "2026-09-14T09:00:00.000Z" },
);
assert.equal(duplicateAttribution.ok, true);
assert.equal(duplicateAttribution.duplicate, true);
assert.equal(prelaunchState.workerReferrals.length, 1);

const otherReferrer = worker("other-referrer");
workers.push(otherReferrer);
referrals.ensureReferralState(prelaunchState, workers);
const overwriteAttempt = referrals.attributeReferral(
  prelaunchState,
  workers,
  referred,
  otherReferrer.referralCode,
  { now: "2026-09-14T10:00:00.000Z" },
);
assert.equal(overwriteAttempt.ok, false);
assert.match(overwriteAttempt.reason, /already has/i);
assert.equal(prelaunchState.workerReferrals[0].referrerWorkerId, referrer.id);

// Self-referral is rejected both by account ID and permanent identity.
assert.equal(
  referrals.attributeReferral(
    store(),
    [referrer],
    referrer,
    referrer.referralCode,
    { now: NOW },
  ).ok,
  false,
);
const returningAccount = worker("returning", {
  identityId: referrer.identityId,
});
assert.equal(
  referrals.attributeReferral(
    store(),
    [referrer, returningAccount],
    returningAccount,
    referrer.referralCode,
    { now: NOW },
  ).ok,
  false,
);

// Prelaunch rewards remain potential even if work evidence already exists.
referrals.syncAllReferralProgress(
  prelaunchState,
  workers,
  () => ({ profileCompleted: true, startedWork: true, paidDayCount: 20 }),
  { now: "2026-09-30T09:00:00.000Z" },
);
const prelaunchReferral = prelaunchState.workerReferrals[0];
assert.equal(prelaunchReferral.status, referrals.REFERRAL_STATUSES.JOINED_EARLY_ACCESS);
assert.equal(
  prelaunchReferral.rewards.referrerFivePaidDays.status,
  referrals.REWARD_STATUSES.POTENTIAL,
);
assert.equal(
  referrals.referralSummary(prelaunchState, referrer.id).potentialRewardPence,
  10000,
);

// Once live, progression follows profile, start, five-day and twenty-day evidence.
const liveState = store(LIVE);
const liveReferrer = worker("live-referrer");
const liveReferred = worker("live-referred");
const liveWorkers = [liveReferrer, liveReferred];
referrals.ensureReferralState(liveState, liveWorkers);
const liveAttribution = referrals.attributeReferral(
  liveState,
  liveWorkers,
  liveReferred,
  liveReferrer.referralCode,
  { now: NOW },
).referral;
assert.equal(liveAttribution.foundingWorker, false);
assert.equal(liveAttribution.status, referrals.REFERRAL_STATUSES.JOINED);

referrals.syncReferralProgress(
  liveAttribution,
  { profileCompleted: true },
  { phase: LIVE, now: "2026-09-14T09:00:00.000Z" },
);
assert.equal(
  liveAttribution.status,
  referrals.REFERRAL_STATUSES.PROFILE_COMPLETED,
);

referrals.syncReferralProgress(
  liveAttribution,
  { profileCompleted: true, startedWorkAt: "2026-09-16T07:30:00.000Z" },
  { phase: LIVE, now: "2026-09-16T07:30:00.000Z" },
);
assert.equal(liveAttribution.status, referrals.REFERRAL_STATUSES.STARTED_WORK);

referrals.syncReferralProgress(
  liveAttribution,
  { profileCompleted: true, startedWork: true, paidDayCount: 5 },
  { phase: LIVE, now: "2026-09-23T17:00:00.000Z" },
);
assert.equal(liveAttribution.status, referrals.REFERRAL_STATUSES.FIVE_PAID_DAYS);
assert.equal(
  liveAttribution.rewards.referrerFivePaidDays.amountPence,
  5000,
);
assert.equal(
  liveAttribution.rewards.referrerFivePaidDays.status,
  referrals.REWARD_STATUSES.EARNED,
);
assert.equal(
  liveAttribution.rewards.referredFivePaidDays.amountPence,
  2500,
);
assert.equal(
  liveAttribution.rewards.referredFivePaidDays.status,
  referrals.REWARD_STATUSES.EARNED,
);
assert.equal(
  liveAttribution.rewards.referrerTwentyPaidDays.status,
  referrals.REWARD_STATUSES.PENDING,
);

const firstRewardEarnedAt = liveAttribution.rewards.referrerFivePaidDays.earnedAt;
referrals.syncReferralProgress(
  liveAttribution,
  { profileCompleted: true, startedWork: true, paidDayCount: 5 },
  { phase: LIVE, now: "2026-09-24T17:00:00.000Z" },
);
assert.equal(
  liveAttribution.rewards.referrerFivePaidDays.earnedAt,
  firstRewardEarnedAt,
);

referrals.syncReferralProgress(
  liveAttribution,
  { profileCompleted: true, startedWork: true, paidDayCount: 20 },
  { phase: LIVE, now: "2026-10-20T17:00:00.000Z" },
);
assert.equal(
  liveAttribution.status,
  referrals.REFERRAL_STATUSES.TWENTY_PAID_DAYS,
);
assert.equal(
  liveAttribution.rewards.referrerTwentyPaidDays.status,
  referrals.REWARD_STATUSES.EARNED,
);
assert.equal(
  referrals.referralSummary(liveState, liveReferrer.id).earnedRewardPence,
  10000,
);

// A banked prelaunch referral qualifies once the programme becomes live.
prelaunchState.workerReferralProgramme.phase = LIVE;
referrals.syncAllReferralProgress(
  prelaunchState,
  workers,
  () => ({ profileCompleted: true, startedWork: true, paidDayCount: 20 }),
  { now: "2026-10-20T17:00:00.000Z" },
);
const launchedReferral = prelaunchState.workerReferrals[0];
assert.equal(
  launchedReferral.rewards.referrerFivePaidDays.status,
  referrals.REWARD_STATUSES.EARNED,
);
assert.equal(
  launchedReferral.rewards.referrerTwentyPaidDays.status,
  referrals.REWARD_STATUSES.EARNED,
);

console.log("worker referral programme tests passed");
