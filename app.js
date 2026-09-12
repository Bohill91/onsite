  </button>`;
}

function companyDashboardFocusModel(summary, user) {
  const healthItems = summary.summaries
    .map((projectSummary) => {
      const health = calculateProjectHealth(projectSummary.job, projectSummary);
      return { summary: projectSummary, health };
    })
    .filter((item) => item.health.requiresAction || item.health.level === "matching")
    .sort((a, b) => projectDateValue(a.summary.job.start) - projectDateValue(b.summary.job.start));
  const upcomingProjects = summary.summaries
    .filter((projectSummary) => {
      const days = projectStartDays(projectSummary.job);
      return days !== null && days >= 0 && days <= 7;
    })
    .sort((a, b) => projectDateValue(a.job.start) - projectDateValue(b.job.start));
  const unread = user?.type === "company" ? companyUnreadNotificationCount() : 0;
  const urgentProjects = healthItems.filter((item) => item.health.requiresAction);
  const attendanceIssues = summary.summaries
    .map((projectSummary) => {
      const notSignedIn = Math.max(0, projectSummary.expectedToday - projectSummary.signedInToday);
      const total = projectSummary.lateReports + projectSummary.noShows + notSignedIn;
      return { summary: projectSummary, total, notSignedIn };
    })
    .filter((item) => item.total > 0 && projectStartDays(item.summary.job) !== null && projectStartDays(item.summary.job) < 0)
    .sort((a, b) => b.total - a.total);
  const approvalItems = summary.summaries
    .map((projectSummary) => ({
      summary: projectSummary,
      total: projectSummary.pendingOffers.length + projectSummary.reviewWorkers.length,
    }))
    .filter((item) => item.total > 0)
    .sort((a, b) => b.total - a.total);
  const shortages = summary.summaries
    .map((projectSummary) => {
      const shortage = mostUnderfilledRequirement(projectSummary);
      return { summary: projectSummary, shortage };
    })
    .filter((item) => item.shortage)
    .sort((a, b) => {
      const dateDiff = projectDateValue(a.summary.job.start) - projectDateValue(b.summary.job.start);
      return dateDiff || b.shortage.stats.remaining - a.shortage.stats.remaining;
    });
  const actionableNotifications = companyVisibleNotifications(user)
    .map((notification) => notificationViewModel(notification))
    .filter((view) => view.unread && view.requiresAction)
    .slice(0, 3);
  const focusStats = [
    { label: "Projects needing action", value: urgentProjects.length, tone: urgentProjects.length ? "warn" : "ok" },
    { label: "Open labour places", value: summary.openRequirements, tone: summary.openRequirements ? "warn" : "ok" },
    { label: "Attendance issues today", value: attendanceIssues.reduce((sum, item) => sum + item.total, 0), tone: attendanceIssues.length ? "warn" : "ok" },
    { label: "Unread notifications", value: unread, tone: unread ? "info" : "ok" },
  ];
  const priorityProjectIds = new Set(urgentProjects.map((item) => item.summary.job.id));
  const actionItems = [
    ...urgentProjects.slice(0, 2).map((item) => companyDashboardHealthAction(item)),
    ...attendanceIssues.slice(0, 2).map((item) => companyDashboardAttendanceAction(item)),
    ...approvalItems.slice(0, 2).map((item) => companyDashboardApprovalAction(item)),
    ...actionableNotifications.slice(0, 2).map((view) => companyDashboardNotificationAction(view)),
    ...shortages
      .filter((item) => !priorityProjectIds.has(item.summary.job.id))
      .slice(0, 2)
      .map((item) => companyDashboardShortageAction(item)),
  ].slice(0, 5);
  const nextAction = urgentProjects[0]
    ? {
        title: `${companyProjectTitle(urgentProjects[0].summary.job)} needs attention`,
        body: urgentProjects[0].health.primaryReason || "Review the project health guidance before the start date.",
        actionLabel: "Review requirement",
        actionAttr: `data-company-project-open-section="${escapeHtml(urgentProjects[0].summary.job.id)}" data-company-section-target="requirements"`,
      }
    : attendanceIssues[0]
      ? {
          title: `${companyProjectTitle(attendanceIssues[0].summary.job)} has attendance issues`,
          body: `${attendanceIssues[0].total} attendance item${attendanceIssues[0].total === 1 ? "" : "s"} need checking today.`,
          actionLabel: "Resolve attendance",
          actionAttr: `data-dashboard-attendance-project="${escapeHtml(attendanceIssues[0].summary.job.id)}"`,
        }
    : summary.pendingActions
      ? {
         title: "Sub-contractors are waiting for review",
         body: `${summary.pendingActions} offer or approval item${summary.pendingActions === 1 ? "" : "s"} need a hiring company decision.`,
         actionLabel: "Review Sub-contractors",
          actionAttr: approvalItems[0]
            ? `data-company-project-open-section="${escapeHtml(approvalItems[0].summary.job.id)}" data-company-section-target="workers"`
            : `data-empty-tab="dashboard"`,
        }
      : upcomingProjects[0]
        ? {
            title: `${companyProjectTitle(upcomingProjects[0].job)} starts soon`,
            body: upcomingProjects[0].job.start ? `Starts ${formatDateOnly(upcomingProjects[0].job.start)}.` : "Start date is approaching.",
            actionLabel: "Check Setup",
            actionAttr: `data-company-project-open-section="${escapeHtml(upcomingProjects[0].job.id)}" data-company-section-target="site"`,
          }
        : {
            title: "Everything looks steady today",
            body: summary.activeProjects
              ? "No urgent project health, attendance or approval items are currently showing."
              : "Create a labour request to start building your first live project.",
            actionLabel: summary.activeProjects ? "View Projects" : "Request Labour",
            actionAttr: summary.activeProjects ? `data-empty-tab="dashboard"` : `data-empty-tab="request-labour"`,
          };
  return {
    primary: nextAction,
    stats: focusStats,
    actionItems: dedupeDashboardActions(actionItems),
    upcoming: upcomingProjects.slice(0, 4),
  };
}

function dedupeDashboardActions(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.jobId || ""}:${item.title}:${item.actionLabel}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function companyDashboardHealthAction(item) {
  return {
    tone: item.health.level === "urgent" ? "critical" : "warning",
    title: `${companyProjectTitle(item.summary.job)} is ${item.health.label}`,
    body: item.health.primaryReason || "Project health needs review.",
    meta: item.summary.job.jobNumber || item.summary.job.location || "Project",
    actionLabel: "Review requirement",
    actionAttr: `data-company-project-open-section="${escapeHtml(item.summary.job.id)}" data-company-section-target="requirements"`,
    jobId: item.summary.job.id,
  };
}

function companyDashboardAttendanceAction(item) {
  const parts = [];
  if (item.summary.lateReports) parts.push(`${item.summary.lateReports} late report${item.summary.lateReports === 1 ? "" : "s"}`);
  if (item.summary.noShows) parts.push(`${item.summary.noShows} no-show${item.summary.noShows === 1 ? "" : "s"}`);
  if (item.notSignedIn) parts.push(`${item.notSignedIn} not signed in`);
  return {
    tone: item.summary.noShows ? "critical" : "warning",
    title: `${companyProjectTitle(item.summary.job)} attendance needs checking`,
    body: parts.join(" · ") || "Attendance requires review today.",
    meta: "Today",
    actionLabel: "Resolve attendance",
    actionAttr: `data-dashboard-attendance-project="${escapeHtml(item.summary.job.id)}"`,
    jobId: item.summary.job.id,
  };
}

function companyDashboardApprovalAction(item) {
  return {
    tone: "info",
    title: `${companyProjectTitle(item.summary.job)} has workers to review`,
    body: `${item.total} pending offer or worker approval item${item.total === 1 ? "" : "s"}.`,
    meta: item.summary.job.jobNumber || "Worker approvals",
    actionLabel: "Review Workers",
    actionAttr: `data-company-project-open-section="${escapeHtml(item.summary.job.id)}" data-company-section-target="workers"`,
    jobId: item.summary.job.id,
  };
}

function companyDashboardNotificationAction(view) {
  const n = view.notification;
  return {
    tone: view.priority === "critical" ? "critical" : "warning",
    title: view.title,
    body: view.copy.reason || "Notification needs attention.",
    meta: view.createdLabel,
    actionLabel: view.action.label,
    actionAttr: `data-notification-action="${escapeHtml(n.id || "")}" data-notification-job="${escapeHtml(n.jobId || "")}" data-notification-section="${escapeHtml(view.action.section)}"`,
    jobId: n.jobId || "",
  };
}

function companyDashboardShortageAction(item) {
  const req = item.shortage.req;
  const stats = item.shortage.stats;
  return {
    tone: "warning",
    title: `${stats.remaining} ${pluralizeTradeLabel(req.trade || "worker", stats.remaining)} still required`,
    body: `${companyProjectTitle(item.summary.job)} still has open labour demand.`,
    meta: item.summary.job.start ? `Starts ${formatDateOnly(item.summary.job.start)}` : "Start date TBC",
    actionLabel: "Review requirement",
    actionAttr: `data-company-project-open-section="${escapeHtml(item.summary.job.id)}" data-company-section-target="requirements"`,
    jobId: item.summary.job.id,
  };
}

function companyDashboardActionItemHTML(item) {
  return `<article class="company-action-item ${escapeHtml(item.tone)}">
    <span class="company-action-dot" aria-hidden="true"></span>
    <div>
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.body)}</p>
      <small>${escapeHtml(item.meta || "")}</small>
    </div>
    <button class="secondary-btn company-action-btn" type="button" ${item.actionAttr}>${escapeHtml(item.actionLabel)}</button>
  </article>`;
}

function companyDashboardUpcomingItemHTML(projectSummary) {
  const days = projectStartDays(projectSummary.job);
  const label = days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days} days`;
  const missing = projectSummary.openRoles > 0 ? `${projectSummary.openRoles} open` : "Fully filled";
  return `<button class="company-upcoming-item" type="button" data-company-project-open-section="${escapeHtml(projectSummary.job.id)}" data-company-section-target="overview">
    <span>
      <strong>${escapeHtml(companyProjectTitle(projectSummary.job))}</strong>
      <small>${escapeHtml(projectSummary.job.jobNumber || projectSummary.job.location || "Project")}</small>
    </span>
    <span>
      <strong>${escapeHtml(label)}</strong>
      <small>${escapeHtml(missing)}</small>
    </span>
  </button>`;
}

function projectDateValue(value, fallback = Number.MAX_SAFE_INTEGER) {
  if (!value) return fallback;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : fallback;
}

function sortCompanyProjects(a, b, sortBy, user = getSessionUser() || {}) {
  const stableCompare = () =>
    companyProjectTitle(a).localeCompare(companyProjectTitle(b)) ||
    String(a.id || "").localeCompare(String(b.id || ""));
  let result = 0;
  if (sortBy === "health_priority") {
    const priority = { urgent: 0, atRisk: 1, matching: 2, filled: 3 };
    const aHealth = calculateProjectHealth(a, companyProjectSummary(a, user));
    const bHealth = calculateProjectHealth(b, companyProjectSummary(b, user));
    result = (priority[aHealth.level] ?? 4) - (priority[bHealth.level] ?? 4);
  } else if (sortBy === "name_asc") {
    result = companyProjectTitle(a).localeCompare(companyProjectTitle(b));
  } else if (sortBy === "start_asc") {
    result =
      projectDateValue(a.start || a.startDate) -
      projectDateValue(b.start || b.startDate);
  } else if (sortBy === "start_desc") {
    result =
      projectDateValue(b.start || b.startDate, 0) -
      projectDateValue(a.start || a.startDate, 0);
  } else if (sortBy === "open_desc") {
    result =
      companyProjectSummary(b, user).openRoles -
      companyProjectSummary(a, user).openRoles;
  } else if (sortBy === "created_asc") {
    result =
      projectDateValue(a.createdAt || a.postedAt || a.start, 0) -
      projectDateValue(b.createdAt || b.postedAt || b.start, 0);
  } else {
    result =
      projectDateValue(
        b.updatedAt || b.lastUpdatedAt || b.createdAt || b.postedAt || b.start,
        0,
      ) -
      projectDateValue(
        a.updatedAt || a.lastUpdatedAt || a.createdAt || a.postedAt || a.start,
        0,
      );
  }
  return result || stableCompare();
}

function projectStartDays(job) {
  return calendarDaysUntil(job?.start || job?.startDate || "");
}

function projectEndDays(job) {
  if (job?.noFixedEndDate) return null;
  return calendarDaysUntil(job?.end || job?.estimatedEndDate || job?.endDate || "");
}

function projectCreatedLeadDays(job) {
  const createdMs = dateOnlyMs(job?.createdAt || job?.postedAt || "");
  const startMs = dateOnlyMs(job?.start || job?.startDate || "");
  if (createdMs === null || startMs === null) return null;
  return Math.round((startMs - createdMs) / 86400000);
}

function expiringWorkerDocumentCount(workers, days = 30) {
  return workers.reduce((count, worker) => {
    const docs = Array.isArray(worker?.documents) ? worker.documents : [];
    return (
      count +
      docs.filter((doc) => {
        if (!doc?.expiryDate) return false;
        const daysUntil = calendarDaysUntil(doc.expiryDate);
        return daysUntil !== null && daysUntil >= 0 && daysUntil <= days;
      }).length
    );
  }, 0);
}

function overdueAttendanceApprovalCount(summary) {
  return (summary.projectAttendanceRecords || []).filter((record) => {
    const status =
      record.approvalStatus ||
      record.commercial?.approvalStatus ||
      (record.supervisorConfirmed ? "manager_reviewed" : "draft");
    const daysUntil = calendarDaysUntil(record.date);
    return (
      daysUntil !== null &&
      daysUntil < 0 &&
      ["draft", "manager_reviewed"].includes(status)
    );
  }).length;
}

function mostUnderfilledRequirement(summary) {
  return uniqueLabourRequirements(summary?.labourRequirements || [])
    .map((req) => ({ req, stats: companyRequirementStats(req, summary) }))
    .filter((item) => item.stats.remaining > 0)
    .sort((a, b) => b.stats.remaining - a.stats.remaining)[0] || null;
}

function workerLabel(count, fallback = "worker") {
  return `${count} ${fallback}${count === 1 ? "" : "s"}`;
}

function pluralizeTradeLabel(trade, count = 2) {
  const label = String(trade || "worker").trim();
  if (count === 1) return label;
  const lower = label.toLowerCase();
  if (lower === "carpentry") return "carpenters";
  if (lower === "electrical") return "electrical workers";
  if (lower === "plumbing") return "plumbers";
  if (lower === "groundworks") return "groundworkers";
  if (/[sxz]$/i.test(label) || /(ch|sh)$/i.test(label)) return `${label}es`;
  if (/[^aeiou]y$/i.test(label)) return `${label.slice(0, -1)}ies`;
  return `${label}s`;
}

function calculateProjectHealth(job, summary = companyProjectSummary(job, getSessionUser() || {})) {
  const safeJob = job || summary?.job || {};
  const safeSummary = {
    ...summary,
    job: summary?.job || safeJob,
    labourRequirements: Array.isArray(summary?.labourRequirements)
      ? summary.labourRequirements
      : labourRequirementsForJob(safeJob),
    openRoles: Math.max(0, Number(summary?.openRoles) || 0),
  };
  const startDays = projectStartDays(safeJob);
  const mostUnderfilled = mostUnderfilledRequirement(safeSummary);
  const leadDays = projectCreatedLeadDays(safeJob);
  const shortLead = leadDays !== null && leadDays <= 3;
  const openLabel = mostUnderfilled
    ? workerLabel(mostUnderfilled.stats.remaining, mostUnderfilled.req.trade || "worker")
    : workerLabel(safeSummary.openRoles);
  const filledBreakdown = uniqueLabourRequirements(safeSummary.labourRequirements)
    .map((req) => {
      const stats = companyRequirementStats(req, safeSummary);
      return `${stats.filled}/${stats.required} ${req.trade || "Workers"}`;
    });
  const recommendations = [];
  const req = mostUnderfilled?.req || {};
  if (safeSummary.openRoles > 0) {
    const rateBenchmark = labourMarketBenchmarkForRequirement(req, safeJob);
    if (rateBenchmark) {
      recommendations.push(
        `Your advertised rate is ${formatMoney(rateBenchmark.gap)} below the median of comparable live OnSite requirements in this area.`,
      );
    } else {
      recommendations.push("Increase the advertised day rate.");
    }
    if (!safeJob.accommodationPaid && !req.accommodationPaid) {
      recommendations.push("Add a working-away allowance.");
    }
    if (req.grade || safeJob.grade) recommendations.push("Review the required experience level.");
    if (req.workActivity || safeJob.workActivity) recommendations.push("Review or clarify the work activity.");
  }
  let level = "matching";
  let why = "OnSite is actively matching suitable workers.";
  if (safeSummary.openRoles === 0) {
    level = "filled";
    why = "All labour requirements have been filled.";
  } else if (shortLead || (startDays !== null && startDays <= 3)) {
    level = "urgent";
    why = shortLead
      ? "This labour request was created with a short lead time."
      : "Labour requirements remain unfilled with three calendar days or fewer until project start.";
  } else if (startDays !== null && startDays <= 7) {
    level = "atRisk";
    why = `${openLabel} remain unfilled with one week or less until project start.`;
  }
  const labelMap = {
    matching: "Matching",
    filled: "Filled",
    atRisk: "At Risk",
    urgent: "Urgent",
  };
  return {
    level,
    label: labelMap[level],
    primaryReason: why,
    reasons: [why],
    recommendations: level === "atRisk" || level === "urgent" ? recommendations : [],
    filledBreakdown,
    startDate: safeJob?.start || safeJob?.startDate || "",
    requiresAction: level === "atRisk" || level === "urgent",
  };
}

function projectRequirementExperienceLabel(req, job) {
  const trade = req?.trade || job?.trade || "";
  const grade = req?.grade || job?.grade || "";
  if (!grade) return "Experience level TBC";
  if (trade && !String(grade).toLowerCase().includes(String(trade).toLowerCase())) {
    return `${trade} ${grade}`;
  }
  return grade;
}

function projectCardAttendanceHTML(job, summary) {
  const startDays = projectStartDays(job);
  const attendanceStarted = startDays !== null && startDays < 0;
  if (!attendanceStarted) {
    const startLabel = countdownCopyFromDate(job?.start || job?.startDate || "");
    return `<div class="company-project-attendance-note">
      <strong>${escapeHtml(startLabel)}</strong>
    </div>`;
  }
  const notSignedIn = Math.max(0, summary.expectedToday - summary.signedInToday);
  return `<div class="company-project-metrics company-project-attendance-metrics" aria-label="Today's Attendance">
    <span><strong>${summary.expectedToday}</strong> Expected</span>
    <span><strong>${summary.signedInToday}</strong> Signed in</span>
    <span class="${summary.lateReports ? "urgent" : ""}"><strong>${summary.lateReports}</strong> Informed of lateness</span>
    <span class="${notSignedIn ? "urgent" : ""}"><strong>${notSignedIn}</strong> Not signed in</span>
  </div>`;
}

function projectHealthGuidanceHTML(health, { pulse = false } = {}) {
  const recommendations = Array.isArray(health.recommendations)
    ? health.recommendations
    : [];
  const filledDetails =
    health.level === "filled"
      ? `<div class="company-project-health-pop-section">
          <span>Labour breakdown</span>
          ${(health.filledBreakdown || [])
            .map((item) => `<p>${escapeHtml(item)}</p>`)
            .join("")}
          ${health.startDate ? `<p>Workers are due to arrive on ${escapeHtml(formatDateOnly(health.startDate))}.</p>` : ""}
        </div>`
      : "";
  return `<details class="company-project-health-panel ${escapeHtml(health.level)}${pulse ? " is-pulsing" : ""}" data-project-health-popover>
    <summary class="company-project-health-line" aria-label="${escapeHtml(health.label)} project health. Open details">
      <span class="company-project-health-led" aria-hidden="true"></span>
      <span class="company-project-health-label">${escapeHtml(health.label)}</span>
      <span class="company-project-health-info" aria-label="Project Health information">ⓘ</span>
    </summary>
    <div class="company-project-health-popover">
      <strong>Project Health</strong>
      <div class="company-project-health-pop-section">
        <span>Status</span>
        <p>${escapeHtml(health.label)}</p>
      </div>
      <div class="company-project-health-pop-section">
        <span>Reason</span>
        <p>${escapeHtml(health.primaryReason || "Project health is being monitored.")}</p>
      </div>
      ${filledDetails}
      ${
        recommendations.length
          ? `<div class="company-project-health-pop-section">
              <span>Recommendations</span>
              <ul>${recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
            </div>`
          : ""
      }
    </div>
  </details>`;
}

function companyProjectDirectoryHealth(health) {
  if (health.level === "filled") return { ...health, label: "Healthy" };
  if (health.level === "matching") return { ...health, label: "Neutral" };
  return health;
}

function companyProjectDirectoryPulseId(projects = [], user = {}) {
  const priority = { urgent: 0, atRisk: 1 };
  return projects
    .map((job) => ({
      id: job.id,
      health: calculateProjectHealth(job, companyProjectSummary(job, user)),
    }))
    .filter((item) =>
      Object.prototype.hasOwnProperty.call(priority, item.health.level),
    )
    .sort(
      (a, b) =>
        priority[a.health.level] - priority[b.health.level] ||
        String(a.id).localeCompare(String(b.id)),
    )[0]?.id || "";
}

function companyProjectDirectoryLabourTotals(summary) {
  const requirements = uniqueLabourRequirements(summary.labourRequirements || []);
  let unallocatedFilledWorkers = Math.max(0, Number(summary.filled) || 0);
  const stats = requirements.map((req) => {
    const rawStats = companyRequirementStats(req, summary);
    const required = Math.max(1, Number(req.quantity) || 1);
    const filled = Math.min(required, rawStats.filled, unallocatedFilledWorkers);
    unallocatedFilledWorkers = Math.max(0, unallocatedFilledWorkers - filled);
    return {
      req,
      stats: {
        ...rawStats,
        required,
        filled,
        remaining: Math.max(0, required - filled),
      },
    };
  });
  const displayStats = Array.from(
    stats.reduce((groups, item) => {
      const req = item.req || {};
      const key = JSON.stringify({
        trade: req.trade || "",
        specialism: req.specialism || "",
        grade: req.grade || "",
        workActivity: req.workActivity || "",
        requiredQualifications: req.requiredQualifications || "",
        requiredCredentialIds: canonicalCredentialIds(req.requiredCredentialIds),
        labourSchedule: normalizeLabourSchedule(req.labourSchedule),
        budgetMax: Number(req.budgetMax || 0),
        workerReceivesFullAdvertisedRate:
          req.workerReceivesFullAdvertisedRate !== false,
        overtimeAvailable: !!req.overtimeAvailable,
        overtimeRates: req.overtimeRates || {},
        accommodationPaid: !!req.accommodationPaid,
        accommodationArrangement: accommodationArrangementFor(req),
        accommodationAllowancePerNight: Number(
          req.accommodationAllowancePerNight || 0,
        ),
        workingDays: normalizeWorkingDays(req.workingDays),
        shiftStartTime: req.shiftStartTime || "",
        shiftFinishTime: req.shiftFinishTime || "",
      });
      const existing = groups.get(key);
      if (existing) {
        existing.requirementIds.push(req.id);
        existing.stats.required += item.stats.required;
        existing.stats.filled += item.stats.filled;
        existing.stats.remaining += item.stats.remaining;
      } else {
        groups.set(key, {
          ...item,
          requirementIds: [req.id],
          stats: { ...item.stats },
        });
      }
      return groups;
    }, new Map()).values(),
  );
  return {
    requirements,
    stats,
    displayStats,
    required: stats.reduce((sum, item) => sum + item.stats.required, 0),
    filled: stats.reduce((sum, item) => sum + item.stats.filled, 0),
    open: stats.reduce((sum, item) => sum + item.stats.remaining, 0),
  };
}

function companyProjectDirectoryRequirementDetail(req, job) {
  const parts = [];
  const addPart = (value) => {
    const text = String(value || "").trim();
    if (!text) return;
    if (parts.some((part) => part.toLowerCase() === text.toLowerCase())) return;
    parts.push(text);
  };
  addPart(req?.grade || job?.grade);
  addPart(req?.specialism || job?.specialism);
  addPart(req?.workActivity || job?.workActivity);
  return parts.slice(0, 2).join(" · ") || "Requirement details not set";
}

function companyProjectDirectoryDateLabel(job) {
  const start = job.start || job.startDate || "";
  const end = job.end || job.estimatedEndDate || job.endDate || "";
  const startLabel = start ? formatDateOnly(start) : "Start TBC";
  if (job.noFixedEndDate) return `${startLabel} – No fixed end date`;
  return end ? `${startLabel} – ${formatDateOnly(end)}` : `${startLabel} – End TBC`;
}

function companyProjectDirectoryTimingLabel(job, stage) {
  if (stage === "upcoming") return countdownCopyFromDate(job.start || job.startDate || "");
  if (stage === "completed") {
    const completedDate = job.completedAt || job.end || job.estimatedEndDate || job.endDate;
    return completedDate ? `Completed ${formatDateOnly(completedDate)}` : "Completed";
  }
  return isProjectScheduledToday(job) ? "Scheduled today" : "In progress";
}

function companyProjectDirectoryContextHTML(job, summary, stage, totals) {
  if (stage === "active" && isProjectScheduledToday(job)) {
    const notSignedIn = Math.max(0, summary.expectedToday - summary.signedInToday);
    return `<section class="company-project-directory-context" aria-label="Today's attendance">
      <span class="company-project-directory-section-title">Today&apos;s attendance</span>
      <div class="company-project-directory-attendance">
        <span><small>Expected</small> <strong>${summary.expectedToday}</strong></span>
        <i aria-hidden="true">·</i>
        <span><small>Signed in</small> <strong>${summary.signedInToday}</strong></span>
        <i aria-hidden="true">·</i>
        <span class="${summary.lateReports ? "is-warning" : ""}"><small>Late / informed</small> <strong>${summary.lateReports}</strong></span>
        <i aria-hidden="true">·</i>
        <span class="${notSignedIn ? "is-warning" : ""}"><small>Not signed in</small> <strong>${notSignedIn}</strong></span>
      </div>
    </section>`;
  }
  if (stage === "upcoming") {
    return `<section class="company-project-directory-context" aria-label="Project readiness">
      <span class="company-project-directory-section-title">Project readiness</span>
      <div class="company-project-directory-readiness">
        <strong>${escapeHtml(countdownCopyFromDate(job.start || job.startDate || ""))}</strong>
        <i aria-hidden="true">·</i>
        <span>${totals.filled} of ${totals.required} position${totals.required === 1 ? "" : "s"} filled · ${totals.open} open</span>
      </div>
    </section>`;
  }
  if (stage === "completed") {
    const completedDate = job.completedAt || job.end || job.estimatedEndDate || job.endDate;
    const attendanceCount = summary.projectAttendanceRecords.length;
    return `<section class="company-project-directory-context" aria-label="Completed project summary">
      <span class="company-project-directory-section-title">Project summary</span>
      <div class="company-project-directory-readiness">
        <strong>${completedDate ? `Completed ${escapeHtml(formatDateOnly(completedDate))}` : "Completed"}</strong>
        <i aria-hidden="true">·</i>
        <span>${totals.filled} of ${totals.required} positions filled${attendanceCount ? ` · ${attendanceCount} attendance record${attendanceCount === 1 ? "" : "s"}` : ""}</span>
      </div>
    </section>`;
  }
  return `<section class="company-project-directory-context" aria-label="Today's attendance">
    <span class="company-project-directory-section-title">Today&apos;s attendance</span>
    <div class="company-project-directory-readiness">
      <strong>No attendance scheduled today</strong>
      <i aria-hidden="true">·</i>
      <span>${totals.filled} of ${totals.required} positions filled · ${totals.open} open</span>
    </div>
  </section>`;
}

function projectHealthNotificationTitle(job, health) {
  const title = companyProjectTitle(job);
  const number = job?.jobNumber ? ` (${job.jobNumber})` : "";
  if (health.level === "filled") {
    return `Congratulations — all labour requirements have been filled for ${title}${number}.`;
  }
  if (health.level === "urgent") {
    return `Project ${title}${number} is now Urgent.`;
  }
  return `Project ${title}${number} is now At Risk.`;
}

function syncProjectHealthNotifications(user) {
  if (!user?.id) return false;
  if (!Array.isArray(state.notifications)) state.notifications = [];
  const companyJobs = (state.jobs || []).filter(
    (job) => companyOwnsJob(job, user.id) && !job.completed,
  );
  let changed = false;
  companyJobs.forEach((job) => {
    const summary = companyProjectSummary(job, user);
    const health = calculateProjectHealth(job, summary);
    if (!["filled", "atRisk", "urgent"].includes(health.level)) return;
    const alreadySent = state.notifications.some(
      (n) =>
        n.type === "project_health" &&
        n.jobId === job.id &&
        n.healthLevel === health.level,
    );
    if (alreadySent) return;
    state.notifications.unshift({
      id: createId(),
      type: "project_health",
      healthLevel: health.level,
      healthLabel: health.label,
      jobId: job.id,
      companyId: job.companyId || user.id,
      companyName: job.companyName || user.companyName || "Company",
      title: projectHealthNotificationTitle(job, health),
      message: health.primaryReason || "",
      recommendations: health.recommendations || [],
      labourBreakdown: health.filledBreakdown || [],
      preStartQuestions:
        health.level === "filled"
          ? [
              "Are the site details correct?",
              "Do workers need to view any site documents?",
              "Do workers need to sign any site documents?",
              "Do workers need to watch an induction video?",
            ]
          : [],
      createdAt: new Date().toISOString(),
      readAt: "",
    });
    addProjectActivity(job, {
      type: PROJECT_ACTIVITY_TYPES.PROJECT_HEALTH_CHANGED,
      title: `Project Health changed to ${health.label}.`,
      description: health.primaryReason || "Project health changed.",
      timestamp: new Date().toISOString(),
      source: "project_health",
      severity: health.level === "urgent" ? "critical" : health.level === "atRisk" ? "warning" : "success",
      metadata: {
        healthLevel: health.level,
        recommendations: health.recommendations || [],
      },
      dedupeKey: `project_health:${job.id}:${health.level}`,
    });
    changed = true;
  });
  return changed;
}

function companyProjectCardHTML(job, user, { pulseHealth = false } = {}) {
  const summary = companyProjectSummary(job, user);
  const health = companyProjectDirectoryHealth(calculateProjectHealth(job, summary));
  const title = companyProjectTitle(job);
  const stage = companyProjectStatusBucket(job);
  const stageLabel = stage.charAt(0).toUpperCase() + stage.slice(1);
  const totals = companyProjectDirectoryLabourTotals(summary);
  const requirementRows = totals.displayStats
    .slice(0, 2)
    .map(({ req, stats }) => {
      return `<div class="company-project-directory-requirement">
        <div>
          <strong>${escapeHtml(req.trade || "Labour")}</strong>
          <span>${escapeHtml(companyProjectDirectoryRequirementDetail(req, job))}</span>
        </div>
        <strong>${stats.filled} / ${stats.required}</strong>
        <strong class="${stats.remaining ? "is-open" : ""}">${stats.remaining}</strong>
      </div>`;
    })
    .join("");
  const extraRequirements = Math.max(0, totals.displayStats.length - 2);
  const selected = activeCompanyProjectId === job.id;
  const openLabourLabel = `${totals.open} open labour position${totals.open === 1 ? "" : "s"}`;
  return `
    <article class="company-project-directory-card${selected ? " selected" : ""}" tabindex="0" role="link" aria-label="${escapeHtml(`${title}. ${stageLabel}. ${health.label}. ${openLabourLabel}.`)}" data-company-project-card="${escapeHtml(job.id)}">
      <div class="company-project-top">
        <div>
          <div class="company-project-kicker">PROJECT</div>
          <div class="company-project-title">${escapeHtml(title)}</div>
          <div class="company-project-meta">${escapeHtml(job.jobNumber || "Not set")} · ${escapeHtml(job.location || "Location TBC")}</div>
        </div>
        <div class="company-project-directory-indicators">
          <span class="company-project-stage company-project-stage--${stage}">${stageLabel}</span>
          ${projectHealthGuidanceHTML(health, { pulse: pulseHealth })}
        </div>
      </div>
      <dl class="company-project-directory-summary">
        <div><dt>Assignment type</dt><dd>${escapeHtml(assignmentTypeLabel(job))}</dd></div>
        <div><dt>Project dates</dt><dd>${escapeHtml(companyProjectDirectoryDateLabel(job))}</dd></div>
        <div><dt>Labour</dt><dd>${totals.filled} of ${totals.required} filled · ${totals.open} open</dd></div>
        <div><dt>Timing</dt><dd>${escapeHtml(companyProjectDirectoryTimingLabel(job, stage))}</dd></div>
      </dl>
      <section class="company-project-directory-requirements" aria-label="Labour requirements">
        <div class="company-project-directory-requirements-head">
          <span>Labour requirements</span><span>Filled</span><span>Open</span>
        </div>
        <div class="company-project-directory-requirements-list">
          ${requirementRows || `<div class="company-project-directory-requirement-empty">No labour requirements have been added.</div>`}
        </div>
        ${extraRequirements ? `<span class="company-project-directory-more">+${extraRequirements} more requirement${extraRequirements === 1 ? "" : "s"}</span>` : ""}
      </section>
      ${companyProjectDirectoryContextHTML(job, summary, stage, totals)}
      <span class="company-project-directory-affordance" aria-hidden="true">View project <i>&rarr;</i></span>
    </article>`;
}

function projectInvoicePlaceholderHTML(job) {
  const invoices = (state.invoices || []).filter((inv) =>
    (inv.lines || []).some((line) => line.jobId === job.id),
  );
  if (!invoices.length)
    return guidedEmptyStateHTML({
      kicker: "Invoices",
      title: "No invoice records yet",
      body: "Approved attendance will feed future invoice records for this project. Nothing needs to be created manually here yet.",
      actionLabel: "Open Attendance",
      actionTab: "attendance",
    });
  return invoices
    .map((inv) => {
      const status = invoiceEffectiveStatus(inv);
      const meta = INVOICE_STATUS[status] || INVOICE_STATUS.generated;
      return `<div class="bill-inv-row">
        <div class="bill-inv-main">
          <div class="bill-inv-week">${escapeHtml(inv.invoiceNumber || "Invoice")} · ${formatDateOnly(inv.weekStart)} – ${formatDateOnly(inv.weekEnd)}</div>
          <div class="bill-inv-sub">Invoice status · ${escapeHtml(meta.label)}</div>
        </div>
        <div class="bill-inv-amt">${formatMoney(inv.totalCharge || 0)}</div>
      </div>`;
    })
    .join("");
}

function companyProjectDetailHTML(job, user) {
  if (!job) return "";
  if (activeCompanyProjectEditId === job.id && canEditCompanyProject(job, user)) {
    return companyProjectEditHTML(job, user);
  }
  const activeSection = normalizeCompanyProjectSection(activeCompanyProjectSection);
  const summary = companyProjectSummary(job, user);
  const detailBody = companyProjectSectionHTML(job, user, summary);
  const stage = companyProjectStatusBucket(job);
  const health = companyProjectDirectoryHealth(calculateProjectHealth(job, summary));
  const totals = companyProjectDirectoryLabourTotals(summary);
  const editButton = canEditCompanyProject(job, user)
    ? `<button class="secondary-btn" type="button" data-company-project-edit="${job.id}">Edit project</button>`
    : "";
  const repeatButton = job.completed || job.completedAt || job.cancelledAt || job.bookingStatus === "cancelled"
    ? `<button class="secondary-btn" type="button" data-repeat-project="${job.id}">Repeat project</button>`
    : "";
  return `
    <section class="company-project-detail-page">
      <button class="company-project-back company-project-overview-back" type="button" data-company-project-close>&larr; Projects</button>
      <header class="company-project-detail-heading">
        <div class="company-project-detail-heading-main">
          <h1>${escapeHtml(companyProjectTitle(job))}</h1>
          <p>${escapeHtml(job.jobNumber || "Job number not set")} · ${escapeHtml(job.location || "Location to confirm")}</p>
        </div>
        <div class="company-project-detail-heading-side">
          <div class="company-project-detail-indicators">
            <span class="company-project-stage company-project-stage--${stage}">${escapeHtml(stage[0].toUpperCase() + stage.slice(1))}</span>
            ${projectHealthGuidanceHTML(health, { pulse: health.requiresAction })}
          </div>
          <div class="company-project-head-actions">
            ${repeatButton}
            ${editButton}
          </div>
        </div>
      </header>
      <dl class="company-project-directory-summary company-project-detail-context" aria-label="Project context">
        <div><dt>Assignment type</dt><dd>${escapeHtml(assignmentTypeLabel(job))}</dd></div>
        <div><dt>Project dates</dt><dd>${escapeHtml(companyProjectDirectoryDateLabel(job))}</dd></div>
        <div><dt>Labour</dt><dd>${totals.filled} of ${totals.required} filled · ${totals.open} open</dd></div>
        <div><dt>Timing</dt><dd>${escapeHtml(companyProjectDirectoryTimingLabel(job, stage))}</dd></div>
      </dl>
      <div class="company-project-tabs os-tabs" role="tablist" aria-label="Project detail sections">
        ${COMPANY_PROJECT_SECTIONS.map(
          (section) => `<button class="company-project-tab os-tab${activeSection === section.id ? " active" : ""}" type="button" role="tab" aria-selected="${activeSection === section.id ? "true" : "false"}" data-company-project-section="${section.id}">${escapeHtml(section.label)}</button>`,
        ).join("")}
      </div>
      ${detailBody}
    </section>`;
}

function initProjectEditDraft(job) {
  projectEditPin =
    job?.sitePin && job.sitePin.lat != null && job.sitePin.lng != null
      ? { lat: Number(job.sitePin.lat), lng: Number(job.sitePin.lng) }
      : { lat: null, lng: null };
  projectEditPhotos = { ...(job?.sitePhotos || {}) };
  projectEditPhotoMeta = { ...(job?.sitePhotoMeta || {}) };
  resetProjectEditMap();
}

function resetProjectEditMap() {
  if (projectEditMap) {
    projectEditMap.remove();
    projectEditMap = null;
    projectEditMarker = null;
  }
}

function projectEditDateTime(value) {
  return value ? String(value).slice(0, 16) : "";
}

function projectEditDate(value) {
  return value ? String(value).slice(0, 10) : "";
}

function projectEditWorkingDayChips(job) {
  const selected = new Set(normalizeWorkingDays(job?.workingDa    .map(
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
