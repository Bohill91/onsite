(function initialiseOnSiteCredentials(global) {
  "use strict";

  function stableKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[’']/g, "")
      .replace(/\+/g, " plus ")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function normalizeSearch(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[–—]/g, "-")
      .replace(/[^a-z0-9+]+/g, " ")
      .replace(/\s+/g, " ");
  }

  const categoryLabels = {
    cscs: "CSCS",
    electrical_ecs: "Electrical / ECS",
    electrical_qualifications: "Electrical Qualifications",
    plumbing_jib_pmes: "Plumbing / JIB-PMES",
    gas: "Gas",
    hvac_skillcard: "HVAC / SKILLcard",
    ipaf: "Powered Access / IPAF",
    pasma: "PASMA",
    site_safety: "Site Safety",
    plant: "Plant",
    scaffolding: "Scaffolding",
    demolition: "Demolition",
    street_works: "Street Works",
    utilities_eusr: "Utilities / EUSR",
    rail: "Rail",
    asbestos: "Asbestos",
    general_safety: "General Safety",
  };

  const categoryTradeKeys = {
    electrical_ecs: ["electrical", "fire_security_systems", "data_communications", "bms_controls"],
    electrical_qualifications: ["electrical", "fire_security_systems", "bms_controls", "renewables"],
    plumbing_jib_pmes: ["plumbing_heating", "mechanical_pipework", "fire_sprinklers", "renewables"],
    gas: ["plumbing_heating", "mechanical_pipework"],
    hvac_skillcard: ["hvac_ventilation_refrigeration", "plumbing_heating", "mechanical_pipework", "renewables"],
    ipaf: ["electrical", "fire_security_systems", "data_communications", "bms_controls", "hvac_ventilation_refrigeration", "cladding_facades", "glazing", "roofing", "specialist_access_work_at_height", "lifts_escalators"],
    pasma: ["electrical", "fire_security_systems", "data_communications", "bms_controls", "hvac_ventilation_refrigeration", "painting_decorating", "drylining_ceilings", "specialist_access_work_at_height"],
    site_safety: ["site_management_supervision", "tunnelling", "lifting_operations"],
    plant: ["plant_operations", "lifting_operations", "demolition", "groundworks_civils", "highways_traffic_management", "piling_drilling"],
    scaffolding: ["scaffolding"],
    demolition: ["demolition"],
    street_works: ["highways_traffic_management", "groundworks_civils", "site_logistics_labour"],
    utilities_eusr: ["groundworks_civils", "mechanical_pipework", "data_communications", "highways_traffic_management"],
    rail: ["rail"],
    asbestos: ["asbestos", "demolition"],
  };

  const commonLabels = new Set([
    "CSCS Green Labourer Card",
    "CSCS Blue Skilled Worker Card",
    "CSCS Gold Skilled Worker Card",
    "CSCS Gold Supervisor Card",
    "CSCS Black Manager Card",
    "IPAF 3A — Mobile Vertical",
    "IPAF 3B — Mobile Boom",
    "PASMA Towers for Users",
    "CITB Health & Safety Awareness (HSA)",
    "SSSTS — Site Supervision Safety Training Scheme",
    "SMSTS — Site Management Safety Training Scheme",
    "Emergency First Aid at Work",
    "First Aid at Work",
    "Manual Handling",
    "Working at Height",
    "Face Fit Testing",
  ]);

  const records = [];

  function add(category, labels, options = {}) {
    labels.forEach((entry) => {
      const label = typeof entry === "string" ? entry : entry.label;
      const searchTerms = [
        ...(options.searchTerms || []),
        ...(typeof entry === "object" ? entry.searchTerms || [] : []),
      ];
      records.push({
        id: `${category}:${stableKey(label)}`,
        label,
        category,
        tradeKeys: [...(options.tradeKeys || categoryTradeKeys[category] || [])],
        searchTerms,
        common: commonLabels.has(label) || !!options.common,
        requestable: options.requestable !== false,
      });
    });
  }

  add("cscs", [
    "CSCS Green Labourer Card",
    "CSCS Blue Skilled Worker Card",
    "CSCS Gold Skilled Worker Card",
    "CSCS Gold Supervisor Card",
    "CSCS Black Manager Card",
    "CSCS White Academically Qualified Person (AQP)",
    "CSCS White Professionally Qualified Person (PQP)",
    "NVQ / SVQ Level 2 — Relevant Trade",
    "NVQ / SVQ Level 3 — Relevant Trade",
    "NVQ / SVQ Level 4 — Relevant Occupation",
    "NVQ / SVQ Level 5 — Relevant Occupation",
    "NVQ / SVQ Level 6 — Relevant Occupation",
    "NVQ / SVQ Level 7 — Relevant Occupation",
  ], { searchTerms: ["construction skills certification scheme", "nvq", "svq"] });

  add("electrical_ecs", [
    "ECS Gold Card",
    "ECS Black Manager Card",
    "ECS White Related Discipline Card",
    "ECS Site Support Card — White / Black Stripe",
    "ECS Electrical Labourer Card — White / Green Stripe",
    "ECS Registered Electrician Status",
    "ECS FESS Systems Operative — White / Blue Stripe",
    "ECS FESS Systems Technician — Gold",
    "ECS FESS Technical Manager — Black",
    "ECS Network Infrastructure Installer Level 3",
    "ECS Network Infrastructure Manager — Black",
    "ECS Academically Qualified Person (AQP) — White",
    "ECS Professionally Qualified Person (PQP) — White",
  ], { searchTerms: ["ecs", "electrotechnical certification scheme", "gold card", "white card", "black card", "registered electrician", "fess", "network infrastructure"] });

  add("electrical_qualifications", [
    { label: "BS 7671 — Current Wiring Regulations / 18th Edition", searchTerms: ["18th edition", "bs7671", "bs 7671", "2382", "2382-26"] },
    { label: "City & Guilds 2391-50 — Initial Verification", searchTerms: ["2391", "2391-50", "initial verification"] },
    { label: "City & Guilds 2391-51 — Periodic Inspection & Testing", searchTerms: ["2391", "2391-51", "periodic inspection testing"] },
    { label: "City & Guilds 2391-52 — Initial & Periodic Inspection & Testing", searchTerms: ["2391", "2391-52", "initial periodic inspection testing"] },
    "AM2",
    "AM2S",
    "AM2E",
    "City & Guilds 2365 Level 2 Electrical Installation",
    "City & Guilds 2365 Level 3 Electrical Installation",
    "Level 3 NVQ Electrotechnical Systems / Equipment",
  ], { searchTerms: ["electrical", "city and guilds", "c and g"] });

  add("plumbing_jib_pmes", [
    "JIB-PMES Plumber Blue Card",
    "JIB-PMES Plumber Gold Card",
    "JIB-PMES Heating Fitter Blue Card",
    "JIB-PMES Heating Fitter Gold Card",
    "JIB-PMES Mechanical Pipe Fitter Blue Card",
    "JIB-PMES Mechanical Pipe Fitter Gold Card",
    "JIB-PMES Gas Service Engineer Blue Card",
    "JIB-PMES Gas Service Engineer Gold Card",
    "JIB-PMES Gas Operative Blue Card",
    "JIB-PMES Labourer / Plumber's Mate Green Card",
    "JIB-PMES Low Carbon Heating Technician Gold Card",
    "JIB-PMES Supervisor Gold Card",
    "JIB-PMES Manager Black Card",
    "HETAS Registered Operative",
    "Water Regulations / Water Byelaws Qualification",
    "Unvented Hot Water / G3 Qualification",
    "NVQ / SVQ Level 2 Plumbing & Heating",
    "NVQ / SVQ Level 3 Plumbing & Heating",
  ], { searchTerms: ["jib pmes", "plumbing", "water regulations", "water byelaws", "unvented", "g3", "hetas"] });

  add("gas", [
    "Gas Safe Registered",
    "ACS CCN1 — Core Domestic Gas Safety",
    "ACS CENWAT — Central Heating Boilers & Water Heaters",
    "ACS CKR1 — Domestic Cookers",
    "ACS HTR1 — Gas Fires & Wall Heaters",
    "ACS MET1 — Domestic Gas Meters",
    "ACS CPA1 — Combustion Performance Analysis",
    "ACS DAH1 — Ducted Air Heaters",
    "ACS LAU1 — Laundry Appliances",
    "ACS WAT1 — Water Heaters",
    "ACS COCN1 — Core Commercial Gas Safety",
    "ACS CODNCO1 — Changeover Domestic to Commercial Gas",
    "ACS CORT1 — Commercial Overhead Radiant Tube / Plaque Heaters",
    "ACS CIGA1 — Commercial Indirect-Fired Heating Appliances",
    "ACS ICPN1 — Commercial Installation Pipework",
    "ACS TPCP1 / TPCP1A — Testing & Purging Commercial Pipework",
    "ACS CDGA1 — Commercial Direct-Fired Heating Appliances",
    "ACS CGFE1 — Commercial Gas-Fired Equipment",
    "ACS CCP1 — Commercial Catering Pipework",
    "ACS LPG / CONGLP1",
  ], { searchTerms: ["gas safe", "acs", "domestic gas", "commercial gas", "lpg"] });

  add("hvac_skillcard", [
    "SKILLcard Blue Skilled Worker",
    "SKILLcard Gold Advanced Craft",
    "SKILLcard Gold Supervisor",
    "SKILLcard Black Manager",
    "SKILLcard White Academically Qualified Person (AQP)",
    "SKILLcard White Professionally Qualified Person (PQP)",
    { label: "F-Gas Category 1", searchTerms: ["f gas", "f-gas", "refrigeration", "air conditioning", "heat pump"] },
    { label: "F-Gas Category 2", searchTerms: ["f gas", "f-gas", "refrigeration", "air conditioning", "heat pump"] },
    { label: "F-Gas Category 3", searchTerms: ["f gas", "f-gas", "refrigeration", "air conditioning", "heat pump"] },
    { label: "F-Gas Category 4", searchTerms: ["f gas", "f-gas", "refrigeration", "air conditioning", "heat pump"] },
    { label: "Refrigeration Brazing Qualification", searchTerms: ["refrigeration", "brazing", "air conditioning", "heat pump"] },
  ], { searchTerms: ["skillcard", "hvac"] });

  add("ipaf", [
    "IPAF 1A — Static Vertical",
    "IPAF 1B — Static Boom",
    "IPAF 1B+ — Static Boom PAL+",
    "IPAF 3A — Mobile Vertical",
    "IPAF 3A+ — Mobile Vertical PAL+",
    "IPAF 3B — Mobile Boom",
    "IPAF 3B+ — Mobile Boom PAL+",
    "IPAF PAV — Push Around Vertical",
    "IPAF MCWP — Mast Climbing Work Platform",
    "IPAF IAD — Insulated Aerial Device",
    "IPAF Harness Awareness",
    "IPAF Harness User",
    "IPAF Harness Inspector",
    "IPAF Loading & Unloading",
    "IPAF MEWPs for Managers",
    "IPAF Goods Hoist",
    "IPAF Transport Platform",
    "IPAF Passenger Hoist",
  ], { searchTerms: ["ipaf", "1a", "1b", "3a", "3b", "cherry picker", "scissor lift", "mewp", "pal", "pal+"] });

  add("pasma", [
    "PASMA Towers for Users",
    "PASMA Low-Level Access",
    "PASMA Combined Towers for Users & Low-Level Access",
    "PASMA Work at Height — Novice",
    "PASMA Towers on Stairways",
    "PASMA Towers with Cantilevers",
    "PASMA Towers with Bridges",
    "PASMA Linked Towers",
    "PASMA Large Deck Towers",
    "PASMA Towers for Managers",
  ], { searchTerms: ["pasma", "mobile tower", "towers", "low level access", "a5", "a6", "a7", "a8", "a9"] });

  add("site_safety", [
    "CITB Health & Safety Awareness (HSA)",
    "SSSTS — Site Supervision Safety Training Scheme",
    "SSSTS Refresher",
    "SMSTS — Site Management Safety Training Scheme",
    "SMSTS Refresher",
    "SEATS — Site Environmental Awareness Training Scheme",
    "TSTS — Tunnelling Safety Training Scheme",
    "Temporary Works Supervisor",
    "Temporary Works Coordinator",
    "Temporary Works Coordinator Refresher",
    "Temporary Works General Awareness",
  ], { searchTerms: ["citb", "site safety plus", "hsa", "sssts", "smsts", "seats", "tsts", "temporary works"] });

  add("plant", [
    "CPCS Red Trained Operator Card",
    "CPCS Blue Competent Operator Card",
    "NPORS CSCS Red Trained Operator Card",
    "NPORS CSCS Blue Competent Operator Card",
  ], { searchTerms: ["cpcs", "npors", "plant operator", "trained operator", "competent operator"] });

  add("scaffolding", [
    "CISRS Scaffolding Labourer Card",
    "CISRS BASE Card",
    "CISRS Scaffolder Card",
    "CISRS Advanced Scaffolder Card",
    "CISRS Scaffolding Supervisor Card",
    "CISRS Basic Scaffold Inspection",
    "CISRS Advanced Scaffold Inspection",
  ], { searchTerms: ["cisrs", "scaffold", "scaffolding", "inspection"] });

  add("demolition", [
    "CCDO Demolition Labourer",
    "CCDO Demolition & Refurbishment Operative",
    "CCDO Topman",
    "CCDO Chargehand",
    "CCDO Demolition Supervisor",
    "CCDO Demolition Manager",
  ], { searchTerms: ["ccdo", "demolition"] });

  add("street_works", [
    "Street Works / SWQR Operative",
    "Street Works / SWQR Supervisor",
    "Street Works — Location & Avoidance of Underground Apparatus",
    "Street Works Operative — Signing, Lighting & Guarding",
    "Street Works Operative — Excavation",
    "Street Works Operative — Backfill & Compaction",
    "Street Works Operative — Sub-base / Base Reinstatement",
    "Street Works Operative — Cold-Lay Bituminous Reinstatement",
    "Street Works Operative — Hot-Lay Bituminous Reinstatement",
    "Street Works Operative — Concrete Slab Reinstatement",
    "Street Works Operative — Modular Surface / Footway Reinstatement",
    "Street Works Supervisor — Signing, Lighting & Guarding",
    "Street Works Supervisor — Excavation",
    "Street Works Supervisor — Backfill / Reinstatement",
    "Street Works Supervisor — Bituminous Reinstatement",
    "Street Works Supervisor — Concrete Slab Reinstatement",
    "Street Works Supervisor — Modular Surface / Footway Reinstatement",
  ], { searchTerms: ["nrswa", "streetworks", "street works", "swqr"] });

  add("utilities_eusr", [
    "EUSR SHEA Gas",
    "EUSR SHEA Power",
    "EUSR SHEA Water",
    "EUSR SHEA Telecommunications",
    "EUSR SHEA Drains & Sewers",
    "EUSR National Water Hygiene",
    "EUSR Utility Excavations",
    "EUSR Confined Spaces",
    "EUSR Confined Spaces — Water",
    "EUSR Network Construction Operations — Water",
    "EUSR Network Construction Operations — Water Supervisor",
    "EUSR Safe Control of Operations — Gas",
  ], { searchTerms: ["eusr", "shea", "utilities", "water hygiene", "network construction operations"] });

  add("rail", [
    "Sentinel Card",
    "PTS — Personal Track Safety",
    "IWA — Individual Working Alone",
    "COSS — Controller of Site Safety",
    "SWL — Safe Work Leader",
    "PICOP — Person in Charge of Possession",
  ], { searchTerms: ["sentinel", "network rail", "pts", "iwa", "coss", "swl", "picop"] });

  add("asbestos", [
    "UKATA Asbestos Awareness — AA01",
    "UKATA Asbestos Awareness for Groundworkers — AA02",
    "UKATA Non-Licensed Asbestos Operative — NL01",
    "UKATA Non-Licensed Asbestos Groundworker — NL02",
    "Licensed Asbestos Removal Operative",
    "Licensed Asbestos Removal Supervisor",
    "UKATA RPE Competent Person",
    "UKATA Asbestos Sampling",
    "UKATA Asbestos Project Manager",
  ], { searchTerms: ["ukata", "asbestos", "aa01", "aa02", "nl01", "nl02", "rpe"] });

  add("general_safety", [
    "Emergency First Aid at Work",
    "First Aid at Work",
    "Abrasive Wheels",
    "Manual Handling",
    "Working at Height",
    "Harness Training",
    "Face Fit Testing",
    "Fire Marshal / Fire Warden",
    "Confined Spaces — Low Risk",
    "Confined Spaces — Medium Risk",
    "Confined Spaces — High Risk",
    "CAT & Genny / Cable Avoidance",
    "Banksman / Vehicle Marshaller Training",
  ], { searchTerms: ["site safety", "training", "first aid", "confined space", "cat and genny", "cable avoidance", "banksman", "vehicle marshaller"] });

  const credentials = records.map((credential) => {
    const searchText = normalizeSearch([
      credential.label,
      categoryLabels[credential.category],
      ...credential.searchTerms,
    ].join(" "));
    return Object.freeze({ ...credential, searchText });
  });
  const credentialById = new Map(credentials.map((credential) => [credential.id, credential]));
  const credentialByLabel = new Map(
    credentials.map((credential) => [normalizeSearch(credential.label), credential]),
  );

  const exactLegacyAliases = new Map([
    ["18th edition", "BS 7671 — Current Wiring Regulations / 18th Edition"],
    ["bs7671", "BS 7671 — Current Wiring Regulations / 18th Edition"],
    ["bs 7671", "BS 7671 — Current Wiring Regulations / 18th Edition"],
    ["2382-26", "BS 7671 — Current Wiring Regulations / 18th Edition"],
    ["2391-50", "City & Guilds 2391-50 — Initial Verification"],
    ["2391-51", "City & Guilds 2391-51 — Periodic Inspection & Testing"],
    ["2391-52", "City & Guilds 2391-52 — Initial & Periodic Inspection & Testing"],
    ["sssts", "SSSTS — Site Supervision Safety Training Scheme"],
    ["smsts", "SMSTS — Site Management Safety Training Scheme"],
    ["ipaf 3a", "IPAF 3A — Mobile Vertical"],
    ["ipaf 3b", "IPAF 3B — Mobile Boom"],
    ["pasma towers for users", "PASMA Towers for Users"],
    ["ecs gold", "ECS Gold Card"],
    ["ecs gold card", "ECS Gold Card"],
    ["gas safe", "Gas Safe Registered"],
  ].map(([alias, label]) => [normalizeSearch(alias), credentialByLabel.get(normalizeSearch(label))?.id || ""]));

  function findById(id) {
    return credentialById.get(String(id || "")) || null;
  }

  function search(query, { limit = 80 } = {}) {
    const normalized = normalizeSearch(query);
    if (!normalized) return [];
    const terms = normalized.split(" ").filter(Boolean);
    return credentials
      .filter((credential) => credential.requestable && terms.every((term) => credential.searchText.includes(term)))
      .slice(0, limit);
  }

  function relevantToTrade(tradeKey) {
    return credentials.filter(
      (credential) =>
        credential.requestable &&
        tradeKey &&
        credential.tradeKeys.includes(tradeKey),
    );
  }

  function common() {
    return credentials.filter((credential) => credential.requestable && credential.common);
  }

  function labelsForIds(ids = []) {
    return [...new Set(ids)]
      .map(findById)
      .filter(Boolean)
      .map((credential) => credential.label);
  }

  function resolveLegacyIds(value) {
    const values = Array.isArray(value)
      ? value
      : String(value || "").split(/[,;\n]+/);
    return [...new Set(values.map((entry) => {
      if (entry && typeof entry === "object") {
        if (findById(entry.credentialId)) return entry.credentialId;
        entry = entry.name || entry.label || "";
      }
      const normalized = normalizeSearch(entry);
      return credentialByLabel.get(normalized)?.id || exactLegacyAliases.get(normalized) || "";
    }).filter(Boolean))];
  }

  function deepFreeze(value) {
    Object.freeze(value);
    Object.values(value).forEach((entry) => {
      if (entry && typeof entry === "object" && !Object.isFrozen(entry)) deepFreeze(entry);
    });
    return value;
  }

  global.OnSiteCredentials = deepFreeze({
    credentials,
    categoryLabels,
    categoryOrder: Object.keys(categoryLabels),
    findById,
    search,
    relevantToTrade,
    common,
    labelsForIds,
    resolveLegacyIds,
  });
})(window);
