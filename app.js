)).join("") : guidedEmptyStateHTML({
          kicker: "Matching",
          title: "No matching jobs right now",
          body: "There are no open roles matching your trade at the moment. Update your profile, travel radius and availability to improve future matching.",
          actionLabel: "Open Profile",
          actionTab: "profile",
        })}
      </section>
      <section class="worker-page-section">
        <div class="worker-section-head">
          <h2>Previous offers</h2>
          <span>${history.length}</span>
        </div>
        ${history.length ? history.map((app) => workerOfferDecisionCardHTML(app, user)).join("") : guidedEmptyStateHTML({
          kicker: "Offer History",
          title: "No previous offers yet",
          body: "Accepted, declined and expired offers will be kept here so you can track your work opportunities.",
        })}
      </section>
    </div>`;
  bindWorkerOfferButtons(el);
  bindWorkerJobBoardButtons(el, user);
}

function workerOpenJobs(user) {
  const trade = canonicalTrade(user?.trade);
  return [...state.jobs]
    .filter(
      (job) =>
        !job.assignedWorkerId &&
        !job.completed &&
        (!trade || canonicalTrade(job.trade) === trade),
    )
    .sort((a, b) => new Date(a.start || 0) - new Date(b.start || 0));
}

function bindWorkerOfferButtons(scope) {
  scope.querySelectorAll("[data-worker-offer-accept]").forEach((btn) => {
    btn.addEventListener("click", () => workerAcceptOffer(btn.dataset.workerOfferAccept));
  });
  scope.querySelectorAll("[data-worker-offer-decline]").forEach((btn) => {
    btn.addEventListener("click", () =>
      openOfferDecisionModal("worker", btn.dataset.workerOfferDecline),
    );
  });
  scope.querySelectorAll("[data-map-job]").forEach((btn) => {
    btn.addEventListener("click", () => openSiteMap(btn.dataset.mapJob));
  });
  scope.querySelectorAll("[data-shift-change-accept]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const res = respondToShiftChangeOffer(btn.dataset.shiftChangeAccept, true);
      if (!res.ok) {
        showToast(res.reason);
        return;
      }
      saveAndRender();
      showToast("Shift change accepted");
    });
  });
  scope.querySelectorAll("[data-shift-change-decline]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const res = respondToShiftChangeOffer(btn.dataset.shiftChangeDecline, false);
      if (!res.ok) {
        showToast(res.reason);
        return;
      }
      saveAndRender();
      showToast("Shift change declined");
    });
  });
}

function bindWorkerJobBoardButtons(scope, user) {
  scope.querySelectorAll("[data-apply-job]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const result = registerInterest(btn.dataset.applyJob, user);
      if (!result.ok) {
        showToast(result.reason);
        if (result.code === "PROFILE_INCOMPLETE") switchTab("profile");
        return;
      }
      showToast(
        result.duplicate
          ? "You've already registered interest in this job."
          : "Your interest has been registered — you'll be contacted shortly.",
      );
    });
  });
  scope.querySelectorAll("[data-map-job]").forEach((btn) => {
    btn.addEventListener("click", () => openSiteMap(btn.dataset.mapJob));
  });
}

function renderWorkerCalendarPage(user) {
  const el = document.getElementById("calendarContent");
  if (!el) return;
  const workerProfile = findWorker(user.id) || ensureWorkerProfileForUser(user);
  const plannedAbsences = plannedAbsencesForWorker(workerProfile || user);
  const unavailableDates = plannedAbsenceDateSet(plannedAbsences);
  const todayMs = dateOnlyMs(todayDateStr());
  const days = Array.from({ length: 35 }, (_, i) => {
    const iso = new Date(todayMs + i * 86400000).toISOString().slice(0, 10);
    return { iso, unavailable: unavailableDates.has(iso) };
  });
  const commitments = state.jobs.filter((job) => job.assignedWorkerId === user.id && !job.completed);
  el.innerHTML = `
    <div class="worker-page">
      <section class="worker-page-section">
        <div class="worker-section-head">
          <h2>Availability</h2>
          <span>${escapeHtml(user.availability || "available")}</span>
        </div>
        ${workerAvailabilityControlsHTML(user)}
      </section>
      <section class="worker-page-section">
        <div class="worker-section-head">
          <h2>Planned Absence</h2>
          <span>${plannedAbsences.length}</span>
        </div>
        ${workerPlannedAbsenceFormHTML(plannedAbsences)}
      </section>
      <section class="worker-page-section">
        <div class="planned-calendar-grid worker-calendar-grid">
          ${days
            .map(
              (day) => `<div class="planned-calendar-day ${day.unavailable ? "unavailable" : ""}">
                <span>${new Date(day.iso + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short" })}</span>
                <strong>${new Date(day.iso + "T00:00:00").getDate()}</strong>
              </div>`,
            )
            .join("")}
        </div>
      </section>
      <section class="worker-page-section">
        <div class="worker-section-head">
          <h2>Future project commitments</h2>
          <span>${commitments.length}</span>
        </div>
        ${
          commitments.length
            ? commitments.map((job) => `<div class="worker-flow-card"><h3>${escapeHtml(job.trade)} · ${escapeHtml(job.location)}</h3><div class="worker-flow-meta">${job.start ? formatDate(job.start) : "Start TBC"}${job.estimatedEndDate || job.endDate ? ` · ends ${formatDateOnly(job.estimatedEndDate || job.endDate)}` : ""}</div></div>`).join("")
            : guidedEmptyStateHTML({
                kicker: "Calendar",
                title: "No future commitments",
                body: "Confirmed future assignments will appear here alongside your Planned Absence and availability settings.",
              })
        }
      </section>
    </div>`;
  bindWorkerAvailabilityControls(el, user);
  bindWorkerPlannedAbsenceControls(el, user, plannedAbsences);
}

function workerAvailabilityControlsHTML(user) {
  const isUnavailable = user.availability === "not available";
  return `<div class="wh-availability-panel">
    <div class="wh-availability-main">
      <button class="wh-avail-btn ${isUnavailable ? "unavailable" : "available"}" id="calendarAvailBtn" type="button">
        <span class="wh-avail-dot"></span>
        ${isUnavailable ? "Unavailable" : "Available"}
      </button>
      <label class="wh-next-date">
        <span>Next Available Date</span>
        <input id="calendarNextAvailableDate" type="date" value="${escapeHtml(formatDateInput(user.nextAvailableDate))}" />
      </label>
      <button class="wh-next-save" id="calendarNextAvailableSave" type="button">Save</button>
    </div>
    ${isUnavailable ? `<div class="wh-unavailable-note">You’re currently unavailable. Toggle to available when you’re ready to start receiving job offers.</div>` : ""}
  </div>`;
}

function workerPlannedAbsenceFormHTML(plannedAbsences) {
  return `<div class="wh-planned-panel">
    <div class="wh-planned-form">
      <input id="calAbsenceEditId" type="hidden" value="" />
      <label class="wh-next-date"><span>Start Date</span><input id="calAbsenceStart" type="date" /></label>
      <label class="wh-next-date"><span>End Date</span><input id="calAbsenceEnd" type="date" /></label>
      <button class="wh-next-save" id="calAbsenceSave" type="button">Add</button>
      <button class="wh-planned-cancel hidden" id="calAbsenceCancel" type="button">Cancel</button>
    </div>
    <div class="wh-planned-warning hidden" id="calAbsenceWarning">
      This planned absence is inside the 5 working day notice period. Please inform your site supervisor directly as soon as possible.
    </div>
    ${
      plannedAbsences.length
        ? `<div class="wh-planned-list">${plannedAbsences
            .map(
              (absence) => `<div class="wh-planned-row">
                <div><span>${formatDateOnly(absence.startDate)}</span><strong>${absence.endDate !== absence.startDate ? `to ${formatDateOnly(absence.endDate)}` : "Unavailable"}</strong></div>
                <div class="wh-planned-actions">
                  <button type="button" data-cal-absence-edit="${absence.id}">Edit</button>
                  <button type="button" data-cal-absence-remove="${absence.id}">Remove</button>
                </div>
              </div>`,
            )
            .join("")}</div>`
        : guidedEmptyStateHTML({
            kicker: "Planned Absence",
            title: "No planned absence added",
             body: "Use the form above to add unavailable dates. Hiring companies can see these dates when reviewing your availability for projects.",
          })
    }
  </div>`;
}

function bindWorkerAvailabilityControls(scope, user) {
  scope.querySelector("#calendarAvailBtn")?.addEventListener("click", () => {
    const nextAvailability =
      user.availability === "not available" ? "available" : "not available";
    if (nextAvailability === "available") {
      alert(
        "By marking yourself as available, you may receive job offers from contractors. If you are currently in work/unavailable, set yourself to unavailable until you are ready for a new assignment.",
      );
    }
    const nextDate = scope.querySelector("#calendarNextAvailableDate")?.value || "";
    updateWorkerAvailability(user.id, nextAvailability, nextDate);
    render();
    showToast(`Status set to ${nextAvailability}`);
  });
  scope.querySelector("#calendarNextAvailableSave")?.addEventListener("click", () => {
    const nextDate = scope.querySelector("#calendarNextAvailableDate")?.value || "";
    updateWorkerAvailability(user.id, user.availability || "available", nextDate);
    render();
    showToast("Next available date saved");
  });
}

function bindWorkerPlannedAbsenceControls(scope, user, plannedAbsences) {
  const updateWarning = () => {
    const startDate = scope.querySelector("#calAbsenceStart")?.value || "";
    scope
      .querySelector("#calAbsenceWarning")
      ?.classList.toggle("hidden", !plannedAbsenceInsideNotice(startDate));
  };
  scope.querySelector("#calAbsenceStart")?.addEventListener("change", updateWarning);
  scope.querySelector("#calAbsenceSave")?.addEventListener("click", () => {
    const editId = scope.querySelector("#calAbsenceEditId")?.value || "";
    const startDate = scope.querySelector("#calAbsenceStart")?.value || "";
    const endDate = scope.querySelector("#calAbsenceEnd")?.value || "";
    const res = upsertWorkerPlannedAbsence(user.id, editId, startDate, endDate);
    if (!res.ok) {
      showToast(res.reason);
      return;
    }
    const warning = plannedAbsenceNoticeMessage(res.absence);
    render();
    if (warning) alert(warning);
    showToast(editId ? "Planned Absence updated" : "Planned Absence added");
  });
  scope.querySelector("#calAbsenceCancel")?.addEventListener("click", () => render());
  scope.querySelectorAll("[data-cal-absence-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const absence = plannedAbsences.find((a) => a.id === btn.dataset.calAbsenceEdit);
      if (!absence) return;
      scope.querySelector("#calAbsenceEditId").value = absence.id;
      scope.querySelector("#calAbsenceStart").value = absence.startDate;
      scope.querySelector("#calAbsenceEnd").value = absence.endDate;
      scope.querySelector("#calAbsenceSave").textContent = "Update";
      scope.querySelector("#calAbsenceCancel")?.classList.remove("hidden");
      updateWarning();
    });
  });
  scope.querySelectorAll("[data-cal-absence-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const res = removeWorkerPlannedAbsence(user.id, btn.dataset.calAbsenceRemove);
      if (!res.ok) {
        showToast(res.reason);
        return;
      }
      render();
      showToast("Planned Absence removed");
    });
  });
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
  const documentCount = workerDocumentsFor(workerProfile || user).length;
  const qualificationCount = Array.isArray(user.certifications)
    ? user.certifications.length
    : (user.qualifications || "").split(",").filter((q) => q.trim()).length;
  const verificationFields = [
    { label: "CIS Status", val: workerProfile?.cisStatus || user.cisStatus || "Unverified" },
    { label: "UTR Number", val: maskSensitiveTail(user.utr || workerProfile?.utr || "") },
    {
      label: "National Insurance Number",
      val: maskSensitiveTail(user.nationalInsuranceNumber || workerProfile?.nationalInsuranceNumber || "") || "Stored for future verification",
    },
    { label: "Right To Work Status", val: workerProfile?.rightToWorkStatus || user.rightToWork || "Not provided" },
    {
      label: "Driving Licence Holder",
      val: (workerProfile?.drivingLicenceHolder ?? user.drivingLicenceHolder) ? "Yes" : "No",
    },
    {
      label: "Worker Verification",
      val: verificationStatusLabel(workerProfile?.workerVerificationStatus || user.workerVerificationStatus),
    },
    {
      label: "Qualification Verification",
      val: verificationStatusLabel(workerProfile?.qualificationVerificationStatus || user.qualificationVerificationStatus),
    },
    { label: "Documents", val: String(documentCount) },
    { label: "Qualifications", val: String(qualificationCount) },
    {
      label: "Payment Details",
      val:
        workerProfile?.paymentDetailsPlaceholder ||
        user.paymentDetailsPlaceholder ||
        "Not configured",
    },
    {
      label: "Preferred Payment Method",
      val:
        workerProfile?.preferredPaymentMethod ||
        user.preferredPaymentMethod ||
        "Not configured",
    },
    {
      label: "Payment Verification",
      val: verificationStatusLabel(
        workerProfile?.paymentVerificationStatus ||
          user.paymentVerificationStatus ||
          "unverified",
      ),
    },
  ]
    .map(
      (f) => `
    <div class="prof-field">
      <div class="prof-field-label">${f.label}</div>
      <div class="prof-field-val">${escapeHtml(String(f.val))}</div>
    </div>`,
    )
    .join("");

  const weekendPrefs = workerWeekendPreferences(workerProfile || user);
  const travelFields = [
    { label: "Home town or postcode", val: workerProfile?.location || user.location },
    { label: "Willing to travel", val: travelRadiusLabel(workerProfile?.travelRadiusMiles || user.travelRadiusMiles) },
    {
      label: "Longer-distance work",
      val: (workerProfile?.travelFurtherWithAccommodation ?? user.travelFurtherWithAccommodation)
        ? "Willing to travel further if accommodation is paid"
        : "Only interested in work within my selected travel distance",
    },
    { label: "Saturday work", val: weekendPrefs.saturday ? "Yes" : "No" },
    { label: "Sunday work", val: weekendPrefs.sunday ? "Yes" : "No" },
    { label: "Weekend-only work", val: weekendPrefs.weekendOnly ? "Yes" : "No" },
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

    ${workerReadinessChecklistHTML(workerProfile || {}, user)}

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
  el.querySelectorAll("[data-profile-complete]").forEach((btn) =>
    btn.addEventListener("click", () => {
      btn.scrollIntoView({ behavior: "smooth", block: "start" });
      showToast("Complete the required profile items below");
    }),
  );
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
}

function clearCompanyProjectDirectoryFilters() {
  activeCompanyProjectStatusFilter = "all";
  activeCompanyProjectHealthFilters = [];
  activeCompanyProjectRequiresAction = false;
  activeCompanyProjectOpenLabourOnly = false;
  activeCompanyProjectAssignmentFilters = [];
  activeCompanyProjectTradeFilters = [];
  activeCompanyProjectLocationFilter = "";
  pendingCompanyProjectLocationFilter = null;
  activeCompanyProjectStartFrom = "";
  activeCompanyProjectStartTo = "";
}

function companyProjectNoResultsHTML() {
  const filtered = companyProjectHasDirectoryFilters();
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
      });ndance_qr",
        severity: "warning",
        metadata: { qrCodeId: code.id },
        dedupeKey: `qr_regenerated:${code.id}`,
      });
      saveState();
    }
    closeQrRegenerationConfirm();
    showToast("Project sign-in QR regenerated");
    renderSiteQrPanel();
    if (
      activeCompanyProjectId === jobId &&
      normalizeCompanyProjectSection(activeCompanyProjectSection) === "attendance"
    ) {
      render();
    }
  });
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
  const sessionUser = getSessionUser();
  const scopedProject =
    sessionUser?.type === "company" && activeAttendanceProjectId
      ? findJob(activeAttendanceProjectId)
      : null;
  const scopedWorkerIds = scopedProject
    ? new Set(attendanceProjectWorkers(scopedProject).map((worker) => worker.id))
    : null;

  // Smart No-Show validation — flag GPS conflicts before finalising
  const conflicts = [];
  Object.entries(todayAttendanceMap).forEach(([wid, data]) => {
    if (scopedWorkerIds && !scopedWorkerIds.has(wid)) return;
    if (data.status !== "noShow") return;
    const gps = data.gps;
    if (!gps) return;
    const job = assignedJobForWorker(wid);
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
    if (scopedWorkerIds && !scopedWorkerIds.has(wid)) return;
    if (!data.status) return;
    // Preserve any check-in / reported-issue context the worker logged today.
    const prevRec = attendanceRecords.find(
      (r) => r.workerId === wid && r.date === today,
    );
    const linkedJob = assignedJobForWorker(wid);
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
      const dailyJob = dailyJobForDate(linkedJob, today);
      rec.jobId = linkedJob.id;
      rec.companyId = linkedJob.companyId || "";
      rec.companyName = linkedJob.companyName || "Company";
      rec.jobTrade = linkedJob.trade || "";
      rec.jobLocation = dailyJob?.siteAddress || dailyJob?.location || linkedJob.location || "";
      rec.projectName = linkedJob.projectName || "";
      rec.jobNumber = dailyJob?.companyJobNumber || linkedJob.jobNumber || "";
      if (dailyJob) {
        rec.dailyJobId = dailyJob.id;
        rec.clientSiteName = dailyJob.clientSiteName || "";
        rec.dailySiteAddress = dailyJob.siteAddress || "";
        rec.dailyClientReference = dailyJob.clientReference || "";
        rec.invoiceReference = dailyJob.invoiceReference || "";
        rec.workNotes = dailyJob.workNotes || "";
        rec.dailyJob = dailyJob;
      }
      rec.expectedStartTime = linkedJob.shiftStartTime || "";
      rec.expectedFinishTime = linkedJob.shiftFinishTime || "";
      rec.workerPay =
        linkedJob.pricing?.workerPay != null
          ? linkedJob.pricing.workerPay
          : linkedJob.agreedDayRate || 0;
      rec.companyCharge =
        linkedJob.companyCharge != null
          ? linkedJob.companyCharge
          : companyChargeDisplay(linkedJob);
    }
    rec.approvalStatus = rec.supervisorConfirmed ? "manager_reviewed" : "draft";
    rec.commercial = attendanceCommercialSnapshot(rec, linkedJob);
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
    if (linkedJob && finalStatus === "noShow") {
      const workerName = findWorker(wid)?.name || "Worker";
      addProjectActivity(linkedJob, {
        type: PROJECT_ACTIVITY_TYPES.WORKER_DID_NOT_ATTEND,
        title: `${workerName} did not attend.`,
        description: "Worker was marked as no-show during attendance confirmation.",
        workerId: wid,
        timestamp: new Date().toISOString(),
        source: "attendance_confirmation",
        severity: "critical",
        metadata: {
          attendanceRecordId: rec.id,
          date: today,
          status: finalStatus,
        },
        dedupeKey: `worker_no_show:${linkedJob.id}:${wid}:${today}`,
      });
    }
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
  const confirmedJobs = new Map();
  Object.entries(todayAttendanceMap).forEach(([wid, data]) => {
    if (scopedWorkerIds && !scopedWorkerIds.has(wid)) return;
    if (!data.status) return;
    const job = assignedJobForWorker(wid);
    if (job) confirmedJobs.set(job.id, job);
  });
  confirmedJobs.forEach((job) => {
    addProjectActivity(job, {
      type: PROJECT_ACTIVITY_TYPES.ATTENDANCE_CONFIRMED,
      title: "Attendance confirmed.",
      description: `${count} attendance record${count === 1 ? "" : "s"} confirmed for ${formatAttDate(today)}.`,
      timestamp: new Date().toISOString(),
      source: "attendance_confirmation",
      severity: "success",
      metadata: { date: today, count },
      dedupeKey: `attendance_confirmed:${job.id}:${today}:${count}`,
    });
  });
  saveState();
  todayAttendanceMap = {};
  renderAttendance();
  render();
  showToast(`Attendance saved for ${count} worker${count !== 1 ? "s" : ""}`);
}

// ─── Attendance Card ──────────────────────────────────────
function attendanceCard(worker, today, scopedJob = null) {
  const avCls = avatarColor(worker.name);
  const saved = todayAttendanceMap[worker.id] || {};
  const stats = getWorkerStats(worker.id);
  const rating = buildWorkerRating(worker.id);
  const job = scopedJob || assignedJobForWorker(worker.id);

  const statusBtns = ["onTime", "late", "noShow", "excused", "sentHome"].map((key) => {
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
  const rec = attendanceTodayRecordForWorker(worker.id, job, today);
  const expectedStart = rec?.expectedStartTime || jobExpectedStartTime(job);
  const signInTime = rec?.checkInTime
    ? new Date(rec.checkInTime).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  let checkInBanner = "";
  if (rec && rec.status === "checkedIn") {
    const sug = rec.suggestedStatus ? ATT_CFG[rec.suggestedStatus] : null;
    checkInBanner = `<div class="att-checkin-banner att-checkin--in" data-att-worker="${worker.id}" data-att-suggested="${rec.suggestedStatus || ""}">
        <span>${ATT_CFG.checkedIn.icon} Signed in ${signInTime}${sug ? ` · Suggested <strong style="color:${sug.color}">${sug.label}</strong>` : ""}</span>
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
    : rec?.status === "checkedIn"
      ? `<span style="color:${ATT_CFG.checkedIn.color};font-weight:600;">${ATT_CFG.checkedIn.icon} Signed In</span>`
      : rec?.status === "reportedIssue" || rec?.lateReport
        ? `<span style="color:${ATT_CFG.reportedIssue.color};font-weight:600;">Reported Late</span>`
        : rec?.status && ATT_CFG[rec.status]
          ? `<span style="color:${ATT_CFG[rec.status].color};font-weight:600;">${ATT_CFG[rec.status].icon} ${ATT_CFG[rec.status].label}</span>`
        : '<span style="color:var(--ink-3)">Unconfirmed</span>';

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
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2"/></svg>
            ${gpsData.distance !== null ? gpsDistanceLabel(gpsData.distance) : "Location captured"}
           </div>`
          : `<button class="gps-capture-btn" data-gps-worker="${worker.id}" type="button">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2"/></svg>
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
        <div class="att-worker-sub">${escapeHtml(worker.trade)}${worker.grade ? ` · ${escapeHtml(worker.grade)}` : ""}</div>
      </div>
      <div class="att-live-meta">
        <span><strong>${escapeHtml(expectedStart)}</strong> Expected start</span>
        <span><strong>${savedStatus}</strong> Current status</span>
        <span><strong>${signInTime || "—"}</strong> Sign-in time</span>
        ${rec?.lateReport?.estimatedArrivalTime ? `<span><strong>Reported Late</strong> ETA ${escapeHtml(rec.lateReport.estimatedArrivalTime)}</span>` : ""}
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
      if (getSessionUser()?.type === "company" && activeAttendanceProjectId) {
        renderAttendance();
        return;
      }
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
      if (getSessionUser()?.type === "company" && activeAttendanceProjectId) {
        renderAttendance();
        return;
      }
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
        const job = assignedJobForWorker(wid);
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
        if (getSessionUser()?.type === "company" && activeAttendanceProjectId) {
          renderAttendance();
          return;
        }
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
  if (getSessionUser()?.type === "company" && activeAttendanceProjectId) {
    renderAttendance();
    showToast(`Late report classified: ${LATE_CLASSIFICATION[decision]}`);
    return;
  }
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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
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
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><line x1="14" y1="14" x2="14" y2="21"/><line x1="18" y1="14" x2="21" y2="14"/><line x1="18" y1="18" x2="21" y2="18"/></svg>
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
  hideWithMotion(document.getElementById("workerQrScanModal"), null, {
    remove: true,
  });
}

function openWorkerQrScanner(uid, workerObj) {
  closeWorkerQrScanner();
  const job = assignedJobForWorker(uid);
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
      <p class="qr-scan-copy">Use this secure project sign-in flow to validate the active site QR token.</p>
      <div class="qr-scan-actions">
        <button class="secondary-btn" type="button" data-qr-scan-close>Cancel</button>
        <button class="primary-btn" type="button" data-qr-scan-use>Use Site Sign-In QR</button>
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
