(function initLabourCapacity(globalScope) {
  "use strict";

  const DAY_MS = 86400000;
  const DEFAULT_WORKING_DAYS = Object.freeze([
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
  ]);
  const DAY_NAMES = Object.freeze([
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ]);
  const CAPACITY_STATES = Object.freeze({
    AVAILABLE_NOW: "available_now",
    AVAILABLE_BY_START: "available_by_start",
    FUTURE_UNCOMMITTED: "future_uncommitted",
    COMMITTED_OVERLAP: "committed_overlap",
    ABSENCE_CONFLICT: "absence_conflict",
    AVAILABILITY_UNKNOWN: "availability_unknown",
    NO_FIXED_END_CONFLICT: "no_fixed_end_conflict",
  });
  const COMMITTED_SLOT_STATUSES = new Set([
    "confirmed",
    "active",
    "booked",
    "assigned",
  ]);

  function dateOnlyMs(value) {
    const date = String(value || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const [year, month, day] = date.split("-").map(Number);
    const timestamp = Date.UTC(year, month - 1, day);
    const parsed = new Date(timestamp);
    return parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
      ? timestamp
      : null;
  }

  function dateOnlyString(value) {
    const timestamp = typeof value === "number" ? value : dateOnlyMs(value);
    return Number.isFinite(timestamp)
      ? new Date(timestamp).toISOString().slice(0, 10)
      : "";
  }

  function normalizeWorkingDays(days) {
    const normalized = (Array.isArray(days) ? days : DEFAULT_WORKING_DAYS)
      .map((day) => String(day || "").trim().toLowerCase())
      .filter((day) => DAY_NAMES.includes(day));
    return normalized.length
      ? Array.from(new Set(normalized))
      : [...DEFAULT_WORKING_DAYS];
  }

  function normalizeRange(startDate, endDate, options = {}) {
    const startMs = dateOnlyMs(startDate);
    if (startMs === null) return null;
    const noFixedEndDate = !!options.noFixedEndDate;
    const parsedEnd = dateOnlyMs(endDate);
    const endMs = noFixedEndDate
      ? Number.POSITIVE_INFINITY
      : parsedEnd === null
        ? startMs
        : Math.max(startMs, parsedEnd);
    return {
      startDate: dateOnlyString(startMs),
      endDate: Number.isFinite(endMs) ? dateOnlyString(endMs) : "",
      startMs,
      endMs,
      noFixedEndDate,
      workingDays: normalizeWorkingDays(options.workingDays),
    };
  }

  function rangesOverlap(left, right) {
    return !!left && !!right && left.startMs <= right.endMs && right.startMs <= left.endMs;
  }

  function hasSharedWorkingDate(left, right) {
    if (!rangesOverlap(left, right)) return false;
    const sharedDays = new Set(
      left.workingDays.filter((day) => right.workingDays.includes(day)),
    );
    if (!sharedDays.size) return false;
    const start = Math.max(left.startMs, right.startMs);
    const end = Math.min(left.endMs, right.endMs, start + DAY_MS * 13);
    for (let cursor = start; cursor <= end; cursor += DAY_MS) {
      if (sharedDays.has(DAY_NAMES[new Date(cursor).getUTCDay()])) return true;
    }
    return false;
  }

  function workerIdsForProject(project) {
    return Array.from(
      new Set(
        [
          ...(Array.isArray(project?.assignedWorkerIds)
            ? project.assignedWorkerIds
            : []),
          project?.assignedWorkerId,
          project?.workerId,
        ]
          .filter(Boolean)
          .map(String),
      ),
    );
  }

  function actionTimestamp(record) {
    return new Date(
      record?.releasedAt ||
        record?.cancelledAt ||
        record?.releaseGivenAt ||
        record?.createdAt ||
        0,
    ).getTime();
  }

  function latestRelevantRecord(records, commitmentStartedAt) {
    const startedAt = new Date(commitmentStartedAt || 0).getTime();
    return [...records]
      .filter((record) => !startedAt || !actionTimestamp(record) || actionTimestamp(record) >= startedAt)
      .sort((left, right) => actionTimestamp(right) - actionTimestamp(left))[0] || null;
  }

  function releaseBoundary(project, workerId, slot, context) {
    const release = latestRelevantRecord(
      (context.releases || []).filter(
        (record) =>
          String(record?.jobId || "") === String(project.id) &&
          String(record?.workerId || "") === workerId &&
          record?.releaseStatus !== "cancelled" &&
          (!record.placementSlotId || !slot?.slotId || record.placementSlotId === slot.slotId),
      ),
      slot?.filledAt || project.confirmedAt,
    );
    const cancellation = latestRelevantRecord(
      (context.cancellations || []).filter(
        (record) =>
          String(record?.jobId || "") === String(project.id) &&
          String(record?.workerId || "") === workerId &&
          (!record.placementSlotId || !slot?.slotId || record.placementSlotId === slot.slotId),
      ),
      slot?.filledAt || project.confirmedAt,
    );
    const releaseDate = dateOnlyMs(
      release?.releasedAt ||
        release?.effectiveDate ||
        (release?.immediateRelease ? release?.releaseGivenAt : "") ||
        (!slot && project.releaseEffectiveDate ? project.releaseEffectiveDate : ""),
    );
    const cancellationDate = dateOnlyMs(cancellation?.cancelledAt || cancellation?.createdAt);
    const boundaries = [releaseDate, cancellationDate].filter(Number.isFinite);
    if (!boundaries.length) return null;
    const boundaryMs = Math.min(...boundaries);
    return {
      date: dateOnlyString(boundaryMs),
      timestamp: boundaryMs,
      source: boundaryMs === cancellationDate ? "cancellation" : "release",
    };
  }

  function projectCommitmentsForWorker(worker, context = {}) {
    const workerId = String(worker?.id || context.workerId || "");
    if (!workerId) return [];
    const ignoredProjects = new Set([
      ...(context.ignoreProjectIds || []).map(String),
    ].filter(Boolean));
    const applications = context.applications || [];
    const commitments = [];

    (context.projects || context.jobs || []).forEach((project) => {
      if (!project?.id || ignoredProjects.has(String(project.id)) || project.completed) return;
      if (["cancelled", "completed"].includes(String(project.bookingStatus || "").toLowerCase())) {
        return;
      }
      const slots = (Array.isArray(project.placementSlots) ? project.placementSlots : [])
        .filter(
          (slot) =>
            String(slot?.workerId || "") === workerId &&
            (!context.ignoreSlotId || slot.slotId !== context.ignoreSlotId) &&
            (!context.ignoreApplicationId ||
              slot.applicationId !== context.ignoreApplicationId) &&
            COMMITTED_SLOT_STATUSES.has(String(slot.status || "").toLowerCase()),
        );
      const confirmedApplication = applications.find(
        (application) =>
          String(application?.jobId || "") === String(project.id) &&
          String(application?.workerId || "") === workerId &&
          (!context.ignoreApplicationId ||
            application.id !== context.ignoreApplicationId) &&
          application?.status === "confirmed",
      );
      const fallbackAssigned = workerIdsForProject(project).includes(workerId);
      const sources = slots.length
        ? slots
        : confirmedApplication || fallbackAssigned
          ? [null]
          : [];

      sources.forEach((slot) => {
        const startDate = project.startDate || project.start || "";
        const startMs = dateOnlyMs(startDate);
        const explicitEndDate = project.estimatedEndDate || project.endDate || project.end || "";
        const explicitEndMs = dateOnlyMs(explicitEndDate);
        const noFixedEndDate = !!(project.noFixedEndDate || project.ongoing);
        const unknownStart = startMs === null;
        let unknownEnd = explicitEndMs === null && !noFixedEndDate;
        let endMs = explicitEndMs;
        if (noFixedEndDate || unknownEnd) endMs = Number.POSITIVE_INFINITY;
        if (startMs !== null && Number.isFinite(endMs)) endMs = Math.max(startMs, endMs);
        const boundary = releaseBoundary(project, workerId, slot, context);
        if (boundary) {
          endMs = boundary.timestamp - DAY_MS;
          unknownEnd = false;
        }
        if (startMs !== null && endMs < startMs) return;
        commitments.push({
          projectId: String(project.id),
          slotId: String(slot?.slotId || confirmedApplication?.placementSlotId || ""),
          applicationId: String(slot?.applicationId || confirmedApplication?.id || ""),
          status: String(slot?.status || project.bookingStatus || "confirmed"),
          startDate: dateOnlyString(startMs),
          endDate: Number.isFinite(endMs) ? dateOnlyString(endMs) : "",
          startMs,
          endMs,
          noFixedEndDate: noFixedEndDate && !boundary,
          unknownStart,
          unknownEnd,
          releaseEffectiveDate: boundary?.date || "",
          workingDays: normalizeWorkingDays(project.workingDays),
        });
      });
    });
    return commitments;
  }

  function countWorkingDays(startMs, endMs, workingDays) {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return 0;
    const selected = new Set(workingDays);
    const totalDays = Math.floor((endMs - startMs) / DAY_MS) + 1;
    const fullWeeks = Math.floor(totalDays / 7);
    let count = fullWeeks * selected.size;
    const remaining = totalDays % 7;
    for (let index = 0; index < remaining; index += 1) {
      const cursor = startMs + (fullWeeks * 7 + index) * DAY_MS;
      if (selected.has(DAY_NAMES[new Date(cursor).getUTCDay()])) count += 1;
    }
    return count;
  }

  function firstWorkingDate(range) {
    for (let index = 0; index < 7; index += 1) {
      const cursor = range.startMs + index * DAY_MS;
      if (cursor > range.endMs) break;
      if (range.workingDays.includes(DAY_NAMES[new Date(cursor).getUTCDay()])) return cursor;
    }
    return range.startMs;
  }

  function plannedAbsenceResult(worker, requestedRange) {
    const totalRequestedDays = Number.isFinite(requestedRange.endMs)
      ? countWorkingDays(
          requestedRange.startMs,
          requestedRange.endMs,
          requestedRange.workingDays,
        )
      : Number.POSITIVE_INFINITY;
    const firstRequestedDay = firstWorkingDate(requestedRange);
    const conflicts = [];

    (Array.isArray(worker?.plannedAbsences) ? worker.plannedAbsences : []).forEach(
      (absence) => {
        const startMs = dateOnlyMs(absence?.startDate || absence?.date);
        const rawEnd = dateOnlyMs(absence?.endDate || absence?.startDate || absence?.date);
        if (startMs === null || rawEnd === null) return;
        const endMs = Math.max(startMs, rawEnd);
        const overlapStart = Math.max(startMs, requestedRange.startMs);
        const overlapEnd = Math.min(endMs, requestedRange.endMs);
        if (overlapEnd < overlapStart) return;
        const conflictDays = countWorkingDays(
          overlapStart,
          overlapEnd,
          requestedRange.workingDays,
        );
        if (!conflictDays) return;
        const startsDuringAbsence = startMs <= firstRequestedDay && endMs >= firstRequestedDay;
        const hardConflict =
          startsDuringAbsence ||
          (Number.isFinite(totalRequestedDays) &&
            totalRequestedDays > 0 &&
            conflictDays >= Math.ceil(totalRequestedDays / 2));
        conflicts.push({
          absenceId: String(absence?.id || ""),
          startDate: dateOnlyString(startMs),
          endDate: dateOnlyString(endMs),
          conflictDays,
          hardConflict,
        });
      },
    );
    const conflictDays = conflicts.reduce((sum, conflict) => sum + conflict.conflictDays, 0);
    return {
      conflicts,
      conflictDays,
      hardConflict: conflicts.some((conflict) => conflict.hardConflict),
      penalty: conflicts.length ? Math.min(25, 10 + conflictDays * 5) : 0,
    };
  }

  function capacityResult(state, requestedRange, details = {}) {
    const eligible = [
      CAPACITY_STATES.AVAILABLE_NOW,
      CAPACITY_STATES.AVAILABLE_BY_START,
      CAPACITY_STATES.FUTURE_UNCOMMITTED,
    ].includes(state);
    return {
      state,
      eligible,
      availableForRange: eligible,
      requestedRange: requestedRange
        ? {
            startDate: requestedRange.startDate,
            endDate: requestedRange.endDate,
            noFixedEndDate: requestedRange.noFixedEndDate,
            workingDays: [...requestedRange.workingDays],
          }
        : null,
      ...details,
    };
  }

  function workerCapacityForRange(worker, startDate, endDate, context = {}) {
    const requestedRange = normalizeRange(startDate, endDate, {
      noFixedEndDate: context.requestedNoFixedEndDate,
      workingDays: context.requestedWorkingDays,
    });
    if (!worker?.id || !requestedRange) {
      return capacityResult(CAPACITY_STATES.AVAILABILITY_UNKNOWN, requestedRange, {
        label: "Availability unknown",
        reason: !worker?.id
          ? "Worker identity is unavailable."
          : "Requested project dates are incomplete.",
        commitments: [],
        absenceConflicts: [],
        absencePenalty: 0,
      });
    }

    const commitments = projectCommitmentsForWorker(worker, context);
    const overlapping = [];
    const uncertain = [];
    const preceding = [];
    commitments.forEach((commitment) => {
      if (commitment.unknownStart) {
        uncertain.push(commitment);
        return;
      }
      if (commitment.endMs < requestedRange.startMs) {
        preceding.push(commitment);
        return;
      }
      if (commitment.startMs > requestedRange.endMs) return;
      if (!hasSharedWorkingDate(requestedRange, commitment)) return;
      if (commitment.unknownEnd) uncertain.push(commitment);
      else overlapping.push(commitment);
    });

    const noFixedConflict = overlapping.find((commitment) => commitment.noFixedEndDate);
    if (noFixedConflict) {
      return capacityResult(CAPACITY_STATES.NO_FIXED_END_CONFLICT, requestedRange, {
        label: "Committed to an open-ended assignment",
        reason: "Worker has a confirmed assignment with no reliable end or release date.",
        commitments,
        conflicts: overlapping,
        absenceConflicts: [],
        absencePenalty: 0,
      });
    }
    if (overlapping.length) {
      return capacityResult(CAPACITY_STATES.COMMITTED_OVERLAP, requestedRange, {
        label: "Committed during requested dates",
        reason: "Worker already has a confirmed assignment during the requested dates.",
        commitments,
        conflicts: overlapping,
        absenceConflicts: [],
        absencePenalty: 0,
      });
    }
    if (uncertain.length) {
      return capacityResult(CAPACITY_STATES.AVAILABILITY_UNKNOWN, requestedRange, {
        label: "Availability uncertain",
        reason: "A confirmed assignment does not have reliable dates.",
        commitments,
        conflicts: uncertain,
        absenceConflicts: [],
        absencePenalty: 0,
      });
    }

    const absence = context.skipPlannedAbsences
      ? { conflicts: [], conflictDays: 0, hardConflict: false, penalty: 0 }
      : plannedAbsenceResult(worker, requestedRange);
    if (absence.hardConflict) {
      return capacityResult(CAPACITY_STATES.ABSENCE_CONFLICT, requestedRange, {
        label: "Planned absence conflict",
        reason: "Planned absence conflicts with the requested assignment dates.",
        commitments,
        conflicts: absence.conflicts,
        absenceConflicts: absence.conflicts,
        absencePenalty: absence.penalty,
      });
    }

    const todayMs = dateOnlyMs(context.today || new Date().toISOString()) ?? requestedRange.startMs;
    const relevantPreceding = preceding.filter(
      (commitment) => Number.isFinite(commitment.endMs) && commitment.endMs >= todayMs,
    );
    const precedingAvailableMs = relevantPreceding.length
      ? Math.max(...relevantPreceding.map((commitment) => commitment.endMs + DAY_MS))
      : null;
    const nextAvailableMs = dateOnlyMs(worker.nextAvailableDate);
    if (!context.skipWorkerAvailability) {
      const availability = String(worker.availability || "").trim().toLowerCase();
      if (nextAvailableMs !== null && nextAvailableMs > requestedRange.startMs) {
        return capacityResult(CAPACITY_STATES.AVAILABILITY_UNKNOWN, requestedRange, {
          label: `Unavailable until ${dateOnlyString(nextAvailableMs)}`,
          reason: "Worker's next available date is after the requested start date.",
          expectedAvailableDate: dateOnlyString(nextAvailableMs),
          commitments,
          conflicts: [],
          absenceConflicts: absence.conflicts,
          absencePenalty: absence.penalty,
        });
      }
      if (
        availability !== "available" &&
        nextAvailableMs === null &&
        precedingAvailableMs === null
      ) {
        return capacityResult(CAPACITY_STATES.AVAILABILITY_UNKNOWN, requestedRange, {
          label: "Availability not confirmed",
          reason: "Worker has not confirmed when they will next be available.",
          commitments,
          conflicts: [],
          absenceConflicts: absence.conflicts,
          absencePenalty: absence.penalty,
        });
      }
    }

    const expectedAvailableMs = Math.max(
      nextAvailableMs || 0,
      precedingAvailableMs || 0,
    );
    if (expectedAvailableMs && expectedAvailableMs <= requestedRange.startMs) {
      return capacityResult(CAPACITY_STATES.AVAILABLE_BY_START, requestedRange, {
        label: `Available by ${dateOnlyString(expectedAvailableMs)}`,
        reason: "Existing commitments and availability end before the requested start date.",
        expectedAvailableDate: dateOnlyString(expectedAvailableMs),
        commitments,
        conflicts: [],
        absenceConflicts: absence.conflicts,
        absencePenalty: absence.penalty,
      });
    }
    const state = requestedRange.startMs > todayMs
      ? CAPACITY_STATES.FUTURE_UNCOMMITTED
      : CAPACITY_STATES.AVAILABLE_NOW;
    return capacityResult(state, requestedRange, {
      label:
        state === CAPACITY_STATES.AVAILABLE_NOW
          ? "Available now"
          : "Available for requested dates",
      reason:
        state === CAPACITY_STATES.AVAILABLE_NOW
          ? "No confirmed commitment conflicts with the requested dates."
          : "Future capacity is not committed during the requested dates.",
      commitments,
      conflicts: [],
      absenceConflicts: absence.conflicts,
      absencePenalty: absence.penalty,
    });
  }

  function workerCapacityForProject(worker, project, context = {}) {
    return workerCapacityForRange(
      worker,
      project?.startDate || project?.start || "",
      project?.estimatedEndDate || project?.endDate || project?.end || "",
      {
        ...context,
        requestedProjectId: context.requestedProjectId || project?.id || "",
        requestedNoFixedEndDate: !!(project?.noFixedEndDate || project?.ongoing),
        requestedWorkingDays: project?.workingDays,
      },
    );
  }

  const api = {
    CAPACITY_STATES,
    dateOnlyMs,
    dateOnlyString,
    normalizeRange,
    rangesOverlap,
    hasSharedWorkingDate,
    projectCommitmentsForWorker,
    workerCapacityForRange,
    workerCapacityForProject,
  };

  globalScope.OnSiteLabourCapacity = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
