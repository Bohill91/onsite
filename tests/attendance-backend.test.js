"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  ATTENDANCE_GRACE_MINUTES,
  LATE_EXCEPTION_POLICY,
  arrivalStatus,
  placementEffectiveAttendanceEndDate,
  placementExpectedOnDate,
  placementTermsOnDate,
  projectTimeParts,
  reliabilityInput,
  resolvePlacementWorkDate,
  timestampMatchesWorkDate,
} = require("../attendance-rules.js");
const {
  AttendanceServiceError,
  attendanceDayProjection,
  createAttendanceService,
  createSupabaseAttendanceAdapter,
  hashCapability,
} = require("../server-attendance.js");

const COMPANY_A = "00000000-0000-4000-8000-000000000001";
const COMPANY_B = "00000000-0000-4000-8000-000000000002";
const ADMIN_A = "00000000-0000-4000-8000-000000000011";
const MANAGER_A = "00000000-0000-4000-8000-000000000012";
const SUPERVISOR_A = "00000000-0000-4000-8000-000000000013";
const SUPERVISOR_A_2 = "00000000-0000-4000-8000-000000000016";
const ADMIN_B = "00000000-0000-4000-8000-000000000014";
const ATTENDANCE_MANAGER = "00000000-0000-4000-8000-000000000015";
const WORKER_A = "00000000-0000-4000-8000-000000000101";
const WORKER_B = "00000000-0000-4000-8000-000000000102";
const WORKER_USER_A = "00000000-0000-4000-8000-000000000111";
const WORKER_USER_B = "00000000-0000-4000-8000-000000000112";
const PROJECT_A = "00000000-0000-4000-8000-000000000201";
const PROJECT_B = "00000000-0000-4000-8000-000000000202";
const REQUIREMENT_A = "00000000-0000-4000-8000-000000000301";
const REQUIREMENT_B = "00000000-0000-4000-8000-000000000302";
const PLACEMENT_A = "00000000-0000-4000-8000-000000000401";
const PLACEMENT_B = "00000000-0000-4000-8000-000000000402";
const DAY_A = "00000000-0000-4000-8000-000000000501";
const TEST_NOW = "2026-09-16T06:35:00.000Z"; // 07:35 Europe/London
const TEST_DATE = "2026-09-16";
const WEEK_START = "2026-09-14";

function companyPrincipal(role = "Administrator", companyId = COMPANY_A) {
  const actor = {
    administrator: companyId === COMPANY_B ? ADMIN_B : ADMIN_A,
    manager: MANAGER_A,
    supervisor: SUPERVISOR_A,
  }[role.toLowerCase()] || ADMIN_A;
  return {
    type: "company",
    id: companyId,
    companyId,
    authUserId: actor,
    permissionRole: role,
    serverAuthenticated: true,
  };
}

function workerPrincipal(workerId = WORKER_A) {
  return {
    type: "worker",
    id: workerId,
    workerId,
    authUserId: workerId === WORKER_A ? WORKER_USER_A : WORKER_USER_B,
    serverAuthenticated: true,
  };
}

function placementRow(overrides = {}) {
  return {
    id: PLACEMENT_A,
    worker_id: WORKER_A,
    project_requirement_id: REQUIREMENT_A,
    status: "active",
    current_start_date: "2026-09-01",
    current_estimated_end_date: "2026-10-31",
    current_no_fixed_end_date: false,
    current_working_days: [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
    ],
    current_shift_start_time: "07:30",
    current_shift_finish_time: "16:30",
    agreed_working_days: [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
    ],
    agreed_shift_start_time: "07:30",
    agreed_shift_finish_time: "16:30",
    scheduled_end_date: null,
    ended_at: null,
    placement_lifecycle_events: [],
    worker_profiles: {
      id: WORKER_A,
      name: "Alice Carter",
      trade: "Electrical",
      trade_key: "electrical",
      specialism: "Electrician",
      role_key: "electrician",
      grade: "Skilled",
      profile_photo_reference: "photo-ref",
      private_minimum_day_rate: 220,
      password_hash: "private",
    },
    project_requirements: {
      id: REQUIREMENT_A,
      project_id: PROJECT_A,
      projects: {
        id: PROJECT_A,
        company_id: COMPANY_A,
        project_name: "Northgate Tower",
        job_number: "HS2-001",
        location_label: "London",
        timezone: "Europe/London",
      },
    },
    ...overrides,
  };
}

function attendanceRow(overrides = {}) {
  return {
    id: DAY_A,
    placement_id: PLACEMENT_A,
    project_id: PROJECT_A,
    work_date: TEST_DATE,
    expected: true,
    status: "needs_review",
    effective_arrival_at: null,
    captured_at: null,
    shift_start_snapshot: "07:30",
    shift_finish_snapshot: "16:30",
    working_days_snapshot: [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
    ],
    project_timezone_snapshot: "Europe/London",
    minutes_late: null,
    capture_method: "expected_day",
    finalised_at: null,
    weekly_submission_id: null,
    worker_reason_category: null,
    worker_reason_explanation: null,
    worker_reason_submitted_at: null,
    worker_reason_revision: 0,
    worker_reason_review_outcome: null,
    worker_reason_reviewed_by_user_id: null,
    worker_reason_reviewed_at: null,
    worker_reason_review_revision: 0,
    capture_latitude: null,
    capture_longitude: null,
    attendance_events: [],
    placements: placementRow(),
    created_at: TEST_NOW,
    updated_at: TEST_NOW,
    ...overrides,
  };
}

function fakeAttendanceAdapter(options = {}) {
  const clone = (value) => structuredClone(value);
  const days = new Map();
  const siteTokens = new Map();
  const workerTokens = new Map();
  const submissions = new Map();
  const managers = new Map();
  let currentNow = options.now || TEST_NOW;
  let placementTemplate = placementRow(options.placement || {});
  const projectTimezone = options.timezone || "Europe/London";
  let sequence = 600;
  const uuid = () =>
    `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
  const actorRole = (actor) => {
    if (actor === ADMIN_A) return "administrator";
    if (actor === MANAGER_A) return "manager";
    if (actor === SUPERVISOR_A) return "supervisor";
    if (actor === SUPERVISOR_A_2) return "supervisor";
    if (actor === ADMIN_B) return "administrator";
    return "";
  };
  const actorCompany = (actor) => (actor === ADMIN_B ? COMPANY_B : COMPANY_A);
  const actorWorker = (actor) =>
    actor === WORKER_USER_A ? WORKER_A : actor === WORKER_USER_B ? WORKER_B : "";

  function relation(projectId = PROJECT_A, workerId = WORKER_A, placementId = PLACEMENT_A) {
    return placementRow({
      ...clone(placementTemplate),
      id: placementId,
      worker_id: workerId,
      project_requirement_id:
        projectId === PROJECT_A ? REQUIREMENT_A : REQUIREMENT_B,
      worker_profiles: {
        ...placementRow().worker_profiles,
        id: workerId,
        name: workerId === WORKER_A ? "Alice Carter" : "Ben Evans",
      },
      project_requirements: {
        id: projectId === PROJECT_A ? REQUIREMENT_A : REQUIREMENT_B,
        project_id: projectId,
        projects: {
          id: projectId,
          company_id: projectId === PROJECT_A ? COMPANY_A : COMPANY_B,
          project_name: projectId === PROJECT_A ? "Northgate Tower" : "Nexus",
          job_number: projectId === PROJECT_A ? "HS2-001" : "M2055",
          location_label: projectId === PROJECT_A ? "London" : "Manchester",
          timezone: projectTimezone,
        },
      },
    });
  }

  function ensureDay({
    projectId = PROJECT_A,
    workerId = WORKER_A,
    placementId = PLACEMENT_A,
    workDate = TEST_DATE,
  } = {}) {
    const key = `${placementId}:${workDate}`;
    if (!days.has(key)) {
      const placement = relation(projectId, workerId, placementId);
      const terms = placementTermsOnDate(placement, workDate);
      days.set(
        key,
        attendanceRow({
          id: projectId === PROJECT_A ? DAY_A : uuid(),
          placement_id: placementId,
          project_id: projectId,
          work_date: workDate,
          shift_start_snapshot: terms.shiftStartTime,
          shift_finish_snapshot: terms.shiftFinishTime,
          working_days_snapshot: terms.workingDays,
          placements: placement,
        }),
      );
    }
    return days.get(key);
  }

  return {
    configured: true,
    days,
    siteTokens,
    workerTokens,
    submissions,
    managers,
    setNow(value) {
      currentNow = value;
    },
    setPlacement(value) {
      placementTemplate = placementRow(value);
    },
    async projectAuthority(actorUserId, projectId) {
      const role = actorRole(actorUserId);
      const companyId = projectId === PROJECT_A ? COMPANY_A : COMPANY_B;
      const manager = managers.get(projectId);
      const isManager = manager?.user_id === actorUserId;
      return {
        allowed:
          (role && actorCompany(actorUserId) === companyId) || isManager,
        company_id: companyId,
        role:
          role && actorCompany(actorUserId) === companyId ? role : "",
        is_attendance_manager: isManager,
        timezone: projectTimezone,
      };
    },
    async listProjectAttendance(_actor, projectId, weekStart) {
      if (projectId === PROJECT_A && weekStart <= TEST_DATE) ensureDay();
      return clone(
        [...days.values()].filter((day) => day.project_id === projectId),
      );
    },
    async listWorkerAttendance(workerId) {
      return clone(
        [...days.values()].filter(
          (day) => day.placements.worker_id === workerId,
        ),
      );
    },
    async issueSiteToken(values) {
      const workDate =
        values.workDate || projectTimeParts(currentNow, projectTimezone)?.date;
      const row = {
        id: uuid(),
        project_id: values.projectId,
        work_date: workDate,
        token_hash: values.tokenHash,
        expires_at: "2026-09-16T22:59:59.000Z",
        revoked_at: null,
      };
      if (values.revokeExisting) {
        for (const token of siteTokens.values()) {
          if (
            token.project_id === values.projectId &&
            token.work_date === workDate &&
            !token.revoked_at
          ) {
            token.revoked_at = currentNow;
          }
        }
      }
      siteTokens.set(values.tokenHash, row);
      return clone(row);
    },
    async scanSiteToken(values) {
      const token = siteTokens.get(values.tokenHash);
      if (!token || token.revoked_at) {
        throw new AttendanceServiceError(
          "This site QR is invalid or has expired.",
          400,
          "INVALID_SITE_QR",
        );
      }
      const workerId = actorWorker(values.actorUserId);
      if (workerId !== WORKER_A || token.project_id !== PROJECT_A) {
        throw new AttendanceServiceError(
          "You are not expected on this project today.",
          403,
          "NOT_EXPECTED_TODAY",
        );
      }
      const day = ensureDay({ workDate: token.work_date });
      const terms = placementTermsOnDate(day.placements, token.work_date);
      if (!timestampMatchesWorkDate({
        timestamp: currentNow,
        workDate: token.work_date,
        shiftStartTime: terms.shiftStartTime,
        shiftFinishTime: terms.shiftFinishTime,
        timeZone: day.project_timezone_snapshot,
      })) {
        throw new AttendanceServiceError(
          "This site QR is not valid for the worker shift.",
          400,
          "SITE_QR_WRONG_DATE",
        );
      }
      if (day.effective_arrival_at) {
        return { outcome: "already_signed_in", attendance_day_id: day.id };
      }
      const calculated = arrivalStatus({
        arrivalAt: currentNow,
        workDate: token.work_date,
        shiftStartTime: day.shift_start_snapshot,
        shiftFinishTime: day.shift_finish_snapshot,
        timeZone: day.project_timezone_snapshot,
      });
      Object.assign(day, {
        status: calculated.status,
        minutes_late: calculated.minutesLate,
        effective_arrival_at: currentNow,
        captured_at: currentNow,
        capture_method: "worker_site_qr",
        capture_latitude: values.latitude,
        capture_longitude: values.longitude,
      });
      day.attendance_events.push({
        id: uuid(),
        event_type: "worker_site_qr_scan",
        actor_type: "worker",
        recorded_at: currentNow,
        effective_at: currentNow,
        metadata: {},
      });
      return { outcome: "signed_in", attendance_day_id: day.id };
    },
    async issueWorkerToken(values) {
      const workerId = actorWorker(values.actorUserId);
      if (!workerId) throw new AttendanceServiceError("Worker required", 403);
      for (const token of workerTokens.values()) {
        if (token.worker_id === workerId && !token.revoked_at) {
          token.revoked_at = currentNow;
        }
      }
      const row = {
        id: uuid(),
        worker_id: workerId,
        token_hash: values.tokenHash,
        expires_at: "2026-09-16T06:40:00.000Z",
        revoked_at: null,
      };
      workerTokens.set(values.tokenHash, row);
      return clone(row);
    },
    async scanWorkerToken(values) {
      const token = workerTokens.get(values.tokenHash);
      if (!token || token.revoked_at) {
        throw new AttendanceServiceError("Invalid worker QR", 400, "INVALID_WORKER_QR");
      }
      const placement = relation(PROJECT_A, token.worker_id, PLACEMENT_A);
      const arrival = values.observedArrivalAt || currentNow;
      const workDate = resolvePlacementWorkDate(
        placement,
        arrival,
        "Europe/London",
      );
      if (!workDate) {
        throw new AttendanceServiceError(
          "This worker is not expected on the project today.",
          403,
          "NOT_EXPECTED_TODAY",
        );
      }
      const day = ensureDay({ workerId: token.worker_id, workDate });
      const calculated = arrivalStatus({
        arrivalAt: arrival,
        workDate,
        shiftStartTime: day.shift_start_snapshot,
        shiftFinishTime: day.shift_finish_snapshot,
        timeZone: day.project_timezone_snapshot,
      });
      const already = !!day.effective_arrival_at;
      const previous = {
        status: day.status,
        effectiveArrivalAt: day.effective_arrival_at,
        capturedAt: day.captured_at,
        minutesLate: day.minutes_late,
      };
      if (!already || new Date(arrival) < new Date(day.effective_arrival_at)) {
        Object.assign(day, {
          status: calculated.status,
          minutes_late: calculated.minutesLate,
          effective_arrival_at: arrival,
          captured_at: currentNow,
          capture_method: "supervisor_worker_qr",
        });
      }
      const eventKey = [
        day.id,
        values.actorUserId,
        day.effective_arrival_at,
      ].join(":");
      if (arrival === day.effective_arrival_at && !day.attendance_events.some((event) =>
        event.event_type === "supervisor_worker_qr_scan" &&
        event.idempotency_key === eventKey
      )) {
        day.attendance_events.push({
          id: uuid(),
          event_type: "supervisor_worker_qr_scan",
          actor_type: "supervisor",
          actor_user_id: values.actorUserId,
          recorded_at: currentNow,
          effective_at: day.effective_arrival_at,
          idempotency_key: eventKey,
          metadata: {
            previous,
            new: {
              status: day.status,
              effectiveArrivalAt: day.effective_arrival_at,
              capturedAt: day.captured_at,
              minutesLate: day.minutes_late,
            },
          },
        });
      }
      return {
        outcome: already ? "already_signed_in" : "signed_in",
        attendance_day_id: day.id,
      };
    },
    async markAttendance(values) {
      const day = ensureDay({
        projectId: values.projectId,
        placementId: values.placementId,
        workDate: values.workDate,
      });
      if (!placementExpectedOnDate(day.placements, values.workDate)) {
        throw new AttendanceServiceError(
          "The worker is not expected on this project date.",
          400,
          "NOT_EXPECTED_TODAY",
        );
      }
      const submission = submissions.get(`${values.projectId}:${WEEK_START}`);
      if (submission?.status === "submitted") {
        throw new AttendanceServiceError(
          "Reopen submitted attendance before making a correction.",
          400,
          "ATTENDANCE_SUBMITTED",
        );
      }
      Object.assign(day, {
        status: values.status,
        effective_arrival_at: values.effectiveArrivalAt || null,
        minutes_late: values.status === "late" ? 15 : values.status === "on_time" ? 0 : null,
        capture_method:
          values.actorUserId === ADMIN_A
            ? "administrator_override"
            : "attendance_manager_manual",
        outcome_reason: values.reason || "",
      });
      day.attendance_events.push({
        id: uuid(),
        event_type:
          values.correctionReason ? "admin_correction" : `marked_${values.status}`,
        actor_type: values.actorUserId === ADMIN_A ? "administrator" : "attendance_manager",
        recorded_at: TEST_NOW,
        metadata: {
          previous: { status: "needs_review" },
          new: { status: values.status },
        },
      });
      return { attendance_day_id: day.id };
    },
    async submitLateReason(values) {
      const day = [...days.values()].find((candidate) => candidate.id === values.attendanceId);
      if (!day || day.placements.worker_id !== actorWorker(values.actorUserId)) {
        throw new AttendanceServiceError("Attendance not found", 404, "ATTENDANCE_NOT_FOUND");
      }
      const explanation = values.explanation || "";
      if (
        day.worker_reason_category === values.category &&
        (day.worker_reason_explanation || "") === explanation
      ) {
        return {
          outcome: "already_submitted",
          attendance_day_id: day.id,
          reason_revision: day.worker_reason_revision,
          review_outcome: day.worker_reason_review_outcome,
        };
      }
      const previous = {
        category: day.worker_reason_category,
        explanation: day.worker_reason_explanation,
        reviewOutcome: day.worker_reason_review_outcome,
        revision: day.worker_reason_revision,
      };
      day.worker_reason_category = values.category;
      day.worker_reason_explanation = explanation;
      day.worker_reason_submitted_at = currentNow;
      day.worker_reason_revision += 1;
      day.worker_reason_review_outcome = "pending";
      day.worker_reason_reviewed_by_user_id = null;
      day.worker_reason_reviewed_at = null;
      day.attendance_events.push({
        id: uuid(),
        event_type: "worker_lateness_reason_submitted",
        actor_type: "worker",
        recorded_at: currentNow,
        metadata: {
          previous,
          new: {
            category: values.category,
            explanation,
            revision: day.worker_reason_revision,
          },
        },
      });
      return {
        outcome: "submitted",
        attendance_day_id: day.id,
        reason_revision: day.worker_reason_revision,
        review_outcome: day.worker_reason_review_outcome,
      };
    },
    async reviewLateReason(values) {
      const day = [...days.values()].find((candidate) => candidate.id === values.attendanceId);
      const previousReview = [...day.attendance_events]
        .reverse()
        .find((event) => [
          "lateness_exception_approved",
          "lateness_exception_rejected",
        ].includes(event.event_type));
      if (
        day.worker_reason_review_outcome === values.outcome &&
        (previousReview?.private_company_notes || "") === (values.reason || "")
      ) {
        return {
          outcome: "already_reviewed",
          attendance_day_id: day.id,
          review_revision: day.worker_reason_review_revision,
        };
      }
      const previous = {
        outcome: day.worker_reason_review_outcome,
        reason: previousReview?.private_company_notes || "",
        revision: day.worker_reason_review_revision,
      };
      day.worker_reason_review_outcome = values.outcome;
      day.worker_reason_reviewed_by_user_id = values.actorUserId;
      day.worker_reason_reviewed_at = currentNow;
      day.worker_reason_review_revision += 1;
      day.attendance_events.push({
        id: uuid(),
        event_type:
          values.outcome === "approved_exception"
            ? "lateness_exception_approved"
            : "lateness_exception_rejected",
        actor_type: "attendance_manager",
        recorded_at: currentNow,
        private_company_notes: values.reason || "",
        metadata: {
          previous,
          new: {
            outcome: values.outcome,
            reason: values.reason || "",
            revision: day.worker_reason_review_revision,
          },
        },
      });
      return {
        outcome: values.outcome,
        attendance_day_id: day.id,
        review_revision: day.worker_reason_review_revision,
      };
    },
    async submitWeek(values) {
      const projectDays = [...days.values()].filter(
        (day) => day.project_id === values.projectId,
      );
      if (projectDays.some((day) => day.expected && day.status === "needs_review")) {
        throw new AttendanceServiceError(
          "Resolve every expected attendance day before submitting the week.",
          400,
          "ATTENDANCE_WEEK_UNRESOLVED",
        );
      }
      if (projectDays.some((day) =>
        day.expected &&
        day.status === "late" &&
        day.worker_reason_category &&
        day.worker_reason_review_outcome === "pending"
      )) {
        throw new AttendanceServiceError(
          "Resolve pending lateness reviews before submitting the week.",
          400,
          "ATTENDANCE_LATENESS_REVIEW_PENDING",
        );
      }
      const key = `${values.projectId}:${values.weekStart}`;
      const existing = submissions.get(key);
      if (existing?.status === "submitted") {
        return {
          outcome: "already_submitted",
          submission_id: existing.id,
          submission_revision: existing.submission_revision,
        };
      }
      const submission = existing || {
        id: uuid(),
        project_id: values.projectId,
        week_start: values.weekStart,
        week_end: "2026-09-20",
        submission_revision: 0,
        created_at: currentNow,
      };
      Object.assign(submission, {
        status: "submitted",
        submission_revision: submission.submission_revision + 1,
        submitted_at: currentNow,
      });
      submissions.set(key, submission);
      for (const day of projectDays) {
        day.finalised_at = currentNow;
        day.weekly_submission_id = submission.id;
        day.attendance_events.push({
          id: uuid(),
          event_type: "week_submitted",
          actor_type: "administrator",
          recorded_at: currentNow,
          metadata: {
            submissionId: submission.id,
            submissionRevision: submission.submission_revision,
          },
        });
      }
      return {
        outcome: "submitted",
        submission_id: submission.id,
        submission_revision: submission.submission_revision,
      };
    },
    async reopenWeek(values) {
      const submission = submissions.get(`${values.projectId}:${values.weekStart}`);
      if (!submission) throw new AttendanceServiceError("Not submitted", 400);
      Object.assign(submission, {
        status: "reopened",
        reopened_at: currentNow,
        reopen_reason: values.reason,
      });
      for (const day of days.values()) {
        if (day.weekly_submission_id === submission.id) {
          day.finalised_at = null;
          day.attendance_events.push({
            id: uuid(),
            event_type: "week_reopened",
            actor_type: "administrator",
            recorded_at: currentNow,
            metadata: { submissionRevision: submission.submission_revision },
          });
        }
      }
      return {
        outcome: "reopened",
        submission_id: submission.id,
        submission_revision: submission.submission_revision,
      };
    },
    async assignManager(values) {
      const row = {
        id: uuid(),
        project_id: values.projectId,
        user_id: values.managerUserId || null,
        invite_email: values.inviteEmail || null,
        display_name: values.displayName || null,
        phone: values.phone || null,
        status: values.managerUserId ? "active" : "pending",
        assigned_at: TEST_NOW,
        accepted_at: values.managerUserId ? TEST_NOW : null,
      };
      managers.set(values.projectId, row);
      return clone(row);
    },
    async getAttendanceDay(id) {
      return clone([...days.values()].find((day) => day.id === id) || null);
    },
    async getWeekSubmission(projectId, weekStart) {
      return clone(submissions.get(`${projectId}:${weekStart}`) || null);
    },
  };
}

function service(adapter = fakeAttendanceAdapter(), now = TEST_NOW) {
  let tokenSequence = 0;
  return createAttendanceService({
    adapter,
    tokenFactory: (prefix) => {
      tokenSequence += 1;
      return `${prefix}_${String(tokenSequence).padStart(2, "0")}${"a".repeat(41)}`;
    },
    clock: () => new Date(now),
  });
}

test("attendance timing uses the project timezone and existing ten-minute grace", () => {
  assert.equal(ATTENDANCE_GRACE_MINUTES, 10);
  assert.deepEqual(projectTimeParts(TEST_NOW, "Europe/London"), {
    date: TEST_DATE,
    time: "07:35",
    seconds: 0,
    minutes: 455,
  });
  assert.deepEqual(
    arrivalStatus({
      arrivalAt: "2026-09-16T06:40:00.000Z",
      workDate: TEST_DATE,
      shiftStartTime: "07:30",
      timeZone: "Europe/London",
    }),
    { status: "on_time", minutesLate: 10, localDate: TEST_DATE, localTime: "07:40" },
  );
  assert.equal(
    arrivalStatus({
      arrivalAt: "2026-09-16T06:41:00.000Z",
      workDate: TEST_DATE,
      shiftStartTime: "07:30",
      timeZone: "Europe/London",
    }).status,
    "late",
  );
  assert.deepEqual(
    arrivalStatus({
      arrivalAt: "2026-09-16T06:00:00.000Z",
      workDate: TEST_DATE,
      shiftStartTime: "07:30",
      timeZone: "Europe/London",
    }),
    { status: "on_time", minutesLate: 0, localDate: TEST_DATE, localTime: "07:00" },
  );
});

test("expected work days respect placement dates, weekdays and effective terminal dates", () => {
  const placement = placementRow();
  assert.equal(placementExpectedOnDate(placement, TEST_DATE), true);
  assert.equal(placementExpectedOnDate(placement, "2026-08-31"), false);
  assert.equal(placementExpectedOnDate(placement, "2026-09-19"), false);
  assert.equal(
    placementExpectedOnDate({ ...placement, scheduled_end_date: "2026-09-15" }, TEST_DATE),
    false,
  );
  assert.equal(
    placementExpectedOnDate({
      ...placement,
      status: "released",
      ended_at: "2026-09-16T17:00:00.000Z",
    }, TEST_DATE),
    true,
  );
  assert.equal(
    placementExpectedOnDate({ ...placement, status: "released" }, TEST_DATE),
    false,
  );
  assert.equal(
    placementExpectedOnDate({ ...placement, current_estimated_end_date: "2026-09-15" }, TEST_DATE),
    false,
  );
  assert.equal(
    placementExpectedOnDate({ ...placement, current_no_fixed_end_date: true }, "2027-09-16"),
    true,
  );
});

test("completed and released placements retain only historically valid expected days", () => {
  const completed = placementRow({
    status: "completed",
    ended_at: "2026-09-16T18:00:00.000Z",
    placement_lifecycle_events: [{
      event_type: "completed",
      effective_at: "2026-09-16T00:00:00.000Z",
    }],
  });
  assert.equal(placementEffectiveAttendanceEndDate(completed), "2026-09-16");
  assert.equal(placementExpectedOnDate(completed, "2026-09-14"), true);
  assert.equal(placementExpectedOnDate(completed, "2026-09-16"), true);
  assert.equal(placementExpectedOnDate(completed, "2026-09-17"), false);

  const released = placementRow({
    status: "released",
    scheduled_end_date: "2026-09-16",
    placement_lifecycle_events: [{
      event_type: "released",
      effective_at: "2026-09-16T00:00:00.000Z",
    }],
  });
  assert.equal(placementExpectedOnDate(released, "2026-09-15"), true);
  assert.equal(placementExpectedOnDate(released, "2026-09-17"), false);
});

test("Phase 3C date-semantic terminal evidence is stable across project timezones", () => {
  for (const timezone of [
    "Europe/London",
    "America/New_York",
    "Asia/Tokyo",
  ]) {
    const manualCompletion = placementRow({
      status: "completed",
      current_estimated_end_date: "2026-10-31",
      ended_at: "2026-09-17T00:00:00.000Z",
      placement_lifecycle_events: [{
        event_type: "completed",
        effective_at: "2026-09-17T00:00:00.000Z",
      }],
      project_requirements: {
        ...placementRow().project_requirements,
        projects: {
          ...placementRow().project_requirements.projects,
          timezone,
        },
      },
    });
    assert.equal(
      placementEffectiveAttendanceEndDate(manualCompletion),
      "2026-09-17",
      timezone,
    );
  }
});

test("terminal attendance uses canonical scheduled and lifecycle dates before ended_at", () => {
  const scenarios = [
    placementRow({
      status: "active",
      scheduled_end_date: "2026-09-17",
    }),
    placementRow({
      status: "released",
      scheduled_end_date: "2026-09-17",
      placement_lifecycle_events: [{
        event_type: "worker_end_requested",
        effective_at: "2026-09-17T00:00:00.000Z",
      }],
    }),
    placementRow({
      status: "completed",
      placement_lifecycle_events: [{
        event_type: "completed",
        effective_at: "2026-09-17T00:00:00.000Z",
      }],
      ended_at: "2026-09-17T00:00:00.000Z",
    }),
    placementRow({
      status: "completed",
      current_estimated_end_date: "2026-09-17",
      placement_lifecycle_events: [{
        event_type: "completed",
        reason_code: "natural_completion",
        effective_at: "2026-09-17T00:00:00.000Z",
      }],
      ended_at: "2026-09-18T02:00:00.000Z",
    }),
    placementRow({
      status: "released",
      scheduled_end_date: "2026-09-17",
      placement_lifecycle_events: [{
        event_type: "released",
        effective_at: "2026-09-17T00:00:00.000Z",
      }],
      ended_at: "2026-09-17T02:00:00.000Z",
    }),
  ];
  for (const placement of scenarios) {
    assert.equal(placementEffectiveAttendanceEndDate(placement), "2026-09-17");
  }

  const realTimestampFallback = placementRow({
    status: "released",
    current_no_fixed_end_date: true,
    current_estimated_end_date: null,
    ended_at: "2026-09-17T02:00:00.000Z",
    project_requirements: {
      ...placementRow().project_requirements,
      projects: {
        ...placementRow().project_requirements.projects,
        timezone: "America/New_York",
      },
    },
  });
  assert.equal(
    placementEffectiveAttendanceEndDate(realTimestampFallback),
    "2026-09-16",
  );
});

test("early completion and pre-start stand-down stop expected attendance at the effective date", () => {
  const earlyCompletion = placementRow({
    status: "completed",
    current_estimated_end_date: "2026-10-31",
    placement_lifecycle_events: [{
      event_type: "completed",
      effective_at: "2026-09-15T00:00:00.000Z",
    }],
  });
  assert.equal(placementExpectedOnDate(earlyCompletion, "2026-09-15"), true);
  assert.equal(placementExpectedOnDate(earlyCompletion, TEST_DATE), false);

  const stoodDown = placementRow({
    status: "released",
    current_start_date: "2026-09-01",
    current_no_fixed_end_date: true,
    current_estimated_end_date: null,
    placement_lifecycle_events: [{
      event_type: "released",
      effective_at: "2026-08-31T00:00:00.000Z",
    }],
  });
  assert.equal(placementExpectedOnDate(stoodDown, "2026-09-01"), false);
});

test("overnight attendance resolves to the shift-start work date", () => {
  const nightPlacement = placementRow({
    agreed_working_days: ["wednesday"],
    agreed_shift_start_time: "20:00",
    agreed_shift_finish_time: "05:00",
  });
  const beforeMidnight = "2026-09-16T19:10:00.000Z";
  const afterMidnight = "2026-09-16T23:20:00.000Z";
  assert.equal(
    resolvePlacementWorkDate(nightPlacement, beforeMidnight, "Europe/London"),
    TEST_DATE,
  );
  assert.equal(
    resolvePlacementWorkDate(nightPlacement, afterMidnight, "Europe/London"),
    TEST_DATE,
  );
  assert.deepEqual(
    arrivalStatus({
      arrivalAt: afterMidnight,
      workDate: TEST_DATE,
      shiftStartTime: "20:00",
      shiftFinishTime: "05:00",
      timeZone: "Europe/London",
    }),
    {
      status: "late",
      minutesLate: 260,
      localDate: "2026-09-17",
      localTime: "00:20",
    },
  );
  assert.equal(
    timestampMatchesWorkDate({
      timestamp: afterMidnight,
      workDate: TEST_DATE,
      shiftStartTime: "07:30",
      shiftFinishTime: "16:30",
      timeZone: "Europe/London",
    }),
    false,
  );
});

test("future accepted schedule changes use date-effective shifts and working days", () => {
  const placement = placementRow({
    current_working_days: ["thursday", "friday", "saturday"],
    current_shift_start_time: "09:00",
    current_shift_finish_time: "18:00",
    placement_change_offers: [
      {
        id: "change-1",
        status: "accepted",
        change_type: "schedule_change",
        effective_date: "2026-09-17",
        created_at: "2026-09-10T10:00:00.000Z",
        applied_at: "2026-09-17T00:05:00.000Z",
        proposed_terms: {
          working_days: ["thursday", "friday", "saturday"],
          shift_start_time: "09:00",
          shift_finish_time: "18:00",
        },
      },
    ],
  });

  assert.deepEqual(placementTermsOnDate(placement, TEST_DATE), {
    workingDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    shiftStartTime: "07:30",
    shiftFinishTime: "16:30",
  });
  assert.deepEqual(placementTermsOnDate(placement, "2026-09-17"), {
    workingDays: ["thursday", "friday", "saturday"],
    shiftStartTime: "09:00",
    shiftFinishTime: "18:00",
  });
  assert.equal(placementExpectedOnDate(placement, TEST_DATE), true);
  assert.equal(placementExpectedOnDate(placement, "2026-09-17"), true);
  assert.equal(placementExpectedOnDate(placement, "2026-09-21"), false);
});

test("only finalised canonical attendance produces reliability inputs", () => {
  assert.equal(reliabilityInput(attendanceRow({ status: "no_show" })), null);
  const input = reliabilityInput(
    attendanceRow({
      status: "late",
      finalised_at: TEST_NOW,
      worker_reason_review_outcome: "approved_exception",
    }),
  );
  assert.equal(input.late, true);
  assert.equal(input.approvedLatenessException, true);
  assert.equal(input.nonPenalising, false);
  assert.deepEqual(LATE_EXCEPTION_POLICY, {
    ordinaryMonthlyAllowance: null,
    strikeDisruptionOutsideAllowance: null,
    status: "product_policy_required",
  });
});

test("default company attendance week follows the project timezone", async () => {
  const adapter = fakeAttendanceAdapter();
  const originalAuthority = adapter.projectAuthority;
  let requestedWeek = "";
  adapter.projectAuthority = async (...args) => ({
    ...(await originalAuthority(...args)),
    timezone: "Pacific/Kiritimati",
  });
  adapter.listProjectAttendance = async (_actor, _project, weekStart) => {
    requestedWeek = weekStart;
    return [];
  };
  const api = createAttendanceService({
    adapter,
    clock: () => new Date("2026-09-20T10:30:00.000Z"),
  });
  await api.listProject(companyPrincipal(), PROJECT_A);
  assert.equal(requestedWeek, "2026-09-21");
});

test("worker sees only own allow-listed attendance", async () => {
  const adapter = fakeAttendanceAdapter();
  adapter.days.set(`${PLACEMENT_A}:${TEST_DATE}`, attendanceRow({ status: "late" }));
  adapter.days.set(
    `${PLACEMENT_B}:${TEST_DATE}`,
    attendanceRow({
      id: "00000000-0000-4000-8000-000000000502",
      placement_id: PLACEMENT_B,
      project_id: PROJECT_B,
      placements: placementRow({
        id: PLACEMENT_B,
        worker_id: WORKER_B,
        worker_profiles: {
          id: WORKER_B,
          name: "Ben Evans",
          private_minimum_day_rate: 500,
        },
      }),
    }),
  );
  const rows = await service(adapter).listWorker(workerPrincipal());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].placementId, PLACEMENT_A);
  assert.equal("worker" in rows[0], false);
  assert.equal(JSON.stringify(rows).includes("private_minimum_day_rate"), false);
  assert.equal(JSON.stringify(rows).includes("password_hash"), false);
});

test("company attendance is ownership-scoped and browser claims cannot redirect it", async () => {
  const api = service();
  await assert.rejects(
    api.listProject(companyPrincipal("Administrator", COMPANY_A), PROJECT_B, {
      weekStart: WEEK_START,
    }),
    (error) => error.code === "ATTENDANCE_NOT_FOUND",
  );
  await assert.rejects(
    api.mark(companyPrincipal(), PROJECT_A, {
      placementId: PLACEMENT_A,
      workDate: TEST_DATE,
      status: "no_show",
      reason: "Absent",
      companyId: COMPANY_B,
    }),
    (error) => error.code === "ATTENDANCE_AUTHORITY_CLAIM",
  );
});

test("Attendance Manager is project-scoped and Administrator override remains", async () => {
  const adapter = fakeAttendanceAdapter();
  adapter.managers.set(PROJECT_A, {
    user_id: ATTENDANCE_MANAGER,
    status: "active",
  });
  const api = service(adapter);
  const managerPrincipal = {
    type: "attendance_manager",
    authUserId: ATTENDANCE_MANAGER,
    serverAuthenticated: true,
  };
  const own = await api.listProject(managerPrincipal, PROJECT_A, {
    weekStart: WEEK_START,
  });
  assert.equal(own.projectId, PROJECT_A);
  adapter.managers.set(PROJECT_A, {
    user_id: ADMIN_B,
    status: "active",
  });
  const externalCompanyManager = await api.listProject(
    companyPrincipal("Administrator", COMPANY_B),
    PROJECT_A,
    { weekStart: WEEK_START },
  );
  assert.equal(externalCompanyManager.projectId, PROJECT_A);
  await assert.rejects(
    api.listProject(managerPrincipal, PROJECT_B, { weekStart: WEEK_START }),
    (error) => error.code === "ATTENDANCE_NOT_FOUND",
  );
  const admin = await api.listProject(companyPrincipal(), PROJECT_A, {
    weekStart: WEEK_START,
  });
  assert.equal(admin.attendance.length, 1);
});

test("Supervisor may scan but cannot manually mark or submit a week", async () => {
  const adapter = fakeAttendanceAdapter();
  const api = service(adapter);
  const workerQr = await api.issueWorkerQr(workerPrincipal());
  const scanned = await api.scanWorkerQr(companyPrincipal("Supervisor"), {
    projectId: PROJECT_A,
    token: workerQr.token,
    observedArrivalAt: "2026-09-16T06:29:00.000Z",
  });
  assert.equal(scanned.attendance.status, "on_time");
  await assert.rejects(
    api.mark(companyPrincipal("Supervisor"), PROJECT_A, {
      placementId: PLACEMENT_A,
      workDate: TEST_DATE,
      status: "no_show",
      reason: "Absent",
    }),
    (error) => error.code === "ATTENDANCE_PERMISSION_DENIED",
  );
  await assert.rejects(
    api.submitWeek(companyPrincipal("Supervisor"), PROJECT_A, {
      weekStart: WEEK_START,
    }),
    (error) => error.code === "ATTENDANCE_PERMISSION_DENIED",
  );
});

test("anonymous attendance access is denied", async () => {
  await assert.rejects(
    service().listWorker(null),
    (error) => error.code === "UNAUTHENTICATED",
  );
});

test("daily site QR is opaque, hashed at rest, date-scoped and safely regenerated", async () => {
  const adapter = fakeAttendanceAdapter();
  const api = service(adapter);
  const first = await api.issueSiteQr(companyPrincipal(), PROJECT_A, {
    workDate: TEST_DATE,
  });
  assert.match(first.token, /^osa_/);
  assert.match(first.svg, /class="qr-glyph"/);
  assert.match(first.svg, /<path/);
  assert.equal(first.svg.includes(first.token), false);
  assert.equal(first.token.includes(PROJECT_A), false);
  const stored = adapter.siteTokens.get(hashCapability(first.token));
  assert.equal(stored.token_hash, hashCapability(first.token));
  assert.equal(JSON.stringify(stored).includes(first.token), false);
  const additionalIssue = await api.issueSiteQr(companyPrincipal(), PROJECT_A, {
    workDate: TEST_DATE,
  });
  const next = await api.issueSiteQr(companyPrincipal(), PROJECT_A, {
    workDate: TEST_DATE,
    revokeExisting: true,
  });
  assert.equal(adapter.siteTokens.get(hashCapability(first.token)).revoked_at, TEST_NOW);
  assert.equal(
    adapter.siteTokens.get(hashCapability(additionalIssue.token)).revoked_at,
    TEST_NOW,
  );
  assert.notEqual(next.id, first.id);
  assert.equal(
    [...adapter.siteTokens.values()].filter((token) => !token.revoked_at).length,
    1,
  );
});

test("default site QR uses the project-local date on mixed day and night projects", async () => {
  const afterMidnight = "2026-09-17T04:45:00.000Z";
  const overnightAdapter = fakeAttendanceAdapter({
    now: afterMidnight,
    placement: {
      agreed_working_days: ["wednesday"],
      agreed_shift_start_time: "20:00",
      agreed_shift_finish_time: "06:00",
    },
  });
  const overnightApi = service(overnightAdapter, afterMidnight);
  const previousQr = await overnightApi.issueSiteQr(
    companyPrincipal(),
    PROJECT_A,
    { workDate: "2026-09-16" },
  );
  const previousScan = await overnightApi.scanSiteQr(workerPrincipal(), {
    token: previousQr.token,
  });
  assert.equal(previousScan.attendance.workDate, "2026-09-16");
  const defaultQr = await overnightApi.issueSiteQr(
    companyPrincipal(),
    PROJECT_A,
  );
  assert.equal(defaultQr.workDate, "2026-09-17");

  const dayAdapter = fakeAttendanceAdapter({
    now: afterMidnight,
    placement: {
      agreed_working_days: ["thursday"],
      agreed_shift_start_time: "05:30",
      agreed_shift_finish_time: "14:00",
    },
  });
  const dayApi = service(dayAdapter, afterMidnight);
  const todayQr = await dayApi.issueSiteQr(companyPrincipal(), PROJECT_A);
  const todayScan = await dayApi.scanSiteQr(workerPrincipal(), {
    token: todayQr.token,
  });
  assert.equal(todayQr.workDate, "2026-09-17");
  assert.equal(todayScan.attendance.workDate, "2026-09-17");

  const newYorkNow = "2026-09-17T02:00:00.000Z";
  const newYorkApi = service(
    fakeAttendanceAdapter({
      now: newYorkNow,
      timezone: "America/New_York",
    }),
    newYorkNow,
  );
  const newYorkQr = await newYorkApi.issueSiteQr(
    companyPrincipal(),
    PROJECT_A,
  );
  assert.equal(newYorkQr.workDate, "2026-09-16");
});

test("worker site scan creates one canonical attendance day and duplicate scan is idempotent", async () => {
  const adapter = fakeAttendanceAdapter();
  const api = service(adapter);
  const qr = await api.issueSiteQr(companyPrincipal(), PROJECT_A, {
    workDate: TEST_DATE,
  });
  const first = await api.scanSiteQr(workerPrincipal(), {
    token: qr.token,
    latitude: 51.5,
    longitude: -0.1,
    accuracyM: 15,
  });
  const second = await api.scanSiteQr(workerPrincipal(), { token: qr.token });
  assert.equal(first.outcome, "signed_in");
  assert.equal(second.outcome, "already_signed_in");
  assert.equal(first.attendance.id, second.attendance.id);
  assert.equal(adapter.days.size, 1);
  assert.equal(first.attendance.status, "on_time");
  assert.equal(first.attendance.locationEvidence.latitude, 51.5);
});

test("overnight site QR scans keep one attendance day on the shift-start date", async () => {
  const afterMidnight = "2026-09-16T23:20:00.000Z";
  const adapter = fakeAttendanceAdapter({
    now: afterMidnight,
    placement: {
      agreed_working_days: ["wednesday"],
      agreed_shift_start_time: "20:00",
      agreed_shift_finish_time: "05:00",
    },
  });
  const api = service(adapter, afterMidnight);
  const qr = await api.issueSiteQr(companyPrincipal(), PROJECT_A, {
    workDate: TEST_DATE,
  });
  const first = await api.scanSiteQr(workerPrincipal(), { token: qr.token });
  const retry = await api.scanSiteQr(workerPrincipal(), { token: qr.token });
  assert.equal(first.attendance.workDate, TEST_DATE);
  assert.equal(retry.attendance.id, first.attendance.id);
  assert.equal(adapter.days.size, 1);
  assert.equal(first.attendance.minutesLate, 260);
});

test("a previous-day QR cannot sign a worker into an unrelated day shift", async () => {
  const afterMidnight = "2026-09-16T23:20:00.000Z";
  const adapter = fakeAttendanceAdapter({ now: afterMidnight });
  const api = service(adapter, afterMidnight);
  const qr = await api.issueSiteQr(companyPrincipal(), PROJECT_A, {
    workDate: TEST_DATE,
  });
  await assert.rejects(
    api.scanSiteQr(workerPrincipal(), { token: qr.token }),
    (error) => error.code === "SITE_QR_WRONG_DATE",
  );
});

test("revoked, invalid and wrong-project site QR scans fail closed", async () => {
  const adapter = fakeAttendanceAdapter();
  const api = service(adapter);
  const first = await api.issueSiteQr(companyPrincipal(), PROJECT_A, {
    workDate: TEST_DATE,
  });
  await api.issueSiteQr(companyPrincipal(), PROJECT_A, {
    workDate: TEST_DATE,
    revokeExisting: true,
  });
  await assert.rejects(
    api.scanSiteQr(workerPrincipal(), { token: first.token }),
    (error) => error.code === "INVALID_SITE_QR",
  );
  const otherProject = await api.issueSiteQr(
    companyPrincipal("Administrator", COMPANY_B),
    PROJECT_B,
    { workDate: TEST_DATE },
  );
  await assert.rejects(
    api.scanSiteQr(workerPrincipal(), { token: otherProject.token }),
    (error) => error.code === "NOT_EXPECTED_TODAY",
  );
});

test("worker QR is short-lived, own-worker issued and supervisor observed arrival is authoritative", async () => {
  const adapter = fakeAttendanceAdapter();
  const api = service(adapter);
  const qr = await api.issueWorkerQr(workerPrincipal());
  assert.match(qr.token, /^osw_/);
  assert.equal(qr.token.includes(WORKER_A), false);
  const result = await api.scanWorkerQr(companyPrincipal("Supervisor"), {
    projectId: PROJECT_A,
    token: qr.token,
    observedArrivalAt: "2026-09-16T06:25:00.000Z",
  });
  assert.equal(result.attendance.status, "on_time");
  assert.equal(result.attendance.effectiveArrivalAt, "2026-09-16T06:25:00.000Z");
  assert.equal(result.attendance.capturedAt, TEST_NOW);
  assert.equal(result.attendance.captureMethod, "supervisor_worker_qr");
});

test("supervisor after-midnight scan resolves the prior overnight shift and preserves capture time", async () => {
  const capturedAt = "2026-09-17T05:30:00.000Z";
  const observedAt = "2026-09-16T23:20:00.000Z";
  const adapter = fakeAttendanceAdapter({
    now: capturedAt,
    placement: {
      agreed_working_days: ["wednesday"],
      agreed_shift_start_time: "20:00",
      agreed_shift_finish_time: "05:00",
    },
  });
  const api = service(adapter, capturedAt);
  const qr = await api.issueWorkerQr(workerPrincipal());
  const result = await api.scanWorkerQr(companyPrincipal("Supervisor"), {
    projectId: PROJECT_A,
    token: qr.token,
    observedArrivalAt: observedAt,
  });
  assert.equal(result.attendance.workDate, TEST_DATE);
  assert.equal(result.attendance.effectiveArrivalAt, observedAt);
  assert.equal(result.attendance.capturedAt, capturedAt);
  assert.equal(result.attendance.minutesLate, 260);
});

test("supervisor retries key audit history from the final canonical arrival", async () => {
  const adapter = fakeAttendanceAdapter();
  const api = service(adapter);
  const qr = await api.issueWorkerQr(workerPrincipal());
  await api.scanWorkerQr(companyPrincipal("Supervisor"), {
    projectId: PROJECT_A,
    token: qr.token,
  });
  await api.scanWorkerQr(companyPrincipal("Supervisor"), {
    projectId: PROJECT_A,
    token: qr.token,
  });
  adapter.setNow("2026-09-16T06:36:00.000Z");
  await api.scanWorkerQr(companyPrincipal("Supervisor"), {
    projectId: PROJECT_A,
    token: qr.token,
  });
  const day = await adapter.getAttendanceDay(DAY_A);
  const events = day.attendance_events.filter(
    (event) => event.event_type === "supervisor_worker_qr_scan",
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].effective_at, TEST_NOW);
});

test("an earlier supervisor arrival changes attendance and creates one new audit event", async () => {
  const adapter = fakeAttendanceAdapter();
  const api = service(adapter);
  const qr = await api.issueWorkerQr(workerPrincipal());
  await api.scanWorkerQr(companyPrincipal("Supervisor"), {
    projectId: PROJECT_A,
    token: qr.token,
  });
  adapter.setNow("2026-09-16T06:36:00.000Z");
  await api.scanWorkerQr(companyPrincipal("Supervisor"), {
    projectId: PROJECT_A,
    token: qr.token,
    observedArrivalAt: "2026-09-16T06:25:00.000Z",
  });
  const day = await adapter.getAttendanceDay(DAY_A);
  const events = day.attendance_events.filter(
    (event) => event.event_type === "supervisor_worker_qr_scan",
  );
  assert.equal(day.effective_arrival_at, "2026-09-16T06:25:00.000Z");
  assert.equal(events.length, 2);
  assert.equal(events[1].metadata.previous.effectiveArrivalAt, TEST_NOW);
  assert.equal(
    events[1].metadata.new.effectiveArrivalAt,
    "2026-09-16T06:25:00.000Z",
  );
});

test("different authorised actors can attest the same canonical supervisor arrival", async () => {
  const adapter = fakeAttendanceAdapter();
  const api = service(adapter);
  const qr = await api.issueWorkerQr(workerPrincipal());
  const observedArrivalAt = "2026-09-16T06:25:00.000Z";
  await api.scanWorkerQr(companyPrincipal("Supervisor"), {
    projectId: PROJECT_A,
    token: qr.token,
    observedArrivalAt,
  });
  await api.scanWorkerQr({
    ...companyPrincipal("Supervisor"),
    authUserId: SUPERVISOR_A_2,
  }, {
    projectId: PROJECT_A,
    token: qr.token,
    observedArrivalAt,
  });
  const day = await adapter.getAttendanceDay(DAY_A);
  const events = day.attendance_events.filter(
    (event) => event.event_type === "supervisor_worker_qr_scan",
  );
  assert.equal(events.length, 2);
  assert.deepEqual(
    events.map((event) => event.actor_user_id),
    [SUPERVISOR_A, SUPERVISOR_A_2],
  );
});

test("a later supervisor retry cannot inherit another actor's earlier attestation", async () => {
  const adapter = fakeAttendanceAdapter();
  const api = service(adapter);
  const qr = await api.issueWorkerQr(workerPrincipal());
  await api.scanWorkerQr(companyPrincipal("Supervisor"), {
    projectId: PROJECT_A,
    token: qr.token,
  });
  adapter.setNow("2026-09-16T06:36:00.000Z");
  await api.scanWorkerQr({
    ...companyPrincipal("Supervisor"),
    authUserId: SUPERVISOR_A_2,
  }, {
    projectId: PROJECT_A,
    token: qr.token,
    observedArrivalAt: "2026-09-16T06:25:00.000Z",
  });
  adapter.setNow("2026-09-16T06:37:00.000Z");
  await api.scanWorkerQr(companyPrincipal("Supervisor"), {
    projectId: PROJECT_A,
    token: qr.token,
  });
  const day = await adapter.getAttendanceDay(DAY_A);
  const events = day.attendance_events.filter(
    (event) => event.event_type === "supervisor_worker_qr_scan",
  );
  assert.equal(events.length, 2);
  assert.deepEqual(
    events.map((event) => event.actor_user_id),
    [SUPERVISOR_A, SUPERVISOR_A_2],
  );
});

test("issuing a new worker QR revokes the previous active capability", async () => {
  const adapter = fakeAttendanceAdapter();
  const api = service(adapter);
  const first = await api.issueWorkerQr(workerPrincipal());
  const second = await api.issueWorkerQr(workerPrincipal());
  assert.equal(adapter.workerTokens.get(hashCapability(first.token)).revoked_at, TEST_NOW);
  assert.equal(adapter.workerTokens.get(hashCapability(second.token)).revoked_at, null);
  assert.equal(
    [...adapter.workerTokens.values()].filter((token) => !token.revoked_at).length,
    1,
  );
  await assert.rejects(
    api.scanWorkerQr(companyPrincipal("Supervisor"), {
      projectId: PROJECT_A,
      token: first.token,
    }),
    (error) => error.code === "INVALID_WORKER_QR",
  );
});

test("future supervisor observed arrival is rejected before persistence", async () => {
  const api = service();
  const qr = await api.issueWorkerQr(workerPrincipal());
  await assert.rejects(
    api.scanWorkerQr(companyPrincipal("Supervisor"), {
      projectId: PROJECT_A,
      token: qr.token,
      observedArrivalAt: "2026-09-16T06:36:00.001Z",
    }),
    (error) => error.code === "INVALID_OBSERVED_ARRIVAL",
  );
});

test("missing capture remains Needs review and no automatic No show is created", async () => {
  const result = await service().listProject(companyPrincipal(), PROJECT_A, {
    weekStart: WEEK_START,
  });
  assert.equal(result.attendance[0].status, "needs_review");
  assert.equal(result.attendance[0].reliabilityInput, null);
});

test("authorised manual No show and non-worker-fault outcomes require reasons and are audited", async () => {
  const adapter = fakeAttendanceAdapter();
  const api = service(adapter);
  await api.listProject(companyPrincipal(), PROJECT_A, { weekStart: WEEK_START });
  const noShow = await api.mark(companyPrincipal("Manager"), PROJECT_A, {
    placementId: PLACEMENT_A,
    workDate: TEST_DATE,
    status: "no_show",
    reason: "Worker did not attend",
  });
  assert.equal(noShow.status, "no_show");
  assert.equal(noShow.events.at(-1).type, "marked_no_show");
  const siteIssue = await api.mark(companyPrincipal(), PROJECT_A, {
    placementId: PLACEMENT_A,
    workDate: TEST_DATE,
    status: "non_worker_fault",
    reason: "Site not ready",
  });
  assert.equal(siteIssue.status, "non_worker_fault");
  assert.equal(siteIssue.reliabilityInput, null);
});

test("sent home is an exceptional outcome and requires an audit reason", async () => {
  const api = service();
  await assert.rejects(
    api.mark(companyPrincipal(), PROJECT_A, {
      placementId: PLACEMENT_A,
      workDate: TEST_DATE,
      status: "sent_home",
    }),
    (error) => error.code === "ATTENDANCE_REASON_REQUIRED",
  );
  const marked = await api.mark(companyPrincipal(), PROJECT_A, {
    placementId: PLACEMENT_A,
    workDate: TEST_DATE,
    status: "sent_home",
    reason: "Site closed early",
  });
  assert.equal(marked.status, "sent_home");
  assert.equal(marked.outcomeReason, "Site closed early");
});

test("Administrator can correct a historically valid day after placement completion", async () => {
  const terminalPlacement = placementRow({
    status: "completed",
    ended_at: "2026-09-16T17:00:00.000Z",
    placement_lifecycle_events: [{
      event_type: "completed",
      effective_at: "2026-09-16T00:00:00.000Z",
    }],
  });
  const adapter = fakeAttendanceAdapter({ placement: terminalPlacement });
  adapter.days.set(
    `${PLACEMENT_A}:${TEST_DATE}`,
    attendanceRow({ placements: terminalPlacement }),
  );
  const corrected = await service(adapter).mark(companyPrincipal(), PROJECT_A, {
    placementId: PLACEMENT_A,
    workDate: TEST_DATE,
    status: "no_show",
    reason: "Worker did not attend",
    correctionReason: "Historical attendance review",
  });
  assert.equal(corrected.status, "no_show");
  await assert.rejects(
    service(adapter).mark(companyPrincipal(), PROJECT_A, {
      placementId: PLACEMENT_A,
      workDate: "2026-09-17",
      status: "no_show",
      reason: "Worker did not attend",
      correctionReason: "Historical attendance review",
    }),
    (error) => error.code === "NOT_EXPECTED_TODAY",
  );
});

test("only an Administrator may submit an explicit attendance correction", async () => {
  const api = service();
  await assert.rejects(
    api.mark(companyPrincipal("Manager"), PROJECT_A, {
      placementId: PLACEMENT_A,
      workDate: TEST_DATE,
      status: "no_show",
      reason: "Absent",
      correctionReason: "Correcting a submitted site record",
    }),
    (error) => error.code === "ATTENDANCE_CORRECTION_ADMIN_REQUIRED",
  );
  const corrected = await api.mark(companyPrincipal(), PROJECT_A, {
    placementId: PLACEMENT_A,
    workDate: TEST_DATE,
    status: "no_show",
    reason: "Absent",
    correctionReason: "Correcting a submitted site record",
  });
  assert.equal(corrected.events.at(-1).type, "admin_correction");
});

test("workers cannot self-mark On time or forge ownership fields", async () => {
  const api = service();
  await assert.rejects(
    api.mark(workerPrincipal(), PROJECT_A, {
      placementId: PLACEMENT_A,
      workDate: TEST_DATE,
      status: "on_time",
      effectiveArrivalAt: TEST_NOW,
    }),
    (error) => ["ATTENDANCE_NOT_FOUND", "ATTENDANCE_PERMISSION_DENIED"].includes(error.code),
  );
});

test("late worker can submit a reason but another worker cannot", async () => {
  const adapter = fakeAttendanceAdapter();
  const day = attendanceRow({
    status: "late",
    effective_arrival_at: TEST_NOW,
    captured_at: TEST_NOW,
    minutes_late: 15,
    capture_method: "worker_site_qr",
  });
  adapter.days.set(`${PLACEMENT_A}:${TEST_DATE}`, day);
  const api = service(adapter);
  const updated = await api.submitLatenessReason(workerPrincipal(), DAY_A, {
    category: "Road traffic",
    explanation: "Collision on M1",
  });
  assert.equal(updated.latenessReason.category, "Road traffic");
  assert.equal(updated.effectiveArrivalAt, TEST_NOW);
  await assert.rejects(
    api.submitLatenessReason(workerPrincipal(WORKER_B), DAY_A, {
      category: "Road traffic",
    }),
    (error) => error.code === "ATTENDANCE_NOT_FOUND",
  );
});

test("lateness reason retries are idempotent and changed explanations remain auditable", async () => {
  const adapter = fakeAttendanceAdapter();
  adapter.days.set(
    `${PLACEMENT_A}:${TEST_DATE}`,
    attendanceRow({
      status: "late",
      effective_arrival_at: TEST_NOW,
      captured_at: TEST_NOW,
      minutes_late: 15,
    }),
  );
  const api = service(adapter);
  const first = await api.submitLatenessReason(workerPrincipal(), DAY_A, {
    category: "Road traffic",
    explanation: "Collision on M1",
  });
  const retry = await api.submitLatenessReason(workerPrincipal(), DAY_A, {
    category: "Road traffic",
    explanation: "Collision on M1",
  });
  assert.equal(first.latenessReason.revision, 1);
  assert.equal(retry.latenessReason.revision, 1);
  let stored = await adapter.getAttendanceDay(DAY_A);
  assert.equal(
    stored.attendance_events.filter(
      (event) => event.event_type === "worker_lateness_reason_submitted",
    ).length,
    1,
  );
  const changed = await api.submitLatenessReason(workerPrincipal(), DAY_A, {
    category: "Road traffic",
    explanation: "Collision cleared; diversion remains",
  });
  assert.equal(changed.latenessReason.revision, 2);
  stored = await adapter.getAttendanceDay(DAY_A);
  const events = stored.attendance_events.filter(
    (event) => event.event_type === "worker_lateness_reason_submitted",
  );
  assert.equal(events.length, 2);
  assert.equal(events[1].metadata.previous.explanation, "Collision on M1");
});

test("identical lateness retries preserve approved and rejected reviews", async () => {
  for (const outcome of ["approved_exception", "rejected"]) {
    const adapter = fakeAttendanceAdapter();
    adapter.days.set(
      `${PLACEMENT_A}:${TEST_DATE}`,
      attendanceRow({
        status: "late",
        effective_arrival_at: TEST_NOW,
        captured_at: TEST_NOW,
        minutes_late: 15,
      }),
    );
    const api = service(adapter);
    await api.submitLatenessReason(workerPrincipal(), DAY_A, {
      category: "Road traffic",
      explanation: "Collision on M1",
    });
    await api.reviewLatenessReason(
      companyPrincipal("Manager"),
      PROJECT_A,
      DAY_A,
      { outcome, reason: "Reviewed evidence" },
    );
    const before = await adapter.getAttendanceDay(DAY_A);
    const retry = await api.submitLatenessReason(workerPrincipal(), DAY_A, {
      category: "Road traffic",
      explanation: "Collision on M1",
    });
    const after = await adapter.getAttendanceDay(DAY_A);
    assert.equal(retry.latenessReason.revision, 1);
    assert.equal(retry.latenessReason.reviewOutcome, outcome);
    assert.equal(after.worker_reason_review_outcome, outcome);
    assert.equal(after.worker_reason_reviewed_at, before.worker_reason_reviewed_at);
    assert.equal(
      after.attendance_events.length,
      before.attendance_events.length,
    );
  }
});

test("changed lateness explanation after review creates a new pending revision", async () => {
  const adapter = fakeAttendanceAdapter();
  adapter.days.set(
    `${PLACEMENT_A}:${TEST_DATE}`,
    attendanceRow({
      status: "late",
      effective_arrival_at: TEST_NOW,
      captured_at: TEST_NOW,
      minutes_late: 15,
    }),
  );
  const api = service(adapter);
  await api.submitLatenessReason(workerPrincipal(), DAY_A, {
    category: "Road traffic",
    explanation: "Collision on M1",
  });
  await api.reviewLatenessReason(
    companyPrincipal("Manager"),
    PROJECT_A,
    DAY_A,
    { outcome: "approved_exception", reason: "Incident verified" },
  );
  const changed = await api.submitLatenessReason(workerPrincipal(), DAY_A, {
    category: "Road traffic",
    explanation: "Collision cleared; diversion remains",
  });
  const stored = await adapter.getAttendanceDay(DAY_A);
  assert.equal(changed.latenessReason.revision, 2);
  assert.equal(changed.latenessReason.reviewOutcome, "pending");
  assert.equal(stored.worker_reason_reviewed_by_user_id, null);
  assert.equal(stored.worker_reason_reviewed_at, null);
  assert.equal(
    stored.attendance_events.filter(
      (event) => event.event_type === "lateness_exception_approved",
    ).length,
    1,
  );
  assert.equal(
    stored.attendance_events.filter(
      (event) => event.event_type === "worker_lateness_reason_submitted",
    ).length,
    2,
  );
});

test("lateness review retries are idempotent and a changed decision is audited", async () => {
  const adapter = fakeAttendanceAdapter();
  const day = attendanceRow({
    status: "late",
    effective_arrival_at: TEST_NOW,
    captured_at: TEST_NOW,
    minutes_late: 15,
    worker_reason_category: "Road traffic",
    worker_reason_explanation: "Collision on M1",
    worker_reason_revision: 1,
    worker_reason_review_outcome: "pending",
  });
  adapter.days.set(`${PLACEMENT_A}:${TEST_DATE}`, day);
  const api = service(adapter);
  const approved = await api.reviewLatenessReason(
    companyPrincipal("Manager"),
    PROJECT_A,
    DAY_A,
    { outcome: "approved_exception", reason: "Incident verified" },
  );
  const retry = await api.reviewLatenessReason(
    companyPrincipal("Manager"),
    PROJECT_A,
    DAY_A,
    { outcome: "approved_exception", reason: "Incident verified" },
  );
  assert.equal(approved.latenessReason.reviewRevision, 1);
  assert.equal(retry.latenessReason.reviewRevision, 1);
  const rejected = await api.reviewLatenessReason(
    companyPrincipal("Manager"),
    PROJECT_A,
    DAY_A,
    { outcome: "rejected", reason: "Evidence was withdrawn" },
  );
  assert.equal(rejected.latenessReason.reviewRevision, 2);
  const stored = await adapter.getAttendanceDay(DAY_A);
  const reviewEvents = stored.attendance_events.filter((event) =>
    event.event_type.startsWith("lateness_exception_"),
  );
  assert.equal(reviewEvents.length, 2);
  assert.equal(reviewEvents[1].metadata.previous.outcome, "approved_exception");
});

test("Attendance Manager lateness review persists a non-penalising final input after submission", async () => {
  const adapter = fakeAttendanceAdapter();
  adapter.managers.set(PROJECT_A, { user_id: ATTENDANCE_MANAGER });
  const day = attendanceRow({
    status: "late",
    effective_arrival_at: TEST_NOW,
    captured_at: TEST_NOW,
    minutes_late: 15,
    worker_reason_category: "Public transport disruption",
    worker_reason_review_outcome: "pending",
  });
  adapter.days.set(`${PLACEMENT_A}:${TEST_DATE}`, day);
  const managerPrincipal = {
    type: "attendance_manager",
    authUserId: ATTENDANCE_MANAGER,
    serverAuthenticated: true,
  };
  const api = service(adapter);
  const reviewed = await api.reviewLatenessReason(
    managerPrincipal,
    PROJECT_A,
    DAY_A,
    { outcome: "approved_exception", reason: "Verified cancellation" },
  );
  assert.equal(reviewed.latenessReason.reviewOutcome, "approved_exception");
  await api.submitWeek(managerPrincipal, PROJECT_A, { weekStart: WEEK_START });
  const final = attendanceDayProjection(await adapter.getAttendanceDay(DAY_A));
  assert.equal(final.reliabilityInput.approvedLatenessException, true);
  assert.equal(final.effectiveArrivalAt, TEST_NOW);
});

test("weekly submission blocks unresolved days and links every resolved day atomically", async () => {
  const adapter = fakeAttendanceAdapter();
  const api = service(adapter);
  await api.listProject(companyPrincipal(), PROJECT_A, { weekStart: WEEK_START });
  await assert.rejects(
    api.submitWeek(companyPrincipal(), PROJECT_A, { weekStart: WEEK_START }),
    (error) => error.code === "ATTENDANCE_WEEK_UNRESOLVED",
  );
  await api.mark(companyPrincipal(), PROJECT_A, {
    placementId: PLACEMENT_A,
    workDate: TEST_DATE,
    status: "no_show",
    reason: "Worker did not attend",
  });
  const submitted = await api.submitWeek(companyPrincipal(), PROJECT_A, {
    weekStart: WEEK_START,
  });
  assert.equal(submitted.submission.status, "submitted");
  const day = await adapter.getAttendanceDay(DAY_A);
  assert.equal(day.weekly_submission_id, submitted.submission.id);
  assert.equal(day.finalised_at, TEST_NOW);
});

test("weekly submission blocks a submitted lateness reason until review resolves", async () => {
  const adapter = fakeAttendanceAdapter();
  adapter.days.set(
    `${PLACEMENT_A}:${TEST_DATE}`,
    attendanceRow({
      status: "late",
      effective_arrival_at: TEST_NOW,
      captured_at: TEST_NOW,
      minutes_late: 15,
      worker_reason_category: "Road traffic",
      worker_reason_revision: 1,
      worker_reason_review_outcome: "pending",
    }),
  );
  const api = service(adapter);
  await assert.rejects(
    api.submitWeek(companyPrincipal(), PROJECT_A, { weekStart: WEEK_START }),
    (error) => error.code === "ATTENDANCE_LATENESS_REVIEW_PENDING",
  );
  await api.reviewLatenessReason(companyPrincipal("Manager"), PROJECT_A, DAY_A, {
    outcome: "approved_exception",
    reason: "Incident verified",
  });
  const submitted = await api.submitWeek(companyPrincipal(), PROJECT_A, {
    weekStart: WEEK_START,
  });
  assert.equal(submitted.submission.status, "submitted");
});

test("a rejected lateness review also permits weekly submission", async () => {
  const adapter = fakeAttendanceAdapter();
  adapter.days.set(
    `${PLACEMENT_A}:${TEST_DATE}`,
    attendanceRow({
      status: "late",
      effective_arrival_at: TEST_NOW,
      captured_at: TEST_NOW,
      minutes_late: 15,
      worker_reason_category: "Road traffic",
      worker_reason_revision: 1,
      worker_reason_review_outcome: "pending",
    }),
  );
  const api = service(adapter);
  await api.reviewLatenessReason(companyPrincipal("Manager"), PROJECT_A, DAY_A, {
    outcome: "rejected",
    reason: "Reason not accepted",
  });
  const submitted = await api.submitWeek(companyPrincipal(), PROJECT_A, {
    weekStart: WEEK_START,
  });
  assert.equal(submitted.submission.status, "submitted");
});

test("weekly reopen and resubmit increments revision while exact retries stay idempotent", async () => {
  const adapter = fakeAttendanceAdapter();
  adapter.days.set(
    `${PLACEMENT_A}:${TEST_DATE}`,
    attendanceRow({
      status: "on_time",
      effective_arrival_at: TEST_NOW,
      captured_at: TEST_NOW,
      minutes_late: 5,
    }),
  );
  const api = service(adapter);
  const first = await api.submitWeek(companyPrincipal(), PROJECT_A, {
    weekStart: WEEK_START,
  });
  const retry = await api.submitWeek(companyPrincipal(), PROJECT_A, {
    weekStart: WEEK_START,
  });
  assert.equal(first.submission.revision, 1);
  assert.equal(retry.outcome, "already_submitted");
  assert.equal(retry.submission.revision, 1);
  await api.reopenWeek(companyPrincipal(), PROJECT_A, {
    weekStart: WEEK_START,
    reason: "Correct the reviewed week",
  });
  const resubmitted = await api.submitWeek(companyPrincipal(), PROJECT_A, {
    weekStart: WEEK_START,
  });
  assert.equal(resubmitted.submission.revision, 2);
  const stored = await adapter.getAttendanceDay(DAY_A);
  const submissionEvents = stored.attendance_events.filter(
    (event) => event.event_type === "week_submitted",
  );
  assert.deepEqual(
    submissionEvents.map((event) => event.metadata.submissionRevision),
    [1, 2],
  );
  assert.equal(
    stored.attendance_events.filter(
      (event) => event.event_type === "week_reopened",
    ).length,
    1,
  );
});

test("worker, Supervisor and unrelated company cannot submit or reopen weeks", async () => {
  const api = service();
  for (const principal of [
    workerPrincipal(),
    companyPrincipal("Supervisor"),
    companyPrincipal("Administrator", COMPANY_B),
  ]) {
    await assert.rejects(
      api.submitWeek(principal, PROJECT_A, { weekStart: WEEK_START }),
    );
  }
  await assert.rejects(
    api.reopenWeek(companyPrincipal("Manager"), PROJECT_A, {
      weekStart: WEEK_START,
      reason: "Correction",
    }),
    (error) => error.code === "ATTENDANCE_PERMISSION_DENIED",
  );
});

test("Administrator reopen preserves the original capture and adds audit history", async () => {
  const adapter = fakeAttendanceAdapter();
  const day = attendanceRow({
    status: "on_time",
    effective_arrival_at: TEST_NOW,
    captured_at: TEST_NOW,
    minutes_late: 5,
    attendance_events: [
      {
        id: "00000000-0000-4000-8000-000000000901",
        event_type: "worker_site_qr_scan",
        actor_type: "worker",
        recorded_at: TEST_NOW,
        effective_at: TEST_NOW,
        metadata: {},
      },
    ],
  });
  adapter.days.set(`${PLACEMENT_A}:${TEST_DATE}`, day);
  const api = service(adapter);
  await api.submitWeek(companyPrincipal(), PROJECT_A, { weekStart: WEEK_START });
  await api.reopenWeek(companyPrincipal(), PROJECT_A, {
    weekStart: WEEK_START,
    reason: "Correct observed arrival",
  });
  const reopened = await adapter.getAttendanceDay(DAY_A);
  assert.equal(reopened.finalised_at, null);
  assert.equal(
    reopened.attendance_events.some((event) => event.event_type === "worker_site_qr_scan"),
    true,
  );
  assert.equal(
    reopened.attendance_events.some((event) => event.event_type === "week_reopened"),
    true,
  );
});

test("Attendance Manager assignment is Administrator-only and supports pending invite state", async () => {
  const api = service();
  const assigned = await api.assignManager(companyPrincipal(), PROJECT_A, {
    managerUserId: ATTENDANCE_MANAGER,
    inviteEmail: "manager@example.com",
    displayName: "Site Manager",
  });
  assert.equal(assigned.status, "active");
  await assert.rejects(
    api.assignManager(companyPrincipal("Manager"), PROJECT_A, {
      inviteEmail: "new@example.com",
    }),
    (error) => error.code === "ATTENDANCE_PERMISSION_DENIED",
  );
});

test("attendance projections strip private company and worker data while retaining authorised GPS", () => {
  const projected = attendanceDayProjection(
    attendanceRow({
      private_company_notes: "internal",
      capture_latitude: 51.5,
      capture_longitude: -0.1,
      attendance_events: [
        {
          id: "event",
          event_type: "marked_late",
          actor_type: "company",
          metadata: {
            token_hash: "secret",
            private_minimum_day_rate: 999,
            reason: "Traffic",
          },
        },
      ],
    }),
    { company: true },
  );
  const serialized = JSON.stringify(projected);
  assert.equal(serialized.includes("internal"), false);
  assert.equal(serialized.includes("token_hash"), false);
  assert.equal(serialized.includes("private_minimum_day_rate"), false);
  assert.equal(projected.locationEvidence.latitude, 51.5);
});

test("Supabase attendance adapter is secret-key-only and fails closed", () => {
  assert.equal(createSupabaseAttendanceAdapter({ env: {} }).configured, false);
  let usedKey = "";
  const adapter = createSupabaseAttendanceAdapter({
    env: {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "public-key",
      SUPABASE_SECRET_KEY: "server-secret",
    },
    clientFactory(_url, key) {
      usedKey = key;
      return {};
    },
  });
  assert.equal(adapter.configured, true);
  assert.equal(usedKey, "server-secret");
});

test("attendance migration is atomic, history-preserving, RLS-scoped and least privilege", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "../supabase/migrations/202609160007_attendance_foundation.sql"),
    "utf8",
  );
  assert.match(sql, /^begin;/);
  assert.match(sql, /commit;\s*$/);
  for (const table of [
    "project_attendance_managers",
    "attendance_week_submissions",
    "attendance_days",
    "attendance_events",
    "attendance_site_qr_tokens",
    "worker_attendance_qr_tokens",
  ]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /attendance_days_placement_id_fkey[\s\S]*on delete restrict/i);
  assert.match(sql, /attendance_events_attendance_day_id_fkey[\s\S]*on delete restrict/i);
  assert.match(sql, /token_hash text not null/);
  assert.doesNotMatch(sql, /raw_token/i);
  assert.match(sql, /security definer[\s\S]*set search_path = pg_catalog, public/);
  assert.match(sql, /revoke all on table public\.attendance_days from public, anon, authenticated, service_role/);
  assert.doesNotMatch(sql, /grant (insert|update|delete)[^;]*attendance_days to authenticated/i);
  assert.match(sql, /status = 'needs_review'/);
  assert.doesNotMatch(sql, /no scan[\s\S]*no_show/i);
  assert.match(sql, /unique \(placement_id, work_date\)/i);
  assert.match(sql, /attendance_events_prevent_update/);
  assert.match(sql, /attendance_events_prevent_delete/);
  assert.match(sql, /current_user = 'postgres'[\s\S]*onsite\.attendance_event_maintenance/);
  assert.doesNotMatch(sql, /grant (update|delete)[^;]*attendance_events to service_role/i);
  assert.match(sql, /attendance_days_validate_links/);
  assert.match(sql, /ATTENDANCE_PROJECT_MISMATCH/);
  assert.match(sql, /ATTENDANCE_SUBMISSION_MISMATCH/);
});

test("migration centralises QR timing, grace policy and weekly review guards", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "../supabase/migrations/202609160007_attendance_foundation.sql"),
    "utf8",
  );
  assert.match(sql, /clock_timestamp\(\)/);
  assert.doesNotMatch(sql, /v_minutes <= 10/);
  assert.equal(
    (sql.match(/v_minutes <= public\.attendance_grace_minutes\(\)/g) || []).length,
    3,
  );
  assert.match(sql, /create or replace function public\.attendance_grace_minutes\(\)[\s\S]*select 10;/);
  assert.match(sql, /at time zone v_project\.timezone/);
  assert.match(sql, /token\.expires_at > now\(\)/);
  assert.match(sql, /token\.revoked_at is null/);
  assert.match(sql, /PROJECT_NOT_ACTIVE/);
  assert.match(sql, /ATTENDANCE_WEEK_UNRESOLVED/);
  assert.match(sql, /ATTENDANCE_FUTURE_DATE/);
  assert.match(sql, /ATTENDANCE_CORRECTION_REASON_REQUIRED/);
  assert.match(sql, /ATTENDANCE_CORRECTION_ADMIN_REQUIRED/);
  assert.match(sql, /worker_reason_review_outcome/);
  assert.match(sql, /approved_exception/);
  assert.match(sql, /scheduled_end_date/);
  assert.match(sql, /agreed_working_days/);
  assert.match(sql, /attendance_placement_terms/);
  assert.match(sql, /change_offer\.effective_date <= p_work_date/);
  assert.match(sql, /capture_method = 'expected_day'[\s\S]*effective_arrival_at is null/);
  assert.match(sql, /shift_start_snapshot = v_terms\.shift_start_time/);
  assert.match(sql, /attendance_arrival_minutes_late\([\s\S]*\)\nreturns integer\nlanguage sql\nstable/);
  assert.match(sql, /v_day\.finalised_at is not null[\s\S]*ATTENDANCE_SUBMITTED/);
  assert.match(sql, /ATTENDANCE_LATENESS_REVIEW_PENDING/);
});

test("migration preserves terminal history and validates cross-midnight shifts by work date", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "../supabase/migrations/202609160007_attendance_foundation.sql"),
    "utf8",
  );
  assert.match(sql, /attendance_placement_effective_end_date/);
  const effectiveEndFunction = sql.match(
    /create or replace function public\.attendance_placement_effective_end_date[\s\S]*?\$\$;/,
  )?.[0] || "";
  assert.match(
    effectiveEndFunction,
    /effective_at at time zone 'UTC'/,
  );
  assert.doesNotMatch(
    effectiveEndFunction,
    /effective_at at time zone v_timezone/,
  );
  assert.match(
    effectiveEndFunction,
    /'released', 'completed', 'worker_end_requested'/,
  );
  assert.match(
    effectiveEndFunction,
    /not v_has_terminal_evidence[\s\S]*ended_at at time zone v_timezone/,
  );
  const expectedFunction = sql.match(
    /create or replace function public\.attendance_placement_expected[\s\S]*?\$\$;/,
  )?.[0] || "";
  assert.doesNotMatch(expectedFunction, /status in \('upcoming', 'active'\)/);
  assert.match(expectedFunction, /attendance_placement_effective_end_date/);
  assert.match(sql, /attendance_timestamp_matches_work_date/);
  assert.match(sql, /attendance_resolve_placement_work_date/);
  assert.match(sql, /v_local::date = p_work_date \+ 1/);
  assert.match(sql, /greatest\(v_day_end, coalesce\(v_overnight_end, v_day_end\)\)/);
  assert.match(sql, /SITE_QR_WRONG_DATE/);
  assert.match(sql, /v_arrival := coalesce\(p_observed_arrival_at, v_capture\)/);
  assert.match(sql, /capture_method = 'expected_day'[\s\S]*effective_arrival_at is null/);
});

test("migration defaults site QR issuance to the project-local date without an overnight backshift", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "../supabase/migrations/202609160007_attendance_foundation.sql"),
    "utf8",
  );
  const issueFunction = sql.match(
    /create or replace function public\.issue_attendance_site_qr[\s\S]*?\$\$;/,
  )?.[0] || "";
  assert.match(
    issueFunction,
    /coalesce\(\s*p_work_date,\s*\(now\(\) at time zone v_project\.timezone\)::date\s*\)/,
  );
  assert.doesNotMatch(issueFunction, /v_local_now::date - 1/);
  assert.match(
    issueFunction,
    /project_id = p_project_id[\s\S]*work_date = v_work_date[\s\S]*revoked_at is null/,
  );
});

test("migration keys supervisor scans from actor and final canonical arrival", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "../supabase/migrations/202609160007_attendance_foundation.sql"),
    "utf8",
  );
  const scanFunction = sql.match(
    /create or replace function public\.capture_supervisor_worker_qr[\s\S]*?\$\$;/,
  )?.[0] || "";
  assert.match(
    scanFunction,
    /p_actor_user_id::text \|\| ':' \|\| md5\(v_day\.effective_arrival_at::text\)/,
  );
  assert.match(
    scanFunction,
    /v_actor_type, v_capture, v_day\.effective_arrival_at/,
  );
  assert.match(
    scanFunction,
    /if v_arrival = v_day\.effective_arrival_at then/,
  );
});

test("migration revisions make weekly submission and lateness retries auditable", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "../supabase/migrations/202609160007_attendance_foundation.sql"),
    "utf8",
  );
  assert.match(sql, /submission_revision integer not null default 0/);
  assert.match(sql, /submission_revision = attendance_week_submissions\.submission_revision \+ 1/);
  assert.match(sql, /'week_submitted:'[\s\S]*submission_revision/);
  assert.match(sql, /worker_reason_revision = worker_reason_revision \+ 1/);
  assert.match(sql, /worker_reason_review_revision = worker_reason_review_revision \+ 1/);
  assert.match(sql, /'already_submitted'[\s\S]*reason_revision/);
  assert.match(sql, /'already_reviewed'[\s\S]*review_revision/);
  assert.match(sql, /'previous', v_previous[\s\S]*'new'/);
  assert.match(sql, /'sent_home'\)[\s\S]*ATTENDANCE_REASON_REQUIRED/);
  const latenessFunction = sql.match(
    /create or replace function public\.submit_attendance_lateness_reason[\s\S]*?\$\$;/,
  )?.[0] || "";
  assert.match(
    latenessFunction,
    /worker_reason_explanation is not distinct from v_explanation then/,
  );
  assert.doesNotMatch(
    latenessFunction,
    /worker_reason_review_outcome = 'pending' then/,
  );
  assert.match(latenessFunction, /'review_outcome', v_day\.worker_reason_review_outcome/);
});

test("worker QR issuance is serialised and constrained to one active token", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "../supabase/migrations/202609160007_attendance_foundation.sql"),
    "utf8",
  );
  assert.match(sql, /worker_attendance_qr_tokens_one_active_idx[\s\S]*where revoked_at is null/);
  const issueFunction = sql.match(
    /create or replace function public\.issue_worker_attendance_qr[\s\S]*?\$\$;/,
  )?.[0] || "";
  assert.match(issueFunction, /from public\.worker_profiles[\s\S]*for update/);
  assert.match(issueFunction, /set revoked_at = now\(\)[\s\S]*insert into public\.worker_attendance_qr_tokens/);
});

test("project authority takes precedence over worker identity in attendance audit actors", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "../supabase/migrations/202609160007_attendance_foundation.sql"),
    "utf8",
  );
  const actorFunction = sql.match(
    /create or replace function public\.attendance_event_actor_type[\s\S]*?\$\$;/,
  )?.[0] || "";
  assert.ok(actorFunction.indexOf("= 'administrator'") < actorFunction.indexOf("worker_profiles"));
  assert.ok(actorFunction.indexOf("= 'supervisor'") < actorFunction.indexOf("worker_profiles"));
  assert.match(sql, /'worker_site_qr_scan'[\s\S]*'worker'/);
});

test("server and frontend expose canonical attendance integration points", () => {
  const server = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
  const attendanceServer = fs.readFileSync(
    path.join(__dirname, "../server-attendance.js"),
    "utf8",
  );
  assert.match(server, /createAttendanceService/);
  assert.match(server, /\/api\/attendance\/scan/);
  assert.equal(server.includes("attendance\\/week\\/submit"), true);
  assert.match(server, /attendance-manager/);
  assert.match(app, /syncCanonicalAttendance/);
  assert.match(app, /canonicalAttendance/);
  assert.match(app, /issueCanonicalSiteCode/);
  assert.match(app, /submitCanonicalAttendanceWeek/);
  assert.match(app, /canonicalLateReason/);
  assert.match(app, /\/lateness-reason/);
  assert.match(app, /filter\(\(record\) => !record\.canonicalAttendance\)/);
  assert.match(attendanceServer, /normalize_placement_lifecycle/);
  assert.match(attendanceServer, /QRCode\.toString/);
});
