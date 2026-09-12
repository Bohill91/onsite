;
  return guidedEmptyStateHTML({
    kicker: "No Matches",
    title: "No projects match these filters.",
    body: filtered
      ? "Clear the selected filters to see more projects. Your search term will be kept."
      : "Try a different project name, job number, location, trade or specialism.",
    actionLabel: filtered ? "Clear filters" : "Clear search",
    actionAttr: filtered
      ? "data-company-project-clear-filters"
      : "data-company-project-clear-search",
  });
}

function companyAttendanceProjects(user) {
  if (!user?.id) return state.jobs.filter((j) => !j.completed);
  return state.jobs.filter((j) => companyOwnsJob(j, user.id) && !j.completed);
}

function attendanceProjectSearchText(job) {
  const summary = companyProjectSummary(job, getSessionUser() || {});
  return [
    companyProjectTitle(job),
    job.jobNumber,
    job.location,
    job.siteAddress,
    job.trade,
    job.specialism,
    ...(summary.labourRequirements || []).flatMap((req) => [
      req.trade,
      req.specialism,
      req.grade,
      req.workActivity,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function filterAttendanceProjects(projects) {
  const query = activeAttendanceProjectSearch.trim().toLowerCase();
  return projects
    .filter((job) => {
      if (query && !attendanceProjectSearchText(job).includes(query)) return false;
      if (
        activeAttendanceOperationalFilter === "workers_expected_today" &&
        companyExpectedWorkersToday({
          job,
          expectedToday: attendanceProjectWorkers(job).length,
        }) === 0
      ) {
        return false;
      }
      if (!activeAttendanceProjectFilters.length) return true;
      const state = attendanceProjectState(job);
      return activeAttendanceProjectFilters.some((filter) => !!state[filter]);
    })
    .sort(sortAttendanceProjects);
}

function attendanceProjectWorkers(job) {
  return job ? companyAssignedWorkers(job) : [];
}

function attendanceRecordMatchesProject(record, job, workerIds) {
  if (!job || !record) return false;
  return record.jobId ? record.jobId === job.id : workerIds.has(record.workerId);
}

function attendanceProjectRecords(job, { includeToday = true } = {}) {
  if (!job) return [];
  const workerIds = new Set(attendanceProjectWorkers(job).map((w) => w.id));
  return attendanceRecords.filter((record) => {
    if (!includeToday && record.date === todayDateStr()) return false;
    return attendanceRecordMatchesProject(record, job, workerIds);
  });
}

function attendanceTodayRecordForWorker(workerId, job, today = todayDateStr()) {
  return attendanceRecords.find(
    (r) =>
      r.workerId === workerId &&
      r.date === today &&
      (!job || attendanceRecordMatchesProject(r, job, new Set([workerId]))),
  );
}

function attendanceStatusForWorker(worker, job, today = todayDateStr()) {
  const saved = todayAttendanceMap[worker.id] || {};
  const rec = attendanceTodayRecordForWorker(worker.id, job, today);
  const status = saved.status || rec?.status || "";
  const lateReport = rec?.lateReport || null;
  const signedIn = ["checkedIn", "onTime", "late", "sentHome"].includes(status) || !!rec?.checkInTime;
  const reportingLate = !!lateReport || status === "reportedIssue";
  return {
    rec,
    status,
    lateReport,
    signedIn,
    reportingLate,
    unconfirmed: !signedIn && !reportingLate && !saved.status && !rec?.status,
  };
}

function projectAttendanceSummary(workers, job, today = todayDateStr()) {
  const rows = workers.map((worker) => attendanceStatusForWorker(worker, job, today));
  const signedIn = rows.filter((row) => row.signedIn).length;
  const reportingLate = rows.filter((row) => row.reportingLate && !row.signedIn).length;
  return {
    expected: workers.length,
    signedIn,
    reportingLate,
    unconfirmed: rows.filter((row) => row.unconfirmed).length,
  };
}

function attendanceProjectBreakdownRowsHTML(workers, job, today = todayDateStr()) {
  if (!workers.length) {
    return `<div class="company-inline-empty">
      <strong>No workers assigned yet.</strong>
      <span>Today's attendance breakdown will appear once workers are confirmed for this project.</span>
    </div>`;
  }
  return groupedAttendanceWorkers(workers)
    .map((group) => {
      const first = group.workers[0] || {};
      const summary = projectAttendanceSummary(group.workers, job, today);
      return `<div class="company-project-req-line">
        <div>
          <strong>${escapeHtml(first.trade || "Trade")}</strong>
          <span>${escapeHtml(first.grade || first.specialism || "Experience level not set")}</span>
        </div>
        <dl>
          <div><dt>Total attending today</dt><dd>${summary.signedIn}/${summary.expected}</dd></div>
        </dl>
      </div>`;
    })
    .join("");
}

function attendanceProjectState(job) {
  const workers = attendanceProjectWorkers(job);
  const summary = projectAttendanceSummary(workers, job);
  const today = todayDateStr();
  const workerIds = new Set(workers.map((worker) => worker.id));
  const records = attendanceRecords.filter(
    (record) =>
      record.date === today &&
      attendanceRecordMatchesProject(record, job, workerIds),
  );
  const noShows = records.some((record) => record.status === "noShow");
  const requiresReview = records.some(
    (record) => record.manualReviewRequired || record.approvalStatus === "draft",
  );
  return {
    attendance_required: summary.unconfirmed > 0 || summary.reportingLate > 0 || requiresReview,
    fully_confirmed: summary.expected > 0 && summary.unconfirmed === 0 && summary.reportingLate === 0 && !requiresReview,
    reporting_late: summary.reportingLate > 0,
    no_shows: noShows,
    requires_review: requiresReview,
    summary,
  };
}

function sortAttendanceProjects(a, b) {
  if (activeAttendanceProjectSort === "project_name") {
    return companyProjectTitle(a).localeCompare(companyProjectTitle(b));
  }
  if (activeAttendanceProjectSort === "site_start_time") {
    return jobExpectedStartTime(a).localeCompare(jobExpectedStartTime(b));
  }
  if (activeAttendanceProjectSort === "location") {
    return String(a.location || a.siteAddress || "").localeCompare(String(b.location || b.siteAddress || ""));
  }
  const aState = attendanceProjectState(a);
  const bState = attendanceProjectState(b);
  if (aState.attendance_required !== bState.attendance_required) {
    return aState.attendance_required ? -1 : 1;
  }
  if (aState.summary.unconfirmed !== bState.summary.unconfirmed) {
    return bState.summary.unconfirmed - aState.summary.unconfirmed;
  }
  return companyProjectTitle(a).localeCompare(companyProjectTitle(b));
}

function attendanceGroupKey(worker) {
  return [worker.trade || "Trade", worker.grade || worker.specialism || "Experience level not set"].join("||");
}

function attendanceGroupLabel(worker) {
  const trade = worker.trade || "Trade";
  const grade = worker.grade || worker.specialism || "Experience level not set";
  return grade.toLowerCase().includes(trade.toLowerCase()) ? grade : `${trade} ${grade}`;
}

function groupedAttendanceWorkers(workers) {
  const groups = new Map();
  workers.forEach((worker) => {
    const key = attendanceGroupKey(worker);
    if (!groups.has(key)) {
      groups.set(key, {
        label: attendanceGroupLabel(worker),
        workers: [],
      });
    }
    groups.get(key).workers.push(worker);
  });
  return Array.from(groups.values()).map((group) => ({
    ...group,
    workers: group.workers.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))),
  }));
}

function attendanceLiveSummaryHTML(workers, job, today = todayDateStr()) {
  const summary = projectAttendanceSummary(workers, job, today);
  return `<section class="attendance-live-overview" id="attendanceLiveOverview">
    <div class="attendance-live-head">
      <p class="company-home-kicker">Today&apos;s Attendance</p>
      <h3>Live attendance overview</h3>
    </div>
    <div class="attendance-live-grid">
      <div class="attendance-live-stat"><span>Expected Today</span><strong>${summary.signedIn}/${summary.expected}</strong></div>
      <div class="attendance-live-stat"><span>Signed In</span><strong>${summary.signedIn}</strong></div>
      <div class="attendance-live-stat"><span>Reporting Late</span><strong>${summary.reportingLate}</strong></div>
      <div class="attendance-live-stat"><span>Unconfirmed</span><strong>${summary.unconfirmed}</strong></div>
    </div>
  </section>`;
}

function hasAttendanceConfirmationChanges(workers, job, today = todayDateStr()) {
  if (!workers.length) return false;
  return workers.some((worker) => {
    const draft = todayAttendanceMap[worker.id];
    if (draft?.status) return true;
    const record = attendanceTodayRecordForWorker(worker.id, job, today);
    return record?.status === "checkedIn" || record?.status === "reportedIssue" || record?.manualReviewRequired;
  });
}

function groupedAttendanceCardsHTML(workers, job, today = todayDateStr()) {
  if (!workers.length) return `<div class="company-inline-empty attendance-inline-empty">
    <strong>No workers assigned yet.</strong>
    <span>Confirmed workers will appear here grouped by trade and role / level. Once assigned, they can scan the project QR or be updated manually.</span>
  </div>`;
  return groupedAttendanceWorkers(workers)
    .map((group) => {
      const summary = projectAttendanceSummary(group.workers, job, today);
      return `<section class="attendance-worker-group">
        <div class="attendance-worker-group-head">
          <h3>${escapeHtml(group.label)} <span>(${summary.signedIn}/${summary.expected})</span></h3>
        </div>
        <div class="attendance-worker-group-list">
          ${group.workers.map((worker) => attendanceCard(worker, today, job)).join("")}
        </div>
      </section>`;
    })
    .join("");
}

function attendanceProjectSearchHTML() {
  return `<label class="company-project-search attendance-project-search" for="attendanceProjectSearch">
    <input id="attendanceProjectSearch" type="search" value="${escapeHtml(activeAttendanceProjectSearch)}" placeholder="Search by Project Name, Job Number, Location or Trade" autocomplete="off" aria-label="Search projects" />
  </label>`;
}

function attendanceProjectResultCountLabel(projects) {
  if (activeAttendanceOperationalFilter === "workers_expected_today") {
    const workers = projects.reduce(
      (sum, job) =>
        sum +
        companyExpectedWorkersToday({
          job,
          expectedToday: attendanceProjectWorkers(job).length,
        }),
      0,
    );
    return `${workers} worker${workers === 1 ? "" : "s"} expected today`;
  }
  return `${projects.length} result${projects.length === 1 ? "" : "s"}`;
}

function attendanceFilteredEmptyStateHTML() {
  if (activeAttendanceOperationalFilter !== "workers_expected_today") return "";
  return guidedEmptyStateHTML({
    kicker: "Filtered View",
    title: "No workers expected today",
    body: "No assigned workers are scheduled to attend today. Clear the filter to view every attendance project.",
    actionLabel: "Clear filter",
    actionAttr: "data-attendance-operational-clear",
  });
}

function attendanceProjectToolbarControlsHTML() {
  const filters = [
    ["attendance_required", "Attendance required"],
    ["fully_confirmed", "Fully confirmed"],
    ["reporting_late", "Reporting late"],
    ["no_shows", "No shows"],
    ["requires_review", "Requires review"],
  ];
  return `
    <details class="company-project-filter attendance-project-filter">
      <summary>Filter</summary>
      <div class="company-project-filter-menu">
        <div class="company-project-filter-group">
          <span>Attendance status</span>
          ${filters
            .map(
              ([value, label]) => `<label class="checkbox-row compact"><input type="checkbox" value="${value}" data-attendance-filter${activeAttendanceProjectFilters.includes(value) ? " checked" : ""} /> <span>${label}</span></label>`,
            )
            .join("")}
        </div>
      </div>
    </details>
    <details class="company-project-filter attendance-project-sort">
      <summary>Sort By</summary>
      <div class="company-project-filter-menu">
        <label class="field-label">
          Sort by
          <select id="attendanceProjectSort">
            <option value="attendance_required"${activeAttendanceProjectSort === "attendance_required" ? " selected" : ""}>Attendance required</option>
            <option value="project_name"${activeAttendanceProjectSort === "project_name" ? " selected" : ""}>Project name</option>
            <option value="site_start_time"${activeAttendanceProjectSort === "site_start_time" ? " selected" : ""}>Site start time</option>
            <option value="location"${activeAttendanceProjectSort === "location" ? " selected" : ""}>Location</option>
          </select>
        </label>
      </div>
    </details>`;
}

function attendanceProjectCardHTML(job, user) {
  const selected = activeAttendanceProjectId === job.id;
  const workers = attendanceProjectWorkers(job);
  const todaySummary = projectAttendanceSummary(workers, job);
  const endDate = job.noFixedEndDate
    ? "No fixed end date"
    : job.end || job.estimatedEndDate
      ? formatDateOnly(job.end || job.estimatedEndDate)
      : "TBC";
  return `<article class="company-project-card jw-card attendance-project-card${selected ? " active" : ""}" tabindex="0" role="button" data-attendance-project="${job.id}">
    <div class="company-project-top">
      <div>
        <div class="company-project-kicker">PROJECT</div>
        <div class="company-project-title">${escapeHtml(companyProjectTitle(job))}</div>
        <div class="company-project-meta">${escapeHtml(job.jobNumber || "No job number")} · ${escapeHtml(job.location || job.siteAddress || "Location not set")}</div>
      </div>
    </div>
    <div class="company-project-facts">
      <span><strong>Assignment type</strong> ${escapeHtml(assignmentTypeLabel(job))}</span>
      <span><strong>Start date</strong> ${job.start ? formatDateOnly(job.start) : "TBC"}</span>
      <span><strong>End date</strong> ${escapeHtml(endDate)}</span>
    </div>
    <div class="company-project-attendance attendance-project-card-attendance">
      <span class="company-project-requirements-label">TODAY&apos;S ATTENDANCE</span>
      <div class="attendance-project-total">
        <span>Total attending today</span>
        <strong>${todaySummary.signedIn}/${todaySummary.expected}</strong>
      </div>
      <div class="company-project-req-list attendance-project-breakdown">
        ${attendanceProjectBreakdownRowsHTML(workers, job)}
      </div>
    </div>
    <div class="company-project-action-row">
      <div class="primary-btn company-project-open">View Attendance</div>
    </div>
  </article>`;
}

function attendanceSelectedProjectHeaderHTML(job) {
  if (!job) return "";
  return `<header class="request-labour-page-head company-page-head os-page-header os-page-header--square attendance-project-detail-head">
    <div>
      <p class="company-home-kicker">PROJECT ATTENDANCE</p>
      <h3>${escapeHtml(companyProjectTitle(job))}</h3>
      <p>${escapeHtml(job.jobNumber || "No job number")} · ${escapeHtml(job.location || job.siteAddress || "Location not set")}</p>
    </div>
  </header>`;
}

function companyProjectSearchHTML(id, { showInlineLabel = true } = {}) {
  return `<label class="company-project-search" for="${id}">
    ${showInlineLabel ? "<span>Search projects</span>" : ""}
    <input id="${id}" type="search" value="${escapeHtml(activeCompanyProjectSearch)}" placeholder="Search by project name, job number, location or trade" autocomplete="off" aria-label="Search projects" />
  </label>`;
}

function companyProjectFilterOptions() {
  return {
    assignments: Object.entries(ASSIGNMENT_TYPES),
    trades: window.OnSiteTaxonomy?.trades.map((trade) => trade.name) || [],
  };
}

function companyProjectAppliedFilterCount() {
  return (
    (activeCompanyProjectHealthFilters.length ? 1 : 0) +
    (activeCompanyProjectAssignmentFilters.length ? 1 : 0) +
    (activeCompanyProjectTradeFilters.length ? 1 : 0) +
    (activeCompanyProjectLocationFilter ? 1 : 0) +
    (activeCompanyProjectOpenLabourOnly ? 1 : 0) +
    (activeCompanyProjectStartFrom || activeCompanyProjectStartTo ? 1 : 0)
  );
}

function companyProjectFilterCheckboxHTML({
  value,
  label,
  attribute,
  selected = false,
}) {
  return `<label class="checkbox-row compact company-project-filter-check">
    <input type="checkbox" value="${escapeHtml(value)}" ${attribute}${selected ? " checked" : ""} />
    <span>${escapeHtml(label)}</span>
  </label>`;
}

function companyProjectFilterHTML() {
  const options = companyProjectFilterOptions();
  const appliedCount = companyProjectAppliedFilterCount();
  const healthOptions = [
    ["urgent", "Urgent"],
    ["atRisk", "At Risk"],
    ["filled", "Healthy"],
    ["matching", "Neutral"],
  ];
  return `<details class="company-project-filter company-project-directory-filter" data-keep-open-on-change>
    <summary>Filter${appliedCount ? ` <span class="company-project-filter-count">${appliedCount}</span>` : ""}</summary>
    <div class="company-project-filter-menu company-project-directory-filter-menu">
      <div class="company-project-filter-group">
        <span>Project health</span>
        <div class="company-project-filter-options">
          ${healthOptions
          .map(
            ([value, label]) => companyProjectFilterCheckboxHTML({
              value,
              label,
              attribute: "data-company-health-filter",
              selected: activeCompanyProjectHealthFilters.includes(value),
            }),
          )
          .join("")}
        </div>
      </div>
      <div class="company-project-filter-group">
        <span>Assignment type</span>
        <div class="company-project-filter-options">
          ${options.assignments
          .map(
            ([value, label]) => companyProjectFilterCheckboxHTML({
              value,
              label,
              attribute: "data-company-assignment-filter",
              selected: activeCompanyProjectAssignmentFilters.includes(value),
            }),
          )
          .join("")}
        </div>
      </div>
      <div class="company-project-filter-columns">
        <div class="company-project-filter-group">
          <div class="company-project-filter-group-heading">
            <span>Trade</span>
            <small data-company-trade-selection-summary>${activeCompanyProjectTradeFilters.length ? `${activeCompanyProjectTradeFilters.length} selected` : "All trades"}</small>
          </div>
          <label class="company-project-filter-search">
            <span class="sr-only">Search trades</span>
            <input type="search" placeholder="Search trades" autocomplete="off" data-company-trade-search />
          </label>
          <div class="company-project-filter-options company-project-filter-options--scroll company-project-trade-options" data-company-trade-options>
            ${options.trades
              .map((value) => companyProjectFilterCheckboxHTML({
                value,
                label: value,
                attribute: "data-company-trade-filter",
                selected: activeCompanyProjectTradeFilters.includes(value),
              }))
              .join("")}
          </div>
          <span class="company-project-filter-empty" data-company-trade-empty hidden>No trades match that search.</span>
        </div>
        <div class="company-project-filter-group">
          <span>Location</span>
          <label class="company-project-filter-search">
            <span class="sr-only">Location</span>
            <input type="search" value="${escapeHtml(pendingCompanyProjectLocationFilter !== null ? pendingCompanyProjectLocationFilter : activeCompanyProjectLocationFilter)}" placeholder="Town, city or postcode" autocomplete="postal-code" data-company-location-filter aria-label="Location" />
          </label>
        </div>
      </div>
      ${companyProjectFilterCheckboxHTML({
        value: "open",
        label: "Has open labour requirements",
        attribute: "data-company-open-labour-filter",
        selected: activeCompanyProjectOpenLabourOnly,
      })}
      <div class="company-project-filter-group">
        <span>Project start date</span>
        <div class="company-project-filter-date-range">
          <label>From<input type="date" value="${escapeHtml(activeCompanyProjectStartFrom)}" data-company-start-from /></label>
          <label>To<input type="date" value="${escapeHtml(activeCompanyProjectStartTo)}" data-company-start-to /></label>
        </div>
      </div>
      <div class="company-project-filter-actions">
        <button class="secondary-btn" type="button" data-company-filter-clear>Clear all</button>
        <button class="primary-btn" type="button" data-company-filter-apply>Apply filters</button>
      </div>
    </div>
  </details>`;
}

function companyProjectSortHTML() {
  const options = [
    ["health_priority", "Health priority"],
    ["start_asc", "Start date — soonest"],
    ["start_desc", "Start date — latest"],
    ["name_asc", "Project name — A–Z"],
    ["open_desc", "Open positions — highest"],
    ["updated_desc", "Recently updated"],
  ];
  const selectedLabel = options.find(([value]) => value === activeCompanyProjectSort)?.[1] || "Health priority";
  return `<details class="company-project-filter company-project-sort">
    <summary aria-label="Sort projects, currently ${escapeHtml(selectedLabel)}">Sort: <span class="company-project-sort-current">${escapeHtml(selectedLabel)}</span></summary>
    <div class="company-project-filter-menu">
      <div class="company-project-filter-group">
        <span>Sort by</span>
        ${options
          .map(
            ([value, label]) => `<button class="company-project-sort-option${activeCompanyProjectSort === value ? " active" : ""}" type="button" data-company-sort-option="${value}" aria-pressed="${activeCompanyProjectSort === value ? "true" : "false"}">${escapeHtml(label)}</button>`,
          )
          .join("")}
      </div>
    </div>
  </details>`;
}

function companyProjectEmptyStateHTML(message = "Create your first labour request and it will appear here as a Live Project.") {
  return guidedEmptyStateHTML({
    kicker: "No Projects",
    title: "No projects yet",
    body: message,
    actionLabel: "Request labour",
    actionAttr: "data-company-request-labour",
  });
}

function companyProjectSummary(job, user) {
  const today = todayDateStr();
  const startDays = projectStartDays(job);
  const labourRequirements = labourRequirementsForJob(job);
  const assignedWorkers = companyAssignedWorkers(job);
  const assignedWorker = assignedWorkers[0] || null;
  const required = labourRequirements.reduce(
    (sum, req) => sum + Math.max(1, Number(req.quantity) || 1),
    0,
  );
  const filled = assignedWorkers.length;
  const apps = (state.applications || []).filter((a) => a.jobId === job.id);
  const pendingOffers = apps.filter((a) => a.status === "offered");
  const reviewWorkers = apps.filter((a) => a.status === "under_company_review");
  const projectAttendanceRecords = attendanceRecords.filter(
    (r) => r.jobId === job.id && (!user?.id || r.companyId === user.id || !r.companyId),
  );
  const todayRecords = attendanceRecords.filter(
    (r) => r.jobId === job.id && r.companyId === user.id && r.date === today,
  );
  const attendanceIssues = attendanceRecords.filter(
    (r) =>
      r.jobId === job.id &&
      r.companyId === user.id &&
      r.date === today &&
      ["late", "noShow", "reportedIssue", "unconfirmed"].includes(r.status),
  );
  const plannedAbsences = (state.notifications || []).filter(
    (n) =>
      n.type === "worker_planned_absence" &&
      n.jobId === job.id &&
      (n.companyId === user.id || !n.companyId),
  );
  const replacements = (state.replacementTasks || []).filter(
    (task) =>
      task.status === "open" &&
      task.jobId === job.id &&
      (task.companyId === user.id || !task.companyId),
  );
  const preStart = preStartRequirementSummary(job, assignedWorker?.id || "");
  const outstandingPreStart = assignedWorkers.reduce(
    (sum, worker) =>
      sum + preStartRequirementSummary(job, worker.id).outstanding.length,
    0,
  );
  const status = job.completed
    ? "Completed"
    : job.bookingStatus === "confirmed" || assignedWorker
      ? "Active"
      : pendingOffers.length || reviewWorkers.length
        ? "Offers in progress"
        : "Open";
  return {
    job,
    assignedWorker,
    assignedWorkers,
    labourRequirements,
    required,
    filled,
    openRoles: Math.max(0, required - filled),
    apps,
    pendingOffers,
    reviewWorkers,
    projectAttendanceRecords,
    todayRecords,
    expectedToday: assignedWorkers.length,
    signedInToday: todayRecords.filter((r) =>
      ["checkedIn", "onTime", "late"].includes(r.status),
    ).length,
    confirmedToday: todayRecords.filter((r) =>
      ["onTime", "late", "noShow"].includes(r.status),
    ).length,
    lateReports: todayRecords.filter((r) => r.lateReport).length,
    noShows: todayRecords.filter((r) => r.status === "noShow").length,
    attendanceIssues,
    plannedAbsences,
    replacements,
    preStart,
    outstandingPreStart,
    status,
    startDays,
  };
}

function companyDashboardSummary(user) {
  const companyJobs = state.jobs.filter((j) => companyOwnsJob(j, user.id));
  const activeJobs = companyJobs.filter((j) => !j.completed);
  const summaries = activeJobs.map((job) => companyProjectSummary(job, user));
  const openRequirements = companyOpenLabourRequirementCount(summaries);
  const upcomingStarts = companyProjectSummariesStartingNextDays({ summaries }).length;
  return {
    companyJobs,
    activeJobs,
    summaries,
    activeProjects: activeJobs.length,
    activeProjectsToday: summaries.filter((s) => s.startDays !== null && s.startDays <= 0).length,
    workersExpected: summaries.reduce((sum, s) => sum + s.expectedToday, 0),
    workersSignedIn: summaries.reduce((sum, s) => sum + s.signedInToday, 0),
    workersReportingLate: summaries.reduce((sum, s) => sum + s.lateReports, 0),
    workersUnconfirmed: summaries.reduce(
      (sum, s) => sum + Math.max(0, s.expectedToday - s.signedInToday),
      0,
    ),
    attendanceConfirmed: summaries.reduce((sum, s) => sum + s.confirmedToday, 0),
    openRequirements,
    upcomingStarts,
    startsTomorrow: summaries.filter((s) => s.startDays === 1).length,
    pendingActions: summaries.reduce(
      (sum, s) => sum + s.pendingOffers.length + s.reviewWorkers.length,
      0,
    ),
    lateReports: summaries.reduce((sum, s) => sum + s.lateReports, 0),
    plannedAbsences: summaries.reduce((sum, s) => sum + s.plannedAbsences.length, 0),
    replacements: summaries.reduce((sum, s) => sum + s.replacements.length, 0),
    outstandingPreStart: summaries.reduce((sum, s) => sum + s.outstandingPreStart, 0),
    upcomingLabourChanges: companyUpcomingLabourChanges(summaries),
  };
}

function companyUpcomingLabourChanges(summaries = [], days = 30) {
  return summaries
    .flatMap((summary) =>
      uniqueLabourRequirements(summary.labourRequirements).flatMap((req) =>
        labourRequirementUpcomingChanges(req, todayDateStr(), days).map((change) => ({
          job: summary.job,
          req,
          change,
          daysUntil: calendarDaysUntil(change.startDate),
          delta: (Number(change.quantity) || 1) - (Number(change.previousQuantity) || Number(req.quantity) || 1),
        })),
      ),
    )
    .filter((item) => item.daysUntil !== null && item.daysUntil >= 0)
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

const LABOUR_MARKET_MIN_RATE_SAMPLE = 3;

function normaliseMarketText(value) {
  return String(value || "").trim().toLowerCase();
}

function marketRegionFromLocation(value) {
  const raw = String(value || "").trim();
  if (!raw) return "Location unverified";
  const first = raw.split(",")[0].trim();
  return first || raw;
}

function marketWorkerLocation(worker) {
  const label = worker?.location || worker?.homeTown || worker?.postcode || worker?.region || "";
  const pin = worker?.homePin || worker?.locationPin || worker?.currentLocation || null;
  return {
    label: marketRegionFromLocation(label),
    raw: label,
    verified: !!(pin?.lat != null && pin?.lng != null),
  };
}

function marketJobLocation(job) {
  const label = job?.location || job?.siteAddress || "";
  return {
    label: marketRegionFromLocation(label),
    raw: label,
    verified: !!(job?.sitePin?.lat != null && job?.sitePin?.lng != null),
  };
}

function marketRequirementSpecialism(req, job) {
  return req?.specialism || req?.grade || job?.specialism || job?.grade || "";
}

function marketRequirementRate(req, job) {
  const value = Number(req?.budgetMax ?? req?.dailyLabourRate ?? job?.budgetMax ?? jobBudget(job));
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

function isWorkerAvailableForMarket(worker, dateFrom = "") {
  if (worker?.availability !== "available") return false;
  const next = dateOnlyMs(worker?.nextAvailableDate);
  const target = dateOnlyMs(dateFrom || todayDateStr());
  return next === null || target === null || next <= target;
}

function workerMatchesMarketFilters(worker, filters = activeMarketFilters) {
  if (!isWorkerAvailableForMarket(worker, filters.dateFrom)) return false;
  if (filters.trade && canonicalTrade(worker.trade) !== canonicalTrade(filters.trade)) return false;
  const workerText = workerSearchText(worker);
  if (filters.specialism && !workerText.includes(normaliseMarketText(filters.specialism))) return false;
  if (filters.location) {
    const workerLoc = marketWorkerLocation(worker);
    if (!normaliseMarketText(workerLoc.label).includes(normaliseMarketText(filters.location))) return false;
  }
  return true;
}

function requirementMatchesMarketFilters(req, job, filters = activeMarketFilters) {
  if (filters.trade && canonicalTrade(req.trade || job?.trade) !== canonicalTrade(filters.trade)) return false;
  const specialism = marketRequirementSpecialism(req, job);
  if (filters.specialism && !normaliseMarketText(specialism).includes(normaliseMarketText(filters.specialism))) return false;
  const jobLoc = marketJobLocation(job);
  if (filters.location && !normaliseMarketText(jobLoc.label).includes(normaliseMarketText(filters.location))) return false;
  const startMs = dateOnlyMs(job?.start || job?.startDate);
  const fromMs = dateOnlyMs(filters.dateFrom);
  const toMs = dateOnlyMs(filters.dateTo);
  if (fromMs !== null && startMs !== null && startMs < fromMs) return false;
  if (toMs !== null && startMs !== null && startMs > toMs) return false;
  return true;
}

function liveMarketRequirements(filters = activeMarketFilters, { excludeJobId = "" } = {}) {
  return state.jobs
    .filter((job) => !job.completed && job.id !== excludeJobId)
    .flatMap((job) =>
      uniqueLabourRequirements(labourRequirementsForJob(job))
        .filter((req) => requirementMatchesMarketFilters(req, job, filters))
        .map((req) => ({
          job,
          req,
          trade: req.trade || job.trade || "",
          specialism: marketRequirementSpecialism(req, job),
          location: marketJobLocation(job),
          required: labourRequirementQuantityOnDate(req, todayDateStr()),
          rate: marketRequirementRate(req, job),
        })),
    );
}

function availableMarketWorkers(filters = activeMarketFilters) {
  return state.workers.filter((worker) => workerMatchesMarketFilters(worker, filters));
}

function medianNumber(values = []) {
  const sorted = values
    .map(Number)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function labourMarketRateStats(filters = activeMarketFilters, opts = {}) {
  const requirements = liveMarketRequirements(filters, opts);
  const rates = requirements.map((item) => item.rate).filter((rate) => rate !== null);
  const median = medianNumber(rates);
  return {
    requirements,
    rates,
    sampleCount: rates.length,
    median,
    min: rates.length ? Math.min(...rates) : null,
    max: rates.length ? Math.max(...rates) : null,
    enoughData: rates.length >= LABOUR_MARKET_MIN_RATE_SAMPLE,
  };
}

function labourMarketBenchmarkForRequirement(req, job) {
  const stats = labourMarketRateStats(
    {
      trade: req?.trade || job?.trade || "",
      specialism: "",
      location: marketJobLocation(job).label,
      dateFrom: "",
      dateTo: "",
    },
    { excludeJobId: job?.id || "" },
  );
  const rate = marketRequirementRate(req, job);
  if (!stats.enoughData || !rate || !stats.median || rate >= stats.median) return null;
  return {
    ...stats,
    rate,
    gap: stats.median - rate,
  };
}

function addCalendarDaysISO(value, days) {
  const base = dateOnlyMs(value);
  if (base === null) return "";
  const date = new Date(base + days * 86400000);
  return date.toISOString().slice(0, 10);
}

function normaliseMarketFilters(filters = activeMarketFilters) {
  const dateFrom = filters.dateFrom || "";
  return {
    ...filters,
    dateFrom,
    dateTo: dateFrom ? addCalendarDaysISO(dateFrom, 30) : "",
  };
}

function labourMarketSupplyDemandIndicator(workerCount, requirementCount) {
  if (!requirementCount && workerCount) return { label: "Strong availability", tone: "good" };
  if (requirementCount > workerCount) return { label: "High demand relative to available workers", tone: "warn" };
  if (workerCount >= requirementCount * 2 && requirementCount > 0) return { label: "Strong availability", tone: "good" };
  return { label: "Balanced", tone: "info" };
}

function labourMarketModel(filters = activeMarketFilters) {
  filters = normaliseMarketFilters(filters);
  const workers = availableMarketWorkers(filters);
  const requirements = liveMarketRequirements(filters);
  const rateStats = labourMarketRateStats(filters);
  const regions = new Map();
  workers.forEach((worker) => {
    const location = marketWorkerLocation(worker);
    const key = location.label;
    const entry = regions.get(key) || {
      label: key,
      count: 0,
      verifiedCount: 0,
      trades: new Map(),
      specialisms: new Map(),
      radiusEligible: 0,
    };
    entry.count += 1;
    if (location.verified) entry.verifiedCount += 1;
    if (Number(worker.travelRadiusMiles || 0) > 0) entry.radiusEligible += 1;
    const trade = worker.trade || "Trade unverified";
    entry.trades.set(trade, (entry.trades.get(trade) || 0) + 1);
    const spec = worker.specialism || worker.grade || "Specialism unverified";
    entry.specialisms.set(spec, (entry.specialisms.get(spec) || 0) + 1);
    regions.set(key, entry);
  });
  const regionCards = Array.from(regions.values())
    .map((entry) => ({
      ...entry,
      topTrade: Array.from(entry.trades.entries()).sort((a, b) => b[1] - a[1])[0] || ["Trade unverified", 0],
      topSpecialism: Array.from(entry.specialisms.entries()).sort((a, b) => b[1] - a[1])[0] || ["Specialism unverified", 0],
      estimated: entry.verifiedCount < entry.count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const indicator = labourMarketSupplyDemandIndicator(workers.length, requirements.length);
  const trades = Array.from(new Set([
    ...state.workers.map((worker) => worker.trade).filter(Boolean),
    ...state.jobs.flatMap((job) => labourRequirementsForJob(job).map((req) => req.trade || job.trade).filter(Boolean)),
  ])).sort((a, b) => a.localeCompare(b));
  const specialisms = Array.from(new Set([
    ...state.workers.map((worker) => worker.specialism || worker.grade).filter(Boolean),
    ...state.jobs.flatMap((job) => labourRequirementsForJob(job).map((req) => marketRequirementSpecialism(req, job)).filter(Boolean)),
  ])).sort((a, b) => a.localeCompare(b));
  const locations = Array.from(new Set([
    ...state.workers.map((worker) => marketWorkerLocation(worker).label).filter(Boolean),
    ...state.jobs.map((job) => marketJobLocation(job).label).filter(Boolean),
  ])).sort((a, b) => a.localeCompare(b));
  return {
    workers,
    requirements,
    rateStats,
    regions: regionCards,
    indicator,
    filters: { ...filters },
    options: { trades, specialisms, locations },
  };
}

function firstNameForUser(user) {
  const value =
    user?.fullName ||
    user?.name ||
    user?.displayName ||
    user?.contactName ||
    "";
  const first = String(value).trim().split(/\s+/)[0] || "";
  if (first.length < 2) return "";
  if (first.length <= 3 && first === first.toUpperCase()) return "";
  return first;
}

function companyDailyBriefingHTML(summary, user) {
  const briefing = companyDailyBriefingModel(summary, user);
  const isEmpty = !summary.companyJobs.length;
  return `<section class="company-dashboard-command">
    <div class="company-dashboard-hero">
      <article class="company-ops-summary company-dashboard-section-card jw-card">
        <div class="company-ops-summary-head">
          <div>
            <p class="company-home-kicker">TODAY'S OPERATIONAL SUMMARY</p>
            ${!isEmpty ? `<p>${escapeHtml(briefing.summaryCopy)}</p>` : ""}
          </div>
        </div>
        ${isEmpty
           ? `<div class="company-dashboard-empty-state company-dashboard-empty-state--summary">
               <strong class="company-dashboard-state-title">No project activity yet</strong>
               <span class="company-dashboard-state-copy">Create your first project to begin tracking labour, attendance and upcoming work.</span>
              <button class="primary-btn" type="button" data-company-request-labour>Request labour</button>
            </div>`
          : `<div class="company-briefing-metrics">${briefing.metrics.map(companyDashboardMetricHTML).join("")}</div>`}
      </article>
      ${companyDashboardActionHeroHTML(briefing.action)}
    </div>
    <section class="company-command-section company-live-sites-panel company-dashboard-section-card jw-card">
      <div class="company-command-section-head">
        <div>
          <p class="company-home-kicker">LIVE SITES</p>
        </div>
         <small class="company-dashboard-context-label">${briefing.siteRows.length ? `${briefing.siteRows.length} scheduled today` : "No attendance due today"}</small>
      </div>
      ${briefing.siteRows.length
        ? `<div class="company-live-site-cards">${briefing.siteRows.map(companyLiveSiteStatusCardHTML).join("")}</div>`
        : `<div class="company-dashboard-empty-state">
             <strong class="company-dashboard-state-title">No sites active today</strong>
             <span class="company-dashboard-state-copy">Sites with sub-contractors due today will appear here.</span>
          </div>`}
    </section>
    <section class="company-command-section company-upcoming-panel company-dashboard-section-card jw-card">
      <div class="company-command-section-head">
        <div>
          <p class="company-home-kicker">UPCOMING SITES</p>
        </div>
         <small class="company-dashboard-context-label">Next 7 days</small>
      </div>
      ${briefing.upcoming.length
        ? `<div class="company-upcoming-timeline">${briefing.upcoming.map(companyDashboardUpcomingCardHTML).join("")}</div>`
        : `<div class="company-dashboard-empty-state compact">
             <strong class="company-dashboard-state-title">No upcoming starts</strong>
             <span class="company-dashboard-state-copy">Projects starting in the next 7 days will appear here.</span>
          </div>`}
    </section>
  </section>`;
}

function companyDashboardActionHeroHTML(action) {
  if (!action) {
    return `<article class="company-action-hero company-action-hero-clear company-dashboard-section-card jw-card">
       <div>
        <p class="company-home-kicker">ACTION REQUIRED</p>
         <h3 class="company-dashboard-state-title">No action required</h3>
         <p class="company-dashboard-state-copy">Items requiring your attention will appear here.</p>
      </div>
    </article>`;
  }
  return `<article class="company-action-hero ${escapeHtml(action.tone)} company-dashboard-section-card jw-card">
    <span class="company-action-dot" aria-hidden="true"></span>
    <span class="company-action-hero-content">
      <span class="company-home-kicker">ACTION REQUIRED</span>
       <strong class="company-dashboard-state-title">${escapeHtml(action.title)}</strong>
       <span class="company-dashboard-state-copy">${escapeHtml(action.body)}</span>
      ${action.meta ? `<small>${escapeHtml(action.meta)}</small>` : ""}
    </span>
    <button class="primary-btn company-action-hero-cta" type="button" ${action.actionAttr}>${escapeHtml(action.actionLabel)} &rarr;</button>
  </article>`;
}

function companyDashboardMetricHTML(item) {
  const attrs = item.actionAttr || "";
  const tag = attrs ? "button" : "div";
  const accessibleLabel = item.accessibleLabel
    ? `aria-label="${escapeHtml(item.accessibleLabel)}"`
    : "";
  return `<${tag} class="company-briefing-metric ${item.tone}${attrs ? " is-clickable" : ""}" ${attrs} ${accessibleLabel} ${tag === "button" ? 'type="button"' : ""}>
    <strong>${item.value}</strong>
    <span>${escapeHtml(item.label)}</span>
    ${attrs ? `<span class="company-briefing-metric-chevron">${onsiteIcon("chevronRight", 16)}</span>` : ""}
  </${tag}>`;
}

function companyDailyBriefingModel(summary, user) {
  const kpis = companyDashboardKpiData(summary);
  const { scheduledToday, workersExpectedToday } = kpis;
  const metrics = [
    {
      label: "Projects scheduled today",
      value: kpis.projectsScheduledToday,
      tone: kpis.projectsScheduledToday ? "neutral" : "muted",
      actionAttr: 'data-dashboard-kpi="scheduled_today"',
      accessibleLabel: `${kpis.projectsScheduledToday} projects scheduled today — open filtered Projects`,
    },
    {
      label: "Workers expected today",
      value: workersExpectedToday,
      tone: workersExpectedToday ? "neutral" : "muted",
      actionAttr: 'data-dashboard-kpi="workers_expected_today"',
      accessibleLabel: `${workersExpectedToday} workers expected today — open filtered Attendance`,
    },
    {
      label: "Open labour requirements",
      value: kpis.openLabourRequirements,
      tone: kpis.openLabourRequirements ? "warn" : "neutral",
      actionAttr: 'data-dashboard-kpi="open_labour_requirements"',
      accessibleLabel: `${kpis.openLabourRequirements} open labour requirements — open filtered Projects`,
    },
    {
      label: "Starting next 7 days",
      value: kpis.startingNext7Days,
      tone: kpis.startingNext7Days ? "neutral" : "muted",
      actionAttr: 'data-dashboard-kpi="starting_next_7_days"',
      accessibleLabel: `${kpis.startingNext7Days} projects starting in the next 7 days — open filtered Projects`,
    },
  ];
  const focus = companyDashboardFocusModel(summary, user);
  const primaryAction = briefingRecommendedAction(summary, focus);
  const open = Number(summary.openRequirements || 0);
  const scheduledCount = scheduledToday.length;
  const firstName = firstNameForUser(user);
  return {
    dayPart: dashboardGreetingPart(),
    firstName,
    summaryTitle: scheduledCount
      ? `${scheduledCount} project${scheduledCount === 1 ? "" : "s"} scheduled today`
      : open
        ? `${open} open labour place${open === 1 ? "" : "s"} to resolve`
        : `Good ${dashboardGreetingPart()}${firstName ? `, ${firstName}` : ""}`,
    summaryCopy: workersExpectedToday
      ? `${workersExpectedToday} worker${workersExpectedToday === 1 ? "" : "s"} expected across today's live sites.`
      : open
        ? "Start by reviewing the open labour requirements most likely to affect delivery."
        : "No live site attendance is currently due today.",
    metrics,
    action: primaryAction,
    siteRows: scheduledToday
      .sort((a, b) => b.expectedToday - a.expectedToday || projectDateValue(a.job.start) - projectDateValue(b.job.start))
      .slice(0, 5)
      .map(companyLiveSiteStatusModel),
    upcoming: companyDashboardUpcomingItems(summary).slice(0, 4),
  };
}

function companyScheduledProjectSummariesToday(summary) {
  return (summary?.summaries || []).filter((projectSummary) =>
    isProjectScheduledToday(projectSummary.job),
  );
}

function isProjectScheduledToday(job, date = todayDateStr()) {
  if (!job || job.completed || job.cancelledAt || job.bookingStatus === "cancelled") return false;
  if (!isDateWithinProjectDates(job, date)) return false;
  const workingDays = normalizeWorkingDays(job.workingDays || job.defaultWorkingDays);
  const dayKey = new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long" }).toLowerCase();
  return workingDays.includes(dayKey);
}

function companyProjectOpenLabourRequirementCount(projectSummary) {
  return Math.max(0, Number(projectSummary?.openRoles || 0));
}

function companyOpenLabourRequirementCount(projectSummaries = []) {
  return projectSummaries.reduce(
    (sum, projectSummary) =>
      sum + companyProjectOpenLabourRequirementCount(projectSummary),
    0,
  );
}

function companyExpectedWorkersToday(projectSummary, date = todayDateStr()) {
  if (!isProjectScheduledToday(projectSummary?.job, date)) return 0;
  return Math.max(0, Number(projectSummary?.expectedToday || 0));
}

function isProjectStartingWithinNextDays(job, days = 7, date = todayDateStr()) {
  if (!job || job.completed || job.cancelledAt || job.bookingStatus === "cancelled") {
    return false;
  }
  const todayMs = dateOnlyMs(date);
  const startMs = dateOnlyMs(job.start || job.startDate || "");
  if (todayMs === null || startMs === null) return false;
  const daysUntilStart = Math.round((startMs - todayMs) / 86400000);
  return daysUntilStart > 0 && daysUntilStart <= days;
}

function companyProjectSummariesStartingNextDays(summary, days = 7) {
  return (summary?.summaries || []).filter((projectSummary) =>
    isProjectStartingWithinNextDays(projectSummary.job, days),
  );
}

function companyDashboardKpiData(summary) {
  const scheduledToday = companyScheduledProjectSummariesToday(summary);
  const startingNext7Days = companyProjectSummariesStartingNextDays(summary, 7);
  return {
    scheduledToday,
    projectsScheduledToday: scheduledToday.length,
    workersExpectedToday: scheduledToday.reduce(
      (sum, projectSummary) =>
        sum + companyExpectedWorkersToday(projectSummary),
      0,
    ),
    openLabourRequirements: companyOpenLabourRequirementCount(
      summary?.summaries || [],
    ),
    startingNext7Days: startingNext7Days.length,
    startingNext7DaysProjects: startingNext7Days,
  };
}

function dashboardGreetingPart() {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function briefingRecommendedAction(summary, focus) {
  const first = focus.actionItems[0];
  if (first) return first;
  if (summary.openRequirements > 0) {
    const nextShortage = focus.upcoming.find((projectSummary) => projectSummary.openRoles > 0);
    if (nextShortage) return companyDashboardShortageAction({ summary: nextShortage, shortage: mostUnderfilledRequirement(nextShortage) });
  }
  return null;
}

function companyLiveSiteStatusModel(projectSummary) {
  const unconfirmed = Math.max(0, projectSummary.expectedToday - projectSummary.signedInToday);
  let stateLabel = "No attendance expected yet";
  let stateCopy = "";
  let tone = "muted";
  if (!projectSummary.expectedToday) {
    stateLabel = "No workers scheduled today";
    stateCopy = "Attendance will appear here once workers are confirmed.";
  } else if (projectSummary.expectedToday > 0 && unconfirmed === 0 && !projectSummary.lateReports && !projectSummary.noShows) {
    stateLabel = "All signed in";
    stateCopy = "Everyone expected today has signed in.";
    tone = "ok";
  } else if (projectSummary.noShows || unconfirmed || projectSummary.lateReports) {
    const attention = projectSummary.noShows + unconfirmed + projectSummary.lateReports;
    stateLabel = projectSummary.noShows || unconfirmed ? `${attention} require attention` : "Attendance in progress";
    stateCopy = "Review attendance and late reports for this site.";
    tone = projectSummary.noShows || unconfirmed ? "warn" : "info";
  } else if (projectSummary.expectedToday > 0) {
    stateLabel = "Attendance in progress";
    stateCopy = "Workers are due to sign in today.";
    tone = "info";
  }
  const health = calculateProjectHealth(projectSummary.job, projectSummary);
  const hasAttendance =
    projectSummary.expectedToday > 0 ||
    (Array.isArray(projectSummary.todayRecords) && projectSummary.todayRecords.length > 0);
  const action = hasAttendance
    ? {
        label: "Open Attendance",
        attrs: `data-dashboard-attendance-project="${escapeHtml(projectSummary.job.id)}"`,
      }
    : projectSummary.openRoles > 0
      ? {
          label: "Review requirement",
          attrs: `data-company-project-open-section="${escapeHtml(projectSummary.job.id)}" data-company-section-target="requirements"`,
        }
      : {
          label: "View project",
          attrs: `data-company-project-open="${escapeHtml(projectSummary.job.id)}"`,
        };
  return {
    job: projectSummary.job,
    health,
    healthTone:
      health.level === "urgent"
        ? "urgent"
        : health.level === "atRisk"
          ? "at-risk"
          : health.level === "filled"
            ? "healthy"
            : "neutral",
    expected: projectSummary.expectedToday,
    signedIn: projectSummary.signedInToday,
    late: projectSummary.lateReports,
    unconfirmed,
    stateLabel,
    stateCopy,
    tone,
    action,
  };
}

function companyLiveSiteStatusRowHTML(item) {
  return `<button class="company-live-site-row" type="button" data-dashboard-attendance-project="${escapeHtml(item.job.id)}">
    <span class="company-live-site-project">
      <strong>${escapeHtml(companyProjectTitle(item.job))}</strong>
      <span>${escapeHtml(item.job.jobNumber || "No job number")} · ${escapeHtml(item.job.location || item.job.siteAddress || "Location TBC")}</span>
    </span>
    <span data-label="Expected"><strong>${item.expected}</strong></span>
    <span data-label="Signed in"><strong>${item.signedIn}</strong></span>
    <span data-label="Late"><strong>${item.late}</strong></span>
    <span data-label="Unconfirmed"><strong>${item.unconfirmed}</strong></span>
    <span class="company-live-site-state ${escapeHtml(item.tone)}">${escapeHtml(item.stateLabel)}</span>
  </button>`;
}

function companyLiveSiteStatusCardHTML(item) {
  return `<article class="company-live-site-card ${escapeHtml(item.tone)}">
    <button class="company-live-site-card-open" type="button" data-company-project-open="${escapeHtml(item.job.id)}" aria-label="Open ${escapeHtml(companyProjectTitle(item.job))} project"></button>
    <span class="company-live-site-card-top">
      <span>
        <span class="company-home-kicker">PROJECT</span>
        <strong>${escapeHtml(companyProjectTitle(item.job))}</strong>
        <small>${escapeHtml(item.job.jobNumber || "No job number")} · ${escapeHtml(item.job.location || item.job.siteAddress || "Location TBC")}</small>
      </span>
      <span class="company-live-site-state health-${escapeHtml(item.healthTone)}">${escapeHtml(item.health?.label || item.stateLabel)}</span>
    </span>
    <span class="company-live-site-card-metrics">
      ${companyLiveSiteMetricHTML("Expected", item.expected)}
      ${companyLiveSiteMetricHTML("Signed in", item.signedIn)}
      ${companyLiveSiteMetricHTML("Late", item.late, item.late ? "warn" : "")}
      ${companyLiveSiteMetricHTML("Unconfirmed", item.unconfirmed, item.unconfirmed ? "warn" : "")}
    </span>
    <span class="company-live-site-card-state">
      <strong>${escapeHtml(item.stateLabel)}</strong>
      <small>${escapeHtml(item.stateCopy)}</small>
    </span>
    <button class="company-live-site-card-action" type="button" ${item.action.attrs}>${escapeHtml(item.action.label)} &rarr;</button>
  </article>`;
}

function companyLiveSiteMetricHTML(label, value, tone = "") {
  return `<span class="company-live-site-metric ${escapeHtml(tone)}">
    <strong>${value}</strong>
    <small>${escapeHtml(label)}</small>
  </span>`;
}

function companyDashboardHealthTone(health = {}) {
  if (health.level === "urgent") return "critical";
  if (health.level === "atRisk") return "warning";
  if (health.level === "filled") return "success";
  return "neutral";
}

function companyDashboardUpcomingItems(summary) {
  const items = [];
  const summariesByProjectId = new Map(
    (summary.summaries || []).map((projectSummary) => [projectSummary.job?.id, projectSummary]),
  );
  (summary.summaries || []).forEach((projectSummary) => {
    const job = projectSummary.job;
    const days = projectStartDays(job);
    const healthTone = companyDashboardHealthTone(calculateProjectHealth(job, projectSummary));
    if (days !== null && days >= 0 && days <= 7) {
      items.push({
        key: `start:${job.id}`,
        tone: healthTone,
        timing: startTimingLabel(days),
        projectTitle: companyProjectTitle(job),
        jobNumber: job.jobNumber || "",
        openCount: projectSummary.openRoles,
        title: `${companyProjectTitle(job)} starts ${relativeProjectDayLabel(days)}`,
        body: projectSummary.openRoles
          ? `${projectSummary.openRoles} labour place${projectSummary.openRoles === 1 ? "" : "s"} still open.`
          : "Site setup and attendance readiness can be reviewed.",
        meta: job.jobNumber || job.location || "Project",
        actionLabel: projectSummary.openRoles ? "Review requirement" : "Check setup",
        actionAttr: `data-company-project-open-section="${escapeHtml(job.id)}" data-company-section-target="${projectSummary.openRoles ? "requirements" : "overview"}"`,
        sort: days,
      });
    }
    if (projectSummary.pendingOffers.length) {
      items.push({
        key: `offers:${job.id}`,
        tone: healthTone,
        timing: "Awaiting response",
        projectTitle: companyProjectTitle(job),
        jobNumber: job.jobNumber || "",
        openCount: projectSummary.openRoles,
        title: `${projectSummary.pendingOffers.length} offer${projectSummary.pendingOffers.length === 1 ? "" : "s"} awaiting response`,
         body: `${companyProjectTitle(job)} has open sub-contractor offer decisions.`,
        meta: "Offers",
        actionLabel: "View workers",
        actionAttr: `data-company-project-open-section="${escapeHtml(job.id)}" data-company-section-target="workforce"`,
        sort: days ?? 99,
      });
    }
    if (projectSummary.reviewWorkers.length) {
      items.push({
        key: `review:${job.id}`,
        tone: healthTone,
        timing: "Company decision",
        projectTitle: companyProjectTitle(job),
        jobNumber: job.jobNumber || "",
        openCount: projectSummary.openRoles,
         title: `${projectSummary.reviewWorkers.length} sub-contractor${projectSummary.reviewWorkers.length === 1 ? "" : "s"} awaiting approval`,
         body: `${companyProjectTitle(job)} needs a hiring company decision before assignment is confirmed.`,
         meta: "Sub-contractor approval",
         actionLabel: "Review sub-contractors",
        actionAttr: `data-company-project-open-section="${escapeHtml(job.id)}" data-company-section-target="workforce"`,
        sort: days ?? 98,
      });
    }
  });
  (summary.upcomingLabourChanges || []).slice(0, 4).forEach((item) => {
    const projectSummary = summariesByProjectId.get(item.job.id);
    items.push({
      key: `labour:${item.job.id}:${item.change.id || item.change.startDate}`,
      tone: companyDashboardHealthTone(calculateProjectHealth(item.job, projectSummary)),
      timing: `Changes ${relativeProjectDayLabel(item.daysUntil ?? 0)}`,
      projectTitle: companyProjectTitle(item.job),
      jobNumber: item.job.jobNumber || "",
      openCount: Number(item.change.quantity) || 0,
      title: labourForecastTitle(item),
      body: `${formatDateOnly(item.change.startDate)} · ${item.change.previousQuantity} to ${item.change.quantity} required${item.change.phase ? ` · ${item.change.phase}` : ""}`,
      meta: item.job.jobNumber || item.job.location || "Labour schedule",
      actionLabel: "Review schedule",
      actionAttr: `data-company-project-open-section="${escapeHtml(item.job.id)}" data-company-section-target="requirements"`,
      sort: item.daysUntil ?? 97,
    });
  });
  return items
    .filter((item, index, arr) => arr.findIndex((candidate) => candidate.key === item.key) === index)
    .sort((a, b) => (a.sort ?? 99) - (b.sort ?? 99));
}

function relativeProjectDayLabel(days) {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

function startTimingLabel(days) {
  if (days === 0) return "Starts today";
  if (days === 1) return "Starts tomorrow";
  return `Starts in ${days} days`;
}

function labourForecastTitle(item) {
  const delta = Number(item.delta) || 0;
  const amount = Math.abs(delta);
  const trade = pluralizeTradeLabel(item.req?.trade || "worker", amount || 1);
  if (delta > 0) return `${companyProjectTitle(item.job)} needs ${amount} additional ${trade}`;
  if (delta < 0) return `${companyProjectTitle(item.job)} requirement reduces by ${amount} ${trade}`;
  return `${companyProjectTitle(item.job)} labour schedule changes`;
}

function companyDashboardUpcomingRowHTML(item) {
  return `<button class="company-upcoming-row ${escapeHtml(item.tone || "info")}" type="button" ${item.actionAttr}>
    <span class="company-action-dot" aria-hidden="true"></span>
    <span class="company-upcoming-main">
      <strong>${escapeHtml(item.title)}</strong>
      <small>${escapeHtml(item.body || "")}</small>
    </span>
    <span class="company-upcoming-meta">
      <small>${escapeHtml(item.meta || "")}</small>
      <strong>${escapeHtml(item.actionLabel || "Open")}</strong>
    </span>
  </button>`;
}

function companyDashboardUpcomingCardHTML(item) {
  return `<button class="company-upcoming-card ${escapeHtml(item.tone || "info")}" type="button" ${item.actionAttr}>
    <span class="company-upcoming-marker" aria-hidden="true"></span>
    <span class="company-upcoming-card-main">
      <small>${escapeHtml(item.timing || item.meta || "Upcoming")}</small>
      <strong>${escapeHtml(item.projectTitle || item.title)}</strong>
      <span>${escapeHtml(item.jobNumber || item.meta || "Project")}${item.openCount ? ` · ${item.openCount} labour place${item.openCount === 1 ? "" : "s"} open` : ""}</span>
    </span>
    <span class="company-upcoming-card-action">${escapeHtml(item.actionLabel || "Open")} &rarr;</span>
  </button>`;
}

function companyLabourForecastRowHTML(item) {
  const change = item.change;
  const delta = Number(item.delta) || 0;
  const direction = delta > 0 ? "needs" : "reduces by";
  const amount = Math.abs(delta);
  const when = item.daysUntil === 0
    ? "today"
    : item.daysUntil === 1
      ? "tomorrow"
      : `in ${item.daysUntil} days`;
  const label = delta
    ? `${companyProjectTitle(item.job)} ${direction} ${amount} ${pluralizeTradeLabel(item.req.trade || "worker", amount)} ${when}.`
    : `${companyProjectTitle(item.job)} changes ${item.req.trade || "labour"} requirement ${when}.`;
  return `<button class="company-recent-activity-row warning" type="button" data-company-project-open-section="${escapeHtml(item.job.id)}" data-company-section-target="requirements">
    <span class="company-action-dot" aria-hidden="true"></span>
    <div>
      <strong>${escapeHtml(label)}</strong>
      <p>${escapeHtml(formatDateOnly(change.startDate))} to ${escapeHtml(formatDateOnly(change.endDate))} · ${change.previousQuantity} to ${change.quantity} required${change.phase ? ` · ${escapeHtml(change.phase)}` : ""}</p>
    </div>
  </button>`;
}

function companyDashboardFocusHTML(summary, user) {
  return companyDailyBriefingHTML(summary, user);
}

function companyRecentActivityHTML(summary, user) {
  const rows = companyRecentActivityItems(user, summary).slice(0, 5);
  return `<section class="company-recent-activity company-dashboard-section-card jw-card">
    <div class="company-recent-activity-head">
      <div>
        <p class="company-home-kicker">RECENT ACTIVITY</p>
      </div>
      ${rows.length ? `<button class="company-recent-activity-view-all" type="button" data-empty-tab="notifications">View all activity &rarr;</button>` : ""}
    </div>
    <div class="company-recent-activity-list">
      ${rows.length
        ? rows.map(companyRecentActivityRowHTML).join("")
          : `<div class="company-dashboard-empty-state compact">
             <strong class="company-dashboard-state-title">No recent activity</strong>
             <span class="company-dashboard-state-copy">Project, attendance and offer updates will appear here.</span>
          </div>`}
    </div>
  </section>`;
}

function companyRecentActivityItems(user, summary = companyDashboardSummary(user)) {
  const companyProjectIds = new Set(summary.companyJobs.map((job) => job.id));
  const fromStore = (state.projectActivities || []).filter(
    (item) => comIn QR</button>
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
// validates the active project sign-in token without opening a real camera yet.
async function workerScanCheckIn(uid, workerObj) {
  const today = todayDateStr();
  const job = assignedJobForWorker(uid);
  if (!job) {
    showToast("You're not assigned to a site today");
    return;
  }
  const dailyJob = dailyJobForDate(job, today);

  if (!bookingAgreementActive(job)) {
    showToast("Accept your Job Agreement before checking in");
    const agr = agreementForJob(job);
    if (agr) openAgreementModal(agr.id);
    return;
  }

  const code = activeSiteCode(job.id);
  if (!code) {
    showToast(
      "No active site sign-in QR is available for this project today",
    );
    return;
  }
  if (!companyAssignedWorkers(job).some((worker) => worker.id === uid)) {
    showToast("You're not assigned to this project");
    return;
  }
  if (!isDateWithinProjectDates(job, today)) {
    showToast("This project QR is not active today");
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
    (r) => r.workerId === uid && r.jobId === job.id && r.date === today,
  );
  if (previous?.status === "checkedIn" || previous?.scanToken || previous?.checkInTime) {
    showToast("You're already signed in for this project today");
    return;
  }
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
    jobLocation: dailyJob?.siteAddress || dailyJob?.location || job.location || "",
    projectName: job.projectName || job.siteName || "",
    siteName: dailyJob?.clientSiteName || job.siteName || "",
    jobNumber: dailyJob?.companyJobNumber || job.jobNumber || "",
    dailyJobId: dailyJob?.id || "",
    clientSiteName: dailyJob?.clientSiteName || "",
    dailySiteAddress: dailyJob?.siteAddress || "",
    dailyClientReference: dailyJob?.clientReference || "",
    invoiceReference: dailyJob?.invoiceReference || "",
    workNotes: dailyJob?.workNotes || "",
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
    qrScope: code.scope || "project",
    qrDate: today,
    scanToken: code.token,
  };
  rec.commercial = attendanceCommercialSnapshot(rec, job);
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
    (r) => !(r.workerId === uid && r.jobId === job.id && r.date === today),
  );
  attendanceRecords.unshift(rec);
  saveAttendanceRecords();

  logActivity(
    "attend",
    `<strong>${escapeHtml(workerObj.name)}</strong> scanned in at ${escapeHtml(job.location)} — pending approval`,
  );
  addProjectActivity(job, {
    type: PROJECT_ACTIVITY_TYPES.WORKER_SIGNED_IN,
    title: `${workerObj.name} signed in.`,
    description: `Sign-in time ${rec.scanTime || formatUKTime(scanMs)}.`,
    workerId: uid,
    timestamp: new Date(scanMs).toISOString(),
    source: "site_sign_in_qr",
    severity: "success",
    metadata: {
      attendanceRecordId: rec.id,
      date: today,
      status: suggested,
    },
    dedupeKey: `worker_signed_in:${job.id}:${uid}:${today}`,
  });
  saveState();
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
  const currentAssignment = state.jobs.find((job) => job.assignedWorkerId === uid && !job.completed);
  const lateReports = myRecs.filter((rec) => rec.lateReport);
  const confirmedDays = myRecs.filter((rec) => rec.supervisorConfirmed || ["onTime", "late", "noShow"].includes(rec.status));

  const tsHeader = document.querySelector("#tab-attendance .ts-header");
  const assignmentPanel = `
    <div class="worker-timesheet-panel">
      <div class="worker-section-head">
        <h2>Current assignment</h2>
        <span>${currentAssignment ? "Active" : "None"}</span>
      </div>
      ${
        currentAssignment
          ? `<div class="worker-flow-card">
              <h3>${escapeHtml(currentAssignment.trade)} · ${escapeHtml(currentAssignment.location)}</h3>
              <div class="worker-flow-meta">${currentAssignment.start ? formatDate(currentAssignment.start) : "Start TBC"} · ${escapeHtml(jobExpectedStartTime(currentAssignment))}${currentAssignment.shiftFinishTime ? ` to ${escapeHtml(currentAssignment.shiftFinishTime)}` : ""}</div>
              <div class="worker-flow-actions">
                <button class="secondary-btn" type="button" data-map-job="${currentAssignment.id}">Site Details</button>
              </div>
            </div>`
          : guidedEmptyStateHTML({
              kicker: "Assignment",
              title: "No active assignment",
              body: "Confirmed work will appear here once a company accepts you and the agreement is ready.",
              actionLabel: "View Offers",
              actionTab: "offers",
            })
      }
    </div>`;

  if (!myRecs.length) {
    histEl.innerHTML =
      assignmentPanel +
      guidedEmptyStateHTML({
        kicker: "Timesheet",
        title: "No attendance history yet",
        body: "Your signed-in days, late reports and weekly confirmations will appear here after your first confirmed shift.",
      }) +
      workerPaymentsSection(user);
    histEl.querySelectorAll("[data-map-job]").forEach((btn) => {
      btn.addEventListener("click", () => openSiteMap(btn.dataset.mapJob));
    });
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
      <div class="ts-summary-item">
        <div class="ts-summary-val">${lateReports.length}</div>
        <div class="ts-summary-lbl">Late Reports</div>
      </div>
      <div class="ts-summary-item">
        <div class="ts-summary-val">${confirmedDays.length}</div>
        <div class="ts-summary-lbl">Confirmed</div>
      </div>
    </div>`;

  const rows = myRecs
    .map((rec) => {
      const cfg = ATT_CFG[rec.status] || ATT_CFG.notRequired;
      const stars = rec.rating
        ? `<span class="ts-stars">${"★".repeat(rec.rating)}${"☆".repeat(5 - rec.rating)}</span>`
        : "";
      const job = state.jobs.find((j) => j.assignedWorkerId === uid);
      const siteLabel =
        rec.clientSiteName ||
        rec.dailySiteAddress ||
        rec.jobLocation ||
        job?.location ||
        "";
      const site = siteLabel
        ? `<span class="ts-site">${escapeHtml(siteLabel)}</span>`
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

  const lateReportRows = lateReports.length
    ? `<div class="worker-timesheet-panel">
        <div class="worker-section-head"><h2>Late reports submitted</h2><span>${lateReports.length}</span></div>
        ${lateReports
          .slice(0, 5)
          .map((rec) => `<div class="worker-flow-card"><h3>${formatAttDate(rec.date)}</h3><div class="worker-flow-meta">${escapeHtml(rec.lateReport.reason || "Other")} · ETA ${escapeHtml(rec.lateReport.estimatedArrivalTime || "—")}${rec.lateReport.supervisorDecision ? ` · ${escapeHtml(LATE_CLASSIFICATION[rec.lateReport.supervisorDecision] || rec.lateReport.supervisorDecision)}` : ""}</div></div>`)
          .join("")}
      </div>`
    : "";

  histEl.innerHTML =
    assignmentPanel +
    summaryBar +
    `<div class="ts-rows">${rows}</div>` +
    lateReportRows +
    workerPaymentsSection(user);

  // Wire dispute buttons for workers
  histEl.querySelectorAll("[data-dispute-record]").forEach((btn) => {
    btn.addEventListener("click", () =>
      openDisputeModal(btn.dataset.disputeRecord),
    );
  });
  histEl.querySelectorAll("[data-map-job]").forEach((btn) => {
    btn.addEventListener("click", () => openSiteMap(btn.dataset.mapJob));
  });
}

// ─── Render Attendance Tab ─────────────────────────────────
function renderAttendance() {
  const user = getSessionUser();
  const isAdmin = !user;
  if (user?.type === "company") {
    if (window.location.hash.startsWith("#attendance/project/")) {
      syncAttendanceProjectFromHash();
      switchTab("attendance", { scroll: false });
    }
    const projects = companyAttendanceProjects(user);
    if (
      activeAttendanceProjectId &&
      !projects.some((job) => job.id === activeAttendanceProjectId)
    ) {
      activeAttendanceProjectId = "";
    }
    const visibleProjects = filterAttendanceProjects(projects);
    const selectedProject = projects.find((job) => job.id === activeAttendanceProjectId) || null;
    if (selectedProject) qrSelectedJobId = selectedProject.id;
    renderCompanyAttendanceShell(user, selectedProject, visibleProjects, projects);
    const badge = document.getElementById("attTodayBadge");
    if (badge) badge.textContent = formatAttDate(todayDateStr());
    bindCompanyAttendanceProjectControls(document.getElementById("tab-attendance"));
    bindLabourRequestWorkflow(document.getElementById("tab-attendance"));
    renderAttendanceDemoControls();
    if (!selectedProject) return;
  }

  const container = document.getElementById("attendanceCards");
  const histEl = document.getElementById("attendanceHistory");
  const badge = document.getElementById("attTodayBadge");
  if (!container) return;

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
    submitBtn.onclick = submitDayAttendance;
  }

  if (badge) badge.textContent = formatAttDate(todayDateStr());

  const today = todayDateStr();
  const selectedProject =
    user?.type === "company" && activeAttendanceProjectId
      ? findJob(activeAttendanceProjectId)
      : null;
  const rosterWorkers = selectedProject
    ? attendanceProjectWorkers(selectedProject)
    : state.workers;
  const workerIdSet = selectedProject
    ? new Set(rosterWorkers.map((worker) => worker.id))
    : null;
  const scopedTodayRecords = attendanceRecords.filter(
    (r) =>
      r.date === today &&
      (!selectedProject ||
        attendanceRecordMatchesProject(r, selectedProject, workerIdSet)),
  );

  renderAttendanceDemoControls();

  // Daily site QR generator (supervisor / admin)
  renderSiteQrPanel();

  // Pre-fill todayAttendanceMap from saved records (skip pure check-in /
  // reported-issue records so the supervisor still chooses a final status).
  attendanceRecords
    .filter(
      (r) =>
        r.date === today &&
        (!selectedProject ||
          attendanceRecordMatchesProject(r, selectedProject, workerIdSet))
    )
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
    scopedTodayRecords
      .filter((r) => !r.selfReported)
      .map((r) => r.workerId),
  );
  const unmarkedCount = rosterWorkers.filter(
    (w) => !companyMarkedToday.has(w.id),
  ).length;
  const requiredBanner =
    rosterWorkers.length > 0
      ? `
    <div class="att-required-banner ${unmarkedCount === 0 ? "att-req-complete" : "att-req-pending"}">
      ${
        unmarkedCount === 0
          ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
           All ${rosterWorkers.length} workers marked for today`
          : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
           <strong>${unmarkedCount} worker${unmarkedCount !== 1 ? "s" : ""} not yet marked today</strong> — attendance is required daily`
      }
    </div>`
      : "";

  // Bulk-approve checked-in workers (apply each suggested status, then confirm)
  const checkedInToday = scopedTodayRecords.filter(
    (r) => r.status === "checkedIn",
  );
  const bulkBar = checkedInToday.length
    ? `
    <div class="att-bulk-bar">
      <span>${checkedInToday.length} worker${checkedInToday.length !== 1 ? "s" : ""} checked in awaiting confirmation</span>
      <button class="att-bulk-btn" id="bulkApproveBtn" type="button">Approve all checked-in</button>
    </div>`
    : "";

  container.innerHTML =
    (selectedProject ? attendanceLiveSummaryHTML(rosterWorkers, selectedProject, today) : "") +
    (!selectedProject && rosterWorkers.length > 0 ? requiredBanner : "") +
    bulkBar +
    (selectedProject
      ? groupedAttendanceCardsHTML(rosterWorkers, selectedProject, today)
      : rosterWorkers.length
      ? rosterWorkers.map((w) => attendanceCard(w, today)).join("")
      : guidedEmptyStateHTML({
          kicker: selectedProject ? "Attendance Roster" : "Roster",
       title: selectedProject
             ? "No sub-contractors assigned to this project"
             : "No sub-contractors in the roster",
           body: selectedProject
             ? "Assign sub-contractors to this project before confirming daily attendance."
             : "Add sub-contractor profiles before using the attendance review tools.",
           actionLabel: selectedProject ? "Back to Attendance" : "Add Sub-contractor",
          actionTab: selectedProject ? "attendance" : "add",
        }));
  if (rosterWorkers.length) bindAttendanceEvents(container);

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

  if (submitBtn) {
    const hasChanges = hasAttendanceConfirmationChanges(rosterWorkers, selectedProject, today);
    submitBtn.classList.toggle("primary-btn", hasChanges);
    submitBtn.classList.toggle("secondary-btn", !hasChanges);
    submitBtn.disabled = rosterWorkers.length === 0;
  }

  // Admin-only attendance review (full audit incl. exception counters)
  renderAdminAttendanceReview();

  // ── History ──
  const pastDates = [
    ...new Set(
      (selectedProject
        ? attendanceProjectRecords(selectedProject, { includeToday: false })
        : attendanceRecords)
        .map((r) => r.date)
        .filter((d) => d !== today),
    ),
  ]
    .sort()
    .reverse()
    .slice(0, 7);

  if (!pastDates.length) {
    histEl.innerHTML = `<div class="attendance-history-inline-empty">
      <strong>No attendance history yet.</strong>
      <span>Records will appear after the first confirmed attendance submission.</span>
    </div>`;
    return;
  }
  histEl.innerHTML = pastDates
    .map((date) => {
      const recs = attendanceRecords.filter((r) => r.date === date);
      const scopedRecs = selectedProject
        ? recs.filter(
            (r) =>
              attendanceRecordMatchesProject(r, selectedProject, workerIdSet),
          )
        : recs;
      const c = {
        on: scopedRecs.filter((r) => r.status === "onTime").length,
        late: scopedRecs.filter((r) => r.status === "late").length,
        ns: scopedRecs.filter((r) => r.status === "noShow").length,
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
        ${scopedRecs
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

// ─── Project Site Sign-In QR Panel (supervisor / admin) ───
function renderSiteQrPanel() {
  const panel = document.getElementById("siteQrPanel");
  if (!panel) return;
  const user = getSessionUser();
  const scopedProject =
    user?.type === "company" && activeAttendanceProjectId
      ? findJob(activeAttendanceProjectId)
      : null;

  const liveJobs = (scopedProject
    ? [scopedProject]
    : state.jobs.filter((j) => !user?.id || companyOwnsJob(j, user.id))
  );
  if (!liveJobs.length) {
    panel.innerHTML = `
      <div class="qr-panel">
        <div class="qr-panel-head">
          <h3 class="qr-panel-title">Site Sign-In QR</h3>
        </div>
        <div class="qr-empty">Select a project to view its site sign-in QR.</div>
      </div>`;
    return;
  }

  if (scopedProject) qrSelectedJobId = scopedProject.id;
  if (!qrSelectedJobId || !liveJobs.some((j) => j.id === qrSelectedJobId)) {
    qrSelectedJobId = liveJobs[0].id;
  }
  const job = findJob(qrSelectedJobId);
  const code = ensureSiteCode(qrSelectedJobId);

  const options = liveJobs
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
