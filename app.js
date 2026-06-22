const STORAGE_KEY = "sitematch_v2";
const ACTIVITY_KEY = "sitematch_activity";

const AVATAR_COLORS = ["av-0", "av-1", "av-2", "av-3", "av-4", "av-5"];

function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = (hash + name.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[hash];
}

function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function reliabilityTier(score) {
  if (score >= 90) return { cls: "badge-elite", label: "Elite" };
  if (score >= 75) return { cls: "badge-good", label: "Good" };
  if (score >= 55) return { cls: "badge-fair", label: "Fair" };
  return { cls: "badge-poor", label: "Poor" };
}

function reliabilityBadge(score, size = 48) {
  const r = size / 2 - 4;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const tier = reliabilityTier(score);
  return `
    <div class="reliability-badge ${tier.cls}">
      <div class="badge-ring" style="width:${size}px;height:${size}px;">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
          <circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}"/>
          <circle class="fill" cx="${size / 2}" cy="${size / 2}" r="${r}"
            stroke-dasharray="${fill} ${circ}"
            stroke-dashoffset="0"/>
        </svg>
        <span class="badge-score">${score}</span>
      </div>
      <span class="badge-label">${tier.label}</span>
    </div>`;
}

function miniBadge(score) {
  const tier = reliabilityTier(score);
  const colorMap = {
    "badge-elite": "var(--orange)",
    "badge-good": "var(--green-text)",
    "badge-fair": "var(--amber-text)",
    "badge-poor": "var(--red-text)",
  };
  return `<span class="match-badge-mini" style="color:${colorMap[tier.cls]}">${score}/100</span>`;
}

function createId() {
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const OFFER_EXPIRY_MS = 24 * 60 * 60 * 1000;
const MISSED_OFFERS_LIMIT = 2;
const MISSED_OFFERS_NOTICE =
  "You've missed 2 job offers and have been set to unavailable. Toggle yourself back to available when you're ready to receive new offers.";
const WORKER_DECLINE_REASONS = [
  "Unavailable / In Work",
  "Rate Too Low",
  "Location / Travel",
  "Start Date Not Suitable",
  "Project Duration Not Suitable",
  "Work Activity Not Suitable",
  "Other",
];
const COMPANY_DECLINE_REASONS = [
  "Reliability Score",
  "Experience Level",
  "Qualifications",
  "Trade / Specialism Fit",
  "Availability / Planned Absence",
  "Other",
];

function clampScore(value) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

function normalize(v) {
  return (v || "").trim().toLowerCase();
}

// Map common trade role/category synonyms to a canonical category so that
// company job trades and worker registration trades match reliably.
const TRADE_SYNONYMS = {
  electrical: "electrical",
  electrician: "electrical",
  electric: "electrical",
  sparky: "electrical",
  plumbing: "plumbing",
  plumber: "plumbing",
  pipefitter: "plumbing",
  carpentry: "carpentry",
  carpenter: "carpentry",
  joiner: "carpentry",
  chippy: "carpentry",
  groundworks: "groundworks",
  groundwork: "groundworks",
  groundworker: "groundworks",
  labourer: "groundworks",
  laborer: "groundworks",
  labouring: "groundworks",
};
function canonicalTrade(v) {
  const n = normalize(v);
  return TRADE_SYNONYMS[n] || n;
}
const TRADE_SPECIALISMS = {
  Electrical: [
    "General Electrical",
    "Testing & Inspection",
    "Commissioning",
    "Fire Alarm Systems",
    "Data & Communications",
    "Industrial Electrical",
    "Building Controls / BMS",
    "EV Charging",
    "Solar PV",
    "Street Lighting",
  ],

  Mechanical: [
    "General Mechanical",
    "Pipefitting",
    "Plant Room Installation",
    "Welding",
    "Commercial Heating",
    "Mechanical Maintenance",
  ],

  Plumbing: [
    "General Plumbing",
    "Commercial Plumbing",
    "Domestic Plumbing",
    "Heating",
    "Sanitaryware",
    "Plant Room Plumbing",
  ],

  HVAC: [
    "Ductwork",
    "Ventilation",
    "Air Conditioning",
    "Refrigeration",
    "Commissioning",
  ],

  "Fire & Security": [
    "Fire Alarm Systems",
    "Security Systems",
    "CCTV",
    "Access Control",
    "Intruder Alarms",
  ],

  "Data & Telecoms": [
    "Data Cabling",
    "Fibre Optics",
    "Telecoms",
    "Network Cabling",
  ],

  Groundworks: [
    "General Groundworks",
    "Drainage",
    "Ducting",
    "Kerbing",
    "Paving",
    "Excavation",
    "Concrete Works",
  ],

  "Carpentry & Joinery": [
    "1st Fix Carpentry",
    "2nd Fix Carpentry",
    "Joinery",
    "Shopfitting",
    "Formwork",
  ],

  Drylining: ["Drylining", "Partitions", "Tape & Jointing", "Ceilings"],

  "Ceilings & Partitions": [
    "Suspended Ceilings",
    "Metal Stud Partitions",
    "Grid Ceilings",
  ],

  Bricklaying: ["Bricklaying", "Blockwork", "Repointing", "Stonework"],

  "Concrete & Formwork": [
    "Formwork",
    "Shuttering",
    "Concrete Finishing",
    "Concrete Repair",
  ],

  "Steel Fixing": ["Steel Fixing", "Rebar Installation"],

  "Welding & Fabrication": [
    "Welding",
    "Fabrication",
    "Structural Steel",
    "Architectural Metalwork",
  ],

  Scaffolding: ["Scaffolding", "Tube & Fitting", "System Scaffold"],

  Roofing: ["Pitched Roofing", "Flat Roofing", "Leadwork", "Roof Repairs"],

  Cladding: [
    "Cladding",
    "Rainscreen Cladding",
    "Curtain Walling",
    "Facade Installation",
  ],

  Glazing: ["Glazing", "Curtain Walling", "Windows & Doors"],

  "Painting & Decorating": [
    "Painting",
    "Decorating",
    "Spraying",
    "Wallpapering",
  ],

  "Plastering & Rendering": [
    "Plastering",
    "Rendering",
    "Skimming",
    "External Wall Insulation",
  ],

  Flooring: [
    "Flooring",
    "Vinyl Flooring",
    "Carpet Fitting",
    "Resin Flooring",
    "Raised Access Flooring",
  ],

  Tiling: ["Wall Tiling", "Floor Tiling", "Ceramic Tiling", "Stone Tiling"],

  Labouring: [
    "General Labouring",
    "Skilled Labouring",
    "Welfare Labouring",
    "Traffic Marshall",
  ],

  "Plant Operations": [
    "Excavator Operator",
    "Dumper Driver",
    "Roller Driver",
    "Telehandler Operator",
    "Crane Operator",
    "Hoist Operator",
  ],

  Logistics: [
    "Logistics Operative",
    "Storeman",
    "Materials Controller",
    "Traffic Marshall",
    "Vehicle Banksman",
  ],

  "Traffic Management": [
    "Traffic Management Operative",
    "Lane Closure",
    "Highways Operative",
  ],

  "Management & Supervision": [
    "Site Supervisor",
    "Site Manager",
    "Project Manager",
    "Contracts Manager",
    "Construction Manager",
    "Package Manager",
    "Foreman / Ganger",
  ],

  "Health & Safety": [
    "Health & Safety Advisor",
    "Health & Safety Manager",
    "Fire Marshal",
    "First Aider",
  ],

  Cleaning: ["Builders Clean", "Sparkle Clean", "Welfare Cleaning"],

  Other: ["Other"],
};
document.addEventListener("DOMContentLoaded", () => {
  const tradeSelect = document.getElementById("jobTrade");
  const specialismSelect = document.getElementById("jobSpecialism");

  if (!tradeSelect || !specialismSelect) return;

  tradeSelect.addEventListener("change", () => {
    const trade = tradeSelect.value;

    specialismSelect.innerHTML = "";

    if (!TRADE_SPECIALISMS[trade]) {
      specialismSelect.innerHTML =
        '<option value="">Select a trade first</option>';
      return;
    }

    specialismSelect.innerHTML =
      '<option value="">Select Role / Specialism</option>';

    TRADE_SPECIALISMS[trade].forEach((specialism) => {
      const option = document.createElement("option");
      option.value = specialism;
      option.textContent = specialism;
      specialismSelect.appendChild(option);
    });
  });
});
function setupTradeSpecialismDropdowns() {
  const tradeSelect = document.getElementById("jobTrade");
  const specialismSelect = document.getElementById("jobSpecialism");

  if (!tradeSelect || !specialismSelect) return;

  tradeSelect.addEventListener("change", () => {
    const selectedTrade = tradeSelect.value;

    specialismSelect.innerHTML = "";

    if (!selectedTrade || !TRADE_SPECIALISMS[selectedTrade]) {
      specialismSelect.innerHTML = `<option value="">Select a trade first</option>`;
      specialismSelect.disabled = true;
      return;
    }

    specialismSelect.disabled = false;

    specialismSelect.innerHTML = `<option value="">Select role / specialism</option>`;

    TRADE_SPECIALISMS[selectedTrade].forEach((specialism) => {
      const option = document.createElement("option");
      option.value = specialism;
      option.textContent = specialism;
      specialismSelect.appendChild(option);
    });
  });
}

document.addEventListener("DOMContentLoaded", setupTradeSpecialismDropdowns);
// ─── Booking Protection ───────────────────────────────────
// Number of working days (Mon–Fri) from today (inclusive) up to, but not
// including, the job start date. Weekends are ignored. Bank holidays are not
// considered for MVP.
function workingDaysUntil(startDateStr) {
  if (!startDateStr) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const start = new Date(startDateStr);
  start.setHours(0, 0, 0, 0);
  if (isNaN(start)) return null;
  if (start <= now) return 0;
  let count = 0;
  const cur = new Date(now);
  while (cur < start) {
    const day = cur.getDay(); // 0 Sun … 6 Sat
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// Parse a numeric day rate out of a free-text pay field (e.g. "£250/day" → 250).
function parseDayRate(str) {
  if (typeof str === "number") return Math.round(str);
  if (!str) return 0;
  const m = String(str)
    .replace(/,/g, "")
    .match(/\d+(\.\d+)?/);
  return m ? Math.round(parseFloat(m[0])) : 0;
}

function formatMoney(n) {
  return "£" + Number(n || 0).toLocaleString("en-GB");
}

// The protection window: cancelling within 3 working days of the start date
// makes 1 day's pay payable to the worker.
const PROTECTION_WINDOW_DAYS = 3;

// ─── Project Extension & Reallocation ─────────────────────
// Construction projects often overrun, so OnSite checks whether a company
// wants to extend its workers before a booking's estimated end date. If no
// extension is confirmed in time, the worker is freed for future bookings.
const EXTENSION_REMIND_DAYS = 14; // first reminder window (calendar days)
const EXTENSION_SECOND_DAYS = 7; // second reminder window (calendar days)
const DEFAULT_NOTICE_DAYS = 5; // working days before end → auto end-as-planned

// Whole calendar days from today (00:00) until the given date. May be negative
// if the date is in the past. Returns null for an unparseable/empty date.
function calendarDaysUntil(dateStr) {
  if (!dateStr) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  if (isNaN(target)) return null;
  return Math.round((target - now) / 86400000);
}

// Human-readable label for a booking's extension/availability status.
function extensionStatusLabel(job) {
  const map = {
    extended: { txt: "Extended", cls: "ext-extended" },
    ending_as_planned: { txt: "Ending as planned", cls: "ext-ending" },
    declined_by_worker: { txt: "Declined by worker", cls: "ext-declined" },
    declined_by_company: { txt: "Declined by company", cls: "ext-declined" },
  };
  if (job.extensionStatus && map[job.extensionStatus])
    return map[job.extensionStatus];
  if (job.extensionRequestedAt)
    return { txt: "Awaiting worker response", cls: "ext-pending" };
  if (job.extensionJustExtended)
    return { txt: "Extended", cls: "ext-extended" };
  return { txt: "On schedule", cls: "ext-ok" };
}

// True when a worker on this booking can be offered future work (their booking
// is winding down and no extension is in force).
function isReallocatable(job) {
  return ["available_soon", "available_from_end_date", "reassigned"].includes(
    job?.workerAvailabilityStatus,
  );
}

// Initialise extension fields on a confirmed booking (idempotent).
function initExtensionFields(job) {
  if (!job) return;
  if (job.noticePeriodDays == null) job.noticePeriodDays = DEFAULT_NOTICE_DAYS;
  if (!job.extensionStatus) job.extensionStatus = "pending";
  if (!job.workerAvailabilityStatus) job.workerAvailabilityStatus = "booked";
}

// Lifecycle engine — run on every render. Walks confirmed, non-completed
// bookings that have an estimated end date and advances their extension state
// based on how close the end date is. Returns true if anything changed.
function processExtensionLifecycle() {
  let changed = false;
  state.jobs.forEach((job) => {
    if (!job.assignedWorkerId || job.completed) return;
    if (!(job.estimatedEndDate || job.endDate)) return;
    const endDate = job.estimatedEndDate || job.endDate;

    initExtensionFields(job);

    // Settled bookings (extended / declined / already ending) need no further
    // automatic transitions.
    if (job.extensionStatus !== "pending") return;

    const calDays = calendarDaysUntil(endDate);
    const workDays = workingDaysUntil(endDate);
    const worker = findWorker(job.assignedWorkerId);
    const wName = worker?.name || "Worker";

    // Once a freshly-extended booking nears its new end date, drop the
    // "confirmed" note so the normal reminder cycle can surface again.
    if (
      job.extensionJustExtended &&
      calDays !== null &&
      calDays <= EXTENSION_REMIND_DAYS
    ) {
      job.extensionJustExtended = false;
      changed = true;
    }

    // ≤ notice period (working days): auto end-as-planned, worker freed.
    if (
      workDays !== null &&
      workDays <= (job.noticePeriodDays || DEFAULT_NOTICE_DAYS)
    ) {
      job.extensionStatus = "ending_as_planned";
      job.workerAvailabilityStatus = "available_from_end_date";
      changed = true;
      logActivity(
        "extension",
        `<strong>${escapeHtml(wName)}</strong>'s booking (${escapeHtml(job.trade)}) ends in ${workDays} working day${workDays === 1 ? "" : "s"} with no extension confirmed — now available for future projects.`,
      );
      return;
    }

    // 7 calendar days: second reminder + prioritise for matching.
    if (calDays !== null && calDays <= EXTENSION_SECOND_DAYS) {
      if (job.workerAvailabilityStatus === "booked") {
        job.workerAvailabilityStatus = "available_soon";
        changed = true;
      }
      if (!job._remind7) {
        job._remind7 = true;
        changed = true;
        logActivity(
          "extension",
          `Reminder: <strong>${escapeHtml(job.trade)}</strong> booking ends in ${calDays} day${calDays === 1 ? "" : "s"}. Confirm an extension or the worker will be released.`,
        );
      }
      return;
    }

    // 14 calendar days: first reminder + flag worker as available soon.
    if (calDays !== null && calDays <= EXTENSION_REMIND_DAYS) {
      if (job.workerAvailabilityStatus === "booked") {
        job.workerAvailabilityStatus = "available_soon";
        changed = true;
      }
      if (!job._remind14) {
        job._remind14 = true;
        changed = true;
        logActivity(
          "extension",
          `This booking (<strong>${escapeHtml(job.trade)}</strong>) is due to end in ${calDays} days. Do you want to extend these workers?`,
        );
      }
    }
  });
  return changed;
}

// Given a job/booking, work out the cancellation outcome if cancelled now.
function computeCancellation(job) {
  const dayRate =
    job.agreedDayRate != null ? job.agreedDayRate : parseDayRate(job.payRate);
  const workingDays = workingDaysUntil(job.startDate || job.start);
  const inWindow =
    workingDays !== null && workingDays <= PROTECTION_WINDOW_DAYS;
  const amount = inWindow ? dayRate : 0;
  return { dayRate, workingDays, inWindow, paymentDue: inWindow, amount };
}

// Inline "OnSite Protected Booking" notice shown on a confirmed booking.
function bookingProtectionBanner(job) {
  const { dayRate, inWindow } = computeCancellation(job);
  const rateStr = dayRate
    ? ` The agreed rate is <strong>${formatMoney(dayRate)}/day</strong>.`
    : "";
  return `
  <div class="protection-banner${inWindow ? " in-window" : ""}">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
    <span><strong>OnSite Protected Booking:</strong> If this booking is cancelled within ${PROTECTION_WINDOW_DAYS} working days of the start date, the worker will receive 1 day's pay at the agreed rate.${rateStr}</span>
  </div>`;
}

// Bind any [data-cancel-booking] buttons within a container to open the modal.
function bindCancelBookingButtons(container) {
  (container || document)
    .querySelectorAll("[data-cancel-booking]")
    .forEach((btn) => {
      btn.addEventListener("click", () =>
        openCancelBookingModal(btn.dataset.cancelBooking),
      );
    });
}

// ─── Extension actions ────────────────────────────────────
// Company asks to extend a worker. The worker must accept before it takes
// effect — a company can never hold a worker past the estimated end date.
function requestExtension(jobId, newEndDate, newRate) {
  const job = findJob(jobId);
  if (!job || !job.assignedWorkerId || !newEndDate) return;
  initExtensionFields(job);
  job.newProposedEndDate = newEndDate;
  const baseRate =
    job.agreedDayRate != null ? job.agreedDayRate : parseDayRate(job.payRate);
  job.proposedDayRate =
    newRate !== "" && newRate != null ? parseDayRate(newRate) : baseRate;
  job.extensionRequestedAt = new Date().toISOString();
  job.extensionResponseDeadline = newEndDate;
  const w = findWorker(job.assignedWorkerId);
  logActivity(
    "extension",
    `Extension requested for <strong>${escapeHtml(w?.name || "worker")}</strong> until ${formatDate(newEndDate)} at ${formatMoney(job.proposedDayRate)}/day — awaiting their response.`,
  );
  saveAndRender();
  showToast("Extension request sent to worker");
}

function acceptExtension(jobId) {
  const job = findJob(jobId);
  if (!job) return;
  if (job.newProposedEndDate) job.estimatedEndDate = job.newProposedEndDate;
  if (job.proposedDayRate) {
    job.agreedDayRate = job.proposedDayRate;
    job.payRate = `£${job.proposedDayRate}/day`;
  }
  // Re-arm the lifecycle against the NEW end date: status returns to "pending"
  // and the booking is treated as on-schedule until it again nears its end. A
  // company still can't hold the worker past this new date without a fresh
  // accepted extension.
  job.extensionStatus = "pending";
  job.extensionJustExtended = true; // surfaces the "confirmed" note until next cycle
  job.workerAvailabilityStatus = "booked";
  job.extensionRequestedAt = "";
  job.newProposedEndDate = "";
  job.proposedDayRate = null;
  job.extensionResponseDeadline = "";
  job._remind14 = false;
  job._remind7 = false; // allow a fresh cycle before the new end date
  const w = findWorker(job.assignedWorkerId);
  logActivity(
    "extension",
    `<strong>${escapeHtml(w?.name || "Worker")}</strong> accepted the extension — booking now runs to ${formatDate(job.estimatedEndDate)}.`,
  );
  saveAndRender();
  showToast("Extension accepted");
}

function declineExtension(jobId) {
  const job = findJob(jobId);
  if (!job) return;
  // Declining must NOT affect the worker's reliability score.
  job.extensionStatus = "declined_by_worker";
  job.workerAvailabilityStatus = "available_from_end_date";
  job.extensionRequestedAt = "";
  job.newProposedEndDate = "";
  job.proposedDayRate = null;
  const w = findWorker(job.assignedWorkerId);
  logActivity(
    "extension",
    `<strong>${escapeHtml(w?.name || "Worker")}</strong> declined the extension — booking ends as planned on ${formatDate(job.estimatedEndDate)}; now available for future projects.`,
  );
  saveAndRender();
  showToast("Extension declined — your booking ends on the original date");
}

function endBookingAsPlanned(jobId) {
  const job = findJob(jobId);
  if (!job) return;
  job.extensionStatus = "ending_as_planned";
  job.workerAvailabilityStatus = "available_from_end_date";
  job.extensionRequestedAt = "";
  job.newProposedEndDate = "";
  const w = findWorker(job.assignedWorkerId);
  logActivity(
    "extension",
    `Booking for <strong>${escapeHtml(w?.name || "worker")}</strong> set to end as planned on ${formatDate(job.estimatedEndDate)} — worker released for future projects.`,
  );
  saveAndRender();
  showToast("Booking will end as planned");
}

// ─── Extension reminder panel (company / admin) ───────────
function bookingsNeedingExtension() {
  return state.jobs.filter((j) => {
    if (!j.assignedWorkerId || j.completed) return false;
    const endDate = j.estimatedEndDate || j.endDate;
    if (!endDate) return false;
    const cal = calendarDaysUntil(endDate);
    const settled = j.extensionStatus && j.extensionStatus !== "pending";
    return (
      (cal !== null && cal <= EXTENSION_REMIND_DAYS) ||
      settled ||
      j.extensionRequestedAt ||
      j.extensionJustExtended
    );
  });
}

function companyOwnsJob(job, companyId) {
  return !!companyId && job?.companyId === companyId;
}

function extensionReminderCard(job) {
  const w = findWorker(job.assignedWorkerId);
  const endDate = job.estimatedEndDate || job.endDate;
  const cal = calendarDaysUntil(endDate);
  const status = extensionStatusLabel(job);
  const awaiting = !!job.extensionRequestedAt;
  const dayRate =
    job.agreedDayRate != null ? job.agreedDayRate : parseDayRate(job.payRate);

  const daysTxt =
    cal === null
      ? ""
      : cal < 0
        ? `Ended ${Math.abs(cal)}d ago`
        : cal === 0
          ? "Ends today"
          : `Ends in ${cal} day${cal === 1 ? "" : "s"}`;

  let actions = "";
  if (awaiting) {
    actions = `<div class="ext-await">Awaiting ${escapeHtml(w?.name || "worker")}'s response — proposed end ${formatDate(job.newProposedEndDate)} at ${formatMoney(job.proposedDayRate || dayRate)}/day.</div>`;
  } else if (job.extensionJustExtended) {
    actions = `<div class="ext-await">Worker accepted — booking confirmed to ${formatDate(endDate)}.</div>`;
  } else {
    const reEngage =
      job.extensionStatus === "ending_as_planned" ||
      job.extensionStatus === "declined_by_worker";
    actions = `<div class="ext-actions">
      <button class="ext-btn ext-btn-extend" type="button" data-ext-extend="${job.id}">${reEngage ? "Offer Extension" : "Extend Worker"}</button>
      ${reEngage ? "" : `<button class="ext-btn ext-btn-end" type="button" data-ext-end="${job.id}">End as Planned</button>`}
    </div>`;
  }

  return `
  <div class="ext-card">
    <div class="ext-card-top">
      <div class="ext-card-who">
        <div class="ext-card-name">${escapeHtml(w?.name || "Unassigned")}</div>
        <div class="ext-card-meta">${escapeHtml(job.trade)}${job.location ? ` · ${escapeHtml(job.location)}` : ""}</div>
      </div>
      <span class="ext-status ${status.cls}">${status.txt}</span>
    </div>
    <div class="ext-card-dates">
      <span class="ext-end">${endDate ? formatDate(endDate) : "No end date"}</span>
      ${daysTxt ? `<span class="ext-days">${daysTxt}</span>` : ""}
    </div>
    ${actions}
  </div>`;
}

function extensionPanelHTML(companyId = null) {
  const list = bookingsNeedingExtension().filter((job) =>
    companyId ? companyOwnsJob(job, companyId) : true,
  );
  if (!list.length) return "";
  return `
  <div class="ext-panel">
    <div class="ext-panel-head">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <span>Booking Extensions</span>
    </div>
    <div class="ext-panel-sub">Confirm extensions before bookings end, or workers are released for new projects.</div>
    ${list.map(extensionReminderCard).join("")}
  </div>`;
}

// Populate the admin dashboard's #extensionReminders container (self-clears for
// non-admin sessions so it never leaks across logins).
function renderExtensionReminders() {
  const el = document.getElementById("extensionReminders");
  if (!el) return;
  if (getSessionUser()) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = extensionPanelHTML();
  bindExtensionButtons(el);
}

// Admin-only overview of all job agreements (self-clears for other sessions).
function renderAgreementsOverview() {
  const el = document.getElementById("agreementsOverview");
  if (!el) return;
  if (getSessionUser()) {
    el.innerHTML = "";
    return;
  }
  const list = [...(state.agreements || [])].sort(
    (a, b) => new Date(b.generatedAt || 0) - new Date(a.generatedAt || 0),
  );
  if (!list.length) {
    el.innerHTML = "";
    return;
  }
  const counts = {
    active: list.filter((a) => a.status === "active").length,
    pending: list.filter((a) => a.status === "pending").length,
  };
  el.innerHTML = `
    <div class="agr-overview">
      <div class="agr-overview-head">
        <span class="agr-overview-title">Job Agreements</span>
        <span class="agr-overview-tags">
          <span class="agr-tag agr-status--ok">${counts.active} active</span>
          <span class="agr-tag agr-status--warn">${counts.pending} pending</span>
        </span>
      </div>
      ${list
        .slice(0, 6)
        .map((a) => {
          const meta = agreementStatusMeta(a);
          return `
          <button class="agr-hist-row" type="button" data-agr-open="${a.id}">
            <div class="agr-hist-main">
              <div class="agr-hist-title">${escapeHtml(a.terms.trade)} · ${escapeHtml(a.terms.siteName)}</div>
              <div class="agr-hist-sub">${escapeHtml(a.terms.companyName)} → ${escapeHtml(a.terms.workerName)}</div>
            </div>
            <span class="agr-hist-status agr-status--${meta.cls}">${escapeHtml(meta.label)}</span>
          </button>`;
        })
        .join("")}
    </div>`;
  bindAgreementOpeners(el);
}

function bindExtensionButtons(container) {
  const root = container || document;
  root
    .querySelectorAll("[data-ext-extend]")
    .forEach((btn) =>
      btn.addEventListener("click", () =>
        openExtensionModal(btn.dataset.extExtend),
      ),
    );
  root
    .querySelectorAll("[data-ext-end]")
    .forEach((btn) =>
      btn.addEventListener("click", () =>
        endBookingAsPlanned(btn.dataset.extEnd),
      ),
    );
  root
    .querySelectorAll("[data-ext-accept]")
    .forEach((btn) =>
      btn.addEventListener("click", () =>
        acceptExtension(btn.dataset.extAccept),
      ),
    );
  root
    .querySelectorAll("[data-ext-decline]")
    .forEach((btn) =>
      btn.addEventListener("click", () =>
        declineExtension(btn.dataset.extDecline),
      ),
    );
}

// ─── Extension modal (company extend flow) ────────────────
let currentExtensionJobId = null;
function openExtensionModal(jobId) {
  const job = findJob(jobId);
  if (!job) return;
  currentExtensionJobId = jobId;
  const w = findWorker(job.assignedWorkerId);
  const modal = document.getElementById("extensionModal");
  const who = document.getElementById("extModalWho");
  const endIn = document.getElementById("extNewEnd");
  const rateChoice = document.getElementById("extRateChoice");
  const rateWrap = document.getElementById("extNewRateWrap");
  if (who)
    who.textContent = `Extend ${w?.name || "this worker"}'s ${job.trade} booking. They must accept before it takes effect.`;
  if (endIn) endIn.value = job.estimatedEndDate || job.endDate || "";
  if (rateChoice) rateChoice.value = "same";
  if (rateWrap) rateWrap.classList.add("hidden");
  modal?.classList.remove("hidden");
}
function closeExtensionModal() {
  currentExtensionJobId = null;
  document.getElementById("extensionModal")?.classList.add("hidden");
}

// ─── Digital Job Agreement System ─────────────────────────
// On booking confirmation a Job Agreement is generated. Both the worker and the
// company must review and accept (a digital signature is recorded) before the
// booking becomes Active. Until then the worker cannot check in, use GPS
// attendance, or open site navigation. Agreements are stored permanently in
// state.agreements so both parties keep a full history.
const AGREEMENT_DEFAULTS = {
  attendanceRequirements:
    "Arrive on site for the agreed start time each working day. Check in via the OnSite site QR code on arrival and report any delay or absence through OnSite as early as possible.",
  reliabilityRules:
    "Attendance is recorded against your OnSite reliability score. Confirmed lateness and no-shows affect your score. Genuine issues reported in advance and reviewed by your supervisor will not unfairly penalise you.",
  siteRules:
    "Follow all site safety rules and signage at all times. Wear the required PPE. Comply with reasonable instructions from the site supervisor.",
  paymentTerms:
    "Payment is made at the agreed day rate for each confirmed day worked, processed through the company's standard payment cycle.",
};

function findAgreement(id) {
  return (state.agreements || []).find((a) => a.id === id) || null;
}
function agreementForJob(job) {
  return job && job.agreementId ? findAgreement(job.agreementId) : null;
}

// Company-specific documents (site rules, induction, H&S, project requirements).
function getCompanyDocs(companyId, st = state) {
  if (!companyId) return [];
  return (st.companyDocuments && st.companyDocuments[companyId]) || [];
}
function addCompanyDoc(companyId, doc) {
  if (!companyId) return;
  if (!state.companyDocuments) state.companyDocuments = {};
  if (!state.companyDocuments[companyId])
    state.companyDocuments[companyId] = [];
  state.companyDocuments[companyId].push({ id: createId(), ...doc });
}
function removeCompanyDoc(companyId, docId) {
  const list = state.companyDocuments?.[companyId];
  if (!list) return;
  state.companyDocuments[companyId] = list.filter((d) => d.id !== docId);
}

// A digital signature record for one party accepting the agreement.
function captureSignature(name) {
  const now = new Date();
  return {
    accepted: true,
    at: now.toISOString(),
    date: now.toLocaleDateString("en-GB"),
    time: now.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    user: name || "User",
    device: (typeof navigator !== "undefined" ? navigator.userAgent : "").slice(
      0,
      140,
    ),
    ip: "", // optional — not collected client-side
  };
}

// Pure builder: assemble an agreement record from a job + lookups. Used both at
// confirm-time (against the live state) and during migration (against a state
// being loaded), so it must not touch the global `state`.
function buildAgreementRecord(
  job,
  { worker, companyName, dayRate, docs, opts = {} },
) {
  const agr = {
    id: createId(),
    jobId: job.id,
    workerId: job.assignedWorkerId,
    companyId: job.companyId || "",
    generatedAt: new Date().toISOString(),
    status: "pending",
    terms: {
      workerName: worker?.name || "Worker",
      companyName: companyName || "Company",
      siteName: job.siteName || job.location || "Site",
      siteAddress: job.siteAddress || job.location || "—",
      trade: job.trade || "—",
      role: job.workActivity || job.trade || "-",
      payRate: dayRate ? `${formatMoney(dayRate)}/day` : job.payRate || "—",
      workerPay:
        job.pricing?.workerPay != null
          ? job.pricing.workerPay
          : dayRate || null,
      companyCharge:
        job.companyCharge != null
          ? job.companyCharge
          : job.pricing?.companyCharge != null
            ? job.pricing.companyCharge
            : jobBudget(job) || null,
      startDate: job.startDate || job.start || "",
      duration: job.duration || "—",
      attendanceRequirements: AGREEMENT_DEFAULTS.attendanceRequirements,
      reliabilityRules: AGREEMENT_DEFAULTS.reliabilityRules,
      siteRules: job.siteRules || AGREEMENT_DEFAULTS.siteRules,
      paymentTerms: AGREEMENT_DEFAULTS.paymentTerms,
    },
    documents: (docs || []).map((d) => ({ ...d })),
    worker: { accepted: false },
    company: { accepted: false },
  };
  if (opts.workerAccepted) agr.worker = captureSignature(agr.terms.workerName);
  if (opts.companyAccepted)
    agr.company = captureSignature(agr.terms.companyName);
  return agr;
}

// Generate (once) the agreement for a confirmed booking on the live state.
// Reuses an existing agreement only when it still matches the current
// assignment and is not terminal; otherwise it detaches the stale linkage so a
// fresh agreement is created for the newly assigned worker (the old record is
// preserved in state.agreements as history).
function generateAgreementForBooking(job, opts = {}) {
  if (!job || !job.assignedWorkerId) return null;
  if (!Array.isArray(state.agreements)) state.agreements = [];
  const existing = agreementForJob(job);
  if (
    existing &&
    existing.status !== "declined_by_worker" &&
    existing.status !== "cancelled" &&
    existing.workerId === job.assignedWorkerId
  ) {
    return existing;
  }
  // Stale or mismatched linkage (e.g. reassignment to a different worker):
  // terminalize the prior live agreement so it becomes history-only and can no
  // longer be signed or toggle this booking, then detach before generating a
  // fresh one.
  if (
    existing &&
    existing.status !== "declined_by_worker" &&
    existing.status !== "cancelled"
  ) {
    existing.status = "cancelled";
  }
  job.agreementId = "";
  job.bookingActive = false;
  const worker = findWorker(job.assignedWorkerId);
  const dayRate =
    job.agreedDayRate != null ? job.agreedDayRate : parseDayRate(job.payRate);
  const agr = buildAgreementRecord(job, {
    worker,
    companyName: job.companyName || "Company",
    dayRate,
    docs: getCompanyDocs(job.companyId),
    opts,
  });
  state.agreements.push(agr);
  job.agreementId = agr.id;
  recomputeAgreement(agr);
  return agr;
}

// Recompute an agreement's status and the booking's Active flag.
function recomputeAgreement(agr) {
  if (!agr) return;
  const job = findJob(agr.jobId);
  // Only the job's *current* agreement may drive its active flag. A stale,
  // detached agreement kept as history must never toggle a live booking.
  const isCurrent = !!job && job.agreementId === agr.id;
  if (agr.status === "declined_by_worker" || agr.status === "cancelled") {
    if (isCurrent) job.bookingActive = false;
    return;
  }
  if (agr.worker?.accepted && agr.company?.accepted) {
    agr.status = "active";
    if (isCurrent) job.bookingActive = true;
  } else {
    agr.status = "pending";
    if (isCurrent) job.bookingActive = false;
  }
}

// A booking can be worked only when its agreement is active. Bookings created
// before this feature (no agreementId) are treated as active so legacy flows
// keep working.
function bookingAgreementActive(job) {
  if (!job) return false;
  if (!job.agreementId) return true;
  return !!job.bookingActive;
}

// Worker-facing status of their agreement, for labels/banners.
function agreementWorkerState(agr) {
  if (!agr) return "none";
  if (agr.status === "active") return "active";
  if (agr.status === "declined_by_worker") return "declined";
  if (agr.status === "cancelled") return "cancelled";
  if (!agr.worker?.accepted) return "pending_worker"; // worker must act
  return "pending_company"; // waiting on company
}

// ─── Agreement actions ────────────────────────────────────
// A terminal (declined/cancelled) or detached agreement is history-only and can
// no longer be signed or cancelled.
function agreementIsActionable(agr) {
  if (!agr) return false;
  if (agr.status === "declined_by_worker" || agr.status === "cancelled")
    return false;
  const job = findJob(agr.jobId);
  return !!job && job.agreementId === agr.id;
}

function workerAcceptAgreement(agreementId) {
  const agr = findAgreement(agreementId);
  if (!agr || agr.worker?.accepted || !agreementIsActionable(agr)) return;
  agr.worker = captureSignature(agr.terms.workerName);
  recomputeAgreement(agr);
  closeAgreementModal();
  logActivity(
    "agreement",
    `<strong>${escapeHtml(agr.terms.workerName)}</strong> accepted the job agreement for ${escapeHtml(agr.terms.trade)} at ${escapeHtml(agr.terms.siteName)}${agr.status === "active" ? " — booking is now active." : " — awaiting company confirmation."}`,
  );
  saveAndRender();
  showToast(
    agr.status === "active"
      ? "Agreement accepted — booking active"
      : "Agreement accepted — awaiting company",
  );
}

// Declining must NOT affect the worker's reliability score. The slot is freed so
// the company can re-book; no cancellation/protection payment is triggered
// because work was never agreed.
function workerDeclineAgreement(agreementId) {
  const agr = findAgreement(agreementId);
  if (!agr || !agreementIsActionable(agr)) return;
  agr.status = "declined_by_worker";
  const job = findJob(agr.jobId);
  if (job) {
    job.bookingActive = false;
    job.assignedWorkerId = "";
    job.workerId = "";
    job.bookingStatus = "pending";
    // Detach the (now terminal) agreement so a re-booking generates a fresh one.
    // The declined record stays in state.agreements as history.
    job.agreementId = "";
  }
  closeAgreementModal();
  logActivity(
    "agreement",
    `<strong>${escapeHtml(agr.terms.workerName)}</strong> declined the job agreement for ${escapeHtml(agr.terms.trade)} at ${escapeHtml(agr.terms.siteName)}. Reliability is unaffected; the role is open again.`,
  );
  saveAndRender();
  showToast("Agreement declined — your reliability is unaffected");
}

function companyAcceptAgreement(agreementId) {
  const agr = findAgreement(agreementId);
  if (!agr || agr.company?.accepted || !agreementIsActionable(agr)) return;
  // Claim ownership for seeded/legacy agreements that have no companyId yet.
  const sess = getSessionUser();
  if (!agr.companyId && sess?.type === "company") {
    agr.companyId = sess.id;
    const job = findJob(agr.jobId);
    if (job && !job.companyId) job.companyId = sess.id;
  }
  agr.company = captureSignature(agr.terms.companyName);
  recomputeAgreement(agr);
  closeAgreementModal();
  logActivity(
    "agreement",
    `<strong>${escapeHtml(agr.terms.companyName)}</strong> confirmed the job agreement for ${escapeHtml(agr.terms.workerName)}${agr.status === "active" ? " — booking is now active." : " — awaiting worker acceptance."}`,
  );
  saveAndRender();
  showToast(
    agr.status === "active"
      ? "Agreement confirmed — booking active"
      : "Agreement confirmed — awaiting worker",
  );
}

function companyCancelAgreementBooking(agreementId) {
  const agr = findAgreement(agreementId);
  if (!agr || !agreementIsActionable(agr)) return;
  agr.status = "cancelled";
  const job = findJob(agr.jobId);
  if (job) {
    job.bookingActive = false;
    job.assignedWorkerId = "";
    job.workerId = "";
    job.bookingStatus = "pending";
    // Detach the (now terminal) agreement so a re-booking generates a fresh one.
    // The cancelled record stays in state.agreements as history.
    job.agreementId = "";
  }
  closeAgreementModal();
  logActivity(
    "agreement",
    `Booking cancelled before activation by <strong>${escapeHtml(agr.terms.companyName)}</strong> for ${escapeHtml(agr.terms.trade)} at ${escapeHtml(agr.terms.siteName)} — the role is open again.`,
  );
  saveAndRender();
  showToast("Booking cancelled");
}

// Backfill agreements while a state is being loaded (operates on `s`, not the
// global state). Legacy confirmed bookings auto-accept both sides so they stay
// workable; demo seeds honour their agreementSeed.
function ensureAgreementsForState(s) {
  if (!Array.isArray(s.agreements)) s.agreements = [];
  if (!s.companyDocuments || typeof s.companyDocuments !== "object")
    s.companyDocuments = {};
  (s.jobs || []).forEach((job) => {
    if (!job.assignedWorkerId || job.completed || job.agreementId) return;
    const worker = (s.workers || []).find((w) => w.id === job.assignedWorkerId);
    const dayRate =
      job.agreedDayRate != null ? job.agreedDayRate : parseDayRate(job.payRate);
    const seed = job.agreementSeed;
    const opts =
      seed === "pending_worker"
        ? { companyAccepted: true } // company done, worker still to accept
        : { workerAccepted: true, companyAccepted: true }; // "active" / legacy
    const agr = buildAgreementRecord(job, {
      worker,
      companyName: job.companyName || "Company",
      dayRate,
      docs: getCompanyDocs(job.companyId, s),
      opts,
    });
    s.agreements.push(agr);
    job.agreementId = agr.id;
    // Inline recompute against `s` (recomputeAgreement uses global state).
    if (agr.worker.accepted && agr.company.accepted) {
      agr.status = "active";
      job.bookingActive = true;
    } else {
      agr.status = "pending";
      job.bookingActive = false;
    }
  });
  // One-time cleanup for state persisted before the detach fix: terminalize any
  // pending agreement that is no longer its job's current one, so stale records
  // can't linger as actionable/misleading history.
  (s.agreements || []).forEach((agr) => {
    if (agr.status !== "pending") return;
    const job = (s.jobs || []).find((j) => j.id === agr.jobId);
    if (!job || job.agreementId !== agr.id) agr.status = "cancelled";
  });
}

// ─── Agreement modal (review + sign) ──────────────────────
function agreementStatusMeta(agr) {
  switch (agr.status) {
    case "active":
      return { cls: "ok", label: "Active — both parties accepted" };
    case "declined_by_worker":
      return { cls: "bad", label: "Declined by worker" };
    case "cancelled":
      return { cls: "bad", label: "Booking cancelled" };
    default:
      if (agr.worker?.accepted)
        return { cls: "warn", label: "Awaiting company confirmation" };
      if (agr.company?.accepted)
        return { cls: "warn", label: "Awaiting worker acceptance" };
      return { cls: "warn", label: "Awaiting both signatures" };
  }
}

function signatureBlockHtml(label, sig) {
  if (sig?.accepted) {
    return `
      <div class="sig-block sig-block--signed">
        <div class="sig-block-head">
          <span class="sig-role">${escapeHtml(label)}</span>
          <span class="sig-badge">✓ Signed</span>
        </div>
        <div class="sig-meta">
          <div><span>Signed by</span><strong>${escapeHtml(sig.user || "—")}</strong></div>
          <div><span>Date &amp; time</span><strong>${escapeHtml(sig.date || "")} ${escapeHtml(sig.time || "")}</strong></div>
          <div><span>Device</span><strong>${escapeHtml(sig.device || "—")}</strong></div>
          ${sig.ip ? `<div><span>IP address</span><strong>${escapeHtml(sig.ip)}</strong></div>` : ""}
        </div>
      </div>`;
  }
  return `
    <div class="sig-block sig-block--pending">
      <div class="sig-block-head">
        <span class="sig-role">${escapeHtml(label)}</span>
        <span class="sig-badge sig-badge--pending">Awaiting signature</span>
      </div>
    </div>`;
}

function buildAgreementBody(agr) {
  const t = agr.terms;
  const meta = agreementStatusMeta(agr);
  // Role-appropriate rate line: the company sees only the all-in charge; the
  // worker sees only their guaranteed pay; admin/recruiter sees both.
  const viewerType = getSessionUser()?.type;
  const rateLine =
    viewerType === "company"
      ? t.companyCharge != null
        ? `${formatMoney(t.companyCharge)}/day (all-in)`
        : t.payRate || "—"
      : viewerType === "worker"
        ? t.workerPay != null
          ? `${formatMoney(t.workerPay)}/day guaranteed`
          : t.payRate || "—"
        : t.workerPay != null || t.companyCharge != null
          ? `Worker ${t.workerPay != null ? formatMoney(t.workerPay) : "—"} · Charge ${t.companyCharge != null ? formatMoney(t.companyCharge) : "—"}`
          : t.payRate || "—";
  const term = (title, body) => `
    <div class="agr-term">
      <div class="agr-term-title">${escapeHtml(title)}</div>
      <p class="agr-term-body">${escapeHtml(body)}</p>
    </div>`;
  const fact = (label, val) => `
    <div class="agr-fact"><div class="agr-fact-lbl">${escapeHtml(label)}</div><div class="agr-fact-val">${escapeHtml(val || "—")}</div></div>`;

  const docCat = {
    rules: "Site Rules",
    induction: "Induction",
    hs: "Health & Safety",
    project: "Project Requirements",
    other: "Document",
  };
  const docsHtml = (agr.documents || []).length
    ? `<div class="agr-section">
         <div class="agr-section-title">Site Documents to Review</div>
         <p class="agr-section-hint">Please read all documents below before accepting.</p>
         ${agr.documents
           .map(
             (d) => `
           <div class="agr-doc">
             <div class="agr-doc-head">
               <span class="agr-doc-title">${escapeHtml(d.title || "Document")}</span>
               <span class="agr-doc-cat">${escapeHtml(docCat[d.category] || "Document")}</span>
             </div>
             <p class="agr-doc-body">${escapeHtml(d.body || "")}</p>
           </div>`,
           )
           .join("")}
       </div>`
    : "";

  return `
    <div class="agr-status agr-status--${meta.cls}">${escapeHtml(meta.label)}</div>

    <div class="agr-parties">
      <div class="agr-party"><span>Worker</span><strong>${escapeHtml(t.workerName)}</strong></div>
      <div class="agr-party"><span>Company</span><strong>${escapeHtml(t.companyName)}</strong></div>
    </div>

    <div class="agr-facts">
      ${fact("Site", t.siteName)}
      ${fact("Role", t.role)}
      ${fact("Trade", t.trade)}
      ${fact(viewerType === "company" ? "Charge rate" : "Day rate", rateLine)}
      ${fact("Start", t.startDate ? formatDate(t.startDate) : "—")}
      ${fact("Duration", t.duration)}
    </div>
    <div class="agr-fact agr-fact--wide"><div class="agr-fact-lbl">Site address</div><div class="agr-fact-val">${escapeHtml(t.siteAddress)}</div></div>

    <div class="agr-section">
      <div class="agr-section-title">Agreement Terms</div>
      ${term("Attendance Requirements", t.attendanceRequirements)}
      ${term("Reliability & Conduct", t.reliabilityRules)}
      ${term("Site Rules", t.siteRules)}
      ${term("Payment Terms", t.paymentTerms)}
    </div>

    ${docsHtml}

    <div class="agr-section">
      <div class="agr-section-title">Digital Signatures</div>
      ${signatureBlockHtml("Worker", agr.worker)}
      ${signatureBlockHtml("Company", agr.company)}
    </div>`;
}

function buildAgreementActions(agr, viewer) {
  const live =
    agr.status !== "declined_by_worker" && agr.status !== "cancelled";
  if (viewer === "worker" && live && !agr.worker?.accepted) {
    return `
      <button class="secondary-btn wide" data-agr-action="worker-decline">Decline</button>
      <button class="primary-btn wide" data-agr-action="worker-accept">Accept &amp; Sign</button>`;
  }
  if (viewer === "company" && live && !agr.company?.accepted) {
    return `
      <button class="secondary-btn wide" data-agr-action="company-cancel">Cancel Booking</button>
      <button class="primary-btn wide" data-agr-action="company-accept">Accept &amp; Sign</button>`;
  }
  return `<button class="secondary-btn wide" data-agr-action="close">Close</button>`;
}

function agreementViewerRole(agr) {
  const sess = getSessionUser();
  if (sess?.type === "worker" && agr.workerId === sess.id) return "worker";
  // Company sessions own an agreement when the ids match, or when the agreement
  // has no companyId (seeded/legacy bookings in this single-company demo).
  if (sess?.type === "company" && (agr.companyId === sess.id || !agr.companyId))
    return "company";
  return "readonly";
}

let currentAgreementId = null;
function openAgreementModal(agreementId) {
  const agr = findAgreement(agreementId);
  if (!agr) return;
  currentAgreementId = agreementId;
  const viewer = agreementViewerRole(agr);
  const sub = document.getElementById("agreementSub");
  if (sub) {
    sub.textContent =
      viewer === "readonly"
        ? "This agreement is read-only."
        : "Review the full terms and site documents, then sign to accept.";
  }
  const body = document.getElementById("agreementBody");
  if (body) body.innerHTML = buildAgreementBody(agr);
  const actions = document.getElementById("agreementActions");
  if (actions) {
    actions.innerHTML = buildAgreementActions(agr, viewer);
    actions.querySelectorAll("[data-agr-action]").forEach((btn) => {
      btn.addEventListener("click", () =>
        handleAgreementAction(btn.dataset.agrAction, agreementId),
      );
    });
  }
  document.getElementById("agreementModal")?.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
function closeAgreementModal() {
  currentAgreementId = null;
  document.getElementById("agreementModal")?.classList.add("hidden");
  document.body.style.overflow = "";
}
function handleAgreementAction(action, agreementId) {
  switch (action) {
    case "worker-accept":
      workerAcceptAgreement(agreementId);
      break;
    case "worker-decline":
      if (
        confirm(
          "Decline this job agreement? The role will be reopened. Your reliability score will not be affected.",
        )
      )
        workerDeclineAgreement(agreementId);
      break;
    case "company-accept":
      companyAcceptAgreement(agreementId);
      break;
    case "company-cancel":
      if (
        confirm(
          "Cancel this booking before activation? The role will be reopened.",
        )
      )
        companyCancelAgreementBooking(agreementId);
      break;
    default:
      closeAgreementModal();
  }
}
document
  .getElementById("closeAgreementBtn")
  ?.addEventListener("click", closeAgreementModal);
document.getElementById("agreementModal")?.addEventListener("click", (e) => {
  if (e.target === document.getElementById("agreementModal"))
    closeAgreementModal();
});

let currentOfferDecision = null;

function openOfferDecisionModal(role, applicationId) {
  const modal = document.getElementById("offerDecisionModal");
  const reasonSelect = document.getElementById("offerDecisionReason");
  const comment = document.getElementById("offerDecisionComment");
  const commentWrap = document.getElementById("offerDecisionCommentWrap");
  const title = document.getElementById("offerDecisionTitle");
  const sub = document.getElementById("offerDecisionSub");
  if (!modal || !reasonSelect) return;

  const isCompany = role === "company";
  currentOfferDecision = { role, applicationId };
  if (title)
    title.textContent = isCompany ? "Decline Worker" : "Decline Job Offer";
  if (sub)
    sub.textContent = isCompany
      ? "Choose a reason before offering the role to the next best worker."
      : "Choose a reason before declining this job offer.";
  reasonSelect.innerHTML =
    `<option value="">Select a reason...</option>` +
    (isCompany ? COMPANY_DECLINE_REASONS : WORKER_DECLINE_REASONS)
      .map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`)
      .join("");
  if (comment) comment.value = "";
  commentWrap?.classList.add("hidden");
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeOfferDecisionModal() {
  currentOfferDecision = null;
  document.getElementById("offerDecisionModal")?.classList.add("hidden");
  document.body.style.overflow = "";
}

document
  .getElementById("offerDecisionReason")
  ?.addEventListener("change", (e) => {
    document
      .getElementById("offerDecisionCommentWrap")
      ?.classList.toggle("hidden", !e.target.value);
  });
document
  .getElementById("closeOfferDecisionBtn")
  ?.addEventListener("click", closeOfferDecisionModal);
document
  .getElementById("cancelOfferDecisionBtn")
  ?.addEventListener("click", closeOfferDecisionModal);
document
  .getElementById("offerDecisionModal")
  ?.addEventListener("click", (e) => {
    if (e.target === document.getElementById("offerDecisionModal"))
      closeOfferDecisionModal();
  });
document
  .getElementById("confirmOfferDecisionBtn")
  ?.addEventListener("click", () => {
    const decision = currentOfferDecision;
    const reason = document.getElementById("offerDecisionReason")?.value || "";
    const comment = document.getElementById("offerDecisionComment")?.value || "";
    if (!decision || !reason) {
      showToast("Choose a decline reason");
      return;
    }
    closeOfferDecisionModal();
    if (decision.role === "company") {
      companyDeclineWorker(decision.applicationId, reason, comment);
    } else {
      workerDeclineOffer(decision.applicationId, reason, comment);
    }
  });

// The budget ceiling for a job — the all-in day rate the company is willing to
// pay. Falls back to any legacy free-text pay rate.
function jobBudget(job) {
  if (job?.budgetMax != null) return job.budgetMax;
  return parseDayRate(job?.payRate) || 0;
}

// Role-appropriate rate displays.
// Companies only ever see the all-in charge (their budget / agreed charge),
// never the worker's pay or OnSite's margin.
function companyChargeDisplay(job) {
  if (job?.companyCharge != null) return job.companyCharge;
  return jobBudget(job);
}
// Workers only ever see their own guaranteed pay. For a confirmed booking this
// is the stored worker pay; for an open job it's derived from the viewing
// worker's private minimum against the company budget.
function workerPayDisplay(job, worker) {
  if (
    job?.pricing?.workerPay != null &&
    (job.assignedWorkerId === worker?.id || !worker)
  )
    return job.pricing.workerPay;
  if (job?.agreedDayRate != null && job.assignedWorkerId === worker?.id)
    return job.agreedDayRate;
  const p = computeBookingPricing({
    workerMin: workerMinRate(worker),
    budget: jobBudget(job),
  });
  return p.viable ? p.workerPay : null;
}

// Confirm a worker onto a job — this is the moment a Protected Booking begins.
// Returns { ok, reason, pricing }. A booking is refused when the company's
// budget cannot cover the worker's private minimum plus the 15% margin floor.
function confirmBooking(job, workerId) {
  if (!job) return { ok: false, reason: "No job" };
  if (job.companyId && isCompanySuspended(job.companyId)) {
    return {
      ok: false,
      reason: "Company account suspended for overdue payments",
    };
  }
  if (job.companyId && isCompanyRestricted(job.companyId)) {
    return {
      ok: false,
      reason:
        "Company restricted for overdue payments — settle outstanding invoices to book labour",
    };
  }
  const worker = findWorker(workerId);
  const pricing = computeBookingPricing({
    workerMin: workerMinRate(worker),
    budget: jobBudget(job),
  });
  if (!pricing.viable) return { ok: false, reason: pricing.reason, pricing };

  job.assignedWorkerId = workerId;
  job.workerId = workerId;
  job.bookingStatus = "confirmed";
  job.confirmedAt = new Date().toISOString();
  job.startDate = job.start;
  // OnSite-derived figures. agreedDayRate tracks the worker's guaranteed pay
  // (used by downstream cancellation/extension logic).
  job.pricing = {
    workerPay: pricing.workerPay,
    companyCharge: pricing.companyCharge,
    margin: pricing.margin,
    marginPct: pricing.marginPct,
  };
  job.companyCharge = pricing.companyCharge;
  job.agreedDayRate = pricing.workerPay;
  if (!job.estimatedEndDate && job.endDate) job.estimatedEndDate = job.endDate;
  initExtensionFields(job);
  const sess = getSessionUser();
  if (!job.companyId && sess?.type === "company") job.companyId = sess.id;
  if (!job.companyName)
    job.companyName = sess?.companyName || sess?.name || "Company";
  // Clear any cancellation residue from a previous booking on this job.
  delete job.cancelledAt;
  delete job.cancellationReason;
  delete job.cancellationPaymentDue;
  delete job.cancellationPaymentAmount;
  // Generate the Job Agreement — the booking stays inactive until both the
  // worker and company accept it.
  generateAgreementForBooking(job);
}

// Apply a cancellation to a confirmed booking and log it for the admin view.
function cancelBooking(job, reason) {
  if (!job) return null;
  const worker = job.assignedWorkerId ? findWorker(job.assignedWorkerId) : null;
  const sess = getSessionUser();
  const outcome = computeCancellation(job);

  const record = {
    id: createId(),
    jobId: job.id,
    jobTrade: job.trade,
    jobLocation: job.location,
    workerId: job.assignedWorkerId || job.workerId || "",
    workerName: worker?.name || "—",
    companyId: job.companyId || (sess?.type === "company" ? sess.id : ""),
    companyName: sess?.companyName || sess?.name || "Company",
    startDate: job.startDate || job.start || "",
    cancelledAt: new Date().toISOString(),
    cancellationReason: reason || "Not specified",
    cancellationPaymentDue: outcome.paymentDue,
    cancellationPaymentAmount: outcome.amount,
    agreedDayRate: outcome.dayRate,
    workingDaysNotice: outcome.workingDays,
  };
  state.cancellations.unshift(record);

  // Record cancellation metadata on the job, then free the slot so it can be
  // re-filled. Worker reliability is intentionally NOT affected.
  job.bookingStatus = "cancelled";
  job.cancelledAt = record.cancelledAt;
  job.cancellationReason = record.cancellationReason;
  job.cancellationPaymentDue = outcome.paymentDue;
  job.cancellationPaymentAmount = outcome.amount;
  job.assignedWorkerId = "";

  // Detach the agreement: mark a still-pending one cancelled and clear the
  // job's linkage/active flag so a re-booking generates a fresh agreement. The
  // agreement record itself stays in state.agreements as history.
  const agr = agreementForJob(job);
  if (agr && agr.status === "pending") agr.status = "cancelled";
  job.agreementId = "";
  job.bookingActive = false;

  logActivity(
    "job",
    `Booking cancelled: <strong>${escapeHtml(record.workerName)}</strong> for ${escapeHtml(job.trade)} in ${escapeHtml(job.location)}${outcome.paymentDue ? ` · ${formatMoney(outcome.amount)} payment due` : " · no payment due"}`,
  );
  return record;
}

// ─── Cancel Booking Modal ─────────────────────────────────
let pendingCancelJobId = null;

function openCancelBookingModal(jobId) {
  const job = findJob(jobId);
  if (!job || !job.assignedWorkerId) return;
  pendingCancelJobId = jobId;

  const worker = findWorker(job.assignedWorkerId);
  const { dayRate, workingDays, inWindow, amount } = computeCancellation(job);
  const startStr = job.startDate || job.start;
  const startFmt = startStr
    ? new Date(startStr).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "Not set";

  const windowBanner = inWindow
    ? `<div class="cancel-window-banner danger">
         <strong>Inside the protection window.</strong> This booking starts within ${PROTECTION_WINDOW_DAYS} working days. Cancelling now will trigger a cancellation payment of <strong>${formatMoney(amount)}</strong> to the worker.
       </div>`
    : `<div class="cancel-window-banner safe">
         <strong>Outside the protection window.</strong> This booking starts more than ${PROTECTION_WINDOW_DAYS} working days away, so no cancellation payment is due.
       </div>`;

  document.getElementById("cancelBookingSummary").innerHTML = `
    <div class="cbk-row"><span class="cbk-label">Worker</span><span class="cbk-val">${escapeHtml(worker?.name || "—")}</span></div>
    <div class="cbk-row"><span class="cbk-label">Job</span><span class="cbk-val">${escapeHtml(job.trade)} · ${escapeHtml(job.location)}</span></div>
    <div class="cbk-row"><span class="cbk-label">Job start date</span><span class="cbk-val">${escapeHtml(startFmt)}</span></div>
    <div class="cbk-row"><span class="cbk-label">Agreed day rate</span><span class="cbk-val">${dayRate ? formatMoney(dayRate) : "Not set"}</span></div>
    <div class="cbk-row"><span class="cbk-label">Notice</span><span class="cbk-val">${workingDays === null ? "—" : `${workingDays} working day${workingDays === 1 ? "" : "s"}`}</span></div>
    <div class="cbk-row cbk-row--total"><span class="cbk-label">Cancellation payment due</span><span class="cbk-val ${inWindow ? "due" : "none"}">${inWindow ? formatMoney(amount) : "£0"}</span></div>
    ${windowBanner}`;

  document.getElementById("cancelBookingModal").classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeCancelBookingModal() {
  document.getElementById("cancelBookingModal")?.classList.add("hidden");
  document.body.style.overflow = "";
  pendingCancelJobId = null;
}

function confirmCancelBooking() {
  const job = findJob(pendingCancelJobId);
  if (!job) {
    closeCancelBookingModal();
    return;
  }
  const reason =
    document.getElementById("cancelBookingReason")?.value || "Not specified";
  const record = cancelBooking(job, reason);
  closeCancelBookingModal();
  saveAndRender();
  showToast(
    record?.cancellationPaymentDue
      ? `Booking cancelled — ${formatMoney(record.cancellationPaymentAmount)} payable to worker`
      : "Booking cancelled — no payment due",
  );
}

document
  .getElementById("closeCancelBookingBtn")
  ?.addEventListener("click", closeCancelBookingModal);
document
  .getElementById("keepBookingBtn")
  ?.addEventListener("click", closeCancelBookingModal);
document
  .getElementById("confirmCancelBookingBtn")
  ?.addEventListener("click", confirmCancelBooking);
document
  .getElementById("cancelBookingModal")
  ?.addEventListener("click", (e) => {
    if (e.target === document.getElementById("cancelBookingModal"))
      closeCancelBookingModal();
  });

// Extension modal wiring
document
  .getElementById("closeExtensionBtn")
  ?.addEventListener("click", closeExtensionModal);
document
  .getElementById("cancelExtensionBtn")
  ?.addEventListener("click", closeExtensionModal);
document.getElementById("extRateChoice")?.addEventListener("change", (e) => {
  document
    .getElementById("extNewRateWrap")
    ?.classList.toggle("hidden", e.target.value !== "new");
});
document
  .getElementById("confirmExtensionBtn")
  ?.addEventListener("click", () => {
    if (!currentExtensionJobId) return;
    const newEnd = document.getElementById("extNewEnd")?.value;
    if (!newEnd) {
      showToast("Please choose a new end date");
      return;
    }
    const useNewRate =
      document.getElementById("extRateChoice")?.value === "new";
    const newRate = useNewRate
      ? document.getElementById("extNewRate")?.value
      : "";
    const jobId = currentExtensionJobId;
    closeExtensionModal();
    requestExtension(jobId, newEnd, newRate);
  });
document.getElementById("extensionModal")?.addEventListener("click", (e) => {
  if (e.target === document.getElementById("extensionModal"))
    closeExtensionModal();
});

// ─── Profile Completion ────────────────────────────────────
function calcWorkerCompletion(worker) {
  const checks = [
    !!worker.name,
    !!worker.trade,
    !!(
      worker.qualifications ||
      (worker.certifications && worker.certifications.length)
    ),
    !!worker.utr,
    !!worker.rightToWork,
    !!(worker.location || worker.grade || worker.yearsExp),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function completionRingHTML(pct) {
  const size = 34;
  const r = 13;
  const circ = 2 * Math.PI * r;
  const fill = (pct / 100) * circ;
  const color =
    pct >= 80
      ? "var(--green-text)"
      : pct >= 50
        ? "var(--amber-text)"
        : "var(--red-text)";
  return `<div class="completion-mini" title="Profile ${pct}% complete">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--border)" stroke-width="2.5"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="2.5"
        stroke-dasharray="${fill.toFixed(2)} ${circ.toFixed(2)}"
        stroke-dashoffset="${(circ * 0.25).toFixed(2)}"
        stroke-linecap="round"/>
    </svg>
    <span class="completion-mini-pct" style="color:${color}">${pct}%</span>
  </div>`;
}

// ─── Document Expiry ──────────────────────────────────────
function certExpiryStatus(expiry) {
  if (!expiry) return null;
  const daysLeft = Math.ceil((new Date(expiry) - new Date()) / 86400000);
  if (daysLeft < 0) return { cls: "cert-expired", label: "Expired" };
  if (daysLeft <= 30)
    return { cls: "cert-expiring", label: `Exp in ${daysLeft}d` };
  return {
    cls: "cert-valid",
    label: new Date(expiry).toLocaleDateString("en-GB", {
      month: "short",
      year: "2-digit",
    }),
  };
}

function certChipsHTML(worker) {
  const certs = worker.certifications;
  if (certs && certs.length && typeof certs[0] === "object") {
    return certs
      .slice(0, 4)
      .map((c) => {
        const st = certExpiryStatus(c.expiry);
        return st
          ? `<span class="cert-chip ${st.cls}">${escapeHtml(c.name)}<span class="cert-exp-label">${st.label}</span></span>`
          : `<span class="qual-chip">${escapeHtml(c.name)}</span>`;
      })
      .join("");
  }
  if (certs && certs.length && typeof certs[0] === "string") {
    return certs
      .slice(0, 3)
      .map((n) => `<span class="qual-chip">${escapeHtml(n)}</span>`)
      .join("");
  }
  return (worker.qualifications || "")
    .split(",")
    .map((q) => q.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((q) => `<span class="qual-chip">${escapeHtml(q)}</span>`)
    .join("");
}

function certExpiryWarnings(worker) {
  const certs = worker.certifications;
  if (!certs || !certs.length || typeof certs[0] !== "object") return "";
  const problems = certs.filter((c) => {
    const st = certExpiryStatus(c.expiry);
    return st && (st.cls === "cert-expired" || st.cls === "cert-expiring");
  });
  if (!problems.length) return "";
  const expired = problems.filter(
    (c) => certExpiryStatus(c.expiry).cls === "cert-expired",
  );
  const expiring = problems.filter(
    (c) => certExpiryStatus(c.expiry).cls === "cert-expiring",
  );
  const parts = [];
  if (expired.length)
    parts.push(
      `<span class="doc-warn doc-warn--expired">${expired.length} cert${expired.length > 1 ? "s" : ""} expired</span>`,
    );
  if (expiring.length)
    parts.push(
      `<span class="doc-warn doc-warn--expiring">${expiring.length} expiring soon</span>`,
    );
  return `<div class="worker-doc-warnings">${parts.join("")}</div>`;
}

function formatDate(value) {
  if (!value) return "No date set";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

// Date-only formatter for date strings like "2026-06-01" (no time component).
function formatDateOnly(value) {
  if (!value) return "No date set";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(value + "T00:00:00")
    : new Date(value);
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(d);
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[c],
  );
}

function emptyState(msg) {
  return `<div class="empty-state">${msg}</div>`;
}

function showToast(msg) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}

// ─── Activity Log ─────────────────────────────────────────
let activityLog = loadActivity();

function loadActivity() {
  try {
    const saved = localStorage.getItem(ACTIVITY_KEY);
    if (saved) return JSON.parse(saved);
  } catch (_) {}
  return [];
}

function saveActivity() {
  try {
    localStorage.setItem(
      ACTIVITY_KEY,
      JSON.stringify(activityLog.slice(0, 50)),
    );
  } catch (_) {}
}

function logActivity(type, text) {
  activityLog.unshift({ type, text, ts: Date.now() });
  if (activityLog.length > 50) activityLog.pop();
  saveActivity();
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "short" }).format(
    new Date(ts),
  );
}

const ACTIVITY_ICONS = {
  assign: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  score: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  worker: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  job: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
  avail: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
};

function renderActivity() {
  const feed = document.querySelector("#activityFeed");
  if (!feed) return;
  if (!activityLog.length) {
    feed.innerHTML = `<div class="activity-empty">No activity yet — add workers or post jobs to get started.</div>`;
    return;
  }
  feed.innerHTML = activityLog
    .map(
      (item) => `
    <div class="activity-item">
      <div class="activity-dot dot-${item.type}">${ACTIVITY_ICONS[item.type] || ""}</div>
      <div class="activity-body">
        <div class="activity-text">${item.text}</div>
        <div class="activity-time">${timeAgo(item.ts)}</div>
      </div>
    </div>
  `,
    )
    .join("");
}

// ─── Rate Structure & Payments System ─────────────────────
// Pricing model: a company requests labour with a BUDGET (the all-in day rate it
// is willing to pay). Each worker keeps a PRIVATE minimum day rate that
// companies never see. For every confirmed booking OnSite derives three figures:
//   • Worker Pay     — guaranteed, always ≥ the worker's private minimum
//   • OnSite Margin  — never below 15% of Worker Pay
//   • Company Charge — the all-in rate the company pays (Worker Pay + Margin)
// If the company's budget cannot cover the worker's minimum plus the 15% margin
// floor, the booking is rejected with "Budget too low to secure verified
// workers". Surplus budget is distributed to keep Worker Pay attractive while
// targeting a healthy margin.
const PRICING = {
  MIN_MARGIN_PCT: 0.15, // margin floor, as a fraction of worker pay
  TARGET_MARGIN_PCT: 0.2, // preferred margin when the budget allows
  DEFAULT_WORKER_MIN: 150, // fallback private minimum when none recorded
  BUDGET_TOO_LOW_MSG: "Budget too low to secure verified workers",
};

// A worker's private minimum day rate (companies never see this value).
function workerMinRate(worker) {
  const r = Number(worker?.minRate);
  return Number.isFinite(r) && r > 0
    ? Math.round(r)
    : PRICING.DEFAULT_WORKER_MIN;
}

// Pure pricing calculation — no access to the global state, fully deterministic
// so it can run at booking time and during migration. `budget` is the company's
// all-in day-rate ceiling; `workerMin` is the worker's private minimum.
function computeBookingPricing({ workerMin, budget }) {
  const minRate = Math.max(0, Math.round(Number(workerMin) || 0));
  const cap = Math.max(0, Math.round(Number(budget) || 0));
  if (!minRate) {
    return {
      viable: false,
      reason: "Worker minimum day rate not set",
      companyCharge: 0,
      workerPay: 0,
      margin: 0,
      marginPct: 0,
      minChargeNeeded: 0,
    };
  }
  const minCharge = Math.ceil(minRate * (1 + PRICING.MIN_MARGIN_PCT));
  if (!cap || cap < minCharge) {
    return {
      viable: false,
      reason: PRICING.BUDGET_TOO_LOW_MSG,
      companyCharge: cap,
      workerPay: 0,
      margin: 0,
      marginPct: 0,
      minChargeNeeded: minCharge,
    };
  }
  const companyCharge = cap; // company pays its agreed all-in rate
  // Highest worker pay that still preserves the 15% margin floor.
  const maxWorkerPay = Math.floor(companyCharge / (1 + PRICING.MIN_MARGIN_PCT));
  // Worker pay at the preferred (target) margin.
  const targetWorkerPay = Math.round(
    companyCharge / (1 + PRICING.TARGET_MARGIN_PCT),
  );
  let workerPay = Math.min(maxWorkerPay, Math.max(minRate, targetWorkerPay));
  workerPay = Math.max(workerPay, minRate);
  const margin = companyCharge - workerPay;
  const marginPct = workerPay ? margin / workerPay : 0;
  return {
    viable: true,
    reason: "",
    companyCharge,
    workerPay,
    margin,
    marginPct,
    minChargeNeeded: minCharge,
  };
}

// ─── Working-day & weekly-period helpers ──────────────────
function _isWeekend(d) {
  const g = d.getDay();
  return g === 0 || g === 6;
}
function addWorkingDays(fromISODate, n) {
  const d = new Date(fromISODate + "T00:00:00");
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    if (!_isWeekend(d)) added++;
  }
  return d.toISOString().slice(0, 10);
}
function mondayOf(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const g = d.getDay(); // 0 Sun .. 6 Sat
  d.setDate(d.getDate() + (g === 0 ? -6 : 1 - g));
  return d.toISOString().slice(0, 10);
}
function fridayOf(dateStr) {
  const mon = new Date(mondayOf(dateStr) + "T00:00:00");
  mon.setDate(mon.getDate() + 4);
  return mon.toISOString().slice(0, 10);
}

// ─── Payment terms, statuses & restriction thresholds ─────
const PAYMENT_TERMS = {
  standard: { days: 3, label: "3 working days", adminOnly: false },
  trusted: { days: 7, label: "7 working days", adminOnly: false },
  net14: { days: 14, label: "14 working days", adminOnly: true },
  net30: { days: 30, label: "30 working days", adminOnly: true },
};
const DEFAULT_PAYMENT_TERM = "standard";
const SUSPEND_OVERDUE_LIMIT = 2; // suspended once overdue invoices exceed this

const INVOICE_STATUS = {
  generated: { label: "Generated", tone: "neutral" },
  awaiting_payment: { label: "Awaiting Payment", tone: "amber" },
  overdue: { label: "Overdue", tone: "red" },
  paid: { label: "Paid", tone: "green" },
};
const WORKER_PAYMENT_STATUS = {
  awaiting_funds: { label: "Awaiting Client Funds", tone: "neutral" },
  ready: { label: "Ready to Pay", tone: "amber" },
  paid: { label: "Paid", tone: "green" },
  held: { label: "On Hold", tone: "red" },
};

// ─── Company billing records ──────────────────────────────
function getCompanyBilling(companyId) {
  if (!state.companyBilling || typeof state.companyBilling !== "object")
    state.companyBilling = {};
  const key = companyId || "__unassigned__";
  if (!state.companyBilling[key]) {
    state.companyBilling[key] = {
      companyId: companyId || "",
      paymentTerm: DEFAULT_PAYMENT_TERM,
      trusted: false,
      restricted: false,
      suspended: false,
      manualRestriction: false,
    };
  }
  return state.companyBilling[key];
}
function companyTermDays(companyId) {
  const b = getCompanyBilling(companyId);
  return (PAYMENT_TERMS[b.paymentTerm] || PAYMENT_TERMS[DEFAULT_PAYMENT_TERM])
    .days;
}

// ─── Invoice builders & status derivation ─────────────────
// Pure builder: assemble a weekly invoice from approved attendance lines. Each
// line is { workerId, workerName, jobId, jobTrade, jobLocation, days, workerPay,
// companyCharge, margin }.
function buildInvoiceRecord({
  companyId,
  companyName,
  weekStart,
  weekEnd,
  lines,
  termDays,
  createdAt,
}) {
  const created = createdAt || new Date().toISOString();
  const ls = (lines || []).map((l) => ({ ...l }));
  const totalWorkerPay = ls.reduce(
    (s, l) => s + (l.workerPay || 0) * (l.days || 0),
    0,
  );
  const totalCharge = ls.reduce(
    (s, l) => s + (l.companyCharge || 0) * (l.days || 0),
    0,
  );
  return {
    id: createId(),
    companyId: companyId || "",
    companyName: companyName || "Company",
    weekStart,
    weekEnd,
    createdAt: created,
    dueDate: addWorkingDays(
      created.slice(0, 10),
      termDays || PAYMENT_TERMS[DEFAULT_PAYMENT_TERM].days,
    ),
    termDays: termDays || PAYMENT_TERMS[DEFAULT_PAYMENT_TERM].days,
    status: "awaiting_payment",
    totalCharge,
    totalWorkerPay,
    totalMargin: totalCharge - totalWorkerPay,
    lines: ls,
    paidAt: null,
    workerPaymentsReleased: false,
  };
}

// Effective status — recomputes "overdue" on the fly from the due date.
function invoiceEffectiveStatus(inv) {
  if (!inv) return "generated";
  if (inv.status === "paid") return "paid";
  if (inv.status === "generated") return "generated";
  if (inv.dueDate && todayDateStr() > inv.dueDate) return "overdue";
  return "awaiting_payment";
}

// Worker payment status for one invoice line — workers are paid ONLY after the
// company's funds for that invoice have been received.
function workerPaymentStatusForLine(inv, line) {
  if (line?.held) return "held";
  if (line?.workerPaid) return "paid";
  if (inv?.status === "paid") return "ready";
  return "awaiting_funds";
}

// ─── Company payment reliability & auto-restrictions ──────
function computeCompanyPaymentReliability(companyId) {
  const invs = (state.invoices || []).filter((i) => i.companyId === companyId);
  const settled = invs.filter((i) => i.status === "paid");
  const onTime = settled.filter(
    (i) => i.paidAt && i.paidAt.slice(0, 10) <= i.dueDate,
  );
  const overdue = invs.filter((i) => invoiceEffectiveStatus(i) === "overdue");
  return {
    score: settled.length
      ? Math.round((onTime.length / settled.length) * 100)
      : null,
    settled: settled.length,
    onTime: onTime.length,
    overdue: overdue.length,
    totalInvoices: invs.length,
  };
}

// Recompute restriction/suspension flags from outstanding invoices. An overdue
// invoice restricts new posts/bookings; beyond the limit the account is
// suspended (admin must reinstate).
function refreshCompanyRestrictions(companyId) {
  const b = getCompanyBilling(companyId);
  const rel = computeCompanyPaymentReliability(companyId);
  b.restricted = !!b.manualRestriction || rel.overdue > 0;
  if (rel.overdue > SUSPEND_OVERDUE_LIMIT) b.suspended = true;
  return b;
}
function isCompanySuspended(companyId) {
  return refreshCompanyRestrictions(companyId).suspended;
}
function isCompanyRestricted(companyId) {
  const b = refreshCompanyRestrictions(companyId);
  return b.restricted || b.suspended;
}
function canCompanyPost(companyId) {
  return !isCompanyRestricted(companyId);
}

// ─── Weekly invoice generation ────────────────────────────
// An attendance record is invoiceable only when it represents APPROVED, worked
// days: supervisor-confirmed on-time/late attendance with no pending dispute.
// No Show, disputed and under-review days are excluded entirely.
function isInvoiceableAttendance(r) {
  if (!r || !r.jobId) return false;
  if (!(r.status === "onTime" || r.status === "late")) return false;
  if (r.selfReported && !r.supervisorConfirmed) return false; // under review
  if (r.disputeStatus === "pending") return false; // disputed
  return true;
}

// Generate any missing Mon–Fri weekly invoices from approved attendance.
// Idempotent: a company+week invoice is only created once. Returns the number
// of new invoices generated.
function generateWeeklyInvoices() {
  if (!Array.isArray(state.invoices)) state.invoices = [];
  const today = todayDateStr();
  // Group invoiceable records by company + week, but only for weeks that have
  // already ended (we invoice completed weeks, never the in-progress one).
  const groups = {};
  attendanceRecords.filter(isInvoiceableAttendance).forEach((r) => {
    const weekStart = mondayOf(r.date);
    const weekEnd = fridayOf(r.date);
    if (today <= weekEnd) return; // week not finished yet
    const cid = r.companyId || "__unassigned__";
    const key = `${cid}::${weekStart}`;
    if (!groups[key])
      groups[key] = {
        companyId: r.companyId || "",
        companyName: r.companyName || "Company",
        weekStart,
        weekEnd,
        recs: [],
      };
    groups[key].recs.push(r);
  });

  let created = 0;
  Object.values(groups).forEach((g) => {
    const exists = state.invoices.some(
      (i) =>
        (i.companyId || "") === (g.companyId || "") &&
        i.weekStart === g.weekStart,
    );
    if (exists) return;
    // Roll records up into one line per worker+job.
    const lineMap = {};
    g.recs.forEach((r) => {
      const lk = `${r.workerId}::${r.jobId}`;
      if (!lineMap[lk]) {
        const w = findWorker(r.workerId);
        lineMap[lk] = {
          workerId: r.workerId,
          workerName: w?.name || r.workerName || "Worker",
          jobId: r.jobId,
          jobTrade: r.jobTrade || "",
          jobLocation: r.jobLocation || "",
          days: 0,
          workerPay: r.workerPay || 0,
          companyCharge: r.companyCharge || 0,
          margin: (r.companyCharge || 0) - (r.workerPay || 0),
        };
      }
      lineMap[lk].days += 1;
    });
    const lines = Object.values(lineMap);
    if (!lines.length) return;
    const inv = buildInvoiceRecord({
      companyId: g.companyId,
      companyName: g.companyName,
      weekStart: g.weekStart,
      weekEnd: g.weekEnd,
      lines,
      termDays: companyTermDays(g.companyId),
    });
    state.invoices.push(inv);
    created++;
  });
  if (created) {
    state.invoices.forEach((i) => {
      i.status = i.status === "paid" ? "paid" : invoiceEffectiveStatus(i);
    });
  }
  return created;
}

// ─── Demo Data ────────────────────────────────────────────
const _demoWorkers = [
  {
    id: createId(),
    name: "Sam Taylor",
    trade: "Electrical",
    qualifications: "ECS, IPAF, 18th Edition",
    availability: "available",
    reliability: 92,
    minRate: 200,
  },
  {
    id: createId(),
    name: "Aisha Khan",
    trade: "Groundworks",
    qualifications: "CSCS green card",
    availability: "available",
    reliability: 84,
    minRate: 160,
  },
  {
    id: createId(),
    name: "Mark Evans",
    trade: "Plumbing",
    qualifications: "JIB PMES, CSCS",
    availability: "not available",
    reliability: 78,
    minRate: 180,
  },
  {
    id: createId(),
    name: "Grace Miller",
    trade: "Electrical",
    qualifications: "ECS, Testing & Inspection",
    availability: "available",
    reliability: 88,
    minRate: 190,
  },
  {
    id: createId(),
    name: "Liam Chen",
    trade: "Carpentry",
    qualifications: "CSCS, NVQ Level 2",
    availability: "available",
    reliability: 95,
    minRate: 175,
  },
];
const _isoDate = (ms) => new Date(Date.now() + ms).toISOString().slice(0, 10);

// Build a seeded demo invoice with an explicit age/status so the admin console
// and company reliability views have realistic history on first load.
function _demoInvoice({
  companyId,
  companyName,
  agedDays,
  termDays,
  lines,
  status,
}) {
  const created = new Date(Date.now() - agedDays * 86400000).toISOString();
  const inv = buildInvoiceRecord({
    companyId,
    companyName,
    weekStart: mondayOf(created.slice(0, 10)),
    weekEnd: fridayOf(created.slice(0, 10)),
    lines,
    termDays,
    createdAt: created,
  });
  if (status === "paid") {
    inv.status = "paid";
    inv.paidAt = new Date(
      Date.now() - Math.max(0, agedDays - 2) * 86400000,
    ).toISOString();
    inv.workerPaymentsReleased = true;
    inv.lines.forEach((l) => {
      l.workerPaid = true;
    });
  } else if (status === "generated") {
    inv.status = "generated";
  } // "awaiting_payment" left as built (becomes overdue automatically if aged past terms)
  return inv;
}

const _demoInvoices = [
  // Apex Construction Ltd — claimable by the logged-in company (no companyId yet).
  _demoInvoice({
    companyId: "",
    companyName: "Apex Construction Ltd",
    agedDays: 11,
    termDays: 3,
    status: "paid",
    lines: [
      {
        workerId: _demoWorkers[0].id,
        workerName: "Sam Taylor",
        jobTrade: "Electrical",
        jobLocation: "Manchester",
        days: 5,
        workerPay: 260,
        companyCharge: 310,
        margin: 50,
      },
    ],
  }),
  _demoInvoice({
    companyId: "",
    companyName: "Apex Construction Ltd",
    agedDays: 1,
    termDays: 3,
    status: "awaiting_payment",
    lines: [
      {
        workerId: _demoWorkers[0].id,
        workerName: "Sam Taylor",
        jobTrade: "Electrical",
        jobLocation: "Manchester",
        days: 4,
        workerPay: 260,
        companyCharge: 310,
        margin: 50,
      },
    ],
  }),
  // Brightwork Builders — one overdue invoice → auto-restricted.
  _demoInvoice({
    companyId: "demo-brightwork",
    companyName: "Brightwork Builders",
    agedDays: 18,
    termDays: 3,
    status: "awaiting_payment",
    lines: [
      {
        workerId: _demoWorkers[2].id,
        workerName: "Mark Evans",
        jobTrade: "Plumbing",
        jobLocation: "Leeds",
        days: 5,
        workerPay: 180,
        companyCharge: 215,
        margin: 35,
      },
    ],
  }),
  // Old Oak Developments — three overdue invoices → suspended (beyond the limit).
  _demoInvoice({
    companyId: "demo-oldoak",
    companyName: "Old Oak Developments",
    agedDays: 30,
    termDays: 3,
    status: "awaiting_payment",
    lines: [
      {
        workerId: _demoWorkers[1].id,
        workerName: "Aisha Khan",
        jobTrade: "Groundworks",
        jobLocation: "Bristol",
        days: 5,
        workerPay: 160,
        companyCharge: 195,
        margin: 35,
      },
    ],
  }),
  _demoInvoice({
    companyId: "demo-oldoak",
    companyName: "Old Oak Developments",
    agedDays: 23,
    termDays: 3,
    status: "awaiting_payment",
    lines: [
      {
        workerId: _demoWorkers[1].id,
        workerName: "Aisha Khan",
        jobTrade: "Groundworks",
        jobLocation: "Bristol",
        days: 5,
        workerPay: 160,
        companyCharge: 195,
        margin: 35,
      },
    ],
  }),
  _demoInvoice({
    companyId: "demo-oldoak",
    companyName: "Old Oak Developments",
    agedDays: 16,
    termDays: 3,
    status: "awaiting_payment",
    lines: [
      {
        workerId: _demoWorkers[4].id,
        workerName: "Liam Chen",
        jobTrade: "Carpentry",
        jobLocation: "Bristol",
        days: 4,
        workerPay: 175,
        companyCharge: 210,
        margin: 35,
      },
    ],
  }),
];

const _demoBilling = {
  "demo-brightwork": {
    companyId: "demo-brightwork",
    paymentTerm: "standard",
    trusted: false,
    restricted: true,
    suspended: false,
    manualRestriction: false,
  },
  "demo-oldoak": {
    companyId: "demo-oldoak",
    paymentTerm: "standard",
    trusted: false,
    restricted: true,
    suspended: true,
    manualRestriction: false,
  },
};
const demoData = {
  workers: _demoWorkers,
  jobs: [
    {
      id: createId(),
      trade: "Electrical",
      location: "Birmingham",
      start: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
      shiftStartTime: "08:00",
      shiftFinishTime: "16:30",
      estimatedEndDate: _isoDate(6 * 86400000),
      duration: "3 days",
      budgetMin: 240,
      budgetMax: 300,
      assignedWorkerId: "",
    },
    {
      id: createId(),
      trade: "Carpentry",
      location: "Leeds",
      start: new Date(Date.now() + 172800000).toISOString().slice(0, 16),
      shiftStartTime: "08:00",
      shiftFinishTime: "16:30",
      estimatedEndDate: _isoDate(9 * 86400000),
      duration: "5 days",
      budgetMin: 200,
      budgetMax: 260,
      assignedWorkerId: "",
    },
    // Active booking nearing its estimated end — demonstrates extension reminders.
    // Its agreement is seeded as "active" (both parties already accepted).
    {
      id: createId(),
      trade: "Electrical",
      location: "Manchester",
      siteName: "Northgate Tower",
      siteAddress: "Northgate Tower, 12 Cross St, Manchester, M2 1WS",
      role: "Site Electrician",
      start: new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 16),
      shiftStartTime: "08:00",
      shiftFinishTime: "16:30",
      estimatedEndDate: _isoDate(9 * 86400000),
      duration: "3 weeks",
      payRate: "£260/day",
      budgetMin: 290,
      budgetMax: 310,
      pricing: {
        workerPay: 260,
        companyCharge: 310,
        margin: 50,
        marginPct: 0.19,
      },
      assignedWorkerId: _demoWorkers[0].id,
      workerId: _demoWorkers[0].id,
      companyName: "Apex Construction Ltd",
      bookingStatus: "confirmed",
      confirmedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      startDate: new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 16),
      agreedDayRate: 260,
      noticePeriodDays: 5,
      extensionStatus: "pending",
      workerAvailabilityStatus: "booked",
      agreementSeed: "active",
    },
    // Confirmed booking whose agreement is awaiting the worker's acceptance —
    // demonstrates the Pending Agreement gating and accept flow.
    {
      id: createId(),
      trade: "Carpentry",
      location: "Leeds",
      siteName: "Riverside Mill",
      siteAddress: "Riverside Mill, Dock St, Leeds, LS10 1JF",
      role: "Site Carpenter",
      start: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 16),
      shiftStartTime: "08:00",
      shiftFinishTime: "16:30",
      estimatedEndDate: _isoDate(20 * 86400000),
      duration: "4 weeks",
      payRate: "£230/day",
      budgetMin: 270,
      budgetMax: 280,
      pricing: {
        workerPay: 230,
        companyCharge: 280,
        margin: 50,
        marginPct: 0.22,
      },
      assignedWorkerId: _demoWorkers[4].id,
      workerId: _demoWorkers[4].id,
      companyName: "Apex Construction Ltd",
      bookingStatus: "confirmed",
      confirmedAt: new Date(Date.now() - 86400000).toISOString(),
      startDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 16),
      agreedDayRate: 230,
      noticePeriodDays: 5,
      extensionStatus: "pending",
      workerAvailabilityStatus: "booked",
      agreementSeed: "pending_worker",
    },
  ],
  cancellations: [],
  siteCodes: [],
  agreements: [],
  applications: [],
  notifications: [],
  companyDocuments: {},
  invoices: _demoInvoices,
  companyBilling: _demoBilling,
};

// ─── State ────────────────────────────────────────────────
let state = loadState();

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return migrateState(JSON.parse(saved));
  } catch (_) {}
  return structuredClone(demoData);
}

// Backfill booking-protection fields on data saved before this feature existed.
function migrateState(s) {
  if (!s || typeof s !== "object") return structuredClone(demoData);
  if (!Array.isArray(s.cancellations)) s.cancellations = [];
  if (!Array.isArray(s.siteCodes)) s.siteCodes = [];
  if (!Array.isArray(s.invoices)) s.invoices = [];
  if (!Array.isArray(s.applications)) s.applications = [];
  if (!Array.isArray(s.notifications)) s.notifications = [];
  if (!s.companyBilling || typeof s.companyBilling !== "object")
    s.companyBilling = {};
  (s.workers || []).forEach((w) => {
    if (w.consecutiveMissedOffers == null) w.consecutiveMissedOffers = 0;
    if (!Array.isArray(w.offerNotifications)) w.offerNotifications = [];
    if (!Array.isArray(w.lateReports)) w.lateReports = [];
  });
  (s.applications || []).forEach((a) => {
    if (!a.status) a.status = "interested";
    if (!a.createdAt) a.createdAt = a.offeredAt || new Date().toISOString();
    if (a.workerDeclineReason == null) a.workerDeclineReason = "";
    if (a.workerDeclineComment == null) a.workerDeclineComment = "";
    if (a.companyDeclineReason == null) a.companyDeclineReason = "";
    if (a.companyDeclineComment == null) a.companyDeclineComment = "";
    if (a.workerRespondedAt == null) a.workerRespondedAt = "";
    if (a.companyReviewedAt == null) a.companyReviewedAt = "";
    if (a.companyDecision == null) a.companyDecision = "";
    if (a.confirmedAt == null) a.confirmedAt = "";
    if (a.supersededAt == null) a.supersededAt = "";
    if (a.workerNotifiedAt == null) a.workerNotifiedAt = "";
    if (a.workerNotificationId == null) a.workerNotificationId = "";
    if (a.status === "offered" && !a.expiresAt && a.offeredAt) {
      a.expiresAt = new Date(new Date(a.offeredAt).getTime() + OFFER_EXPIRY_MS).toISOString();
    }
    if (!a.matchSnapshot) {
      const job = (s.jobs || []).find((j) => j.id === a.jobId);
      const worker = (s.workers || []).find((w) => w.id === a.workerId);
      if (job && worker) {
        a.matchSnapshot = {
          reliabilityRating: "New / Unproven",
          punctualityRating: "New / Unproven",
          attendanceDays: 0,
          reliabilityScore: null,
          punctualityScore: null,
          trade: worker.trade || "",
          specialism: worker.grade || worker.specialism || "",
          qualifications: worker.qualifications || "",
          certifications: worker.certifications || [],
          travelRadiusMiles: worker.travelRadiusMiles ?? null,
          travelFurtherWithAccommodation: !!worker.travelFurtherWithAccommodation,
          nextAvailableDate: worker.nextAvailableDate || "",
          plannedAbsenceSummary: Array.isArray(worker.plannedAbsences)
            ? worker.plannedAbsences.map((pa) => ({
                startDate: pa.startDate,
                endDate: pa.endDate,
              }))
            : [],
          previousDeclineReasons: [],
          rankAtOffer: a.rankAtOffer ?? null,
          jobTrade: job.trade || "",
          jobLocation: job.location || "",
          jobStart: job.start || "",
        };
      }
    }
  });
  // Backfill a budget ceiling on legacy jobs that only carried a free-text pay
  // rate, so the pricing engine has something to work with.
  (s.jobs || []).forEach((j) => {
    if (!j.shiftStartTime) {
      j.shiftStartTime =
        j.start && String(j.start).includes("T")
          ? String(j.start).split("T")[1].slice(0, 5)
          : "08:00";
    }
    if (!j.shiftFinishTime) j.shiftFinishTime = "";
    if (j.accommodationPaid == null) j.accommodationPaid = false;
    if (j.budgetMax == null && j.payRate) {
      const r = parseDayRate(j.payRate);
      if (r) j.budgetMax = r;
    }
  });
  (s.jobs || []).forEach((j) => {
    if (j.assignedWorkerId && !j.bookingStatus) {
      j.bookingStatus = "confirmed";
      j.confirmedAt = j.confirmedAt || new Date().toISOString();
      j.workerId = j.assignedWorkerId;
      j.startDate = j.startDate || j.start;
      if (j.agreedDayRate == null) j.agreedDayRate = parseDayRate(j.payRate);
    }
    // Backfill extension/reallocation fields on confirmed bookings.
    if (j.assignedWorkerId && (j.estimatedEndDate || j.endDate)) {
      if (j.noticePeriodDays == null) j.noticePeriodDays = DEFAULT_NOTICE_DAYS;
      if (!j.extensionStatus) j.extensionStatus = "pending";
      if (!j.workerAvailabilityStatus) j.workerAvailabilityStatus = "booked";
    }
  });
  // Backfill Job Agreements for confirmed bookings (legacy bookings are
  // auto-accepted on both sides so they stay workable).
  ensureAgreementsForState(s);
  return s;
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_) {}
}

function saveAndRender() {
  saveState();
  render();
}

function travelRadiusLabel(miles) {
  return `Within ${Number(miles) || 15} miles`;
}

function formatDateInput(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function normalizePlannedAbsence(absence) {
  const startDate = formatDateInput(absence?.startDate || absence?.date);
  const endDate = formatDateInput(absence?.endDate || startDate);
  if (!startDate) return null;
  return {
    id: absence?.id || createId(),
    startDate,
    endDate: endDate && endDate >= startDate ? endDate : startDate,
    createdAt: absence?.createdAt || new Date().toISOString(),
  };
}

function plannedAbsencesForWorker(worker) {
  return (Array.isArray(worker?.plannedAbsences) ? worker.plannedAbsences : [])
    .map(normalizePlannedAbsence)
    .filter(Boolean)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function ensureWorkerProfileForUser(user) {
  if (!user || user.type !== "worker") return null;
  if (!Array.isArray(state.workers)) state.workers = [];

  let worker = state.workers.find((w) => w.id === user.id);
  const certNames = (user.certifications || []).map((c) =>
    typeof c === "object" ? c.name : c,
  );
  const minRateRaw = Number(user.minRate);
  const radiusRaw = Number(user.travelRadiusMiles ?? worker?.travelRadiusMiles ?? 15);
  const base = {
    id: user.id,
    userAccountId: user.id,
    identityId: user.identityId || "",
    name: user.name || "",
    trade: user.trade || "",
    grade: user.grade || "",
    location: user.location || "",
    qualifications: certNames.filter(Boolean).join(", "),
    certifications: user.certifications || [],
    availability: user.availability || "available",
    nextAvailableDate: formatDateInput(
      user.nextAvailableDate ?? worker?.nextAvailableDate ?? "",
    ),
    minRate:
      Number.isFinite(minRateRaw) && minRateRaw > 0
        ? Math.round(minRateRaw)
        : undefined,
    travelRadiusMiles:
      Number.isFinite(radiusRaw) && radiusRaw > 0 ? Math.round(radiusRaw) : 15,
    travelFurtherWithAccommodation: !!(
      user.travelFurtherWithAccommodation ??
      worker?.travelFurtherWithAccommodation ??
      false
    ),
    consecutiveMissedOffers: worker?.consecutiveMissedOffers ?? 0,
    offerNotifications: Array.isArray(worker?.offerNotifications)
      ? worker.offerNotifications
      : [],
    lateReports: Array.isArray(worker?.lateReports) ? worker.lateReports : [],
    plannedAbsences: plannedAbsencesForWorker(worker || user),
    verificationStatus: user.verificationStatus || "pending",
  };

  if (worker) {
    Object.assign(worker, base, {
      reliability: worker.reliability ?? user.reliability ?? 100,
    });
  } else {
    worker = {
      ...base,
      reliability: user.reliability ?? 100,
    };
    state.workers.push(worker);
  }

  saveState();
  return worker;
}

function addWorkerPlannedAbsence(userId, startDate, endDate = "") {
  const worker = findWorker(userId);
  const absence = normalizePlannedAbsence({ startDate, endDate });
  if (!worker || !absence) return { ok: false, reason: "Add a start date" };
  worker.plannedAbsences = plannedAbsencesForWorker(worker);
  worker.plannedAbsences.push(absence);
  worker.plannedAbsences = plannedAbsencesForWorker(worker);
  logActivity(
    "avail",
    `<strong>${escapeHtml(worker.name || "Worker")}</strong> added Planned Absence for ${formatDateOnly(absence.startDate)}${absence.endDate !== absence.startDate ? ` to ${formatDateOnly(absence.endDate)}` : ""}`,
  );
  saveState();
  return { ok: true, absence };
}

function updateWorkerAvailability(userId, availability, nextAvailableDate = "") {
  const cleanAvailability =
    availability === "not available" ? "not available" : "available";
  const cleanDate =
    cleanAvailability === "not available" ? formatDateInput(nextAvailableDate) : "";

  const worker = findWorker(userId);
  if (worker) {
    worker.availability = cleanAvailability;
    worker.nextAvailableDate = cleanDate;
  }

  try {
    const session = JSON.parse(localStorage.getItem("onsite_auth_v1") || "null");
    if (session && session.id === userId) {
      session.availability = cleanAvailability;
      session.nextAvailableDate = cleanDate;
      localStorage.setItem("onsite_auth_v1", JSON.stringify(session));
    }
  } catch (_) {}

  try {
    const users = JSON.parse(localStorage.getItem("onsite_users_v1") || "[]");
    const idx = users.findIndex((u) => u.id === userId);
    if (idx !== -1) {
      users[idx].availability = cleanAvailability;
      users[idx].nextAvailableDate = cleanDate;
      localStorage.setItem("onsite_users_v1", JSON.stringify(users));
    }
  } catch (_) {}

  logActivity(
    "avail",
    `<strong>${escapeHtml(worker?.name || "Worker")}</strong> marked as <em>${escapeHtml(cleanAvailability)}</em>${cleanDate ? ` · next available ${formatDateOnly(cleanDate)}` : ""}`,
  );
  saveState();
  return worker;
}

function applicationFor(jobId, workerId) {
  return (state.applications || []).find(
    (a) => a.jobId === jobId && a.workerId === workerId,
  );
}

function registerInterest(jobId, user) {
  const job = findJob(jobId);
  if (!job || !user?.id) return { ok: false, reason: "Job not found" };
  if (job.assignedWorkerId || job.completed)
    return { ok: false, reason: "This job is no longer open" };
  if (!Array.isArray(state.applications)) state.applications = [];

  const existing = applicationFor(job.id, user.id);
  if (existing) return { ok: true, application: existing, duplicate: true };

  const worker = findWorker(user.id) || ensureWorkerProfileForUser(user);
  const application = {
    id: createId(),
    jobId: job.id,
    workerId: user.id,
    workerName: user.name || worker?.name || "Worker",
    workerTrade: user.trade || worker?.trade || "",
    companyId: job.companyId || "",
    companyName: job.companyName || "Company",
    status: "interested",
    createdAt: new Date().toISOString(),
  };
  state.applications.push(application);
  logActivity(
    "assign",
    `<strong>${escapeHtml(application.workerName)}</strong> registered interest in ${escapeHtml(job.trade)} at ${escapeHtml(job.location)}`,
  );
  saveAndRender();
  return { ok: true, application };
}

function offerStatusLabel(status) {
  return {
    interested: "Interested",
    offered: "Offer sent",
    accepted_by_worker: "Worker accepted",
    under_company_review: "Worker accepted",
    declined_by_worker: "Declined by worker",
    expired: "Expired",
    confirmed: "Confirmed",
    declined_by_company: "Declined by company",
    superseded: "Filled",
  }[status || "interested"] || "Interested";
}

function applicationJob(app) {
  return findJob(app?.jobId);
}

function applicationWorker(app) {
  return findWorker(app?.workerId);
}

function offerExpiryLabel(app) {
  if (!app?.expiresAt) return "";
  const ms = new Date(app.expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expires now";
  const hours = Math.max(1, Math.ceil(ms / 3600000));
  return hours >= 24 ? "Expires in 24 hours" : `Expires in ${hours} hour${hours === 1 ? "" : "s"}`;
}

function previousDeclineReasonsForWorker(workerId) {
  return (state.applications || [])
    .filter(
      (a) =>
        a.workerId === workerId &&
        (a.workerDeclineReason || a.companyDeclineReason),
    )
    .slice(-5)
    .map((a) => ({
      jobId: a.jobId,
      workerReason: a.workerDeclineReason || "",
      companyReason: a.companyDeclineReason || "",
      at: a.workerRespondedAt || a.companyReviewedAt || "",
    }));
}

function buildOfferMatchSnapshot(job, worker, rankAtOffer = null) {
  const stats = getWorkerStats(worker?.id || "");
  const rating = buildWorkerRating(worker?.id || "");
  const scored = getMatches(job).find((w) => w.id === worker?.id);
  return {
    reliabilityRating: rating.reliabilityRating,
    punctualityRating: rating.punctualityRating,
    attendanceDays: rating.evidence?.attendanceDays || 0,
    reliabilityScore: rating.reliabilityScore,
    punctualityScore: rating.punctualityScore,
    reliability:
      rating.reliabilityScore != null
        ? rating.reliabilityScore
        : stats.totalShifts > 0
          ? stats.reliability
          : worker?.reliability ?? 100,
    punctuality: rating.punctualityScore,
    trade: worker?.trade || "",
    specialism: worker?.grade || worker?.specialism || "",
    qualifications: worker?.qualifications || "",
    certifications: worker?.certifications || [],
    travelRadiusMiles: worker?.travelRadiusMiles ?? null,
    travelFurtherWithAccommodation: !!worker?.travelFurtherWithAccommodation,
    nextAvailableDate: worker?.nextAvailableDate || "",
    plannedAbsenceSummary: Array.isArray(worker?.plannedAbsences)
      ? worker.plannedAbsences.map((a) => ({
          startDate: a.startDate,
          endDate: a.endDate,
        }))
      : [],
    previousDeclineReasons: previousDeclineReasonsForWorker(worker?.id),
    matchScore: scored?._composite ?? null,
    matchBreakdown: scored?._matchBreakdown || null,
    rankAtOffer,
    jobTrade: job?.trade || "",
    jobLocation: job?.location || "",
    jobStart: job?.start || "",
  };
}

function ensureApplicationForOffer(job, worker) {
  if (!Array.isArray(state.applications)) state.applications = [];
  let app = applicationFor(job.id, worker.id);
  if (!app) {
    app = {
      id: createId(),
      jobId: job.id,
      workerId: worker.id,
      workerName: worker.name || "Worker",
      workerTrade: worker.trade || "",
      companyId: job.companyId || "",
      companyName: job.companyName || "Company",
      status: "interested",
      createdAt: new Date().toISOString(),
    };
    state.applications.push(app);
  }
  return app;
}

function createJobOffer(jobId, workerId, source = "manual", rankAtOffer = null) {
  const job = findJob(jobId);
  const worker = findWorker(workerId);
  if (!job || !worker) return { ok: false, reason: "Job or worker not found" };
  if (job.assignedWorkerId || job.completed)
    return { ok: false, reason: "This job is no longer open" };
  if (worker.availability !== "available")
    return { ok: false, reason: "Worker is unavailable" };
  if (
    source === "manual" &&
    !getMatches(job).some((match) => match.id === worker.id)
  ) {
    return { ok: false, reason: "Worker is not eligible for this job offer" };
  }
  const pricing = computeBookingPricing({
    workerMin: workerMinRate(worker),
    budget: jobBudget(job),
  });
  if (!pricing.viable) return { ok: false, reason: pricing.reason };

  const now = new Date();
  const app = ensureApplicationForOffer(job, worker);
  if (
    ["offered", "accepted_by_worker", "under_company_review", "confirmed"].includes(
      app.status,
    )
  ) {
    return { ok: true, application: app, duplicate: true };
  }

  Object.assign(app, {
    status: "offered",
    source,
    rankAtOffer,
    offeredAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + OFFER_EXPIRY_MS).toISOString(),
    workerRespondedAt: "",
    workerDeclineReason: "",
    workerDeclineComment: "",
    companyReviewedAt: "",
    companyDecision: "",
    companyDeclineReason: "",
    companyDeclineComment: "",
    confirmedAt: "",
    supersededAt: "",
    matchSnapshot: buildOfferMatchSnapshot(job, worker, rankAtOffer),
  });
  if (!Array.isArray(worker.offerNotifications)) worker.offerNotifications = [];
  const notice = {
    id: createId(),
    type: "job_offer_sent",
    applicationId: app.id,
    jobId: job.id,
    message: `New job offer: ${job.trade} in ${job.location}.`,
    createdAt: now.toISOString(),
    readAt: "",
  };
  worker.offerNotifications.unshift(notice);
  app.workerNotifiedAt = now.toISOString();
  app.workerNotificationId = notice.id;
  logActivity(
    "assign",
    `Job offer sent to <strong>${escapeHtml(worker.name)}</strong> for ${escapeHtml(job.trade)} in ${escapeHtml(job.location)}.`,
  );
  return { ok: true, application: app };
}

function expireJobOffers() {
  let changed = false;
  const now = Date.now();
  (state.applications || []).forEach((app) => {
    if (app.status !== "offered" || !app.expiresAt) return;
    if (new Date(app.expiresAt).getTime() > now) return;
    app.status = "expired";
    app.expiredAt = new Date().toISOString();
    changed = true;

    const worker = applicationWorker(app);
    if (!worker) return;
    worker.consecutiveMissedOffers = (worker.consecutiveMissedOffers || 0) + 1;
    if (
      worker.consecutiveMissedOffers >= MISSED_OFFERS_LIMIT &&
      worker.availability === "available"
    ) {
      updateWorkerAvailability(worker.id, "not available", worker.nextAvailableDate || "");
      if (!Array.isArray(worker.offerNotifications)) worker.offerNotifications = [];
      worker.offerNotifications.unshift({
        id: createId(),
        type: "missed_2_offers",
        message: MISSED_OFFERS_NOTICE,
        createdAt: new Date().toISOString(),
        readAt: "",
      });
      logActivity(
        "avail",
        `<strong>${escapeHtml(worker.name)}</strong> missed 2 job offers and was set to unavailable.`,
      );
    }
    const next = offerNextBestWorker(app.jobId);
    if (next.ok) {
      logActivity(
        "assign",
        `Offer expired for <strong>${escapeHtml(app.workerName || worker.name)}</strong>. Next best worker offered.`,
      );
    }
  });
  return changed;
}

function workerAcceptOffer(applicationId) {
  const app = (state.applications || []).find((a) => a.id === applicationId);
  const job = applicationJob(app);
  const worker = applicationWorker(app);
  if (!app || !job || !worker) return;
  if (app.status !== "offered") return;
  if (new Date(app.expiresAt).getTime() <= Date.now()) {
    expireJobOffers();
    saveAndRender();
    showToast("This offer has expired");
    return;
  }
  app.status = "under_company_review";
  app.workerRespondedAt = new Date().toISOString();
  worker.consecutiveMissedOffers = 0;
  if (!Array.isArray(state.notifications)) state.notifications = [];
  state.notifications.unshift({
    id: createId(),
    type: "worker_offer_accepted",
    applicationId: app.id,
    jobId: job.id,
    workerId: worker.id,
    companyId: app.companyId || job.companyId || "",
    message: `${worker.name} accepted the offer for ${job.trade} in ${job.location}.`,
    createdAt: new Date().toISOString(),
    readAt: "",
  });
  logActivity(
    "assign",
    `<strong>${escapeHtml(worker.name)}</strong> accepted the offer for ${escapeHtml(job.trade)} in ${escapeHtml(job.location)} — awaiting company review.`,
  );
  saveAndRender();
  showToast("Offer accepted — awaiting company review");
}

function workerDeclineOffer(applicationId, reason, comment = "") {
  const app = (state.applications || []).find((a) => a.id === applicationId);
  const job = applicationJob(app);
  const worker = applicationWorker(app);
  if (!app || !reason || app.status !== "offered") return;
  app.status = "declined_by_worker";
  app.workerRespondedAt = new Date().toISOString();
  app.workerDeclineReason = reason;
  app.workerDeclineComment = comment.trim();
  if (worker) worker.consecutiveMissedOffers = 0;
  const next = job ? offerNextBestWorker(job.id) : { ok: false };
  logActivity(
    "assign",
    `<strong>${escapeHtml(app.workerName)}</strong> declined the offer for ${escapeHtml(job?.trade || "the job")} — ${escapeHtml(reason)}. Reliability is unaffected.${next.ok ? " Next best worker offered." : ""}`,
  );
  saveAndRender();
  showToast(
    next.ok
      ? "Offer declined — next best worker offered"
      : "Offer declined — your reliability is unaffected",
  );
}

function companyAcceptWorker(applicationId) {
  const app = (state.applications || []).find((a) => a.id === applicationId);
  const job = applicationJob(app);
  const worker = applicationWorker(app);
  if (!app || !job || !worker) return;
  if (app.status !== "under_company_review") return;
  const res = confirmBooking(job, worker.id);
  if (!res.ok) {
    showToast(res.reason);
    return;
  }
  app.status = "confirmed";
  app.companyDecision = "accepted";
  app.companyReviewedAt = new Date().toISOString();
  app.confirmedAt = app.companyReviewedAt;
  (state.applications || []).forEach((other) => {
    if (other.jobId !== job.id || other.id === app.id) return;
    if (
      ["interested", "offered", "under_company_review", "accepted_by_worker"].includes(
        other.status,
      )
    ) {
      other.status = "superseded";
      other.supersededAt = new Date().toISOString();
    }
  });
  logActivity(
    "assign",
    `<strong>${escapeHtml(worker.name)}</strong> confirmed for ${escapeHtml(job.trade)} in ${escapeHtml(job.location)} after offer review.`,
  );
  saveAndRender();
  showToast("Worker confirmed — Job Agreement signing is required before QR Sign In becomes active");
}

function companyDeclineWorker(applicationId, reason, comment = "") {
  const app = (state.applications || []).find((a) => a.id === applicationId);
  const job = applicationJob(app);
  if (!app || !job || !reason || app.status !== "under_company_review") return;
  app.status = "declined_by_company";
  app.companyDecision = "declined";
  app.companyReviewedAt = new Date().toISOString();
  app.companyDeclineReason = reason;
  app.companyDeclineComment = comment.trim();
  const next = offerNextBestWorker(job.id);
  logActivity(
    "assign",
    `${escapeHtml(app.companyName || "Company")} declined <strong>${escapeHtml(app.workerName)}</strong> for ${escapeHtml(job.trade)} — ${escapeHtml(reason)}.${next.ok ? " Next best worker offered." : ""}`,
  );
  saveAndRender();
  showToast(next.ok ? "Worker declined — next best worker offered" : "Worker declined — no other match available");
}

function offerNextBestWorker(jobId) {
  const job = findJob(jobId);
  if (!job || job.assignedWorkerId || job.completed)
    return { ok: false, reason: "Job unavailable" };
  const activeOffer = (state.applications || []).find(
    (a) =>
      a.jobId === jobId &&
      ["offered", "under_company_review", "confirmed"].includes(a.status),
  );
  if (activeOffer) return { ok: false, reason: "Offer already active" };
  const usedWorkerIds = new Set(
    (state.applications || [])
      .filter(
        (a) =>
          a.jobId === jobId &&
          [
            "offered",
            "under_company_review",
            "declined_by_worker",
            "declined_by_company",
            "expired",
            "confirmed",
            "superseded",
          ].includes(a.status),
      )
      .map((a) => a.workerId),
  );
  const rankedMatches = getMatches(job);
  const next = rankedMatches.find((w) => !usedWorkerIds.has(w.id));
  if (!next) return { ok: false, reason: "No matched worker available" };
  return createJobOffer(job.id, next.id, "next_best", rankedMatches.indexOf(next) + 1);
}

function autoOfferBestMatch(jobId, source = "auto_match") {
  const job = findJob(jobId);
  if (!job || job.assignedWorkerId || job.completed)
    return { ok: false, reason: "Job unavailable" };
  const activeOffer = (state.applications || []).find(
    (a) =>
      a.jobId === jobId &&
      ["offered", "under_company_review", "confirmed"].includes(a.status),
  );
  if (activeOffer) return { ok: false, reason: "Offer already active" };
  const matches = getMatches(job);
  const [best] = matches;
  if (!best) return { ok: false, reason: "No matched worker available" };
  const res = createJobOffer(job.id, best.id, source, 1);
  return { ...res, worker: best };
}

// ─── Worker Identity Records (duplicate / returning-worker prevention) ──
// A WorkerIdentityRecord is a PERMANENT record kept separately from the login
// account. It survives account deletion so a worker with a poor reliability
// record cannot wipe it by deleting and re-registering under a new email/phone.
const IDENTITY_KEY = "onsite_identities_v1";

function getIdentities() {
  try {
    return JSON.parse(localStorage.getItem(IDENTITY_KEY)) || [];
  } catch (_) {
    return [];
  }
}
function saveIdentities(list) {
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(list));
  } catch (_) {}
}
function findIdentityById(wid) {
  return getIdentities().find((i) => i.workerIdentityId === wid) || null;
}

// Normalisers used for matching
function idNormName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
function idNormDigits(s) {
  return String(s || "").replace(/\D/g, "");
}
function idNormEmail(s) {
  return String(s || "")
    .trim()
    .toLowerCase();
}
function idNormCard(s) {
  return String(s || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

// Privacy-preserving masks — never expose full old emails / phones / IDs
function maskTail(s, keep = 3) {
  s = String(s || "");
  if (!s) return "—";
  if (s.length <= keep) return "•".repeat(s.length);
  return "•".repeat(Math.max(2, s.length - keep)) + s.slice(-keep);
}
function maskEmail(e) {
  e = String(e || "");
  const at = e.indexOf("@");
  if (at < 1) return maskTail(e);
  return e[0] + "•••" + e.slice(at);
}

// Collect every field on which a candidate matches an identity record.
function collectMatchedFields(id, c) {
  const out = [];
  const utr = idNormDigits(c.utr);
  const card = idNormCard(c.cscsCard);
  const dob = String(c.dateOfBirth || "").trim();
  const nm = idNormName(c.fullLegalName || c.name);
  const phone = idNormDigits(c.phone);
  const email = idNormEmail(c.email);
  if (utr && idNormDigits(id.utr) === utr) out.push("UTR number");
  if (card && idNormCard(id.cscsCard) === card) out.push("CSCS/ECS card");
  if (
    dob &&
    nm &&
    id.dateOfBirth === dob &&
    idNormName(id.fullLegalName) === nm
  )
    out.push("Name + date of birth");
  if (phone && (id.phones || []).some((p) => idNormDigits(p) === phone))
    out.push("Phone number");
  if (email && (id.emails || []).some((e) => idNormEmail(e) === email))
    out.push("Email address");
  return out;
}

// Find an existing identity matching the candidate, honouring match priority:
// 1) UTR  2) CSCS/ECS card  3) DOB + legal name  4) phone/email history.
function findIdentityMatch(c) {
  const ids = getIdentities();
  const utr = idNormDigits(c.utr);
  const card = idNormCard(c.cscsCard);
  const dob = String(c.dateOfBirth || "").trim();
  const nm = idNormName(c.fullLegalName || c.name);
  const phone = idNormDigits(c.phone);
  const email = idNormEmail(c.email);

  let hit = null;
  const pick = (pred) => {
    if (!hit) {
      const m = ids.find(pred);
      if (m) hit = m;
    }
  };
  if (utr) pick((id) => idNormDigits(id.utr) === utr);
  if (card) pick((id) => idNormCard(id.cscsCard) === card);
  if (dob && nm)
    pick((id) => id.dateOfBirth === dob && idNormName(id.fullLegalName) === nm);
  if (phone)
    pick((id) => (id.phones || []).some((p) => idNormDigits(p) === phone));
  if (email)
    pick((id) => (id.emails || []).some((e) => idNormEmail(e) === email));

  if (!hit) return null;
  return { identity: hit, matchedFields: collectMatchedFields(hit, c) };
}

// Called at sign-up. Links the new login to an existing identity if a match is
// found (restoring reliability + history) or creates a fresh identity record.
function registerWorkerIdentity(user) {
  const ids = getIdentities();
  const now = Date.now();
  const match = findIdentityMatch(user);

  if (match) {
    const id = ids.find(
      (x) => x.workerIdentityId === match.identity.workerIdentityId,
    );
    if (id.currentUserAccountId && id.currentUserAccountId !== user.id) {
      id.previousUserAccountIds = id.previousUserAccountIds || [];
      if (!id.previousUserAccountIds.includes(id.currentUserAccountId)) {
        id.previousUserAccountIds.push(id.currentUserAccountId);
      }
    }
    id.currentUserAccountId = user.id;
    id.phones = Array.from(
      new Set([...(id.phones || []), user.phone].filter(Boolean)),
    );
    id.emails = Array.from(
      new Set([...(id.emails || []), user.email].filter(Boolean)),
    );
    id.fullLegalName = id.fullLegalName || user.name;
    id.dateOfBirth = id.dateOfBirth || user.dateOfBirth || "";
    id.utr = id.utr || user.utr || "";
    id.cscsCard = id.cscsCard || user.cscsCard || "";
    id.rightToWorkReference = id.rightToWorkReference || user.rightToWork || "";
    id.flagged = true;
    id.flagReason = "Possible returning worker / duplicate account";
    id.matchedFields = match.matchedFields;
    id.pendingAccountId = user.id;
    if (id.accountStatus === "deleted" || id.accountStatus === "suspended") {
      id.accountStatus = "under_review";
    }
    id.updatedAt = now;
    saveIdentities(ids);
    return {
      identity: id,
      isDuplicate: true,
      matchedFields: match.matchedFields,
      restoredScore: id.reliabilityScore,
    };
  }

  const rec = {
    workerIdentityId: "wid-" + now + "-" + Math.random().toString(16).slice(2),
    fullLegalName: user.name,
    dateOfBirth: user.dateOfBirth || "",
    utr: user.utr || "",
    cscsCard: user.cscsCard || "",
    rightToWorkReference: user.rightToWork || "",
    phones: [user.phone].filter(Boolean),
    emails: [user.email].filter(Boolean),
    currentUserAccountId: user.id,
    previousUserAccountIds: [],
    reliabilityScore: 100,
    attendanceHistory: [],
    bookingHistory: [],
    accountStatus: "active",
    flagged: false,
    flagReason: "",
    matchedFields: [],
    pendingAccountId: null,
    createdAt: now,
    updatedAt: now,
  };
  ids.push(rec);
  saveIdentities(ids);
  return {
    identity: rec,
    isDuplicate: false,
    matchedFields: [],
    restoredScore: null,
  };
}

// Persist a worker's latest reliability onto their permanent identity record so
// it can be restored if they later delete and re-register.
function syncIdentityReliability(userId, score) {
  if (!userId || typeof score !== "number") return;
  const ids = getIdentities();
  const id = ids.find((x) => x.currentUserAccountId === userId);
  if (!id) return;
  id.reliabilityScore = clampScore(score);
  id.updatedAt = Date.now();
  saveIdentities(ids);
}

// Called when a worker deletes their account. Keeps the identity record.
function markIdentityDeleted(userId) {
  const ids = getIdentities();
  const id = ids.find((x) => x.currentUserAccountId === userId);
  if (!id) return;
  id.previousUserAccountIds = id.previousUserAccountIds || [];
  if (
    id.currentUserAccountId &&
    !id.previousUserAccountIds.includes(id.currentUserAccountId)
  ) {
    id.previousUserAccountIds.push(id.currentUserAccountId);
  }
  id.accountStatus = "deleted";
  id.currentUserAccountId = null;
  id.updatedAt = Date.now();
  saveIdentities(ids);
}

// ── Admin actions on identity records ──
function confirmIdentityMatch(wid) {
  const ids = getIdentities();
  const id = ids.find((x) => x.workerIdentityId === wid);
  if (!id) return;
  id.flagged = false;
  id.flagReason = "";
  id.pendingAccountId = null;
  if (id.accountStatus === "under_review") id.accountStatus = "active";
  id.updatedAt = Date.now();
  saveIdentities(ids);
  logActivity(
    "worker",
    `Admin confirmed duplicate match for <strong>${escapeHtml(id.fullLegalName || "worker")}</strong>`,
  );
  showToast("Confirmed — accounts linked as the same person");
  render();
}

function rejectIdentityMatch(wid) {
  const ids = getIdentities();
  const id = ids.find((x) => x.workerIdentityId === wid);
  if (!id) return;
  const pending = id.pendingAccountId;
  if (pending) {
    const u =
      (typeof getUsers === "function" ? getUsers() : []).find(
        (x) => x.id === pending,
      ) || null;
    if (id.currentUserAccountId === pending) {
      id.currentUserAccountId = (id.previousUserAccountIds || []).pop() || null;
    } else {
      id.previousUserAccountIds = (id.previousUserAccountIds || []).filter(
        (p) => p !== pending,
      );
    }
    const now = Date.now();
    const rec = {
      workerIdentityId:
        "wid-" + now + "-" + Math.random().toString(16).slice(2),
      fullLegalName: u ? u.name : "Unknown worker",
      dateOfBirth: u ? u.dateOfBirth || "" : "",
      utr: u ? u.utr || "" : "",
      cscsCard: u ? u.cscsCard || "" : "",
      rightToWorkReference: u ? u.rightToWork || "" : "",
      phones: u ? [u.phone].filter(Boolean) : [],
      emails: u ? [u.email].filter(Boolean) : [],
      currentUserAccountId: pending,
      previousUserAccountIds: [],
      reliabilityScore: 100,
      attendanceHistory: [],
      bookingHistory: [],
      accountStatus: "active",
      flagged: false,
      flagReason: "",
      matchedFields: [],
      pendingAccountId: null,
      createdAt: now,
      updatedAt: now,
    };
    ids.push(rec);
    if (
      u &&
      typeof getUsers === "function" &&
      typeof saveUsers === "function"
    ) {
      u.reliability = 100;
      u.identityId = rec.workerIdentityId;
      saveUsers(getUsers().map((x) => (x.id === u.id ? u : x)));
    }
  }
  id.flagged = false;
  id.flagReason = "";
  id.matchedFields = [];
  id.pendingAccountId = null;
  if (id.accountStatus === "under_review") id.accountStatus = "active";
  id.updatedAt = Date.now();
  saveIdentities(ids);
  logActivity(
    "worker",
    `Admin rejected a duplicate match — created a separate identity record`,
  );
  showToast("Rejected — treated as a different person");
  render();
}

function mergeIdentities(keepWid, mergeWid) {
  if (keepWid === mergeWid) return;
  const ids = getIdentities();
  const keep = ids.find((x) => x.workerIdentityId === keepWid);
  const merge = ids.find((x) => x.workerIdentityId === mergeWid);
  if (!keep || !merge) return;
  keep.phones = Array.from(
    new Set([...(keep.phones || []), ...(merge.phones || [])].filter(Boolean)),
  );
  keep.emails = Array.from(
    new Set([...(keep.emails || []), ...(merge.emails || [])].filter(Boolean)),
  );
  keep.previousUserAccountIds = Array.from(
    new Set(
      [
        ...(keep.previousUserAccountIds || []),
        ...(merge.previousUserAccountIds || []),
        merge.currentUserAccountId,
      ]
        .filter(Boolean)
        .filter((aid) => aid !== keep.currentUserAccountId),
    ),
  );
  keep.reliabilityScore = Math.min(
    keep.reliabilityScore ?? 100,
    merge.reliabilityScore ?? 100,
  );
  keep.utr = keep.utr || merge.utr;
  keep.cscsCard = keep.cscsCard || merge.cscsCard;
  keep.dateOfBirth = keep.dateOfBirth || merge.dateOfBirth;
  keep.rightToWorkReference =
    keep.rightToWorkReference || merge.rightToWorkReference;
  keep.flagged = false;
  keep.flagReason = "";
  keep.pendingAccountId = null;
  keep.updatedAt = Date.now();
  const remaining = ids.filter((x) => x.workerIdentityId !== mergeWid);
  saveIdentities(remaining);
  logActivity(
    "worker",
    `Admin merged two identity records for <strong>${escapeHtml(keep.fullLegalName || "worker")}</strong>`,
  );
  showToast("Records merged");
  render();
}

function reactivateIdentity(wid) {
  const ids = getIdentities();
  const id = ids.find((x) => x.workerIdentityId === wid);
  if (!id) return;
  id.accountStatus = "active";
  id.flagged = false;
  id.updatedAt = Date.now();
  saveIdentities(ids);
  logActivity(
    "worker",
    `Admin reactivated identity record for <strong>${escapeHtml(id.fullLegalName || "worker")}</strong>`,
  );
  showToast("Identity record reactivated");
  render();
}

// ─── DOM References ───────────────────────────────────────
const workerForm = document.querySelector("#workerForm");
const jobForm = document.querySelector("#jobForm");
const workersList = document.querySelector("#workersList");
const workersEmpty = document.querySelector("#workersEmpty");
const jobsList = document.querySelector("#jobsList");
const matchResults = document.querySelector("#matchResults");
const resetDemoBtn = document.querySelector("#resetDemoBtn");
const workerCount = document.querySelector("#workerCount");
const jobCount = document.querySelector("#jobCount");
const workerSearch = document.querySelector("#workerSearch");

let activeFilter = "all";

workerSearch.addEventListener("input", () => renderWorkers());

document.querySelectorAll(".filter-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document
      .querySelectorAll(".filter-chip")
      .forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    activeFilter = chip.dataset.filter;
    renderWorkers();
  });
});

// ─── Session User Helper ──────────────────────────────────
function getSessionUser() {
  try {
    return JSON.parse(localStorage.getItem("onsite_auth_v1"));
  } catch (_) {
    return null;
  }
}

// ─── Tab Routing ──────────────────────────────────────────
function switchTab(tab) {
  document
    .querySelectorAll("[data-tab]")
    .forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
  document
    .querySelectorAll(".tab-panel")
    .forEach((panel) =>
      panel.classList.toggle("active", panel.id === `tab-${tab}`),
    );
}

function bindTabEvents() {
  document.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}
bindTabEvents();

// ─── Nav Rebuild ──────────────────────────────────────────
const ORIG_TOP_NAV = document.querySelector(".tab-nav").innerHTML;
const ORIG_BOTTOM_NAV = document.querySelector(".bottom-nav").innerHTML;
const ORIG_DASHBOARD = document.getElementById("tab-dashboard").innerHTML;

const NAV_SM = {
  home: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  jobs: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
  bookings: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  profile: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  requests: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  workforce: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  account: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>`,
};

const NAV_LG = Object.fromEntries(
  Object.entries(NAV_SM).map(([k, v]) => [
    k,
    v.replace(/width="16" height="16"/g, 'width="22" height="22"'),
  ]),
);

const WORKER_TABS = [
  { id: "dashboard", icon: "home", label: "Home" },
  { id: "jobs", icon: "jobs", label: "Jobs" },
  { id: "attendance", icon: "bookings", label: "Timesheet" },
  { id: "profile", icon: "profile", label: "Profile" },
];

const CONTRACTOR_TABS = [
  { id: "dashboard", icon: "home", label: "Home" },
  { id: "add", icon: "requests", label: "Requests" },
  { id: "workers", icon: "workforce", label: "Workforce" },
  { id: "account", icon: "account", label: "Account" },
];

function rebuildNav(tabDefs, activeId) {
  const topNav = document.querySelector(".tab-nav");
  const bottomNav = document.querySelector(".bottom-nav");
  if (!topNav || !bottomNav) return;
  topNav.innerHTML = tabDefs
    .map(
      (t) => `
    <button class="tab-btn${t.id === activeId ? " active" : ""}" data-tab="${t.id}" type="button">
      ${NAV_SM[t.icon] || ""}${t.label}
    </button>`,
    )
    .join("");
  bottomNav.innerHTML = tabDefs
    .map(
      (t) => `
    <button class="bottom-nav-btn${t.id === activeId ? " active" : ""}" data-tab="${t.id}" type="button">
      ${NAV_LG[t.icon] || ""}
      <span>${t.label}</span>
    </button>`,
    )
    .join("");
  bindTabEvents();
}

function restoreNav() {
  document.querySelector(".tab-nav").innerHTML = ORIG_TOP_NAV;
  document.querySelector(".bottom-nav").innerHTML = ORIG_BOTTOM_NAV;
  bindTabEvents();
}

// ─── Role-Based View ─────────────────────────────────────
function applyRoleView(user) {
  const role = user?.type || null;

  if (role === "worker") {
    rebuildNav(WORKER_TABS, "dashboard");
    // Update jobs panel header for workers
    const jobsHeader = document.querySelector("#tab-jobs .panel-title");
    const jobsSub = document.querySelector("#tab-jobs .panel-subtitle");
    if (jobsHeader) jobsHeader.textContent = "Available Jobs";
    if (jobsSub) jobsSub.textContent = "Open positions matching your trade";
    render();
    switchTab("dashboard");
  } else if (role === "company") {
    rebuildNav(CONTRACTOR_TABS, "dashboard");
    // Companies: show job form only, hide worker form and toggle bar
    document.querySelector(".add-toggle")?.classList.add("hidden");
    document.querySelector("#formWorker")?.classList.add("hidden");
    document.querySelector("#formJob")?.classList.remove("hidden");
    // Update the add tab header for companies
    const addTitle = document.querySelector("#tab-add .form-card-header h3");
    const addSub = document.querySelector("#tab-add .form-card-header p");
    if (addTitle) addTitle.textContent = "Labour Request";
    if (addSub) addSub.textContent = "Post a new labour requirement";
    render();
    switchTab("dashboard");
  } else {
    // Admin / demo — restore original nav and dashboard
    restoreNav();
    document.getElementById("tab-dashboard").innerHTML = ORIG_DASHBOARD;
    const jobsHeader = document.querySelector("#tab-jobs .panel-title");
    const jobsSub = document.querySelector("#tab-jobs .panel-subtitle");
    if (jobsHeader) jobsHeader.textContent = "Job Requests";
    if (jobsSub) jobsSub.textContent = "Company requests awaiting assignment";
    render();
    switchTab("dashboard");
  }
}

// ─── Worker Home ──────────────────────────────────────────
function renderWorkerHome(user) {
  const el = document.getElementById("tab-dashboard");
  if (!el) return;

  const stats = getWorkerStats(user.id || "");
  const rating = buildWorkerRating(user.id || "");
  const reliability =
    rating.reliabilityScore != null
      ? rating.reliabilityScore
      : stats.totalShifts > 0
      ? (stats.reliability ?? 100)
      : (user.reliability ?? 100);
  const pct = calcWorkerCompletion(user);

  // Active booking
  const booking = state.jobs.find((j) => j.assignedWorkerId === user.id);

  // Recommended jobs (trade-matched, up to 3)
  const trade = canonicalTrade(user.trade);
  const recommended = [...state.jobs]
    .filter((j) => !trade || canonicalTrade(j.trade) === trade)
    .sort((a, b) => new Date(a.start || 0) - new Date(b.start || 0))
    .slice(0, 3);

  // Greeting
  const hr = new Date().getHours();
  const greet =
    hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";

  // Days worked this month
  const thisMonth = new Date().toISOString().slice(0, 7);
  const daysThisMonth = attendanceRecords.filter(
    (r) =>
      r.workerId === user.id &&
      r.date.startsWith(thisMonth) &&
      (r.status === "onTime" || r.status === "late"),
  ).length;

  const bookingDayRate = booking
    ? booking.agreedDayRate != null
      ? booking.agreedDayRate
      : parseDayRate(booking.payRate)
    : 0;
  const bookingAgr = booking ? agreementForJob(booking) : null;
  const agrState = bookingAgr ? agreementWorkerState(bookingAgr) : "none";
  const bookingLive = booking ? bookingAgreementActive(booking) : false;
  const agreementBanner =
    booking && bookingAgr && agrState !== "active"
      ? `
    <div class="wh-agr-banner wh-agr-banner--${agrState === "pending_worker" ? "action" : "wait"}">
      <div class="wh-agr-banner-text">
        <strong>${agrState === "pending_worker" ? "Job Agreement — action needed" : "Job Agreement signed"}</strong>
        <span>${
          agrState === "pending_worker"
            ? "Review and accept your agreement to activate this booking. You can't check in or navigate to site until it's active."
            : "Waiting for the company to confirm. Your booking activates once they sign."
        }</span>
      </div>
      <button class="wh-agr-review-btn" type="button" data-agr-open="${bookingAgr.id}">${agrState === "pending_worker" ? "Review & Sign" : "View"}</button>
    </div>`
	      : "";
  const isUnavailable = user.availability === "not available";
  const nextAvailable = formatDateInput(user.nextAvailableDate);
  const workerProfile = findWorker(user.id) || ensureWorkerProfileForUser(user);
  const workerOffers = (state.applications || []).filter(
    (a) =>
      a.workerId === user.id &&
      ["offered", "under_company_review", "confirmed", "declined_by_worker", "expired"].includes(
        a.status,
      ),
  );
  const activeOffers = workerOffers.filter((a) => a.status === "offered");
  const recentOfferHistory = workerOffers
    .filter((a) => a.status !== "offered")
    .slice(-3)
    .reverse();
  const missedNotice = (workerProfile?.offerNotifications || []).find(
    (n) => n.type === "missed_2_offers" && !n.readAt,
  );
  const plannedAbsences = plannedAbsencesForWorker(workerProfile || user);
  const plannedAbsencePanel = `
    <div class="wh-section-label">Planned Absence</div>
    <div class="wh-planned-panel">
      <div class="wh-planned-form">
        <label class="wh-next-date">
          <span>Start Date</span>
          <input id="whAbsenceStart" type="date" />
        </label>
        <label class="wh-next-date">
          <span>End Date</span>
          <input id="whAbsenceEnd" type="date" />
        </label>
        <button class="wh-next-save" id="whAbsenceSave" type="button">Add</button>
      </div>
      ${
        plannedAbsences.length
          ? `<div class="wh-planned-list">
              ${plannedAbsences
                .slice(0, 5)
                .map(
                  (absence) => `
                <div class="wh-planned-row">
                  <span>${formatDateOnly(absence.startDate)}</span>
                  <strong>${absence.endDate !== absence.startDate ? `to ${formatDateOnly(absence.endDate)}` : "Unavailable"}</strong>
                </div>`,
                )
                .join("")}
            </div>`
          : `<div class="att-empty">No Planned Absence added.</div>`
      }
    </div>`;
  const availabilityPanel = `
    <div class="wh-availability-panel">
      <div class="wh-availability-main">
        <button class="wh-avail-btn ${isUnavailable ? "unavailable" : "available"}"
          id="whAvailBtn" type="button">
          <span class="wh-avail-dot"></span>
          ${isUnavailable ? "Unavailable" : "Available"}
        </button>
        <label class="wh-next-date">
          <span>Next Available Date</span>
          <input id="whNextAvailableDate" type="date" value="${escapeHtml(nextAvailable)}" />
        </label>
        <button class="wh-next-save" id="whNextAvailableSave" type="button">Save</button>
      </div>
      ${
        isUnavailable
          ? `<div class="wh-unavailable-note">You’re currently unavailable. Toggle to available when you’re ready to start receiving job offers.</div>`
          : ""
      }
    </div>`;
  const missedNoticeHtml = missedNotice
    ? `<div class="wh-offer-notice">${escapeHtml(missedNotice.message)}</div>`
    : "";
  const offerCardHtml = (app) => {
    const job = applicationJob(app);
    const pay = job ? workerPayDisplay(job, workerProfile || user) : null;
    if (!job) return "";
    return `
      <div class="wh-offer-card">
        <div class="wh-offer-head">
          <span class="wh-offer-label">Job Offer</span>
          <span class="wh-offer-expiry">${escapeHtml(offerExpiryLabel(app))}</span>
        </div>
        <div class="wh-offer-title">${escapeHtml(job.trade)} · ${escapeHtml(job.location)}</div>
        <div class="wh-offer-meta">
          ${job.start ? formatDate(job.start) : "Start date TBC"}
          ${job.duration ? ` · ${escapeHtml(job.duration)}` : ""}
          ${pay != null ? ` · ${formatMoney(pay)}/day guaranteed` : ""}
        </div>
        ${job.siteName || job.siteAddress ? `<div class="wh-offer-site">${escapeHtml(job.siteName || job.siteAddress)}</div>` : ""}
        <div class="wh-offer-actions">
          <button class="secondary-btn wh-offer-decline" type="button" data-worker-offer-decline="${app.id}">Decline</button>
          <button class="primary-btn wh-offer-accept" type="button" data-worker-offer-accept="${app.id}">Accept</button>
        </div>
      </div>`;
  };
  const offerHistoryHtml = recentOfferHistory.length
    ? `<div class="wh-offer-history">
        ${recentOfferHistory
          .map((app) => {
            const job = applicationJob(app);
            const reason =
              app.workerDeclineReason || app.companyDeclineReason
                ? ` · ${escapeHtml(app.workerDeclineReason || app.companyDeclineReason)}`
                : "";
            return `<div class="wh-offer-history-row">
              <span>${escapeHtml(job?.trade || "Job")} · ${escapeHtml(job?.location || "")}</span>
              <strong>${escapeHtml(offerStatusLabel(app.status))}${reason}</strong>
            </div>`;
          })
          .join("")}
      </div>`
    : "";
  const offersPanel =
    missedNoticeHtml || activeOffers.length || offerHistoryHtml
      ? `
    <div class="wh-section-label">Job Offers</div>
    <div class="wh-offers-panel">
      ${missedNoticeHtml}
      ${
        activeOffers.length
          ? activeOffers.map(offerCardHtml).join("")
          : `<div class="att-empty">No active job offers right now.</div>`
      }
      ${offerHistoryHtml}
    </div>`
      : "";
  const signInPanel =
    booking && bookingLive
      ? `
    <div class="wh-signin-panel">
      <div class="wh-signin-copy">
        <div class="wh-section-label">Site Sign In</div>
        <div class="wh-signin-title">${escapeHtml(booking.trade)} · ${escapeHtml(booking.location)}</div>
        <div class="wh-signin-sub">Camera scanner-ready sign in for today's site QR code.</div>
      </div>
      <button class="wh-signin-btn" type="button" data-worker-home-signin="${user.id}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        Sign In
      </button>
    </div>`
      : "";
  const activeBookingHtml = booking
    ? `
    <div class="wh-booking-card">
      <div class="wh-booking-head">
        <div class="wh-booking-label">${bookingLive ? "Active Booking" : "Booking — Pending Agreement"}</div>
        <span class="protected-badge">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          Protected
        </span>
      </div>
      ${agreementBanner}
      <div class="wh-booking-trade">${escapeHtml(booking.trade)}</div>
      <div class="wh-booking-meta">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        ${escapeHtml(booking.location)}
        ${booking.start ? ` · ${new Date(booking.start).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}` : ""}
        ${booking.duration ? ` · ${escapeHtml(booking.duration)}` : ""}
        ${bookingDayRate ? ` · <strong>${formatMoney(bookingDayRate)}/day</strong>` : booking.payRate ? ` · <strong>${escapeHtml(booking.payRate)}</strong>` : ""}
      </div>
      ${booking.estimatedEndDate || booking.endDate ? `<div class="wh-booking-end">Estimated end: <strong>${formatDate(booking.estimatedEndDate || booking.endDate)}</strong></div>` : ""}
      ${
        booking.extensionRequestedAt
          ? `
        <div class="wh-ext-request">
          <div class="wh-ext-req-title">Extension requested</div>
          <div class="wh-ext-req-body">${escapeHtml(booking.companyName || "Your company")} wants to extend your booking until <strong>${formatDate(booking.newProposedEndDate)}</strong> at <strong>${formatMoney(booking.proposedDayRate || bookingDayRate)}/day</strong>.</div>
          <div class="wh-ext-actions">
            <button class="wh-ext-btn wh-ext-accept" type="button" data-ext-accept="${booking.id}">Accept</button>
            <button class="wh-ext-btn wh-ext-decline" type="button" data-ext-decline="${booking.id}">Decline</button>
          </div>
        </div>`
          : booking.extensionJustExtended ||
              (booking.extensionStatus && booking.extensionStatus !== "pending")
            ? `
        <div class="wh-ext-note ${extensionStatusLabel(booking).cls}">${
          booking.extensionJustExtended
            ? "Extension confirmed — you're booked to the new end date."
            : booking.extensionStatus === "declined_by_worker"
              ? "You declined the extension. You'll be available for new projects from the end date."
              : "This booking is ending as planned. You'll be available for new projects from the end date."
        }</div>`
            : ""
      }
      <div class="wh-booking-protect">If your company cancels within ${PROTECTION_WINDOW_DAYS} working days of the start date, you're owed 1 day's pay${bookingDayRate ? ` (${formatMoney(bookingDayRate)})` : ""}.</div>
    </div>`
    : "";

  const recJobsHtml = recommended.length
    ? `
    <div class="wh-section-label">Recommended for You</div>
    ${recommended
      .map((job) => {
        const recPay = workerPayDisplay(job, user);
        const daysUntil = job.start
          ? Math.ceil((new Date(job.start) - new Date()) / 86400000)
          : null;
        const urgency =
          daysUntil !== null
            ? daysUntil <= 0
              ? `<span class="wjc-urgency urgency-now">Today</span>`
              : daysUntil === 1
                ? `<span class="wjc-urgency urgency-soon">Tomorrow</span>`
                : daysUntil <= 7
                  ? `<span class="wjc-urgency urgency-soon">${daysUntil}d</span>`
                  : `<span class="wjc-urgency urgency-later">${daysUntil}d</span>`
            : "";
        return `
      <div class="wh-rec-job" data-apply-home="${job.id}">
        <div class="wh-rec-left">
          <div class="wh-rec-trade">${escapeHtml(job.trade)}</div>
          <div class="wh-rec-loc">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            ${escapeHtml(job.location)}
            ${recPay != null ? ` · <strong>${formatMoney(recPay)}/day</strong>` : ""}
          </div>
        </div>
        <div class="wh-rec-right">${urgency}<svg class="wh-rec-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></div>
      </div>`;
      })
      .join("")}
    <button class="wh-view-all" type="button" data-tab="jobs">View all jobs →</button>`
    : `
    <div class="wh-section-label">Recommended for You</div>
    <div class="att-empty">No open ${escapeHtml(user.trade || "jobs")} positions right now — check back soon.</div>`;

  el.innerHTML = `
    <div class="wh-greeting">${greet}, <strong>${escapeHtml((user.name || "").split(" ")[0])}</strong> 👋</div>
    <div class="wh-hero">
      <div class="wh-hero-left">
        ${ratingBadgeHTML(rating.reliabilityRating)}
      </div>
      <div class="wh-hero-stats">
        <div class="wh-stat-card">
          <div class="wh-stat-val">${stats.totalShifts}</div>
          <div class="wh-stat-lbl">Attendance Days</div>
        </div>
        <div class="wh-stat-card">
          <div class="wh-stat-val wh-stat-rating">${escapeHtml(rating.punctualityRating)}</div>
          <div class="wh-stat-lbl">Punctuality</div>
        </div>
        <div class="wh-stat-card">
          <div class="wh-stat-val">${daysThisMonth}</div>
          <div class="wh-stat-lbl">Days This Month</div>
        </div>
      </div>
    </div>
    <div class="wh-rating-evidence">${ratingEvidenceHTML(rating, true)}</div>
    ${availabilityPanel}
    ${plannedAbsencePanel}
    ${offersPanel}
    ${signInPanel}
    ${activeBookingHtml}
    ${recJobsHtml}`;

  // Availability toggle
  document.getElementById("whAvailBtn")?.addEventListener("click", () => {
    const session = JSON.parse(
      localStorage.getItem("onsite_auth_v1") || "null",
    );
    if (!session) return;
    const nextAvailability =
      session.availability === "not available" ? "available" : "not available";
    if (nextAvailability === "available") {
      alert(
        "By marking yourself as available, you may receive job offers from contractors. If you are currently in work/unavailable, set yourself to unavailable until you are ready for a new assignment.",
      );
    }
    const nextDate = document.getElementById("whNextAvailableDate")?.value || "";
    updateWorkerAvailability(session.id, nextAvailability, nextDate);
    render();
    showToast(`Status set to ${nextAvailability}`);
  });

  document
    .getElementById("whNextAvailableSave")
    ?.addEventListener("click", () => {
      const session = JSON.parse(
        localStorage.getItem("onsite_auth_v1") || "null",
      );
      if (!session) return;
      const nextDate =
        document.getElementById("whNextAvailableDate")?.value || "";
      updateWorkerAvailability(
        session.id,
        session.availability || "available",
        nextDate,
      );
      render();
      showToast("Next available date saved");
    });

  document.getElementById("whAbsenceSave")?.addEventListener("click", () => {
    const startDate = document.getElementById("whAbsenceStart")?.value || "";
    const endDate = document.getElementById("whAbsenceEnd")?.value || "";
    const res = addWorkerPlannedAbsence(user.id, startDate, endDate);
    if (!res.ok) {
      showToast(res.reason);
      return;
    }
    render();
    showToast("Planned Absence added");
  });

  el.querySelectorAll("[data-worker-offer-accept]").forEach((btn) => {
    btn.addEventListener("click", () => workerAcceptOffer(btn.dataset.workerOfferAccept));
  });
  el.querySelectorAll("[data-worker-offer-decline]").forEach((btn) => {
    btn.addEventListener("click", () =>
      openOfferDecisionModal("worker", btn.dataset.workerOfferDecline),
    );
  });
  el.querySelectorAll("[data-worker-home-signin]").forEach((btn) => {
    btn.addEventListener("click", () =>
      openWorkerQrScanner(btn.dataset.workerHomeSignin, workerProfile || user),
    );
  });

  // Recommended job clicks → go to Jobs tab
  el.querySelectorAll("[data-apply-home]").forEach((row) => {
    row.addEventListener("click", () => switchTab("jobs"));
  });
  el.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
  bindAgreementOpeners(el);
  bindExtensionButtons(el);
}

// Wire any "[data-agr-open]" buttons within a container to open the agreement.
function bindAgreementOpeners(el) {
  el?.querySelectorAll("[data-agr-open]").forEach((btn) => {
    btn.addEventListener("click", () =>
      openAgreementModal(btn.dataset.agrOpen),
    );
  });
}

// ─── Worker Profile ───────────────────────────────────────
function renderWorkerProfile(user) {
  const el = document.getElementById("profileContent");
  if (!el) return;

  const workerProfile = findWorker(user.id) || ensureWorkerProfileForUser(user);
  const stats = getWorkerStats(user.id || "");
  const rating = buildWorkerRating(user.id || "");
  const reliability =
    rating.reliabilityScore != null
      ? rating.reliabilityScore
      : stats.totalShifts > 0
      ? (stats.reliability ?? 100)
      : (user.reliability ?? 100);
  const pct = calcWorkerCompletion(user);

  // Keep the permanent identity record's score in sync so it can be restored
  // if this worker ever deletes and re-registers.
  syncIdentityReliability(user.id, reliability);

  const certs = (user.certifications || [])
    .map((c) => {
      const expStatus = c.expiry ? certExpiryStatus(c.expiry) : "valid";
      return `<span class="cert-chip cert-chip--${expStatus}">${escapeHtml(c.name)}${c.expiry ? ` · ${c.expiry}` : ""}</span>`;
    })
    .join("");

  const fields = [
    { label: "Trade", val: user.trade },
    { label: "Grade", val: user.grade },
    { label: "Availability", val: user.availability },
    {
      label: "Next Available Date",
      val: user.nextAvailableDate ? formatDateOnly(user.nextAvailableDate) : null,
    },
    { label: "UTR Number", val: user.utr },
    { label: "Right to Work", val: user.rightToWork ? "Provided" : null },
    { label: "Location", val: user.location },
  ]
    .filter((f) => f.val)
    .map(
      (f) => `
    <div class="prof-field">
      <div class="prof-field-label">${f.label}</div>
      <div class="prof-field-val">${escapeHtml(String(f.val))}</div>
    </div>`,
    )
    .join("");

  const travelFields = [
    { label: "Home town or postcode", val: user.location },
    { label: "Willing to travel", val: travelRadiusLabel(user.travelRadiusMiles) },
    {
      label: "Longer-distance work",
      val: user.travelFurtherWithAccommodation
        ? "Willing to travel further if accommodation is paid"
        : "Only interested in work within my selected travel distance",
    },
  ]
    .filter((f) => f.val)
    .map(
      (f) => `
    <div class="prof-field">
      <div class="prof-field-label">${f.label}</div>
      <div class="prof-field-val">${escapeHtml(String(f.val))}</div>
    </div>`,
    )
    .join("");
  const plannedAbsences = plannedAbsencesForWorker(workerProfile || user);
  const plannedAbsenceHtml = plannedAbsences.length
    ? plannedAbsences
        .map(
          (absence) => `
    <div class="prof-field">
      <div class="prof-field-label">${formatDateOnly(absence.startDate)}</div>
      <div class="prof-field-val">${escapeHtml(absence.endDate !== absence.startDate ? `to ${formatDateOnly(absence.endDate)}` : "Unavailable")}</div>
    </div>`,
        )
        .join("")
    : `<div class="prof-field"><div class="prof-field-label">Status</div><div class="prof-field-val">No Planned Absence added</div></div>`;

  el.innerHTML = `
    <div class="prof-header">
      <div class="prof-avatar ${avatarColor(user.name || "U")}">${initials(user.name || "?")}</div>
      <div class="prof-id">
        <div class="prof-name">${escapeHtml(user.name || "")}</div>
        <div class="prof-trade">${escapeHtml(user.trade || "Trade not set")}${user.grade ? ` · ${escapeHtml(user.grade)}` : ""}</div>
        <div class="prof-verify ${user.verificationStatus || "incomplete"}">
          ${{ verified: "✓ Verified", pending: "Pending Review", incomplete: "Incomplete Profile" }[user.verificationStatus || "incomplete"]}
        </div>
      </div>
      <div class="prof-ring">
        ${ratingBadgeHTML(rating.reliabilityRating)}
      </div>
    </div>

    <div class="prof-section">
      <div class="prof-section-title">Profile Details</div>
      <div class="prof-fields">${fields}</div>
    </div>

    <div class="prof-section">
      <div class="prof-section-title">Travel Preferences</div>
      <div class="prof-fields">${travelFields}</div>
    </div>

    <div class="prof-section">
      <div class="prof-section-title">Planned Absence</div>
      <div class="prof-fields">${plannedAbsenceHtml}</div>
    </div>

    ${
      certs
        ? `<div class="prof-section">
      <div class="prof-section-title">Qualifications &amp; Certifications</div>
      <div class="prof-certs">${certs}</div>
    </div>`
        : ""
    }

    <div class="prof-section">
      <div class="prof-section-title">Reliability &amp; Punctuality</div>
      <div class="rating-summary">
        <div class="rating-summary-item">
          <span>Reliability</span>
          ${ratingBadgeHTML(rating.reliabilityRating)}
        </div>
        <div class="rating-summary-item">
          <span>Punctuality</span>
          ${ratingBadgeHTML(rating.punctualityRating)}
        </div>
      </div>
      ${ratingEvidenceHTML(rating)}
    </div>

    ${workerPaymentsSection(user)}

    ${agreementHistorySection(state.agreements.filter((a) => a.workerId === user.id))}

    <div class="prof-section">
      <div class="prof-section-title">Account</div>
      <p class="privacy-note">OnSite may retain limited identity and booking history after account deletion where necessary to prevent fraud, protect platform integrity, resolve disputes, and maintain accurate reliability records.</p>
      <button class="delete-account-btn" id="deleteAccountBtn" type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        Delete my account
      </button>
    </div>`;

  bindAgreementOpeners(el);
  const delBtn = el.querySelector("#deleteAccountBtn");
  if (delBtn)
    delBtn.addEventListener("click", () => {
      if (typeof deleteWorkerAccount === "function") deleteWorkerAccount();
    });
}

// Worker-facing payments panel. Workers see only their own guaranteed pay and
// its payment status — never the company charge or OnSite margin. They are paid
// only after the company's funds for that invoice have been received.
function workerPaymentsSection(user) {
  const lines = [];
  (state.invoices || []).forEach((inv) => {
    (inv.lines || []).forEach((line) => {
      if (line.workerId !== user.id) return;
      lines.push({ inv, line });
    });
  });
  lines.sort((a, b) =>
    (b.inv.weekStart || "").localeCompare(a.inv.weekStart || ""),
  );

  const totalPaid = lines
    .filter((x) => workerPaymentStatusForLine(x.inv, x.line) === "paid")
    .reduce((s, x) => s + (x.line.workerPay || 0) * (x.line.days || 0), 0);
  const totalPending = lines
    .filter((x) =>
      ["awaiting_funds", "ready"].includes(
        workerPaymentStatusForLine(x.inv, x.line),
      ),
    )
    .reduce((s, x) => s + (x.line.workerPay || 0) * (x.line.days || 0), 0);

  const rows = lines.length
    ? lines
        .map(({ inv, line }) => {
          const st = workerPaymentStatusForLine(inv, line);
          const meta =
            WORKER_PAYMENT_STATUS[st] || WORKER_PAYMENT_STATUS.awaiting_funds;
          const amount = (line.workerPay || 0) * (line.days || 0);
          return `<div class="bill-inv-row">
      <div class="bill-inv-main">
        <div class="bill-inv-week">${escapeHtml(line.jobTrade || "Work")} · ${formatDateOnly(inv.weekStart)} – ${formatDateOnly(inv.weekEnd)}</div>
        <div class="bill-inv-sub">${line.days} day${line.days !== 1 ? "s" : ""} · ${formatMoney(line.workerPay)}/day guaranteed</div>
      </div>
      <div class="bill-inv-amt">${formatMoney(amount)}</div>
      <span class="bill-status bill-status--${meta.tone}">${meta.label}</span>
    </div>`;
        })
        .join("")
    : `<div class="att-empty">No payments yet. Earnings appear here once your worked weeks are invoiced.</div>`;

  return `
    <div class="prof-section">
      <div class="prof-section-title">My Payments</div>
      <div class="prof-stats-grid">
        <div class="prof-stat"><div class="prof-stat-val">${formatMoney(totalPaid)}</div><div class="prof-stat-lbl">Paid</div></div>
        <div class="prof-stat"><div class="prof-stat-val">${formatMoney(totalPending)}</div><div class="prof-stat-lbl">Upcoming</div></div>
      </div>
      <p class="prof-section-hint">Your pay is guaranteed and released once the company's invoice is settled.</p>
      <div class="bill-inv-list">${rows}</div>
    </div>`;
}

// Permanent agreement history list (used in worker + company accounts).
function agreementHistorySection(agreements) {
  const list = [...(agreements || [])].sort(
    (a, b) => new Date(b.generatedAt || 0) - new Date(a.generatedAt || 0),
  );
  const rows = list.length
    ? list
        .map((a) => {
          const meta = agreementStatusMeta(a);
          return `
      <button class="agr-hist-row" type="button" data-agr-open="${a.id}">
        <div class="agr-hist-main">
          <div class="agr-hist-title">${escapeHtml(a.terms.trade)} · ${escapeHtml(a.terms.siteName)}</div>
          <div class="agr-hist-sub">${escapeHtml(a.terms.companyName)} · ${escapeHtml(a.terms.workerName)} · ${a.generatedAt ? formatDate(a.generatedAt) : ""}</div>
        </div>
        <span class="agr-hist-status agr-status--${meta.cls}">${escapeHtml(meta.label)}</span>
      </button>`;
        })
        .join("")
    : `<div class="att-empty">No job agreements yet.</div>`;
  return `
    <div class="prof-section">
      <div class="prof-section-title">Job Agreement History</div>
      <div class="agr-hist-list">${rows}</div>
    </div>`;
}

// ─── Company Home ──────────────────────────────────────
function renderContractorHome(user) {
  const el = document.getElementById("tab-dashboard");
  if (!el) return;

  const today = todayDateStr();
  const todayRecs = attendanceRecords.filter(
    (r) => r.date === today && r.companyId === user.id,
  );
  const att = {
    on: todayRecs.filter((r) => r.status === "onTime").length,
    late: todayRecs.filter((r) => r.status === "late").length,
    ns: todayRecs.filter((r) => r.status === "noShow").length,
  };

  const companyJobs = state.jobs.filter((j) => companyOwnsJob(j, user.id));
  const activeJobs = companyJobs.filter((j) => !j.completed);
  const bookedWorkers = state.workers.filter((w) =>
    companyJobs.some((j) => j.assignedWorkerId === w.id),
  );

  const bookedHtml = bookedWorkers.length
    ? bookedWorkers
        .slice(0, 5)
        .map((w) => {
          const job = companyJobs.find((j) => j.assignedWorkerId === w.id);
          const stats = getWorkerStats(w.id);
          const rel = stats.totalShifts > 0 ? stats.reliability : w.reliability;
          return `<div class="ch-worker-row">
      <div class="worker-avatar ${avatarColor(w.name)}" style="width:34px;height:34px;font-size:0.78rem;flex-shrink:0">${initials(w.name)}</div>
      <div class="ch-wrow-info">
        <div class="ch-wrow-name">${escapeHtml(w.name)} <span class="protected-badge protected-badge--sm"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>Protected</span></div>
        <div class="ch-wrow-meta">${escapeHtml(w.trade)}${job ? ` · ${escapeHtml(job.location)}` : ""}</div>
      </div>
      ${job ? `<button class="ch-cancel-btn" type="button" data-cancel-booking="${job.id}">Cancel</button>` : ""}
    </div>`;
        })
        .join("")
    : `<div class="att-empty">No workers currently assigned.</div>`;

  const reqHtml = activeJobs.length
    ? activeJobs
        .slice(0, 4)
        .map((job) => {
          const assigned = job.assignedWorkerId
            ? findWorker(job.assignedWorkerId)
            : null;
          const charge = companyChargeDisplay(job);
          const appCount = (state.applications || []).filter(
            (a) => a.jobId === job.id,
          ).length;
          return `<div class="ch-req-row">
      <div class="ch-req-trade">${escapeHtml(job.trade)}</div>
      <div class="ch-req-meta">
        ${escapeHtml(job.location)}
        ${job.start ? ` · ${new Date(job.start).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
        ${job.quantity && job.quantity > 1 ? ` · ${job.quantity} workers` : ""}
        ${charge ? ` · ${formatMoney(charge)}/day` : ""}
        ${appCount ? ` · ${appCount} interested` : ""}
      </div>
      <span class="ch-req-status ${assigned ? "status-assigned" : "status-open"}">${assigned ? `✓ ${escapeHtml(assigned.name)}` : "Open"}</span>
    </div>`;
        })
        .join("")
    : `<div class="att-empty">No active requests — use the Requests tab to post one.</div>`;

  const companyName = user.companyName || user.name || "Company";

  el.innerHTML = `
    <div class="ch-greeting">Welcome back, <strong>${escapeHtml(companyName.split(" ")[0])}</strong></div>
    <button class="ch-request-btn" type="button" id="chRequestBtn">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Request Labour
    </button>
    <div class="ch-att-bar">
      <div class="ch-att-item on-time"><span class="ch-att-num">${att.on}</span><span class="ch-att-lbl">On Time</span></div>
      <div class="ch-att-item late"><span class="ch-att-num">${att.late}</span><span class="ch-att-lbl">Late</span></div>
      <div class="ch-att-item no-show"><span class="ch-att-num">${att.ns}</span><span class="ch-att-lbl">No Show</span></div>
    </div>
    ${companyLateReportPanelHTML(user)}
    ${companyOfferReviewPanelHTML(user)}
    ${extensionPanelHTML(user.id)}
    ${companyAgreementPanelHTML(user)}
    <div class="ch-section-label">Active Requests</div>
    <div class="ch-req-list">${reqHtml}</div>
    <div class="ch-section-label">Workforce On Site</div>
    ${
      bookedWorkers.length
        ? `<div class="protection-banner">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      <span><strong>OnSite Protected Booking:</strong> If a booking is cancelled within ${PROTECTION_WINDOW_DAYS} working days of the start date, the worker will receive 1 day's pay at the agreed rate.</span>
    </div>`
        : ""
    }
    <div class="ch-workers-list">${bookedHtml}</div>`;

  document
    .getElementById("chRequestBtn")
    ?.addEventListener("click", () => switchTab("add"));
  bindCancelBookingButtons(el);
  bindAgreementOpeners(el);
  bindExtensionButtons(el);
  bindCompanyOfferButtons(el);
}

function companyLateReportPanelHTML(user) {
  const reports = (state.notifications || [])
    .filter(
      (n) =>
        n.type === "worker_late_report" &&
        (n.companyId === user.id || (!n.companyId && user.type === "company")),
    )
    .slice(0, 3);
  if (!reports.length) return "";
  return `
    <div class="ch-late-panel">
      <div class="ch-agr-panel-head">
        <span class="ch-agr-panel-title">Late Reports</span>
        <span class="ch-agr-panel-count">${reports.length}</span>
      </div>
      ${reports
        .map((n) => {
          const when = n.createdAt ? formatDate(n.createdAt) : "";
          const mgr = n.attendanceManager?.name
            ? ` · ${escapeHtml(n.attendanceManager.name)} notified`
            : "";
          return `<div class="ch-late-row">
            <div class="ch-late-msg">${escapeHtml(n.message || "Worker reported running late")}</div>
            <div class="ch-late-meta">${escapeHtml(when)}${mgr}</div>
          </div>`;
        })
        .join("")}
    </div>`;
}

function companyOfferReviewPanelHTML(user) {
  const companyApps = (state.applications || []).filter(
    (a) => a.companyId === user.id || (!a.companyId && user.type === "company"),
  );
  const review = companyApps.filter((a) => a.status === "under_company_review");
  const pending = companyApps.filter((a) => a.status === "offered");
  if (!review.length && !pending.length) return "";
  const rows = review
    .map((app) => {
      const job = applicationJob(app);
      const worker = applicationWorker(app);
      const rating = worker ? buildWorkerRating(worker.id) : null;
      return `
    <div class="ch-offer-row">
      <div class="ch-offer-info">
        <div class="ch-offer-title">${escapeHtml(app.workerName)} accepted · ${escapeHtml(job?.trade || "Job")}</div>
        <div class="ch-offer-meta">
          ${escapeHtml(job?.location || "")}
          ${rating ? ` · Reliability ${escapeHtml(rating.reliabilityRating)}` : ""}
          ${rating ? ` · Punctuality ${escapeHtml(rating.punctualityRating)}` : ""}
          ${rating ? ` · ${rating.evidence.attendanceDays} attendance days` : ""}
          ${worker?.qualifications ? ` · ${escapeHtml(worker.qualifications)}` : ""}
        </div>
        ${rating ? ratingEvidenceHTML(rating, true) : ""}
      </div>
      <div class="ch-offer-actions">
        <button class="secondary-btn ch-offer-btn" type="button" data-company-offer-decline="${app.id}">Decline</button>
        <button class="primary-btn ch-offer-btn" type="button" data-company-offer-accept="${app.id}">Accept</button>
      </div>
    </div>`;
    })
    .join("");
  const pendingRows = pending.length
    ? `<div class="ch-offer-pending">${pending.length} offer${pending.length === 1 ? "" : "s"} awaiting worker response.</div>`
    : "";
  return `
    <div class="ch-offer-panel">
      <div class="ch-agr-panel-head">
        <span class="ch-agr-panel-title">Job Offers — Company Review</span>
        <span class="ch-agr-panel-count">${review.length}</span>
      </div>
      ${rows || ""}
      ${pendingRows}
    </div>`;
}

function bindCompanyOfferButtons(scope) {
  scope.querySelectorAll("[data-company-offer-accept]").forEach((btn) => {
    btn.addEventListener("click", () =>
      companyAcceptWorker(btn.dataset.companyOfferAccept),
    );
  });
  scope.querySelectorAll("[data-company-offer-decline]").forEach((btn) => {
    btn.addEventListener("click", () =>
      openOfferDecisionModal("company", btn.dataset.companyOfferDecline),
    );
  });
}

// Company panel: agreements awaiting the company's confirmation.
function companyAgreementPanelHTML(user) {
  const pending = (state.agreements || []).filter(
    (a) =>
      a.companyId === user.id && a.status === "pending" && !a.company?.accepted,
  );
  if (!pending.length) return "";
  const rows = pending
    .map(
      (a) => `
    <div class="ch-agr-row">
      <div class="ch-agr-info">
        <div class="ch-agr-title">${escapeHtml(a.terms.workerName)} · ${escapeHtml(a.terms.trade)}</div>
        <div class="ch-agr-meta">${escapeHtml(a.terms.siteName)} · ${a.worker?.accepted ? "Worker signed — your confirmation needed" : "Awaiting both signatures"}</div>
      </div>
      <button class="ch-agr-btn" type="button" data-agr-open="${a.id}">Review &amp; Sign</button>
    </div>`,
    )
    .join("");
  return `
    <div class="ch-agr-panel">
      <div class="ch-agr-panel-head">
        <span class="ch-agr-panel-title">Job Agreements — Action Needed</span>
        <span class="ch-agr-panel-count">${pending.length}</span>
      </div>
      <p class="ch-agr-panel-hint">Bookings stay inactive until you and the worker both sign.</p>
      ${rows}
    </div>`;
}

// ─── Company Account ───────────────────────────────────
function renderContractorAccount(user) {
  const el = document.getElementById("accountContent");
  if (!el) return;

  const ini = (user.name || "C")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  el.innerHTML = `
    <div class="prof-header">
      <div class="prof-avatar ${avatarColor(user.name || "C")}">${ini}</div>
      <div class="prof-id">
        <div class="prof-name">${escapeHtml(user.companyName || user.name || "")}</div>
        <div class="prof-trade">Company Account</div>
        <span class="wsc-verify-badge verified">✓ Verified</span>
      </div>
    </div>
    <div class="prof-section">
      <div class="prof-section-title">Account Details</div>
      <div class="prof-fields">
        <div class="prof-field"><div class="prof-field-label">Contact Name</div><div class="prof-field-val">${escapeHtml(user.name || "—")}</div></div>
        <div class="prof-field"><div class="prof-field-label">Company</div><div class="prof-field-val">${escapeHtml(user.companyName || "—")}</div></div>
        <div class="prof-field"><div class="prof-field-label">Email</div><div class="prof-field-val">${escapeHtml(user.email || "—")}</div></div>
        <div class="prof-field"><div class="prof-field-label">Account Type</div><div class="prof-field-val">Company</div></div>
      </div>
    </div>
    <div class="prof-section">
      <div class="prof-section-title">Activity</div>
      <div class="prof-stats-grid">
        <div class="prof-stat"><div class="prof-stat-val">${state.jobs.length}</div><div class="prof-stat-lbl">Requests Posted</div></div>
        <div class="prof-stat"><div class="prof-stat-val">${state.jobs.filter((j) => j.assignedWorkerId).length}</div><div class="prof-stat-lbl">Workers Placed</div></div>
      </div>
    </div>
    ${companyBillingSection(user)}
    ${companyDocsSection(user)}
    ${agreementHistorySection(state.agreements.filter((a) => a.companyId === user.id || !a.companyId))}
    <button class="ch-logout-btn" type="button" id="accLogoutBtn">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      Sign Out
    </button>`;

  bindAgreementOpeners(el);
  bindCompanyDocsForm(el, user);
  document.getElementById("accLogoutBtn")?.addEventListener("click", () => {
    document.getElementById("logoutBtn")?.click();
  });
}

// Company-facing billing & payment-reliability panel. Companies see their
// payment terms, reliability score and outstanding invoices — never any
// worker pay or OnSite margin figures.
function companyBillingSection(user) {
  const billing = getCompanyBilling(user.id);
  refreshCompanyRestrictions(user.id);
  const rel = computeCompanyPaymentReliability(user.id);
  const term =
    PAYMENT_TERMS[billing.paymentTerm] || PAYMENT_TERMS[DEFAULT_PAYMENT_TERM];
  const invs = (state.invoices || [])
    .filter((i) => i.companyId === user.id)
    .sort((a, b) => (b.weekStart || "").localeCompare(a.weekStart || ""));

  const banner = billing.suspended
    ? `<div class="bill-banner bill-banner--red">Account suspended — ${rel.overdue} overdue invoice${rel.overdue !== 1 ? "s" : ""}. Clear outstanding payments and contact OnSite to reinstate posting and bookings.</div>`
    : billing.restricted
      ? `<div class="bill-banner bill-banner--amber">Posting & bookings paused — you have ${rel.overdue} overdue invoice${rel.overdue !== 1 ? "s" : ""}. Settle to restore full access.</div>`
      : "";

  const rows = invs.length
    ? invs
        .map((i) => {
          const st = invoiceEffectiveStatus(i);
          const meta = INVOICE_STATUS[st] || INVOICE_STATUS.generated;
          return `<div class="bill-inv-row">
      <div class="bill-inv-main">
        <div class="bill-inv-week">${formatDateOnly(i.weekStart)} – ${formatDateOnly(i.weekEnd)}</div>
        <div class="bill-inv-sub">Due ${formatDateOnly(i.dueDate)} · ${i.termDays} working days</div>
      </div>
      <div class="bill-inv-amt">${formatMoney(i.totalCharge)}</div>
      <span class="bill-status bill-status--${meta.tone}">${meta.label}</span>
    </div>`;
        })
        .join("")
    : `<div class="att-empty">No invoices yet. Invoices are raised weekly from approved attendance.</div>`;

  return `
    <div class="prof-section">
      <div class="prof-section-title">Billing &amp; Payments</div>
      ${banner}
      <div class="prof-fields">
        <div class="prof-field"><div class="prof-field-label">Payment Terms</div><div class="prof-field-val">${term.label}${billing.trusted ? " · Trusted" : ""}</div></div>
        <div class="prof-field"><div class="prof-field-label">Payment Reliability</div><div class="prof-field-val">${rel.score != null ? rel.score + "%" : "No history yet"}${rel.settled ? ` (${rel.onTime}/${rel.settled} on time)` : ""}</div></div>
      </div>
      <p class="prof-section-hint">You're charged a single all-in day rate per worker. OnSite pays workers once your invoice is settled.</p>
      <div class="bill-inv-list">${rows}</div>
    </div>`;
}

// Company site-documents manager. Documents are snapshotted into each new
// agreement so workers must review them before accepting.
function companyDocsSection(user) {
  const docs = getCompanyDocs(user.id);
  const catLabel = {
    rules: "Site Rules",
    induction: "Induction",
    hs: "Health & Safety",
    project: "Project Requirements",
    other: "Other",
  };
  const list = docs.length
    ? docs
        .map(
          (d) => `
    <div class="doc-row">
      <div class="doc-row-info">
        <div class="doc-row-title">${escapeHtml(d.title || "Document")}</div>
        <div class="doc-row-cat">${escapeHtml(catLabel[d.category] || "Document")}</div>
      </div>
      <button class="doc-del-btn" type="button" data-doc-del="${d.id}" aria-label="Delete document">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
    </div>`,
        )
        .join("")
    : `<div class="att-empty">No site documents yet. Add induction, H&amp;S or site-rules content for workers to review.</div>`;
  return `
    <div class="prof-section">
      <div class="prof-section-title">Site Documents</div>
      <p class="prof-section-hint">Workers must review these before accepting a job agreement.</p>
      <div class="doc-list">${list}</div>
      <div class="doc-add-form">
        <div class="form-grid-2">
          <label class="field-label">Title<input id="docTitle" type="text" placeholder="e.g. Site Induction" /></label>
          <label class="field-label">Category
            <select id="docCategory">
              <option value="rules">Site Rules</option>
              <option value="induction">Induction</option>
              <option value="hs">Health &amp; Safety</option>
              <option value="project">Project Requirements</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>
        <label class="field-label">Content<textarea id="docBody" rows="3" placeholder="Document text workers must read…"></textarea></label>
        <button class="primary-btn wide" type="button" id="docAddBtn">Add Document</button>
      </div>
    </div>`;
}

function bindCompanyDocsForm(el, user) {
  el.querySelectorAll("[data-doc-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      removeCompanyDoc(user.id, btn.dataset.docDel);
      saveAndRender();
      showToast("Document removed");
    });
  });
  el.querySelector("#docAddBtn")?.addEventListener("click", () => {
    const title = el.querySelector("#docTitle")?.value.trim();
    const category = el.querySelector("#docCategory")?.value || "other";
    const body = el.querySelector("#docBody")?.value.trim();
    if (!title || !body) {
      showToast("Add a title and content");
      return;
    }
    addCompanyDoc(user.id, { title, category, body });
    saveAndRender();
    showToast("Document added");
  });
}

// ─── Worker Job Board ─────────────────────────────────────
function renderWorkerJobBoard(user) {
  const jobsList = document.getElementById("jobsList");
  if (!jobsList) return;

  const trade = canonicalTrade(user?.trade);

  // Filter to only jobs matching this worker's trade, sorted by start date
  const sorted = [...state.jobs]
    .filter(
      (job) =>
        !job.assignedWorkerId &&
        !job.completed &&
        (!trade || canonicalTrade(job.trade) === trade),
    )
    .sort((a, b) => new Date(a.start || 0) - new Date(b.start || 0));

  const rating = buildWorkerRating(user?.id || "");
  const pct = calcWorkerCompletion(user || {});

  const statusCard = `
    <div class="worker-status-card">
      <div class="wsc-left">
        <div class="wsc-avatar ${avatarColor(user?.name || "U")}">${initials(user?.name || "?")}</div>
        <div class="wsc-info">
          <div class="wsc-name">${escapeHtml(user?.name || "Worker")}</div>
          <div class="wsc-trade">${escapeHtml(user?.trade || "Trade not set")}${user?.grade ? ` · ${escapeHtml(user.grade)}` : ""}</div>
          <div class="wsc-pills">
            <span class="status-pill ${user?.availability === "not available" ? "unavailable" : "available"}">${user?.availability || "available"}</span>
            <span class="wsc-verify-badge ${user?.verificationStatus || "incomplete"}">${
              {
                verified: "✓ Verified",
                pending: "Pending Review",
                incomplete: "Incomplete Profile",
              }[user?.verificationStatus || "incomplete"]
            }</span>
          </div>
        </div>
      </div>
      <div class="wsc-right">
        ${ratingBadgeHTML(rating.reliabilityRating)}
        ${completionRingHTML(pct)}
      </div>
    </div>`;

  if (!sorted.length) {
    const emptyMsg = trade
      ? `No open ${escapeHtml(user?.trade || trade)} jobs right now — check back soon or update your trade in your profile.`
      : "No open jobs at the moment — check back soon.";
    jobsList.innerHTML = statusCard + emptyState(emptyMsg);
    return;
  }

  jobsList.innerHTML =
    statusCard + sorted.map((job) => workerJobCard(job, user)).join("");

  jobsList.querySelectorAll("[data-apply-job]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const result = registerInterest(btn.dataset.applyJob, user);
      if (!result.ok) {
        showToast(result.reason);
        return;
      }
      showToast(
        result.duplicate
          ? "You've already registered interest in this job."
          : "Your interest has been registered — you'll be contacted shortly.",
      );
    });
  });

  jobsList.querySelectorAll("[data-map-job]").forEach((btn) => {
    btn.addEventListener("click", () => openSiteMap(btn.dataset.mapJob));
  });
}

function workerJobCard(job, user) {
  const hasPin = job.sitePin && job.sitePin.lat !== null;
  const guaranteedPay = workerPayDisplay(job, user);
  const applied = !!applicationFor(job.id, user?.id);
  const daysUntil = job.start
    ? Math.ceil((new Date(job.start) - new Date()) / 86400000)
    : null;

  const urgencyLabel =
    daysUntil !== null
      ? daysUntil <= 0
        ? `<span class="wjc-urgency urgency-now">Starting today</span>`
        : daysUntil === 1
          ? `<span class="wjc-urgency urgency-soon">Starting tomorrow</span>`
          : daysUntil <= 7
            ? `<span class="wjc-urgency urgency-soon">Starting in ${daysUntil} days</span>`
            : `<span class="wjc-urgency urgency-later">In ${daysUntil} days</span>`
      : "";

  return `
  <article class="worker-job-card">
    
    <div class="wjc-header">
      <div class="wjc-trade-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
      </div>
      <div class="wjc-meta">
        <div class="wjc-title">${escapeHtml(job.trade)}</div>
        <div class="wjc-location">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          ${escapeHtml(job.location)}${hasPin ? " · <span class='wjc-pin-confirmed'>Location pinned</span>" : ""}
        </div>
      </div>
      ${urgencyLabel}
    </div>
    <div class="wjc-details">
      ${
        job.start
          ? `<div class="wjc-detail-item">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        ${new Date(job.start).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
      </div>`
          : ""
      }
      ${
        job.duration
          ? `<div class="wjc-detail-item">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        ${escapeHtml(job.duration)}
      </div>`
          : ""
      }
      ${
        guaranteedPay != null
          ? `<div class="wjc-detail-item wjc-pay-rate">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        ${formatMoney(guaranteedPay)}/day guaranteed
      </div>`
          : ""
      }
      ${
        job.quantity && job.quantity > 1
          ? `<div class="wjc-detail-item">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        ${job.quantity} workers needed
      </div>`
          : ""
      }
      ${
        job.requiredQualifications
          ? `<div class="wjc-detail-item">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        ${escapeHtml(job.requiredQualifications)}
      </div>`
          : ""
      }
    </div>
    ${job.arrivalInstructions ? `<div class="wjc-arrival">${escapeHtml(job.arrivalInstructions)}</div>` : ""}
    <div class="wjc-footer">
      <button class="wjc-apply-btn${applied ? " applied" : ""}" type="button" data-apply-job="${job.id}" ${applied ? "disabled" : ""}>${applied ? "✓ Interest Registered" : "Register Interest"}</button>
      ${
        hasPin
          ? `<button class="wjc-map-btn" type="button" data-map-job="${job.id}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        View Site
      </button>`
          : ""
      }
    </div>
  </article>`;
}

// ─── Form Toggle (Add tab) ────────────────────────────────
document.querySelectorAll(".add-toggle-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".add-toggle-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document
      .querySelector("#formWorker")
      .classList.toggle("hidden", btn.dataset.form !== "worker");
    document
      .querySelector("#formJob")
      .classList.toggle("hidden", btn.dataset.form !== "job");
  });
});

// ─── Forms ────────────────────────────────────────────────
workerForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.querySelector("#workerName").value.trim();
  const trade = document.querySelector("#workerTrade").value.trim();
  const score = clampScore(document.querySelector("#workerReliability").value);
  const minRateRaw = Number(document.querySelector("#workerMinRate")?.value);
  state.workers.push({
    id: createId(),
    name,
    trade,
    qualifications: document
      .querySelector("#workerQualifications")
      .value.trim(),
    availability: document.querySelector("#workerAvailability").value,
    reliability: score,
    minRate:
      Number.isFinite(minRateRaw) && minRateRaw > 0
        ? Math.round(minRateRaw)
        : undefined,
  });
  logActivity(
    "worker",
    `<strong>${escapeHtml(name)}</strong> added to roster as ${escapeHtml(trade)} (score ${score})`,
  );
  workerForm.reset();
  document.querySelector("#workerReliability").value = 75;
  saveAndRender();
  showToast("Worker added to roster");
  switchTab("workers");
});

jobForm.addEventListener("submit", (e) => {
  e.preventDefault();
  // Block new labour requests from companies with outstanding overdue invoices.
  const poster = getSessionUser();
  if (poster?.type === "company" && isCompanyRestricted(poster.id)) {
    showToast(
      isCompanySuspended(poster.id)
        ? "Account suspended for overdue payments — contact OnSite to reinstate"
        : "Overdue invoices must be cleared before posting new labour requests",
    );
    return;
  }
  const jobNumber = document.querySelector("#jobNumber")?.value.trim() || "";

  const projectName =
    document.querySelector("#projectName")?.value.trim() || "";

  const attendanceManagerName =
    document.querySelector("#attendanceManagerName")?.value.trim() || "";

  const attendanceManagerEmail =
    document.querySelector("#attendanceManagerEmail")?.value.trim() || "";

  const attendanceManagerPhone =
    document.querySelector("#attendanceManagerPhone")?.value.trim() || "";
  const trade = document.querySelector("#jobTrade").value.trim();
  const location = document.querySelector("#jobLocation").value.trim();
  const duration = document.querySelector("#jobDuration").value.trim();
  const specialism = document.querySelector("#jobSpecialism")?.value || "";

  const quantity = Number(document.querySelector("#jobQuantity")?.value) || 1;

  const budgetMinRaw = Number(document.querySelector("#jobBudgetMin")?.value);
  const budgetMaxRaw = Number(document.querySelector("#jobBudgetMax")?.value);
  const budgetMax =
    Number.isFinite(budgetMaxRaw) && budgetMaxRaw > 0
      ? Math.round(budgetMaxRaw)
      : null;
  const budgetMin =
    Number.isFinite(budgetMinRaw) && budgetMinRaw > 0
      ? Math.round(budgetMinRaw)
      : null;

  const endDate = document.querySelector("#jobEndDate")?.value || "";
  const noticeRaw = Number(document.querySelector("#jobNoticeDays")?.value);
  const jobStartValue = document.querySelector("#jobStart").value;
  const shiftStartTime = document.querySelector("#jobShiftStart")?.value || "";
  const shiftFinishTime = document.querySelector("#jobShiftFinish")?.value || "";

  const job = {
    id: createId(),
    jobNumber,
    projectName,
    companyId: poster?.type === "company" ? poster.id : "",
    companyName:
      poster?.type === "company"
        ? poster.companyName || poster.name || "Company"
        : "",
    trade,
    specialism,
    location,
    start: jobStartValue,
    shiftStartTime:
      shiftStartTime ||
      (jobStartValue && jobStartValue.includes("T")
        ? jobStartValue.split("T")[1].slice(0, 5)
        : "08:00"),
    shiftFinishTime,
    estimatedEndDate: endDate,
    duration,
    quantity,
    budgetMin,
    budgetMax,
    noticePeriodDays:
      Number.isFinite(noticeRaw) && noticeRaw > 0
        ? noticeRaw
        : DEFAULT_NOTICE_DAYS,
    assignedWorkerId: "",
    accommodationPaid: !!document.querySelector("#jobAccommodationPaid")?.checked,
  };

  // Labour requirement details
  const grade = document.querySelector("#jobGrade")?.value;
  if (grade) job.grade = grade;
  const workActivity = document.querySelector("#workActivity")?.value.trim();
  if (workActivity) job.workActivity = workActivity;

  if (
    attendanceManagerName ||
    attendanceManagerEmail ||
    attendanceManagerPhone
  ) {
    job.attendanceManager = {
      name: attendanceManagerName,
      email: attendanceManagerEmail,
      phone: attendanceManagerPhone,
    };
  }
  const reqQuals = document.querySelector("#jobReqQuals")?.value.trim();
  if (reqQuals) job.requiredQualifications = reqQuals;
  const urgency = document.querySelector("#jobUrgency")?.value;
  if (urgency) job.urgency = urgency;

  // Capture optional site location fields
  const siteName = document.querySelector("#jobSiteName")?.value.trim();
  if (siteName) job.siteName = siteName;
  const siteRef = document.querySelector("#jobSiteRef")?.value.trim();
  if (siteRef) job.siteRef = siteRef;
  const siteAddr = document.querySelector("#jobSiteAddress")?.value.trim();
  if (siteAddr) job.siteAddress = siteAddr;
  if (currentJobPin.lat !== null) job.sitePin = { ...currentJobPin };
  const cName = document.querySelector("#jobContactName")?.value.trim();
  const cPhone = document.querySelector("#jobContactPhone")?.value.trim();
  if (cName || cPhone)
    job.siteContact = { name: cName || "", phone: cPhone || "" };
  const arrival = document
    .querySelector("#jobArrivalInstructions")
    ?.value.trim();
  if (arrival) job.arrivalInstructions = arrival;
  const parking = document.querySelector("#jobParking")?.value.trim();
  if (parking) job.parking = parking;
  const ppe = document.querySelector("#jobPpe")?.value.trim();
  if (ppe) job.ppe = ppe;
  const gate = document.querySelector("#jobGateAccess")?.value.trim();
  if (gate) job.gateAccess = gate;

  state.jobs.push(job);
  const autoOffer = autoOfferBestMatch(job.id);
  logActivity(
    "job",
    `New job posted: <strong>${escapeHtml(trade)}</strong> in ${escapeHtml(location)}${duration ? ` · ${escapeHtml(duration)}` : ""}${job.sitePin ? " · 📍 Location pinned" : ""}${autoOffer.ok ? " · best match offered" : ""}`,
  );
  jobForm.reset();

  // Capture photos
  const photos = {};
  ["gate", "entrance", "welfare"].forEach((k) => {
    if (currentJobPhotos[k]) photos[k] = currentJobPhotos[k];
  });
  if (Object.keys(photos).length) job.sitePhotos = photos;

  // Reset location section
  currentJobPin = { lat: null, lng: null };
  document.querySelector("#pinCoordsDisplay")?.classList.add("hidden");
  document.querySelector("#siteLocFields")?.classList.add("hidden");
  document.querySelector("#siteLocChevron").style.transform = "";
  if (pickerMarker) {
    pickerMarker.remove();
    pickerMarker = null;
  }

  // Reset photo cards
  resetJobPhotos();

  saveAndRender();
  showToast("Job request posted");
  switchTab("dashboard");
});

resetDemoBtn.addEventListener("click", () => {
  state = structuredClone(demoData);
  activityLog = [];
  saveActivity();
  saveAndRender();
  showToast("Demo data restored");
});

// ─── Render ───────────────────────────────────────────────
function render() {
  const user = getSessionUser();
  const role = user?.type || null;

  // Advance any booking extension/reallocation states before drawing.
  if (processExtensionLifecycle()) saveState();
  if (expireJobOffers()) saveState();
  // Roll up any newly-completed weeks into invoices and refresh restrictions.
  if (generateWeeklyInvoices()) saveState();

  // Update counts (elements may not exist after nav rebuild)
  const wcEl = document.getElementById("workerCount");
  const jcEl = document.getElementById("jobCount");
  if (wcEl) wcEl.textContent = state.workers.length;
  if (jcEl) jcEl.textContent = state.jobs.length;

  if (role === "worker") {
    renderWorkerHome(user);
    renderWorkerJobBoard(user);
    renderWorkerAttendance(user);
    renderWorkerProfile(user);
  } else if (role === "company") {
    renderContractorHome(user);
    renderWorkers();
    renderAttendance();
    renderContractorAccount(user);
    // Company's add tab: show job form only
    document.querySelector("#formWorker")?.classList.add("hidden");
    document.querySelector("#formJob")?.classList.remove("hidden");
  } else {
    renderStats();
    renderActivity();
    renderWorkers();
    renderJobs();
    renderMatches();
    renderAttendance();
    renderCancelledBookings();
  }

  // Payments console is admin-only (self-clears for other sessions).
  renderAdminPayments(role);

  // Identity/duplicate review is admin-only. Always run it so the panel is
  // cleared for worker/company sessions and never leaks across logins.
  renderAdminDuplicateReview();
  // Extension reminders are admin-only (self-clears for other sessions).
  renderExtensionReminders();
  // Agreements overview is admin-only (self-clears for other sessions).
  renderAgreementsOverview();
}

function renderStats() {
  const statsRow = document.querySelector("#statsRow");
  if (!statsRow) return;

  const total = state.workers.length;
  const available = state.workers.filter(
    (w) => w.availability === "available",
  ).length;
  const open = state.jobs.filter((j) => !j.assignedWorkerId).length;
  const assigned = state.jobs.filter((j) => j.assignedWorkerId).length;
  statsRow.innerHTML = `
    <div class="stat-card">
      <span class="stat-label">Total Workers</span>
      <span class="stat-value">${total}</span>
      <span class="stat-sub">Evidence-based ratings</span>
    </div>
    <div class="stat-card stat-available">
      <span class="stat-label">Available</span>
      <span class="stat-value">${available}</span>
      <span class="stat-sub">${total - available} unavailable</span>
    </div>
    <div class="stat-card stat-open">
      <span class="stat-label">Open Jobs</span>
      <span class="stat-value">${open}</span>
      <span class="stat-sub">Awaiting assignment</span>
    </div>
    <div class="stat-card stat-assigned">
      <span class="stat-label">Assigned</span>
      <span class="stat-value">${assigned}</span>
      <span class="stat-sub">of ${state.jobs.length} total jobs</span>
    </div>
  `;
}

// ─── Worker Cards ─────────────────────────────────────────
function renderWorkers() {
  const query = (workerSearch.value || "").trim().toLowerCase();
  const filtered = state.workers.filter((w) => {
    const matchesSearch =
      !query ||
      w.name.toLowerCase().includes(query) ||
      w.trade.toLowerCase().includes(query) ||
      (w.qualifications || "").toLowerCase().includes(query);
    const matchesFilter =
      activeFilter === "all"
        ? true
        : activeFilter === "available"
        ? w.availability === "available"
        : activeFilter === "elite"
            ? buildWorkerRating(w.id).reliabilityRating === "Excellent"
            : true;
    return matchesSearch && matchesFilter;
  });

  const hasAny = state.workers.length > 0;
  workersEmpty.style.display =
    hasAny && filtered.length === 0 ? "block" : "none";
  workersList.innerHTML = !hasAny
    ? emptyState("No workers in the roster yet. Add one from the Add tab.")
    : filtered.map(workerCard).join("");

  workersList.querySelectorAll("[data-delete-worker]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const w = findWorker(btn.dataset.deleteWorker);
      if (!w) return;
      if (!confirm(`Remove ${w.name} from the roster?`)) return;
      logActivity(
        "worker",
        `<strong>${escapeHtml(w.name)}</strong> removed from roster`,
      );
      state.workers = state.workers.filter((x) => x.id !== w.id);
      state.jobs.forEach((j) => {
        if (j.assignedWorkerId === w.id) j.assignedWorkerId = "";
      });
      saveAndRender();
      showToast(`${w.name} removed`);
    });
  });

  workersList.querySelectorAll("[data-worker-avail]").forEach((sel) => {
    sel.addEventListener("change", () => {
      const w = findWorker(sel.dataset.workerAvail);
      updateWorkerAvailability(
        sel.dataset.workerAvail,
        sel.value,
        sel.value === "not available" ? w?.nextAvailableDate || "" : "",
      );
      saveAndRender();
    });
  });

}

function workerCard(worker) {
  const avCls = avatarColor(worker.name);
  const statusCls =
    worker.availability === "available" ? "available" : "unavailable";
  const rating = buildWorkerRating(worker.id);
  const completion = calcWorkerCompletion(worker);
  const nextAvailable = worker.nextAvailableDate
    ? `<span class="worker-next-available">Next available ${formatDateOnly(worker.nextAvailableDate)}</span>`
    : "";

  const statsRow = `
    <div class="worker-rating-block">
      <div class="worker-rating-row">
        <span>Reliability ${ratingBadgeHTML(rating.reliabilityRating)}</span>
        <span>Punctuality ${ratingBadgeHTML(rating.punctualityRating)}</span>
      </div>
      ${ratingEvidenceHTML(rating, true)}
    </div>`;

  return `
  <article class="worker-card">
    <div class="worker-card-top">
      <div class="worker-avatar ${avCls}">${initials(worker.name)}</div>
      <div class="worker-info">
        <div class="worker-name">${escapeHtml(worker.name)}</div>
        <div class="worker-trade">${escapeHtml(worker.trade)}</div>
        <div class="worker-quals">
          <span class="status-pill ${statusCls}">${worker.availability}</span>
          ${nextAvailable}
          ${certChipsHTML(worker)}
        </div>
      </div>
      <div class="worker-card-scores">
        ${completionRingHTML(completion)}
      </div>
    </div>
    ${certExpiryWarnings(worker)}
    ${statsRow}
    <div class="worker-card-actions">
      <select class="worker-select" aria-label="Update availability" data-worker-avail="${worker.id}">
        <option value="available"     ${worker.availability === "available" ? "selected" : ""}>Available</option>
        <option value="not available" ${worker.availability === "not available" ? "selected" : ""}>Not available</option>
      </select>
      <button class="delete-btn" type="button" data-delete-worker="${worker.id}" aria-label="Remove ${escapeHtml(worker.name)}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
    </div>
  </article>`;
}

// ─── Job Cards ────────────────────────────────────────────
function renderJobs() {
  jobsList.innerHTML = state.jobs.length
    ? state.jobs.map(jobCard).join("")
    : emptyState("No job requests yet. Post one from the Add tab.");

  jobsList.querySelectorAll("[data-delete-job]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const job = findJob(btn.dataset.deleteJob);
      if (!job) return;
      if (!confirm(`Remove the ${job.trade} job in ${job.location}?`)) return;
      logActivity(
        "job",
        `Job removed: <strong>${escapeHtml(job.trade)}</strong> in ${escapeHtml(job.location)}`,
      );
      state.jobs = state.jobs.filter((j) => j.id !== job.id);
      saveAndRender();
      showToast("Job request removed");
    });
  });

  jobsList.querySelectorAll("[data-map-job]").forEach((btn) => {
    btn.addEventListener("click", () => openSiteMap(btn.dataset.mapJob));
  });

  bindCancelBookingButtons(jobsList);
}

// ─── Cancelled Bookings (Admin) ───────────────────────────
function renderCancelledBookings() {
  const el = document.getElementById("cancelledBookingsList");
  if (!el) return;
  const list = state.cancellations || [];
  if (!list.length) {
    el.innerHTML = emptyState("No cancelled bookings yet.");
    return;
  }
  el.innerHTML = list
    .map((c) => {
      const startFmt = c.startDate
        ? new Date(c.startDate).toLocaleDateString("en-GB", {
            weekday: "short",
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : "—";
      const cancelFmt = c.cancelledAt
        ? new Date(c.cancelledAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : "—";
      return `
    <article class="cancelled-card">
      <div class="cancelled-card-top">
        <div class="cancelled-job">${escapeHtml(c.jobTrade)} · ${escapeHtml(c.jobLocation)}</div>
        <span class="cancelled-pay ${c.cancellationPaymentDue ? "due" : "none"}">${c.cancellationPaymentDue ? `${formatMoney(c.cancellationPaymentAmount)} due` : "No payment"}</span>
      </div>
      <div class="cancelled-grid">
        <div class="cancelled-field"><span class="cf-label">Worker</span><span class="cf-val">${escapeHtml(c.workerName)}</span></div>
        <div class="cancelled-field"><span class="cf-label">Company</span><span class="cf-val">${escapeHtml(c.companyName)}</span></div>
        <div class="cancelled-field"><span class="cf-label">Start date</span><span class="cf-val">${escapeHtml(startFmt)}</span></div>
        <div class="cancelled-field"><span class="cf-label">Cancelled</span><span class="cf-val">${escapeHtml(cancelFmt)}</span></div>
        <div class="cancelled-field"><span class="cf-label">Reason</span><span class="cf-val">${escapeHtml(c.cancellationReason)}</span></div>
        <div class="cancelled-field"><span class="cf-label">Day rate</span><span class="cf-val">${c.agreedDayRate ? formatMoney(c.agreedDayRate) : "—"}</span></div>
      </div>
    </article>`;
    })
    .join("");
}

function jobCard(job) {
  const assigned = job.assignedWorkerId
    ? findWorker(job.assignedWorkerId)
    : null;
  const hasPin = job.sitePin && job.sitePin.lat !== null;

  return `
  <article class="job-card">
    <div class="job-card-header">
      <div class="job-trade-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
      </div>
      <div class="job-meta">
        <div class="job-title">${escapeHtml(job.trade)} · ${escapeHtml(job.location)}</div>
        <div class="job-details">
          <span class="job-detail-item">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            ${formatDate(job.start)}
          </span>
          ${
            job.duration
              ? `<span class="job-detail-item">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${escapeHtml(job.duration)}
          </span>`
              : ""
          }
          ${
            hasPin
              ? `<span class="job-detail-item job-has-pin">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            Location pinned
          </span>`
              : ""
          }
        </div>
      </div>
      ${
        assigned
          ? `<span class="assigned-pill">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            ${escapeHtml(assigned.name)}
           </span>`
          : `<span class="unassigned-pill">Unassigned</span>`
      }
    </div>
    ${assigned ? bookingProtectionBanner(job) : ""}
    <div class="job-card-footer">
      ${
        hasPin
          ? `<button class="site-loc-view-btn" type="button" data-map-job="${job.id}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        Site Location
      </button>`
          : ""
      }
      ${
        assigned
          ? `<button class="cancel-booking-btn" type="button" data-cancel-booking="${job.id}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        Cancel Booking
      </button>`
          : ""
      }
      ${
        !assigned
          ? `<div class="job-offer-note">Send offers from Matches so availability, travel, Planned Absence, and ratings are checked.</div>`
          : ""
      }
      <button class="delete-btn delete-btn--job" type="button" data-delete-job="${job.id}" aria-label="Remove job">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        Remove
      </button>
    </div>
  </article>`;
}

// ─── Match Cards ──────────────────────────────────────────
function renderMatches() {
  if (!matchResults) return;
  matchResults.innerHTML = state.jobs.length
    ? state.jobs.map(matchCard).join("")
    : emptyState("Post a job request to see worker matches here.");

  matchResults.querySelectorAll("[data-auto-assign]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const job = findJob(btn.dataset.autoAssign);
      const [best] = getMatches(job);
      if (!best) return;
      const res = createJobOffer(job.id, best.id, "best_match", 1);
      if (!res.ok) {
        showToast(res.reason);
        return;
      }
      saveAndRender();
      showToast(res.duplicate ? "Offer already active" : `Job offer sent to ${best.name}`);
    });
  });
}

function matchCard(job) {
  const matches = getMatches(job);
  const assigned = job.assignedWorkerId
    ? findWorker(job.assignedWorkerId)
    : null;

  return `
  <article class="match-card">
    <div class="match-card-header">
      <div>
        <div class="match-job-title">${escapeHtml(job.trade)} in ${escapeHtml(job.location)}</div>
        <div class="match-job-sub">
          ${formatDate(job.start)}${job.duration ? ` · ${escapeHtml(job.duration)}` : ""}
          ${assigned ? ` · <span style="color:var(--orange);font-weight:600;">Assigned: ${escapeHtml(assigned.name)}</span>` : ""}
        </div>
      </div>
      ${matches.length ? `<button class="auto-assign-btn" type="button" data-auto-assign="${job.id}">Offer best match</button>` : ""}
    </div>
    <div class="match-workers-list">
      ${
        matches.length
          ? matches
              .slice(0, 5)
              .map((w, i) => matchWorkerRow(w, i))
              .join("")
          : `<div class="empty-state" style="border:none;border-radius:0;">No available ${escapeHtml(job.trade.toLowerCase())}s found.</div>`
      }
    </div>
  </article>`;
}

function matchWorkerRow(worker, index) {
  const avCls = avatarColor(worker.name);
  const rankCls = index === 0 ? "rank-1" : "rank-other";
  const rating = worker._rating || buildWorkerRating(worker.id);
  return `
  <div class="match-worker-row">
    <div class="match-rank ${rankCls}">${index + 1}</div>
    <div class="match-worker-avatar ${avCls}">${initials(worker.name)}</div>
    <div class="match-worker-info">
      <div class="match-worker-name">${index === 0 ? "⭐ " : ""}${escapeHtml(worker.name)}${worker._availabilityLabel ? `<span class="match-avail-pill">${escapeHtml(worker._availabilityLabel)}</span>` : ""}</div>
      <div class="match-worker-quals">${escapeHtml(worker.qualifications || worker.trade)}</div>
      <div class="match-worker-meta">
        <span class="match-meta-item">Reliability <b>${escapeHtml(rating.reliabilityRating)}</b></span>
        <span class="match-meta-sep">·</span>
        <span class="match-meta-item">Punctuality <b>${escapeHtml(rating.punctualityRating)}</b></span>
      </div>
      ${ratingEvidenceHTML(rating, true)}
    </div>
  </div>`;
}

// ─── Helpers ──────────────────────────────────────────────
function splitMatchTokens(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
}

function workerSearchText(worker) {
  return [
    worker.trade,
    worker.grade,
    worker.specialism,
    worker.qualifications,
    ...(worker.certifications || []).map((c) =>
      typeof c === "object" ? c.name : c,
    ),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function dateOnlyMs(value) {
  if (!value) return null;
  const date = String(value).slice(0, 10);
  const ms = new Date(date + "T00:00:00").getTime();
  return Number.isFinite(ms) ? ms : null;
}

function jobDateWindow(job) {
  const startMs = dateOnlyMs(job?.start);
  const endMs = dateOnlyMs(job?.estimatedEndDate || job?.endDate || job?.start);
  return {
    startMs,
    endMs: endMs && startMs ? Math.max(startMs, endMs) : startMs,
  };
}

function plannedAbsenceImpact(worker, job) {
  const absences = Array.isArray(worker?.plannedAbsences)
    ? worker.plannedAbsences
    : [];
  if (!absences.length) return { exclude: false, penalty: 0, label: "" };
  const { startMs, endMs } = jobDateWindow(job);
  if (!startMs || !endMs) return { exclude: false, penalty: 0, label: "" };
  const dayMs = 86400000;
  const jobDays = Math.max(1, Math.round((endMs - startMs) / dayMs) + 1);
  let conflictDays = 0;
  let startConflict = false;
  absences.forEach((absence) => {
    const aStart = dateOnlyMs(absence.startDate || absence.date);
    const aEnd = dateOnlyMs(absence.endDate || absence.startDate || absence.date);
    if (!aStart || !aEnd || aEnd < startMs || aStart > endMs) return;
    if (aStart <= startMs && aEnd >= startMs) startConflict = true;
    const overlapStart = Math.max(startMs, aStart);
    const overlapEnd = Math.min(endMs, aEnd);
    conflictDays += Math.max(1, Math.round((overlapEnd - overlapStart) / dayMs) + 1);
  });
  if (!conflictDays) return { exclude: false, penalty: 0, label: "" };
  if (startConflict || conflictDays >= Math.ceil(jobDays / 2)) {
    return { exclude: true, penalty: 0, label: "Planned absence conflict" };
  }
  return {
    exclude: false,
    penalty: Math.min(25, 10 + conflictDays * 5),
    label: `${conflictDays} planned absence day${conflictDays === 1 ? "" : "s"}`,
  };
}

function matchQualificationScore(job, workerText) {
  const required = (job.requiredQualifications || "")
    .split(",")
    .map((q) => q.trim().toLowerCase())
    .filter(Boolean);
  if (!required.length) return { score: 12, matched: 0, total: 0 };
  const matched = required.filter((q) => workerText.includes(q)).length;
  return {
    score: Math.round((matched / required.length) * 15),
    matched,
    total: required.length,
  };
}

function tokenFitScore(value, workerText, maxScore, neutralScore = 0) {
  const tokens = splitMatchTokens(value);
  if (!tokens.length) return neutralScore;
  const matched = tokens.filter((t) => workerText.includes(t)).length;
  return Math.round((matched / tokens.length) * maxScore);
}

function ratingScore(label, maxScore, unprovenScore) {
  return {
    Excellent: maxScore,
    "Very Good": Math.round(maxScore * 0.85),
    Good: Math.round(maxScore * 0.7),
    "Needs Improvement": Math.round(maxScore * 0.35),
    "New / Unproven": unprovenScore,
  }[label] ?? unprovenScore;
}

function travelMatch(job, worker) {
  const radius = Number(worker.travelRadiusMiles || 15);
  const workerPin =
    worker.homePin || worker.locationPin || worker.currentLocation || worker.sitePin;
  const jobPin = job?.sitePin;
  if (
    workerPin?.lat == null ||
    workerPin?.lng == null ||
    jobPin?.lat == null ||
    jobPin?.lng == null
  ) {
    return { exclude: false, score: 7, label: "Travel distance unverified" };
  }
  const miles = haversine(workerPin.lat, workerPin.lng, jobPin.lat, jobPin.lng) / 1609.344;
  if (miles <= radius) {
    return { exclude: false, score: 10, label: `${Math.round(miles)} miles` };
  }
  if (job.accommodationPaid && worker.travelFurtherWithAccommodation) {
    return { exclude: false, score: 7, label: "Outside radius, accommodation paid" };
  }
  return { exclude: true, score: 0, label: "Outside travel radius" };
}

function previousDeclinePenalty(workerId, job) {
  const declines = previousDeclineReasonsForWorker(workerId);
  let penalty = 0;
  declines.forEach((d) => {
    const reason = d.workerReason || d.companyReason || "";
    if (reason === "Rate Too Low") penalty += 8;
    if (reason === "Location / Travel" && job.location) penalty += 8;
    if (
      reason === "Work Activity Not Suitable" &&
      job.workActivity &&
      splitMatchTokens(job.workActivity).length
    ) {
      penalty += 6;
    }
    if (reason === "Start Date Not Suitable") penalty += 4;
    if (reason === "Project Duration Not Suitable") penalty += 4;
  });
  return Math.min(15, penalty);
}

function getMatches(job) {
  if (!job || job.assignedWorkerId || job.completed) return [];
  const { startMs } = jobDateWindow(job);

  return state.workers
    .filter((w) => canonicalTrade(w.trade) === canonicalTrade(job.trade))
    .map((w) => {
      const pricing = computeBookingPricing({
        workerMin: workerMinRate(w),
        budget: jobBudget(job),
      });
      if (!pricing.viable) return null;

      const otherBooking = state.jobs.find(
        (j) => j.id !== job.id && j.assignedWorkerId === w.id && !j.completed,
      );
      let availabilityLabel = "";
      let availabilityScore = 8;
      if (otherBooking) {
        if (!isReallocatable(otherBooking)) return null;
        const endDate = otherBooking.estimatedEndDate || otherBooking.endDate;
        if (job.start && endDate && new Date(job.start) < new Date(endDate))
          return null;
        availabilityLabel = `Available from ${formatDate(endDate)}`;
        availabilityScore = otherBooking.workerAvailabilityStatus === "available_soon" ? 8 : 6;
      } else {
        if (w.availability !== "available") return null;
        const nextMs = dateOnlyMs(w.nextAvailableDate);
        if (nextMs && startMs && nextMs > startMs) return null;
        if (nextMs && startMs && nextMs === startMs)
          availabilityLabel = "Available from start date";
      }

      const absence = plannedAbsenceImpact(w, job);
      if (absence.exclude) return null;
      const travel = travelMatch(job, w);
      if (travel.exclude) return null;

      const rating = buildWorkerRating(w.id);
      const workerText = workerSearchText(w);
      const qual = matchQualificationScore(job, workerText);
      const specialismScore = tokenFitScore(
        [job.specialism, job.grade].filter(Boolean).join(" "),
        workerText,
        10,
        5,
      );
      const workActivityScore = tokenFitScore(job.workActivity, workerText, 8, 4);
      const reliabilityPoints = ratingScore(rating.reliabilityRating, 15, 5);
      const punctualityPoints = ratingScore(rating.punctualityRating, 10, 3);
      const attendanceDays = rating.evidence?.attendanceDays || 0;
      const experienceScore =
        attendanceDays >= 30 ? Math.min(8, Math.floor(attendanceDays / 8) + 4) : Math.min(3, Math.floor(attendanceDays / 10));
      const declinePenalty = previousDeclinePenalty(w.id, job);
      const composite = Math.max(
        0,
        Math.min(
          100,
          20 +
            specialismScore +
            workActivityScore +
            qual.score +
            reliabilityPoints +
            punctualityPoints +
            experienceScore +
            availabilityScore +
            travel.score -
            absence.penalty -
            declinePenalty,
        ),
      );
      const notes = [
        availabilityLabel,
        absence.label,
        travel.label,
        declinePenalty ? "Previous decline pattern" : "",
      ].filter(Boolean);
      return {
        ...w,
        _reliability:
          rating.reliabilityScore != null ? rating.reliabilityScore : w.reliability,
        _punctuality: rating.punctualityScore ?? null,
        _qualBonus: qual.score,
        _composite: composite,
        _availabilityLabel: notes.join(" · "),
        _rating: rating,
        _matchBreakdown: {
          trade: 20,
          specialism: specialismScore,
          workActivity: workActivityScore,
          qualifications: qual.score,
          reliability: reliabilityPoints,
          punctuality: punctualityPoints,
          attendance: experienceScore,
          availability: availabilityScore,
          travel: travel.score,
          plannedAbsencePenalty: absence.penalty,
          previousDeclinePenalty: declinePenalty,
        },
      };
    })
    .filter(Boolean)
    .sort((a, b) => b._composite - a._composite);
}

function findWorker(id) {
  return state.workers.find((w) => w.id === id);
}
function findJob(id) {
  return state.jobs.find((j) => j.id === id);
}

// ─── Site Photo Upload ────────────────────────────────────
let currentJobPhotos = { gate: null, entrance: null, welfare: null };

const PHOTO_KEYS = [
  { key: "gate", inputId: "photoGate", prevId: "prvGate", phId: "phGate" },
  {
    key: "entrance",
    inputId: "photoEntrance",
    prevId: "prvEntrance",
    phId: "phEntrance",
  },
  {
    key: "welfare",
    inputId: "photoWelfare",
    prevId: "prvWelfare",
    phId: "phWelfare",
  },
];

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const MAX = 1200;
        let w = img.width,
          h = img.height;
        if (w > MAX) {
          h = Math.round((h * MAX) / w);
          w = MAX;
        }
        if (h > MAX) {
          w = Math.round((w * MAX) / h);
          h = MAX;
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        try {
          resolve(canvas.toDataURL("image/jpeg", 0.75));
        } catch (err) {
          reject(err);
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

PHOTO_KEYS.forEach(({ key, inputId, prevId, phId }) => {
  document.getElementById(inputId)?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      currentJobPhotos[key] = compressed;
      const card = e.target.closest(".photo-card");
      const prev = document.getElementById(prevId);
      const ph = document.getElementById(phId);
      if (prev) {
        prev.src = compressed;
        prev.style.display = "block";
      }
      if (ph) {
        ph.style.display = "none";
      }
      if (card) {
        card.classList.add("has-photo");
      }
    } catch (_) {
      showToast("Photo upload failed — try a different image");
    }
  });
});

function resetJobPhotos() {
  PHOTO_KEYS.forEach(({ key, inputId, prevId, phId }) => {
    const input = document.getElementById(inputId);
    const card = input?.closest(".photo-card");
    const prev = document.getElementById(prevId);
    const ph = document.getElementById(phId);
    if (input) input.value = "";
    if (prev) {
      prev.src = "";
      prev.style.display = "";
    }
    if (ph) {
      ph.style.display = "";
    }
    if (card) card.classList.remove("has-photo");
  });
  currentJobPhotos = { gate: null, entrance: null, welfare: null };
}

// ─── Site Location & Map System ───────────────────────────
let pickerMap = null;
let pickerMarker = null;
let siteViewMap = null;
let siteViewMarker = null;
let currentJobPin = { lat: null, lng: null };

const siteMapModal = document.getElementById("siteMapModal");

// ── Toggle location section in job form ────────────────────
document.getElementById("toggleSiteLocBtn")?.addEventListener("click", () => {
  const fields = document.getElementById("siteLocFields");
  const chevron = document.getElementById("siteLocChevron");
  const isOpen = !fields.classList.contains("hidden");
  fields.classList.toggle("hidden", isOpen);
  chevron.style.transform = isOpen ? "" : "rotate(180deg)";
  if (!isOpen) {
    // Initialise picker map after section is visible
    requestAnimationFrame(() => initPickerMap());
  }
});

// ── Geocode button ─────────────────────────────────────────
document.getElementById("geocodeBtn")?.addEventListener("click", async () => {
  const addr = document.getElementById("jobSiteAddress")?.value.trim();
  if (!addr) {
    showToast("Enter a site address first");
    return;
  }
  const btn = document.getElementById("geocodeBtn");
  btn.textContent = "Searching…";
  btn.disabled = true;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr)}&limit=1&countrycodes=gb`,
    );
    const data = await res.json();
    if (data[0]) {
      const lat = parseFloat(data[0].lat),
        lng = parseFloat(data[0].lon);
      if (!pickerMap) initPickerMap();
      pickerMap.setView([lat, lng], 17);
      showToast("Map centred — click to drop exact entrance pin");
    } else {
      showToast("Address not found — place pin manually on the map");
    }
  } catch (_) {
    showToast("Search failed — place pin manually on the map");
  }
  btn.textContent = "Find on Map";
  btn.disabled = false;
});

function initPickerMap() {
  if (pickerMap) {
    pickerMap.invalidateSize();
    return;
  }
  pickerMap = L.map("jobPickerMap", { zoomControl: true }).setView(
    [52.4862, -1.8904],
    11,
  );
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(pickerMap);

  const pinIcon = L.divIcon({
    className: "",
    html: `<div class="site-drop-pin"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/></svg></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  });

  pickerMap.on("click", (e) => {
    const { lat, lng } = e.latlng;
    currentJobPin = {
      lat: parseFloat(lat.toFixed(6)),
      lng: parseFloat(lng.toFixed(6)),
    };
    if (pickerMarker) {
      pickerMarker.setLatLng(e.latlng);
    } else {
      pickerMarker = L.marker(e.latlng, {
        icon: pinIcon,
        draggable: true,
      }).addTo(pickerMap);
      pickerMarker.on("dragend", (ev) => {
        const p = ev.target.getLatLng();
        currentJobPin = {
          lat: parseFloat(p.lat.toFixed(6)),
          lng: parseFloat(p.lng.toFixed(6)),
        };
        updatePinCoords();
      });
    }
    updatePinCoords();
  });
  
setTimeout(() => {
  pickerMap.invalidateSize();
}, 300);}

function updatePinCoords() {
  const el = document.getElementById("pinCoordsDisplay");
  const txt = document.getElementById("pinCoordsText");
  if (!el || !txt) return;
  if (currentJobPin.lat !== null) {
    txt.textContent = `${currentJobPin.lat}, ${currentJobPin.lng}`;
    el.classList.remove("hidden");
  } else {
    el.classList.add("hidden");
  }
}

// ── Site Map Modal ─────────────────────────────────────────
function openSiteMap(jobId) {
  const job = findJob(jobId);
  if (!job?.sitePin) return;

  // Workers can't navigate to site until their booking agreement is active.
  const sess = getSessionUser();
  if (
    sess?.type === "worker" &&
    job.assignedWorkerId === sess.id &&
    !bookingAgreementActive(job)
  ) {
    showToast("Accept your Job Agreement to unlock site navigation");
    const agr = agreementForJob(job);
    if (agr) openAgreementModal(agr.id);
    return;
  }

  const { lat, lng } = job.sitePin;
  document.getElementById("siteMapJobName").textContent =
    `${job.trade} · ${job.location}`;

  // Navigation deep links
  document.getElementById("navGoogleMaps").href =
    `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  document.getElementById("navAppleMaps").href =
    `https://maps.apple.com/?daddr=${lat},${lng}`;
  document.getElementById("navWaze").href =
    `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;

  // Site info content
  document.getElementById("siteInfoPanel").innerHTML = buildSiteInfoHtml(job);

  // Photo strip
  const photoStrip = document.getElementById("sitePhotoStrip");
  const photoLabels = {
    gate: "Gate",
    entrance: "Site Entrance",
    welfare: "Welfare Cabin",
  };
  const jobPhotos = job.sitePhotos || {};
  const photoEntries = Object.entries(photoLabels).filter(
    ([k]) => jobPhotos[k],
  );
  if (photoEntries.length) {
    photoStrip.innerHTML = photoEntries
      .map(
        ([k, label]) => `
      <div class="strip-item" data-lightbox-src="${jobPhotos[k]}" data-lightbox-label="${escapeHtml(label)}">
        <img src="${jobPhotos[k]}" class="strip-img" alt="${escapeHtml(label)}" />
        <span class="strip-label">${escapeHtml(label)}</span>
        <span class="strip-hint">Tap to expand</span>
      </div>`,
      )
      .join("");
    photoStrip.classList.remove("hidden");
  } else {
    photoStrip.classList.add("hidden");
  }

  siteMapModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  // Init or update Leaflet map
  setTimeout(() => {
    if (!siteViewMap) {
      siteViewMap = L.map("siteLeafletMap", {
        zoomControl: true,
        attributionControl: false,
      }).setView([lat, lng], 17);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(siteViewMap);

      const viewIcon = L.divIcon({
        className: "",
        html: `<div class="site-view-pin"><svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/></svg></div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 40],
      });
      siteViewMarker = L.marker([lat, lng], { icon: viewIcon }).addTo(
        siteViewMap,
      );
    } else {
      siteViewMap.setView([lat, lng], 17);
      siteViewMarker.setLatLng([lat, lng]);
      siteViewMap.invalidateSize();
    }
  }, 120);
}

function closeSiteMap() {
  siteMapModal.classList.add("hidden");
  document.body.style.overflow = "";
}

document.getElementById("closeMapBtn")?.addEventListener("click", closeSiteMap);
siteMapModal?.addEventListener("click", (e) => {
  if (e.target === siteMapModal) closeSiteMap();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeSiteMap();
    closePhotoLightbox();
    closeDisputeModal();
    closeAgreementModal();
  }
});
document
  .getElementById("closeDisputeBtn")
  ?.addEventListener("click", closeDisputeModal);
document.getElementById("disputeModal")?.addEventListener("click", (e) => {
  if (e.target === document.getElementById("disputeModal")) closeDisputeModal();
});
document
  .getElementById("submitDisputeBtn")
  ?.addEventListener("click", submitDispute);
document
  .getElementById("closeReportBtn")
  ?.addEventListener("click", closeReportModal);
document.getElementById("reportModal")?.addEventListener("click", (e) => {
  if (e.target === document.getElementById("reportModal")) closeReportModal();
});
document
  .getElementById("submitReportBtn")
  ?.addEventListener("click", submitReport);

// ─── Photo Lightbox ────────────────────────────────────────
let lightboxEl = null;

function openPhotoLightbox(src, label) {
  if (!lightboxEl) {
    lightboxEl = document.createElement("div");
    lightboxEl.className = "photo-lightbox";
    lightboxEl.innerHTML = `
      <button class="photo-lb-close" type="button" aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <img class="photo-lb-img" alt="" />
      <span class="photo-lb-label"></span>`;
    lightboxEl.addEventListener("click", (e) => {
      if (e.target === lightboxEl || e.target.closest(".photo-lb-close"))
        closePhotoLightbox();
    });
    document.body.appendChild(lightboxEl);
  }
  lightboxEl.querySelector(".photo-lb-img").src = src;
  lightboxEl.querySelector(".photo-lb-img").alt = label;
  lightboxEl.querySelector(".photo-lb-label").textContent = label;
  lightboxEl.classList.add("open");
}

function closePhotoLightbox() {
  lightboxEl?.classList.remove("open");
}

document.addEventListener("click", (e) => {
  const item = e.target.closest("[data-lightbox-src]");
  if (item)
    openPhotoLightbox(item.dataset.lightboxSrc, item.dataset.lightboxLabel);
});

function siteInfoRow(iconPath, label, value) {
  if (!value) return "";
  return `
    <div class="site-info-row">
      <div class="site-info-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${iconPath}</svg>
      </div>
      <div class="site-info-content">
        <span class="site-info-label">${label}</span>
        <span class="site-info-value">${escapeHtml(String(value))}</span>
      </div>
    </div>`;
}

function buildSiteInfoHtml(job) {
  const rows = [
    siteInfoRow(
      '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
      "Address",
      job.siteAddress || job.location,
    ),
    job.siteContact?.name
      ? siteInfoRow(
          '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
          "Site Contact",
          job.siteContact.name,
        )
      : "",
    job.siteContact?.phone
      ? `
    <div class="site-info-row">
      <div class="site-info-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6 6l.96-1.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2z"/></svg>
      </div>
      <div class="site-info-content">
        <span class="site-info-label">Phone</span>
        <a class="site-info-value site-phone-link" href="tel:${escapeHtml(job.siteContact.phone)}">${escapeHtml(job.siteContact.phone)}</a>
      </div>
    </div>`
      : "",
    siteInfoRow(
      '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
      "Arrival",
      job.arrivalInstructions,
    ),
    siteInfoRow(
      '<rect x="5" y="3" width="14" height="18" rx="1"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/>',
      "Parking",
      job.parking,
    ),
    siteInfoRow(
      '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
      "PPE Required",
      job.ppe,
    ),
    siteInfoRow(
      '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
      "Gate / Access",
      job.gateAccess,
    ),
  ]
    .filter(Boolean)
    .join("");

  return (
    rows ||
    `<p style="color:var(--ink-3);font-size:0.87rem;padding:8px 0;">No site details added.</p>`
  );
}

// ─── Attendance System ────────────────────────────────────
const ATTENDANCE_KEY = "onsite_attendance_v1";

let attendanceRecords = loadAttendanceRecords();
let todayAttendanceMap = {}; // workerId -> { status, rating }
let qrSelectedJobId = null; // supervisor-selected job for the daily site QR

function loadAttendanceRecords() {
  try {
    const s = localStorage.getItem(ATTENDANCE_KEY);
    if (s) return JSON.parse(s);
  } catch (_) {}
  return [];
}
function saveAttendanceRecords() {
  try {
    localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(attendanceRecords));
  } catch (_) {}
}
function todayDateStr() {
  return new Date().toISOString().split("T")[0];
}
function formatAttDate(d) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(d + "T00:00:00"));
}

const ATT_CFG = {
  onTime: {
    icon: "✓",
    label: "On Time",
    color: "var(--green-text)",
    bg: "rgba(22,163,74,0.12)",
    border: "rgba(22,163,74,0.35)",
  },
  late: {
    icon: "⏱",
    label: "Late",
    color: "var(--amber-text)",
    bg: "rgba(217,119,6,0.12)",
    border: "rgba(217,119,6,0.35)",
  },
  noShow: {
    icon: "✗",
    label: "No Show",
    color: "var(--red-text)",
    bg: "rgba(220,38,38,0.1)",
    border: "rgba(220,38,38,0.3)",
  },
  excused: {
    icon: "✎",
    label: "Excused",
    color: "var(--amber-text)",
    bg: "rgba(217,119,6,0.08)",
    border: "rgba(217,119,6,0.28)",
  },
  sentHome: {
    icon: "⊝",
    label: "Sent Home",
    color: "var(--ink-3)",
    bg: "var(--surface-3)",
    border: "var(--border)",
  },
  notRequired: {
    icon: "—",
    label: "Not Required",
    color: "var(--ink-3)",
    bg: "var(--surface-3)",
    border: "var(--border)",
  },
  siteCancelled: {
    icon: "⊘",
    label: "Site Cancel",
    color: "#6366f1",
    bg: "rgba(99,102,241,0.08)",
    border: "rgba(99,102,241,0.25)",
  },
  checkedIn: {
    icon: "◷",
    label: "Checked In",
    color: "var(--orange)",
    bg: "rgba(249,115,22,0.1)",
    border: "rgba(249,115,22,0.3)",
  },
  unconfirmed: {
    icon: "?",
    label: "Unconfirmed",
    color: "var(--ink-3)",
    bg: "var(--surface-3)",
    border: "var(--border-light)",
  },
  reportedIssue: {
    icon: "!",
    label: "Reported Issue",
    color: "var(--amber-text)",
    bg: "rgba(217,119,6,0.1)",
    border: "rgba(217,119,6,0.3)",
  },
};

// Statuses that count toward the reliability ratio (attended / countable).
const COUNTABLE_STATUSES = ["onTime", "late", "noShow"];
// Decisions a supervisor can confirm from the approval screen.
const SUPERVISOR_DECISIONS = [
  "onTime",
  "late",
  "noShow",
  "excused",
  "sentHome",
  "notRequired",
  "siteCancelled",
];

const LATE_REPORT_REASONS = [
  "Public transport disruption",
  "Road traffic",
  "Vehicle breakdown",
  "Family emergency",
  "Medical appointment",
  "Other",
];

const LATE_CLASSIFICATION = {
  valid_reason: "Valid reason",
  invalid_reason: "Invalid reason",
  worker_did_not_arrive: "Worker did not arrive",
};

// ─── Attendance timing rules ──────────────────────────────
const GRACE_MIN = 10; // within this many minutes of start = On Time
const CUTOFF_MIN = 60; // no scan after this many minutes = Unconfirmed

// Build a Date for today at a job/site start time (HH:MM).
function siteStartMs(startTime) {
  const [h, m] = (startTime || "08:00").split(":").map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
}

// Suggested status from a scan time relative to the site start.
function suggestStatusForScan(scanMs, startMs) {
  return scanMs <= startMs + GRACE_MIN * 60000 ? "onTime" : "late";
}
function isPastCutoff(startMs) {
  return Date.now() > startMs + CUTOFF_MIN * 60000;
}

function jobExpectedStartTime(job) {
  const code = job?.id ? activeSiteCode(job.id) : null;
  if (code?.startTime) return code.startTime;
  if (job?.shiftStartTime) return job.shiftStartTime;
  if (job?.start && String(job.start).includes("T")) {
    return String(job.start).split("T")[1].slice(0, 5);
  }
  return "08:00";
}

function lateReportFor(workerId, date = todayDateStr()) {
  return attendanceRecords.find(
    (r) => r.workerId === workerId && r.date === date && r.lateReport,
  );
}

function upsertWorkerLateReport(workerId, lateReport, date) {
  const worker = findWorker(workerId);
  if (!worker || !lateReport) return;
  if (!Array.isArray(worker.lateReports)) worker.lateReports = [];
  const snapshot = {
    id: lateReport.id,
    date,
    jobId: lateReport.jobId || "",
    project: lateReport.jobLocation || lateReport.jobTrade || "",
    reason: lateReport.reason || "",
    expectedStartTime: lateReport.expectedStartTime || "",
    estimatedArrivalTime: lateReport.estimatedArrivalTime || "",
    actualArrivalTime: lateReport.actualArrivalTime || "",
    supervisorDecision: lateReport.supervisorDecision || "",
  };
  const idx = worker.lateReports.findIndex((r) => r.id === snapshot.id);
  if (idx === -1) worker.lateReports.unshift(snapshot);
  else worker.lateReports[idx] = snapshot;
}

function notifyLateReport(worker, job, lateReport) {
  if (!Array.isArray(state.notifications)) state.notifications = [];
  state.notifications.unshift({
    id: createId(),
    type: "worker_late_report",
    workerId: worker?.id || "",
    workerName: worker?.name || "Worker",
    jobId: job?.id || "",
    companyId: job?.companyId || "",
    companyName: job?.companyName || "Company",
    attendanceManager: job?.attendanceManager || null,
    message: `${worker?.name || "Worker"} reported running late for ${job?.trade || "work"} in ${job?.location || "site"}. ETA ${lateReport.estimatedArrivalTime}.`,
    createdAt: new Date().toISOString(),
    readAt: "",
  });
}

// ─── Daily Site QR Codes ──────────────────────────────────
function getSiteCode(jobId, date) {
  return (
    (state.siteCodes || []).find((c) => c.jobId === jobId && c.date === date) ||
    null
  );
}
function activeSiteCode(jobId) {
  const today = todayDateStr();
  const code = getSiteCode(jobId, today);
  return code && code.date === today && Date.now() < code.expiresAt
    ? code
    : null;
}
function generateSiteCode(jobId) {
  const job = findJob(jobId);
  if (!job) return null;
  const today = todayDateStr();
  if (!Array.isArray(state.siteCodes)) state.siteCodes = [];
  // Refresh: drop any prior code for this job/day, then create fresh.
  state.siteCodes = state.siteCodes.filter(
    (c) => !(c.jobId === jobId && c.date === today),
  );
  const startTime = job.shiftStartTime || jobExpectedStartTime(job);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 0);
  const code = {
    id: createId(),
    jobId,
    date: today,
    token: "OS-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
    startTime,
    expiresAt: endOfDay.getTime(),
    createdAt: Date.now(),
  };
  state.siteCodes.unshift(code);
  saveState();
  return code;
}

// Render a deterministic QR-style grid from a token (visual only — simulated scan).
function renderQrGlyph(token) {
  let h = 0;
  for (let i = 0; i < token.length; i++)
    h = (h * 31 + token.charCodeAt(i)) >>> 0;
  const N = 11;
  let cells = "";
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      // Fixed finder squares in three corners
      const finder =
        (x < 3 && y < 3) || (x > N - 4 && y < 3) || (x < 3 && y > N - 4);
      const edge =
        (x === 0 || x === 2 || y === 0 || y === 2) &&
        ((x <= 2 && y <= 2) ||
          (x >= N - 3 && y <= 2) ||
          (x <= 2 && y >= N - 3));
      let on;
      if (finder)
        on = x === 1 && y === 1 ? false : edge || (x === 1 && y === 1);
      else {
        h = (h * 1103515245 + 12345) >>> 0;
        on = ((h >> (x + y) % 16) & 1) === 1;
      }
      if (on) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
  }
  return `<svg class="qr-glyph" viewBox="0 0 ${N} ${N}" width="120" height="120" shape-rendering="crispEdges" aria-hidden="true"><rect width="${N}" height="${N}" fill="#fff"/><g fill="#18181b">${cells}</g></svg>`;
}

// ─── 90-day Exception Counters (internal / admin-only) ────
function getExceptionInfo(workerId) {
  const cutoff = Date.now() - 90 * 86400000;
  const exc = attendanceRecords.filter(
    (r) =>
      r.workerId === workerId &&
      (r.status === "excused" || r.status === "reportedIssue") &&
      new Date(r.date + "T00:00:00").getTime() >= cutoff,
  );
  const count = exc.length;
  const flag = count >= 7 ? "review" : count >= 4 ? "warning" : "none";
  return { count, flag };
}

// ─── Worker Stats from Attendance Records ─────────────────
// All account IDs that belong to the same permanent identity as `workerId`
// (current + previous logins). Ensures a worker can't shed historical
// attendance impact by deleting and re-registering under a new account.
function linkedAccountIds(workerId) {
  if (!workerId) return [];
  const id = getIdentities().find(
    (i) =>
      i.currentUserAccountId === workerId ||
      (i.previousUserAccountIds || []).includes(workerId),
  );
  if (!id) return [workerId];
  return Array.from(
    new Set(
      [
        workerId,
        id.currentUserAccountId,
        ...(id.previousUserAccountIds || []),
      ].filter(Boolean),
    ),
  );
}

function getWorkerStats(workerId) {
  const accountIds = linkedAccountIds(workerId);
  const recs = attendanceRecords.filter((r) => accountIds.includes(r.workerId));
  // Records under active dispute are frozen — don't apply penalty until resolved
  const scoreable = recs.filter((r) => r.disputeStatus !== "pending");
  // Only confirmed attendance statuses affect reliability. A worker's own scan /
  // self-report never moves the score until a supervisor confirms it.
  const countable = scoreable.filter(
    (r) =>
      COUNTABLE_STATUSES.includes(r.status) &&
      (!r.selfReported || r.supervisorConfirmed),
  );
  const attended = countable.filter(
    (r) => r.status === "onTime" || r.status === "late",
  );
  const onTime = countable.filter((r) => r.status === "onTime");
  const lateRecords = countable.filter((r) => r.status === "late");
  const reportedLate = lateRecords.filter((r) => r.lateReport);
  const unreportedLate = lateRecords.filter((r) => !r.lateReport);
  const validReportedLate = reportedLate.filter(
    (r) => r.lateReport?.supervisorDecision === "valid_reason",
  );
  const invalidReportedLate = reportedLate.filter(
    (r) => r.lateReport?.supervisorDecision === "invalid_reason",
  );
  const didNotArriveAfterLateReport = countable.filter(
    (r) => r.lateReport?.supervisorDecision === "worker_did_not_arrive",
  );
  const punctualityPoints = attended.reduce((sum, r) => {
    if (r.status === "onTime") return sum + 1;
    if (r.status !== "late") return sum;
    const decision = r.lateReport?.supervisorDecision;
    if (decision === "valid_reason") return sum + 1;
    if (decision === "invalid_reason") return sum + 0.75;
    if (r.lateReport) return sum + 1;
    return sum + 0.5;
  }, 0);
  const lateReportsByReason = reportedLate.reduce((acc, r) => {
    const reason = r.lateReport?.reason || "Other";
    acc[reason] = (acc[reason] || 0) + 1;
    return acc;
  }, {});
  const ratings = recs.filter((r) => r.rating > 0).map((r) => r.rating);
  const disputed = recs.filter((r) => r.disputeStatus === "pending").length;
  const completedProjectIds = new Set(
    countable
      .filter((r) => r.status === "onTime" || r.status === "late")
      .map((r) => r.jobId)
      .filter(Boolean),
  );
  state.jobs
    .filter((j) => j.assignedWorkerId === workerId && j.completed)
    .forEach((j) => completedProjectIds.add(j.id));
  return {
    totalShifts: countable.length,
    attendanceDays: countable.length,
    completedProjects: completedProjectIds.size,
    attended: attended.length,
    onTime: onTime.length,
    late: attended.length - onTime.length,
    noShow: countable.length - attended.length,
    disputed,
    reliability: countable.length
      ? Math.round((attended.length / countable.length) * 100)
      : null,
    punctuality: attended.length
      ? Math.round((punctualityPoints / attended.length) * 100)
      : null,
    reportedLateCount: reportedLate.length,
    unreportedLateCount: unreportedLate.length,
    validReportedLateCount: validReportedLate.length,
    invalidReportedLateCount: invalidReportedLate.length,
    didNotArriveAfterLateReport: didNotArriveAfterLateReport.length,
    lateReportsByReason,
    performance: ratings.length
      ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)
      : null,
    ratingCount: ratings.length,
  };
}

function ratingLabelFromScore(score) {
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Very Good";
  if (score >= 70) return "Good";
  return "Needs Improvement";
}

function buildWorkerRating(workerId) {
  const stats = getWorkerStats(workerId);
  const evidence = {
    attendanceDays: stats.attendanceDays || 0,
    completedProjects: stats.completedProjects || 0,
    noShows: stats.noShow || 0,
    reportedLateEvents: stats.reportedLateCount || 0,
    unreportedLateEvents: stats.unreportedLateCount || 0,
    validReportedLateness: stats.validReportedLateCount || 0,
    invalidReportedLateness: stats.invalidReportedLateCount || 0,
  };
  if (evidence.attendanceDays < 30) {
    return {
      isRated: false,
      reliabilityRating: "New / Unproven",
      punctualityRating: "New / Unproven",
      reliabilityScore: null,
      punctualityScore: null,
      evidence,
      stats,
    };
  }

  const noShowPenalty = evidence.noShows * 12;
  const didNotArrivePenalty = (stats.didNotArriveAfterLateReport || 0) * 8;
  const invalidLatePenalty = evidence.invalidReportedLateness * 2;
  const completionBonus = Math.min(5, evidence.completedProjects);
  const reliabilityScore = clampScore(
    Math.round(100 - noShowPenalty - didNotArrivePenalty - invalidLatePenalty + completionBonus),
  );

  const punctualityScore = clampScore(stats.punctuality ?? 100);
  return {
    isRated: true,
    reliabilityRating: ratingLabelFromScore(reliabilityScore),
    punctualityRating: ratingLabelFromScore(punctualityScore),
    reliabilityScore,
    punctualityScore,
    evidence,
    stats,
  };
}

function ratingEvidenceHTML(rating, compact = false) {
  const e = rating.evidence;
  const items = [
    ["Attendance days", e.attendanceDays],
    ["Completed projects", e.completedProjects],
    ["No-shows", e.noShows],
    ["Reported late events", e.reportedLateEvents],
    ["Unreported late events", e.unreportedLateEvents],
    ["Valid reported lateness", e.validReportedLateness],
    ["Invalid reported lateness", e.invalidReportedLateness],
  ];
  return `<div class="rating-evidence${compact ? " rating-evidence--compact" : ""}">
    ${items
      .map(
        ([label, value]) => `
      <span class="rating-evidence-item"><strong>${value}</strong>${escapeHtml(label)}</span>`,
      )
      .join("")}
  </div>`;
}

function ratingBadgeHTML(label) {
  const cls = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `<span class="rating-label rating-label--${cls}">${escapeHtml(label)}</span>`;
}

// ─── Submit Day Attendance ─────────────────────────────────
function submitDayAttendance() {
  const today = todayDateStr();
  let count = 0;

  // Smart No-Show validation — flag GPS conflicts before finalising
  const conflicts = [];
  Object.entries(todayAttendanceMap).forEach(([wid, data]) => {
    if (data.status !== "noShow") return;
    const gps = data.gps;
    if (!gps) return;
    const job = state.jobs.find((j) => j.assignedWorkerId === wid);
    if (!job?.sitePin) return;
    const dist = haversine(gps.lat, gps.lng, job.sitePin.lat, job.sitePin.lng);
    if (dist <= 300) {
      const w = findWorker(wid);
      conflicts.push(
        `${w?.name || wid} (GPS recorded ${Math.round(dist)}m from site pin)`,
      );
    }
  });
  if (conflicts.length) {
    const ok = confirm(
      `⚠ Potential Attendance Conflict Detected\n\nGPS evidence suggests the following worker(s) may have been on site:\n\n${conflicts.join("\n")}\n\nContinue marking as No Show?`,
    );
    if (!ok) return;
  }

  Object.entries(todayAttendanceMap).forEach(([wid, data]) => {
    if (!data.status) return;
    // Preserve any check-in / reported-issue context the worker logged today.
    const prevRec = attendanceRecords.find(
      (r) => r.workerId === wid && r.date === today,
    );
    const linkedJob = state.jobs.find((j) => j.assignedWorkerId === wid);
    const lateReport = prevRec?.lateReport ? { ...prevRec.lateReport } : null;
    if (lateReport && data.lateSupervisorDecision) {
      lateReport.supervisorDecision = data.lateSupervisorDecision;
      lateReport.supervisorDecisionAt =
        lateReport.supervisorDecisionAt || new Date().toISOString();
      lateReport.supervisorDecisionBy =
        lateReport.supervisorDecisionBy ||
        getSessionUser()?.companyName ||
        getSessionUser()?.name ||
        "Supervisor";
    }
    const finalStatus =
      lateReport?.supervisorDecision === "worker_did_not_arrive"
        ? "noShow"
        : data.status;
    const rec = {
      id: createId(),
      workerId: wid,
      date: today,
      status: finalStatus,
      rating: data.rating || 0,
      recordedAt: Date.now(),
      supervisorConfirmed: true,
      supervisorDecision: finalStatus,
      confirmedAt: Date.now(),
    };
    // Snapshot the booking + pricing so weekly invoices can be built from
    // approved attendance even if the job is later edited or completed.
    if (linkedJob) {
      rec.jobId = linkedJob.id;
      rec.companyId = linkedJob.companyId || "";
      rec.companyName = linkedJob.companyName || "Company";
      rec.jobTrade = linkedJob.trade || "";
      rec.jobLocation = linkedJob.location || "";
      rec.workerPay =
        linkedJob.pricing?.workerPay != null
          ? linkedJob.pricing.workerPay
          : linkedJob.agreedDayRate || 0;
      rec.companyCharge =
        linkedJob.companyCharge != null
          ? linkedJob.companyCharge
          : companyChargeDisplay(linkedJob);
    }
    if (prevRec) {
      if (prevRec.checkInTime) rec.checkInTime = prevRec.checkInTime;
      if (prevRec.suggestedStatus)
        rec.suggestedStatus = prevRec.suggestedStatus;
      if (prevRec.scanToken) rec.scanToken = prevRec.scanToken;
      if (prevRec.reportedIssue) rec.reportedIssue = prevRec.reportedIssue;
      if (lateReport) rec.lateReport = lateReport;
    }
    if (rec.lateReport) {
      if (rec.checkInTime && !rec.lateReport.actualArrivalTime) {
        rec.lateReport.actualArrivalTime = new Date(rec.checkInTime).toLocaleTimeString(
          "en-GB",
          { hour: "2-digit", minute: "2-digit" },
        );
      }
      upsertWorkerLateReport(wid, rec.lateReport, today);
    }
    if (data.gps) {
      rec.gpsLat = data.gps.lat;
      rec.gpsLng = data.gps.lng;
      rec.gpsDistance = data.gps.distance;
      rec.gpsTimestamp = data.gps.timestamp;
    }
    attendanceRecords = attendanceRecords.filter(
      (r) => !(r.workerId === wid && r.date === today),
    );
    attendanceRecords.unshift(rec);
    const w = findWorker(wid);
    if (w) {
      const stats = getWorkerStats(wid);
      if (stats.reliability !== null) {
        const prev = w.reliability;
        w.reliability = stats.reliability;
        const lbl = {
          onTime: "on time",
          late: "late",
          noShow: "no-showed",
          notRequired: "not required",
          siteCancelled: "site cancelled",
        };
        logActivity(
          "attend",
          `<strong>${escapeHtml(w.name)}</strong> marked ${lbl[data.status] || data.status}${w.reliability !== prev ? ` — reliability ${prev}% → ${w.reliability}%` : ""}${data.gps ? ` · GPS ${data.gps.distance !== null ? Math.round(data.gps.distance) + "m" : "recorded"}` : ""}`,
        );
      }
    }
    count++;
  });
  if (!count) {
    showToast("No attendance marked yet");
    return;
  }
  saveAttendanceRecords();
  saveState();
  todayAttendanceMap = {};
  renderAttendance();
  render();
  showToast(`Attendance saved for ${count} worker${count !== 1 ? "s" : ""}`);
}

// ─── Attendance Card ──────────────────────────────────────
function attendanceCard(worker, today) {
  const avCls = avatarColor(worker.name);
  const saved = todayAttendanceMap[worker.id] || {};
  const stats = getWorkerStats(worker.id);
  const rating = buildWorkerRating(worker.id);
  const job = state.jobs.find((j) => j.assignedWorkerId === worker.id);

  const statusBtns = SUPERVISOR_DECISIONS.map((key) => {
    const cfg = ATT_CFG[key];
    const active = saved.status === key;
    const style = active
      ? `background:${cfg.bg};border-color:${cfg.border};color:${cfg.color}`
      : "";
    return `<button class="att-btn${active ? " att-btn--active" : ""}" style="${style}"
      data-att-worker="${worker.id}" data-att-status="${key}" type="button">
      <span class="att-btn-icon">${cfg.icon}</span>
      <span class="att-btn-label">${cfg.label}</span>
    </button>`;
  }).join("");

  // Check-in context from any record the worker logged today (scan / report).
  const rec = attendanceRecords.find(
    (r) => r.workerId === worker.id && r.date === today,
  );
  let checkInBanner = "";
  if (rec && rec.status === "checkedIn") {
    const t = rec.checkInTime
      ? new Date(rec.checkInTime).toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
    const sug = rec.suggestedStatus ? ATT_CFG[rec.suggestedStatus] : null;
    checkInBanner = `<div class="att-checkin-banner att-checkin--in" data-att-worker="${worker.id}" data-att-suggested="${rec.suggestedStatus || ""}">
        <span>${ATT_CFG.checkedIn.icon} Checked in ${t}${sug ? ` · Suggested <strong style="color:${sug.color}">${sug.label}</strong>` : ""}</span>
      </div>`;
  } else if (rec && rec.status === "reportedIssue") {
    const ri = rec.reportedIssue || {};
    const detail = ri.unableToAttend
      ? "Unable to attend"
      : ri.expectedArrival
        ? `ETA ${escapeHtml(ri.expectedArrival)}`
        : "";
    checkInBanner = `<div class="att-checkin-banner att-checkin--issue">
        <span>${ATT_CFG.reportedIssue.icon} Reported: ${escapeHtml(ri.reason || "Issue")}${detail ? ` · ${detail}` : ""}</span>
      </div>`;
  } else if (
    job &&
    !rec &&
    isPastCutoff(siteStartMs(activeSiteCode(job.id)?.startTime))
  ) {
    checkInBanner = `<div class="att-checkin-banner att-checkin--unconf">
        <span>${ATT_CFG.unconfirmed.icon} No check-in — Unconfirmed. Confirm a status below.</span>
      </div>`;
  }

  const lr = rec?.lateReport;
  const lateReportBanner = lr
    ? `
    <div class="att-late-report">
      <div class="att-late-report-main">
        <strong>Running late reported</strong>
        <span>${escapeHtml(lr.reason || "Other")} · Start ${escapeHtml(lr.expectedStartTime || "08:00")} · ETA ${escapeHtml(lr.estimatedArrivalTime || "—")}${lr.actualArrivalTime ? ` · Arrived ${escapeHtml(lr.actualArrivalTime)}` : ""}</span>
        ${lr.comment ? `<em>${escapeHtml(lr.comment)}</em>` : ""}
        ${lr.supervisorDecision ? `<span class="att-late-decision">Decision: ${escapeHtml(LATE_CLASSIFICATION[lr.supervisorDecision] || lr.supervisorDecision)}</span>` : ""}
      </div>
      ${
        lr.supervisorDecision
          ? ""
          : `<div class="att-late-actions">
              <button type="button" data-late-classify="${worker.id}" data-late-decision="valid_reason">Valid reason</button>
              <button type="button" data-late-classify="${worker.id}" data-late-decision="invalid_reason">Invalid reason</button>
              <button type="button" data-late-classify="${worker.id}" data-late-decision="worker_did_not_arrive">Worker did not arrive</button>
            </div>`
      }
    </div>`
    : "";

  const showRating = saved.status === "onTime" || saved.status === "late";
  const ratingRow = showRating
    ? `
    <div class="att-rating-row">
      <span class="att-rating-label">Rate performance:</span>
      ${[1, 2, 3, 4, 5]
        .map(
          (
            n,
          ) => `<button class="att-star${(saved.rating || 0) >= n ? " att-star--filled" : ""}"
        data-att-worker="${worker.id}" data-att-star="${n}" type="button">★</button>`,
        )
        .join("")}
    </div>`
    : "";

  const statsRow =
    stats.totalShifts > 0
      ? `
    <div class="att-worker-stats">
      <span class="att-stat">Reliability ${ratingBadgeHTML(rating.reliabilityRating)}</span>
      <span class="att-sep">·</span>
      <span class="att-stat">Punctuality ${ratingBadgeHTML(rating.punctualityRating)}</span>
      ${stats.performance ? `<span class="att-sep">·</span><span class="att-stat"><span class="att-stat-val" style="color:var(--amber)">★${stats.performance}</span></span>` : ""}
      <span class="att-sep">·</span>
      <span class="att-stat">${stats.totalShifts} shift${stats.totalShifts !== 1 ? "s" : ""}</span>
      ${ratingEvidenceHTML(rating, true)}
    </div>`
      : "";

  const savedStatus = saved.status
    ? `<span style="color:${ATT_CFG[saved.status]?.color};font-weight:600;">${ATT_CFG[saved.status]?.icon} ${ATT_CFG[saved.status]?.label}</span>`
    : '<span style="color:var(--ink-3)">Not recorded</span>';

  // GPS capture row — shown when a status is selected
  const showGps =
    saved.status &&
    saved.status !== "notRequired" &&
    saved.status !== "siteCancelled";
  const gpsData = saved.gps;
  const gpsRow = showGps
    ? `
    <div class="att-gps-row" id="gps-${worker.id}">
      ${
        gpsData
          ? `<div class="gps-captured-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2"/></svg>
            ${gpsData.distance !== null ? gpsDistanceLabel(gpsData.distance) : "Location captured"}
           </div>`
          : `<button class="gps-capture-btn" data-gps-worker="${worker.id}" type="button">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2"/></svg>
            Record My Location
           </button>`
      }
    </div>`
    : "";

  return `
  <article class="attendance-card" id="att-card-${worker.id}">
    <div class="att-worker-row">
      <div class="worker-avatar ${avCls}" style="width:38px;height:38px;font-size:0.8rem;flex-shrink:0;">${initials(worker.name)}</div>
      <div class="att-worker-info">
        <div class="att-worker-name">${escapeHtml(worker.name)}</div>
        <div class="att-worker-sub">${escapeHtml(worker.trade)}${job ? ` · <span style="color:var(--ink-2)">${escapeHtml(job.location)}</span>` : ""} · ${savedStatus}</div>
      </div>
    </div>
    ${checkInBanner}
    ${lateReportBanner}
    ${statsRow}
    <div class="att-status-btns att-status-btns--sup">${statusBtns}</div>
    ${ratingRow}
    ${gpsRow}
  </article>`;
}

function bindAttendanceEvents(container) {
  container.querySelectorAll("[data-att-status]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const wid = btn.dataset.attWorker,
        status = btn.dataset.attStatus;
      if (!todayAttendanceMap[wid]) todayAttendanceMap[wid] = {};
      todayAttendanceMap[wid].status =
        todayAttendanceMap[wid].status === status ? null : status;
      if (status !== "onTime" && status !== "late")
        todayAttendanceMap[wid].rating = 0;
      refreshAttCard(wid);
    });
  });
  container.querySelectorAll("[data-att-star]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const wid = btn.dataset.attWorker,
        n = Number(btn.dataset.attStar);
      if (!todayAttendanceMap[wid]) todayAttendanceMap[wid] = {};
      todayAttendanceMap[wid].rating =
        todayAttendanceMap[wid].rating === n ? 0 : n;
      refreshAttCard(wid);
    });
  });
  container.querySelectorAll("[data-gps-worker]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const wid = btn.dataset.gpsWorker;
      btn.textContent = "Getting location…";
      btn.disabled = true;
      try {
        const { lat, lng } = await getGPS();
        const job = state.jobs.find((j) => j.assignedWorkerId === wid);
        const dist = job?.sitePin
          ? haversine(lat, lng, job.sitePin.lat, job.sitePin.lng)
          : null;
        if (!todayAttendanceMap[wid]) todayAttendanceMap[wid] = {};
        todayAttendanceMap[wid].gps = {
          lat,
          lng,
          distance: dist,
          timestamp: Date.now(),
        };
        refreshAttCard(wid);
      } catch (_) {
        showToast(
          "Location unavailable — enable location access in your browser",
        );
        btn.textContent = "Record My Location";
        btn.disabled = false;
      }
    });
  });
  container.querySelectorAll("[data-late-classify]").forEach((btn) => {
    btn.addEventListener("click", () => {
      classifyLateReport(btn.dataset.lateClassify, btn.dataset.lateDecision);
    });
  });
}

function classifyLateReport(workerId, decision) {
  const today = todayDateStr();
  const rec = lateReportFor(workerId, today);
  if (!rec?.lateReport || !LATE_CLASSIFICATION[decision]) return;
  const sess = getSessionUser();
  rec.lateReport.supervisorDecision = decision;
  rec.lateReport.supervisorDecisionAt = new Date().toISOString();
  rec.lateReport.supervisorDecisionBy =
    sess?.companyName || sess?.name || "Supervisor";
  if (rec.checkInTime && !rec.lateReport.actualArrivalTime) {
    rec.lateReport.actualArrivalTime = new Date(rec.checkInTime).toLocaleTimeString(
      "en-GB",
      { hour: "2-digit", minute: "2-digit" },
    );
  }
  if (!todayAttendanceMap[workerId]) todayAttendanceMap[workerId] = {};
  todayAttendanceMap[workerId].status =
    decision === "worker_did_not_arrive" ? "noShow" : "late";
  todayAttendanceMap[workerId].lateSupervisorDecision = decision;
  upsertWorkerLateReport(workerId, rec.lateReport, today);
  saveAttendanceRecords();
  saveState();
  refreshAttCard(workerId);
  showToast(`Late report classified: ${LATE_CLASSIFICATION[decision]}`);
}

function refreshAttCard(wid) {
  const card = document.getElementById("att-card-" + wid);
  const w = findWorker(wid);
  if (!card || !w) return;
  const tmp = document.createElement("div");
  tmp.innerHTML = attendanceCard(w, todayDateStr());
  card.replaceWith(tmp.firstElementChild);
  bindAttendanceEvents(document.getElementById("attendanceCards"));
}

// ─── Worker Self-Attendance ────────────────────────────────
function renderWorkerAttendance(user) {
  const container = document.getElementById("attendanceCards");
  const submitBtn = document.getElementById("submitAttendanceBtn");
  const submitWrap = document.querySelector(".att-submit-wrap");
  const histEl = document.getElementById("attendanceHistory");
  const badge = document.getElementById("attTodayBadge");
  if (!container) return;

  // Restyle the attendance header for worker context
  const attTitle = document.querySelector("#tab-attendance .panel-title");
  const attSub = document.querySelector("#tab-attendance .panel-subtitle");
  if (attTitle) attTitle.textContent = "My Timesheet";
  if (attSub)
    attSub.textContent =
      "Worker Home is your main Sign In entry. This area shows your attendance record and backup check-in status.";

  if (badge) badge.textContent = formatAttDate(todayDateStr());

  const today = todayDateStr();
  const uid = user.id;

  // Synthetic worker object from auth user data
  const workerObj = findWorker(uid) || {
    id: uid,
    name: user.name || "Me",
    trade: user.trade || "",
    availability: user.availability || "available",
    grade: user.grade || "",
  };

  // Pre-fill from saved record for today
  const savedToday = attendanceRecords.find(
    (r) => r.workerId === uid && r.date === today,
  );
  if (savedToday && !todayAttendanceMap[uid]) {
    todayAttendanceMap[uid] = {
      status: savedToday.status,
      rating: savedToday.rating,
    };
  }

  container.innerHTML = workerSelfAttCard(workerObj, today);
  bindWorkerAttEvents(container, uid, workerObj);

  // Workers check in / report directly — the bulk submit button is supervisor-only.
  if (submitBtn) submitBtn.onclick = null;
  if (submitWrap) submitWrap.style.display = "none";

  // Relabel History → Timesheet for workers
  const histTitle = document.getElementById("attHistoryTitle");
  const histSub = document.getElementById("attHistorySub");
  if (histTitle) histTitle.textContent = "My Timesheet";
  if (histSub)
    histSub.textContent =
      "Full record of your attendance and performance ratings";

  renderWorkerTimesheet(uid, user, histEl);
}

function workerSelfAttCard(worker, today) {
  const stats = getWorkerStats(worker.id);
  const job = state.jobs.find((j) => j.assignedWorkerId === worker.id);
  const rec = attendanceRecords.find(
    (r) => r.workerId === worker.id && r.date === today,
  );

  const statsRow =
    stats.totalShifts > 0
      ? `
    <div class="wsa-stats-row">
      <span class="wsa-stat">
        <span class="wsa-stat-val" style="color:${stats.reliability >= 90 ? "var(--orange)" : stats.reliability >= 75 ? "var(--green-text)" : "var(--red-text)"}">${stats.reliability}%</span>
        Reliability
      </span>
      <span class="wsa-sep">·</span>
      <span class="wsa-stat"><span class="wsa-stat-val">${stats.punctuality ?? 100}%</span> Punctuality</span>
      ${stats.performance ? `<span class="wsa-sep">·</span><span class="wsa-stat"><span class="wsa-stat-val" style="color:var(--amber-text)">★ ${stats.performance}</span> Avg Rating</span>` : ""}
      <span class="wsa-sep">·</span>
      <span class="wsa-stat"><span class="wsa-stat-val">${stats.totalShifts}</span> Shift${stats.totalShifts !== 1 ? "s" : ""}</span>
    </div>`
      : "";

  // No job assigned — nothing to check in to.
  if (!job) {
    return `
    <article class="attendance-card wsa-card" id="att-card-${worker.id}">
      <div class="wsa-date-row"><span class="wsa-date-label">${formatAttDate(today)}</span></div>
      ${statsRow}
      <div class="wsa-empty">You're not assigned to a site today. Check-in opens once a job is booked.</div>
    </article>`;
  }

  const siteLine = `<div class="wsa-site">${escapeHtml(job.trade)} · <span style="color:var(--ink-2)">${escapeHtml(job.location)}</span></div>`;

  // Booking agreement must be active before check-in / attendance is available.
  if (!bookingAgreementActive(job)) {
    const agr = agreementForJob(job);
    return `
    <article class="attendance-card wsa-card" id="att-card-${worker.id}">
      <div class="wsa-date-row"><span class="wsa-date-label">${formatAttDate(today)}</span></div>
      ${siteLine}
      ${statsRow}
      <div class="wsa-locked">
        <span class="wsa-locked-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </span>
        <div>
          <div class="wsa-locked-title">Check-in locked</div>
          <div class="wsa-locked-sub">Accept your Job Agreement to activate this booking before checking in.</div>
        </div>
      </div>
      ${agr ? `<button class="wsa-checkin-btn" type="button" data-agr-open="${agr.id}">Review Job Agreement</button>` : ""}
    </article>`;
  }

  // Build the action / status block based on today's record.
  let body;
  if (rec && rec.supervisorConfirmed) {
    const cfg = ATT_CFG[rec.status] || ATT_CFG.notRequired;
    body = `
      <div class="wsa-state wsa-state--done" style="border-color:${cfg.border};background:${cfg.bg}">
        <span class="wsa-state-icon" style="color:${cfg.color}">${cfg.icon}</span>
        <div>
          <div class="wsa-state-title" style="color:${cfg.color}">${cfg.label}</div>
          <div class="wsa-state-sub">Confirmed by your supervisor</div>
        </div>
      </div>`;
  } else if (rec && rec.status === "checkedIn") {
    const t = rec.checkInTime
      ? new Date(rec.checkInTime).toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
    const sug = rec.suggestedStatus ? ATT_CFG[rec.suggestedStatus] : null;
    body = `
      <div class="wsa-state wsa-state--pending">
        <span class="wsa-state-icon">${ATT_CFG.checkedIn.icon}</span>
        <div>
          <div class="wsa-state-title">Checked in${t ? ` at ${t}` : ""}</div>
          <div class="wsa-state-sub">Pending supervisor approval${sug ? ` · suggested ${sug.label}` : ""}</div>
        </div>
      </div>`;
  } else if (rec && rec.status === "reportedIssue") {
    const ri = rec.lateReport || rec.reportedIssue || {};
    const detail = ri.estimatedArrivalTime || ri.expectedArrival
      ? `ETA ${escapeHtml(ri.estimatedArrivalTime || ri.expectedArrival)}`
      : "";
    body = `
      <div class="wsa-state wsa-state--issue">
        <span class="wsa-state-icon">${ATT_CFG.reportedIssue.icon}</span>
        <div>
          <div class="wsa-state-title">Running late: ${escapeHtml(ri.reason || "Issue")}</div>
          <div class="wsa-state-sub">${detail ? detail + " · " : ""}Pending supervisor review</div>
        </div>
      </div>
      <button class="wsa-report-btn" data-att-report="${worker.id}" type="button">Update late report</button>`;
  } else {
    body = `
      <button class="wsa-checkin-btn" data-att-scan="${worker.id}" type="button">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><line x1="14" y1="14" x2="14" y2="21"/><line x1="18" y1="14" x2="21" y2="14"/><line x1="18" y1="18" x2="21" y2="18"/></svg>
        Scan site QR to check in
      </button>
      <button class="wsa-report-btn" data-att-report="${worker.id}" type="button">Report running late</button>`;
  }

  return `
  <article class="attendance-card wsa-card" id="att-card-${worker.id}">
    <div class="wsa-date-row"><span class="wsa-date-label">${formatAttDate(today)}</span></div>
    ${siteLine}
    ${statsRow}
    ${body}
  </article>`;
}

function bindWorkerAttEvents(container, uid, workerObj) {
  const scanBtn = container.querySelector(`[data-att-scan="${uid}"]`);
  if (scanBtn)
    scanBtn.addEventListener("click", () => openWorkerQrScanner(uid, workerObj));
  const reportBtn = container.querySelector(`[data-att-report="${uid}"]`);
  if (reportBtn)
    reportBtn.addEventListener("click", () => openReportModal(uid, workerObj));
  bindAgreementOpeners(container);
}

function refreshWorkerAttCard(uid, workerObj) {
  const card = document.getElementById("att-card-" + uid);
  if (!card) return;
  const tmp = document.createElement("div");
  tmp.innerHTML = workerSelfAttCard(workerObj, todayDateStr());
  card.replaceWith(tmp.firstElementChild);
  bindWorkerAttEvents(
    document.getElementById("attendanceCards"),
    uid,
    workerObj,
  );
}

function closeWorkerQrScanner() {
  document.getElementById("workerQrScanModal")?.remove();
}

function openWorkerQrScanner(uid, workerObj) {
  closeWorkerQrScanner();
  const job = state.jobs.find((j) => j.assignedWorkerId === uid);
  const modal = document.createElement("div");
  modal.id = "workerQrScanModal";
  modal.className = "qr-scan-modal";
  modal.innerHTML = `
    <div class="qr-scan-sheet" role="dialog" aria-modal="true" aria-labelledby="qrScanTitle">
      <button class="qr-scan-close" type="button" aria-label="Close" data-qr-scan-close>&times;</button>
      <div class="qr-scan-kicker">Site Sign In</div>
      <h3 id="qrScanTitle" class="qr-scan-title">Scan Site QR</h3>
      <div class="qr-scan-frame" aria-hidden="true">
        <span class="qr-scan-corner qr-scan-corner--tl"></span>
        <span class="qr-scan-corner qr-scan-corner--tr"></span>
        <span class="qr-scan-corner qr-scan-corner--bl"></span>
        <span class="qr-scan-corner qr-scan-corner--br"></span>
        <span class="qr-scan-line"></span>
      </div>
      <div class="qr-scan-site">${job ? `${escapeHtml(job.trade)} · ${escapeHtml(job.location)}` : "No active site assigned"}</div>
      <p class="qr-scan-copy">Camera scanner-ready flow. This MVP validates today's active site QR token.</p>
      <div class="qr-scan-actions">
        <button class="secondary-btn" type="button" data-qr-scan-close>Cancel</button>
        <button class="primary-btn" type="button" data-qr-scan-use>Use Today's Site QR</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-qr-scan-close]").forEach((btn) =>
    btn.addEventListener("click", closeWorkerQrScanner),
  );
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeWorkerQrScanner();
  });
  modal.querySelector("[data-qr-scan-use]")?.addEventListener("click", async () => {
    await workerScanCheckIn(uid, workerObj);
    closeWorkerQrScanner();
  });
}

// camera-scanner-ready / future QR camera integration:
// validates today's active site token without opening a real camera yet.
async function workerScanCheckIn(uid, workerObj) {
  const today = todayDateStr();
  const job = state.jobs.find((j) => j.assignedWorkerId === uid);
  if (!job) {
    showToast("You're not assigned to a site today");
    return;
  }

  if (!bookingAgreementActive(job)) {
    showToast("Accept your Job Agreement before checking in");
    const agr = agreementForJob(job);
    if (agr) openAgreementModal(agr.id);
    return;
  }

  const code = activeSiteCode(job.id);
  if (!code) {
    showToast(
      "No active site QR yet — ask your supervisor to generate today's code",
    );
    return;
  }

  const scanMs = Date.now();
  const startMs = siteStartMs(code.startTime);
  const suggested = suggestStatusForScan(scanMs, startMs);
  let gps = null;
  let gpsDistance = null;
  try {
    gps = await getGPS();
    if (gps && job.sitePin?.lat != null && job.sitePin?.lng != null) {
      gpsDistance = haversine(gps.lat, gps.lng, job.sitePin.lat, job.sitePin.lng);
    }
  } catch (_) {
    gps = null;
  }
  const previous = attendanceRecords.find(
    (r) => r.workerId === uid && r.date === today,
  );
  const lateReport = previous?.lateReport
    ? {
        ...previous.lateReport,
        actualArrivalTime: new Date(scanMs).toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      }
    : null;

  const rec = {
    id: createId(),
    workerId: uid,
    jobId: job.id,
    companyId: job.companyId || "",
    companyName: job.companyName || "",
    jobTrade: job.trade || "",
    jobLocation: job.location || "",
    projectName: job.projectName || job.siteName || "",
    siteName: job.siteName || "",
    date: today,
    scanDate: today,
    status: "checkedIn",
    rating: 0,
    recordedAt: scanMs,
    selfReported: true,
    supervisorConfirmed: false,
    checkInTime: scanMs,
    suggestedStatus: suggested,
    expectedStartTime: code.startTime || jobExpectedStartTime(job),
    scanTime: new Date(scanMs).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    qrCodeId: code.id,
    qrDate: code.date,
    scanToken: code.token,
  };
  if (gps) {
    rec.gpsLat = gps.lat;
    rec.gpsLng = gps.lng;
    rec.gpsTimestamp = scanMs;
    if (gpsDistance != null) rec.gpsDistance = gpsDistance;
  }
  if (lateReport) {
    rec.lateReport = lateReport;
    rec.reportedIssue = previous.reportedIssue;
    upsertWorkerLateReport(uid, lateReport, today);
    saveState();
  }
  attendanceRecords = attendanceRecords.filter(
    (r) => !(r.workerId === uid && r.date === today),
  );
  attendanceRecords.unshift(rec);
  saveAttendanceRecords();

  logActivity(
    "attend",
    `<strong>${escapeHtml(workerObj.name)}</strong> scanned in at ${escapeHtml(job.location)} — pending approval`,
  );
  showToast("Checked in — pending supervisor approval");
  refreshWorkerAttCard(uid, workerObj);
}

// ─── Worker Timesheet ─────────────────────────────────────
function renderWorkerTimesheet(uid, user, histEl) {
  if (!histEl) return;

  const myRecs = attendanceRecords
    .filter((r) => r.workerId === uid)
    .sort((a, b) => b.date.localeCompare(a.date));

  const stats = getWorkerStats(uid);

  const tsHeader = document.querySelector("#tab-attendance .ts-header");

  if (!myRecs.length) {
    histEl.innerHTML = `<div class="att-empty">No attendance history yet — mark your first day above.</div>`;
    return;
  }

  const summaryBar = `
    <div class="ts-summary">
      <div class="ts-summary-item">
        <div class="ts-summary-val" style="color:${stats.reliability >= 90 ? "var(--orange)" : stats.reliability >= 75 ? "var(--green-text)" : "var(--red-text)"}">${stats.reliability ?? "—"}%</div>
        <div class="ts-summary-lbl">Reliability</div>
      </div>
      <div class="ts-summary-item">
        <div class="ts-summary-val">${stats.punctuality ?? "—"}%</div>
        <div class="ts-summary-lbl">Punctuality</div>
      </div>
      <div class="ts-summary-item">
        <div class="ts-summary-val">${stats.performance ? `★${stats.performance}` : "—"}</div>
        <div class="ts-summary-lbl">Avg Rating</div>
      </div>
      <div class="ts-summary-item">
        <div class="ts-summary-val">${stats.totalShifts}</div>
        <div class="ts-summary-lbl">Shifts</div>
      </div>
      <div class="ts-summary-item">
        <div class="ts-summary-val">${stats.noShow}</div>
        <div class="ts-summary-lbl">No Shows</div>
      </div>
    </div>`;

  const rows = myRecs
    .map((rec) => {
      const cfg = ATT_CFG[rec.status] || ATT_CFG.notRequired;
      const stars = rec.rating
        ? `<span class="ts-stars">${"★".repeat(rec.rating)}${"☆".repeat(5 - rec.rating)}</span>`
        : "";
      const job = state.jobs.find((j) => j.assignedWorkerId === uid);
      const site = job
        ? `<span class="ts-site">${escapeHtml(job.location)}</span>`
        : "";
      const gps = rec.gpsLat
        ? `<span class="ts-gps" title="GPS recorded">📍</span>`
        : "";
      const coMarked = !rec.selfReported;
      const source = coMarked
        ? `<span class="ts-co-badge">Company</span>`
        : `<span class="ts-self-badge">Self</span>`;

      // Dispute: only for company-marked late or no-show records
      const canDispute =
        coMarked && (rec.status === "late" || rec.status === "noShow");
      const disputed = rec.disputeStatus === "pending";
      const resolved = rec.disputeStatus === "resolved";
      const disputeEl = canDispute
        ? disputed
          ? `<span class="att-dispute-badge att-dispute-badge--pending ts-dispute-badge">⏳ Under Review</span>`
          : resolved
            ? `<span class="att-dispute-badge att-dispute-badge--resolved ts-dispute-badge">✓ Resolved</span>`
            : `<button class="ts-raise-dispute" data-dispute-record="${rec.id}" type="button">Raise Dispute</button>`
        : "";

      return `
      <div class="ts-row${canDispute && !disputed && !resolved ? " ts-row--co-neg" : ""}">
        <div class="ts-row-date">${formatAttDate(rec.date)}</div>
        <div class="ts-row-status">
          <span class="ts-status-dot" style="background:${cfg.bg};color:${cfg.color};border:1px solid ${cfg.border}">${cfg.icon}</span>
          <span class="ts-status-lbl" style="color:${cfg.color}">${cfg.label}</span>
        </div>
        <div class="ts-row-right">${site}${stars}${gps}${source}${disputeEl}</div>
      </div>`;
    })
    .join("");

  histEl.innerHTML = summaryBar + `<div class="ts-rows">${rows}</div>`;

  // Wire dispute buttons for workers
  histEl.querySelectorAll("[data-dispute-record]").forEach((btn) => {
    btn.addEventListener("click", () =>
      openDisputeModal(btn.dataset.disputeRecord),
    );
  });
}

// ─── Render Attendance Tab ─────────────────────────────────
function renderAttendance() {
  const container = document.getElementById("attendanceCards");
  const histEl = document.getElementById("attendanceHistory");
  const badge = document.getElementById("attTodayBadge");
  if (!container) return;

  const isAdmin = !getSessionUser();

  // Reset labels for company/admin (worker view may have changed these)
  const attTitle = document.querySelector("#tab-attendance .panel-title");
  const attSub = document.querySelector("#tab-attendance .panel-subtitle");
  if (attTitle)
    attTitle.textContent = isAdmin ? "Attendance" : "Site Attendance";
  if (attSub)
    attSub.textContent = isAdmin
      ? "Required daily — mark every worker's status before end of day"
      : "Confirm each worker's attendance — reliability updates only once you confirm";
  const histTitle = document.getElementById("attHistoryTitle");
  const histSub = document.getElementById("attHistorySub");
  if (histTitle) histTitle.textContent = "History";
  if (histSub) histSub.textContent = "Past attendance records by day";
  const submitBtn = document.getElementById("submitAttendanceBtn");
  const submitWrap = document.querySelector(".att-submit-wrap");
  if (submitWrap) submitWrap.style.display = "";
  if (submitBtn) {
    submitBtn.textContent = isAdmin
      ? "Submit Attendance"
      : "Confirm Attendance";
    submitBtn.onclick = null;
  }

  if (badge) badge.textContent = formatAttDate(todayDateStr());

  const today = todayDateStr();

  // Daily site QR generator (supervisor / admin)
  renderSiteQrPanel();

  // Pre-fill todayAttendanceMap from saved records (skip pure check-in /
  // reported-issue records so the supervisor still chooses a final status).
  attendanceRecords
    .filter((r) => r.date === today)
    .forEach((r) => {
      if (todayAttendanceMap[r.workerId]) return;
      if (r.lateReport?.supervisorDecision) {
        todayAttendanceMap[r.workerId] = {
          status:
            r.lateReport.supervisorDecision === "worker_did_not_arrive"
              ? "noShow"
              : "late",
          rating: r.rating || 0,
          lateSupervisorDecision: r.lateReport.supervisorDecision,
        };
        return;
      }
      if (
        r.status === "checkedIn" ||
        r.status === "reportedIssue" ||
        r.status === "unconfirmed"
      )
        return;
      todayAttendanceMap[r.workerId] = { status: r.status, rating: r.rating };
    });

  // Required banner — count workers without a company-marked record today
  const companyMarkedToday = new Set(
    attendanceRecords
      .filter((r) => r.date === today && !r.selfReported)
      .map((r) => r.workerId),
  );
  const unmarkedCount = state.workers.filter(
    (w) => !companyMarkedToday.has(w.id),
  ).length;
  const requiredBanner =
    state.workers.length > 0
      ? `
    <div class="att-required-banner ${unmarkedCount === 0 ? "att-req-complete" : "att-req-pending"}">
      ${
        unmarkedCount === 0
          ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
           All ${state.workers.length} workers marked for today`
          : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
           <strong>${unmarkedCount} worker${unmarkedCount !== 1 ? "s" : ""} not yet marked today</strong> — attendance is required daily`
      }
    </div>`
      : "";

  // Bulk-approve checked-in workers (apply each suggested status, then confirm)
  const checkedInToday = attendanceRecords.filter(
    (r) => r.date === today && r.status === "checkedIn",
  );
  const bulkBar = checkedInToday.length
    ? `
    <div class="att-bulk-bar">
      <span>${checkedInToday.length} worker${checkedInToday.length !== 1 ? "s" : ""} checked in awaiting confirmation</span>
      <button class="att-bulk-btn" id="bulkApproveBtn" type="button">Approve all checked-in</button>
    </div>`
    : "";

  container.innerHTML =
    (state.workers.length > 0 ? requiredBanner : "") +
    bulkBar +
    (state.workers.length
      ? state.workers.map((w) => attendanceCard(w, today)).join("")
      : emptyState("No workers in the roster. Add workers first."));
  if (state.workers.length) bindAttendanceEvents(container);

  const bulkBtn = document.getElementById("bulkApproveBtn");
  if (bulkBtn)
    bulkBtn.addEventListener("click", () => {
      checkedInToday.forEach((r) => {
        todayAttendanceMap[r.workerId] = {
          status: r.suggestedStatus || "onTime",
          rating: todayAttendanceMap[r.workerId]?.rating || 0,
        };
      });
      submitDayAttendance();
    });

  // Admin-only attendance review (full audit incl. exception counters)
  renderAdminAttendanceReview();

  // ── History ──
  const pastDates = [
    ...new Set(attendanceRecords.map((r) => r.date).filter((d) => d !== today)),
  ]
    .sort()
    .reverse()
    .slice(0, 7);

  if (!pastDates.length) {
    histEl.innerHTML = `<div class="att-empty">No history yet — submit today's attendance to start tracking.</div>`;
    return;
  }
  histEl.innerHTML = pastDates
    .map((date) => {
      const recs = attendanceRecords.filter((r) => r.date === date);
      const c = {
        on: recs.filter((r) => r.status === "onTime").length,
        late: recs.filter((r) => r.status === "late").length,
        ns: recs.filter((r) => r.status === "noShow").length,
      };
      return `
    <div class="att-history-group">
      <div class="att-history-header">
        <span class="att-history-date">${formatAttDate(date)}</span>
        <div class="att-history-counts">
          <span class="att-hc on-time">✓ ${c.on}</span>
          <span class="att-hc late">⏱ ${c.late}</span>
          <span class="att-hc no-show">✗ ${c.ns}</span>
        </div>
      </div>
      <div class="att-history-rows">
        ${recs
          .map((r) => {
            const w = findWorker(r.workerId);
            if (!w) return "";
            const cfg = ATT_CFG[r.status] || ATT_CFG.notRequired;
            const stars = r.rating
              ? "★".repeat(r.rating) + "☆".repeat(5 - r.rating)
              : "";
            const disputed = r.disputeStatus === "pending";
            const resolved = r.disputeStatus === "resolved";
            return `<div class="att-history-row ${disputed ? "att-hist-disputed" : ""}">
            <span class="att-history-dot" style="background:${cfg.bg};color:${cfg.color}">${cfg.icon}</span>
            <span class="att-history-worker">${escapeHtml(w.name)}</span>
            <span class="att-history-trade">${escapeHtml(w.trade)}</span>
            ${stars ? `<span class="att-stars">${stars}</span>` : ""}
            ${r.gpsLat ? `<span class="att-gps-badge" title="GPS recorded">📍</span>` : ""}
            ${
              disputed
                ? `<span class="att-dispute-badge att-dispute-badge--pending">⏳ Under Review</span>`
                : resolved
                  ? `<span class="att-dispute-badge att-dispute-badge--resolved">✓ Resolved</span>`
                  : r.status === "late" || r.status === "noShow"
                    ? `<button class="att-raise-dispute" data-dispute-record="${r.id}" type="button">Raise Dispute</button>`
                    : ""
            }
          </div>`;
          })
          .join("")}
      </div>
    </div>`;
    })
    .join("");

  // Wire dispute buttons
  histEl.querySelectorAll("[data-dispute-record]").forEach((btn) => {
    btn.addEventListener("click", () =>
      openDisputeModal(btn.dataset.disputeRecord),
    );
  });
}

// ─── Daily Site QR Panel (supervisor / admin) ─────────────
function renderSiteQrPanel() {
  const panel = document.getElementById("siteQrPanel");
  if (!panel) return;

  // Only jobs with an assigned worker are live sites that need check-in.
  const liveJobs = state.jobs.filter((j) => j.assignedWorkerId);
  if (!liveJobs.length) {
    panel.innerHTML = `
      <div class="qr-panel">
        <div class="qr-panel-head">
          <h3 class="qr-panel-title">Daily Site QR</h3>
        </div>
        <div class="qr-empty">Assign a worker to a job to generate a site check-in code.</div>
      </div>`;
    return;
  }

  if (!qrSelectedJobId || !liveJobs.some((j) => j.id === qrSelectedJobId)) {
    qrSelectedJobId = liveJobs[0].id;
  }
  const job = findJob(qrSelectedJobId);
  const code = activeSiteCode(qrSelectedJobId);

  const options = liveJobs
    .map(
      (j) =>
        `<option value="${j.id}" ${j.id === qrSelectedJobId ? "selected" : ""}>${escapeHtml(j.trade)} · ${escapeHtml(j.location)}</option>`,
    )
    .join("");

  let codeBlock;
  if (code) {
    const start = code.startTime || "08:00";
    const expiry = new Date(code.expiresAt).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
    codeBlock = `
      <div class="qr-display">
        ${renderQrGlyph(code.token)}
        <div class="qr-meta">
          <div class="qr-token">${escapeHtml(code.token)}</div>
          <div class="qr-meta-row"><span>Site</span><strong>${escapeHtml(job.trade)} · ${escapeHtml(job.location)}</strong></div>
          <div class="qr-meta-row"><span>Date</span><strong>${formatAttDate(code.date)}</strong></div>
          <div class="qr-meta-row"><span>Start</span><strong>${escapeHtml(start)}</strong></div>
          <div class="qr-meta-row"><span>Valid until</span><strong>${expiry}</strong></div>
        </div>
      </div>
      <button class="qr-gen-btn qr-gen-btn--ghost" id="qrGenBtn" type="button">Regenerate code</button>`;
  } else {
    codeBlock = `
      <div class="qr-empty">No active code for today. Generate one so assigned workers can check in.</div>
      <button class="qr-gen-btn" id="qrGenBtn" type="button">Generate today's QR</button>`;
  }

  panel.innerHTML = `
    <div class="qr-panel">
      <div class="qr-panel-head">
        <h3 class="qr-panel-title">Daily Site QR</h3>
        <span class="qr-panel-sub">Workers scan this to check in</span>
      </div>
      <label class="qr-job-label" for="qrJobSelect">Site</label>
      <select class="qr-job-select" id="qrJobSelect">${options}</select>
      ${codeBlock}
    </div>`;

  const sel = document.getElementById("qrJobSelect");
  if (sel)
    sel.addEventListener("change", () => {
      qrSelectedJobId = sel.value;
      renderSiteQrPanel();
    });
  const gen = document.getElementById("qrGenBtn");
  if (gen)
    gen.addEventListener("click", () => {
      generateSiteCode(qrSelectedJobId);
      showToast("Site QR generated for today");
      renderSiteQrPanel();
    });
}

// ─── Admin Attendance Review (full audit) ─────────────────
function renderAdminAttendanceReview() {
  const el = document.getElementById("adminAttReview");
  if (!el) return;
  // Admin (demo) only — supervisors don't see the cross-site audit.
  if (getSessionUser()) {
    el.innerHTML = "";
    return;
  }

  const today = todayDateStr();
  const recent = [...attendanceRecords]
    .sort((a, b) => (b.recordedAt || 0) - (a.recordedAt || 0))
    .slice(0, 40);

  if (!recent.length) {
    el.innerHTML = `
      <div class="adminrev">
        <div class="adminrev-head"><h3 class="adminrev-title">Attendance Review</h3></div>
        <div class="att-empty">No attendance records yet.</div>
      </div>`;
    return;
  }

  const rows = recent
    .map((r) => {
      const w = findWorker(r.workerId);
      if (!w) return "";
      const job = state.jobs.find((j) => j.assignedWorkerId === r.workerId);
      const cfg = ATT_CFG[r.status] || ATT_CFG.notRequired;
      const exc = getExceptionInfo(r.workerId);
      const scan = r.checkInTime
        ? new Date(r.checkInTime).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "—";
      const decision = r.supervisorConfirmed
        ? ATT_CFG[r.supervisorDecision]?.label || cfg.label
        : "Unconfirmed";
      const ri = r.reportedIssue
        ? escapeHtml(r.reportedIssue.reason || "Issue") +
          (r.reportedIssue.unableToAttend
            ? " · unable"
            : r.reportedIssue.expectedArrival
              ? ` · ETA ${escapeHtml(r.reportedIssue.expectedArrival)}`
              : "")
        : "—";
      const dispute =
        r.disputeStatus === "pending"
          ? "Under review"
          : r.disputeStatus === "resolved"
            ? "Resolved"
            : "—";
      const flagBadge =
        exc.flag === "review"
          ? `<span class="rev-flag rev-flag--review">Review required</span>`
          : exc.flag === "warning"
            ? `<span class="rev-flag rev-flag--warn">Warning</span>`
            : "";
      return `
      <div class="rev-row">
        <div class="rev-cell rev-worker">
          <strong>${escapeHtml(w.name)}</strong>
          <span class="rev-sub">${escapeHtml(w.trade)}${job ? ` · ${escapeHtml(job.location)}` : ""}</span>
        </div>
        <div class="rev-cell"><span class="rev-lbl">Date</span>${formatAttDate(r.date)}${r.date === today ? " · today" : ""}</div>
        <div class="rev-cell"><span class="rev-lbl">Status</span><span class="rev-dot" style="background:${cfg.bg};color:${cfg.color}">${cfg.icon}</span> ${cfg.label}</div>
        <div class="rev-cell"><span class="rev-lbl">Scan</span>${scan}</div>
        <div class="rev-cell"><span class="rev-lbl">Supervisor</span>${escapeHtml(decision)}</div>
        <div class="rev-cell"><span class="rev-lbl">Reported</span>${ri}</div>
        <div class="rev-cell"><span class="rev-lbl">Dispute</span>${dispute}</div>
        <div class="rev-cell rev-exc"><span class="rev-lbl">90-day exceptions</span>${exc.count} ${flagBadge}</div>
        ${
          (r.status === "late" || r.status === "noShow") &&
          r.disputeStatus === "pending"
            ? `<div class="rev-actions">
               <button class="rev-act rev-act--ok" data-rev-resolve="${r.id}" data-rev-res="rejected" type="button">Uphold</button>
               <button class="rev-act rev-act--warn" data-rev-resolve="${r.id}" data-rev-res="accepted_worker" type="button">Remove impact</button>
             </div>`
            : ""
        }
      </div>`;
    })
    .join("");

  el.innerHTML = `
    <div class="adminrev">
      <div class="adminrev-head">
        <h3 class="adminrev-title">Attendance Review</h3>
        <span class="adminrev-sub">Most recent ${recent.length} records · flags at 4+ (warning) and 7+ (review required)</span>
      </div>
      <div class="rev-rows">${rows}</div>
    </div>`;

  el.querySelectorAll("[data-rev-resolve]").forEach((btn) => {
    btn.addEventListener("click", () => {
      resolveDispute(btn.dataset.revResolve, btn.dataset.revRes);
    });
  });
}

// ─── Admin: Duplicate / Returning-Worker Review ───────────
function statusBadge(status) {
  const map = {
    active: { cls: "active", label: "Active" },
    deleted: { cls: "deleted", label: "Deleted" },
    suspended: { cls: "suspended", label: "Suspended" },
    under_review: { cls: "review", label: "Under review" },
  };
  const s = map[status] || map.active;
  return `<span class="dupe-status dupe-status--${s.cls}">${s.label}</span>`;
}

// ─── Admin Payments Console ───────────────────────────────
// Admin sees everything: company charge, worker pay and OnSite margin, plus
// controls to confirm invoice payment, release worker payouts, set payment
// terms and restrict/suspend/reinstate companies.
function renderAdminPayments(role) {
  const el = document.getElementById("paymentsContent");
  if (!el) return;
  if (role) {
    el.innerHTML = "";
    return;
  } // admin/demo only

  const invoices = [...(state.invoices || [])].sort((a, b) =>
    (b.weekStart || "").localeCompare(a.weekStart || ""),
  );

  // Platform totals.
  const totalCharge = invoices.reduce((s, i) => s + (i.totalCharge || 0), 0);
  const totalMargin = invoices.reduce((s, i) => s + (i.totalMargin || 0), 0);
  const overdueCount = invoices.filter(
    (i) => invoiceEffectiveStatus(i) === "overdue",
  ).length;
  const awaitingPayout = invoices.filter(
    (i) => i.status === "paid" && !i.workerPaymentsReleased,
  ).length;

  const summary = `
    <div class="pay-summary">
      <div class="pay-sum-card"><div class="pay-sum-val">${formatMoney(totalCharge)}</div><div class="pay-sum-lbl">Billed</div></div>
      <div class="pay-sum-card"><div class="pay-sum-val">${formatMoney(totalMargin)}</div><div class="pay-sum-lbl">OnSite Margin</div></div>
      <div class="pay-sum-card"><div class="pay-sum-val ${overdueCount ? "pay-red" : ""}">${overdueCount}</div><div class="pay-sum-lbl">Overdue</div></div>
      <div class="pay-sum-card"><div class="pay-sum-val ${awaitingPayout ? "pay-amber" : ""}">${awaitingPayout}</div><div class="pay-sum-lbl">Payouts Due</div></div>
    </div>`;

  // Company terms & restrictions controls.
  const companies = getCompaniesForBilling();
  const companyRows = companies.length
    ? companies
        .map((c) => {
          const b = getCompanyBilling(c.id);
          refreshCompanyRestrictions(c.id);
          const rel = computeCompanyPaymentReliability(c.id);
          const stateLabel = b.suspended
            ? `<span class="bill-status bill-status--red">Suspended</span>`
            : b.restricted
              ? `<span class="bill-status bill-status--amber">Restricted</span>`
              : `<span class="bill-status bill-status--green">Active</span>`;
          const termOpts = Object.entries(PAYMENT_TERMS)
            .map(
              ([k, t]) =>
                `<option value="${k}" ${b.paymentTerm === k ? "selected" : ""}>${t.label}${t.adminOnly ? " (admin)" : ""}</option>`,
            )
            .join("");
          return `<div class="pay-company">
      <div class="pay-company-head">
        <div class="pay-company-name">${escapeHtml(c.name)}</div>
        ${stateLabel}
      </div>
      <div class="pay-company-meta">Reliability: ${rel.score != null ? rel.score + "%" : "—"} · ${rel.overdue} overdue · ${rel.totalInvoices} invoice${rel.totalInvoices !== 1 ? "s" : ""}</div>
      <div class="pay-company-controls">
        <label class="pay-term-label">Terms
          <select class="pay-term-select" data-pay-term="${c.id}">${termOpts}</select>
        </label>
        <label class="pay-trusted-label"><input type="checkbox" data-pay-trusted="${c.id}" ${b.trusted ? "checked" : ""}/> Trusted</label>
        ${
          b.suspended || b.restricted
            ? `<button class="pay-btn pay-btn-green" type="button" data-pay-reinstate="${c.id}">Reinstate</button>`
            : `<button class="pay-btn pay-btn-amber" type="button" data-pay-restrict="${c.id}">Restrict</button>`
        }
        ${b.suspended ? "" : `<button class="pay-btn pay-btn-red" type="button" data-pay-suspend="${c.id}">Suspend</button>`}
      </div>
    </div>`;
        })
        .join("")
    : `<div class="att-empty">No companies with billing activity yet.</div>`;

  // Invoice list with worker-payout controls.
  const invRows = invoices.length
    ? invoices
        .map((inv) => {
          const st = invoiceEffectiveStatus(inv);
          const meta = INVOICE_STATUS[st] || INVOICE_STATUS.generated;
          const lineRows = (inv.lines || [])
            .map((line) => {
              const ws = workerPaymentStatusForLine(inv, line);
              const wmeta =
                WORKER_PAYMENT_STATUS[ws] ||
                WORKER_PAYMENT_STATUS.awaiting_funds;
              const canRelease =
                inv.status === "paid" && !line.workerPaid && !line.held;
              return `<div class="pay-line">
        <div class="pay-line-info">
          <div class="pay-line-name">${escapeHtml(line.workerName)} · ${escapeHtml(line.jobTrade || "")}</div>
          <div class="pay-line-sub">${line.days}d · pay ${formatMoney(line.workerPay)} · charge ${formatMoney(line.companyCharge)} · margin ${formatMoney(line.margin)}</div>
        </div>
        <span class="bill-status bill-status--${wmeta.tone}">${wmeta.label}</span>
        ${canRelease ? `<button class="pay-btn pay-btn-green" type="button" data-pay-release="${inv.id}::${line.workerId}::${line.jobId}">Release</button>` : ""}
      </div>`;
            })
            .join("");
          return `<div class="pay-invoice">
      <div class="pay-inv-head">
        <div class="pay-inv-co">${escapeHtml(inv.companyName)}</div>
        <span class="bill-status bill-status--${meta.tone}">${meta.label}</span>
      </div>
      <div class="pay-inv-meta">${formatDateOnly(inv.weekStart)} – ${formatDateOnly(inv.weekEnd)} · Due ${formatDateOnly(inv.dueDate)} · Charge ${formatMoney(inv.totalCharge)} · Margin ${formatMoney(inv.totalMargin)}</div>
      <div class="pay-lines">${lineRows}</div>
      <div class="pay-inv-actions">
        ${
          inv.status !== "paid"
            ? `<button class="pay-btn pay-btn-green" type="button" data-pay-confirm="${inv.id}">Confirm Payment Received</button>`
            : `<span class="pay-paid-note">Paid ${inv.paidAt ? formatDate(inv.paidAt) : ""}${inv.workerPaymentsReleased ? " · workers released" : ""}</span>`
        }
        ${
          inv.status === "paid" && !inv.workerPaymentsReleased
            ? `<button class="pay-btn pay-btn-amber" type="button" data-pay-release-all="${inv.id}">Release All Workers</button>`
            : ""
        }
      </div>
    </div>`;
        })
        .join("")
    : `<div class="att-empty">No invoices yet. They are raised weekly from approved attendance.</div>`;

  el.innerHTML = `
    ${summary}
    <div class="pay-section-title">Companies &amp; Payment Terms</div>
    <div class="pay-company-list">${companyRows}</div>
    <div class="pay-section-title">Invoices &amp; Worker Payouts</div>
    <div class="pay-invoice-list">${invRows}</div>
    <p class="pay-foot-note">Stripe-ready: payment confirmation is recorded manually here; connect Stripe to automate funds-received events. Workers are paid only after client funds are confirmed.</p>`;

  bindAdminPaymentEvents(el);
}

// Collect every company that has billing or invoice history, plus any
// registered company accounts, for the admin terms/restrictions panel.
function getCompaniesForBilling() {
  const map = new Map();
  (state.invoices || []).forEach((i) => {
    if (i.companyId) map.set(i.companyId, i.companyName || "Company");
  });
  Object.values(state.companyBilling || {}).forEach((b) => {
    if (b.companyId && !map.has(b.companyId))
      map.set(b.companyId, b.companyName || "Company");
  });
  if (typeof getUsers === "function") {
    try {
      getUsers()
        .filter((u) => u.type === "company")
        .forEach((u) => {
          if (!map.has(u.id))
            map.set(u.id, u.companyName || u.name || "Company");
        });
    } catch (_) {}
  }
  return [...map.entries()].map(([id, name]) => ({ id, name }));
}

function bindAdminPaymentEvents(el) {
  el.querySelectorAll("[data-pay-confirm]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const inv = (state.invoices || []).find(
        (i) => i.id === btn.dataset.payConfirm,
      );
      if (!inv) return;
      inv.status = "paid";
      inv.paidAt = new Date().toISOString();
      refreshCompanyRestrictions(inv.companyId);
      logActivity(
        "payment",
        `Payment received for <strong>${escapeHtml(inv.companyName)}</strong> invoice (${formatMoney(inv.totalCharge)})`,
      );
      saveAndRender();
      showToast("Payment confirmed — worker payouts unlocked");
    }),
  );

  el.querySelectorAll("[data-pay-release-all]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const inv = (state.invoices || []).find(
        (i) => i.id === btn.dataset.payReleaseAll,
      );
      if (!inv || inv.status !== "paid") return;
      inv.lines.forEach((l) => {
        if (!l.held) l.workerPaid = true;
      });
      inv.workerPaymentsReleased = inv.lines.every(
        (l) => l.workerPaid || l.held,
      );
      logActivity(
        "payment",
        `Worker payouts released for <strong>${escapeHtml(inv.companyName)}</strong> invoice`,
      );
      saveAndRender();
      showToast("Worker payouts released");
    }),
  );

  el.querySelectorAll("[data-pay-release]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const [invId, workerId, jobId] = btn.dataset.payRelease.split("::");
      const inv = (state.invoices || []).find((i) => i.id === invId);
      if (!inv || inv.status !== "paid") return;
      const line = inv.lines.find(
        (l) => l.workerId === workerId && l.jobId === jobId,
      );
      if (!line) return;
      line.workerPaid = true;
      inv.workerPaymentsReleased = inv.lines.every(
        (l) => l.workerPaid || l.held,
      );
      saveAndRender();
      showToast("Worker payment released");
    }),
  );

  el.querySelectorAll("[data-pay-term]").forEach((sel) =>
    sel.addEventListener("change", () => {
      const b = getCompanyBilling(sel.dataset.payTerm);
      b.paymentTerm = sel.value;
      saveAndRender();
      showToast("Payment terms updated");
    }),
  );

  el.querySelectorAll("[data-pay-trusted]").forEach((cb) =>
    cb.addEventListener("change", () => {
      const b = getCompanyBilling(cb.dataset.payTrusted);
      b.trusted = cb.checked;
      if (cb.checked && b.paymentTerm === "standard") b.paymentTerm = "trusted";
      saveAndRender();
      showToast(cb.checked ? "Marked as trusted" : "Trusted status removed");
    }),
  );

  el.querySelectorAll("[data-pay-restrict]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const b = getCompanyBilling(btn.dataset.payRestrict);
      b.manualRestriction = true;
      b.restricted = true;
      saveAndRender();
      showToast("Company restricted from posting & bookings");
    }),
  );

  el.querySelectorAll("[data-pay-suspend]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const b = getCompanyBilling(btn.dataset.paySuspend);
      b.suspended = true;
      b.restricted = true;
      saveAndRender();
      showToast("Company account suspended");
    }),
  );

  el.querySelectorAll("[data-pay-reinstate]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const id = btn.dataset.payReinstate;
      const b = getCompanyBilling(id);
      b.manualRestriction = false;
      b.suspended = false;
      b.restricted = false;
      // If invoices are still overdue, refreshCompanyRestrictions will re-flag.
      refreshCompanyRestrictions(id);
      saveAndRender();
      showToast(
        b.restricted
          ? "Cleared manual hold — overdue invoices still restrict this company"
          : "Company reinstated",
      );
    }),
  );
}

function renderAdminDuplicateReview() {
  const el = document.getElementById("adminDupeReview");
  if (!el) return;
  // Admin (demo) only — workers and companies never see identity records.
  if (getSessionUser()) {
    el.innerHTML = "";
    return;
  }

  const ids = getIdentities();
  const flagged = ids.filter((i) => i.flagged);
  const inactive = ids.filter(
    (i) =>
      !i.flagged &&
      (i.accountStatus === "deleted" ||
        i.accountStatus === "suspended" ||
        i.accountStatus === "under_review"),
  );

  if (!ids.length) {
    el.innerHTML = "";
    return;
  }

  const linkedCount = (id) =>
    1 + (id.previousUserAccountIds ? id.previousUserAccountIds.length : 0);

  const dupeCard = (id) => {
    const matched =
      id.matchedFields && id.matchedFields.length
        ? id.matchedFields
            .map((f) => `<span class="dupe-match">${escapeHtml(f)}</span>`)
            .join("")
        : `<span class="dupe-match">Identity details</span>`;
    // Other identity records that share a strong identifier — candidates to merge.
    const mergeCandidates = ids.filter(
      (o) =>
        o.workerIdentityId !== id.workerIdentityId &&
        ((id.utr && idNormDigits(o.utr) === idNormDigits(id.utr)) ||
          (id.cscsCard && idNormCard(o.cscsCard) === idNormCard(id.cscsCard)) ||
          (id.dateOfBirth &&
            o.dateOfBirth === id.dateOfBirth &&
            idNormName(o.fullLegalName) === idNormName(id.fullLegalName))),
    );
    const mergeBtns = mergeCandidates
      .map(
        (o) =>
          `<button class="dupe-btn dupe-btn--ghost" data-dupe-merge-keep="${id.workerIdentityId}" data-dupe-merge-from="${o.workerIdentityId}" type="button">Merge with ${escapeHtml(o.fullLegalName || "record")}</button>`,
      )
      .join("");
    return `
      <div class="dupe-card dupe-card--flag">
        <div class="dupe-card-head">
          <div>
            <div class="dupe-name">${escapeHtml(id.fullLegalName || "Unknown worker")}</div>
            <div class="dupe-flag-reason">${escapeHtml(id.flagReason || "Possible returning worker / duplicate account")}</div>
          </div>
          ${statusBadge(id.accountStatus)}
        </div>
        <div class="dupe-matched">${matched}</div>
        <div class="dupe-detail-grid">
          <div><span class="dupe-lbl">UTR</span>${maskTail(id.utr)}</div>
          <div><span class="dupe-lbl">CSCS/ECS</span>${id.cscsCard ? maskTail(id.cscsCard) : "—"}</div>
          <div><span class="dupe-lbl">DOB</span>${id.dateOfBirth ? "•• ••• " + escapeHtml(String(id.dateOfBirth).slice(0, 4)) : "—"}</div>
          <div><span class="dupe-lbl">Emails on file</span>${(id.emails || []).map(maskEmail).join(", ") || "—"}</div>
          <div><span class="dupe-lbl">Phones on file</span>${(id.phones || []).map((p) => maskTail(p, 3)).join(", ") || "—"}</div>
          <div><span class="dupe-lbl">Linked accounts</span>${linkedCount(id)}</div>
          <div><span class="dupe-lbl">Reliability kept</span>${id.reliabilityScore ?? "—"}%</div>
        </div>
        <div class="dupe-actions">
          <button class="dupe-btn dupe-btn--ok" data-dupe-confirm="${id.workerIdentityId}" type="button">Confirm same person</button>
          <button class="dupe-btn dupe-btn--warn" data-dupe-reject="${id.workerIdentityId}" type="button">Reject false match</button>
          ${mergeBtns}
        </div>
      </div>`;
  };

  const inactiveCard = (id) => `
    <div class="dupe-card">
      <div class="dupe-card-head">
        <div>
          <div class="dupe-name">${escapeHtml(id.fullLegalName || "Unknown worker")}</div>
          <div class="dupe-flag-reason">Reliability on file: ${id.reliabilityScore ?? "—"}% · ${linkedCount(id)} account(s) over time</div>
        </div>
        ${statusBadge(id.accountStatus)}
      </div>
      <div class="dupe-actions">
        <button class="dupe-btn dupe-btn--ok" data-dupe-reactivate="${id.workerIdentityId}" type="button">Reactivate / allow link</button>
      </div>
    </div>`;

  if (!flagged.length && !inactive.length) {
    el.innerHTML = `
      <div class="dupe-panel">
        <div class="dupe-panel-head">
          <h3 class="dupe-panel-title">Identity &amp; Duplicate Review</h3>
          <span class="dupe-panel-sub">${ids.length} identity record${ids.length !== 1 ? "s" : ""} on file · no duplicates flagged</span>
        </div>
        <p class="privacy-note">OnSite may retain limited identity and booking history after account deletion where necessary to prevent fraud, protect platform integrity, resolve disputes, and maintain accurate reliability records.</p>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="dupe-panel">
      <div class="dupe-panel-head">
        <h3 class="dupe-panel-title">Identity &amp; Duplicate Review</h3>
        <span class="dupe-panel-sub">${flagged.length} possible duplicate${flagged.length !== 1 ? "s" : ""} · ${inactive.length} deleted/suspended</span>
      </div>
      ${flagged.length ? `<div class="dupe-group-label">Possible returning workers / duplicate accounts</div>${flagged.map(dupeCard).join("")}` : ""}
      ${inactive.length ? `<div class="dupe-group-label">Deleted &amp; suspended identities</div>${inactive.map(inactiveCard).join("")}` : ""}
      <p class="privacy-note">OnSite may retain limited identity and booking history after account deletion where necessary to prevent fraud, protect platform integrity, resolve disputes, and maintain accurate reliability records.</p>
    </div>`;

  el.querySelectorAll("[data-dupe-confirm]").forEach((b) =>
    b.addEventListener("click", () =>
      confirmIdentityMatch(b.dataset.dupeConfirm),
    ),
  );
  el.querySelectorAll("[data-dupe-reject]").forEach((b) =>
    b.addEventListener("click", () =>
      rejectIdentityMatch(b.dataset.dupeReject),
    ),
  );
  el.querySelectorAll("[data-dupe-reactivate]").forEach((b) =>
    b.addEventListener("click", () =>
      reactivateIdentity(b.dataset.dupeReactivate),
    ),
  );
  el.querySelectorAll("[data-dupe-merge-keep]").forEach((b) =>
    b.addEventListener("click", () =>
      mergeIdentities(b.dataset.dupeMergeKeep, b.dataset.dupeMergeFrom),
    ),
  );
}

// ─── GPS & Geofence Helpers ───────────────────────────────
function getGPS() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { timeout: 10000, enableHighAccuracy: true },
    );
  });
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function gpsDistanceLabel(dist) {
  if (dist === null || dist === undefined) return "Location captured";
  const m = Math.round(dist);
  if (m <= 100)
    return `<span class="gps-strong">✓ ${m}m from site pin — within geofence</span>`;
  if (m <= 500)
    return `<span class="gps-warn">⚠ ${m}m from site — outside geofence</span>`;
  return `<span class="gps-far">${(dist / 1000).toFixed(1)}km from site</span>`;
}

// ─── Attendance Disputes ──────────────────────────────────
let currentDisputeRecordId = null;

function openDisputeModal(recordId) {
  currentDisputeRecordId = recordId;
  const rec = attendanceRecords.find((r) => r.id === recordId);
  if (!rec) return;
  const w = findWorker(rec.workerId);
  const cfg = ATT_CFG[rec.status] || ATT_CFG.notRequired;

  document.getElementById("disputeRecordSummary").innerHTML = `
    <div class="dispute-record-info">
      <div class="dispute-record-worker">${escapeHtml(w?.name || "Unknown worker")}</div>
      <div class="dispute-record-meta">
        <span style="color:${cfg.color};font-weight:700">${cfg.icon} ${cfg.label}</span>
        <span class="dispute-meta-sep">·</span>
        <span>${formatAttDate(rec.date)}</span>
      </div>
    </div>`;

  const gpsSec = document.getElementById("disputeGpsSection");
  if (rec.gpsLat) {
    const time = new Date(rec.gpsTimestamp).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
    gpsSec.innerHTML = `
      <div class="dispute-gps-evidence">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2"/></svg>
        <strong>GPS Evidence on file:</strong>
        ${gpsDistanceLabel(rec.gpsDistance)} — recorded at ${time}
      </div>`;
    gpsSec.classList.remove("hidden");
  } else {
    gpsSec.classList.add("hidden");
  }

  document.getElementById("disputeReason").value = "Incorrect No Show";
  document.getElementById("disputeComment").value = "";
  document.getElementById("evidenceFileInput").value = "";
  document.getElementById("evidencePreviewArea").innerHTML = "";

  document.getElementById("disputeModal").classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeDisputeModal() {
  document.getElementById("disputeModal")?.classList.add("hidden");
  document.body.style.overflow = "";
  currentDisputeRecordId = null;
}

async function submitDispute() {
  const rec = attendanceRecords.find((r) => r.id === currentDisputeRecordId);
  if (!rec) return;

  const btn = document.getElementById("submitDisputeBtn");
  const reason = document.getElementById("disputeReason").value;
  const comment = document.getElementById("disputeComment").value.trim();
  const files = document.getElementById("evidenceFileInput").files;

  btn.disabled = true;
  btn.textContent = "Submitting…";

  rec.disputeStatus = "pending";
  rec.disputeReason = reason;
  rec.disputeComment = comment;
  rec.disputeTimestamp = Date.now();

  if (files?.length) {
    rec.disputePhotos = [];
    for (const file of Array.from(files)) {
      if (file.type.startsWith("image/")) {
        try {
          rec.disputePhotos.push(await compressImage(file));
        } catch (_) {}
      }
    }
  }

  const w = findWorker(rec.workerId);
  logActivity(
    "attend",
    `Dispute raised by <strong>${escapeHtml(w?.name || "")}</strong>: ${escapeHtml(reason)}`,
  );

  saveAttendanceRecords();
  render();
  renderAttendance();
  closeDisputeModal();
  showToast("Dispute submitted — attendance frozen pending review");
}

// ─── Report Running Late (worker) ──────────────────────────
let currentReportWorkerId = null;

function syncReportEta() {
  const wrap = document.getElementById("reportEtaWrap");
  if (wrap) wrap.style.display = "";
}

function openReportModal(uid) {
  currentReportWorkerId = uid;
  const today = todayDateStr();
  const rec = attendanceRecords.find(
    (r) => r.workerId === uid && r.date === today,
  );
  const ri =
    rec && rec.lateReport ? rec.lateReport : {};

  const reasonSel = document.getElementById("reportReason");
  if (reasonSel && ri.reason) reasonSel.value = ri.reason;
  const eta = document.getElementById("reportEta");
  if (eta) eta.value = ri.estimatedArrivalTime || "";
  const note = document.getElementById("reportNote");
  if (note) note.value = ri.comment || "";
  syncReportEta();

  document.getElementById("reportModal")?.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeReportModal() {
  document.getElementById("reportModal")?.classList.add("hidden");
  document.body.style.overflow = "";
  currentReportWorkerId = null;
}

function submitReport() {
  const uid = currentReportWorkerId;
  if (!uid) return;
  const today = todayDateStr();
  const reason = document.getElementById("reportReason")?.value || "Other";
  const eta = document.getElementById("reportEta")?.value || "";
  const note = document.getElementById("reportNote")?.value.trim() || "";
  if (!eta) {
    showToast("Enter your estimated arrival time");
    return;
  }

  const job = state.jobs.find((j) => j.assignedWorkerId === uid);
  if (!job) {
    showToast("You're not assigned to a site today");
    return;
  }
  const expectedStartTime = jobExpectedStartTime(job);
  if (Date.now() >= siteStartMs(expectedStartTime)) {
    showToast("Late reports must be sent before your shift starts");
    return;
  }

  const previous = attendanceRecords.find(
    (r) => r.workerId === uid && r.date === today,
  );
  const lateReport = {
    id: previous?.lateReport?.id || createId(),
    type: "runningLate",
    reason: LATE_REPORT_REASONS.includes(reason) ? reason : "Other",
    estimatedArrivalTime: eta,
    comment: note,
    reportedAt: new Date().toISOString(),
    reportedBeforeShift: true,
    expectedStartTime,
    actualArrivalTime: previous?.lateReport?.actualArrivalTime || "",
    supervisorDecision: previous?.lateReport?.supervisorDecision || "",
    supervisorDecisionAt: previous?.lateReport?.supervisorDecisionAt || "",
    supervisorDecisionBy: previous?.lateReport?.supervisorDecisionBy || "",
    jobId: job.id,
    jobTrade: job.trade || "",
    jobLocation: job.location || "",
    companyId: job.companyId || "",
    attendanceManager: job.attendanceManager || null,
  };

  const rec = {
    id: previous?.id || createId(),
    workerId: uid,
    date: today,
    status: "reportedIssue",
    rating: 0,
    recordedAt: Date.now(),
    selfReported: true,
    supervisorConfirmed: false,
    jobId: job.id,
    companyId: job.companyId || "",
    companyName: job.companyName || "Company",
    jobTrade: job.trade || "",
    jobLocation: job.location || "",
    lateReport,
    reportedIssue: {
      reason: lateReport.reason,
      unableToAttend: false,
      expectedArrival: eta,
      note,
    },
  };
  if (previous?.checkInTime) rec.checkInTime = previous.checkInTime;
  if (previous?.suggestedStatus) rec.suggestedStatus = previous.suggestedStatus;
  if (previous?.scanToken) rec.scanToken = previous.scanToken;
  attendanceRecords = attendanceRecords.filter(
    (r) => !(r.workerId === uid && r.date === today),
  );
  attendanceRecords.unshift(rec);
  saveAttendanceRecords();

  const w = findWorker(uid);
  upsertWorkerLateReport(uid, lateReport, today);
  notifyLateReport(w, job, lateReport);
  saveState();
  logActivity(
    "attend",
    `<strong>${escapeHtml(w?.name || "Worker")}</strong> reported running late for ${escapeHtml(job.trade || "work")} in ${escapeHtml(job.location || "site")} (ETA ${escapeHtml(eta)})`,
  );

  closeReportModal();
  showToast("Report sent — your supervisor will review it");

  const sess = getSessionUser();
  if (sess && sess.id === uid) {
    const workerObj = findWorker(uid) || {
      id: uid,
      name: sess.name,
      trade: sess.trade,
    };
    refreshWorkerAttCard(uid, workerObj);
  } else {
    renderAttendance();
  }
}

function resolveDispute(recordId, resolution) {
  const rec = attendanceRecords.find((r) => r.id === recordId);
  if (!rec) return;
  const w = findWorker(rec.workerId);

  rec.disputeStatus = "resolved";
  rec.resolution = resolution;
  rec.resolvedAt = Date.now();

  if (resolution === "accepted_worker") {
    const statusMap = {
      "Incorrect No Show": "onTime",
      "Incorrect Late Mark": "onTime",
      "Site Cancellation": "siteCancelled",
      "Incorrect Hours Worked": "onTime",
    };
    const newStatus = statusMap[rec.disputeReason] || "onTime";
    rec.originalStatus = rec.status;
    rec.status = newStatus;
    rec.resolvedStatus = newStatus;
    logActivity(
      "attend",
      `Dispute accepted: <strong>${escapeHtml(w?.name || "")}</strong> record updated to ${ATT_CFG[newStatus]?.label}`,
    );
    showToast("Worker claim accepted — attendance record updated");
  } else {
    rec.resolvedStatus = rec.status;
    logActivity(
      "attend",
      `Dispute rejected: <strong>${escapeHtml(w?.name || "")}</strong> original record confirmed`,
    );
    showToast("Original record confirmed — dispute closed");
  }

  const worker = findWorker(rec.workerId);
  if (worker) {
    const stats = getWorkerStats(rec.workerId);
    if (stats.reliability !== null) worker.reliability = stats.reliability;
  }

  saveAttendanceRecords();
  saveState();
  render();
  renderAttendance();
}

// Evidence file preview
document
  .getElementById("evidenceFileInput")
  ?.addEventListener("change", (e) => {
    const preview = document.getElementById("evidencePreviewArea");
    if (!preview) return;
    const files = Array.from(e.target.files || []).filter((f) =>
      f.type.startsWith("image/"),
    );
    preview.innerHTML = files
      .map((f, i) => {
        const url = URL.createObjectURL(f);
        return `<img src="${url}" class="evidence-thumb" alt="Evidence ${i + 1}" data-lightbox-src="${url}" data-lightbox-label="Evidence" />`;
      })
      .join("");
  });

// ─── Init ─────────────────────────────────────────────────
render();
renderAttendance();

document
  .getElementById("submitAttendanceBtn")
  ?.addEventListener("click", submitDayAttendance);

// Add attend icon to activity log
ACTIVITY_ICONS.attend = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`;
