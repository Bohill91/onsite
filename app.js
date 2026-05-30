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

// ─── Tab Routing ──────────────────────────────────────────
const allTabBtns   = document.querySelectorAll("[data-tab]");
const allTabPanels = document.querySelectorAll(".tab-panel");

function switchTab(tab) {
  allTabBtns.forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tab));
  allTabPanels.forEach(panel => panel.classList.toggle("active", panel.id === `tab-${tab}`));
}

allTabBtns.forEach(btn => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

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
  state.jobs.push({
    id: createId(),
    trade,
    location,
    start:      document.querySelector("#jobStart").value,
    duration,
    assignedWorkerId: "",
  });
  logActivity("job", `New job posted: <strong>${escapeHtml(trade)}</strong> in ${escapeHtml(location)}${duration ? ` · ${escapeHtml(duration)}` : ""}`);
  jobForm.reset();
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
  renderStats();
  renderWorkers();
  renderJobs();
  renderMatches();
  renderActivity();
  workerCount.textContent = state.workers.length;
  jobCount.textContent    = state.jobs.length;
}

function renderStats() {
  const total     = state.workers.length;
  const available = state.workers.filter(w => w.availability === "available").length;
  const open      = state.jobs.filter(j => !j.assignedWorkerId).length;
  const assigned  = state.jobs.filter(j =>  j.assignedWorkerId).length;
  const avgScore  = total
    ? Math.round(state.workers.reduce((s, w) => s + w.reliability, 0) / total)
    : 0;

  document.querySelector("#statsRow").innerHTML = `
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
  const avCls    = avatarColor(worker.name);
  const statusCls = worker.availability === "available" ? "available" : "unavailable";
  const quals    = (worker.qualifications || "").split(",").map(q => q.trim()).filter(Boolean);

  return `
  <article class="worker-card">
    <div class="worker-card-top">
      <div class="worker-avatar ${avCls}">${initials(worker.name)}</div>
      <div class="worker-info">
        <div class="worker-name">${escapeHtml(worker.name)}</div>
        <div class="worker-trade">${escapeHtml(worker.trade)}</div>
        <div class="worker-quals">
          <span class="status-pill ${statusCls}">${worker.availability}</span>
          ${quals.slice(0, 3).map(q => `<span class="qual-chip">${escapeHtml(q)}</span>`).join("")}
        </div>
      </div>
      ${reliabilityBadge(worker.reliability)}
    </div>
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
}

function jobCard(job) {
  const assigned = job.assignedWorkerId ? findWorker(job.assignedWorkerId) : null;

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
  const avCls = avatarColor(worker.name);
  const rankCls = index === 0 ? "rank-1" : "rank-other";
  return `
  <div class="match-worker-row">
    <div class="match-rank ${rankCls}">${index + 1}</div>
    <div class="match-worker-avatar ${avCls}">${initials(worker.name)}</div>
    <div class="match-worker-info">
      <div class="match-worker-name">${index === 0 ? "⭐ " : ""}${escapeHtml(worker.name)}</div>
      <div class="match-worker-quals">${escapeHtml(worker.qualifications || worker.trade)}</div>
    </div>
    ${miniBadge(worker.reliability)}
  </div>`;
}

// ─── Helpers ──────────────────────────────────────────────
function getMatches(job) {
  return state.workers
    .filter(w => normalize(w.trade) === normalize(job.trade) && w.availability === "available")
    .sort((a, b) => b.reliability - a.reliability);
}

function findWorker(id) { return state.workers.find(w => w.id === id); }
function findJob(id)    { return state.jobs.find(j => j.id === id);    }

// ─── Init ─────────────────────────────────────────────────
render();
