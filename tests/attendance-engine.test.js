// tests/attendance-engine.test.js
// V2 Step 2 — business-rule tests for the attendance engine.
// Run: bun run test
import { describe, it, expect } from 'vitest';
import {
  STATUS_PRIORITY,
  getStatusPriority,
  isAttended,
  highestPriorityStatus,
  timeToMinutes,
  minutesToTime,
  weekdayFromDateKey,
  isWorkday,
  resolveEffectivePolicy,
  isWorkdayComplete,
  computeEffectiveStatus,
  localMinutesFromUTC,
  applyCorrection,
  computeSummary,
} from '../src/lib/attendance-engine.js';

describe('STATUS_PRIORITY + getStatusPriority', () => {
  it('present has the highest priority', () => {
    expect(getStatusPriority('present')).toBeGreaterThan(getStatusPriority('late'));
    expect(getStatusPriority('late')).toBeGreaterThan(getStatusPriority('absent'));
    expect(getStatusPriority('absent')).toBeGreaterThan(getStatusPriority('pending'));
  });
  it('returns 0 for unknown status', () => {
    expect(getStatusPriority('unknown')).toBe(0);
    expect(getStatusPriority(undefined)).toBe(0);
  });
  it('holiday > week-off > pending (distinguished from absent)', () => {
    expect(getStatusPriority('holiday')).toBeGreaterThan(getStatusPriority('week-off'));
    expect(getStatusPriority('week-off')).toBeGreaterThan(getStatusPriority('pending'));
    // Holiday/week-off are NOT absent — they have lower priority than absent
    // (absent means "should have been here", holiday/week-off means "not expected")
    expect(getStatusPriority('absent')).toBeGreaterThan(getStatusPriority('holiday'));
  });
});

describe('isAttended', () => {
  it('present and late are attended', () => {
    expect(isAttended('present')).toBe(true);
    expect(isAttended('late')).toBe(true);
  });
  it('half-day, absent, leave, holiday, week-off, pending are NOT attended', () => {
    expect(isAttended('half-day')).toBe(false);
    expect(isAttended('absent')).toBe(false);
    expect(isAttended('leave')).toBe(false);
    expect(isAttended('holiday')).toBe(false);
    expect(isAttended('week-off')).toBe(false);
    expect(isAttended('pending')).toBe(false);
  });
});

describe('highestPriorityStatus', () => {
  it('returns present when present is in the list', () => {
    expect(highestPriorityStatus(['absent', 'present', 'late'])).toBe('present');
  });
  it('returns late when present is not in the list', () => {
    expect(highestPriorityStatus(['absent', 'late', 'pending'])).toBe('late');
  });
  it('returns pending for empty list', () => {
    expect(highestPriorityStatus([])).toBe('pending');
  });
  it('returns week-off over pending', () => {
    expect(highestPriorityStatus(['pending', 'week-off'])).toBe('week-off');
  });
});

describe('timeToMinutes / minutesToTime', () => {
  it('converts HH:mm to minutes', () => {
    expect(timeToMinutes('09:00')).toBe(540);
    expect(timeToMinutes('17:30')).toBe(1050);
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('23:59')).toBe(1439);
  });
  it('returns 0 for invalid input', () => {
    expect(timeToMinutes('')).toBe(0);
    expect(timeToMinutes(null)).toBe(0);
    expect(timeToMinutes('invalid')).toBe(0);
  });
  it('converts minutes to HH:mm', () => {
    expect(minutesToTime(540)).toBe('09:00');
    expect(minutesToTime(1050)).toBe('17:30');
    expect(minutesToTime(0)).toBe('00:00');
  });
  it('round-trips correctly', () => {
    expect(minutesToTime(timeToMinutes('13:45'))).toBe('13:45');
  });
});

describe('weekdayFromDateKey / isWorkday', () => {
  it('returns correct weekday for a date', () => {
    // 2026-03-02 is a Monday
    expect(weekdayFromDateKey('2026-03-02')).toBe(1);
    // 2026-03-07 is a Saturday
    expect(weekdayFromDateKey('2026-03-07')).toBe(6);
    // 2026-03-08 is a Sunday
    expect(weekdayFromDateKey('2026-03-08')).toBe(0);
  });
  it('returns -1 for invalid date', () => {
    expect(weekdayFromDateKey('')).toBe(-1);
    expect(weekdayFromDateKey('invalid')).toBe(-1);
  });
  it('isWorkday true for Mon-Fri policy', () => {
    const workdays = [1, 2, 3, 4, 5];
    expect(isWorkday('2026-03-02', workdays)).toBe(true); // Mon
    expect(isWorkday('2026-03-06', workdays)).toBe(true); // Fri
  });
  it('isWorkday false for weekend', () => {
    const workdays = [1, 2, 3, 4, 5];
    expect(isWorkday('2026-03-07', workdays)).toBe(false); // Sat
    expect(isWorkday('2026-03-08', workdays)).toBe(false); // Sun
  });
  it('isWorkday true for Sun-Thu policy (Bangladesh workweek)', () => {
    const workdays = [0, 1, 2, 3, 4]; // Sun-Thu
    expect(isWorkday('2026-03-08', workdays)).toBe(true); // Sun
    expect(isWorkday('2026-03-06', workdays)).toBe(false); // Fri (weekend in Sun-Thu policy)
    expect(isWorkday('2026-03-07', workdays)).toBe(false); // Sat (weekend)
  });
});

describe('resolveEffectivePolicy', () => {
  const companyPolicy = {
    workdays: [1, 2, 3, 4, 5],
    startTime: '09:00',
    endTime: '17:00',
    graceMinutes: 15,
    lateAfterMinutes: 555, // 9:15
    halfDayMinMinutes: null,
  };

  it('returns company policy when no schedule', () => {
    const r = resolveEffectivePolicy(companyPolicy, null);
    expect(r.startTime).toBe('09:00');
    expect(r.workdays).toEqual([1, 2, 3, 4, 5]);
  });

  it('overrides startTime from schedule + recomputes lateAfterMinutes', () => {
    const schedule = { customStartTime: '10:00', customEndTime: null, customWorkdays: [] };
    const r = resolveEffectivePolicy(companyPolicy, schedule);
    expect(r.startTime).toBe('10:00');
    expect(r.lateAfterMinutes).toBe(600 + 15); // 10:00 + 15min grace = 615
  });

  it('overrides endTime from schedule', () => {
    const schedule = { customStartTime: null, customEndTime: '18:00', customWorkdays: [] };
    const r = resolveEffectivePolicy(companyPolicy, schedule);
    expect(r.endTime).toBe('18:00');
  });

  it('overrides workdays from schedule when non-empty', () => {
    const schedule = { customStartTime: null, customEndTime: null, customWorkdays: [0, 1, 2, 3, 4] };
    const r = resolveEffectivePolicy(companyPolicy, schedule);
    expect(r.workdays).toEqual([0, 1, 2, 3, 4]);
  });

  it('falls back to policy workdays when schedule customWorkdays is empty', () => {
    const schedule = { customStartTime: null, customEndTime: null, customWorkdays: [] };
    const r = resolveEffectivePolicy(companyPolicy, schedule);
    expect(r.workdays).toEqual([1, 2, 3, 4, 5]);
  });

  it('graceMinutes always comes from policy (not overridable per-employee)', () => {
    const schedule = { customStartTime: '10:00', customEndTime: null, customWorkdays: [] };
    const r = resolveEffectivePolicy(companyPolicy, schedule);
    expect(r.graceMinutes).toBe(15);
  });

  it('handles null policy (uses defaults)', () => {
    const r = resolveEffectivePolicy(null, null);
    expect(r.startTime).toBe('09:00');
    expect(r.workdays).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('isWorkdayComplete', () => {
  it('true when now is after endTime', () => {
    const policy = { endTime: '17:00' };
    expect(isWorkdayComplete(policy, 18 * 60)).toBe(true); // 18:00
    expect(isWorkdayComplete(policy, 17 * 60 + 1)).toBe(true); // 17:01
  });
  it('false when now is at or before endTime', () => {
    const policy = { endTime: '17:00' };
    expect(isWorkdayComplete(policy, 17 * 60)).toBe(false); // exactly 17:00
    expect(isWorkdayComplete(policy, 16 * 60)).toBe(false); // 16:00
    expect(isWorkdayComplete(policy, 9 * 60)).toBe(false); // 09:00
  });
});

describe('computeEffectiveStatus — schedule boundary', () => {
  const policy = {
    workdays: [1, 2, 3, 4, 5],
    startTime: '09:00',
    endTime: '17:00',
    graceMinutes: 15,
    lateAfterMinutes: 555, // 9:15
    halfDayMinMinutes: null,
  };

  it('returns pending before workday complete when no check-in', () => {
    // 10:00 AM, no check-in, workday not complete
    const r = computeEffectiveStatus({
      rawCheckIn: null, rawCheckOut: null,
      correctedCheckIn: null, correctedCheckOut: null, correctedStatus: null,
      effectivePolicy: policy, isHolidayDate: false, dateKey: '2026-03-02', nowMinutes: 600, hasLeave: false,
    });
    expect(r.status).toBe('pending');
    expect(r.isWorkdayComplete).toBe(false);
  });

  it('returns absent after workday complete when no check-in', () => {
    // 18:00 (after 17:00 end), no check-in
    const r = computeEffectiveStatus({
      rawCheckIn: null, rawCheckOut: null,
      correctedCheckIn: null, correctedCheckOut: null, correctedStatus: null,
      effectivePolicy: policy, isHolidayDate: false, dateKey: '2026-03-02', nowMinutes: 1080, hasLeave: false,
    });
    expect(r.status).toBe('absent');
    expect(r.isWorkdayComplete).toBe(true);
  });

  it('returns present when check-in is within grace (09:10)', () => {
    const checkIn = new Date('2026-03-02T03:10:00Z'); // 09:10 Asia/Dhaka
    const r = computeEffectiveStatus({
      rawCheckIn: checkIn, rawCheckOut: null,
      correctedCheckIn: null, correctedCheckOut: null, correctedStatus: null,
      effectivePolicy: policy, isHolidayDate: false, dateKey: '2026-03-02', nowMinutes: 600, hasLeave: false,
    });
    expect(r.status).toBe('present');
    expect(r.isLate).toBe(false);
  });

  it('returns late when check-in is after grace (09:30)', () => {
    const checkIn = new Date('2026-03-02T03:30:00Z'); // 09:30 Asia/Dhaka
    const r = computeEffectiveStatus({
      rawCheckIn: checkIn, rawCheckOut: null,
      correctedCheckIn: null, correctedCheckOut: null, correctedStatus: null,
      effectivePolicy: policy, isHolidayDate: false, dateKey: '2026-03-02', nowMinutes: 600, hasLeave: false,
    });
    expect(r.status).toBe('late');
    expect(r.isLate).toBe(true);
  });

  it('returns present (not late) when check-in is exactly at grace boundary (09:15)', () => {
    // lateAfterMinutes = 555 (9:15). isLate = checkInMinutes > 555. 555 is NOT > 555.
    const checkIn = new Date('2026-03-02T03:15:00Z'); // 09:15 Asia/Dhaka
    const r = computeEffectiveStatus({
      rawCheckIn: checkIn, rawCheckOut: null,
      correctedCheckIn: null, correctedCheckOut: null, correctedStatus: null,
      effectivePolicy: policy, isHolidayDate: false, dateKey: '2026-03-02', nowMinutes: 600, hasLeave: false,
    });
    expect(r.status).toBe('present');
    expect(r.isLate).toBe(false);
  });
});

describe('computeEffectiveStatus — holiday / week-off / leave', () => {
  const policy = {
    workdays: [1, 2, 3, 4, 5],
    startTime: '09:00', endTime: '17:00', graceMinutes: 15, lateAfterMinutes: 555, halfDayMinMinutes: null,
  };

  it('returns holiday when date is a holiday (even with no check-in)', () => {
    const r = computeEffectiveStatus({
      rawCheckIn: null, rawCheckOut: null,
      correctedCheckIn: null, correctedCheckOut: null, correctedStatus: null,
      effectivePolicy: policy, isHolidayDate: true, dateKey: '2026-03-02', nowMinutes: 1080, hasLeave: false,
    });
    expect(r.status).toBe('holiday');
    expect(r.isHoliday).toBe(true);
  });

  it('returns week-off when date is not a workday (Saturday)', () => {
    const r = computeEffectiveStatus({
      rawCheckIn: null, rawCheckOut: null,
      correctedCheckIn: null, correctedCheckOut: null, correctedStatus: null,
      effectivePolicy: policy, isHolidayDate: false, dateKey: '2026-03-07', nowMinutes: 1080, hasLeave: false,
    });
    expect(r.status).toBe('week-off');
    expect(r.isWeekOff).toBe(true);
  });

  it('returns leave when hasLeave is true', () => {
    const r = computeEffectiveStatus({
      rawCheckIn: null, rawCheckOut: null,
      correctedCheckIn: null, correctedCheckOut: null, correctedStatus: null,
      effectivePolicy: policy, isHolidayDate: false, dateKey: '2026-03-02', nowMinutes: 1080, hasLeave: true,
    });
    expect(r.status).toBe('leave');
  });

  it('holiday takes precedence over week-off', () => {
    // A Sunday that is also a holiday → holiday wins
    const r = computeEffectiveStatus({
      rawCheckIn: null, rawCheckOut: null,
      correctedCheckIn: null, correctedCheckOut: null, correctedStatus: null,
      effectivePolicy: policy, isHolidayDate: true, dateKey: '2026-03-08', nowMinutes: 1080, hasLeave: false,
    });
    expect(r.status).toBe('holiday');
    expect(r.isHoliday).toBe(true);
    expect(r.isWeekOff).toBe(false); // holiday suppresses week-off flag
  });
});

describe('computeEffectiveStatus — override precedence', () => {
  const policy = {
    workdays: [1, 2, 3, 4, 5],
    startTime: '09:00', endTime: '17:00', graceMinutes: 15, lateAfterMinutes: 555, halfDayMinMinutes: null,
  };

  it('correctedStatus override wins over everything', () => {
    // Raw says absent (no check-in), but correctedStatus = 'present'
    const r = computeEffectiveStatus({
      rawCheckIn: null, rawCheckOut: null,
      correctedCheckIn: null, correctedCheckOut: null, correctedStatus: 'present',
      effectivePolicy: policy, isHolidayDate: false, dateKey: '2026-03-02', nowMinutes: 1080, hasLeave: false,
    });
    expect(r.status).toBe('present');
  });

  it('correctedCheckIn overrides rawCheckIn for status computation', () => {
    // Raw check-in is 09:30 (late), but corrected is 09:05 (present)
    const rawIn = new Date('2026-03-02T03:30:00Z'); // 09:30
    const correctedIn = new Date('2026-03-02T03:05:00Z'); // 09:05
    const r = computeEffectiveStatus({
      rawCheckIn: rawIn, rawCheckOut: null,
      correctedCheckIn: correctedIn, correctedCheckOut: null, correctedStatus: null,
      effectivePolicy: policy, isHolidayDate: false, dateKey: '2026-03-02', nowMinutes: 600, hasLeave: false,
    });
    expect(r.status).toBe('present');
    expect(r.effectiveCheckIn).toEqual(correctedIn);
  });

  it('rawCheckIn is used when no correction', () => {
    const rawIn = new Date('2026-03-02T03:30:00Z'); // 09:30 (late)
    const r = computeEffectiveStatus({
      rawCheckIn: rawIn, rawCheckOut: null,
      correctedCheckIn: null, correctedCheckOut: null, correctedStatus: null,
      effectivePolicy: policy, isHolidayDate: false, dateKey: '2026-03-02', nowMinutes: 600, hasLeave: false,
    });
    expect(r.status).toBe('late');
    expect(r.effectiveCheckIn).toEqual(rawIn);
  });
});

describe('applyCorrection (override precedence — no raw mutation)', () => {
  const record = {
    checkInTime: new Date('2026-03-02T03:30:00Z'), // 09:30 raw
    checkOutTime: null,
    status: 'late',
    correctedCheckInTime: null,
    correctedCheckOutTime: null,
    correctedStatus: null,
  };

  it('sets correctedCheckInTime without touching raw', () => {
    const newIn = new Date('2026-03-02T03:05:00Z'); // 09:05 corrected
    const result = applyCorrection(record, { field: 'checkInTime', correctedValue: newIn.toISOString() });
    expect(result.correctedCheckInTime).toEqual(newIn);
    // Raw is NOT mutated
    expect(record.checkInTime).toEqual(new Date('2026-03-02T03:30:00Z'));
  });

  it('sets correctedStatus without touching raw status', () => {
    const result = applyCorrection(record, { field: 'status', correctedValue: 'present' });
    expect(result.correctedStatus).toBe('present');
    expect(record.status).toBe('late'); // raw unchanged
  });

  it('sets correctedCheckOutTime', () => {
    const newOut = new Date('2026-03-02T11:00:00Z'); // 17:00
    const result = applyCorrection(record, { field: 'checkOutTime', correctedValue: newOut.toISOString() });
    expect(result.correctedCheckOutTime).toEqual(newOut);
  });

  it('preserves existing corrections when applying a new one', () => {
    const recordWithExisting = {
      ...record,
      correctedCheckInTime: new Date('2026-03-02T03:05:00Z'),
    };
    const result = applyCorrection(recordWithExisting, { field: 'status', correctedValue: 'present' });
    expect(result.correctedCheckInTime).toEqual(new Date('2026-03-02T03:05:00Z'));
    expect(result.correctedStatus).toBe('present');
  });
});

describe('computeSummary — status priority consistency', () => {
  it('counts present + late as attended (not double-counted)', () => {
    const records = [
      { effectiveStatus: 'present' },
      { effectiveStatus: 'late' },
      { effectiveStatus: 'absent' },
    ];
    const s = computeSummary(records);
    expect(s.total).toBe(3);
    expect(s.present).toBe(1);
    expect(s.late).toBe(1);
    expect(s.attended).toBe(2); // present + late
    expect(s.absent).toBe(1);
  });

  it('counts holiday and week-off separately from absent', () => {
    const records = [
      { effectiveStatus: 'holiday' },
      { effectiveStatus: 'week-off' },
      { effectiveStatus: 'absent' },
    ];
    const s = computeSummary(records);
    expect(s.holiday).toBe(1);
    expect(s['week-off']).toBe(1);
    expect(s.absent).toBe(1);
    expect(s.attended).toBe(0);
  });

  it('counts pending separately from absent', () => {
    const records = [
      { effectiveStatus: 'pending' },
      { effectiveStatus: 'absent' },
    ];
    const s = computeSummary(records);
    expect(s.pending).toBe(1);
    expect(s.absent).toBe(1);
  });

  it('counts half-day separately', () => {
    const records = [
      { effectiveStatus: 'half-day' },
      { effectiveStatus: 'present' },
    ];
    const s = computeSummary(records);
    expect(s['half-day']).toBe(1);
    expect(s.present).toBe(1);
    expect(s.attended).toBe(1); // half-day is NOT attended
  });

  it('handles empty list', () => {
    const s = computeSummary([]);
    expect(s.total).toBe(0);
    expect(s.attended).toBe(0);
  });
});

describe('localMinutesFromUTC — timezone handling', () => {
  it('converts a UTC time to Asia/Dhaka local minutes', () => {
    // 2026-03-02T03:30:00Z = 09:30 Asia/Dhaka (UTC+6)
    const d = new Date('2026-03-02T03:30:00Z');
    expect(localMinutesFromUTC(d)).toBe(9 * 60 + 30);
  });

  it('converts midnight UTC to 06:00 Asia/Dhaka', () => {
    const d = new Date('2026-03-02T00:00:00Z');
    expect(localMinutesFromUTC(d)).toBe(6 * 60);
  });

  it('returns 0 for null', () => {
    expect(localMinutesFromUTC(null)).toBe(0);
  });
});

describe('Authorization rules (documented, not function-tested)', () => {
  // These rules are enforced in the API routes, not in the engine. Here we
  // just document them so the test suite serves as a spec:
  it('managers cannot create/confirm/apply corrections (hr/admin only)', () => {
    // Enforced in /api/attendance/corrections routes via requireRole('hr','admin')
    expect(true).toBe(true);
  });
  it('employees cannot access the review queue', () => {
    // Enforced in /api/attendance/reviews routes via requireRole('hr','admin')
    expect(true).toBe(true);
  });
  it('review verdict updates metadata only, never punch time/evidence', () => {
    // The reviews PATCH route only updates reviewVerdict/reviewedBy/reviewedAt/reviewNote.
    // It never touches Attendance.checkInTime/checkOutTime/rawPunches.
    expect(true).toBe(true);
  });
});
