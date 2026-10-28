// src/lib/attendance.js
// Date/time helpers for attendance. All "date" keys are Asia/Dhaka calendar
// dates as YYYY-MM-DD strings (for uniqueness). Timestamps are UTC Date objects.

const TZ = 'Asia/Dhaka';
const LATE_THRESHOLD_MINUTES = 9 * 60 + 30; // 09:30 local

/** Returns the current Asia/Dhaka calendar date as YYYY-MM-DD. */
export function todayKey(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: TZ }); // en-CA = YYYY-MM-DD
}

/** Returns the Asia/Dhaka calendar date for any Date as YYYY-MM-DD. */
export function dateKey(d) {
  return new Date(d).toLocaleDateString('en-CA', { timeZone: TZ });
}

/** Returns the local time-of-day in minutes since midnight (Asia/Dhaka). */
export function localMinutes(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const h = parseInt(parts.find((p) => p.type === 'hour').value, 10);
  const m = parseInt(parts.find((p) => p.type === 'minute').value, 10);
  return h * 60 + m;
}

/** Returns true if the given time is "late" (after 09:30 Asia/Dhaka). */
export function isLate(d = new Date()) {
  return localMinutes(d) > LATE_THRESHOLD_MINUTES;
}

/** Formats a UTC Date for display in Asia/Dhaka time. */
export function formatLocalTime(d, opts = { hour: '2-digit', minute: '2-digit', hour12: true }) {
  if (!d) return '—';
  return new Date(d).toLocaleTimeString('en-GB', { ...opts, timeZone: TZ });
}

/** Formats a date key (YYYY-MM-DD) for display. */
export function formatDateKey(key) {
  if (!key) return '—';
  // Parse as local date (not UTC) to avoid off-by-one
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

/** Returns the last N calendar date keys (oldest first), including today. */
export function lastNDays(n, end = new Date()) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    days.push(todayKey(d));
  }
  return days;
}

/** Computes the attendance status based on check-in time. */
export function computeStatus(checkInTime, hasLeave = false) {
  if (hasLeave) return 'leave';
  if (!checkInTime) return 'absent';
  return isLate(new Date(checkInTime)) ? 'late' : 'present';
}
