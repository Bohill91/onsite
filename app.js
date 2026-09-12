}

function projectRequirementReviewConsequence(draft) {
  if (draft.requirementLevel === "optional") {
    return "Does not block sub-contractor readiness.";
  }
  if (draft.timing === "on_arrival") {
    return "Completed on arrival before the sub-contractor is cleared to start.";
  }
  if (draft.timing === "reference_anytime") {
    return "Available as a reference without blocking sub-contractor readiness.";
  }
  return "Required before sub-contractors are considered pre-start ready.";
}

function projectRequirementReviewHTML(editor, draft) {
  const action = projectRequirementConfiguredActionLabel(draft);
  const version = String(draft.version || "").trim();
  const rows = [
    ["Type", projectRequirementTypeLabel(draft.requirementType)],
    ["Content", draft.contentToFollow ? "Content to follow" : "Configured"],
    ["Resources", projectRequirementContentSummary(draft)],
    ["Requirement level", draft.requirementLevel === "optional" ? "Optional" : "Required"],
    ["Sub-contractor action", action],
    ["Completion timing", projectRequirementTimingLabel(draft.timing)],
    ["Audience", projectRequirementEditorAudienceLabel(editor, draft)],
    ["Version", version || "Not set"],
  ];
  if (draft.requirementType === "external_training") {
    const training = normalizeProjectRequirementExternalTraining(draft);
    rows.splice(
      1,
      0,
      ["Training provider", training.provider || "Not specified"],
      [
        "Access method",
        projectRequirementOptionLabel(
          PROJECT_EXTERNAL_TRAINING_ACCESS_METHODS,
          training.accessMethod,
        ),
      ],
      ...(training.accessMethod === "web_link"
        ? [["Training URL", training.url || "Not set"]]
        : []),
    );
  }
  if (draft.requirementType === "background_check") {
    const check = normalizeProjectRequirementBackgroundCheck(draft);
    rows.splice(
      1,
      0,
      [
        "Check type",
        projectRequirementOptionLabel(
          PROJECT_BACKGROUND_CHECK_TYPES,
          check.checkType,
        ),
      ],
      ["DBS level", projectRequirementOptionLabel(PROJECT_DBS_LEVELS, check.level)],
      [
        "Initiated by",
        projectRequirementOptionLabel(
          PROJECT_BACKGROUND_CHECK_INITIATION,
          check.initiation,
        ),
      ],
      ["Provider", check.provider || "Not specified"],
      ...(check.applicationUrl
        ? [["Application URL", check.applicationUrl]]
        : []),
    );
  }
  const evidence = normalizeProjectRequirementCompletionEvidence(draft)
    .map(
      (value) =>
        PROJECT_REQUIREMENT_COMPLETION_EVIDENCE.find(
          (option) => option.value === value,
        )?.label,
    )
    .filter(Boolean)
    .join(" + ");
  if (evidence) {
    const evidenceLabel = ["external_training", "background_check"].includes(
      draft.requirementType,
    )
      ? "Completion evidence"
      : "External evidence";
    rows.splice(4, 0, [evidenceLabel, evidence]);
  }
  return `<section class="project-requirement-review" data-project-requirement-review aria-labelledby="projectRequirementReviewTitle">
    <div class="project-requirement-review-head">
      <p>Review</p>
      <h4 id="projectRequirementReviewTitle">${escapeHtml(draft.documentName || "Untitled requirement")}</h4>
    </div>
    <dl>${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>
    <p class="project-requirement-review-consequence">${escapeHtml(projectRequirementReviewConsequence(draft))}</p>
    ${draft.requireRecompletionOnUpdate ? `<p class="project-requirement-review-note">Sub-contractors must complete future issued versions again.</p>` : ""}
  </section>`;
}

function projectRequirementStepThreeHTML(editor, draft) {
  return `<section class="project-requirement-step" aria-labelledby="projectRequirementStepTitle">
    <div class="project-requirement-step-intro"><p>Assignment</p><h3 id="projectRequirementStepTitle" tabindex="-1">Who does this apply to?</h3></div>
    ${projectRequirementAudienceSelectionHTML(editor, draft.audience)}
    ${projectRequirementLevelChoicesHTML(draft)}
    <div class="project-requirement-completion-grid">
      ${projectRequirementTimingChoicesHTML(draft)}
    </div>
    ${editor.mode === "draft" ? "" : `<details class="project-requirement-advanced">
      <summary>Advanced settings</summary>
      <div class="project-requirement-advanced-body">
        <label class="field-label">Version / revision
          <input data-project-requirement-version type="text" required value="${escapeHtml(draft.version || "1")}" />
        </label>
        <label class="checkbox-row project-requirement-recompletion">
          <input data-project-requirement-recompletion type="checkbox"${draft.requireRecompletionOnUpdate ? " checked" : ""} />
          <span>Require re-completion when a new version is issued</span>
        </label>
      </div>
    </details>`}
    ${projectRequirementReviewHTML(editor, draft)}
  </section>`;
}

function projectRequirementEditorStepHTML(editor) {
  if (editor.step === 1) return projectRequirementStepOneHTML(editor);
  if (editor.step === 2) return projectRequirementStepTwoHTML(editor.draft);
  return projectRequirementStepThreeHTML(editor, editor.draft);
}

function projectRequirementEditorFooterHTML(editor) {
  const isFinal = editor.step === 3;
  const contentIssue = editor.step === 1
    ? projectRequirementDraftValidationIssue(editor)
    : null;
  const contentContinueDisabled = editor.step === 1 && contentIssue?.step === 1;
  const remove = isFinal && editor.requirementId
    ? `<button class="secondary-btn danger" type="button" data-project-requirement-remove="${escapeHtml(editor.requirementId)}">Remove requirement</button>`
    : "<span></span>";
  const leftAction = editor.step === 1
    ? `<button class="secondary-btn" type="button" data-project-requirement-close>Cancel</button>`
    : `<button class="secondary-btn" type="button" data-project-requirement-back>Back</button>`;
  const rightAction = isFinal
    ? `<button class="primary-btn" type="submit">${editor.mode === "draft" ? "Save requirement" : editor.requirementId ? "Save changes" : "Add requirement"}</button>`
    : `<button class="primary-btn project-requirement-continue" type="button" data-project-requirement-next${contentContinueDisabled ? " disabled" : ""}>Continue</button>`;
  return `<footer class="project-requirement-sheet-actions">${remove}<div>${leftAction}${rightAction}</div></footer>`;
}

function syncProjectRequirementEditorDraft(modal) {
  const editor = projectRequirementEditorState;
  if (!editor) return;
  const draft = editor.draft;
  const externalTraining = normalizeProjectRequirementExternalTraining(draft);
  const value = (selector) => modal.querySelector(selector)?.value;
  const checked = (name) => modal.querySelector(`input[name="${name}"]:checked`)?.value;
  const type = checked("projectRequirementType");
  if (type) draft.requirementType = type;
  if (value("[data-project-requirement-title]") != null) draft.documentName = value("[data-project-requirement-title]");
  if (value("[data-project-requirement-description]") != null) draft.description = value("[data-project-requirement-description]");
  if (value("[data-project-requirement-training-provider]") != null) {
    externalTraining.provider = value(
      "[data-project-requirement-training-provider]",
    );
  }
  if (value("[data-project-requirement-training-access]") != null) {
    externalTraining.accessMethod = value(
      "[data-project-requirement-training-access]",
    );
  }
  if (value("[data-project-requirement-training-url]") != null) {
    externalTraining.url = value("[data-project-requirement-training-url]");
  }
  draft.externalTraining = externalTraining;
  if (value("[data-project-requirement-video-url]") != null) {
    const videoUrl = value("[data-project-requirement-video-url]").trim();
    const existingVideo = projectRequirementVideoSourceResource(draft);
    draft.videoSourceUrl = videoUrl;
    draft.resources = (draft.resources || []).filter(
      (resource) => resource.id !== existingVideo?.id,
    );
    if (validProjectRequirementExternalUrl(videoUrl)) {
      draft.resources.push({
        id: existingVideo?.id || createId(),
        type: "external_link",
        label: "Induction video",
        url: videoUrl,
        instructions: "",
        role: "video_source",
        createdAt: existingVideo?.createdAt || new Date().toISOString(),
      });
    }
  }
  if (value("[data-project-requirement-background-type]") != null) {
    draft.backgroundCheck.checkType = value(
      "[data-project-requirement-background-type]",
    );
  }
  if (value("[data-project-requirement-background-level]") != null) {
    draft.backgroundCheck.level = value(
      "[data-project-requirement-background-level]",
    );
  }
  if (value("[data-project-requirement-background-initiation]") != null) {
    draft.backgroundCheck.initiation = value(
      "[data-project-requirement-background-initiation]",
    );
  }
  if (value("[data-project-requirement-background-provider]") != null) {
    draft.backgroundCheck.provider = value(
      "[data-project-requirement-background-provider]",
    );
  }
  if (value("[data-project-requirement-background-url]") != null) {
    draft.backgroundCheck.applicationUrl = value(
      "[data-project-requirement-background-url]",
    );
  }
  const contentToFollow = modal.querySelector(
    "[data-project-requirement-content-follow]",
  );
  if (contentToFollow) draft.contentToFollow = contentToFollow.checked;
  const action = checked("projectRequirementAction");
  if (action) draft.completionAction = action;
  const level = checked("projectRequirementLevel");
  if (level) draft.requirementLevel = level;
  const timing = checked("projectRequirementTiming");
  if (timing) draft.timing = timing;
  if (draft.requirementType === "onsite_induction") {
    draft.completionAction = "supervisor_signoff";
    draft.timing = "on_arrival";
  }
  if (value("[data-project-requirement-pass]") != null) {
    draft.comprehensionCheck.passThreshold = Number(value("[data-project-requirement-pass]"));
  }
  if (modal.querySelector('input[name="projectRequirementAudienceScope"]')) {
    const audienceScope = checked("projectRequirementAudienceScope");
    const audienceIds = Array.from(
      modal.querySelectorAll("[data-project-requirement-audience-id]:checked"),
    )
      .map((input) => input.value)
      .filter(Boolean);
    draft.audience = audienceScope === "requirements"
      ? {
          type: "labour_requirements",
          labourRequirementIds: audienceIds,
          labourRequirementId: audienceIds[0] || "",
        }
      : { type: "all_project_workers", labourRequirementId: "" };
  }
  if (value("[data-project-requirement-version]") != null) {
    draft.version = value("[data-project-requirement-version]");
  }
  const recompletion = modal.querySelector("[data-project-requirement-recompletion]");
  if (recompletion) draft.requireRecompletionOnUpdate = recompletion.checked;
  const workerConfirmation = modal.querySelector(
    "[data-project-requirement-worker-confirmation]",
  );
  if (workerConfirmation) {
    draft.requireWorkerAcknowledgementSignature = workerConfirmation.checked;
  }
  const evidenceInputs = Array.from(
    modal.querySelectorAll('input[name="projectRequirementEvidence"]'),
  );
  if (evidenceInputs.length) {
    draft.completionEvidence = evidenceInputs
      .filter((input) => input.checked)
      .map((input) => input.value);
  }
}

function refreshProjectRequirementReview(modal) {
  const editor = projectRequirementEditorState;
  const currentReview = modal.querySelector("[data-project-requirement-review]");
  if (!editor || !currentReview) return;
  currentReview.outerHTML = projectRequirementReviewHTML(editor, editor.draft);
}

function validateProjectRequirementEditorStep(modal) {
  if (
    projectRequirementEditorState?.mode === "draft" &&
    projectRequirementEditorState.step === 1 &&
    projectRequirementEditorState.resourceEditor
  ) {
    showToast("Finish adding the resource or cancel it before continuing");
    return false;
  }
  const form = modal.querySelector("[data-project-requirement-form]");
  if (!form?.reportValidity()) return false;
  if (
    projectRequirementEditorState?.step === 1 &&
    projectRequirementEditorState.resourceEditor
  ) {
    showToast("Finish adding the resource or cancel it before continuing");
    return false;
  }
  if (projectRequirementEditorState?.step === 2) {
    const threshold = modal.querySelector("[data-project-requirement-pass]");
    if (threshold && (Number(threshold.value) < 1 || Number(threshold.value) > 100)) {
      threshold.setCustomValidity("Enter a pass threshold between 1 and 100.");
      threshold.reportValidity();
      threshold.setCustomValidity("");
      return false;
    }
    const evidenceInputs = Array.from(
      modal.querySelectorAll('input[name="projectRequirementEvidence"]'),
    );
    if (evidenceInputs.length && !evidenceInputs.some((input) => input.checked)) {
      evidenceInputs[0].setCustomValidity("Choose at least one completion evidence method.");
      evidenceInputs[0].reportValidity();
      evidenceInputs[0].setCustomValidity("");
      return false;
    }
  }
  return true;
}

function projectRequirementDraftValidationIssue(editor) {
  const draft = editor?.draft;
  if (!draft) return null;
  if (
    !PROJECT_REQUIREMENT_TYPES.some(
      (type) => type.value === draft.requirementType,
    )
  ) {
    return {
      step: 1,
      selector: 'input[name="projectRequirementType"]',
      message: "Choose a requirement type.",
    };
  }
  if (
    !["onsite_induction", "background_check"].includes(
      draft.requirementType,
    ) &&
    !String(draft.documentName || "").trim()
  ) {
    return {
      step: 1,
      selector: "[data-project-requirement-title]",
      message: "Enter a requirement title.",
    };
  }
  if (draft.requirementType === "external_training") {
    const training = normalizeProjectRequirementExternalTraining(draft);
    if (
      training.accessMethod === "web_link" &&
      !validProjectRequirementExternalUrl(training.url)
    ) {
      return {
        step: 1,
        selector: "[data-project-requirement-training-url]",
        message: "Enter a valid external training URL.",
      };
    }
  }
  if (draft.requirementType === "background_check") {
    const check = draft.backgroundCheck || {};
    if (
      !PROJECT_BACKGROUND_CHECK_TYPES.some(
        (option) => option.value === check.checkType,
      )
    ) {
      return {
        step: 1,
        selector: "[data-project-requirement-background-type]",
        message: "Choose a valid background check type.",
      };
    }
    if (
      check.checkType === "dbs" &&
      !PROJECT_DBS_LEVELS.some((option) => option.value === check.level)
    ) {
      return {
        step: 1,
        selector: "[data-project-requirement-background-level]",
        message: "Choose a valid DBS level.",
      };
    }
    if (
      !PROJECT_BACKGROUND_CHECK_INITIATION.some(
        (option) => option.value === check.initiation,
      )
    ) {
      return {
        step: 1,
        selector: "[data-project-requirement-background-initiation]",
        message: "Choose how the background check is initiated.",
      };
    }
    if (
      check.applicationUrl &&
      !validProjectRequirementExternalUrl(check.applicationUrl)
    ) {
      return {
        step: 1,
        selector: "[data-project-requirement-background-url]",
        message: "Enter a valid application or provider URL.",
      };
    }
    if (
      check.initiation === "company_provider_link" &&
      !validProjectRequirementExternalUrl(check.applicationUrl)
    ) {
      return {
        step: 1,
        selector: "[data-project-requirement-background-url]",
        message: "Add the application or provider URL sent to sub-contractors.",
      };
    }
  }
  if (
    !draft.contentToFollow &&
    draft.requirementType === "document" &&
    !(draft.resources || []).some((resource) => resource.type === "file")
  ) {
    return {
      step: 1,
      selector: "[data-project-requirement-document-upload]",
      message: "Upload the document sub-contractors must read, or choose Add content later.",
    };
  }
  if (
    !draft.contentToFollow &&
    draft.requirementType === "video_induction" &&
    !validProjectRequirementExternalUrl(projectRequirementVideoSourceUrl(draft))
  ) {
    return {
      step: 1,
      selector: "[data-project-requirement-video-url]",
      message: "Add a valid video URL.",
    };
  }
  if (
    !draft.contentToFollow &&
    draft.requirementType === "form_signature" &&
    !(draft.resources || []).some(
      (resource) => resource.type === "file" && resource.mimeType === "application/pdf",
    )
  ) {
    return {
      step: 1,
      selector: "[data-project-requirement-pdf-upload]",
      message: "Upload the source PDF, or choose Add content later.",
    };
  }
  const validAction = (PROJECT_REQUIREMENT_ACTIONS[draft.requirementType] || [])
    .some((action) => action.value === draft.completionAction);
  if (!validAction) {
    return {
      step: 2,
      selector: "[data-project-requirement-action]",
      message: "Choose a valid sub-contractor action.",
    };
  }
  if (
    projectRequirementHasExternalLink(draft) &&
    !normalizeProjectRequirementCompletionEvidence(draft).length
  ) {
    return {
      step: 2,
      selector: 'input[name="projectRequirementEvidence"]',
      message: "Choose at least one completion evidence method.",
    };
  }
  if (
    draft.requirementType === "video_induction" &&
    draft.completionAction === "watch_comprehension" &&
    (Number(draft.comprehensionCheck?.passThreshold) < 1 ||
      Number(draft.comprehensionCheck?.passThreshold) > 100)
  ) {
    return {
      step: 2,
      selector: "[data-project-requirement-pass]",
      message: "Enter a pass threshold between 1 and 100.",
    };
  }
  if (
    draft.requirementType === "video_induction" &&
    draft.completionAction === "watch_comprehension" &&
    !(draft.comprehensionCheck?.questions || []).length
  ) {
    return {
      step: 2,
      selector: "[data-project-requirement-quiz-prompt]",
      message: "Add at least one comprehension question.",
    };
  }
  if (!String(draft.version || "").trim()) {
    return {
      step: 3,
      selector: "[data-project-requirement-version]",
      message: "Enter a version or revision.",
      revealAdvanced: true,
    };
  }
  if (
    editor.mode === "draft" &&
    projectRequirementAudienceIds(draft).some(
      (id) => !projectRequirementEditorLabourRequirements(editor).some(
        (requirement) => requirement.id === id,
      ),
    )
  ) {
    return {
      step: 3,
      selector: "[data-project-requirement-audience]",
      message: "Choose an available labour requirement or all project sub-contractors.",
    };
  }
  if (
    editor.step === 3 &&
    draft.audience?.type === "labour_requirements" &&
    !projectRequirementAudienceIds(draft).length
  ) {
    return {
      step: 3,
      selector: 'input[name="projectRequirementAudienceScope"][value="requirements"]',
      message: "Choose at least one labour requirement, or apply this to all project sub-contractors.",
    };
  }
  return null;
}

function updateProjectRequirementContentContinueState(modal) {
  const editor = projectRequirementEditorState;
  const button = modal?.querySelector("[data-project-requirement-next]");
  if (!editor || !button || editor.step !== 1) return;
  syncProjectRequirementEditorDraft(modal);
  const issue = projectRequirementDraftValidationIssue(editor);
  button.disabled = issue?.step === 1;
}

function showProjectRequirementValidationIssue(issue) {
  if (!issue || !projectRequirementEditorState) return;
  showToast(issue.message);
  projectRequirementEditorState.step = issue.step;
  renderProjectRequirementEditor({ focusHeading: false });
  requestAnimationFrame(() => {
    const modal = document.getElementById("projectRequirementModal");
    if (issue.revealAdvanced) {
      const advanced = modal?.querySelector(".project-requirement-advanced");
      if (advanced) advanced.open = true;
    }
    const field = modal?.querySelector(issue.selector);
    if (!field) return;
    if (projectRequirementEditorState?.mode === "draft") {
      field.focus();
      return;
    }
    if (typeof field.setCustomValidity === "function") {
      field.setCustomValidity(issue.message);
      field.reportValidity();
      field.setCustomValidity("");
    } else {
      field.focus();
    }
  });
}

function projectRequirementStepperHTML(editor) {
  return [[1, "Content"], [2, "Completion"], [3, "Assignment"]]
    .map(([step, label]) => {
      const active = editor.step === step;
      const complete = editor.step > step;
      const marker = complete ? onsiteIcon("check", 12) : step;
      const content = `<span>${marker}</span><strong>${escapeHtml(label)}</strong>`;
      return `<li class="${active ? "active" : complete ? "complete" : ""}"${active ? ` aria-current="step"` : ""}>${complete
        ? `<button class="project-requirement-step-control" type="button" data-project-requirement-step="${step}" aria-label="Return to ${escapeHtml(label)}">${content}</button>`
        : `<span class="project-requirement-step-control">${content}</span>`}</li>`;
    })
    .join("");
}

function renderProjectRequirementEditor({ focusHeading = true } = {}) {
  const editor = projectRequirementEditorState;
  const modal = document.getElementById("projectRequirementModal");
  const job = findJob(editor?.jobId);
  if (!editor || !modal || (editor.mode !== "draft" && !job)) return;
  modal.innerHTML = `<form class="project-requirement-sheet${editor.mode === "draft" ? " is-draft-prestart" : ""}" data-project-requirement-form="${escapeHtml(job?.id || "request-labour-draft")}" role="dialog" aria-modal="true" aria-labelledby="projectRequirementModalTitle">
    <header class="project-requirement-sheet-head">
      <div class="project-requirement-sheet-heading"><h2 id="projectRequirementModalTitle">${editor.mode === "draft" ? "Add requirement" : editor.requirementId ? "Manage requirement" : "Add requirement"}</h2></div>
      <button class="modal-close-btn" type="button" data-project-requirement-close aria-label="Close">${onsiteIcon("x", 18)}</button>
      <ol class="project-requirement-steps" aria-label="Requirement creation progress">
        ${projectRequirementStepperHTML(editor)}
      </ol>
    </header>
    <div class="project-requirement-sheet-body">${projectRequirementEditorStepHTML(editor)}</div>
    ${projectRequirementEditorFooterHTML(editor)}
  </form>`;
  bindProjectRequirementEditorControls(modal);
  if (focusHeading) {
    requestAnimationFrame(() =>
      modal.querySelector("#projectRequirementStepTitle")?.focus(),
    );
  }
}

function projectRequirementEditorHasUnsavedChanges() {
  const editor = projectRequirementEditorState;
  if (!editor) return false;
  const modal = document.getElementById("projectRequirementModal");
  if (modal) syncProjectRequirementEditorDraft(modal);
  return JSON.stringify(editor.draft) !== editor.initialDraftSnapshot;
}

function closeProjectRequirementModal({ afterClose = null } = {}) {
  const modal = document.getElementById("projectRequirementModal");
  if (!modal) return;
  const trigger = projectRequirementModalTrigger;
  projectRequirementModalTrigger = null;
  projectRequirementEditorState = null;
  hideWithMotion(modal, () => {
    if (trigger instanceof HTMLElement && document.body.contains(trigger)) trigger.focus();
    if (typeof afterClose === "function") afterClose();
  }, { remove: true });
}

function closeProjectRequirementUnsavedGuard() {
  hideWithMotion(
    document.getElementById("projectRequirementUnsavedGuard"),
    null,
    { remove: true },
  );
}

function openProjectRequirementUnsavedGuard(afterExit = null) {
  document.getElementById("projectRequirementUnsavedGuard")?.remove();
  const modal = document.createElement("div");
  modal.id = "projectRequirementUnsavedGuard";
  modal.className = "modal-overlay";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "projectRequirementUnsavedTitle");
  modal.innerHTML = `<div class="dispute-sheet jw-requirement-guard-sheet">
    <div class="dispute-sheet-header">
      <div><h3 class="dispute-sheet-title" id="projectRequirementUnsavedTitle">Unsaved pre-start requirement</h3></div>
      <button class="modal-close-btn" type="button" aria-label="Close and keep editing" data-project-requirement-guard-keep>×</button>
    </div>
    <div class="dispute-sheet-body">
      <p class="jw-requirement-guard-copy">Save or discard this requirement before leaving the editor.</p>
      <div class="jw-requirement-guard-actions">
        <button class="secondary-btn" type="button" data-project-requirement-guard-keep>Keep editing</button>
        <button class="secondary-btn" type="button" data-project-requirement-guard-discard>Discard changes</button>
        <button class="primary-btn" type="button" data-project-requirement-guard-save>Save requirement</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-project-requirement-guard-keep]").forEach(
    (button) => button.addEventListener("click", closeProjectRequirementUnsavedGuard),
  );
  modal.querySelector("[data-project-requirement-guard-discard]")?.addEventListener("click", () => {
    closeProjectRequirementUnsavedGuard();
    closeProjectRequirementModal({ afterClose: afterExit });
  });
  modal.querySelector("[data-project-requirement-guard-save]")?.addEventListener("click", () => {
    closeProjectRequirementUnsavedGuard();
    saveProjectRequirementEditor({ afterSave: afterExit });
  });
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeProjectRequirementUnsavedGuard();
  });
  modal.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    closeProjectRequirementUnsavedGuard();
  });
  modal.querySelector("[data-project-requirement-guard-keep]")?.focus();
}

function requestProjectRequirementEditorExit(afterExit = null) {
  if (!projectRequirementEditorState) {
    if (typeof afterExit === "function") afterExit();
    return;
  }
  if (projectRequirementEditorHasUnsavedChanges()) {
    openProjectRequirementUnsavedGuard(afterExit);
    return;
  }
  closeProjectRequirementModal({ afterClose: afterExit });
}

function saveProjectRequirementEditor({ afterSave = null } = {}) {
  const editor = projectRequirementEditorState;
  const modal = document.getElementById("projectRequirementModal");
  if (!editor || !modal) return false;
  syncProjectRequirementEditorDraft(modal);
  const validationIssue = projectRequirementDraftValidationIssue(editor);
  if (validationIssue) {
    showProjectRequirementValidationIssue(validationIssue);
    return false;
  }
  if (!validateProjectRequirementEditorStep(modal)) return false;
  const draft = editor.draft;
  const requirementPayload = {
    ...editor.original,
    documentId: editor.requirementId || undefined,
    documentName: draft.documentName,
    requirementType: draft.requirementType,
    description: draft.description,
    contentToFollow: draft.contentToFollow,
    sourceReference: "",
    resources: draft.resources,
    completionAction: draft.completionAction,
    completionEvidence: normalizeProjectRequirementCompletionEvidence(draft),
    requirementLevel: draft.requirementLevel,
    timing: draft.timing,
    audience: draft.audience,
    version: draft.version || "1",
    requireRecompletionOnUpdate: draft.requireRecompletionOnUpdate,
    requireWorkerAcknowledgementSignature:
      draft.requirementType === "onsite_induction" &&
      draft.requireWorkerAcknowledgementSignature,
    externalTraining:
      draft.requirementType === "external_training"
        ? normalizeProjectRequirementExternalTraining(draft)
        : null,
    backgroundCheck:
      draft.requirementType === "background_check"
        ? normalizeProjectRequirementBackgroundCheck(draft)
        : null,
    formDefinition:
      draft.requirementType === "form_signature"
        ? normalizeProjectRequirementFormDefinition(draft)
        : { fields: [] },
    pdfTemplate:
      draft.requirementType === "form_signature"
        ? normalizeProjectRequirementPdfTemplate(draft)
        : { sourceResourceId: "", fields: [] },
    comprehensionCheck: {
      enabled: draft.requirementType === "video_induction" && draft.completionAction === "watch_comprehension",
      passThreshold: draft.comprehensionCheck?.passThreshold || 80,
      questions: (draft.comprehensionCheck?.questions || [])
        .map(normalizeProjectRequirementQuizQuestion)
        .filter(Boolean),
    },
  };
  const result = editor.mode === "draft"
    ? upsertDraftPreStartRequirement(requirementPayload)
    : upsertProjectRequirement(editor.jobId, requirementPayload);
  if (!result.ok) {
    showToast(result.reason);
    return false;
  }
  closeProjectRequirementModal({
    afterClose: () => {
      if (editor.mode === "draft") renderDraftPreStartStep();
      else render();
      if (typeof afterSave === "function") afterSave();
    },
  });
  showToast(
    result.updated
      ? "Pre-start requirement updated"
      : "Pre-start requirement added",
  );
  return true;
}

function readProjectRequirementFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The selected file could not be read."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function projectRequirementFileExtensionAllowed(fileName) {
  const extension = `.${String(fileName || "").split(".").pop().toLowerCase()}`;
  return PROJECT_REQUIREMENT_FILE_ACCEPT.split(",").includes(extension);
}

function projectRequirementFileBytes(resources, excludedId = "") {
  return (resources || [])
    .filter(
      (resource) =>
        resource.type === "file" && resource.id !== excludedId,
    )
    .reduce((total, resource) => total + (Number(resource.size) || 0), 0);
}

async function createProjectRequirementFileResources(
  files,
  resources,
  replacedResource = null,
) {
  const selected = Array.from(files || []);
  if (!selected.length) return [];
  const invalidType = selected.find(
    (file) => !projectRequirementFileExtensionAllowed(file.name),
  );
  if (invalidType) {
    throw new Error("Choose a supported project document, office file or image.");
  }
  const oversized = selected.find(
    (file) => file.size > PROJECT_REQUIREMENT_FILE_MAX_BYTES,
  );
  if (oversized) {
    throw new Error(`${oversized.name} is larger than the 1 MB local prototype limit.`);
  }
  const existingBytes = projectRequirementFileBytes(
    resources,
    replacedResource?.id || "",
  );
  const selectedBytes = selected.reduce((total, file) => total + file.size, 0);
  if (existingBytes + selectedBytes > PROJECT_REQUIREMENT_FILES_TOTAL_MAX_BYTES) {
    throw new Error("Requirement files exceed the 2 MB local prototype limit.");
  }
  const createdAt = replacedResource?.createdAt || new Date().toISOString();
  return Promise.all(
    selected.map(async (file, index) => ({
      id:
        replacedResource && index === 0
          ? replacedResource.id
          : createId(),
      type: "file",
      label: file.name,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      dataUrl: await readProjectRequirementFile(file),
      createdAt,
    })),
  );
}

function syncProjectRequirementEvidenceDefaults(draft) {
  draft.completionEvidence = normalizeProjectRequirementCompletionEvidence({
    ...draft,
    completionEvidence: draft.completionEvidence,
  });
}

function saveProjectRequirementResource(modal) {
  const editor = projectRequirementEditorState;
  const resourceEditor = editor?.resourceEditor;
  if (!editor || !resourceEditor) return;
  const composer = modal.querySelector(".project-requirement-resource-composer");
  const requiredFields = Array.from(
    composer?.querySelectorAll("input[required], textarea[required]") || [],
  );
  const invalidField = requiredFields.find((field) => !field.checkValidity());
  if (invalidField) {
    invalidField.reportValidity();
    return;
  }
  const existingIndex = editor.draft.resources.findIndex(
    (resource) => resource.id === resourceEditor.resourceId,
  );
  const existing = editor.draft.resources[existingIndex];
  const label = modal
    .querySelector("[data-project-requirement-resource-label]")
    ?.value.trim();
  let resource = null;
  if (resourceEditor.type === "external_link") {
    const urlField = modal.querySelector(
      "[data-project-requirement-resource-url]",
    );
    const url = urlField?.value.trim();
    if (!validProjectRequirementExternalUrl(url)) {
      urlField.setCustomValidity("Enter a valid http or https URL.");
      urlField.reportValidity();
      urlField.setCustomValidity("");
      return;
    }
    resource = {
      id: existing?.id || createId(),
      type: "external_link",
      label,
      url,
      instructions:
        modal
          .querySelector("[data-project-requirement-resource-instructions]")
          ?.value.trim() || "",
      createdAt: existing?.createdAt || new Date().toISOString(),
    };
  } else if (resourceEditor.type === "reference") {
    resource = {
      id: existing?.id || createId(),
      type: "reference",
      label,
      details:
        modal
          .querySelector("[data-project-requirement-resource-details]")
          ?.value.trim() || "",
      createdAt: existing?.createdAt || new Date().toISOString(),
    };
  }
  const normalized = normalizeProjectRequirementResource(resource);
  if (!normalized) return;
  if (existingIndex >= 0) editor.draft.resources[existingIndex] = normalized;
  else editor.draft.resources.push(normalized);
  syncProjectRequirementEvidenceDefaults(editor.draft);
  editor.resourceEditor = null;
  renderProjectRequirementEditor({ focusHeading: false });
}

function bindProjectRequirementEditorControls(modal) {
  modal
    .querySelector("[data-project-requirement-document-upload]")
    ?.addEventListener("change", async (event) => {
      syncProjectRequirementEditorDraft(modal);
      const file = event.currentTarget.files?.[0];
      if (!file) return;
      const existingFile = projectRequirementEditorState.draft.resources.find(
        (resource) => resource.type === "file",
      );
      try {
        const [resource] = await createProjectRequirementFileResources(
          [file],
          projectRequirementEditorState.draft.resources,
          existingFile || null,
        );
        if (!resource) return;
        projectRequirementEditorState.draft.resources = [
          ...projectRequirementEditorState.draft.resources.filter(
            (item) => item.id !== existingFile?.id,
          ),
          resource,
        ];
        renderProjectRequirementEditor({ focusHeading: false });
      } catch (error) {
        showToast(error.message || "The document could not be added");
      }
    });
  modal
    .querySelector("[data-project-requirement-pdf-upload]")
    ?.addEventListener("change", async (event) => {
      syncProjectRequirementEditorDraft(modal);
      const file = event.currentTarget.files?.[0];
      if (!file) return;
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        showToast("Choose a PDF source document");
        return;
      }
      const existingPdf = projectRequirementEditorState.draft.resources.find(
        (resource) => resource.type === "file" && resource.mimeType === "application/pdf",
      );
      try {
        const [resource] = await createProjectRequirementFileResources(
          [file],
          projectRequirementEditorState.draft.resources,
          existingPdf || null,
        );
        if (!resource) return;
        projectRequirementEditorState.draft.resources = [
          ...projectRequirementEditorState.draft.resources.filter(
            (item) => item.id !== existingPdf?.id,
          ),
          resource,
        ];
        projectRequirementEditorState.draft.pdfTemplate = {
          sourceResourceId: resource.id,
          fields: existingPdf?.id === resource.id
            ? normalizeProjectRequirementPdfTemplate(
                projectRequirementEdi    .map(
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
