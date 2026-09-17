"use strict";

const ATTENDANCE_STATUSES = Object.freeze([
  "needs_review",
  "on_time",
  "late",
  "no_show",
  "approved_absence",
  "non_worker_fault",
  "sent_home",
]);

const RESOLVED_ATTENDANCE_STATUSES = Object.freeze(
  ATTENDANCE_STATUSES.filter((status) => status !== "needs_review"),
);

const CAPTURE_METHODS = Object.freeze([
  "expected_day",
  "worker_site_qr",
  "supervisor_worker_qr",
  "attendance_manager_manual",
  "administrator_override",
]);

// This preserves the grace period already used by the existing attendance UI.
const ATTENDANCE_GRACE_MINUTES = 10;

// The existing product does not define a numeric monthly allowance or a
// separate strike cap. Keep that policy unresolved rather than scoring it here.
const LATE_EXCEPTION_POLICY = Object.freeze({
  ordinaryMonthlyAllowance: null,
  strikeDisruptionOutsideAllowance: null,
  status: "product_policy_required",
});

const LATE_REASON_CATEGORIES = Object.freeze([
  "Public transport disruption",
  "Road traffic",
  "Vehicle breakdown",
  "Family emergency",
  "Medical appointment",
  "Strike disruption",
  "Other",
]);

const LATE_REASON_REVIEW_OUTCOMES = Object.freeze([
  "pending",
  "approved_exception",
  "rejected",
  "not_required",
]);

const NON_WORKER_FAULT_REASONS = Object.freeze([
  "site_not_ready",
  "project_delayed",
  "company_stand_down",
  "site_access_issue",
  "qr_or_technical_issue",
  "approved_absence",
  "other_company_issue",
]);

function cleanDate(value) {
  const text = String(value || "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function cleanTime(value) {
  const text = String(value || "").trim().slice(0, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : "";
}

function normalizeWorkingDays(value) {
  const allowed = new Set([
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ]);
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((day) => String(day || "").trim().toLowerCase())
        .filter((day) => allowed.has(day)),
    ),
  );
}

function weekdayForDate(workDate) {
  const date = cleanDate(workDate);
  if (!date) return "";
  return [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ][new Date(`${date}T12:00:00.000Z`).getUTCDay()];
}

function placementTermsOnDate(placement = {}, workDate) {
  const date = cleanDate(workDate);
  const terms = {
    workingDays: normalizeWorkingDays(
      placement.agreed_working_days ||
        placement.agreedWorkingDays ||
        placement.current_working_days ||
        placement.currentWorkingDays,
    ),
    shiftStartTime: cleanTime(
      placement.agreed_shift_start_time ||
        placement.agreedShiftStartTime ||
        placement.current_shift_start_time ||
        placement.currentShiftStartTime,
    ),
    shiftFinishTime: cleanTime(
      placement.agreed_shift_finish_time ||
        placement.agreedShiftFinishTime ||
        placement.current_shift_finish_time ||
        placement.currentShiftFinishTime,
    ),
  };
  if (!date) return terms;

  const changes = Array.isArray(placement.placement_change_offers)
    ? placement.placement_change_offers
    : Array.isArray(placement.changeOffers)
      ? placement.changeOffers
      : [];
  changes
    .filter((change) => {
      const effectiveDate = cleanDate(
        change.effective_date || change.effectiveDate,
      );
      return (
        String(change.status || "") === "accepted" &&
        String(change.change_type || change.changeType || "") ===
          "schedule_change" &&
        effectiveDate &&
        effectiveDate <= date
      );
    })
    .sort((left, right) => {
      const leftDate = cleanDate(left.effective_date || left.effectiveDate);
      const rightDate = cleanDate(right.effective_date || right.effectiveDate);
      return (
        leftDate.localeCompare(rightDate) ||
        String(left.created_at || left.createdAt || "").localeCompare(
          String(right.created_at || right.createdAt || ""),
        )
      );
    })
    .forEach((change) => {
      const proposed = change.proposed_terms || change.proposedTerms || {};
      if (Array.isArray(proposed.working_days || proposed.workingDays)) {
        terms.workingDays = normalizeWorkingDays(
          proposed.working_days || proposed.workingDays,
        );
      }
      terms.shiftStartTime =
        cleanTime(proposed.shift_start_time || proposed.shiftStartTime) ||
        terms.shiftStartTime;
      terms.shiftFinishTime =
        cleanTime(proposed.shift_finish_time || proposed.shiftFinishTime) ||
        terms.shiftFinishTime;
    });
  return terms;
}

function projectTimeParts(value, timeZone = "Europe/London") {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  } catch (_) {
    return null;
  }
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    seconds: Number(parts.second) || 0,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function placementExpectedOnDate(placement = {}, workDate) {
  const date = cleanDate(workDate);
  if (!date) return false;
  if (!["upcoming", "active"].includes(String(placement.status || ""))) {
    return false;
  }
  const startDate = cleanDate(
    placement.current_start_date || placement.currentStartDate,
  );
  const fixedEndDate = cleanDate(
    placement.current_estimated_end_date || placement.currentEstimatedEndDate,
  );
  const scheduledEndDate = cleanDate(
    placement.scheduled_end_date || placement.scheduledEndDate,
  );
  const noFixedEnd = !!(
    placement.current_no_fixed_end_date ?? placement.currentNoFixedEndDate
  );
  if (!startDate || date < startDate) return false;
  if (scheduledEndDate && date > scheduledEndDate) return false;
  if (!noFixedEnd && fixedEndDate && date > fixedEndDate) return false;
  return placementTermsOnDate(placement, date).workingDays.includes(
    weekdayForDate(date),
  );
}

function arrivalStatus({
  arrivalAt,
  workDate,
  shiftStartTime,
  timeZone = "Europe/London",
  graceMinutes = ATTENDANCE_GRACE_MINUTES,
} = {}) {
  const local = projectTimeParts(arrivalAt, timeZone);
  const date = cleanDate(workDate);
  const start = cleanTime(shiftStartTime);
  if (!local || !date || !start || local.date !== date) return null;
  const [hours, minutes] = start.split(":").map(Number);
  const shiftMinutes = hours * 60 + minutes;
  const minutesLate = Math.max(0, local.minutes - shiftMinutes);
  return {
    status: minutesLate <= graceMinutes ? "on_time" : "late",
    minutesLate,
    localDate: local.date,
    localTime: local.time,
  };
}

function reliabilityInput(attendance = {}) {
  if (!attendance.finalised_at && !attendance.finalisedAt) return null;
  const status = attendance.status;
  if (!RESOLVED_ATTENDANCE_STATUSES.includes(status)) return null;
  const reviewOutcome =
    attendance.worker_reason_review_outcome || attendance.workerReasonReviewOutcome;
  return {
    attendanceDayId: attendance.id,
    placementId: attendance.placement_id || attendance.placementId,
    workDate: attendance.work_date || attendance.workDate,
    recordedWorkingDay: ["on_time", "late", "no_show"].includes(status),
    onTime: status === "on_time",
    late: status === "late",
    noShow: status === "no_show",
    nonPenalising: ["approved_absence", "non_worker_fault", "sent_home"].includes(
      status,
    ),
    approvedLatenessException:
      status === "late" && reviewOutcome === "approved_exception",
  };
}

module.exports = {
  ATTENDANCE_GRACE_MINUTES,
  ATTENDANCE_STATUSES,
  CAPTURE_METHODS,
  LATE_REASON_CATEGORIES,
  LATE_EXCEPTION_POLICY,
  LATE_REASON_REVIEW_OUTCOMES,
  NON_WORKER_FAULT_REASONS,
  RESOLVED_ATTENDANCE_STATUSES,
  arrivalStatus,
  cleanDate,
  cleanTime,
  normalizeWorkingDays,
  placementExpectedOnDate,
  placementTermsOnDate,
  projectTimeParts,
  reliabilityInput,
  weekdayForDate,
};
