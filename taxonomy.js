(function initialiseOnSiteTaxonomy(global) {
  "use strict";

  function stableKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function defineTrade(key, name, roleNames) {
    return {
      key,
      name,
      roles: roleNames.map((roleName) => ({
        key: stableKey(roleName),
        name: roleName,
      })),
    };
  }

  const trades = [
    defineTrade("electrical", "Electrical", [
      "Electrical Manager", "Electrical Supervisor", "Electrical Foreman",
      "Electrician", "Approved Electrician", "Domestic Electrician", "Electrical Improver",
      "Electrical Mate", "Electrical Labourer", "Testing & Inspection Electrician",
      "Commissioning Electrician", "Cable Jointer",
    ]),
    defineTrade("fire_security_systems", "Fire & Security Systems", [
      "Fire & Security Manager", "Fire & Security Supervisor",
      "Fire Alarm Engineer", "Fire Alarm Installer", "Security Systems Engineer", "CCTV Installer",
      "Access Control Installer", "Fire & Security Engineer",
    ]),
    defineTrade("data_communications", "Data & Communications", [
      "Data & Communications Manager", "Data & Communications Supervisor",
      "Data Cabling Engineer", "Fibre Optic Engineer", "Network Cabling Engineer",
    ]),
    defineTrade("bms_controls", "BMS & Controls", [
      "BMS Manager", "BMS Supervisor",
      "BMS Installer", "BMS Engineer", "BMS Commissioning Engineer", "Controls Electrician", "Controls Engineer",
    ]),
    defineTrade("plumbing_heating", "Plumbing & Heating", [
      "Plumbing Manager", "Plumbing Supervisor", "Plumbing Foreman",
      "Plumber", "Heating Fitter", "Gas Engineer", "Gas Service Engineer", "Plumber's Mate",
    ]),
    defineTrade("mechanical_pipework", "Mechanical Pipework", [
      "Mechanical Manager", "Mechanical Supervisor", "Mechanical Foreman",
      "Pipefitter", "Mechanical Fitter", "Pipefitter / Welder", "Mechanical Mate",
    ]),
    defineTrade("fire_sprinklers", "Fire Sprinklers", [
      "Sprinkler Manager", "Sprinkler Supervisor", "Sprinkler Foreman",
      "Sprinkler Fitter", "Sprinkler Mate",
    ]),
    defineTrade("hvac_ventilation_refrigeration", "HVAC, Ventilation & Refrigeration", [
      "HVAC Manager", "HVAC Supervisor", "HVAC Foreman",
      "Duct Fitter", "HVAC Engineer", "HVAC Service & Maintenance Engineer", "Air Conditioning Engineer",
      "Refrigeration Engineer", "Ventilation Engineer",
    ]),
    defineTrade("carpentry_joinery", "Carpentry & Joinery", [
      "Carpentry Supervisor", "Carpentry Foreman",
      "Carpenter", "1st Fix Carpenter", "2nd Fix Carpenter", "Joiner", "Bench Joiner", "Kitchen Fitter", "Timber Frame Erector",
    ]),
    defineTrade("formwork", "Formwork", [
      "Formwork Supervisor", "Formwork Foreman",
      "Shuttering Carpenter", "Formwork Carpenter", "Formwork Erector / Striker",
    ]),
    defineTrade("brickwork_masonry", "Brickwork & Masonry", [
      "Brickwork Supervisor", "Brickwork Foreman",
      "Bricklayer", "Stonemason", "Stone Fixer", "Banker Mason",
    ]),
    defineTrade("groundworks_civils", "Groundworks & Civils", [
      "Groundworks Manager", "Groundworks Supervisor", "Groundworks Foreman",
      "Groundworker", "Drainage Groundworker", "Ducting Groundworker", "Kerb Layer", "Paver",
      "Utilities Groundworker", "Groundworks Ganger",
    ]),
    defineTrade("concrete", "Concrete", [
      "Concrete Supervisor", "Concrete Foreman",
      "Concrete Operative", "Concrete Finisher", "Concrete Repair Operative", "Diamond Driller / Concrete Cutter",
      "Sprayed Concrete Operative", "Post-Tensioning Operative", "Precast Concrete Installer",
    ]),
    defineTrade("steel_fixing", "Steel Fixing", [
      "Steel Fixing Supervisor", "Steel Fixing Foreman", "Steel Fixer",
    ]),
    defineTrade("structural_steel_metalwork", "Structural Steel & Metalwork", [
      "Steelwork Manager", "Steelwork Supervisor", "Steelwork Foreman",
      "Steel Erector", "Steel Fabricator", "Welder", "Fabricator / Welder", "Steel Decker", "Stud Welder",
      "Architectural Metalwork Installer",
    ]),
    defineTrade("drylining_ceilings", "Drylining & Ceilings", [
      "Drylining Manager", "Drylining Supervisor", "Drylining Foreman",
      "Dryliner", "Dryliner Fixer", "Dryliner Finisher", "Ceiling Fixer", "Partition Installer",
    ]),
    defineTrade("plastering_rendering", "Plastering & Rendering", [
      "Plastering Supervisor", "Plastering Foreman", "Plasterer", "Renderer", "Fibrous Plasterer",
    ]),
    defineTrade("painting_decorating", "Painting & Decorating", [
      "Painting Supervisor", "Painting Foreman", "Painter & Decorator", "Industrial Painter", "Spray Painter",
    ]),
    defineTrade("tiling", "Tiling", ["Tiling Supervisor", "Tiling Foreman", "Wall & Floor Tiler"]),
    defineTrade("flooring", "Flooring", [
      "Flooring Supervisor", "Flooring Foreman",
      "Floor Layer", "Carpet Fitter", "Vinyl / Resilient Floor Layer", "Timber Flooring Installer",
      "Resin Flooring Installer", "Screeder", "Raised Access Floor Installer",
    ]),
    defineTrade("roofing", "Roofing", [
      "Roofing Manager", "Roofing Supervisor", "Roofing Foreman",
      "Roofer", "Roof Slater & Tiler", "Flat Roofer", "Single-Ply Roofer", "Felt Roofer",
      "Liquid Roofing Installer", "Leadworker", "Metal Roofer",
    ]),
    defineTrade("cladding_facades", "Cladding & Facades", [
      "Cladding Manager", "Cladding Supervisor", "Cladding Foreman",
      "Cladding Installer", "Rainscreen Cladder", "Roof Sheeter / Cladder", "Curtain Wall Installer",
      "Facade Installer", "Louvre / Brise Soleil Installer",
    ]),
    defineTrade("glazing", "Glazing", [
      "Glazing Supervisor", "Glazier", "Window & Door Installer", "Glass Partition Installer",
    ]),
    defineTrade("insulation", "Insulation", [
      "Insulation Supervisor",
      "Thermal Insulation Installer / Lagger", "Pipe / Duct Insulator", "Loft Insulation Installer",
      "External Wall Insulation Installer", "Cavity Wall Insulation Installer",
    ]),
    defineTrade("passive_fire_protection", "Passive Fire Protection", [
      "Passive Fire Protection Supervisor", "Fire Stopper", "Cavity Barrier Installer", "Fire Door Installer",
    ]),
    defineTrade("sealants", "Sealants", [
      "Sealants Supervisor", "Mastic / Sealant Applicator",
    ]),
    defineTrade("waterproofing_damp_proofing", "Waterproofing & Damp Proofing", [
      "Waterproofing Supervisor", "Waterproofing Foreman",
      "Waterproofing Operative", "Structural Waterproofing Operative", "Damp Proofer", "Gas Membrane Installer",
    ]),
    defineTrade("fit_out_specialist_interiors", "Fit Out & Specialist Interiors", [
      "Fit Out Manager", "Fit Out Supervisor", "Fit Out Foreman",
      "Shopfitter", "Furniture Installer", "Commercial Kitchen Equipment Fitter", "Operable Partition Installer",
      "Storage / Racking Installer",
    ]),
    defineTrade("doors_shutters", "Doors & Shutters", [
      "Doors & Shutters Supervisor",
      "Door Installer", "Automatic Door Engineer", "Door & Shutter Engineer", "Roller Shutter Installer", "Blind & Shutter Installer",
    ]),
    defineTrade("scaffolding", "Scaffolding", [
      "Scaffolding Manager", "Scaffolding Supervisor", "Scaffolding Foreman",
      "Scaffolding Labourer", "Scaffolder", "Advanced Scaffolder",
    ]),
    defineTrade("plant_operations", "Plant Operations", [
      "Plant Manager", "Plant Supervisor",
      "360 Excavator Operator", "180 Excavator Operator", "Telehandler Operator", "Forward Tipping Dumper Operator",
      "Articulated Dump Truck Operator", "Ride-on Roller Operator", "Dozer Operator", "Loading Shovel Operator",
      "Skid Steer Operator", "Tractor Operator", "Crusher Operator", "Paver Operator",
      "Road Sweeper / Gully Sucker Operator", "Concrete Pump Operator",
    ]),
    defineTrade("lifting_operations", "Lifting Operations", [
      "Lifting Manager",
      "Tower Crane Operator", "Mobile Crane Operator", "Crawler Crane Operator", "Slinger / Signaller", "Crane Supervisor", "Appointed Person",
    ]),
    defineTrade("demolition", "Demolition", [
      "Demolition Manager", "Demolition Supervisor", "Demolition Foreman",
      "Demolition Labourer", "Demolition Operative", "Demolition Plant Operator",
    ]),
    defineTrade("highways_traffic_management", "Highways & Traffic Management", [
      "Highways Manager", "Highways Supervisor",
      "Highways Operative", "Road Surfacing Operative", "Asphalt / Tarmac Operative", "Road Planer Operator",
      "Road Marking Operative", "Traffic Management Operative", "Streetworks Operative",
    ]),
    defineTrade("piling_drilling", "Piling & Drilling", [
      "Piling Manager", "Piling Supervisor", "Piling Foreman",
      "Piling Operative", "Piling Rig Operator", "Land Driller", "Drilling Support Operative",
      "Directional Drilling Operative", "Ground Anchor Installer",
    ]),
    defineTrade("tunnelling", "Tunnelling", [
      "Tunnelling Manager", "Tunnelling Supervisor",
      "Tunnel Miner", "TBM Operative", "Shaft Miner", "Tunnelling Services Operative",
      "Pipejacking / Microtunnelling Operative", "Sprayed Concrete Lining Operative",
    ]),
    defineTrade("rail", "Rail", ["PTS Labourer", "Track Operative", "Track Maintenance Operative", "Rail Site Supervisor"]),
    defineTrade("site_logistics_labour", "Site Logistics & Labour", [
      "Site Logistics Manager", "Site Logistics Supervisor",
      "General Labourer", "Skilled Labourer", "Traffic Marshal", "Banksman / Vehicle Marshaller",
      "Gateperson", "Site Logistics Operative", "Hoist Operator",
    ]),
    defineTrade("cleaning", "Cleaning", [
      "Cleaning Manager", "Cleaning Supervisor", "Construction Site Cleaner", "Welfare Cleaner",
    ]),
    defineTrade("stores_materials", "Stores & Materials", [
      "Stores Manager", "Stores Supervisor", "Storeperson", "Materials Controller",
    ]),
    defineTrade("site_management_supervision", "Site Management & Supervision", [
      "Site Manager", "Assistant Site Manager", "Site Supervisor", "Working Foreman", "Construction Manager",
      "General Foreman", "Finishing Manager", "Logistics Manager", "Site Agent", "Section Manager",
      "Health & Safety Advisor",
    ]),
    defineTrade("surveying_setting_out", "Surveying & Setting Out", [
      "Setting Out Engineer", "Site Engineer", "Land Surveyor", "Engineering Surveyor",
    ]),
    defineTrade("maintenance_multi_trade", "Maintenance & Multi-Trade", [
      "Maintenance Manager", "Maintenance Supervisor",
      "Multi-Trader", "Maintenance Operative", "Handyman / Handy Person", "Building Maintenance Operative",
    ]),
    defineTrade("specialist_access_work_at_height", "Specialist Access & Work at Height", [
      "Rope Access Technician", "Steeplejack", "Lightning Protection Engineer", "Fall Protection Installer",
      "Hoist Installer", "Tower Crane Erector", "Suspended Access Equipment Installer",
    ]),
    defineTrade("lifts_escalators", "Lifts & Escalators", [
      "Lifts & Escalators Manager", "Lifts & Escalators Supervisor",
      "Lift Installer", "Lift Engineer", "Escalator Engineer", "Lift / Escalator Tester", "Platform Lift Installer",
    ]),
    defineTrade("asbestos", "Asbestos", [
      "Asbestos Manager", "Asbestos Supervisor", "Asbestos Removal Operative",
    ]),
    defineTrade("landscaping_fencing", "Landscaping & Fencing", [
      "Landscaping Supervisor", "Landscaping Foreman", "Landscaper", "Hard Landscaper", "Fencing Installer",
    ]),
    defineTrade("renewables", "Renewables", [
      "Renewables Manager", "Renewables Supervisor", "Solar PV Installer", "Heat Pump Installer",
    ]),
  ];

  const tradeByKey = new Map(trades.map((trade) => [trade.key, trade]));
  const tradeByName = new Map(trades.map((trade) => [trade.name.toLowerCase(), trade]));
  const tradeAliases = new Map([
    ["mechanical", "mechanical_pipework"],
    ["plumbing", "plumbing_heating"],
    ["pipefitting", "mechanical_pipework"],
    ["hvac", "hvac_ventilation_refrigeration"],
    ["fire and security", "fire_security_systems"],
    ["data and telecoms", "data_communications"],
    ["drylining", "drylining_ceilings"],
    ["ceilings and partitions", "drylining_ceilings"],
    ["bricklaying", "brickwork_masonry"],
    ["groundworks", "groundworks_civils"],
    ["concrete and formwork", "concrete"],
    ["welding and fabrication", "structural_steel_metalwork"],
    ["cladding", "cladding_facades"],
    ["labouring", "site_logistics_labour"],
    ["logistics", "site_logistics_labour"],
    ["traffic management", "highways_traffic_management"],
    ["management and supervision", "site_management_supervision"],
    ["health and safety", "site_management_supervision"],
  ]);

  function findTrade(value) {
    const candidate = String(value || "").trim();
    const normalized = candidate.toLowerCase();
    const aliasCandidate = normalized.replace(/&/g, "and");
    return tradeByKey.get(candidate)
      || tradeByName.get(normalized)
      || tradeByKey.get(tradeAliases.get(normalized) || tradeAliases.get(aliasCandidate) || "")
      || null;
  }

  function findRole(tradeValue, roleValue) {
    const trade = findTrade(tradeValue);
    const candidate = String(roleValue || "").trim();
    if (!trade || !candidate) return null;
    return trade.roles.find((role) => role.key === candidate || role.name.toLowerCase() === candidate.toLowerCase()) || null;
  }

  function replaceOptions(select, options, selectedValue) {
    if (!(select instanceof HTMLSelectElement)) return;
    select.replaceChildren(...options);
    if (selectedValue) select.value = selectedValue;
    global.OnSiteUI?.syncSelect?.(select, { forceOptions: true });
  }

  function option(value, label, key) {
    const element = document.createElement("option");
    element.value = value;
    element.textContent = label;
    if (key) element.dataset.taxonomyKey = key;
    return element;
  }

  function populateTradeSelect(select, { selectedValue = "", preserveUnknown = false } = {}) {
    const selectedTrade = findTrade(selectedValue);
    const options = [option("", "Select trade")];
    trades.forEach((trade) => options.push(option(trade.name, trade.name, trade.key)));
    if (selectedValue && !selectedTrade && preserveUnknown) {
      options.push(option(selectedValue, selectedValue, ""));
    }
    replaceOptions(select, options, selectedTrade?.name || selectedValue);
  }

  function populateRoleSelect(select, tradeValue, { selectedValue = "", preserveUnknown = false } = {}) {
    if (!(select instanceof HTMLSelectElement)) return;
    const trade = findTrade(tradeValue);
    if (!trade) {
      const options = [option("", "Select a trade first")];
      if (selectedValue && preserveUnknown) {
        options.push(option(selectedValue, selectedValue, ""));
      }
      select.disabled = !(selectedValue && preserveUnknown);
      replaceOptions(select, options, selectedValue && preserveUnknown ? selectedValue : "");
      global.OnSiteUI?.syncSelect?.(select, { forceOptions: true });
      return;
    }
    const selectedRole = findRole(trade.key, selectedValue);
    const options = [option("", "Select role / specialism")];
    trade.roles.forEach((role) => options.push(option(role.name, role.name, role.key)));
    if (selectedValue && !selectedRole && preserveUnknown) {
      options.push(option(selectedValue, selectedValue, ""));
    }
    select.disabled = false;
    replaceOptions(select, options, selectedRole?.name || selectedValue);
  }

  function deepFreeze(value) {
    Object.freeze(value);
    Object.values(value).forEach((entry) => {
      if (entry && typeof entry === "object" && !Object.isFrozen(entry)) deepFreeze(entry);
    });
    return value;
  }

  const taxonomy = deepFreeze({
    trades,
    findTrade,
    findRole,
    tradeKeyFor(value) {
      return findTrade(value)?.key || "";
    },
    roleKeyFor(tradeValue, roleValue) {
      return findRole(tradeValue, roleValue)?.key || "";
    },
    populateTradeSelect,
    populateRoleSelect,
  });
  global.OnSiteTaxonomy = taxonomy;
  if (typeof module !== "undefined" && module.exports) module.exports = taxonomy;
})(typeof window !== "undefined" ? window : globalThis);
