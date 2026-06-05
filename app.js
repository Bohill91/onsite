const STORAGE_KEY = "sitematch_v2";
const ACTIVITY_KEY = "sitematch_activity";

const AVATAR_COLORS = ["av-0", "av-1", "av-2", "av-3", "av-4", "av-5"];

function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[hash];
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}

function reliabilityTier(score) {
  if (score >= 90) return { cls: "badge-elite", label: "Elite" };
  if (score >= 75) return { cls: "badge-good",  label: "Good"  };
  if (score >= 55) return { cls: "badge-fair",  label: "Fair"  };
  return                  { cls: "badge-poor",  label: "Poor"  };
}

function reliabilityBadge(score, size = 48) {
  const r = (size / 2) - 4;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const tier = reliabilityTier(score);
  return `
    <div class="reliability-badge ${tier.cls}">
      <div class="badge-ring" style="width:${size}px;height:${size}px;">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
          <circle class="track" cx="${size/2}" cy="${size/2}" r="${r}"/>
          <circle class="fill" cx="${size/2}" cy="${size/2}" r="${r}"
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
    "badge-good":  "var(--green-text)",
    "badge-fair":  "var(--amber-text)",
    "badge-poor":  "var(--red-text)",
  };
  return `<span class="match-badge-mini" style="color:${colorMap[tier.cls]}">${score}/100</span>`;
}

function createId() {
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clampScore(value) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

function normalize(v) { return v.trim().toLowerCase(); }

// ─── Profile Completion ────────────────────────────────────
function calcWorkerCompletion(worker) {
  const checks = [
    !!worker.name,
    !!worker.trade,
    !!(worker.qualifications || (worker.certifications && worker.certifications.length)),
    !!worker.utr,
    !!worker.rightToWork,
    !!(worker.location || worker.grade || worker.yearsExp),
  ];
  return Math.round(checks.filter(Boolean).length / checks.length * 100);
}

function completionRingHTML(pct) {
  const size = 34;
  const r    = 13;
  const circ = 2 * Math.PI * r;
  const fill = (pct / 100) * circ;
  const color = pct >= 80 ? "var(--green-text)" : pct >= 50 ? "var(--amber-text)" : "var(--red-text)";
  return `<div class="completion-mini" title="Profile ${pct}% complete">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--border)" stroke-width="2.5"/>
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="2.5"
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
  if (daysLeft < 0)   return { cls: "cert-expired",  label: "Expired" };
  if (daysLeft <= 30) return { cls: "cert-expiring", label: `Exp in ${daysLeft}d` };
  return {
    cls:   "cert-valid",
    label: new Date(expiry).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
  };
}

function certChipsHTML(worker) {
  const certs = worker.certifications;
  if (certs && certs.length && typeof certs[0] === "object") {
    return certs.slice(0, 4).map(c => {
      const st = certExpiryStatus(c.expiry);
      return st
        ? `<span class="cert-chip ${st.cls}">${escapeHtml(c.name)}<span class="cert-exp-label">${st.label}</span></span>`
        : `<span class="qual-chip">${escapeHtml(c.name)}</span>`;
    }).join("");
  }
  if (certs && certs.length && typeof certs[0] === "string") {
    return certs.slice(0, 3).map(n => `<span class="qual-chip">${escapeHtml(n)}</span>`).join("");
  }
  return (worker.qualifications || "").split(",").map(q => q.trim()).filter(Boolean)
    .slice(0, 3).map(q => `<span class="qual-chip">${escapeHtml(q)}</span>`).join("");
}

function certExpiryWarnings(worker) {
  const certs = worker.certifications;
  if (!certs || !certs.length || typeof certs[0] !== "object") return "";
  const problems = certs.filter(c => {
    const st = certExpiryStatus(c.expiry);
    return st && (st.cls === "cert-expired" || st.cls === "cert-expiring");
  });
  if (!problems.length) return "";
  const expired  = problems.filter(c => certExpiryStatus(c.expiry).cls === "cert-expired");
  const expiring = problems.filter(c => certExpiryStatus(c.expiry).cls === "cert-expiring");
  const parts = [];
  if (expired.length)  parts.push(`<span class="doc-warn doc-warn--expired">${expired.length} cert${expired.length>1?"s":""} expired</span>`);
  if (expiring.length) parts.push(`<span class="doc-warn doc-warn--expiring">${expiring.length} expiring soon</span>`);
  return `<div class="worker-doc-warnings">${parts.join("")}</div>`;
}

function formatDate(value) {
  if (!value) return "No date set";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" })[c]);
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
  try { localStorage.setItem(ACTIVITY_KEY, JSON.stringify(activityLog.slice(0, 50))); } catch (_) {}
}

function logActivity(type, text) {
  activityLog.unshift({ type, text, ts: Date.now() });
  if (activityLog.length > 50) activityLog.pop();
  saveActivity();
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60)   return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "short" }).format(new Date(ts));
}

const ACTIVITY_ICONS = {
  assign:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  score:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  worker:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  job:     `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
  avail:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
};

function renderActivity() {
  const feed = document.querySelector("#activityFeed");
  if (!feed) return;
  if (!activityLog.length) {
    feed.innerHTML = `<div class="activity-empty">No activity yet — add workers or post jobs to get started.</div>`;
    return;
  }
  feed.innerHTML = activityLog.map(item => `
    <div class="activity-item">
      <div class="activity-dot dot-${item.type}">${ACTIVITY_ICONS[item.type] || ""}</div>
      <div class="activity-body">
        <div class="activity-text">${item.text}</div>
        <div class="activity-time">${timeAgo(item.ts)}</div>
      </div>
    </div>
  `).join("");
}

// ─── Demo Data ────────────────────────────────────────────
const demoData = {
  workers: [
    { id: createId(), name: "Sam Taylor",    trade: "Electrician", qualifications: "ECS, IPAF, 18th Edition", availability: "available",     reliability: 92 },
    { id: createId(), name: "Aisha Khan",    trade: "Labourer",    qualifications: "CSCS green card",         availability: "available",     reliability: 84 },
    { id: createId(), name: "Mark Evans",    trade: "Plumber",     qualifications: "JIB PMES, CSCS",          availability: "not available", reliability: 78 },
    { id: createId(), name: "Grace Miller",  trade: "Electrician", qualifications: "ECS, Testing & Inspection", availability: "available",   reliability: 88 },
    { id: createId(), name: "Liam Chen",     trade: "Carpenter",   qualifications: "CSCS, NVQ Level 2",       availability: "available",     reliability: 95 },
  ],
  jobs: [
    { id: createId(), trade: "Electrician", location: "Birmingham", start: new Date(Date.now() + 86400000).toISOString().slice(0, 16), duration: "3 days",  assignedWorkerId: "" },
    { id: createId(), trade: "Carpenter",   location: "Leeds",      start: new Date(Date.now() + 172800000).toISOString().slice(0, 16), duration: "5 days", assignedWorkerId: "" },
  ],
};

// ─── State ────────────────────────────────────────────────
let state = loadState();

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (_) {}
  return structuredClone(demoData);
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
}

function saveAndRender() {
  saveState();
  render();
}

// ─── DOM References ───────────────────────────────────────
const workerForm    = document.querySelector("#workerForm");
const jobForm       = document.querySelector("#jobForm");
const workersList   = document.querySelector("#workersList");
const workersEmpty  = document.querySelector("#workersEmpty");
const jobsList      = document.querySelector("#jobsList");
const matchResults  = document.querySelector("#matchResults");
const resetDemoBtn  = document.querySelector("#resetDemoBtn");
const workerCount   = document.querySelector("#workerCount");
const jobCount      = document.querySelector("#jobCount");
const workerSearch  = document.querySelector("#workerSearch");

let activeFilter = "all";

workerSearch.addEventListener("input", () => renderWorkers());

document.querySelectorAll(".filter-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".filter-chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    activeFilter = chip.dataset.filter;
    renderWorkers();
  });
});

// ─── Session User Helper ──────────────────────────────────
function getSessionUser() {
  try { return JSON.parse(localStorage.getItem("onsite_auth_v1")); } catch (_) { return null; }
}

// ─── Tab Routing ──────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll("[data-tab]").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach(panel =>
    panel.classList.toggle("active", panel.id === `tab-${tab}`));
}

function bindTabEvents() {
  document.querySelectorAll("[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}
bindTabEvents();

// ─── Nav Rebuild ──────────────────────────────────────────
const ORIG_TOP_NAV    = document.querySelector(".tab-nav").innerHTML;
const ORIG_BOTTOM_NAV = document.querySelector(".bottom-nav").innerHTML;
const ORIG_DASHBOARD  = document.getElementById("tab-dashboard").innerHTML;

const NAV_SM = {
  home:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  jobs:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
  bookings:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  profile:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  requests:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  workforce: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  account:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>`,
};

const NAV_LG = Object.fromEntries(
  Object.entries(NAV_SM).map(([k, v]) => [k, v.replace(/width="16" height="16"/g, 'width="22" height="22"')])
);

const WORKER_TABS = [
  { id: "dashboard",  icon: "home",     label: "Home"     },
  { id: "jobs",       icon: "jobs",     label: "Jobs"     },
  { id: "attendance", icon: "bookings", label: "Bookings" },
  { id: "profile",    icon: "profile",  label: "Profile"  },
];

const CONTRACTOR_TABS = [
  { id: "dashboard", icon: "home",      label: "Home"      },
  { id: "add",       icon: "requests",  label: "Requests"  },
  { id: "workers",   icon: "workforce", label: "Workforce" },
  { id: "account",   icon: "account",   label: "Account"   },
];

function rebuildNav(tabDefs, activeId) {
  const topNav    = document.querySelector(".tab-nav");
  const bottomNav = document.querySelector(".bottom-nav");
  if (!topNav || !bottomNav) return;
  topNav.innerHTML = tabDefs.map(t => `
    <button class="tab-btn${t.id === activeId ? " active" : ""}" data-tab="${t.id}" type="button">
      ${NAV_SM[t.icon] || ""}${t.label}
    </button>`).join("");
  bottomNav.innerHTML = tabDefs.map(t => `
    <button class="bottom-nav-btn${t.id === activeId ? " active" : ""}" data-tab="${t.id}" type="button">
      ${NAV_LG[t.icon] || ""}
      <span>${t.label}</span>
    </button>`).join("");
  bindTabEvents();
}

function restoreNav() {
  document.querySelector(".tab-nav").innerHTML    = ORIG_TOP_NAV;
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
    const jobsSub    = document.querySelector("#tab-jobs .panel-subtitle");
    if (jobsHeader) jobsHeader.textContent = "Available Jobs";
    if (jobsSub)    jobsSub.textContent    = "Open positions matching your trade";
    render();
    switchTab("dashboard");

  } else if (role === "company") {
    rebuildNav(CONTRACTOR_TABS, "dashboard");
    // Contractors: show job form only, hide worker form and toggle bar
    document.querySelector(".add-toggle")?.classList.add("hidden");
    document.querySelector("#formWorker")?.classList.add("hidden");
    document.querySelector("#formJob")?.classList.remove("hidden");
    // Update the add tab header for contractors
    const addTitle = document.querySelector("#tab-add .form-card-header h3");
    const addSub   = document.querySelector("#tab-add .form-card-header p");
    if (addTitle) addTitle.textContent = "Labour Request";
    if (addSub)   addSub.textContent   = "Post a new labour requirement";
    render();
    switchTab("dashboard");

  } else {
    // Admin / demo — restore original nav and dashboard
    restoreNav();
    document.getElementById("tab-dashboard").innerHTML = ORIG_DASHBOARD;
    const jobsHeader = document.querySelector("#tab-jobs .panel-title");
    const jobsSub    = document.querySelector("#tab-jobs .panel-subtitle");
    if (jobsHeader) jobsHeader.textContent = "Job Requests";
    if (jobsSub)    jobsSub.textContent    = "Contractor requests awaiting assignment";
    render();
    switchTab("dashboard");
  }
}

// ─── Worker Home ──────────────────────────────────────────
function renderWorkerHome(user) {
  const el = document.getElementById("tab-dashboard");
  if (!el) return;

  const stats       = getWorkerStats(user.id || "");
  const reliability = stats.totalShifts > 0 ? (stats.reliability ?? 100) : (user.reliability ?? 100);
  const pct         = calcWorkerCompletion(user);

  // Active booking
  const booking = state.jobs.find(j => j.assignedWorkerId === user.id);

  // Recommended jobs (trade-matched, up to 3)
  const trade = (user.trade || "").toLowerCase().trim();
  const recommended = [...state.jobs]
    .filter(j => !trade || normalize(j.trade) === trade)
    .sort((a, b) => (new Date(a.start || 0)) - (new Date(b.start || 0)))
    .slice(0, 3);

  // Greeting
  const hr = new Date().getHours();
  const greet = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";

  // Days worked this month
  const thisMonth = new Date().toISOString().slice(0, 7);
  const daysThisMonth = attendanceRecords.filter(r =>
    r.workerId === user.id && r.date.startsWith(thisMonth) &&
    (r.status === "onTime" || r.status === "late")).length;

  const activeBookingHtml = booking ? `
    <div class="wh-booking-card">
      <div class="wh-booking-label">Active Booking</div>
      <div class="wh-booking-trade">${escapeHtml(booking.trade)}</div>
      <div class="wh-booking-meta">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        ${escapeHtml(booking.location)}
        ${booking.start ? ` · ${new Date(booking.start).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}` : ""}
        ${booking.duration ? ` · ${escapeHtml(booking.duration)}` : ""}
        ${booking.payRate ? ` · <strong>${escapeHtml(booking.payRate)}</strong>` : ""}
      </div>
    </div>` : "";

  const recJobsHtml = recommended.length ? `
    <div class="wh-section-label">Recommended for You</div>
    ${recommended.map(job => {
      const daysUntil = job.start ? Math.ceil((new Date(job.start) - new Date()) / 86400000) : null;
      const urgency = daysUntil !== null
        ? daysUntil <= 0  ? `<span class="wjc-urgency urgency-now">Today</span>`
        : daysUntil === 1 ? `<span class="wjc-urgency urgency-soon">Tomorrow</span>`
        : daysUntil <= 7  ? `<span class="wjc-urgency urgency-soon">${daysUntil}d</span>`
        :                   `<span class="wjc-urgency urgency-later">${daysUntil}d</span>`
        : "";
      return `
      <div class="wh-rec-job" data-apply-home="${job.id}">
        <div class="wh-rec-left">
          <div class="wh-rec-trade">${escapeHtml(job.trade)}</div>
          <div class="wh-rec-loc">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            ${escapeHtml(job.location)}
            ${job.payRate ? ` · <strong>${escapeHtml(job.payRate)}</strong>` : ""}
          </div>
        </div>
        <div class="wh-rec-right">${urgency}<svg class="wh-rec-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></div>
      </div>`;
    }).join("")}
    <button class="wh-view-all" type="button" data-tab="jobs">View all jobs →</button>` : `
    <div class="wh-section-label">Recommended for You</div>
    <div class="att-empty">No open ${escapeHtml(user.trade || "jobs")} positions right now — check back soon.</div>`;

  el.innerHTML = `
    <div class="wh-greeting">${greet}, <strong>${escapeHtml((user.name || "").split(" ")[0])}</strong> 👋</div>
    <div class="wh-hero">
      <div class="wh-hero-left">
        ${reliabilityBadge(reliability, 72)}
        <div class="wh-avail-wrap">
          <button class="wh-avail-btn ${user.availability === "not available" ? "unavailable" : "available"}"
            id="whAvailBtn" type="button">
            <span class="wh-avail-dot"></span>
            ${user.availability === "not available" ? "Unavailable" : "Available"}
          </button>
          <div class="wh-avail-hint">Tap to toggle</div>
        </div>
      </div>
      <div class="wh-hero-stats">
        <div class="wh-stat-card">
          <div class="wh-stat-val">${stats.totalShifts}</div>
          <div class="wh-stat-lbl">Jobs Done</div>
        </div>
        <div class="wh-stat-card">
          <div class="wh-stat-val" style="color:${reliability>=90?"var(--orange)":reliability>=75?"var(--green-text)":"var(--red-text)"}">${reliability}%</div>
          <div class="wh-stat-lbl">Reliability</div>
        </div>
        <div class="wh-stat-card">
          <div class="wh-stat-val">${daysThisMonth}</div>
          <div class="wh-stat-lbl">Days This Month</div>
        </div>
      </div>
    </div>
    ${activeBookingHtml}
    ${recJobsHtml}`;

  // Availability toggle
  document.getElementById("whAvailBtn")?.addEventListener("click", () => {
    const users = JSON.parse(localStorage.getItem("onsite_users_v1") || "[]");
    const session = JSON.parse(localStorage.getItem("onsite_auth_v1") || "null");
    if (!session) return;
    session.availability = session.availability === "not available" ? "available" : "not available";
    localStorage.setItem("onsite_auth_v1", JSON.stringify(session));
    const idx = users.findIndex(u => u.id === session.id);
    if (idx !== -1) { users[idx].availability = session.availability; localStorage.setItem("onsite_users_v1", JSON.stringify(users)); }
    renderWorkerHome(session);
    showToast(`Status set to ${session.availability}`);
  });

  // Recommended job clicks → go to Jobs tab
  el.querySelectorAll("[data-apply-home]").forEach(row => {
    row.addEventListener("click", () => switchTab("jobs"));
  });
  el.querySelectorAll("[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

// ─── Worker Profile ───────────────────────────────────────
function renderWorkerProfile(user) {
  const el = document.getElementById("profileContent");
  if (!el) return;

  const stats = getWorkerStats(user.id || "");
  const reliability = stats.totalShifts > 0 ? (stats.reliability ?? 100) : (user.reliability ?? 100);
  const pct = calcWorkerCompletion(user);

  const certs = (user.certifications || []).map(c => {
    const expStatus = c.expiry ? certExpiryStatus(c.expiry) : "valid";
    return `<span class="cert-chip cert-chip--${expStatus}">${escapeHtml(c.name)}${c.expiry ? ` · ${c.expiry}` : ""}</span>`;
  }).join("");

  const fields = [
    { label: "Trade",          val: user.trade },
    { label: "Grade",          val: user.grade },
    { label: "Availability",   val: user.availability },
    { label: "UTR Number",     val: user.utr },
    { label: "Right to Work",  val: user.rightToWork ? "Provided" : null },
    { label: "Location",       val: user.location },
  ].filter(f => f.val).map(f => `
    <div class="prof-field">
      <div class="prof-field-label">${f.label}</div>
      <div class="prof-field-val">${escapeHtml(String(f.val))}</div>
    </div>`).join("");

  el.innerHTML = `
    <div class="prof-header">
      <div class="prof-avatar ${avatarColor(user.name || "U")}">${initials(user.name || "?")}</div>
      <div class="prof-id">
        <div class="prof-name">${escapeHtml(user.name || "")}</div>
        <div class="prof-trade">${escapeHtml(user.trade || "Trade not set")}${user.grade ? ` · ${escapeHtml(user.grade)}` : ""}</div>
        <div class="prof-verify ${user.verificationStatus || "incomplete"}">
          ${{ verified:"✓ Verified", pending:"Pending Review", incomplete:"Incomplete Profile" }[user.verificationStatus || "incomplete"]}
        </div>
      </div>
      <div class="prof-ring">
        ${reliabilityBadge(reliability, 56)}
        ${completionRingHTML(pct)}
      </div>
    </div>

    <div class="prof-section">
      <div class="prof-section-title">Profile Details</div>
      <div class="prof-fields">${fields}</div>
    </div>

    ${certs ? `<div class="prof-section">
      <div class="prof-section-title">Qualifications &amp; Certifications</div>
      <div class="prof-certs">${certs}</div>
    </div>` : ""}

    <div class="prof-section">
      <div class="prof-section-title">Reliability Stats</div>
      <div class="prof-stats-grid">
        <div class="prof-stat"><div class="prof-stat-val" style="color:${reliability>=90?"var(--orange)":reliability>=75?"var(--green-text)":"var(--red-text)"}">${reliability}%</div><div class="prof-stat-lbl">Reliability</div></div>
        <div class="prof-stat"><div class="prof-stat-val">${stats.totalShifts}</div><div class="prof-stat-lbl">Jobs Done</div></div>
        <div class="prof-stat"><div class="prof-stat-val">${stats.punctuality ?? "—"}%</div><div class="prof-stat-lbl">On-Time %</div></div>
        <div class="prof-stat"><div class="prof-stat-val">${stats.noShow}</div><div class="prof-stat-lbl">No Shows</div></div>
      </div>
    </div>`;
}

// ─── Contractor Home ──────────────────────────────────────
function renderContractorHome(user) {
  const el = document.getElementById("tab-dashboard");
  if (!el) return;

  const today = todayDateStr();
  const todayRecs = attendanceRecords.filter(r => r.date === today);
  const att = {
    on:   todayRecs.filter(r => r.status === "onTime").length,
    late: todayRecs.filter(r => r.status === "late").length,
    ns:   todayRecs.filter(r => r.status === "noShow").length,
  };

  const activeJobs = state.jobs.filter(j => !j.completed);
  const bookedWorkers = state.workers.filter(w =>
    state.jobs.some(j => j.assignedWorkerId === w.id));

  const bookedHtml = bookedWorkers.length ? bookedWorkers.slice(0, 5).map(w => {
    const job   = state.jobs.find(j => j.assignedWorkerId === w.id);
    const stats = getWorkerStats(w.id);
    const rel   = stats.totalShifts > 0 ? stats.reliability : w.reliability;
    return `<div class="ch-worker-row">
      <div class="worker-avatar ${avatarColor(w.name)}" style="width:34px;height:34px;font-size:0.78rem;flex-shrink:0">${initials(w.name)}</div>
      <div class="ch-wrow-info">
        <div class="ch-wrow-name">${escapeHtml(w.name)}</div>
        <div class="ch-wrow-meta">${escapeHtml(w.trade)}${job ? ` · ${escapeHtml(job.location)}` : ""}</div>
      </div>
      <div class="ch-wrow-rel" style="color:${rel>=90?"var(--orange)":rel>=75?"var(--green-text)":"var(--red-text)"};font-weight:800;font-size:0.82rem">${rel}%</div>
    </div>`;
  }).join("") : `<div class="att-empty">No workers currently assigned.</div>`;

  const reqHtml = activeJobs.length ? activeJobs.slice(0, 4).map(job => {
    const assigned = job.assignedWorkerId ? findWorker(job.assignedWorkerId) : null;
    return `<div class="ch-req-row">
      <div class="ch-req-trade">${escapeHtml(job.trade)}</div>
      <div class="ch-req-meta">
        ${escapeHtml(job.location)}
        ${job.start ? ` · ${new Date(job.start).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}` : ""}
        ${job.quantity && job.quantity > 1 ? ` · ${job.quantity} workers` : ""}
        ${job.payRate ? ` · ${escapeHtml(job.payRate)}` : ""}
      </div>
      <span class="ch-req-status ${assigned ? "status-assigned" : "status-open"}">${assigned ? `✓ ${escapeHtml(assigned.name)}` : "Open"}</span>
    </div>`;
  }).join("") : `<div class="att-empty">No active requests — use the Requests tab to post one.</div>`;

  const companyName = user.companyName || user.name || "Contractor";

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
    <div class="ch-section-label">Active Requests</div>
    <div class="ch-req-list">${reqHtml}</div>
    <div class="ch-section-label">Workforce On Site</div>
    <div class="ch-workers-list">${bookedHtml}</div>`;

  document.getElementById("chRequestBtn")?.addEventListener("click", () => switchTab("add"));
}

// ─── Contractor Account ───────────────────────────────────
function renderContractorAccount(user) {
  const el = document.getElementById("accountContent");
  if (!el) return;

  const ini = (user.name || "C").trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join("");
  el.innerHTML = `
    <div class="prof-header">
      <div class="prof-avatar ${avatarColor(user.name || "C")}">${ini}</div>
      <div class="prof-id">
        <div class="prof-name">${escapeHtml(user.companyName || user.name || "")}</div>
        <div class="prof-trade">Contractor Account</div>
        <span class="wsc-verify-badge verified">✓ Verified</span>
      </div>
    </div>
    <div class="prof-section">
      <div class="prof-section-title">Account Details</div>
      <div class="prof-fields">
        <div class="prof-field"><div class="prof-field-label">Contact Name</div><div class="prof-field-val">${escapeHtml(user.name || "—")}</div></div>
        <div class="prof-field"><div class="prof-field-label">Company</div><div class="prof-field-val">${escapeHtml(user.companyName || "—")}</div></div>
        <div class="prof-field"><div class="prof-field-label">Email</div><div class="prof-field-val">${escapeHtml(user.email || "—")}</div></div>
        <div class="prof-field"><div class="prof-field-label">Account Type</div><div class="prof-field-val">Contractor</div></div>
      </div>
    </div>
    <div class="prof-section">
      <div class="prof-section-title">Activity</div>
      <div class="prof-stats-grid">
        <div class="prof-stat"><div class="prof-stat-val">${state.jobs.length}</div><div class="prof-stat-lbl">Requests Posted</div></div>
        <div class="prof-stat"><div class="prof-stat-val">${state.jobs.filter(j=>j.assignedWorkerId).length}</div><div class="prof-stat-lbl">Workers Placed</div></div>
      </div>
    </div>
    <button class="ch-logout-btn" type="button" id="accLogoutBtn">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      Sign Out
    </button>`;

  document.getElementById("accLogoutBtn")?.addEventListener("click", () => {
    document.getElementById("logoutBtn")?.click();
  });
}

// ─── Worker Job Board ─────────────────────────────────────
function renderWorkerJobBoard(user) {
  const jobsList = document.getElementById("jobsList");
  if (!jobsList) return;

  const trade = (user?.trade || "").toLowerCase().trim();

  // Filter to only jobs matching this worker's trade, sorted by start date
  const sorted = [...state.jobs]
    .filter(job => !trade || normalize(job.trade) === trade)
    .sort((a, b) => (new Date(a.start || 0)) - (new Date(b.start || 0)));

  const stats  = getWorkerStats(user?.id || "");
  const reliability = stats.totalShifts > 0 ? stats.reliability : (user?.reliability ?? 100);
  const pct    = calcWorkerCompletion(user || {});
  const tier   = reliabilityTier(reliability);

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
              { verified: "✓ Verified", pending: "Pending Review", incomplete: "Incomplete Profile" }[user?.verificationStatus || "incomplete"]
            }</span>
          </div>
        </div>
      </div>
      <div class="wsc-right">
        ${reliabilityBadge(reliability, 44)}
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

  jobsList.innerHTML = statusCard + sorted.map(job => workerJobCard(job, user)).join("");

  jobsList.querySelectorAll("[data-apply-job]").forEach(btn => {
    btn.addEventListener("click", () => {
      btn.textContent = "✓ Interest Registered";
      btn.disabled = true;
      btn.classList.add("applied");
      showToast("Your interest has been registered — you'll be contacted shortly.");
    });
  });

  jobsList.querySelectorAll("[data-map-job]").forEach(btn => {
    btn.addEventListener("click", () => openSiteMap(btn.dataset.mapJob));
  });
}

function workerJobCard(job, user) {
  const hasPin  = job.sitePin && job.sitePin.lat !== null;
  const daysUntil = job.start
    ? Math.ceil((new Date(job.start) - new Date()) / 86400000)
    : null;

  const urgencyLabel = daysUntil !== null
    ? daysUntil <= 0   ? `<span class="wjc-urgency urgency-now">Starting today</span>`
    : daysUntil === 1  ? `<span class="wjc-urgency urgency-soon">Starting tomorrow</span>`
    : daysUntil <= 7   ? `<span class="wjc-urgency urgency-soon">Starting in ${daysUntil} days</span>`
    :                    `<span class="wjc-urgency urgency-later">In ${daysUntil} days</span>`
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
      ${job.start ? `<div class="wjc-detail-item">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        ${new Date(job.start).toLocaleDateString("en-GB", { weekday:"short", day:"numeric", month:"short", year:"numeric" })}
      </div>` : ""}
      ${job.duration ? `<div class="wjc-detail-item">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        ${escapeHtml(job.duration)}
      </div>` : ""}
      ${job.payRate ? `<div class="wjc-detail-item wjc-pay-rate">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        ${escapeHtml(job.payRate)}
      </div>` : ""}
      ${job.quantity && job.quantity > 1 ? `<div class="wjc-detail-item">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        ${job.quantity} workers needed
      </div>` : ""}
      ${job.requiredQualifications ? `<div class="wjc-detail-item">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        ${escapeHtml(job.requiredQualifications)}
      </div>` : ""}
    </div>
    ${job.arrivalInstructions ? `<div class="wjc-arrival">${escapeHtml(job.arrivalInstructions)}</div>` : ""}
    <div class="wjc-footer">
      <button class="wjc-apply-btn" type="button" data-apply-job="${job.id}">Register Interest</button>
      ${hasPin ? `<button class="wjc-map-btn" type="button" data-map-job="${job.id}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        View Site
      </button>` : ""}
    </div>
  </article>`;
}

// ─── Form Toggle (Add tab) ────────────────────────────────
document.querySelectorAll(".add-toggle-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".add-toggle-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelector("#formWorker").classList.toggle("hidden", btn.dataset.form !== "worker");
    document.querySelector("#formJob").classList.toggle("hidden", btn.dataset.form !== "job");
  });
});

// ─── Forms ────────────────────────────────────────────────
workerForm.addEventListener("submit", e => {
  e.preventDefault();
  const name  = document.querySelector("#workerName").value.trim();
  const trade = document.querySelector("#workerTrade").value.trim();
  const score = clampScore(document.querySelector("#workerReliability").value);
  state.workers.push({
    id: createId(),
    name,
    trade,
    qualifications:  document.querySelector("#workerQualifications").value.trim(),
    availability:    document.querySelector("#workerAvailability").value,
    reliability:     score,
  });
  logActivity("worker", `<strong>${escapeHtml(name)}</strong> added to roster as ${escapeHtml(trade)} (score ${score})`);
  workerForm.reset();
  document.querySelector("#workerReliability").value = 75;
  saveAndRender();
  showToast("Worker added to roster");
  switchTab("workers");
});

jobForm.addEventListener("submit", e => {
  e.preventDefault();
  const trade    = document.querySelector("#jobTrade").value.trim();
  const location = document.querySelector("#jobLocation").value.trim();
  const duration = document.querySelector("#jobDuration").value.trim();

  const quantity = Number(document.querySelector("#jobQuantity")?.value) || 1;
  const payRate  = document.querySelector("#jobPayRate")?.value.trim() || "";

  const job = {
    id: createId(),
    trade,
    location,
    start:      document.querySelector("#jobStart").value,
    duration,
    quantity,
    payRate,
    assignedWorkerId: "",
  };

  // Capture optional site location fields
  const siteAddr = document.querySelector("#jobSiteAddress")?.value.trim();
  if (siteAddr) job.siteAddress = siteAddr;
  if (currentJobPin.lat !== null) job.sitePin = { ...currentJobPin };
  const cName  = document.querySelector("#jobContactName")?.value.trim();
  const cPhone = document.querySelector("#jobContactPhone")?.value.trim();
  if (cName || cPhone) job.siteContact = { name: cName || "", phone: cPhone || "" };
  const arrival = document.querySelector("#jobArrivalInstructions")?.value.trim();
  if (arrival) job.arrivalInstructions = arrival;
  const parking = document.querySelector("#jobParking")?.value.trim();
  if (parking) job.parking = parking;
  const ppe = document.querySelector("#jobPpe")?.value.trim();
  if (ppe) job.ppe = ppe;
  const gate = document.querySelector("#jobGateAccess")?.value.trim();
  if (gate) job.gateAccess = gate;

  state.jobs.push(job);
  logActivity("job", `New job posted: <strong>${escapeHtml(trade)}</strong> in ${escapeHtml(location)}${duration ? ` · ${escapeHtml(duration)}` : ""}${job.sitePin ? " · 📍 Location pinned" : ""}`);
  jobForm.reset();

  // Capture photos
  const photos = {};
  ["gate", "entrance", "welfare"].forEach(k => { if (currentJobPhotos[k]) photos[k] = currentJobPhotos[k]; });
  if (Object.keys(photos).length) job.sitePhotos = photos;

  // Reset location section
  currentJobPin = { lat: null, lng: null };
  document.querySelector("#pinCoordsDisplay")?.classList.add("hidden");
  document.querySelector("#siteLocFields")?.classList.add("hidden");
  document.querySelector("#siteLocChevron").style.transform = "";
  if (pickerMarker) { pickerMarker.remove(); pickerMarker = null; }

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
    // Contractor's add tab: show job form only
    document.querySelector("#formWorker")?.classList.add("hidden");
    document.querySelector("#formJob")?.classList.remove("hidden");
  } else {
    renderStats();
    renderActivity();
    renderWorkers();
    renderJobs();
    renderMatches();
    renderAttendance();
  }
}

function renderStats() {
  const statsRow = document.querySelector("#statsRow");
  if (!statsRow) return;

  const total     = state.workers.length;
  const available = state.workers.filter(w => w.availability === "available").length;
  const open      = state.jobs.filter(j => !j.assignedWorkerId).length;
  const assigned  = state.jobs.filter(j =>  j.assignedWorkerId).length;
  const avgScore  = total
    ? Math.round(state.workers.reduce((s, w) => s + w.reliability, 0) / total)
    : 0;

  statsRow.innerHTML = `
    <div class="stat-card">
      <span class="stat-label">Total Workers</span>
      <span class="stat-value">${total}</span>
      <span class="stat-sub">Avg score ${avgScore}/100</span>
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
  const filtered = state.workers.filter(w => {
    const matchesSearch = !query ||
      w.name.toLowerCase().includes(query) ||
      w.trade.toLowerCase().includes(query) ||
      (w.qualifications || "").toLowerCase().includes(query);
    const matchesFilter =
      activeFilter === "all"       ? true :
      activeFilter === "available" ? w.availability === "available" :
      activeFilter === "elite"     ? w.reliability >= 90 :
      true;
    return matchesSearch && matchesFilter;
  });

  const hasAny = state.workers.length > 0;
  workersEmpty.style.display = (hasAny && filtered.length === 0) ? "block" : "none";
  workersList.innerHTML = !hasAny
    ? emptyState("No workers in the roster yet. Add one from the Add tab.")
    : filtered.map(workerCard).join("");

  workersList.querySelectorAll("[data-delete-worker]").forEach(btn => {
    btn.addEventListener("click", () => {
      const w = findWorker(btn.dataset.deleteWorker);
      if (!w) return;
      if (!confirm(`Remove ${w.name} from the roster?`)) return;
      logActivity("worker", `<strong>${escapeHtml(w.name)}</strong> removed from roster`);
      state.workers = state.workers.filter(x => x.id !== w.id);
      state.jobs.forEach(j => { if (j.assignedWorkerId === w.id) j.assignedWorkerId = ""; });
      saveAndRender();
      showToast(`${w.name} removed`);
    });
  });

  workersList.querySelectorAll("[data-worker-avail]").forEach(sel => {
    sel.addEventListener("change", () => {
      const w = findWorker(sel.dataset.workerAvail);
      w.availability = sel.value;
      logActivity("avail", `<strong>${escapeHtml(w.name)}</strong> marked as <em>${escapeHtml(sel.value)}</em>`);
      saveAndRender();
    });
  });

  workersList.querySelectorAll("[data-score-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      const w = findWorker(btn.dataset.workerId);
      const action = btn.dataset.scoreAction;
      const delta = { onTime: 5, late: -8, noShow: -15 }[action];
      const prev = w.reliability;
      w.reliability = clampScore(prev + delta);
      const labels = { onTime: "completed on time", late: "was late", noShow: "no-showed" };
      const sign   = delta > 0 ? `+${delta}` : `${delta}`;
      logActivity("score", `<strong>${escapeHtml(w.name)}</strong> ${labels[action]} — score ${prev} → ${w.reliability} (${sign})`);
      saveAndRender();
      showToast(action === "onTime" ? `+5 reliability for ${w.name}` : `Score updated for ${w.name}`);
    });
  });
}

function workerCard(worker) {
  const avCls     = avatarColor(worker.name);
  const statusCls = worker.availability === "available" ? "available" : "unavailable";
  const stats     = getWorkerStats(worker.id);
  const completion = calcWorkerCompletion(worker);

  const statsRow = stats.totalShifts > 0 ? `
    <div class="worker-att-stats">
      <span class="w-stat"><span style="color:${stats.reliability>=90?"var(--orange)":stats.reliability>=75?"var(--green-text)":"var(--red-text)"};font-weight:700">${stats.reliability}%</span> reliability</span>
      <span class="w-stat-sep">·</span>
      <span class="w-stat"><span style="font-weight:700">${stats.punctuality??100}%</span> punctuality</span>
      ${stats.performance ? `<span class="w-stat-sep">·</span><span class="w-stat"><span style="color:var(--amber);font-weight:700">★${stats.performance}</span></span>` : ""}
      <span class="w-stat-sep">·</span>
      <span class="w-stat">${stats.totalShifts} shift${stats.totalShifts!==1?"s":""}</span>
    </div>` : "";

  return `
  <article class="worker-card">
    <div class="worker-card-top">
      <div class="worker-avatar ${avCls}">${initials(worker.name)}</div>
      <div class="worker-info">
        <div class="worker-name">${escapeHtml(worker.name)}</div>
        <div class="worker-trade">${escapeHtml(worker.trade)}</div>
        <div class="worker-quals">
          <span class="status-pill ${statusCls}">${worker.availability}</span>
          ${certChipsHTML(worker)}
        </div>
      </div>
      <div class="worker-card-scores">
        ${reliabilityBadge(worker.reliability)}
        ${completionRingHTML(completion)}
      </div>
    </div>
    ${certExpiryWarnings(worker)}
    ${statsRow}
    <div class="worker-card-actions">
      <select class="worker-select" aria-label="Update availability" data-worker-avail="${worker.id}">
        <option value="available"     ${worker.availability === "available"     ? "selected" : ""}>Available</option>
        <option value="not available" ${worker.availability === "not available" ? "selected" : ""}>Not available</option>
      </select>
      <button class="score-action-btn on-time" type="button" data-score-action="onTime"  data-worker-id="${worker.id}">✓ On time</button>
      <button class="score-action-btn late"    type="button" data-score-action="late"    data-worker-id="${worker.id}">⚡ Late</button>
      <button class="score-action-btn no-show" type="button" data-score-action="noShow"  data-worker-id="${worker.id}">✕ No-show</button>
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

  jobsList.querySelectorAll("[data-delete-job]").forEach(btn => {
    btn.addEventListener("click", () => {
      const job = findJob(btn.dataset.deleteJob);
      if (!job) return;
      if (!confirm(`Remove the ${job.trade} job in ${job.location}?`)) return;
      logActivity("job", `Job removed: <strong>${escapeHtml(job.trade)}</strong> in ${escapeHtml(job.location)}`);
      state.jobs = state.jobs.filter(j => j.id !== job.id);
      saveAndRender();
      showToast("Job request removed");
    });
  });

  jobsList.querySelectorAll("[data-assign-job]").forEach(sel => {
    sel.addEventListener("change", () => {
      const job = findJob(sel.dataset.assignJob);
      job.assignedWorkerId = sel.value;
      if (sel.value) {
        const w = findWorker(sel.value);
        logActivity("assign", `<strong>${escapeHtml(w.name)}</strong> manually assigned to ${escapeHtml(job.trade)} in ${escapeHtml(job.location)}`);
        showToast("Worker assigned");
      }
      saveAndRender();
    });
  });

  jobsList.querySelectorAll("[data-map-job]").forEach(btn => {
    btn.addEventListener("click", () => openSiteMap(btn.dataset.mapJob));
  });
}

function jobCard(job) {
  const assigned = job.assignedWorkerId ? findWorker(job.assignedWorkerId) : null;
  const hasPin   = job.sitePin && job.sitePin.lat !== null;

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
          ${job.duration ? `<span class="job-detail-item">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${escapeHtml(job.duration)}
          </span>` : ""}
          ${hasPin ? `<span class="job-detail-item job-has-pin">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            Location pinned
          </span>` : ""}
        </div>
      </div>
      ${assigned
        ? `<span class="assigned-pill">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            ${escapeHtml(assigned.name)}
           </span>`
        : `<span class="unassigned-pill">Unassigned</span>`}
    </div>
    <div class="job-card-footer">
      ${hasPin ? `<button class="site-loc-view-btn" type="button" data-map-job="${job.id}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        Site Location
      </button>` : ""}
      <select class="job-assign-select" aria-label="Assign worker" data-assign-job="${job.id}">
        <option value="">Manual assignment…</option>
        ${state.workers.map(w =>
          `<option value="${w.id}" ${job.assignedWorkerId === w.id ? "selected" : ""}>
            ${escapeHtml(w.name)} (${escapeHtml(w.trade)}, ${w.reliability}/100)
          </option>`
        ).join("")}
      </select>
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

  matchResults.querySelectorAll("[data-auto-assign]").forEach(btn => {
    btn.addEventListener("click", () => {
      const job = findJob(btn.dataset.autoAssign);
      const [best] = getMatches(job);
      if (!best) return;
      job.assignedWorkerId = best.id;
      logActivity("assign", `<strong>${escapeHtml(best.name)}</strong> auto-assigned as best match for ${escapeHtml(job.trade)} in ${escapeHtml(job.location)} (score ${best.reliability})`);
      saveAndRender();
      showToast(`Assigned ${best.name} to job`);
    });
  });
}

function matchCard(job) {
  const matches = getMatches(job);
  const assigned = job.assignedWorkerId ? findWorker(job.assignedWorkerId) : null;

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
      ${matches.length ? `<button class="auto-assign-btn" type="button" data-auto-assign="${job.id}">⚡ Best match</button>` : ""}
    </div>
    <div class="match-workers-list">
      ${matches.length
        ? matches.slice(0, 5).map((w, i) => matchWorkerRow(w, i)).join("")
        : `<div class="empty-state" style="border:none;border-radius:0;">No available ${escapeHtml(job.trade.toLowerCase())}s found.</div>`}
    </div>
  </article>`;
}

function matchWorkerRow(worker, index) {
  const avCls    = avatarColor(worker.name);
  const rankCls  = index === 0 ? "rank-1" : "rank-other";
  const rel      = worker._reliability ?? worker.reliability;
  const punc     = worker._punctuality ?? 100;
  const puncColor = punc >= 90 ? "var(--green-text)" : punc >= 70 ? "var(--amber-text)" : "var(--red-text)";
  return `
  <div class="match-worker-row">
    <div class="match-rank ${rankCls}">${index + 1}</div>
    <div class="match-worker-avatar ${avCls}">${initials(worker.name)}</div>
    <div class="match-worker-info">
      <div class="match-worker-name">${index === 0 ? "⭐ " : ""}${escapeHtml(worker.name)}</div>
      <div class="match-worker-quals">${escapeHtml(worker.qualifications || worker.trade)}</div>
      <div class="match-worker-meta">
        <span class="match-meta-item">Reliability <b>${rel}%</b></span>
        <span class="match-meta-sep">·</span>
        <span class="match-meta-item" style="color:${puncColor}">Punctuality <b>${punc}%</b></span>
      </div>
    </div>
    ${miniBadge(worker._composite ?? worker.reliability)}
  </div>`;
}

// ─── Helpers ──────────────────────────────────────────────
function getMatches(job) {
  const jobQualList = (job.requiredQualifications || "")
    .split(",").map(q => q.trim().toLowerCase()).filter(Boolean);

  return state.workers
    .filter(w => normalize(w.trade) === normalize(job.trade) && w.availability === "available")
    .map(w => {
      const stats      = getWorkerStats(w.id);
      const reliability = stats.totalShifts > 0 ? stats.reliability : w.reliability;
      const punctuality = stats.punctuality ?? 100;

      // Qualification match: how many job-required quals does worker have?
      let qualBonus = 10; // neutral if no specific quals required
      if (jobQualList.length) {
        const workerQualStr = [
          w.qualifications || "",
          ...(w.certifications || []).map(c => (typeof c === "object" ? c.name : c)),
        ].join(" ").toLowerCase();
        const matched = jobQualList.filter(q => workerQualStr.includes(q)).length;
        qualBonus = Math.round((matched / jobQualList.length) * 20);
      }

      // Composite: 50% reliability + 30% punctuality + 20% qual bonus (normalised)
      const composite = Math.round(reliability * 0.5 + punctuality * 0.3 + qualBonus * 0.2 * 5);
      return { ...w, _reliability: reliability, _punctuality: punctuality, _qualBonus: qualBonus, _composite: composite };
    })
    .sort((a, b) => b._composite - a._composite);
}

function findWorker(id) { return state.workers.find(w => w.id === id); }
function findJob(id)    { return state.jobs.find(j => j.id === id);    }

// ─── Site Photo Upload ────────────────────────────────────
let currentJobPhotos = { gate: null, entrance: null, welfare: null };

const PHOTO_KEYS = [
  { key: "gate",     inputId: "photoGate",     prevId: "prvGate",     phId: "phGate"     },
  { key: "entrance", inputId: "photoEntrance", prevId: "prvEntrance", phId: "phEntrance" },
  { key: "welfare",  inputId: "photoWelfare",  prevId: "prvWelfare",  phId: "phWelfare"  },
];

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = e => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const MAX = 1200;
        let w = img.width, h = img.height;
        if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        try { resolve(canvas.toDataURL("image/jpeg", 0.75)); } catch (err) { reject(err); }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

PHOTO_KEYS.forEach(({ key, inputId, prevId, phId }) => {
  document.getElementById(inputId)?.addEventListener("change", async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      currentJobPhotos[key] = compressed;
      const card = e.target.closest(".photo-card");
      const prev = document.getElementById(prevId);
      const ph   = document.getElementById(phId);
      if (prev) { prev.src = compressed; prev.style.display = "block"; }
      if (ph)   { ph.style.display = "none"; }
      if (card) { card.classList.add("has-photo"); }
    } catch (_) { showToast("Photo upload failed — try a different image"); }
  });
});

function resetJobPhotos() {
  PHOTO_KEYS.forEach(({ key, inputId, prevId, phId }) => {
    const input = document.getElementById(inputId);
    const card  = input?.closest(".photo-card");
    const prev  = document.getElementById(prevId);
    const ph    = document.getElementById(phId);
    if (input) input.value = "";
    if (prev)  { prev.src = ""; prev.style.display = ""; }
    if (ph)    { ph.style.display = ""; }
    if (card)  card.classList.remove("has-photo");
  });
  currentJobPhotos = { gate: null, entrance: null, welfare: null };
}

// ─── Site Location & Map System ───────────────────────────
let pickerMap    = null;
let pickerMarker = null;
let siteViewMap  = null;
let siteViewMarker = null;
let currentJobPin  = { lat: null, lng: null };

const siteMapModal = document.getElementById("siteMapModal");

// ── Toggle location section in job form ────────────────────
document.getElementById("toggleSiteLocBtn")?.addEventListener("click", () => {
  const fields   = document.getElementById("siteLocFields");
  const chevron  = document.getElementById("siteLocChevron");
  const isOpen   = !fields.classList.contains("hidden");
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
  if (!addr) { showToast("Enter a site address first"); return; }
  const btn  = document.getElementById("geocodeBtn");
  btn.textContent = "Searching…";
  btn.disabled = true;
  try {
    const res  = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr)}&limit=1&countrycodes=gb`);
    const data = await res.json();
    if (data[0]) {
      const lat = parseFloat(data[0].lat), lng = parseFloat(data[0].lon);
      if (!pickerMap) initPickerMap();
      pickerMap.setView([lat, lng], 17);
      showToast("Map centred — click to drop exact entrance pin");
    } else { showToast("Address not found — place pin manually on the map"); }
  } catch (_) { showToast("Search failed — place pin manually on the map"); }
  btn.textContent = "Find on Map";
  btn.disabled = false;
});

function initPickerMap() {
  if (pickerMap) { pickerMap.invalidateSize(); return; }
  pickerMap = L.map("jobPickerMap", { zoomControl: true }).setView([52.4862, -1.8904], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(pickerMap);

  const pinIcon = L.divIcon({
    className: "",
    html: `<div class="site-drop-pin"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/></svg></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  });

  pickerMap.on("click", e => {
    const { lat, lng } = e.latlng;
    currentJobPin = { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) };
    if (pickerMarker) { pickerMarker.setLatLng(e.latlng); }
    else {
      pickerMarker = L.marker(e.latlng, { icon: pinIcon, draggable: true }).addTo(pickerMap);
      pickerMarker.on("dragend", ev => {
        const p = ev.target.getLatLng();
        currentJobPin = { lat: parseFloat(p.lat.toFixed(6)), lng: parseFloat(p.lng.toFixed(6)) };
        updatePinCoords();
      });
    }
    updatePinCoords();
  });
}

function updatePinCoords() {
  const el  = document.getElementById("pinCoordsDisplay");
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

  const { lat, lng } = job.sitePin;
  document.getElementById("siteMapJobName").textContent = `${job.trade} · ${job.location}`;

  // Navigation deep links
  document.getElementById("navGoogleMaps").href = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  document.getElementById("navAppleMaps").href  = `https://maps.apple.com/?daddr=${lat},${lng}`;
  document.getElementById("navWaze").href        = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;

  // Site info content
  document.getElementById("siteInfoPanel").innerHTML = buildSiteInfoHtml(job);

  // Photo strip
  const photoStrip  = document.getElementById("sitePhotoStrip");
  const photoLabels = { gate: "Gate", entrance: "Site Entrance", welfare: "Welfare Cabin" };
  const jobPhotos   = job.sitePhotos || {};
  const photoEntries = Object.entries(photoLabels).filter(([k]) => jobPhotos[k]);
  if (photoEntries.length) {
    photoStrip.innerHTML = photoEntries.map(([k, label]) => `
      <div class="strip-item" data-lightbox-src="${jobPhotos[k]}" data-lightbox-label="${escapeHtml(label)}">
        <img src="${jobPhotos[k]}" class="strip-img" alt="${escapeHtml(label)}" />
        <span class="strip-label">${escapeHtml(label)}</span>
        <span class="strip-hint">Tap to expand</span>
      </div>`).join("");
    photoStrip.classList.remove("hidden");
  } else {
    photoStrip.classList.add("hidden");
  }

  siteMapModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  // Init or update Leaflet map
  setTimeout(() => {
    if (!siteViewMap) {
      siteViewMap = L.map("siteLeafletMap", { zoomControl: true, attributionControl: false }).setView([lat, lng], 17);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© OpenStreetMap contributors', maxZoom: 19,
      }).addTo(siteViewMap);

      const viewIcon = L.divIcon({
        className: "",
        html: `<div class="site-view-pin"><svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/></svg></div>`,
        iconSize: [40, 40], iconAnchor: [20, 40],
      });
      siteViewMarker = L.marker([lat, lng], { icon: viewIcon }).addTo(siteViewMap);
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
siteMapModal?.addEventListener("click", e => { if (e.target === siteMapModal) closeSiteMap(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") { closeSiteMap(); closePhotoLightbox(); closeDisputeModal(); } });
document.getElementById("closeDisputeBtn")?.addEventListener("click", closeDisputeModal);
document.getElementById("disputeModal")?.addEventListener("click", e => { if (e.target === document.getElementById("disputeModal")) closeDisputeModal(); });
document.getElementById("submitDisputeBtn")?.addEventListener("click", submitDispute);

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
    lightboxEl.addEventListener("click", e => {
      if (e.target === lightboxEl || e.target.closest(".photo-lb-close")) closePhotoLightbox();
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

document.addEventListener("click", e => {
  const item = e.target.closest("[data-lightbox-src]");
  if (item) openPhotoLightbox(item.dataset.lightboxSrc, item.dataset.lightboxLabel);
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
    siteInfoRow('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>', "Address", job.siteAddress || job.location),
    job.siteContact?.name  ? siteInfoRow('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', "Site Contact", job.siteContact.name) : "",
    job.siteContact?.phone ? `
    <div class="site-info-row">
      <div class="site-info-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6 6l.96-1.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2z"/></svg>
      </div>
      <div class="site-info-content">
        <span class="site-info-label">Phone</span>
        <a class="site-info-value site-phone-link" href="tel:${escapeHtml(job.siteContact.phone)}">${escapeHtml(job.siteContact.phone)}</a>
      </div>
    </div>` : "",
    siteInfoRow('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>', "Arrival", job.arrivalInstructions),
    siteInfoRow('<rect x="5" y="3" width="14" height="18" rx="1"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/>', "Parking", job.parking),
    siteInfoRow('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>', "PPE Required", job.ppe),
    siteInfoRow('<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>', "Gate / Access", job.gateAccess),
  ].filter(Boolean).join("");

  return rows || `<p style="color:var(--ink-3);font-size:0.87rem;padding:8px 0;">No site details added.</p>`;
}

// ─── Attendance System ────────────────────────────────────
const ATTENDANCE_KEY = "onsite_attendance_v1";

let attendanceRecords  = loadAttendanceRecords();
let todayAttendanceMap = {}; // workerId -> { status, rating }

function loadAttendanceRecords() {
  try { const s = localStorage.getItem(ATTENDANCE_KEY); if (s) return JSON.parse(s); } catch (_) {}
  return [];
}
function saveAttendanceRecords() {
  try { localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(attendanceRecords)); } catch (_) {}
}
function todayDateStr() { return new Date().toISOString().split("T")[0]; }
function formatAttDate(d) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" })
    .format(new Date(d + "T00:00:00"));
}

const ATT_CFG = {
  onTime:        { icon: "✓", label: "On Time",      color: "var(--green-text)", bg: "rgba(22,163,74,0.12)",  border: "rgba(22,163,74,0.35)"  },
  late:          { icon: "⏱", label: "Late",         color: "var(--amber-text)", bg: "rgba(217,119,6,0.12)",  border: "rgba(217,119,6,0.35)"  },
  noShow:        { icon: "✗", label: "No Show",      color: "var(--red-text)",   bg: "rgba(220,38,38,0.1)",   border: "rgba(220,38,38,0.3)"   },
  notRequired:   { icon: "—", label: "Not Required", color: "var(--ink-3)",      bg: "var(--surface-3)",      border: "var(--border)"         },
  siteCancelled: { icon: "⊘", label: "Site Cancel",  color: "#6366f1",           bg: "rgba(99,102,241,0.08)", border: "rgba(99,102,241,0.25)" },
};

// ─── Worker Stats from Attendance Records ─────────────────
function getWorkerStats(workerId) {
  const recs      = attendanceRecords.filter(r => r.workerId === workerId);
  // Records under active dispute are frozen — don't apply penalty until resolved
  const scoreable = recs.filter(r => r.disputeStatus !== "pending");
  const countable = scoreable.filter(r => r.status !== "notRequired" && r.status !== "siteCancelled");
  const attended  = countable.filter(r => r.status === "onTime" || r.status === "late");
  const onTime    = countable.filter(r => r.status === "onTime");
  const ratings   = recs.filter(r => r.rating > 0).map(r => r.rating);
  const disputed  = recs.filter(r => r.disputeStatus === "pending").length;
  return {
    totalShifts: countable.length,
    attended:    attended.length,
    onTime:      onTime.length,
    late:        attended.length - onTime.length,
    noShow:      countable.length - attended.length,
    disputed,
    reliability: countable.length ? Math.round(attended.length / countable.length * 100) : null,
    punctuality: attended.length  ? Math.round(onTime.length   / attended.length  * 100) : null,
    performance: ratings.length   ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : null,
    ratingCount: ratings.length,
  };
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
    const job = state.jobs.find(j => j.assignedWorkerId === wid);
    if (!job?.sitePin) return;
    const dist = haversine(gps.lat, gps.lng, job.sitePin.lat, job.sitePin.lng);
    if (dist <= 300) {
      const w = findWorker(wid);
      conflicts.push(`${w?.name || wid} (GPS recorded ${Math.round(dist)}m from site pin)`);
    }
  });
  if (conflicts.length) {
    const ok = confirm(
      `⚠ Potential Attendance Conflict Detected\n\nGPS evidence suggests the following worker(s) may have been on site:\n\n${conflicts.join("\n")}\n\nContinue marking as No Show?`
    );
    if (!ok) return;
  }

  Object.entries(todayAttendanceMap).forEach(([wid, data]) => {
    if (!data.status) return;
    const rec = {
      id: createId(), workerId: wid, date: today,
      status: data.status, rating: data.rating || 0, recordedAt: Date.now(),
    };
    if (data.gps) {
      rec.gpsLat       = data.gps.lat;
      rec.gpsLng       = data.gps.lng;
      rec.gpsDistance  = data.gps.distance;
      rec.gpsTimestamp = data.gps.timestamp;
    }
    attendanceRecords = attendanceRecords.filter(r => !(r.workerId === wid && r.date === today));
    attendanceRecords.unshift(rec);
    const w = findWorker(wid);
    if (w) {
      const stats = getWorkerStats(wid);
      if (stats.reliability !== null) {
        const prev = w.reliability;
        w.reliability = stats.reliability;
        const lbl = { onTime: "on time", late: "late", noShow: "no-showed", notRequired: "not required", siteCancelled: "site cancelled" };
        logActivity("attend", `<strong>${escapeHtml(w.name)}</strong> marked ${lbl[data.status] || data.status}${w.reliability !== prev ? ` — reliability ${prev}% → ${w.reliability}%` : ""}${data.gps ? ` · GPS ${data.gps.distance !== null ? Math.round(data.gps.distance) + "m" : "recorded"}` : ""}`);
      }
    }
    count++;
  });
  if (!count) { showToast("No attendance marked yet"); return; }
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
  const job   = state.jobs.find(j => j.assignedWorkerId === worker.id);

  const statusBtns = Object.entries(ATT_CFG).map(([key, cfg]) => {
    const active = saved.status === key;
    const style  = active ? `background:${cfg.bg};border-color:${cfg.border};color:${cfg.color}` : "";
    return `<button class="att-btn${active ? " att-btn--active" : ""}" style="${style}"
      data-att-worker="${worker.id}" data-att-status="${key}" type="button">
      <span class="att-btn-icon">${cfg.icon}</span>
      <span class="att-btn-label">${cfg.label}</span>
    </button>`;
  }).join("");

  const showRating = saved.status === "onTime" || saved.status === "late";
  const ratingRow  = showRating ? `
    <div class="att-rating-row">
      <span class="att-rating-label">Rate performance:</span>
      ${[1,2,3,4,5].map(n => `<button class="att-star${(saved.rating||0)>=n?" att-star--filled":""}"
        data-att-worker="${worker.id}" data-att-star="${n}" type="button">★</button>`).join("")}
    </div>` : "";

  const statsRow = stats.totalShifts > 0 ? `
    <div class="att-worker-stats">
      <span class="att-stat"><span class="att-stat-val" style="color:${stats.reliability>=90?"var(--orange)":stats.reliability>=75?"var(--green-text)":"var(--red-text)"}">${stats.reliability}%</span> Reliability</span>
      <span class="att-sep">·</span>
      <span class="att-stat"><span class="att-stat-val">${stats.punctuality??100}%</span> Punctuality</span>
      ${stats.performance ? `<span class="att-sep">·</span><span class="att-stat"><span class="att-stat-val" style="color:var(--amber)">★${stats.performance}</span></span>` : ""}
      <span class="att-sep">·</span>
      <span class="att-stat">${stats.totalShifts} shift${stats.totalShifts!==1?"s":""}</span>
    </div>` : "";

  const savedStatus = saved.status ? `<span style="color:${ATT_CFG[saved.status]?.color};font-weight:600;">${ATT_CFG[saved.status]?.icon} ${ATT_CFG[saved.status]?.label}</span>` : '<span style="color:var(--ink-3)">Not recorded</span>';

  // GPS capture row — shown when a status is selected
  const showGps   = saved.status && saved.status !== "notRequired" && saved.status !== "siteCancelled";
  const gpsData   = saved.gps;
  const gpsRow    = showGps ? `
    <div class="att-gps-row" id="gps-${worker.id}">
      ${gpsData
        ? `<div class="gps-captured-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2"/></svg>
            ${gpsData.distance !== null ? gpsDistanceLabel(gpsData.distance) : "Location captured"}
           </div>`
        : `<button class="gps-capture-btn" data-gps-worker="${worker.id}" type="button">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2"/></svg>
            Record My Location
           </button>`}
    </div>` : "";

  return `
  <article class="attendance-card" id="att-card-${worker.id}">
    <div class="att-worker-row">
      <div class="worker-avatar ${avCls}" style="width:38px;height:38px;font-size:0.8rem;flex-shrink:0;">${initials(worker.name)}</div>
      <div class="att-worker-info">
        <div class="att-worker-name">${escapeHtml(worker.name)}</div>
        <div class="att-worker-sub">${escapeHtml(worker.trade)}${job ? ` · <span style="color:var(--ink-2)">${escapeHtml(job.location)}</span>` : ""} · ${savedStatus}</div>
      </div>
    </div>
    ${statsRow}
    <div class="att-status-btns">${statusBtns}</div>
    ${ratingRow}
    ${gpsRow}
  </article>`;
}

function bindAttendanceEvents(container) {
  container.querySelectorAll("[data-att-status]").forEach(btn => {
    btn.addEventListener("click", () => {
      const wid = btn.dataset.attWorker, status = btn.dataset.attStatus;
      if (!todayAttendanceMap[wid]) todayAttendanceMap[wid] = {};
      todayAttendanceMap[wid].status = (todayAttendanceMap[wid].status === status) ? null : status;
      if (status !== "onTime" && status !== "late") todayAttendanceMap[wid].rating = 0;
      refreshAttCard(wid);
    });
  });
  container.querySelectorAll("[data-att-star]").forEach(btn => {
    btn.addEventListener("click", () => {
      const wid = btn.dataset.attWorker, n = Number(btn.dataset.attStar);
      if (!todayAttendanceMap[wid]) todayAttendanceMap[wid] = {};
      todayAttendanceMap[wid].rating = (todayAttendanceMap[wid].rating === n) ? 0 : n;
      refreshAttCard(wid);
    });
  });
  container.querySelectorAll("[data-gps-worker]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const wid = btn.dataset.gpsWorker;
      btn.textContent = "Getting location…";
      btn.disabled = true;
      try {
        const { lat, lng } = await getGPS();
        const job  = state.jobs.find(j => j.assignedWorkerId === wid);
        const dist = job?.sitePin ? haversine(lat, lng, job.sitePin.lat, job.sitePin.lng) : null;
        if (!todayAttendanceMap[wid]) todayAttendanceMap[wid] = {};
        todayAttendanceMap[wid].gps = { lat, lng, distance: dist, timestamp: Date.now() };
        refreshAttCard(wid);
      } catch (_) {
        showToast("Location unavailable — enable location access in your browser");
        btn.textContent = "Record My Location";
        btn.disabled = false;
      }
    });
  });
}

function refreshAttCard(wid) {
  const card = document.getElementById("att-card-" + wid);
  const w    = findWorker(wid);
  if (!card || !w) return;
  const tmp = document.createElement("div");
  tmp.innerHTML = attendanceCard(w, todayDateStr());
  card.replaceWith(tmp.firstElementChild);
  bindAttendanceEvents(document.getElementById("attendanceCards"));
}

// ─── Worker Self-Attendance ────────────────────────────────
function renderWorkerAttendance(user) {
  const container  = document.getElementById("attendanceCards");
  const submitBtn  = document.getElementById("submitAttendanceBtn");
  const submitWrap = document.querySelector(".att-submit-wrap");
  const histEl     = document.getElementById("attendanceHistory");
  const badge      = document.getElementById("attTodayBadge");
  if (!container) return;

  // Restyle the attendance header for worker context
  const attTitle = document.querySelector("#tab-attendance .panel-title");
  const attSub   = document.querySelector("#tab-attendance .panel-subtitle");
  if (attTitle) attTitle.textContent = "My Attendance";
  if (attSub)   attSub.textContent   = "Mark your status for today — this feeds your timesheet";

  if (badge) badge.textContent = formatAttDate(todayDateStr());

  const today = todayDateStr();
  const uid   = user.id;

  // Synthetic worker object from auth user data
  const workerObj = findWorker(uid) || {
    id: uid, name: user.name || "Me", trade: user.trade || "",
    availability: user.availability || "available", grade: user.grade || "",
  };

  // Pre-fill from saved record for today
  const savedToday = attendanceRecords.find(r => r.workerId === uid && r.date === today);
  if (savedToday && !todayAttendanceMap[uid]) {
    todayAttendanceMap[uid] = { status: savedToday.status, rating: savedToday.rating };
  }

  container.innerHTML = workerSelfAttCard(workerObj, today);
  bindWorkerAttEvents(container, uid, workerObj);

  // Wire submit button to worker-specific handler
  if (submitBtn) {
    submitBtn.textContent = "Save Today's Attendance";
    if (submitWrap) submitWrap.style.display = "";
    submitBtn.onclick = (e) => {
      e.stopImmediatePropagation();
      submitWorkerAttendance(user, workerObj);
    };
  }

  // Relabel History → Timesheet for workers
  const histTitle = document.getElementById("attHistoryTitle");
  const histSub   = document.getElementById("attHistorySub");
  if (histTitle) histTitle.textContent = "My Timesheet";
  if (histSub)   histSub.textContent   = "Full record of your attendance and performance ratings";

  renderWorkerTimesheet(uid, user, histEl);
}

function workerSelfAttCard(worker, today) {
  const saved = todayAttendanceMap[worker.id] || {};
  const stats = getWorkerStats(worker.id);
  const savedStatus = saved.status;

  const statusBtns = Object.entries(ATT_CFG).map(([key, cfg]) => {
    const active = savedStatus === key;
    const style  = active ? `background:${cfg.bg};border-color:${cfg.border};color:${cfg.color}` : "";
    return `<button class="att-btn wsa-status-btn${active ? " att-btn--active" : ""}" style="${style}"
      data-att-worker="${worker.id}" data-att-status="${key}" type="button">
      <span class="att-btn-icon">${cfg.icon}</span>
      <span class="att-btn-label">${cfg.label}</span>
    </button>`;
  }).join("");

  const showRating = savedStatus === "onTime" || savedStatus === "late";
  const ratingRow  = showRating ? `
    <div class="att-rating-row wsa-rating">
      <span class="att-rating-label">Rate today's experience:</span>
      ${[1,2,3,4,5].map(n => `<button class="att-star${(saved.rating||0)>=n?" att-star--filled":""}"
        data-att-worker="${worker.id}" data-att-star="${n}" type="button">★</button>`).join("")}
    </div>` : "";

  const showGps = savedStatus && savedStatus !== "notRequired" && savedStatus !== "siteCancelled";
  const gpsData = saved.gps;
  const gpsRow  = showGps ? `
    <div class="att-gps-row" id="gps-${worker.id}">
      ${gpsData
        ? `<div class="gps-captured-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2"/></svg>
            ${gpsData.distance !== null ? gpsDistanceLabel(gpsData.distance) : "Location captured"}
           </div>`
        : `<button class="gps-capture-btn" data-gps-worker="${worker.id}" type="button">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2"/></svg>
            Record My Location
           </button>`}
    </div>` : "";

  const statsRow = stats.totalShifts > 0 ? `
    <div class="wsa-stats-row">
      <span class="wsa-stat">
        <span class="wsa-stat-val" style="color:${stats.reliability>=90?"var(--orange)":stats.reliability>=75?"var(--green-text)":"var(--red-text)"}">${stats.reliability}%</span>
        Reliability
      </span>
      <span class="wsa-sep">·</span>
      <span class="wsa-stat"><span class="wsa-stat-val">${stats.punctuality ?? 100}%</span> Punctuality</span>
      ${stats.performance ? `<span class="wsa-sep">·</span><span class="wsa-stat"><span class="wsa-stat-val" style="color:var(--amber-text)">★ ${stats.performance}</span> Avg Rating</span>` : ""}
      <span class="wsa-sep">·</span>
      <span class="wsa-stat"><span class="wsa-stat-val">${stats.totalShifts}</span> Shift${stats.totalShifts!==1?"s":""}</span>
    </div>` : "";

  const currentLabel = savedStatus
    ? `<span class="wsa-current-status" style="color:${ATT_CFG[savedStatus].color}">${ATT_CFG[savedStatus].icon} ${ATT_CFG[savedStatus].label}</span>`
    : `<span class="wsa-current-status" style="color:var(--ink-3)">Not recorded yet</span>`;

  return `
  <article class="attendance-card wsa-card" id="att-card-${worker.id}">
    <div class="wsa-date-row">
      <span class="wsa-date-label">${formatAttDate(today)}</span>
      ${currentLabel}
    </div>
    ${statsRow}
    <div class="att-status-btns wsa-btns">${statusBtns}</div>
    ${ratingRow}
    ${gpsRow}
  </article>`;
}

function bindWorkerAttEvents(container, uid, workerObj) {
  container.querySelectorAll("[data-att-status]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!todayAttendanceMap[uid]) todayAttendanceMap[uid] = {};
      const status = btn.dataset.attStatus;
      todayAttendanceMap[uid].status = todayAttendanceMap[uid].status === status ? null : status;
      if (status !== "onTime" && status !== "late") todayAttendanceMap[uid].rating = 0;
      refreshWorkerAttCard(uid, workerObj);
    });
  });
  container.querySelectorAll("[data-att-star]").forEach(btn => {
    btn.addEventListener("click", () => {
      const n = Number(btn.dataset.attStar);
      if (!todayAttendanceMap[uid]) todayAttendanceMap[uid] = {};
      todayAttendanceMap[uid].rating = todayAttendanceMap[uid].rating === n ? 0 : n;
      refreshWorkerAttCard(uid, workerObj);
    });
  });
  container.querySelectorAll("[data-gps-worker]").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.textContent = "Getting location…";
      btn.disabled = true;
      try {
        const { lat, lng } = await getGPS();
        const job  = state.jobs.find(j => j.assignedWorkerId === uid);
        const dist = job?.sitePin ? haversine(lat, lng, job.sitePin.lat, job.sitePin.lng) : null;
        if (!todayAttendanceMap[uid]) todayAttendanceMap[uid] = {};
        todayAttendanceMap[uid].gps = { lat, lng, distance: dist, timestamp: Date.now() };
        refreshWorkerAttCard(uid, workerObj);
      } catch (_) {
        showToast("Location unavailable — enable location access in your browser");
        btn.textContent = "Record My Location";
        btn.disabled = false;
      }
    });
  });
}

function refreshWorkerAttCard(uid, workerObj) {
  const card = document.getElementById("att-card-" + uid);
  if (!card) return;
  const tmp = document.createElement("div");
  tmp.innerHTML = workerSelfAttCard(workerObj, todayDateStr());
  card.replaceWith(tmp.firstElementChild);
  bindWorkerAttEvents(document.getElementById("attendanceCards"), uid, workerObj);
}

function submitWorkerAttendance(user, workerObj) {
  const today = todayDateStr();
  const uid   = user.id;
  const data  = todayAttendanceMap[uid];

  if (!data?.status) { showToast("Please select a status first"); return; }

  const rec = {
    id: createId(), workerId: uid, date: today,
    status: data.status, rating: data.rating || 0, recordedAt: Date.now(),
    selfReported: true,
  };
  if (data.gps) {
    rec.gpsLat = data.gps.lat; rec.gpsLng = data.gps.lng;
    rec.gpsDistance = data.gps.distance; rec.gpsTimestamp = data.gps.timestamp;
  }

  attendanceRecords = attendanceRecords.filter(r => !(r.workerId === uid && r.date === today));
  attendanceRecords.unshift(rec);
  saveAttendanceRecords();

  const lbl = { onTime:"on time", late:"late", noShow:"no-showed", notRequired:"not required", siteCancelled:"site cancelled" };
  logActivity("attend", `<strong>${escapeHtml(user.name)}</strong> checked in — ${lbl[data.status] || data.status}`);

  showToast(`Attendance saved — ${ATT_CFG[data.status].label}`);
  renderWorkerAttendance(user);
}

// ─── Worker Timesheet ─────────────────────────────────────
function renderWorkerTimesheet(uid, user, histEl) {
  if (!histEl) return;

  const myRecs = attendanceRecords
    .filter(r => r.workerId === uid)
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
        <div class="ts-summary-val" style="color:${stats.reliability>=90?"var(--orange)":stats.reliability>=75?"var(--green-text)":"var(--red-text)"}">${stats.reliability ?? "—"}%</div>
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

  const rows = myRecs.map(rec => {
    const cfg  = ATT_CFG[rec.status] || ATT_CFG.notRequired;
    const stars = rec.rating ? `<span class="ts-stars">${"★".repeat(rec.rating)}${"☆".repeat(5 - rec.rating)}</span>` : "";
    const job   = state.jobs.find(j => j.assignedWorkerId === uid);
    const site  = job ? `<span class="ts-site">${escapeHtml(job.location)}</span>` : "";
    const gps   = rec.gpsLat ? `<span class="ts-gps" title="GPS recorded">📍</span>` : "";
    const coMarked = !rec.selfReported;
    const source = coMarked ? `<span class="ts-co-badge">Company</span>` : `<span class="ts-self-badge">Self</span>`;

    // Dispute: only for company-marked late or no-show records
    const canDispute = coMarked && (rec.status === "late" || rec.status === "noShow");
    const disputed   = rec.disputeStatus === "pending";
    const resolved   = rec.disputeStatus === "resolved";
    const disputeEl  = canDispute
      ? disputed  ? `<span class="att-dispute-badge att-dispute-badge--pending ts-dispute-badge">⏳ Under Review</span>`
      : resolved  ? `<span class="att-dispute-badge att-dispute-badge--resolved ts-dispute-badge">✓ Resolved</span>`
      :             `<button class="ts-raise-dispute" data-dispute-record="${rec.id}" type="button">Raise Dispute</button>`
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
  }).join("");

  histEl.innerHTML = summaryBar + `<div class="ts-rows">${rows}</div>`;

  // Wire dispute buttons for workers
  histEl.querySelectorAll("[data-dispute-record]").forEach(btn => {
    btn.addEventListener("click", () => openDisputeModal(btn.dataset.disputeRecord));
  });
}

// ─── Render Attendance Tab ─────────────────────────────────
function renderAttendance() {
  const container = document.getElementById("attendanceCards");
  const histEl    = document.getElementById("attendanceHistory");
  const badge     = document.getElementById("attTodayBadge");
  if (!container) return;

  // Reset labels for company/admin (worker view may have changed these)
  const attTitle = document.querySelector("#tab-attendance .panel-title");
  const attSub   = document.querySelector("#tab-attendance .panel-subtitle");
  if (attTitle) attTitle.textContent = "Attendance";
  if (attSub)   attSub.textContent   = "Required daily — mark every worker's status before end of day";
  const histTitle = document.getElementById("attHistoryTitle");
  const histSub   = document.getElementById("attHistorySub");
  if (histTitle) histTitle.textContent = "History";
  if (histSub)   histSub.textContent   = "Past attendance records by day";
  const submitBtn = document.getElementById("submitAttendanceBtn");
  if (submitBtn) { submitBtn.textContent = "Submit Attendance"; submitBtn.onclick = null; }

  if (badge) badge.textContent = formatAttDate(todayDateStr());

  const today = todayDateStr();
  // Pre-fill todayAttendanceMap from saved records if not yet set
  attendanceRecords.filter(r => r.date === today).forEach(r => {
    if (!todayAttendanceMap[r.workerId]) todayAttendanceMap[r.workerId] = { status: r.status, rating: r.rating };
  });

  // Required banner — count workers without a company-marked record today
  const companyMarkedToday = new Set(
    attendanceRecords.filter(r => r.date === today && !r.selfReported).map(r => r.workerId)
  );
  const unmarkedCount = state.workers.filter(w => !companyMarkedToday.has(w.id)).length;
  const requiredBanner = state.workers.length > 0 ? `
    <div class="att-required-banner ${unmarkedCount === 0 ? "att-req-complete" : "att-req-pending"}">
      ${unmarkedCount === 0
        ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
           All ${state.workers.length} workers marked for today`
        : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
           <strong>${unmarkedCount} worker${unmarkedCount !== 1 ? "s" : ""} not yet marked today</strong> — attendance is required daily`}
    </div>` : "";

  container.innerHTML = (state.workers.length > 0 ? requiredBanner : "") +
    (state.workers.length
      ? state.workers.map(w => attendanceCard(w, today)).join("")
      : emptyState("No workers in the roster. Add workers first."));
  if (state.workers.length) bindAttendanceEvents(container);

  // ── History ──
  const pastDates = [...new Set(attendanceRecords.map(r => r.date).filter(d => d !== today))]
    .sort().reverse().slice(0, 7);

  if (!pastDates.length) {
    histEl.innerHTML = `<div class="att-empty">No history yet — submit today's attendance to start tracking.</div>`;
    return;
  }
  histEl.innerHTML = pastDates.map(date => {
    const recs = attendanceRecords.filter(r => r.date === date);
    const c = { on: recs.filter(r=>r.status==="onTime").length, late: recs.filter(r=>r.status==="late").length, ns: recs.filter(r=>r.status==="noShow").length };
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
        ${recs.map(r => {
          const w = findWorker(r.workerId); if (!w) return "";
          const cfg = ATT_CFG[r.status] || ATT_CFG.notRequired;
          const stars = r.rating ? "★".repeat(r.rating) + "☆".repeat(5-r.rating) : "";
          const disputed = r.disputeStatus === "pending";
          const resolved = r.disputeStatus === "resolved";
          return `<div class="att-history-row ${disputed ? "att-hist-disputed" : ""}">
            <span class="att-history-dot" style="background:${cfg.bg};color:${cfg.color}">${cfg.icon}</span>
            <span class="att-history-worker">${escapeHtml(w.name)}</span>
            <span class="att-history-trade">${escapeHtml(w.trade)}</span>
            ${stars ? `<span class="att-stars">${stars}</span>` : ""}
            ${r.gpsLat ? `<span class="att-gps-badge" title="GPS recorded">📍</span>` : ""}
            ${disputed ? `<span class="att-dispute-badge att-dispute-badge--pending">⏳ Under Review</span>`
              : resolved ? `<span class="att-dispute-badge att-dispute-badge--resolved">✓ Resolved</span>`
              : (r.status === "late" || r.status === "noShow")
                ? `<button class="att-raise-dispute" data-dispute-record="${r.id}" type="button">Raise Dispute</button>`
                : ""}
          </div>`;
        }).join("")}
      </div>
    </div>`;
  }).join("");

  // Wire dispute buttons
  histEl.querySelectorAll("[data-dispute-record]").forEach(btn => {
    btn.addEventListener("click", () => openDisputeModal(btn.dataset.disputeRecord));
  });

}

// ─── GPS & Geofence Helpers ───────────────────────────────
function getGPS() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("Geolocation not supported")); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => reject(err),
      { timeout: 10000, enableHighAccuracy: true }
    );
  });
}

function haversine(lat1, lng1, lat2, lng2) {
  const R    = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function gpsDistanceLabel(dist) {
  if (dist === null || dist === undefined) return "Location captured";
  const m = Math.round(dist);
  if (m <= 100)  return `<span class="gps-strong">✓ ${m}m from site pin — within geofence</span>`;
  if (m <= 500)  return `<span class="gps-warn">⚠ ${m}m from site — outside geofence</span>`;
  return `<span class="gps-far">${(dist / 1000).toFixed(1)}km from site</span>`;
}

// ─── Attendance Disputes ──────────────────────────────────
let currentDisputeRecordId = null;

function openDisputeModal(recordId) {
  currentDisputeRecordId = recordId;
  const rec = attendanceRecords.find(r => r.id === recordId);
  if (!rec) return;
  const w   = findWorker(rec.workerId);
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
    const time = new Date(rec.gpsTimestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
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

  document.getElementById("disputeReason").value  = "Incorrect No Show";
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
  const rec = attendanceRecords.find(r => r.id === currentDisputeRecordId);
  if (!rec) return;

  const btn     = document.getElementById("submitDisputeBtn");
  const reason  = document.getElementById("disputeReason").value;
  const comment = document.getElementById("disputeComment").value.trim();
  const files   = document.getElementById("evidenceFileInput").files;

  btn.disabled = true;
  btn.textContent = "Submitting…";

  rec.disputeStatus    = "pending";
  rec.disputeReason    = reason;
  rec.disputeComment   = comment;
  rec.disputeTimestamp = Date.now();

  if (files?.length) {
    rec.disputePhotos = [];
    for (const file of Array.from(files)) {
      if (file.type.startsWith("image/")) {
        try { rec.disputePhotos.push(await compressImage(file)); } catch (_) {}
      }
    }
  }

  const w = findWorker(rec.workerId);
  logActivity("attend", `Dispute raised by <strong>${escapeHtml(w?.name || "")}</strong>: ${escapeHtml(reason)}`);

  saveAttendanceRecords();
  render();
  renderAttendance();
  closeDisputeModal();
  showToast("Dispute submitted — attendance frozen pending review");
}

function resolveDispute(recordId, resolution) {
  const rec = attendanceRecords.find(r => r.id === recordId);
  if (!rec) return;
  const w = findWorker(rec.workerId);

  rec.disputeStatus = "resolved";
  rec.resolution    = resolution;
  rec.resolvedAt    = Date.now();

  if (resolution === "accepted_worker") {
    const statusMap = {
      "Incorrect No Show":   "onTime",
      "Incorrect Late Mark": "onTime",
      "Site Cancellation":   "siteCancelled",
      "Incorrect Hours Worked": "onTime",
    };
    const newStatus = statusMap[rec.disputeReason] || "onTime";
    rec.originalStatus = rec.status;
    rec.status         = newStatus;
    rec.resolvedStatus = newStatus;
    logActivity("attend", `Dispute accepted: <strong>${escapeHtml(w?.name || "")}</strong> record updated to ${ATT_CFG[newStatus]?.label}`);
    showToast("Worker claim accepted — attendance record updated");
  } else {
    rec.resolvedStatus = rec.status;
    logActivity("attend", `Dispute rejected: <strong>${escapeHtml(w?.name || "")}</strong> original record confirmed`);
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
document.getElementById("evidenceFileInput")?.addEventListener("change", e => {
  const preview = document.getElementById("evidencePreviewArea");
  if (!preview) return;
  const files = Array.from(e.target.files || []).filter(f => f.type.startsWith("image/"));
  preview.innerHTML = files.map((f, i) => {
    const url = URL.createObjectURL(f);
    return `<img src="${url}" class="evidence-thumb" alt="Evidence ${i + 1}" data-lightbox-src="${url}" data-lightbox-label="Evidence" />`;
  }).join("");
});

// ─── Init ─────────────────────────────────────────────────
render();
renderAttendance();

document.getElementById("submitAttendanceBtn")?.addEventListener("click", submitDayAttendance);

// Add attend icon to activity log
ACTIVITY_ICONS.attend = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`;
