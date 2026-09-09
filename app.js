  const documentTypeOptions = WORKER_DOCUMENT_TYPES.map(
    (d) => `<option value="${d.value}">${escapeHtml(d.label)}</option>`,
  ).join("");
  const documentStatusOptions = WORKER_DOCUMENT_STATUSES.map(
    (s) => `<option value="${s}">${escapeHtml(s)}</option>`,
  ).join("");

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
      <div class="prof-section-title">Verification</div>
      <div class="prof-fields">${verificationFields}</div>
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
      <div class="prof-section-title">Documents &amp; Certifications</div>
      <p class="prof-section-hint">Document records are saved to this profile so companies can review certification status before confirming work.</p>
      ${workerDocumentsHTML(workerProfile || user, { manage: true })}
      <div class="worker-doc-form">
        <label class="field-label">Card, ticket or qualification
          <select id="workerDocCredential">${workerCredentialOptions()}</select>
        </label>
        <div class="form-grid-2">
          <label class="field-label">Document Type
            <select id="workerDocType">${documentTypeOptions}</select>
          </label>
          <label class="field-label">Exact certificate title
            <input id="workerDocTitle" type="text" placeholder="As shown on the document" />
          </label>
        </div>
        <label class="field-label">File Name / Upload Label
            <input id="workerDocFileName" type="text" placeholder="e.g. cscs-card-front.jpg" />
        </label>
        <div class="form-grid-2">
          <label class="field-label">Expiry Date
            <input id="workerDocExpiry" type="date" />
          </label>
          <label class="field-label">Verification Status
            <select id="workerDocStatus">${documentStatusOptions}</select>
          </label>
        </div>
        <label class="field-label">Notes
          <textarea id="workerDocNotes" rows="2" placeholder="Optional notes for future admin review"></textarea>
        </label>
        <button class="primary-btn wide" type="button" id="workerDocAddBtn">Add Document Record</button>
      </div>
    </div>

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

    ${agreementHistorySection(state.agreements.filter((a) => a.workerId === user.id))}

    <div class="prof-section">
      <div class="prof-section-title">Company Reviews</div>
      <div class="prof-fields">
        <div class="prof-field"><div class="prof-field-label">Reviews</div><div class="prof-field-val">No company reviews recorded yet</div></div>
      </div>
    </div>

    <div class="prof-section">
      <div class="prof-section-title">Settings, Privacy &amp; Support</div>
      <div class="prof-fields">
        <div class="prof-field"><div class="prof-field-label">Settings</div><div class="prof-field-val">Manage account preferences from this profile</div></div>
        <div class="prof-field"><div class="prof-field-label">Privacy</div><div class="prof-field-val">Identity and work-history controls are kept with your account</div></div>
        <div class="prof-field"><div class="prof-field-label">Support</div><div class="prof-field-val">Contact OnSite support for account help</div></div>
      </div>
    </div>

    <div class="prof-section">
      <div class="prof-section-title">Account</div>
      <p class="privacy-note">OnSite may retain limited identity and booking history after account deletion where necessary to prevent fraud, protect platform integrity, resolve disputes, and maintain accurate reliability records.</p>
      <button class="delete-account-btn" id="deleteAccountBtn" type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        Delete my account
      </button>
    </div>`;

  bindAgreementOpeners(el);
  const delBtn = el.querySelector("#deleteAccountBtn");
  if (delBtn)
    delBtn.addEventListener("click", () => {
      if (typeof deleteWorkerAccount === "function") deleteWorkerAccount();
    });

  el.querySelector("#workerDocAddBtn")?.addEventListener("click", () => {
    const type = el.querySelector("#workerDocType")?.value || "other";
    const res = upsertWorkerDocument(user.id, {
      documentType: type,
      credentialId: el.querySelector("#workerDocCredential")?.value || "",
      qualificationTitle: el.querySelector("#workerDocTitle")?.value || "",
      fileName: el.querySelector("#workerDocFileName")?.value || "",
      fileType: WORKER_DOCUMENT_TYPES.find((d) => d.value === type)?.accepts || "",
      expiryDate: el.querySelector("#workerDocExpiry")?.value || "",
      verificationStatus: el.querySelector("#workerDocStatus")?.value || "unverified",
      notes: el.querySelector("#workerDocNotes")?.value || "",
    });
    if (!res.ok) {
      showToast(res.reason);
      return;
    }
    render();
    showToast("Document record added");
  });

  el.querySelectorAll("[data-worker-doc-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const res = removeWorkerDocument(user.id, btn.dataset.workerDocRemove);
      if (!res.ok) {
        showToast(res.reason);
        return;
      }
      render();
      showToast("Document record removed");
    });
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
    : guidedEmptyStateHTML({
        kicker: "Payments",
        title: "No payments yet",
        body: "Approved attendance will feed future invoices. Once a worked week is invoiced, payment status will appear here.",
        actionLabel: "View Timesheet",
        actionTab: "attendance",
      });

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
    : guidedEmptyStateHTML({
        kicker: "Agreements",
        title: "No job agreements yet",
        body: "When a company confirms you for a role, the agreement will appear here for review before attendance becomes active.",
        actionLabel: "View Offers",
        actionTab: "offers",
      });
  return `
    <div class="prof-section">
      <div class="prof-section-title">Job Agreement History</div>
      <div class="agr-hist-list">${rows}</div>
    </div>`;
}

// ─── Company Home ──────────────────────────────────────
let activeCompanyProjectId = "";
let activeCompanyProjectSection = "overview";
let activeCompanyProjectDocumentsView = "requirements";
let activeCompanyProjectSearch = "";
let activeCompanyProjectSort = "health_priority";
let activeCompanyProjectHealthFilters = [];
let activeCompanyProjectRequiresAction = false;
let activeCompanyProjectOpenLabourOnly = false;
let activeCompanyProjectAssignmentFilters = [];
let activeCompanyProjectTradeFilters = [];
let activeCompanyProjectLocationFilter = "";
let pendingCompanyProjectLocationFilter = null;
let activeCompanyProjectStartFrom = "";
let activeCompanyProjectStartTo = "";
let activeCompanyProjectStatusFilter = "all";
let activeCompanyProjectOperationalFilter = "";
let activeCompanyProjectEditId = "";
let companyProjectSearchTimer = null;
let companyProjectTradeSearchTimer = null;
let companyProjectLocationInputTimer = null;
let activeCompanyAccountView = "profile";
let activeAttendanceProjectId = "";
let activeAttendanceProjectSearch = "";
let activeAttendanceProjectFilters = [];
let activeAttendanceProjectSort = "attendance_required";
let activeAttendanceOperationalFilter = "";
let activeMarketFilters = {
  trade: "",
  specialism: "",
  location: "",
  dateFrom: "",
  dateTo: "",
};

const COMPANY_KPI_DRILLDOWNS = {
  scheduled_today: {
    tab: "jobs",
    hash: "#projects/scheduled-today",
    label: "Scheduled today",
  },
  workers_expected_today: {
    tab: "attendance",
    hash: "#attendance/expected-today",
    label: "Expected today",
  },
  open_labour_requirements: {
    tab: "jobs",
    hash: "#projects/open-labour-requirements",
    label: "Open labour requirements",
  },
  starting_next_7_days: {
    tab: "jobs",
    hash: "#projects/starting-next-7-days",
    label: "Starting next 7 days",
  },
};

function companyKpiDrilldownFromHash(hash = window.location.hash) {
  return (
    Object.entries(COMPANY_KPI_DRILLDOWNS).find(([, config]) => config.hash === hash)?.[0] ||
    ""
  );
}

function companyKpiDrilldownIsActive() {
  return !!(
    activeCompanyProjectOperationalFilter || activeAttendanceOperationalFilter
  );
}

function clearCompanyKpiDrilldownState() {
  activeCompanyProjectOperationalFilter = "";
  activeAttendanceOperationalFilter = "";
}

function applyCompanyKpiDrilldownState(kind) {
  const config = COMPANY_KPI_DRILLDOWNS[kind];
  if (!config) return null;
  clearCompanyKpiDrilldownState();
  if (config.tab === "jobs") {
    activeCompanyProjectId = "";
    activeCompanyProjectSearch = "";
    activeCompanyProjectHealthFilters = [];
    activeCompanyProjectRequiresAction = false;
    activeCompanyProjectOpenLabourOnly = false;
    activeCompanyProjectAssignmentFilters = [];
    activeCompanyProjectTradeFilters = [];
    activeCompanyProjectLocationFilter = "";
    pendingCompanyProjectLocationFilter = null;
    activeCompanyProjectStartFrom = "";
    activeCompanyProjectStartTo = "";
    activeCompanyProjectStatusFilter = "all";
    activeCompanyProjectOperationalFilter = kind;
  } else {
    activeAttendanceProjectId = "";
    activeAttendanceProjectSearch = "";
    activeAttendanceProjectFilters = [];
    activeAttendanceProjectSort = "attendance_required";
    activeAttendanceOperationalFilter = kind;
  }
  return config;
}

function navigateToCompanyKpiDrilldown(kind, { replace = false } = {}) {
  const config = applyCompanyKpiDrilldownState(kind);
  if (!config) return;
  const method = replace ? "replaceState" : "pushState";
  history[method]({ companyKpiDrilldown: kind }, "", config.hash);
  render();
  switchTab(config.tab, { scroll: false });
  scrollAppToTop();
}

function syncCompanyKpiDrilldownFromHash({ scroll = true } = {}) {
  const kind = companyKpiDrilldownFromHash();
  if (kind) {
    const config = applyCompanyKpiDrilldownState(kind);
    render();
    switchTab(config.tab, { scroll: false });
    if (scroll) scrollAppToTop();
    return true;
  }
  if (!companyKpiDrilldownIsActive()) return false;
  clearCompanyKpiDrilldownState();
  render();
  switchTab("dashboard", { scroll: false });
  if (scroll) scrollAppToTop();
  return true;
}

function clearCompanyKpiDrilldown(page) {
  clearCompanyKpiDrilldownState();
  history.pushState(
    { companyTab: page },
    "",
    `${window.location.pathname}${window.location.search}`,
  );
  render();
  switchTab(page, { scroll: false });
  scrollAppToTop();
}

function clearCompanyKpiDrilldownForNavigation(nextTab) {
  const projectFilterLeaving =
    activeCompanyProjectOperationalFilter && nextTab !== "jobs";
  const attendanceFilterLeaving =
    activeAttendanceOperationalFilter && nextTab !== "attendance";
  if (!projectFilterLeaving && !attendanceFilterLeaving) return;
  clearCompanyKpiDrilldownState();
  if (companyKpiDrilldownFromHash()) {
    history.replaceState(
      { companyTab: nextTab },
      "",
      `${window.location.pathname}${window.location.search}`,
    );
  }
}

function attendanceProjectHash(jobId) {
  return `#attendance/project/${encodeURIComponent(jobId)}`;
}

function syncAttendanceProjectFromHash() {
  const match = window.location.hash.match(/^#attendance\/project\/(.+)$/);
  activeAttendanceProjectId = match ? decodeURIComponent(match[1]) : "";
}

function navigateToAttendanceProject(jobId, { scroll = true } = {}) {
  activeAttendanceProjectId = jobId || "";
  qrSelectedJobId = activeAttendanceProjectId || qrSelectedJobId;
  todayAttendanceMap = {};
  if (activeAttendanceProjectId) {
    history.pushState({ attendanceProjectId: activeAttendanceProjectId }, "", attendanceProjectHash(activeAttendanceProjectId));
  }
  renderAttendance();
  if (scroll) scrollAppToTop();
}

function navigateToAttendanceList({ replace = false, scroll = true } = {}) {
  activeAttendanceProjectId = "";
  todayAttendanceMap = {};
  if (window.location.hash.startsWith("#attendance/project/")) {
    const method = replace ? "replaceState" : "pushState";
    history[method]({}, "", `${window.location.pathname}${window.location.search}`);
  }
  renderAttendance();
  if (scroll) scrollAppToTop();
}
let projectEditPin = { lat: null, lng: null };
let projectEditPhotos = {};
let projectEditPhotoMeta = {};
let projectEditMap = null;
let projectEditMarker = null;

const COMPANY_PROJECT_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "labour", label: "Labour" },
  { id: "workforce", label: "Workforce" },
  { id: "attendance", label: "Attendance" },
  { id: "site", label: "Site" },
  { id: "documents", label: "Pre-start" },
  { id: "commercial", label: "Commercial" },
  { id: "activity", label: "Activity" },
];

function normalizeCompanyProjectSection(section = "overview") {
  const aliases = {
    requirements: "labour",
    workers: "workforce",
    invoices: "commercial",
  };
  const value = aliases[section] || section || "overview";
  return COMPANY_PROJECT_SECTIONS.some((item) => item.id === value)
    ? value
    : "overview";
}

function normalizeCompanyAccountView(view = "profile") {
  const aliases = {
    settings: "company",
    account: "profile",
    compliance: "billing",
  };
  const value = aliases[view] || view || "profile";
  return ["profile", "company", "billing", "team"].includes(value)
    ? value
    : "profile";
}

function companyAccountTabsHTML(activeView) {
  const tabs = [
    ["profile", "My Profile"],
    ["company", "Company"],
    ["billing", "Billing & Compliance"],
    ["team", "Team"],
  ];
  return `<div class="company-account-tabs os-tabs" role="tablist" aria-label="Account sections">
    ${tabs
      .map(
        ([id, label]) => `<button class="company-account-tab os-tab${activeView === id ? " active" : ""}" type="button" data-company-account-view="${id}">${escapeHtml(label)}</button>`,
      )
      .join("")}
  </div>`;
}

function companyAssignedWorkers(job) {
  const workers = [];
  const assignedIds = Array.isArray(job?.assignedWorkerIds)
    ? job.assignedWorkerIds
    : [];
  assignedIds.forEach((id) => {
    const worker = findWorker(id);
    if (worker && !workers.some((w) => w.id === worker.id)) workers.push(worker);
  });
  if (job?.assignedWorkerId) {
    const worker = findWorker(job.assignedWorkerId);
    if (worker && !workers.some((w) => w.id === worker.id)) workers.push(worker);
  }
  return workers;
}

function assignedJobForWorker(workerId) {
  return state.jobs.find(
    (j) =>
      j.assignedWorkerId === workerId ||
      (Array.isArray(j.assignedWorkerIds) && j.assignedWorkerIds.includes(workerId)),
  );
}

function labourRequirementsForJob(job) {
  if (Array.isArray(job?.labourRequirements) && job.labourRequirements.length) {
    return dedupeLabourRequirements(job.labourRequirements).map((req, index) => ({
      id: req.id || `${job.id || "job"}-req-${index}`,
      trade: req.trade || job.trade || "",
      specialism: req.specialism || job.specialism || "",
      grade: req.grade || job.grade || "",
      requiredQualifications:
        req.requiredQualifications || job.requiredQualifications || "",
      requiredCredentialIds: canonicalCredentialIds(
        req.requiredCredentialIds || job.requiredCredentialIds,
      ),
      workActivity: req.workActivity || job.workActivity || "",
      quantity: Math.max(1, Number(req.quantity) || 1),
      labourSchedule: normalizeLabourSchedule(req.labourSchedule),
      budgetMin: req.budgetMin ?? job.budgetMin ?? null,
      budgetMax: req.budgetMax ?? job.budgetMax ?? null,
      saturdayRate: req.saturdayRate ?? job.weekendRates?.saturday ?? null,
      sundayRate: req.sundayRate ?? job.weekendRates?.sunday ?? null,
      workerReceivesFullAdvertisedRate:
        req.workerReceivesFullAdvertisedRate ??
        job.workerReceivesFullAdvertisedRate ??
        true,
      overtimeAvailable: !!(req.overtimeAvailable ?? job.overtimeAvailable),
      overtimeRates: req.overtimeRates || job.overtimeRates || {
        afterStandardHours: "standard",
        saturday: "standard",
        sunday: "standard",
      },
      ...normalizedAccommodationState({
        accommodationPaid: req.accommodationPaid ?? job.accommodationPaid,
        accommodationArrangement:
          req.accommodationArrangement ?? job.accommodationArrangement,
        accommodationAllowancePerNight:
          req.accommodationAllowancePerNight ??
          job.accommodationAllowancePerNight,
      }),
      workingDays: normalizeWorkingDays(req.workingDays || job.workingDays),
      shiftStartTime: req.shiftStartTime || job.shiftStartTime || "",
      shiftFinishTime: req.shiftFinishTime || job.shiftFinishTime || "",
    }));
  }
  return [
    {
      id: `${job?.id || "job"}-req-0`,
      trade: job?.trade || "",
      specialism: job?.specialism || "",
      grade: job?.grade || "",
      requiredQualifications: job?.requiredQualifications || "",
      requiredCredentialIds: canonicalCredentialIds(job?.requiredCredentialIds),
      workActivity: job?.workActivity || "",
      quantity: Math.max(1, Number(job?.quantity) || 1),
      labourSchedule: normalizeLabourSchedule(job?.labourSchedule),
      budgetMin: job?.budgetMin ?? null,
      budgetMax: job?.budgetMax ?? null,
      saturdayRate: job?.weekendRates?.saturday ?? null,
      sundayRate: job?.weekendRates?.sunday ?? null,
      workerReceivesFullAdvertisedRate:
        job?.workerReceivesFullAdvertisedRate ?? true,
      overtimeAvailable: !!job?.overtimeAvailable,
      overtimeRates: job?.overtimeRates || {
        afterStandardHours: "standard",
        saturday: "standard",
        sunday: "standard",
      },
      ...normalizedAccommodationState(job),
      workingDays: normalizeWorkingDays(job?.workingDays),
      shiftStartTime: job?.shiftStartTime || "",
      shiftFinishTime: job?.shiftFinishTime || "",
    },
  ];
}

function labourRequirementLabel(req) {
  return `${req.specialism || req.trade || "Labour"} x ${req.quantity || 1}`;
}

function labourRequirementQuantityOnDate(req, date = todayDateStr()) {
  const schedule = normalizeLabourSchedule(req?.labourSchedule);
  if (!schedule.length) return Math.max(1, Number(req?.quantity) || 1);
  const target = dateOnlyMs(date);
  if (target === null) return Math.max(1, Number(req?.quantity) || 1);
  const active = schedule.find(
    (period) =>
      dateOnlyMs(period.startDate) <= target && dateOnlyMs(period.endDate) >= target,
  );
  return Math.max(1, Number(active?.quantity ?? req?.quantity) || 1);
}

function labourRequirementPeakQuantity(req) {
  const schedule = normalizeLabourSchedule(req?.labourSchedule);
  const base = Math.max(1, Number(req?.quantity) || 1);
  return schedule.length
    ? Math.max(base, ...schedule.map((period) => Math.max(1, Number(period.quantity) || 1)))
    : base;
}

function labourRequirementUpcomingChanges(req, fromDate = todayDateStr(), days = 30) {
  const schedule = normalizeLabourSchedule(req?.labourSchedule);
  const from = dateOnlyMs(fromDate);
  if (!schedule.length || from === null) return [];
  const until = from + days * 86400000;
  return schedule
    .filter((period) => {
      const start = dateOnlyMs(period.startDate);
      return start !== null && start >= from && start <= until;
    })
    .map((period) => {
      const previous = schedule
        .filter((candidate) => dateOnlyMs(candidate.endDate) < dateOnlyMs(period.startDate))
        .sort((a, b) => dateOnlyMs(b.endDate) - dateOnlyMs(a.endDate))[0];
      return {
        ...period,
        previousQuantity: previous ? Math.max(1, Number(previous.quantity) || 1) : Math.max(1, Number(req?.quantity) || 1),
      };
    });
}

function nextLabourRequirementChange(req, fromDate = todayDateStr()) {
  return labourRequirementUpcomingChanges(req, fromDate, 365)[0] || null;
}

function uniqueLabourRequirements(requirements) {
  return dedupeLabourRequirements(requirements);
}

function companyRequirementFilledCount(req, summary) {
  if (!summary?.assignedWorkers?.length) return 0;
  if ((summary.labourRequirements || []).length <= 1) return summary.filled;
  const reqTrade = String(req.trade || "").toLowerCase();
  const reqRole = String(req.specialism || "").toLowerCase();
  return summary.assignedWorkers.filter((worker) => {
    const workerTrade = String(worker.trade || "").toLowerCase();
    const workerRole = String(worker.specialism || worker.grade || "").toLowerCase();
    return (
      (reqTrade && workerTrade.includes(reqTrade)) ||
      (reqRole && workerRole.includes(reqRole))
    );
  }).length;
}

function companyRequirementApplicationCount(req, summary, statuses) {
  const apps = summary?.apps || [];
  if (!apps.length) return 0;
  const statusSet = new Set(statuses);
  const scopedApps = apps.filter((app) => statusSet.has(app.status));
  if ((summary.labourRequirements || []).length <= 1) return scopedApps.length;
  const reqTrade = String(req.trade || "").toLowerCase();
  const reqRole = String(req.specialism || "").toLowerCase();
  return scopedApps.filter((app) => {
    const worker = applicationWorker(app);
    const text = [
      app.trade,
      app.specialism,
      worker?.trade,
      worker?.specialism,
      worker?.grade,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return (reqTrade && text.includes(reqTrade)) || (reqRole && text.includes(reqRole));
  }).length;
}

function companyRequirementStats(req, summary) {
  const required = labourRequirementQuantityOnDate(req, todayDateStr());
  const filled = Math.min(required, companyRequirementFilledCount(req, summary));
  const pendingOffers = companyRequirementApplicationCount(req, summary, ["offered"]);
  const awaitingApproval = companyRequirementApplicationCount(req, summary, [
    "under_company_review",
  ]);
  const accepted = Math.min(
    required,
    filled +
      companyRequirementApplicationCount(req, summary, [
        "under_company_review",
        "confirmed",
      ]),
  );
  return {
    required,
    filled,
    offered: pendingOffers,
    accepted,
    remaining: Math.max(0, required - filled),
    pendingOffers,
    awaitingApproval,
    peak: labourRequirementPeakQuantity(req),
  };
}

function companyProjectTitle(job) {
  return job?.projectName || job?.siteName || job?.trade || "Project";
}

function canEditCompanyProject(job, user) {
  // TODO: Replace this owner check with granular project-edit permissions when
  // the company permission model exists.
  return user?.type === "company" && companyOwnsJob(job, user.id);
}

function companyProjectSearchText(job, summary = companyProjectSummary(job, getSessionUser() || {})) {
  return [
    companyProjectTitle(job),
    job.jobNumber,
    job.location,
    job.trade,
    job.role,
    job.specialism,
    assignmentTypeLabel(job),
    ...(summary.labourRequirements || []).flatMap((req) => [
      req.trade,
      req.specialism,
      req.grade,
      req.workActivity,
      req.requiredQualifications,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function companyProjectMatchesOperationalFilter(job, projectSummary, filter) {
  if (!filter) return true;
  if (filter === "scheduled_today") return isProjectScheduledToday(job);
  if (filter === "open_labour_requirements") {
    return companyProjectOpenLabourRequirementCount(projectSummary) > 0;
  }
  if (filter === "starting_next_7_days") {
    return isProjectStartingWithinNextDays(job, 7);
  }
  return true;
}

function filterCompanyProjects(jobs, user) {
  const query = activeCompanyProjectSearch.trim().toLowerCase();
  return jobs
    .filter((job) => {
      const summary = companyProjectSummary(job, user);
      const health = calculateProjectHealth(job, summary);
      const assignmentType = normalizeAssignmentType(
        job.assignmentType || job.jobType,
      );
      const requirementTrades = uniqueLabourRequirements(
        summary.labourRequirements || [],
      ).map((req) => canonicalTrade(req.trade));
      const locationSearchText = [
        job.location,
        job.siteAddress,
        job.postcode,
        job.sitePostcode,
        job.postalCode,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const startMs = dateOnlyMs(job.start || job.startDate || "");
      if (
        activeCompanyProjectStatusFilter !== "all" &&
        companyProjectStatusBucket(job) !== activeCompanyProjectStatusFilter
      ) {
        return false;
      }
      if (
        !companyProjectMatchesOperationalFilter(
          job,
          summary,
          activeCompanyProjectOperationalFilter,
        )
      ) {
        return false;
      }
      if (
        query &&
        !companyProjectSearchText(job, summary).includes(query)
      ) {
        return false;
      }
      if (
        activeCompanyProjectHealthFilters.length &&
        !activeCompanyProjectHealthFilters.includes(health.level)
      ) {
        return false;
      }
      if (activeCompanyProjectRequiresAction && !health.requiresAction) {
        return false;
      }
      if (
        activeCompanyProjectAssignmentFilters.length &&
        !activeCompanyProjectAssignmentFilters.includes(assignmentType)
      ) {
        return false;
      }
      if (
        activeCompanyProjectTradeFilters.length &&
        !activeCompanyProjectTradeFilters.some((trade) =>
          requirementTrades.includes(canonicalTrade(trade)),
        )
      ) {
        return false;
      }
      if (
        activeCompanyProjectLocationFilter &&
        !locationSearchText.includes(
          activeCompanyProjectLocationFilter.trim().toLowerCase(),
        )
      ) {
        return false;
      }
      if (
        activeCompanyProjectOpenLabourOnly &&
        companyProjectOpenLabourRequirementCount(summary) === 0
      ) {
        return false;
      }
      if (activeCompanyProjectStartFrom) {
        const fromMs = dateOnlyMs(activeCompanyProjectStartFrom);
        if (startMs === null || (fromMs !== null && startMs < fromMs)) return false;
      }
      if (activeCompanyProjectStartTo) {
        const toMs = dateOnlyMs(activeCompanyProjectStartTo);
        if (startMs === null || (toMs !== null && startMs > toMs)) return false;
      }
      return true;
    })
    .sort((a, b) => sortCompanyProjects(a, b, activeCompanyProjectSort, user));
}

function companyProjectStatusBucket(job) {
  if (job?.completed || job?.completedAt || job?.cancelledAt || job?.bookingStatus === "cancelled") {
    return "completed";
  }
  const startDays = projectStartDays(job);
  const endDays = projectEndDays(job);
  if (!job?.noFixedEndDate && endDays !== null && endDays < 0) return "completed";
  if (startDays !== null && startDays > 0) return "upcoming";
  return "active";
}

function companyProjectStatusCounts(jobs = []) {
  return jobs.reduce(
    (counts, job) => {
      const bucket = companyProjectStatusBucket(job);
      counts.all += 1;
      counts[bucket] += 1;
      return counts;
    },
    { all: 0, active: 0, upcoming: 0, completed: 0 },
  );
}

function companyProjectStatusFilterHTML(jobs = []) {
  const counts = companyProjectStatusCounts(jobs);
  const options = [
    ["all", "All"],
    ["active", "Active"],
    ["upcoming", "Upcoming"],
    ["completed", "Completed"],
  ];
  return `<div class="company-project-status-filter" role="group" aria-label="Project status filter">
    ${options
      .map(
        ([value, label]) => {
          const count = counts[value] || 0;
          return `<button class="company-project-status-chip${activeCompanyProjectStatusFilter === value ? " active" : ""}" type="button" data-company-status-filter="${value}" aria-pressed="${activeCompanyProjectStatusFilter === value ? "true" : "false"}">
            <span>${label}</span>${count ? `<small>${count}</small>` : ""}
          </button>`;
        },
      )
      .join("")}
  </div>`;
}

function companyOperationalFilterBarHTML(filter, clearAttribute) {
  const config = COMPANY_KPI_DRILLDOWNS[filter];
  if (!config) return "";
  return `<div class="company-operational-filter" role="status">
    <span>Filtered by <strong>${escapeHtml(config.label)}</strong></span>
    <button type="button" ${clearAttribute} aria-label="Clear ${escapeHtml(config.label)} filter">
      ${onsiteIcon("x", 14)}
      <span>Clear filter</span>
    </button>
  </div>`;
}

function companyProjectResultCountLabel(visibleProjects, user) {
  const count = visibleProjects.length;
  return `${count} project${count === 1 ? "" : "s"}`;
}

function companyProjectFilteredEmptyStateHTML() {
  const content = {
    scheduled_today: {
      title: "No projects scheduled today",
      body: "No active project is operating on today's working-day schedule.",
    },
    open_labour_requirements: {
      title: "No open labour requirements",
      body: "All current labour places are filled. Clear the filter to view every project.",
    },
    starting_next_7_days: {
      title: "No projects starting in the next 7 days",
      body: "No project starts after today and within the next seven calendar days.",
    },
  }[activeCompanyProjectOperationalFilter];
  if (!content) return "";
  return guidedEmptyStateHTML({
    kicker: "Filtered View",
    title: content.title,
    body: content.body,
    actionLabel: "Clear filter",
    actionAttr: "data-company-operational-clear",
  });
}

function companyProjectHasDirectoryFilters() {
  return !!(
    activeCompanyProjectStatusFilter !== "all" ||
    activeCompanyProjectHealthFilters.length ||
    activeCompanyProjectAssignmentFilters.length ||
    activeCompanyProjectTradeFilters.length ||
    activeCompanyProjectLocationFilter ||
    activeCompanyProjectOpenLabourOnly ||
    activeCompanyProjectStartFrom ||
    activeCompanyProjectStartTo
  );
    .map(
      (j) =>
        `<option value="${j.id}" ${j.id === qrSelectedJobId ? "selected" : ""}>${escapeHtml(j.trade)} · ${escapeHtml(j.location)}</option>`,
    )
    .join("");
  const codeBlock = `
    ${projectSignInQrHTML(job, code)}
    <div class="qr-actions">
      <button class="qr-gen-btn" id="qrPrintBtn" type="button">Print Sign-In Sheet</button>
      <button class="qr-gen-btn qr-gen-btn--ghost" id="qrGenBtn" type="button">Regenerate QR</button>
    </div>`;

  panel.innerHTML = `
    <div class="qr-panel">
      <div class="qr-panel-head">
        <h3 class="qr-panel-title">Site Sign-In QR</h3>
        <span class="qr-panel-sub">Valid for this project during its active dates</span>
      </div>
      ${
        scopedProject
          ? `<div class="qr-job-static">${escapeHtml(companyProjectTitle(scopedProject))} · ${escapeHtml(scopedProject.location || scopedProject.siteAddress || "Location not set")}</div>`
          : `<label class="qr-job-label" for="qrJobSelect">Site</label>
             <select class="qr-job-select" id="qrJobSelect">${options}</select>`
      }
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
      openQrRegenerationConfirm(qrSelectedJobId);
    });
  document
    .getElementById("qrPrintBtn")
    ?.addEventListener("click", () => openProjectSignInPrintSheet(qrSelectedJobId));
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
        ${guidedEmptyStateHTML({
          kicker: "Attendance Review",
          title: "No attendance records yet",
          body: "Attendance records will appear here after workers sign in or supervisors submit daily attendance.",
        })}
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
    : guidedEmptyStateHTML({
        kicker: "Billing",
        title: "No company billing activity yet",
        body: "Companies with generated invoice records, restrictions or payment activity will appear here.",
      });

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
    : guidedEmptyStateHTML({
        kicker: "Invoices",
        title: "No invoices yet",
        body: "Invoices are raised weekly from approved attendance. Confirm attendance first to create future billing records.",
      });

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
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2"/></svg>
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
  hideWithMotion(document.getElementById("disputeModal"), () => {
    document.body.style.overflow = "";
    currentDisputeRecordId = null;
  });
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
  hideWithMotion(document.getElementById("reportModal"), () => {
    document.body.style.overflow = "";
    currentReportWorkerId = null;
  });
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
  addProjectActivity(job, {
    type: PROJECT_ACTIVITY_TYPES.WORKER_REPORTED_LATE,
    title: `${w?.name || "Worker"} reported late.`,
    description: `ETA ${eta}. ${lateReport.reason}${note ? ` · ${note}` : ""}`,
    workerId: uid,
    timestamp: lateReport.reportedAt,
    source: "worker_late_report",
    severity: "warning",
    metadata: {
      attendanceRecordId: rec.id,
      date: today,
      eta,
      reason: lateReport.reason,
    },
    dedupeKey: `worker_reported_late:${job.id}:${uid}:${today}:${lateReport.id}`,
  });
  saveState();

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

// Add attend icon to activity log
ACTIVITY_ICONS.attend = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`;
