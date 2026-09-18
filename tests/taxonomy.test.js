"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const taxonomy = require("../taxonomy.js");

const rootDir = path.resolve(__dirname, "..");

function roleNames(tradeValue) {
  return taxonomy.findTrade(tradeValue)?.roles.map((role) => role.name) || [];
}

function roleKeys(tradeValue) {
  return taxonomy.findTrade(tradeValue)?.roles.map((role) => role.key) || [];
}

test("taxonomy has unique trades, roles, stable keys and non-empty labels", () => {
  assert.ok(taxonomy.trades.length >= 40);
  const tradeKeys = taxonomy.trades.map((trade) => trade.key);
  assert.equal(new Set(tradeKeys).size, tradeKeys.length);
  const allRoleKeys = taxonomy.trades.flatMap((trade) => trade.roles.map((role) => role.key));
  assert.equal(new Set(allRoleKeys).size, allRoleKeys.length);

  taxonomy.trades.forEach((trade) => {
    assert.match(trade.key, /^[a-z0-9_]+$/);
    assert.ok(trade.name.trim());
    assert.ok(Array.isArray(trade.roles) && trade.roles.length > 0);
    const keys = trade.roles.map((role) => role.key);
    assert.equal(new Set(keys).size, keys.length, `${trade.name} has duplicate role keys`);
    trade.roles.forEach((role) => {
      assert.match(role.key, /^[a-z0-9_]+$/);
      assert.ok(role.name.trim());
    });
  });
});

test("discipline leadership stays under its canonical trade", () => {
  assert.deepEqual(
    roleNames("electrical").slice(0, 3),
    ["Electrical Manager", "Electrical Supervisor", "Electrical Foreman"],
  );
  assert.ok(roleNames("electrical").includes("Testing & Inspection Electrician"));
  assert.ok(roleNames("mechanical_pipework").includes("Mechanical Manager"));
  assert.ok(roleNames("mechanical_pipework").includes("Mechanical Supervisor"));
  assert.ok(roleNames("mechanical_pipework").includes("Mechanical Foreman"));
  assert.ok(roleNames("site_management_supervision").includes("Site Manager"));
  assert.ok(!roleNames("site_management_supervision").includes("Electrical Manager"));
  assert.ok(!roleNames("site_management_supervision").includes("Mechanical Supervisor"));
});

test("other discipline leadership coverage is explicit and industry-scoped", () => {
  [
    ["fire_security_systems", "Fire & Security Supervisor"],
    ["data_communications", "Data & Communications Supervisor"],
    ["bms_controls", "BMS Supervisor"],
    ["plumbing_heating", "Plumbing Supervisor"],
    ["hvac_ventilation_refrigeration", "HVAC Supervisor"],
    ["groundworks_civils", "Groundworks Foreman"],
    ["carpentry_joinery", "Carpentry Foreman"],
    ["formwork", "Formwork Foreman"],
    ["brickwork_masonry", "Brickwork Foreman"],
    ["structural_steel_metalwork", "Steelwork Supervisor"],
    ["drylining_ceilings", "Drylining Supervisor"],
    ["cladding_facades", "Cladding Supervisor"],
    ["roofing", "Roofing Supervisor"],
    ["demolition", "Demolition Supervisor"],
    ["highways_traffic_management", "Highways Supervisor"],
    ["piling_drilling", "Piling Supervisor"],
    ["cleaning", "Cleaning Supervisor"],
    ["stores_materials", "Stores Supervisor"],
  ].forEach(([trade, role]) => assert.ok(roleNames(trade).includes(role), `${trade} is missing ${role}`));
});

test("legacy trade display aliases resolve without changing canonical keys", () => {
  assert.equal(taxonomy.findTrade("Mechanical").key, "mechanical_pipework");
  assert.equal(taxonomy.findTrade("Plumbing").key, "plumbing_heating");
  assert.equal(taxonomy.findTrade("Management & Supervision").key, "site_management_supervision");
  assert.equal(taxonomy.tradeKeyFor("Fire & Security"), "fire_security_systems");
  assert.equal(taxonomy.roleKeyFor("Electrical", "Electrical Manager"), "electrical_manager");
  assert.equal(taxonomy.roleKeyFor("Mechanical", "Mechanical Supervisor"), "mechanical_supervisor");
});

test("Early Access, registration and Request Labour all consume the shared taxonomy", () => {
  const earlyAccess = fs.readFileSync(path.join(rootDir, "early-access.js"), "utf8");
  const auth = fs.readFileSync(path.join(rootDir, "auth.js"), "utf8");
  const app = fs.readFileSync(path.join(rootDir, "app.js"), "utf8");
  assert.match(earlyAccess, /OnSiteTaxonomy\?\.trades/);
  assert.match(earlyAccess, /populateRoleSelect/);
  assert.match(auth, /OnSiteTaxonomy(?:\?\.|\.)populateTradeSelect/);
  assert.match(auth, /OnSiteTaxonomy(?:\?\.|\.)populateRoleSelect/);
  assert.match(app, /populateTradeSelect\(workerTradeSelect/);
  assert.match(app, /populateTradeSelect\(tradeSelect/);
  assert.match(app, /populateRoleSelect\(specialismSelect/);
});

test("stable role keys are emitted for discipline management roles", () => {
  assert.equal(taxonomy.findRole("electrical", "electrical_manager").name, "Electrical Manager");
  assert.equal(taxonomy.findRole("electrical", "electrical_supervisor").name, "Electrical Supervisor");
  assert.equal(taxonomy.findRole("mechanical_pipework", "mechanical_manager").name, "Mechanical Manager");
  assert.equal(taxonomy.findRole("mechanical_pipework", "mechanical_supervisor").name, "Mechanical Supervisor");
  assert.ok(roleKeys("site_management_supervision").includes("site_manager"));
});