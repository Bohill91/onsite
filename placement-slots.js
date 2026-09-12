(function initPlacementSlots(globalScope) {
  "use strict";

  const SLOT_STATUS = Object.freeze({
    OPEN: "open",
    UNDER_OFFER: "under_offer",
    CONFIRMED: "confirmed",
    ACTIVE: "active",
    RELEASED: "released",
    COMPLETED: "completed",
    CANCELLED: "cancelled",
  });
  const AVAILABLE_STATUSES = new Set([SLOT_STATUS.OPEN, SLOT_STATUS.RELEASED]);
  const FILLED_STATUSES = new Set([
    SLOT_STATUS.CONFIRMED,
    SLOT_STATUS.ACTIVE,
    SLOT_STATUS.COMPLETED,
  ]);
  const COMMITTED_STATUSES = new Set([
    SLOT_STATUS.UNDER_OFFER,
    ...FILLED_STATUSES,
  ]);
  const ACTIVE_APPLICATION_STATUSES = new Set([
    "offered",
    "accepted_by_worker",
    "under_company_review",
  ]);

  function cleanIdPart(value) {
    return String(value || "record")
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "record";
  }

  function requirementSignature(requirement) {
    const req = requirement || {};
    return JSON.stringify([
      req.trade || req.tradeKey || "",
      req.specialism || req.roleKey || "",
      req.grade || "",
      req.workActivity || "",
      Number(req.quantity) || 1,
      req.budgetMin ?? "",
      req.budgetMax ?? "",
      Array.isArray(req.requiredCredentialIds)
        ? [...req.requiredCredentialIds].sort()
        : req.requiredQualifications || "",
    ]);
  }

  function signatureHash(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function stableRequirementId(job, requirement) {
    return `req-${cleanIdPart(job?.id || "project")}-${signatureHash(requirementSignature(requirement))}`;
  }

  function legacyRequirementFromJob(job) {
    return {
      trade: job?.trade || "",
      tradeKey: job?.tradeKey || "",
      specialism: job?.specialism || "",
      roleKey: job?.roleKey || "",
      grade: job?.grade || "",
      workActivity: job?.workActivity || "",
      requiredQualifications: job?.requiredQualifications || "",
      requiredCredentialIds: Array.isArray(job?.requiredCredentialIds)
        ? [...job.requiredCredentialIds]
        : [],
      quantity: Math.max(1, Number(job?.quantity) || 1),
      budgetMin: job?.budgetMin ?? null,
      budgetMax: job?.budgetMax ?? null,
      workerReceivesFullAdvertisedRate:
        job?.workerReceivesFullAdvertisedRate !== false,
      accommodationPaid: !!job?.accommodationPaid,
      accommodationArrangement: job?.accommodationArrangement || "",
      accommodationAllowancePerNight:
        job?.accommodationAllowancePerNight ?? null,
      overtimeAvailable: !!job?.overtimeAvailable,
      overtimeRates: job?.overtimeRates || null,
      workingDays: Array.isArray(job?.workingDays) ? [...job.workingDays] : [],
      shiftStartTime: job?.shiftStartTime || "",
      shiftFinishTime: job?.shiftFinishTime || "",
    };
  }

  function ensureRequirementIds(job) {
    if (!job || typeof job !== "object") return [];
    const rawSource = Array.isArray(job.labourRequirements) && job.labourRequirements.length
      ? job.labourRequirements
      : [legacyRequirementFromJob(job)];
    const legacySignatures = new Set();
    const source = rawSource.filter((requirement) => {
      if (requirement?.requirementId || requirement?.id) return true;
      const signature = requirementSignature(requirement);
      if (legacySignatures.has(signature)) return false;
      legacySignatures.add(signature);
      return true;
    });
    const used = new Set();
    job.labourRequirements = source.map((requirement) => {
      const req = requirement && typeof requirement === "object" ? requirement : {};
      let requirementId = String(req.requirementId || req.id || "").trim();
      if (!requirementId || used.has(requirementId)) {
        const base = stableRequirementId(job, req);
        requirementId = base;
        let suffix = 2;
        while (used.has(requirementId)) requirementId = `${base}-${suffix++}`;
      }
      used.add(requirementId);
      req.requirementId = requirementId;
      // Keep the old key as a compatibility alias while requirementId becomes canonical.
      req.id = requirementId;
      req.quantity = Math.max(1, Number(req.quantity) || 1);
      return req;
    });
    return job.labourRequirements;
  }

  function normalizeSlotStatus(value) {
    const status = String(value || "").toLowerCase();
    if (["offered", "in_progress", "pending", "under-offer"].includes(status)) {
      return SLOT_STATUS.UNDER_OFFER;
    }
    if (["booked", "assigned"].includes(status)) return SLOT_STATUS.CONFIRMED;
    if (["reopened", "vacant"].includes(status)) return SLOT_STATUS.RELEASED;
    return Object.values(SLOT_STATUS).includes(status) ? status : SLOT_STATUS.OPEN;
  }

  function nextOrdinal(job, requirementId) {
    return (job.placementSlots || []).reduce(
      (max, slot) => slot.requirementId === requirementId
        ? Math.max(max, Number(slot.ordinal) || 0)
        : max,
      0,
    ) + 1;
  }

  function uniqueSlotId(job, requirementId, ordinal) {
    const used = new Set((job.placementSlots || []).map((slot) => slot.slotId));
    const base = `slot-${cleanIdPart(requirementId)}-${ordinal}`;
    let value = base;
    let suffix = 2;
    while (used.has(value)) value = `${base}-${suffix++}`;
    return value;
  }

  function addSlot(job, requirementId, now, overrides = {}) {
    if (!Array.isArray(job.placementSlots)) job.placementSlots = [];
    const ordinal = Number(overrides.ordinal) || nextOrdinal(job, requirementId);
    const slot = {
      slotId: overrides.slotId || uniqueSlotId(job, requirementId, ordinal),
      requirementId,
      ordinal,
      status: normalizeSlotStatus(overrides.status),
      workerId: overrides.workerId || "",
      applicationId: overrides.applicationId || "",
      bookingId: overrides.bookingId || "",
      createdAt: overrides.createdAt || now,
      filledAt: overrides.filledAt || "",
      startedAt: overrides.startedAt || "",
      releasedAt: overrides.releasedAt || "",
      completedAt: overrides.completedAt || "",
      pricing:
        overrides.pricing && typeof overrides.pricing === "object"
          ? { ...overrides.pricing }
          : null,
      agreedDayRate: overrides.agreedDayRate ?? null,
      companyCharge: overrides.companyCharge ?? null,
      history: Array.isArray(overrides.history) ? overrides.history : [],
    };
    job.placementSlots.push(slot);
    return slot;
  }

  function requirementForWorker(job, worker, explicitRequirementId = "") {
    const requirements = ensureRequirementIds(job);
    const explicit = requirements.find(
      (req) => req.requirementId === explicitRequirementId || req.id === explicitRequirementId,
    );
    if (explicit) return explicit;
    if (!worker) return requirements[0] || null;
    const workerTrade = String(worker.trade || "").trim().toLowerCase();
    const workerRoles = [worker.specialism, worker.grade]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean);
    const scored = requirements
      .map((req) => {
        const trade = String(req.trade || "").trim().toLowerCase();
        const roles = [req.specialism, req.grade]
          .map((value) => String(value || "").trim().toLowerCase())
          .filter(Boolean);
        let score = 0;
        if (workerTrade && trade && workerTrade === trade) score += 4;
        if (workerRoles.some((role) => roles.includes(role))) score += 6;
        const hasCapacity = (job.placementSlots || []).some(
          (slot) => slot.requirementId === req.requirementId && AVAILABLE_STATUSES.has(slot.status),
        );
        if (hasCapacity) score += 1;
        return { req, score };
      })
      .sort((a, b) => b.score - a.score);
    return scored[0]?.score ? scored[0].req : requirements[0] || null;
  }

  function syncLegacyAssignmentFields(job) {
    if (!job) return;
    const assignedSlots = (job.placementSlots || []).filter(
      (slot) => FILLED_STATUSES.has(slot.status) && slot.workerId,
    );
    const assignedWorkerIds = Array.from(
      new Set(assignedSlots.map((slot) => slot.workerId).filter(Boolean)),
    );
    job.assignedWorkerIds = assignedWorkerIds;
    job.assignedWorkerId = assignedWorkerIds[0] || "";
    job.workerId = assignedWorkerIds[0] || "";
    const primarySlot = assignedSlots[0];
    job.agreementId = primarySlot?.bookingId || "";
    job.bookingActive = assignedSlots.some((slot) => slot.status === SLOT_STATUS.ACTIVE);
    if (!job.completed) {
      job.bookingStatus = job.bookingActive
        ? "active"
        : assignedSlots.length
          ? "confirmed"
          : (job.placementSlots || []).some((slot) => slot.status === SLOT_STATUS.UNDER_OFFER)
            ? "pending"
            : "open";
    }
  }

  function selectSlot(job, requirementId, workerId = "") {
    const matching = (job.placementSlots || []).filter(
      (slot) => slot.requirementId === requirementId,
    );
    if (workerId) {
      const existing = matching.find(
        (slot) => slot.workerId === workerId && slot.status !== SLOT_STATUS.CANCELLED,
      );
      if (existing) return existing;
    }
    return matching.find((slot) => AVAILABLE_STATUSES.has(slot.status)) || null;
  }

  function ensureProject(job, context = {}) {
    if (!job || typeof job !== "object") return job;
    const now = context.now || new Date().toISOString();
    const requirements = ensureRequirementIds(job);
    const existing = Array.isArray(job.placementSlots) ? job.placementSlots : [];
    job.placementSlots = [];
    const usedIds = new Set();
    existing.forEach((raw, index) => {
      if (!raw || typeof raw !== "object") return;
      const fallbackReq = requirements[0];
      const requirementId = requirements.some((req) => req.requirementId === raw.requirementId)
        ? raw.requirementId
        : fallbackReq?.requirementId;
      if (!requirementId) return;
      let slotId = String(raw.slotId || raw.id || "").trim();
      if (!slotId || usedIds.has(slotId)) {
        slotId = `slot-${cleanIdPart(requirementId)}-${Number(raw.ordinal) || index + 1}`;
        let suffix = 2;
        while (usedIds.has(slotId)) slotId = `${slotId}-${suffix++}`;
      }
      usedIds.add(slotId);
      addSlot(job, requirementId, now, { ...raw, slotId });
    });

    requirements.forEach((req) => {
      const capacity = job.placementSlots.filter(
        (slot) => slot.requirementId === req.requirementId && slot.status !== SLOT_STATUS.CANCELLED,
      ).length;
      for (let index = capacity; index < req.quantity; index += 1) {
        addSlot(job, req.requirementId, now);
      }
    });

    const applications = (context.applications || []).filter((app) => app.jobId === job.id);
    const workers = context.workers || [];
    const agreements = (context.agreements || []).filter((agreement) => agreement.jobId === job.id);
    const legacyWorkerIds = Array.from(new Set([
      ...(Array.isArray(job.assignedWorkerIds) ? job.assignedWorkerIds : []),
      job.assignedWorkerId,
      job.workerId,
      ...applications.filter((app) => app.status === "confirmed").map((app) => app.workerId),
    ].filter(Boolean)));

    legacyWorkerIds.forEach((workerId) => {
      if (job.placementSlots.some((slot) => slot.workerId === workerId && FILLED_STATUSES.has(slot.status))) return;
      const app = applications.find((item) => item.workerId === workerId && item.status === "confirmed");
      const worker = workers.find((item) => item.id === workerId);
      const explicitRequirementId = app?.requirementId || app?.labourRequirementId || app?.matchSnapshot?.requirementId || "";
      const req = requirementForWorker(job, worker, explicitRequirementId);
      if (!req) return;
      let slot = selectSlot(job, req.requirementId, workerId);
      if (!slot) {
        slot = addSlot(job, req.requirementId, now, { status: SLOT_STATUS.CONFIRMED });
        job.placementCapacityConflict = true;
        req.quantity = Math.max(req.quantity, slot.ordinal);
        if (requirements.length === 1) job.quantity = req.quantity;
      }
      slot.status = job.completed
        ? SLOT_STATUS.COMPLETED
        : job.bookingActive
          ? SLOT_STATUS.ACTIVE
          : SLOT_STATUS.CONFIRMED;
      slot.workerId = workerId;
      slot.applicationId = app?.id || slot.applicationId || "";
      slot.filledAt = slot.filledAt || app?.confirmedAt || job.confirmedAt || now;
      slot.startedAt = slot.startedAt || (slot.status === SLOT_STATUS.ACTIVE ? job.startDate || job.start || "" : "");
      slot.completedAt = slot.completedAt || (slot.status === SLOT_STATUS.COMPLETED ? job.completedAt || now : "");
      const agreement = agreements.find(
        (item) => item.placementSlotId === slot.slotId || item.workerId === workerId,
      );
      if (agreement) {
        slot.bookingId = agreement.id;
        agreement.placementSlotId = slot.slotId;
        agreement.requirementId = req.requirementId;
        agreement.applicationId = agreement.applicationId || app?.id || "";
      }
      if (app) {
        app.requirementId = req.requirementId;
        app.labourRequirementId = req.requirementId;
        app.placementSlotId = slot.slotId;
      }
    });

    applications.filter((app) => ACTIVE_APPLICATION_STATUSES.has(app.status)).forEach((app) => {
      if (app.placementSlotId && job.placementSlots.some((slot) => slot.slotId === app.placementSlotId)) return;
      const worker = workers.find((item) => item.id === app.workerId);
      const req = requirementForWorker(
        job,
        worker,
        app.requirementId || app.labourRequirementId || app.matchSnapshot?.requirementId || "",
      );
      if (!req) return;
      const duplicateWorkerSlot = job.placementSlots.find(
        (slot) => slot.workerId === app.workerId && slot.status !== SLOT_STATUS.CANCELLED,
      );
      if (duplicateWorkerSlot) {
        app.placementConflict = "duplicate_worker";
        return;
      }
      const slot =
        selectSlot(job, req.requirementId) ||
        addSlot(job, req.requirementId, now, {
          status: SLOT_STATUS.UNDER_OFFER,
        });
      if (slot.ordinal > req.quantity) {
        job.placementCapacityConflict = true;
        req.quantity = slot.ordinal;
        if (requirements.length === 1) job.quantity = req.quantity;
      }
      slot.status = SLOT_STATUS.UNDER_OFFER;
      slot.workerId = app.workerId || "";
      slot.applicationId = app.id || "";
      app.requirementId = req.requirementId;
      app.labourRequirementId = req.requirementId;
      app.placementSlotId = slot.slotId;
    });

    syncLegacyAssignmentFields(job);
    return job;
  }

  function projectSlots(job) {
    return Array.isArray(job?.placementSlots) ? job.placementSlots : [];
  }

  function assignedWorkerIds(job) {
    const fromSlots = projectSlots(job)
      .filter((slot) => FILLED_STATUSES.has(slot.status) && slot.workerId)
      .map((slot) => slot.workerId);
    if (fromSlots.length) return Array.from(new Set(fromSlots));
    return Array.from(new Set([
      ...(Array.isArray(job?.assignedWorkerIds) ? job.assignedWorkerIds : []),
      job?.assignedWorkerId,
      job?.workerId,
    ].filter(Boolean)));
  }

  function hasOpenSlot(job, requirementId = "") {
    return projectSlots(job).some(
      (slot) => (!requirementId || slot.requirementId === requirementId) && AVAILABLE_STATUSES.has(slot.status),
    );
  }

  function slotForWorker(job, workerId) {
    return projectSlots(job).find(
      (slot) => slot.workerId === workerId && slot.status !== SLOT_STATUS.CANCELLED,
    ) || null;
  }

  function projectDatesOverlap(left, right) {
    const leftStart = Date.parse(String(left?.startDate || left?.start || "").slice(0, 10));
    const rightStart = Date.parse(String(right?.startDate || right?.start || "").slice(0, 10));
    if (!Number.isFinite(leftStart) || !Number.isFinite(rightStart)) return false;
    const leftEndValue = left?.estimatedEndDate || left?.endDate || "";
    const rightEndValue = right?.estimatedEndDate || right?.endDate || "";
    const leftEndParsed = Date.parse(String(leftEndValue).slice(0, 10));
    const rightEndParsed = Date.parse(String(rightEndValue).slice(0, 10));
    const leftEnd = Number.isFinite(leftEndParsed)
      ? leftEndParsed
      : left?.noFixedEndDate || left?.ongoing
        ? Number.POSITIVE_INFINITY
        : leftStart;
    const rightEnd = Number.isFinite(rightEndParsed)
      ? rightEndParsed
      : right?.noFixedEndDate || right?.ongoing
        ? Number.POSITIVE_INFINITY
        : rightStart;
    return leftStart <= rightEnd && rightStart <= leftEnd;
  }

  function linkLegacyHistory(job, context = {}) {
    if (!job) return job;
    ensureProject(job, context);
    const workers = context.workers || [];
    const applications = context.applications || [];
    const records = [
      ...(context.releases || [])
        .filter((record) => record.jobId === job.id)
        .map((record) => ({
          record,
          source: "release",
          status: record.releaseType || record.releaseStatus || "released",
          endedAt:
            record.releasedAt || record.releaseGivenAt || record.createdAt || "",
          reason: record.reason || "",
        })),
      ...(context.cancellations || [])
        .filter((record) => record.jobId === job.id)
        .map((record) => ({
          record,
          source: "cancellation",
          status: "booking_cancelled",
          endedAt: record.cancelledAt || record.createdAt || "",
          reason: record.cancellationReason || "",
        })),
    ];

    records.forEach(({ record, source, status, endedAt, reason }) => {
      const worker = workers.find((item) => item.id === record.workerId);
      const requirement = requirementForWorker(
        job,
        worker,
        record.requirementId || record.labourRequirementId || "",
      );
      let slot = projectSlots(job).find((item) => item.slotId === record.placementSlotId);
      if (!slot) {
        slot = projectSlots(job).find(
          (item) =>
            item.workerId === record.workerId ||
            item.history.some((entry) => entry.workerId === record.workerId),
        );
      }
      if (!slot && requirement) {
        const available = projectSlots(job).filter(
          (item) =>
            item.requirementId === requirement.requirementId &&
            AVAILABLE_STATUSES.has(item.status),
        );
        slot = available.find((item) => item.history.length === 0) || available[0];
      }
      if (!slot || !requirement) return;
      const historyId = `${source}:${record.id || `${record.workerId || "worker"}:${endedAt}`}`;
      if (!slot.history.some((entry) => entry.historyId === historyId)) {
        slot.history.push({
          historyId,
          workerId: record.workerId || "",
          applicationId: record.applicationId || "",
          bookingId: record.bookingId || "",
          status,
          reason,
          endedAt,
        });
      }
      record.requirementId = record.requirementId || requirement.requirementId;
      record.placementSlotId = record.placementSlotId || slot.slotId;
      const finalized =
        source === "cancellation" ||
        !!record.immediateRelease ||
        !!record.releasedAt ||
        ["immediate", "completed"].includes(record.releaseStatus);
      if (finalized && slot.workerId === record.workerId) {
        const application = applications.find(
          (item) =>
            item.id === slot.applicationId ||
            (item.jobId === job.id &&
              item.workerId === record.workerId &&
              item.status === "confirmed"),
        );
        if (application) {
          application.status =
            source === "cancellation" ? "cancelled_by_company" : "released";
          application.endedAt = endedAt;
        }
        slot.status = SLOT_STATUS.RELEASED;
        slot.workerId = "";
        slot.applicationId = "";
        slot.bookingId = "";
        slot.releasedAt = slot.releasedAt || endedAt;
      }
      if (!slot.workerId && slot.status === SLOT_STATUS.OPEN) {
        slot.status = SLOT_STATUS.RELEASED;
        slot.releasedAt = slot.releasedAt || endedAt;
      }
    });

    (context.replacementTasks || [])
      .filter((task) => task.jobId === job.id)
      .forEach((task) => {
        const release = (context.releases || []).find(
          (record) => record.id === task.linkedReleaseId,
        );
        const slot = projectSlots(job).find(
          (item) =>
            item.slotId === task.placementSlotId ||
            item.slotId === release?.placementSlotId,
        );
        if (!slot) return;
        task.placementSlotId = task.placementSlotId || slot.slotId;
        task.requirementId = task.requirementId || slot.requirementId;
      });
    syncLegacyAssignmentFields(job);
    return job;
  }

  function workerHasOverlappingPlacement(jobs, job, workerId, ignoredSlotId = "") {
    return (jobs || []).some((candidate) => {
      if (!candidate || candidate.completed || !projectDatesOverlap(candidate, job)) return false;
      return projectSlots(candidate).some(
        (slot) => slot.slotId !== ignoredSlotId && slot.workerId === workerId && FILLED_STATUSES.has(slot.status),
      );
    });
  }

  function reserveSlot(job, worker, application, jobs = [], now = new Date().toISOString()) {
    const linkedSlotId = application?.placementSlotId || "";
    if (workerHasOverlappingPlacement(jobs, job, worker?.id || "", linkedSlotId)) {
      return { ok: false, reason: "Worker already has an overlapping assignment" };
    }
    ensureProject(job, { applications: application ? [application] : [], workers: worker ? [worker] : [], now });
    const existing = application?.placementSlotId
      ? projectSlots(job).find((slot) => slot.slotId === application.placementSlotId)
      : null;
    if (existing && existing.workerId === worker?.id && existing.status === SLOT_STATUS.UNDER_OFFER) {
      return { ok: true, slot: existing, duplicate: true };
    }
    const req = requirementForWorker(
      job,
      worker,
      existing?.requirementId || application?.requirementId || application?.labourRequirementId || application?.matchSnapshot?.requirementId || "",
    );
    const slot = existing && AVAILABLE_STATUSES.has(existing.status)
      ? existing
      : req
        ? selectSlot(job, req.requirementId)
        : null;
    if (!slot) return { ok: false, reason: "No open placement is available for this labour requirement" };
    slot.status = SLOT_STATUS.UNDER_OFFER;
    slot.workerId = worker?.id || application?.workerId || "";
    slot.applicationId = application?.id || "";
    if (application) {
      application.requirementId = req.requirementId;
      application.labourRequirementId = req.requirementId;
      application.placementSlotId = slot.slotId;
      application.matchSnapshot = {
        ...(application.matchSnapshot || {}),
        requirementId: req.requirementId,
        placementSlotId: slot.slotId,
      };
    }
    syncLegacyAssignmentFields(job);
    return { ok: true, slot, requirement: req };
  }

  function confirmSlot(job, worker, application, jobs = [], now = new Date().toISOString()) {
    const reserved = reserveSlot(job, worker, application, jobs, now);
    if (!reserved.ok) return reserved;
    const slot = reserved.slot;
    slot.status = SLOT_STATUS.CONFIRMED;
    slot.workerId = worker.id;
    slot.applicationId = application?.id || slot.applicationId || "";
    slot.filledAt = slot.filledAt || now;
    syncLegacyAssignmentFields(job);
    return { ...reserved, slot };
  }

  function reopenApplicationSlot(job, application, outcome = "released", now = new Date().toISOString()) {
    if (!job || !application) return null;
    const slot = projectSlots(job).find(
      (item) => item.slotId === application.placementSlotId || item.applicationId === application.id,
    );
    if (!slot || FILLED_STATUSES.has(slot.status)) return null;
    slot.history.push({
      workerId: slot.workerId || application.workerId || "",
      applicationId: slot.applicationId || application.id || "",
      bookingId: slot.bookingId || "",
      status: outcome,
      endedAt: now,
    });
    slot.status = SLOT_STATUS.RELEASED;
    slot.workerId = "";
    slot.applicationId = "";
    slot.bookingId = "";
    slot.releasedAt = now;
    syncLegacyAssignmentFields(job);
    return slot;
  }

  function releaseWorker(job, workerId, details = {}, now = new Date().toISOString()) {
    const slot = slotForWorker(job, workerId);
    if (!slot) return { ok: false, reason: "Assigned placement not found" };
    slot.history.push({
      workerId: slot.workerId,
      applicationId: slot.applicationId,
      bookingId: slot.bookingId,
      status: details.status || "released",
      reason: details.reason || "",
      startedAt: slot.startedAt || "",
      filledAt: slot.filledAt || "",
      endedAt: now,
    });
    slot.status = SLOT_STATUS.RELEASED;
    slot.workerId = "";
    slot.applicationId = "";
    slot.bookingId = "";
    slot.releasedAt = now;
    syncLegacyAssignmentFields(job);
    return { ok: true, slot };
  }

  function counts(job, requirementId = "") {
    const slots = projectSlots(job).filter(
      (slot) => (!requirementId || slot.requirementId === requirementId) && slot.status !== SLOT_STATUS.CANCELLED,
    );
    return {
      required: slots.length,
      filled: slots.filter((slot) => FILLED_STATUSES.has(slot.status)).length,
      open: slots.filter((slot) => AVAILABLE_STATUSES.has(slot.status)).length,
      underOffer: slots.filter((slot) => slot.status === SLOT_STATUS.UNDER_OFFER).length,
      committed: slots.filter((slot) => COMMITTED_STATUSES.has(slot.status)).length,
    };
  }

  function adjustRequirementQuantity(job, requirementId, nextQuantity, now = new Date().toISOString()) {
    ensureProject(job, { now });
    const req = ensureRequirementIds(job).find((item) => item.requirementId === requirementId);
    if (!req) return { ok: false, reason: "Labour requirement not found" };
    const fromQuantity = Math.max(1, Number(req.quantity) || 1);
    const toQuantity = Math.max(1, Number(nextQuantity) || fromQuantity);
    if (toQuantity === fromQuantity) return { ok: false, reason: "Quantity is unchanged" };
    if (toQuantity > fromQuantity) {
      req.quantity = toQuantity;
      for (let index = fromQuantity; index < toQuantity; index += 1) addSlot(job, requirementId, now);
      if (job.labourRequirements.length === 1) job.quantity = toQuantity;
      return { ok: true, fromQuantity, toQuantity, added: toQuantity - fromQuantity };
    }
    const retireCount = fromQuantity - toQuantity;
    const retireable = projectSlots(job)
      .filter(
        (slot) =>
          slot.requirementId === requirementId &&
          AVAILABLE_STATUSES.has(slot.status) &&
          slot.history.length === 0,
      )
      .sort((a, b) => Number(b.ordinal) - Number(a.ordinal));
    if (retireable.length < retireCount) {
      return {
        ok: false,
        reason: `Quantity cannot be reduced below ${fromQuantity - retireable.length} committed or historical placements`,
        committed: fromQuantity - retireable.length,
      };
    }
    retireable.slice(0, retireCount).forEach((slot) => {
      slot.status = SLOT_STATUS.CANCELLED;
      slot.releasedAt = now;
      slot.history.push({ status: "quantity_reduced", endedAt: now });
    });
    req.quantity = toQuantity;
    if (job.labourRequirements.length === 1) job.quantity = toQuantity;
    syncLegacyAssignmentFields(job);
    return { ok: true, fromQuantity, toQuantity, retired: retireCount };
  }

  const api = {
    SLOT_STATUS,
    AVAILABLE_STATUSES,
    FILLED_STATUSES,
    COMMITTED_STATUSES,
    ensureRequirementIds,
    ensureProject,
    requirementForWorker,
    assignedWorkerIds,
    hasOpenSlot,
    slotForWorker,
    reserveSlot,
    confirmSlot,
    reopenApplicationSlot,
    releaseWorker,
    counts,
    adjustRequirementQuantity,
    linkLegacyHistory,
    syncLegacyAssignmentFields,
    workerHasOverlappingPlacement,
  };

  globalScope.OnSitePlacementSlots = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
