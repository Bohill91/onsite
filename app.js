      onArrivalOutstanding,
    };
  }
  return {
    label: "Ready",
    tone: "is-complete",
    beforeStart,
    preStartComplete,
    onArrival,
    onArrivalOutstanding,
  };
}

function companyUserCanVerifyProjectRequirement(user, job) {
  if (!user || user.type !== "company" || !companyOwnsJob(job, user.id)) {
    return false;
  }
  // TODO: replace the role allow-list with granular verification permissions
  // when the company permission model exposes them.
  return ["Administrator", "Manager", "Supervisor"].includes(
    companySidebarUserRole(user),
  );
}

function projectRequirementCompanyAction(requirement, record) {
  if (requirement.requirementType === "onsite_induction") {
    return record?.participantActions?.supervisorSignoff?.completedAt
      ? null
      : { action: "supervisor_signoff", label: "Record supervisor sign-off" };
  }
  const method = requirement.completionAction;
  if (!["company_verification", "upload_evidence", "provider_verification"].includes(method)) {
    return null;
  }
  if (record?.verifiedAt && record?.verifiedByCompanyUserId) return null;
  const submitted =
    record?.verificationStatus === "awaiting_verification" ||
    !!record?.participantActions?.workerSubmittedForVerificationAt ||
    (method === "upload_evidence" && !!record?.evidenceAttachments?.length);
  if (!submitted) return null;
  return {
    action: "company_verify",
    label:
      method === "provider_verification"
        ? "Record provider verification"
        : "Verify completion",
  };
}

function verifyProjectRequirementForWorker({
  job,
  workerId,
  requirement,
  action,
  companyUser,
}) {
  if (!companyUserCanVerifyProjectRequirement(companyUser, job)) {
    return { ok: false, reason: "You do not have permission to verify this requirement." };
  }
  const current = projectRequirementCompletionFor(job, workerId, requirement);
  if (action === "company_verify") {
    const allowed = [
      "company_verification",
      "upload_evidence",
      "provider_verification",
    ].includes(requirement.completionAction);
    if (!allowed) {
      return { ok: false, reason: "Company verification is not configured for this requirement." };
    }
    const submitted =
      current?.verificationStatus === "awaiting_verification" ||
      !!current?.participantActions?.workerSubmittedForVerificationAt ||
      (requirement.completionAction === "upload_evidence" &&
        !!current?.evidenceAttachments?.length);
    if (!submitted) {
      return { ok: false, reason: "The worker has not submitted this requirement for verification." };
    }
  }
  if (
    action === "supervisor_signoff" &&
    requirement.requirementType !== "onsite_induction"
  ) {
    return { ok: false, reason: "Supervisor sign-off is not configured for this requirement." };
  }
  return updateProjectRequirementCompletion({
    job,
    workerId,
    requirement,
    mutate(record, timestamp) {
      if (action === "supervisor_signoff") {
        record.supervisorUserId = companyUser.id;
        record.completionMethod = "supervisor_signoff";
        record.participantActions = {
          ...(record.participantActions || {}),
          supervisorSignoff: {
            completedAt: timestamp,
            companyId: job.companyId || companyUser.id,
            supervisorUserId: companyUser.id,
          },
        };
        return;
      }
      record.verifiedAt = timestamp;
      record.verifiedByCompanyUserId = companyUser.id;
      record.verificationStatus = "verified";
      record.completionMethod =
        requirement.completionAction === "provider_verification"
          ? "provider_verification"
          : requirement.completionAction;
      record.participantActions = {
        ...(record.participantActions || {}),
        companyVerification: {
          completedAt: timestamp,
          companyId: job.companyId || companyUser.id,
          verifiedByCompanyUserId: companyUser.id,
        },
      };
    },
  });
}

let companyPreStartVerificationState = null;

function closeCompanyPreStartVerification() {
  const modal = document.getElementById("companyPreStartVerificationModal");
  companyPreStartVerificationState = null;
  if (modal) hideWithMotion(modal, () => {
    modal.remove();
    render();
  });
}

function companyPreStartEvidenceHTML(requirement, record) {
  if (!record?.evidenceAttachments?.length) return "";
  return `<div class="prestart-company-evidence"><span>Submitted evidence</span>${record.evidenceAttachments.map((attachment) => `<a href="${escapeHtml(attachment.dataUrl)}" target="_blank" rel="noopener">${escapeHtml(attachment.fileName)}</a>`).join("")}${requirement.requirementType === "background_check" ? `<small>Restricted to authorised company verification in this local prototype. Do not copy criminal-record details into OnSite.</small>` : ""}</div>`;
}

function renderCompanyPreStartVerification() {
  const context = companyPreStartVerificationState;
  const modal = document.getElementById("companyPreStartVerificationModal");
  const job = findJob(context?.jobId);
  const worker = findWorker(context?.workerId);
  if (!context || !modal || !job || !worker) return;
  const summary = companyProjectSummary(job, getSessionUser());
  const workerRequirement = companyProjectWorkerRequirement(worker, summary);
  const requirements = preStartDocumentsForJob(job).filter(
    (requirement) => {
      const assignedIds = projectRequirementAudienceIds(requirement);
      return !assignedIds.length || assignedIds.includes(workerRequirement?.id);
    },
  );
  modal.innerHTML = `<div class="prestart-verification-sheet" role="dialog" aria-modal="true" aria-labelledby="prestartVerificationTitle">
    <header class="prestart-completion-head"><div><p>Worker completion</p><h2 id="prestartVerificationTitle">${escapeHtml(worker.name || "Worker")}</h2><span>${escapeHtml(companyProjectTitle(job))}</span></div><button class="modal-close-btn" type="button" data-company-prestart-close aria-label="Close">${onsiteIcon("x", 18)}</button></header>
    <div class="prestart-verification-list">${requirements.map((requirement) => {
      const record = workerProjectRequirementRecord(job, worker.id, requirement);
      const status = projectRequirementCompletionStatusMeta(record?.status || "not_started");
      const companyAction = projectRequirementCompanyAction(requirement, record);
      return `<article class="prestart-verification-row">
        <div><strong>${escapeHtml(requirement.documentName)}</strong><span>${escapeHtml(projectRequirementTypeLabel(requirement.requirementType))} · ${escapeHtml(projectRequirementVersionLabel(requirement))}</span></div>
        <span class="prestart-status ${status.tone}">${escapeHtml(status.label)}</span>
        ${companyPreStartEvidenceHTML(requirement, record)}
        ${companyAction ? `<button class="primary-btn" type="button" data-company-prestart-action="${companyAction.action}" data-company-prestart-requirement="${escapeHtml(requirement.documentId)}">${escapeHtml(companyAction.label)}</button>` : ""}
      </article>`;
    }).join("")}</div>
  </div>`;
  modal.querySelector("[data-company-prestart-close]")?.addEventListener("click", closeCompanyPreStartVerification);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeCompanyPreStartVerification();
  });
  modal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeCompanyPreStartVerification();
      return;
    }
    trapProjectRequirementModalFocus(modal, event);
  });
  modal.querySelectorAll("[data-company-prestart-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const requirement = requirements.find(
        (item) => item.documentId === button.dataset.companyPrestartRequirement,
      );
      if (!requirement) return;
      const result = verifyProjectRequirementForWorker({
        job,
        workerId: worker.id,
        requirement,
        action: button.dataset.companyPrestartAction,
        companyUser: getSessionUser(),
      });
      if (!result.ok) return showToast(result.reason);
      renderCompanyPreStartVerification();
      showToast(result.record.status === "complete" ? "Requirement completed" : "Sign-off recorded");
    });
  });
}

function openCompanyPreStartVerification(jobId, workerId, trigger = null) {
  const job = findJob(jobId);
  const worker = findWorker(workerId);
  if (!job || !worker || !companyUserCanVerifyProjectRequirement(getSessionUser(), job)) {
    showToast("You do not have permission to review this worker's requirements");
    return;
  }
  document.getElementById("companyPreStartVerificationModal")?.remove();
  const modal = document.createElement("div");
  modal.id = "companyPreStartVerificationModal";
  modal.className = "modal-overlay";
  document.body.appendChild(modal);
  companyPreStartVerificationState = { jobId, workerId, trigger };
  renderCompanyPreStartVerification();
  requestAnimationFrame(() =>
    modal.querySelector("[data-company-prestart-close]")?.focus(),
  );
}

function companyProjectWorkerCompletionViewHTML(job, summary, requirements) {
  if (!summary.assignedWorkers.length) {
    return `<div class="company-project-requirements-empty is-compact">
      <strong>No workers to track yet.</strong>
      <span>Completion status will appear when workers are confirmed for this project.</span>
    </div>`;
  }
  if (!requirements.length) {
    return `<div class="company-project-requirements-empty is-compact">
      <strong>No project requirements have been added yet.</strong>
      <span>Worker readiness will appear here after a site requirement is added.</span>
    </div>`;
  }
  return `<div class="company-project-worker-completion-list">
    <div class="company-project-worker-completion-head" aria-hidden="true"><span>Worker</span><span>Pre-start</span><span>On arrival</span><span>Status</span></div>
    ${summary.assignedWorkers
      .map((worker) => {
        const readiness = projectWorkerRequirementReadiness(
          job,
          worker,
          summary,
          requirements,
        );
        return `<article class="company-project-worker-completion-row">
          <div class="company-project-worker-completion-person"><strong>${escapeHtml(worker.name || "Worker")}</strong><span>${escapeHtml([worker.trade, worker.grade || worker.specialism].filter(Boolean).join(" · ") || "Role not set")}</span></div>
          <span data-label="Pre-start">${readiness.preStartComplete} / ${readiness.beforeStart.length} complete</span>
          <span data-label="On arrival">${readiness.onArrivalOutstanding ? `${readiness.onArrivalOutstanding} required` : "None outstanding"}</span>
          <div class="company-project-worker-completion-action" data-label="Status"><span class="company-project-requirement-state ${readiness.tone}">${escapeHtml(readiness.label)}</span><button class="company-project-inline-action" type="button" data-company-prestart-worker="${escapeHtml(worker.id)}" data-prestart-job="${escapeHtml(job.id)}">Review &rarr;</button></div>
        </article>`;
      })
      .join("")}
  </div>`;
}

function projectRequirementRecordState(record) {
  if (record.supervisorUserId || record.completionMethod === "supervisor_signoff") {
    return "Supervisor sign-off";
  }
  if (
    record.signatureReference ||
    ["read_sign", "complete_sign"].includes(record.completionMethod)
  ) {
    return "Signed";
  }
  if (record.acknowledgedAt) return "Acknowledged";
  return "Completed";
}

function companyProjectRequirementRecordsViewHTML(job) {
  const requirements = preStartDocumentsForJob(job, { includeArchived: true });
  const records = projectRequirementCompletionsForJob(job.id).filter((record) => {
    const requirement = requirements.find(
      (item) => item.documentId === record.requirementId,
    );
    return requirement &&
      projectRequirementCompletionDerivedStatus(requirement, record) === "complete";
  });
  if (!records.length) {
    return `<div class="company-project-requirements-empty is-compact">
      <strong>No completed records yet.</strong>
      <span>Acknowledgements, signed forms and induction records will appear here once workers complete them.</span>
    </div>`;
  }
  return `<div class="company-project-completion-records">
    <div class="company-project-completion-records-head" aria-hidden="true"><span>Worker</span><span>Requirement</span><span>Completion</span><span>Completed</span></div>
    ${records
      .map((record) => {
        const worker = findWorker(record.workerId);
        const requirement = requirements.find(
          (item) => item.documentId === record.requirementId,
        );
        return `<article class="company-project-completion-record">
          <div><strong>${escapeHtml(worker?.name || "Worker record")}</strong><span>${escapeHtml(worker?.trade || "Worker")}</span></div>
          <div><strong>${escapeHtml(requirement?.documentName || "Archived requirement")}</strong><span>${escapeHtml(projectRequirementVersionLabel({ version: record.requirementVersion }))}</span></div>
          <div><strong>${escapeHtml(projectRequirementRecordState(record))}</strong><span>${escapeHtml(projectRequirementActionLabel(record.completionMethod))}</span></div>
          <time datetime="${escapeHtml(record.completedAt || "")}">${record.completedAt ? escapeHtml(formatDate(record.completedAt)) : "Date not recorded"}</time>
        </article>`;
      })
      .join("")}
  </div>`;
}

function companyProjectDocumentsHTML(job, summary) {
  const requirements = preStartDocumentsForJob(job);
  const activeView = normalizeCompanyProjectDocumentsView(
    activeCompanyProjectDocumentsView,
  );
  const viewContent = {
    requirements: companyProjectRequirementsViewHTML(job, summary, requirements),
    completion: companyProjectWorkerCompletionViewHTML(job, summary, requirements),
    records: companyProjectRequirementRecordsViewHTML(job),
  }[activeView];
  const views = [
    ["requirements", "Requirements"],
    ["completion", "Worker completion"],
    ["records", "Records"],
  ];
  return `<div class="company-project-workspace company-project-documents-workspace">
    <section class="company-project-workspace-card company-project-documents-card">
      <header class="company-project-workspace-head company-project-requirements-head">
        <div><p class="company-project-workspace-kicker">Pre-start</p><h2>Site requirements</h2><span>Set what workers must read, watch, complete or sign before they can start work on this site.</span></div>
        <button class="primary-btn" type="button" data-project-requirement-add="${escapeHtml(job.id)}">Add requirement</button>
      </header>
      <nav class="company-project-requirement-views" aria-label="Project requirement views">
        ${views
          .map(
            ([id, label]) => `<button class="${activeView === id ? "active" : ""}" type="button" data-project-requirement-view="${id}" aria-pressed="${activeView === id ? "true" : "false"}">${escapeHtml(label)}</button>`,
          )
          .join("")}
      </nav>
      <div class="company-project-requirements-view" data-project-requirements-view="${activeView}">
        ${viewContent}
      </div>
    </section>
  </div>`;
}

function projectRequirementActionOptions(type, selected) {
  return (PROJECT_REQUIREMENT_ACTIONS[type] || [])
    .map(
      (action) => `<option value="${action.value}"${action.value === selected ? " selected" : ""}>${escapeHtml(action.label)}</option>`,
    )
    .join("");
}

function projectRequirementAudienceOptionsForRequirements(
  labourRequirements,
  selectedAudience,
) {
  const selectedIds = new Set(projectRequirementAudienceIds(selectedAudience));
  const requirements = Array.isArray(labourRequirements)
    ? labourRequirements
    : [];
  const missingIds = [...selectedIds].filter(
    (id) => !requirements.some((requirement) => requirement.id === id),
  );
  return `<option value=""${selectedIds.size ? "" : " selected"}>All project workers</option>
    ${missingIds.map((id) => `<option value="${escapeHtml(id)}" selected>Previously selected labour requirement · needs review</option>`).join("")}
    ${requirements
      .map((requirement) => {
        const workerCount = Math.max(1, Number(requirement.quantity) || 1);
        const label = [
          requirement.trade,
          requirement.specialism || requirement.grade,
          `${workerCount} ${workerCount === 1 ? "worker" : "workers"}`,
        ]
          .map((value) => String(value || "").trim())
          .filter(Boolean)
          .join(" · ");
        return `<option value="${escapeHtml(requirement.id)}"${selectedIds.has(requirement.id) ? " selected" : ""}>${escapeHtml(label || "Labour requirement")}</option>`;
      })
      .join("")}`;
}

function projectRequirementAudienceOptions(job, selectedAudience) {
  return projectRequirementAudienceOptionsForRequirements(
    labourRequirementsForJob(job),
    selectedAudience,
  );
}

function projectRequirementEditorLabourRequirements(editor) {
  if (editor?.mode === "draft") return pendingTradeRequirements;
  const job = findJob(editor?.jobId);
  return job ? labourRequirementsForJob(job) : [];
}

function projectRequirementEditorAudienceOptions(editor, selectedAudience) {
  return projectRequirementAudienceOptionsForRequirements(
    projectRequirementEditorLabourRequirements(editor),
    selectedAudience,
  );
}

function projectRequirementEditorAudienceLabel(editor, requirement) {
  return projectRequirementAudienceLabelFromRequirements(
    projectRequirementEditorLabourRequirements(editor),
    requirement,
  );
}

let projectRequirementModalTrigger = null;
let projectRequirementEditorState = null;

function projectRequirementFileTypeLabel(resource) {
  const extension = String(resource?.fileName || "").split(".").pop();
  if (extension && extension !== resource?.fileName) return extension.toUpperCase();
  return String(resource?.mimeType || "File").split("/").pop().toUpperCase();
}

function projectRequirementResourceRowHTML(resource) {
  const file = resource.type === "file";
  const external = resource.type === "external_link";
  const metadata = file
    ? `${projectRequirementFileTypeLabel(resource)} · ${projectRequirementFileSizeLabel(resource.size)}`
    : projectRequirementResourceTypeLabel(resource.type);
  const primaryAction = file
    ? `<a href="${escapeHtml(resource.dataUrl)}" download="${escapeHtml(resource.fileName)}">Download</a>
       <label class="project-requirement-resource-file-action">Replace<input type="file" accept="${PROJECT_REQUIREMENT_FILE_ACCEPT}" data-project-requirement-resource-replace="${escapeHtml(resource.id)}" aria-label="Replace ${escapeHtml(resource.fileName)}" /></label>`
    : external
      ? `<a href="${escapeHtml(resource.url)}" target="_blank" rel="noopener noreferrer">Open</a>
         <button type="button" data-project-requirement-resource-edit="${escapeHtml(resource.id)}">Edit</button>`
      : `<button type="button" data-project-requirement-resource-edit="${escapeHtml(resource.id)}">Edit</button>`;
  return `<article class="project-requirement-resource-row">
    <span class="project-requirement-resource-icon">${onsiteIcon(file ? "fileText" : external ? "externalLink" : "tag", 16)}</span>
    <div class="project-requirement-resource-copy">
      <strong>${escapeHtml(resource.label)}</strong>
      <span>${escapeHtml(metadata)}</span>
    </div>
    <div class="project-requirement-resource-actions">
      ${primaryAction}
      <button type="button" data-project-requirement-resource-remove="${escapeHtml(resource.id)}">Remove</button>
    </div>
  </article>`;
}

function projectRequirementResourceMenuHTML(editor) {
  if (editor.mode !== "draft" || editor.resourceEditor?.type !== "choose") {
    return "";
  }
  const resourceOrder =
    editor.draft.requirementType === "onsite_induction"
      ? ["reference", "file", "external_link"]
      : ["file", "external_link", "reference"];
  const resourceTypes = resourceOrder
    .map((value) =>
      PROJECT_REQUIREMENT_RESOURCE_TYPES.find((type) => type.value === value),
    )
    .filter(Boolean);
  const iconByType = {
    file: "fileText",
    external_link: "externalLink",
    reference: "tag",
  };
  return `<div class="project-requirement-resource-menu" id="projectRequirementResourceMenu" role="group" aria-label="Choose resource type">
    ${resourceTypes.map((type) => `<button type="button" data-project-requirement-resource-type="${type.value}"><span>${onsiteIcon(iconByType[type.value], 16)}</span><strong>${escapeHtml(type.label)}</strong></button>`).join("")}
  </div>`;
}

function projectRequirementResourceComposerHTML(editor) {
  const resourceEditor = editor.resourceEditor;
  if (!resourceEditor) return "";
  if (resourceEditor.type === "choose") {
    return `<div class="project-requirement-resource-composer is-chooser" aria-label="Choose resource type">
      <p>Choose resource type</p>
      <div class="project-requirement-resource-type-actions">
        ${PROJECT_REQUIREMENT_RESOURCE_TYPES.map((type) => `<button class="secondary-btn" type="button" data-project-requirement-resource-type="${type.value}">${escapeHtml(type.label)}</button>`).join("")}
      </div>
      <button class="project-requirement-resource-cancel" type="button" data-project-requirement-resource-cancel>Cancel</button>
    </div>`;
  }
  const existing = editor.draft.resources.find(
    (resource) => resource.id === resourceEditor.resourceId,
  );
  if (resourceEditor.type === "file") {
    return `<div class="project-requirement-resource-composer">
      <div><p>Upload file</p><span>Select one or more project documents.</span></div>
      <label class="field-label">Choose file
        <input type="file" multiple required accept="${PROJECT_REQUIREMENT_FILE_ACCEPT}" data-project-requirement-resource-files />
        <span class="form-helper">Files are stored in this browser for the local prototype. Each file must be 1 MB or smaller, with a 2 MB total per requirement.</span>
      </label>
      <button class="project-requirement-resource-cancel" type="button" data-project-requirement-resource-cancel>Cancel</button>
    </div>`;
  }
  if (resourceEditor.type === "external_link") {
    return `<div class="project-requirement-resource-composer">
      <div><p>${existing ? "Edit external link" : "External link"}</p><span>Opening a link does not mark the requirement complete.</span></div>
      <div class="project-requirement-resource-form">
        <label class="field-label">Resource name *
          <input type="text" required data-project-requirement-resource-label value="${escapeHtml(existing?.label || "")}" placeholder="Training portal or document name" />
        </label>
        <label class="field-label">URL *
          <input type="url" required data-project-requirement-resource-url value="${escapeHtml(existing?.url || "")}" placeholder="https://" />
        </label>
        <label class="field-label project-requirement-form-span">Optional instructions
          <textarea rows="2" data-project-requirement-resource-instructions placeholder="Explain what the worker should do after opening this link.">${escapeHtml(existing?.instructions || "")}</textarea>
          <span class="form-helper">Do not include passwords or login credentials.</span>
        </label>
      </div>
      <div class="project-requirement-resource-composer-actions">
        <button class="project-requirement-resource-cancel" type="button" data-project-requirement-resource-cancel>Cancel</button>
        <button class="secondary-btn" type="button" data-project-requirement-resource-save>Save resource</button>
      </div>
    </div>`;
  }
  return `<div class="project-requirement-resource-composer">
    <div><p>${existing ? "Edit note" : "Note"}</p><span>Add supporting information that does not require a file or URL.</span></div>
    <div class="project-requirement-resource-form">
      <label class="field-label">Note title *
        <input type="text" required data-project-requirement-resource-label value="${escapeHtml(existing?.label || "")}" placeholder="Note title" />
      </label>
      <label class="field-label">Note *
        <textarea rows="2" required data-project-requirement-resource-details placeholder="Add supporting information">${escapeHtml(existing?.details || "")}</textarea>
      </label>
    </div>
    <div class="project-requirement-resource-composer-actions">
      <button class="project-requirement-resource-cancel" type="button" data-project-requirement-resource-cancel>Cancel</button>
      <button class="secondary-btn" type="button" data-project-requirement-resource-save>Save resource</button>
    </div>
  </div>`;
}

function projectRequirementResourcesHTML(editor) {
  const resources = editor.draft.resources || [];
  const resourceList = resources.length
    ? `<div class="project-requirement-resource-list">${resources.map(projectRequirementResourceRowHTML).join("")}</div>`
    : `<p class="project-requirement-resources-empty">No resources added.</p>`;
  if (editor.mode === "draft") {
    const choosing = editor.resourceEditor?.type === "choose";
    const editingResource = editor.resourceEditor && !choosing;
    return `<section class="project-requirement-resources project-requirement-form-span" aria-labelledby="projectRequirementResourcesTitle">
      <div class="project-requirement-resources-head">
        <p id="projectRequirementResourcesTitle">Resources</p>
        <span>Attach files, links or supporting information.</span>
      </div>
      ${resourceList}
      ${editingResource ? "" : `<div class="project-requirement-resource-add-wrap">
        <button class="secondary-btn project-requirement-add-resource" type="button" data-project-requirement-resource-add aria-expanded="${String(choosing)}" aria-controls="projectRequirementResourceMenu">+ Add resource</button>
        ${projectRequirementResourceMenuHTML(editor)}
      </div>`}
      ${editingResource ? projectRequirementResourceComposerHTML(editor) : ""}
    </section>`;
  }
  return `<section class="project-requirement-resources project-requirement-form-span" aria-labelledby="projectRequirementResourcesTitle">
    <div class="project-requirement-resources-head">
      <p id="projectRequirementResourcesTitle">Resources</p>
      <span>Attach files, external links or supporting references to this requirement.</span>
    </div>
    ${resourceList}
    ${projectRequirementResourceComposerHTML(editor)}
    ${editor.resourceEditor ? "" : `<button class="project-requirement-add-resource" type="button" data-project-requirement-resource-add>+ Add resource</button>`}
  </section>`;
}

function projectRequirementTypeChoicesHTML(draft) {
  return `<fieldset class="project-requirement-fieldset">
    <legend>Requirement type</legend>
    <div class="project-requirement-type-choices">
      ${PROJECT_REQUIREMENT_TYPES.map((type) => `<label class="project-requirement-type-choice">
        <input type="radio" name="projectRequirementType" value="${type.value}"${draft.requirementType === type.value ? " checked" : ""} />
        <span><strong>${escapeHtml(type.label)}</strong><small>${escapeHtml(type.description)}</small></span>
      </label>`).join("")}
    </div>
  </fieldset>`;
}

function projectRequirementContentDraft(draft = {}) {
  return {
    documentName: String(draft.documentName || ""),
    description: String(draft.description || ""),
    contentToFollow: !!draft.contentToFollow,
    resources: structuredClone(Array.isArray(draft.resources) ? draft.resources : []),
    externalTraining: normalizeProjectRequirementExternalTraining(draft),
    backgroundCheck: normalizeProjectRequirementBackgroundCheck(draft),
    formDefinition: normalizeProjectRequirementFormDefinition(draft),
    pdfTemplate: normalizeProjectRequirementPdfTemplate(draft),
  };
}

function applyProjectRequirementContentDraft(draft, content = {}) {
  draft.documentName = String(content.documentName || "");
  draft.description = String(content.description || "");
  draft.contentToFollow = !!content.contentToFollow;
  draft.resources = structuredClone(Array.isArray(content.resources) ? content.resources : []);
  draft.externalTraining = normalizeProjectRequirementExternalTraining(content);
  draft.backgroundCheck = normalizeProjectRequirementBackgroundCheck(content);
  draft.formDefinition = normalizeProjectRequirementFormDefinition(content);
  draft.pdfTemplate = normalizeProjectRequirementPdfTemplate(content);
}

function projectRequirementDefaultContentDraft(editor, requirementType) {
  const persistedTitle = editor.original?.requirementType === requirementType
    ? String(editor.original.documentName || "").trim()
    : "";
  const defaultTitle = requirementType === "onsite_induction"
    ? "Site induction"
    : requirementType === "background_check"
      ? "DBS check"
      : "";
  return projectRequirementContentDraft({
    documentName: persistedTitle || defaultTitle,
    description: "",
    contentToFollow: false,
    resources: [],
    externalTraining: {},
    backgroundCheck: {},
    formDefinition: { fields: [] },
    pdfTemplate: { sourceResourceId: "", fields: [] },
  });
}

function projectRequirementSelectOptions(options, selected) {
  return options
    .map(
      (option) =>
        `<option value="${escapeHtml(option.value)}"${option.value === selected ? " selected" : ""}>${escapeHtml(option.label)}</option>`,
    )
    .join("");
}

function projectRequirementExternalTrainingContentHTML(draft) {
  const training = normalizeProjectRequirementExternalTraining(draft);
  return `<div class="project-requirement-form-grid">
    <label class="field-label">Training provider <span class="jw-field-optional">Optional</span>
      <input data-project-requirement-training-provider type="text" value="${escapeHtml(training.provider)}" placeholder="Training provider" autocomplete="organization" />
    </label>
    <label class="field-label">Training title *
      <input data-project-requirement-title type="text" required value="${escapeHtml(draft.documentName || "")}" placeholder="Training title" />
    </label>
    <label class="field-label project-requirement-form-span">External training URL *
      <input data-project-requirement-training-url type="url" required value="${escapeHtml(training.url)}" placeholder="https://" inputmode="url" />
    </label>
    <label class="field-label project-requirement-form-span">Worker instructions <span class="jw-field-optional">Optional</span>
      <textarea data-project-requirement-description rows="2" placeholder="Explain how the worker should complete this training.">${escapeHtml(draft.description || "")}</textarea>
    </label>
    <p class="project-requirement-guidance project-requirement-form-span">Store only the training destination and permitted instructions. Never include passwords, access tokens or third-party login credentials.</p>
  </div>`;
}

function projectRequirementBackgroundCheckContentHTML(draft) {
  const check = normalizeProjectRequirementBackgroundCheck(draft);
  const levelOptions = PROJECT_DBS_LEVELS.filter(
    (option) => !option.legacy || check.level === option.value,
  );
  const urlRequired = check.initiation === "company_provider_link";
  const eligibilityGuidance = check.checkType !== "dbs" || check.level === "basic"
    ? ""
    : `<p class="project-requirement-guidance project-requirement-form-span">Eligibility for Standard, Enhanced and barred-list DBS checks depends on the worker's role and applicable DBS rules. Confirm eligibility before requesting this level.</p>`;
  return `<div class="project-requirement-form-grid">
    <label class="field-label">Check type
      <select data-project-requirement-background-type>${projectRequirementSelectOptions(PROJECT_BACKGROUND_CHECK_TYPES, check.checkType)}</select>
    </label>
    ${check.checkType === "dbs" ? `<label class="field-label">DBS level
      <select data-project-requirement-background-level>${projectRequirementSelectOptions(levelOptions, check.level)}</select>
    </label>` : ""}
    ${eligibilityGuidance}
    <label class="field-label project-requirement-form-span">How the check is initiated
      <select data-project-requirement-background-initiation>${projectRequirementSelectOptions(PROJECT_BACKGROUND_CHECK_INITIATION, check.initiation)}</select>
    </label>
    <label class="field-label">Provider <span class="jw-field-optional">Optional</span>
      <input data-project-requirement-background-provider type="text" value="${escapeHtml(check.provider)}" placeholder="Verification provider" autocomplete="organization" />
    </label>
    <label class="field-label">Application / provider URL${urlRequired ? " *" : ' <span class="jw-field-optional">Optional</span>'}
      <input data-project-requirement-background-url type="url"${urlRequired ? " required" : ""} value="${escapeHtml(check.applicationUrl)}" placeholder="https://" inputmode="url" />
    </label>
    <label class="field-label project-requirement-form-span">Worker instructions <span class="jw-field-optional">Optional</span>
      <textarea data-project-requirement-description rows="2" placeholder="Add permitted instructions for completing the check.">${escapeHtml(draft.description || "")}</textarea>
    </label>
    <p class="project-requirement-guidance project-requirement-form-span">Do not enter criminal-history details or certificate contents. OnSite stores only the check configuration and restricted verification metadata needed for the requirement.</p>
  </div>`;
}

function projectRequirementFormFieldTypeLabel(type) {
  return {
    short_text: "Short text",
    long_text: "Long text",
    date: "Date",
    checkbox: "Checkbox / confirmation",
    single_choice: "Single choice",
    multiple_choice: "Multiple choice",
  }[type] || "Short text";
}

function projectRequirementFormDefinitionHTML(draft) {
  const pdf = (draft.resources || []).find(
    (resource) => resource.type === "file" && resource.mimeType === "application/pdf",
  );
  return `<section class="project-requirement-form-builder project-requirement-form-span" aria-labelledby="projectRequirementFormBuilderTitle">
    <div class="project-requirement-resources-head"><p id="projectRequirementFormBuilderTitle">Source document</p><span>PDF is the canonical source format for form and signature requirements.</span></div>
    ${pdf ? projectRequirementResourceRowHTML(pdf) : `<p class="project-requirement-resources-empty">No PDF uploaded.</p>`}
    <label class="secondary-btn project-requirement-resource-file-action">${pdf ? "Replace PDF" : "Upload PDF"}<input type="file" accept="application/pdf,.pdf" data-project-requirement-pdf-upload aria-label="${pdf ? "Replace source PDF" : "Upload source PDF"}" /></label>
    <p class="project-requirement-guidance">PDF field placement is not available in this build because the application has no reliable PDF page renderer or durable file-storage service. Save this requirement as content pending; no worker signing or completed PDF is simulated.</p>
  </section>`;
}

function projectRequirementDocumentUploadHTML(draft) {
  const documents = (draft.resources || []).filter(
    (resource) => resource.type === "file",
  );
  return `<section class="project-requirement-resources project-requirement-form-span" aria-labelledby="projectRequirementDocumentTitle">
    <div class="project-requirement-resources-head"><p id="projectRequirementDocumentTitle">Document upload *</p><span>Upload the document workers must read and acknowledge.</span></div>
    ${documents.length ? `<div class="project-requirement-resource-list">${documents.map(projectRequirementResourceRowHTML).join("")}</div>` : `<p class="project-requirement-resources-empty">No document uploaded.</p>`}
    <label class="secondary-btn project-requirement-resource-file-action">${documents.length ? "Replace document" : "Upload document"}<input type="file" accept="${PROJECT_REQUIREMENT_FILE_ACCEPT}" data-project-requirement-document-upload aria-label="${documents.length ? "Replace document" : "Upload document"}" /></label>
  </section>`;
}

function projectRequirementStandardContentHTML(editor) {
  const draft = editor.draft;
  const isForm = draft.requirementType === "form_signature";
  const isDocument = draft.requirementType === "document";
  return `<div class="project-requirement-form-grid">
    <label class="field-label project-requirement-form-span">Title *
      <input data-project-requirement-title type="text" required value="${escapeHtml(draft.documentName || "")}" placeholder="Requirement title" />
    </label>
    <label class="field-label project-requirement-form-span">Worker instructions <span class="jw-field-optional">Optional</span>
      <textarea data-project-requirement-description rows="2" placeholder="Add any instructions workers need to complete this requirement.">${escapeHtml(draft.description || "")}</textarea>
    </label>
    <label class="checkbox-row project-requirement-content-follow project-requirement-form-span">
      <input data-project-requirement-content-follow type="checkbox"${draft.contentToFollow ? " checked" : ""} />
      <span><strong>Add content later</strong><small>Save the requirement now and add its final content before workers need to complete it.</small></span>
    </label>
    ${draft.contentToFollow ? "" : isForm
      ? projectRequirementFormDefinitionHTML(draft)
      : isDocument
        ? projectRequirementDocumentUploadHTML(draft)
        : projectRequirementResourcesHTML(editor)}
    ${isDocument && !draft.contentToFollow ? `<p class="project-requirement-guidance project-requirement-form-span">Workers must read the full document and acknowledge it.</p>` : ""}
  </div>`;
}

function projectRequirementStepOneHTML(editor) {
  const draft = editor.draft;
  const content = draft.requirementType === "onsite_induction"
    ? ""
    : draft.requirementType === "external_training"
      ? projectRequirementExternalTrainingContentHTML(draft)
      : draft.requirementType === "background_check"
        ? projectRequirementBackgroundCheckContentHTML(draft)
        : projectRequirementStandardContentHTML(editor);
  return `<section class="project-requirement-step" aria-labelledby="projectRequirementStepTitle">
    ${editor.mode === "draft" ? `<h3 class="app-launch-visually-hidden" id="projectRequirementStepTitle" tabindex="-1">Requirement content</h3>` : `<div class="project-requirement-step-intro"><p>Content</p><h3 id="projectRequirementStepTitle" tabindex="-1">What is this requirement?</h3></div>`}
    ${projectRequirementTypeChoicesHTML(draft)}
    ${content}
  </section>`;
}

function projectRequirementLevelChoicesHTML(draft) {
  return `<fieldset class="project-requirement-fieldset">
    <legend>Requirement level</legend>
    <div class="project-requirement-level-choices">
      ${PROJECT_REQUIREMENT_LEVELS.map((level) => `<label class="project-requirement-level-choice">
        <input type="radio" name="projectRequirementLevel" value="${level.value}"${draft.requirementLevel === level.value ? " checked" : ""} />
        <span><strong>${escapeHtml(level.label)}</strong><small>${level.value === "required" ? "Required items contribute to worker readiness." : "Does not block worker readiness."}</small></span>
      </label>`).join("")}
    </div>
  </fieldset>`;
}

function projectRequirementActionFieldHTML(draft) {
  const actions = PROJECT_REQUIREMENT_ACTIONS[draft.requirementType] || [];
  const explanations = {
    document: "Workers must read the full document and acknowledge it.",
    video_induction: "Workers must watch the full video and acknowledge it.",
    form_signature: "Workers must complete the required fields and sign the document.",
    external_training: "Completion must be verified after the worker completes the external training.",
    background_check: "The requested check must be verified before the requirement is complete.",
    onsite_induction: "A supervisor confirms completion when the worker arrives.",
  };
  return `<div class="project-requirement-action-config">
    <div class="project-requirement-fixed-value"><span>Completion</span><strong>${escapeHtml(actions[0]?.label || "Completion required")}</strong><small>${escapeHtml(explanations[draft.requirementType] || "")}</small></div>
  </div>`;
}

function projectRequirementCompletionEvidenceHTML(draft) {
  if (["external_training", "background_check"].includes(draft.requirementType)) {
    return "";
  }
  const options = projectRequirementEvidenceOptions(draft);
  if (!options.length) return "";
  const configured = new Set(
    normalizeProjectRequirementCompletionEvidence(draft),
  );
  const descriptions = {
    worker_confirmation:
      "The worker confirms in OnSite that the external activity is complete.",
    upload_evidence:
      "The worker provides a completion document, certificate or image.",
    company_verification:
      "A company user checks the external system or supplied evidence.",
    provider_verification:
      "A future provider integration confirms the check or training status.",
    supervisor_signoff:
      "An authorised site or company user confirms completion.",
  };
  return `<fieldset class="project-requirement-evidence">
    <legend>Completion evidence</legend>
    <p>Choose the evidence required for activity completed outside OnSite. Opening an external link does not complete this requirement.</p>
    <div class="project-requirement-evidence-options">
      ${options.map((option) => `<label class="checkbox-row">
        <input type="checkbox" name="projectRequirementEvidence" value="${option.value}"${configured.has(option.value) ? " checked" : ""} />
        <span><strong>${escapeHtml(option.label)}</strong><small>${escapeHtml(descriptions[option.value])}</small></span>
      </label>`).join("")}
    </div>
  </fieldset>`;
}

function projectRequirementTimingChoicesHTML(draft) {
  const timings = PROJECT_REQUIREMENT_TIMINGS.filter(
    (timing) =>
      timing.value !== "reference_anytime" ||
      (draft.requirementLevel === "optional" &&
        draft.requirementType !== "onsite_induction"),
  );
  return `<fieldset class="project-requirement-fieldset">
    <legend>Completion timing</legend>
    <div class="project-requirement-timing-choices">
      ${timings.map((timing) => `<label class="project-requirement-timing-choice">
        <input type="radio" name="projectRequirementTiming" value="${timing.value}"${draft.timing === timing.value ? " checked" : ""} />
        <span>${escapeHtml(timing.label)}</span>
      </label>`).join("")}
    </div>
    ${    .map(
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
