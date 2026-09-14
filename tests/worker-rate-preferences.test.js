"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const preferences = require("../worker-rate-preferences.js");

const root = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const authSource = fs.readFileSync(path.join(root, "auth.js"), "utf8");

function eligible(minimumDayRate, workerFacingDayRate, rateKnown = true) {
  return preferences.minimumRateEligibility({
    minimumDayRate,
    workerFacingDayRate,
    rateKnown,
  }).eligible;
}

// Registration persistence uses the canonical record field and normalisation.
const registration = preferences.applyMinimumDayRate({ id: "new-worker" }, "215.4");
assert.equal(registration.ok, true);
assert.equal(registration.record.minRate, 215);
assert.match(authSource, /workerRegData\.minRate = minRateResult\.minimumDayRate/);
assert.doesNotMatch(authSource, /workerRegData\.minRate = ['"]{2}/);

// Worker profile updates use the same canonical helper and remain editable.
const update = preferences.applyMinimumDayRate(registration.record, "240");
assert.equal(update.ok, true);
assert.equal(update.record.minRate, 240);
assert.match(appSource, /id="saveWorkerMinimumDayRate"/);
assert.match(appSource, /Private to OnSite/);

// Legacy and blank values create no new eligibility constraint.
assert.equal(eligible(undefined, 120), true);
assert.equal(eligible("", 120), true);
assert.equal(eligible("invalid", 120), true);

// The comparison is inclusive and uses the worker-facing rate.
assert.equal(eligible(180, 200), true);
assert.equal(eligible(200, 200), true);
assert.equal(eligible(220, 200), false);

// A company budget cannot accidentally satisfy a lower worker-facing rate.
assert.equal(
  preferences.minimumRateEligibility({
    minimumDayRate: 250,
    workerFacingDayRate: 240,
    companyBudget: 300,
  }).eligible,
  false,
);

// Unknown worker-facing rates preserve existing matching behaviour.
assert.equal(eligible(250, null, false), true);

// The shared rule is wired into diagnostics, while unrelated ranking signals remain.
assert.match(appSource, /const rateEligibility = workerMinimumRateEligibility\(job, worker, options\)/);
assert.match(appSource, /preferredScore/);
assert.match(appSource, /reliabilityPoints/);
assert.match(appSource, /matchConstraintForCapacity\(capacity\)/);
assert.match(appSource, /function requestExtension[\s\S]*?workerMinimumRateAllowsPayableRate/);
assert.match(appSource, /function createShiftChangeOffer[\s\S]*?workerMinimumRateAllowsPayableRate/);

// Known company-facing worker renderers do not reference the private field.
for (const [startName, endName] of [
  ["specificWorkerRowHTML", "renderSpecificWorkerPickerResults"],
  ["companyProjectWorkerRowHTML", "companyProjectRequirementsHTML"],
  ["companyDirectoryWorkerCardHTML", "openCompanyWorkerProfileModal"],
  ["openCompanyWorkerProfileModal", "companyPreferredWorkersPanelHTML"],
]) {
  const start = appSource.indexOf(`function ${startName}`);
  const end = appSource.indexOf(`function ${endName}`, start + 1);
  assert.ok(start >= 0 && end > start, `${startName} source should be present`);
  assert.doesNotMatch(appSource.slice(start, end), /minRate|Minimum Day Rate/);
}

console.log("worker minimum-rate preference tests passed");
