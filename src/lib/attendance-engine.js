// src/lib/attendance-engine.js
// V2 Step 2 — pure functions for attendance policy resolution + status computation.
// No DB, no React, no side effects — fully unit-testable with Vitest.
//
// Status priority (consistent for lists/dashboard/reporting):
//   present > late > half-day > absent > leave > holiday > week-off > pending
//
// Rules:
//   - Late is included in Present for summary counts (present + late = "attended")
//   - Late is never counted twice
//   - A day is never Absent until the configured workday is complete
//   - Holiday/week-off are distinguished from absent

export const STATUS_PRIORITY = {
  present: 8,
  late: 7,
  'half-day': 6,
  absent: 5,
  leave: 4,
  holiday: 3,
  'week-off': 2,
  pending: 1,
};

/** Returns the priority rank of a status (higher = more "present"). 0 if unknown. */
export function getStatusPriority(status) {
  return STATUS_PRIORITY[status] || 0;
}

/** True if the status counts as "attended" (present or late). */
export function isAttended(status) {
  return status === 'present' || status === 'late';
}

/**
 * Returns the "highest priority" status from a list (e.g., for aggregating a week).
 * Useful when a day has multiple records or a correction changed the status.
 */
export function highestPriorityStatus(statuses) {
  if (!statuses || statuses.length === 0) return 'pending';
  return statuses.reduce((best, s) =>
    getStatusPriority(s) > getStatusPriority(best) ? s : best
  , 'pending');
}

/**
 * Converts "HH:mm" to minutes since midnight. Returns 0 on invalid input.
 */
export function timeToMinutes(t) {
  if (!t || typeof t !== 'string') return 0;
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/**
 * Converts minutes since midnight to "HH:mm".
 */
export function minutesToTime(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Returns the weekday number (0=Sun ... 6=Sat) for a YYYY-MM-DD date string.
 */
export function weekdayFromDateKey(dateKey) {
  if (!dateKey) return -1;
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return -1;
  return new Date(y, m - 1, d).getDay();
}

/**
 * Checks if a date key is a workday per the given workdays array.
 * @param {string} dateKey - YYYY-MM-DD
 * @param {number[]} workdays - e.g. [1,2,3,4,5] for Mon-Fri
 */
export function isWorkday(dateKey, workdays) {
  const dow = weekdayFromDateKey(dateKey);
  return workdays.includes(dow);
}

/**
 * Resolves the effective policy for an employee on a given date.
 * Merges the company policy with any employee schedule overrides.
 *
 * @param {object|null} policy - the active company AttendancePolicy doc
 * @param {object|null} schedule - the employee's EmployeeSchedule doc (may have overrides)
 * @returns {object} merged policy: { workdays, startTime, endTime, graceMinutes, lateAfterMinutes, halfDayMinMinutes }
 */
export function resolveEffectivePolicy(policy, schedule) {
  const base = policy || {
    workdays: [1, 2, 3, 4, 5],
    startTime: '09:00',
    endTime: '17:00',
    graceMinutes: 15,
    lateAfterMinutes: timeToMinutes('09:00') + 15,
    halfDayMinMinutes: null,
  };

  // If no schedule, use base policy as-is.
  if (!schedule) return { ...base };

  // If schedule has a customStartTime, recompute lateAfterMinutes from it.
  const startTime = schedule.customStartTime || base.startTime;
  const endTime = schedule.customEndTime || base.endTime;
  const workdays = schedule.customWorkdays && schedule.customWorkdays.length > 0
    ? schedule.customWorkdays
    : base.workdays;
  const graceMinutes = base.graceMinutes; // grace comes from policy, not overridable per-employee
  const lateAfterMinutes = timeToMinutes(startTime) + graceMinutes;

  return {
    workdays,
    startTime,
    endTime,
    graceMinutes,
    lateAfterMinutes,
    halfDayMinMinutes: base.halfDayMinMinutes,
  };
}

/**
 * Checks if the workday is complete (current local time is after endTime).
 *
 * @param {object} effectivePolicy - { endTime: "HH:mm" }
 * @param {number} nowMinutes - current local time in minutes since midnight
 * @returns {boolean}
 */
export function isWorkdayComplete(effectivePolicy, nowMinutes) {
  const end = timeToMinutes(effectivePolicy.endTime);
  return nowMinutes > end;
}

/**
 * Computes the attendance status for a day. This is the single source of truth.
 *
 * @param {object} params
 *   - rawCheckIn: Date|null — the raw punch-in time (immutable evidence)
 *   - rawCheckOut: Date|null — the raw punch-out time
 *   - correctedCheckIn: Date|null — correction override (null = use raw)
 *   - correctedCheckOut: Date|null
 *   - correctedStatus: string|null — manual status override
 *   - effectivePolicy: { workdays, startTime, endTime, graceMinutes, lateAfterMinutes, halfDayMinMinutes }
 *   - isHolidayDate: boolean — is this date a holiday?
 *   - dateKey: string — YYYY-MM-DD
 *   - nowMinutes: number — current local time in minutes (for "is workday complete?" check)
 *   - hasLeave: boolean — is there an approved leave for this day?
 * @returns {{ status: string, isLate: boolean, isHoliday: boolean, isWeekOff: boolean, isWorkdayComplete: boolean, effectiveCheckIn: Date|null, effectiveCheckOut: Date|null }}
 */
export function computeEffectiveStatus(params) {
  const {
    rawCheckIn, rawCheckOut,
    correctedCheckIn, correctedCheckOut, correctedStatus,
    effectivePolicy, isHolidayDate, dateKey, nowMinutes, hasLeave,
  } = params;

  const effectiveCheckIn = correctedCheckIn ?? rawCheckIn;
  const effectiveCheckOut = correctedCheckOut ?? rawCheckOut;
  const isHoliday = !!isHolidayDate;
  const isWeekOff = !isWorkday(dateKey, effectivePolicy.workdays);
  const complete = isWorkdayComplete(effectivePolicy, nowMinutes);

  // Manual status override wins (but we still report the computed flags).
  if (correctedStatus) {
    return {
      status: correctedStatus,
      isLate: false,
      isHoliday,
      isWeekOff,
      isWorkdayComplete: complete,
      effectiveCheckIn,
      effectiveCheckOut,
    };
  }

  // Holiday takes precedence over everything (except manual override).
  if (isHoliday) {
    return { status: 'holiday', isLate: false, isHoliday: true, isWeekOff: false, isWorkdayComplete: complete, effectiveCheckIn, effectiveCheckOut };
  }

  // Week-off (not a workday).
  if (isWeekOff) {
    return { status: 'week-off', isLate: false, isHoliday: false, isWeekOff: true, isWorkdayComplete: complete, effectiveCheckIn, effectiveCheckOut };
  }

  // Approved leave for this day.
  if (hasLeave) {
    return { status: 'leave', isLate: false, isHoliday: false, isWeekOff: false, isWorkdayComplete: complete, effectiveCheckIn, effectiveCheckOut };
  }

  // Has check-in: present or late.
  if (effectiveCheckIn) {
    const checkInMinutes = localMinutesFromUTC(effectiveCheckIn);
    const isLate = checkInMinutes > effectivePolicy.lateAfterMinutes;
    // Half-day logic: if halfDayMinMinutes is set and worked time is short.
    if (effectivePolicy.halfDayMinMinutes != null && effectiveCheckOut) {
      const workedMin = localMinutesFromUTC(effectiveCheckOut) - checkInMinutes;
      if (workedMin > 0 && workedMin < effectivePolicy.halfDayMinMinutes) {
        return { status: 'half-day', isLate, isHoliday: false, isWeekOff: false, isWorkdayComplete: complete, effectiveCheckIn, effectiveCheckOut };
      }
    }
    return { status: isLate ? 'late' : 'present', isLate, isHoliday: false, isWeekOff: false, isWorkdayComplete: complete, effectiveCheckIn, effectiveCheckOut };
  }

  // No check-in. If workday not complete yet, it's "pending" (not absent).
  if (!complete) {
    return { status: 'pending', isLate: false, isHoliday: false, isWeekOff: false, isWorkdayComplete: false, effectiveCheckIn, effectiveCheckOut };
  }

  // No check-in and workday complete → absent.
  return { status: 'absent', isLate: false, isHoliday: false, isWeekOff: false, isWorkdayComplete: true, effectiveCheckIn, effectiveCheckOut };
}

/**
 * Returns the local (Asia/Dhaka) minutes-since-midnight for a UTC Date.
 * Uses Intl to convert to the target timezone.
 */
export function localMinutesFromUTC(d) {
  if (!d) return 0;
  const date = new Date(d);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const h = parseInt(parts.find((p) => p.type === 'hour').value, 10);
  const m = parseInt(parts.find((p) => p.type === 'minute').value, 10);
  return h * 60 + m;
}

/**
 * Applies a correction to produce the new effective values WITHOUT mutating raw.
 * Returns { effectiveCheckIn, effectiveCheckOut, effectiveStatus } — the caller
 * writes these to the Attendance.correctedX fields.
 *
 * @param {object} record - { checkInTime, checkOutTime, status, correctedCheckInTime, correctedCheckOutTime, correctedStatus }
 * @param {object} correction - { field: 'checkInTime'|'checkOutTime'|'status', correctedValue: string }
 * @returns {object} new effective values
 */
export function applyCorrection(record, correction) {
  const result = {
    correctedCheckInTime: record.correctedCheckInTime || null,
    correctedCheckOutTime: record.correctedCheckOutTime || null,
    correctedStatus: record.correctedStatus || null,
  };

  if (correction.field === 'checkInTime') {
    result.correctedCheckInTime = new Date(correction.correctedValue);
  } else if (correction.field === 'checkOutTime') {
    result.correctedCheckOutTime = new Date(correction.correctedValue);
  } else if (correction.field === 'status') {
    result.correctedStatus = correction.correctedValue;
  }

  return result;
}

/**
 * Computes summary counts from a list of attendance records, using the
 * CONSISTENT status priority. Late is included in Present (attended).
 * Absent is only counted when the workday is complete.
 *
 * @param {Array} records - array of { effectiveStatus, isWorkdayComplete }
 * @returns {object} { total, attended (present+late), present, late, absent, halfDay, leave, holiday, weekOff, pending }
 */
export function computeSummary(records) {
  const summary = {
    total: records.length,
    attended: 0,
    present: 0,
    late: 0,
    absent: 0,
    'half-day': 0,
    leave: 0,
    holiday: 0,
    'week-off': 0,
    pending: 0,
  };
  for (const r of records) {
    const s = r.effectiveStatus || r.status || 'pending';
    if (summary[s] !== undefined) summary[s]++;
    if (isAttended(s)) summary.attended++;
  }
  return summary;
}
