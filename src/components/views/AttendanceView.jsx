// src/components/views/AttendanceView.jsx
// Daily Attendance. Self view (check-in/out + 7-day history) for all roles.
// Team view (today's status for direct reports / all) for manager/hr/admin.
'use client';
import { useCallback, useEffect, useState } from 'react';

const STATUS_STYLES = {
  present: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  late: 'bg-amber-100 text-amber-700 border-amber-200',
  absent: 'bg-rose-100 text-rose-700 border-rose-200',
  leave: 'bg-violet-100 text-violet-700 border-violet-200',
  'half-day': 'bg-cyan-100 text-cyan-700 border-cyan-200',
};

function Avatar({ name, color, size = 36 }) {
  const initials = (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold shrink-0"
      style={{ backgroundColor: color || '#6b7280', width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}

function formatTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Dhaka',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDay(key) {
  if (!key) return '—';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

export default function AttendanceView({ user, employee }) {
  const canSeeTeam = user.role === 'manager' || user.role === 'hr' || user.role === 'admin';
  const [tab, setTab] = useState('self');

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Daily Attendance</h2>
        <p className="text-sm text-slate-500 mt-1">Check in/out · Asia/Dhaka timezone</p>
      </div>

      {canSeeTeam && (
        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => setTab('self')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
              tab === 'self'
                ? 'bg-violet-600 text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            My attendance
          </button>
          <button
            type="button"
            onClick={() => setTab('team')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
              tab === 'team'
                ? 'bg-violet-600 text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {user.role === 'manager' ? 'My team' : 'All employees'}
          </button>
        </div>
      )}

      {tab === 'self' ? <SelfView /> : <TeamView role={user.role} />}
    </div>
  );
}

function SelfView() {
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');
  const [today, setToday] = useState(null);
  const [history, setHistory] = useState([]);
  const [now, setNow] = useState(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/attendance?scope=self&days=7', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setToday(data.todayRecord);
      setHistory(data.history || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // Update the "current time" display every second
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clock);
  }, [load]);

  async function handleAction(action) {
    setActing(true);
    setError('');
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?._ || 'Action failed');
      } else {
        await load();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setActing(false);
    }
  }

  const checkedIn = !!today?.checkInTime;
  const checkedOut = !!today?.checkOutTime;

  if (loading) {
    return <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      {/* Today card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Today</h3>
            <p className="text-sm text-slate-500">
              {now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Dhaka' })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-mono font-bold text-slate-900">
              {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Dhaka' })}
            </p>
            <p className="text-xs text-slate-400">Asia/Dhaka</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-500 uppercase">Check in</p>
            <p className="text-lg font-semibold text-slate-900 mt-1">{formatTime(today?.checkInTime)}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-500 uppercase">Check out</p>
            <p className="text-lg font-semibold text-slate-900 mt-1">{formatTime(today?.checkOutTime)}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-500 uppercase">Status</p>
            <span className={`inline-block mt-1 text-xs font-semibold px-2 py-1 rounded border ${STATUS_STYLES[today?.status || 'absent']}`}>
              {today?.status || 'absent'}
            </span>
          </div>
        </div>

        {error && (
          <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2 mb-4">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          {!checkedIn && (
            <button
              type="button"
              onClick={() => handleAction('check-in')}
              disabled={acting}
              className="flex-1 px-4 py-3 rounded-md bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
            >
              {acting ? 'Checking in…' : 'Check in'}
            </button>
          )}
          {checkedIn && !checkedOut && (
            <button
              type="button"
              onClick={() => handleAction('check-out')}
              disabled={acting}
              className="flex-1 px-4 py-3 rounded-md bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-60"
            >
              {acting ? 'Checking out…' : 'Check out'}
            </button>
          )}
          {checkedIn && checkedOut && (
            <div className="flex-1 text-center text-sm text-slate-500 py-3">
              You've completed attendance for today.
            </div>
          )}
        </div>
      </div>

      {/* 7-day history */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">Last 7 days</h3>
        </div>
        <ul className="divide-y divide-slate-100">
          {history.slice().reverse().map((h) => (
            <li key={h.date} className="flex items-center justify-between px-6 py-3">
              <span className="text-sm text-slate-700">{formatDay(h.date)}</span>
              <div className="flex items-center gap-4">
                <span className="text-xs text-slate-500">{formatTime(h.checkInTime)} → {formatTime(h.checkOutTime)}</span>
                <span className={`text-xs font-semibold px-2 py-1 rounded border ${STATUS_STYLES[h.status] || STATUS_STYLES.absent}`}>
                  {h.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function TeamView({ role }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [team, setTeam] = useState([]);
  const [summary, setSummary] = useState(null);
  const [date, setDate] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/attendance?scope=team', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTeam(data.team || []);
      setSummary(data.summary || null);
      setDate(data.date || '');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (loading) {
    return <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">Loading…</div>;
  }

  if (error) {
    return <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">{error}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="Present" value={summary.present} total={summary.total} color="emerald" />
          <SummaryCard label="Late" value={summary.late} total={summary.total} color="amber" />
          <SummaryCard label="Absent" value={summary.absent} total={summary.total} color="rose" />
          <SummaryCard label="On leave" value={summary.leave} total={summary.total} color="violet" />
        </div>
      )}

      {/* Team list */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            {role === 'manager' ? 'My team' : 'All employees'} — {date}
          </h3>
          <button
            type="button"
            onClick={load}
            className="text-xs text-violet-600 hover:text-violet-700 font-medium"
          >
            Refresh
          </button>
        </div>
        {team.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            {role === 'manager' ? 'No direct reports.' : 'No employees found.'}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {team.map((t) => (
              <li key={t.employee.id} className="flex items-center gap-3 px-6 py-3">
                <Avatar name={t.employee.fullName} color={t.employee.avatarColor} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900 truncate">{t.employee.fullName}</span>
                    <span className="text-xs text-slate-400">{t.employee.employeeCode}</span>
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {t.employee.designation} · {t.employee.department}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-slate-500">
                    {formatTime(t.attendance?.checkInTime)} → {formatTime(t.attendance?.checkOutTime)}
                  </div>
                  <span className={`inline-block mt-0.5 text-xs font-semibold px-2 py-0.5 rounded border ${STATUS_STYLES[t.attendance?.status] || STATUS_STYLES.absent}`}>
                    {t.attendance?.status || 'absent'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, total, color }) {
  const colorMap = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    violet: 'bg-violet-50 text-violet-700 border-violet-200',
  };
  return (
    <div className={`rounded-lg border p-4 ${colorMap[color] || colorMap.emerald}`}>
      <p className="text-xs uppercase font-semibold opacity-80">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}<span className="text-sm font-normal opacity-60">/{total}</span></p>
    </div>
  );
}
