// src/components/views/DashboardView.jsx
// Role-aware dashboard with Recharts visualizations.
//   employee  → personal attendance rate, leave balance, 7-day trend, recent requests
//   manager   → team attendance today (donut), pending approvals, team leave usage (bar)
//   hr/admin  → company attendance by dept (bar), leave distribution (pie), headcount
'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart, Bar,
  PieChart, Pie,
  Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  Legend,
} from 'recharts';

const STATUS_COLORS = {
  present: '#10b981',
  late: '#f59e0b',
  absent: '#ef4444',
  leave: '#8b5cf6',
};
const LEAVE_COLORS = {
  casual: '#f59e0b',
  sick: '#ef4444',
  earned: '#10b981',
  unpaid: '#6b7280',
};
const LEAVE_STATUS_COLORS = {
  pending_manager: '#f59e0b',
  pending_hr: '#06b6d4',
  approved: '#10b981',
  rejected: '#ef4444',
  cancelled: '#9ca3af',
};

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export default function DashboardView({ user, employee, onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/dashboard', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setData(d);
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
    return <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">Loading dashboard…</div>;
  }
  if (error) {
    return <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">{error}</div>;
  }
  if (!data) return null;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
        <p className="text-sm text-slate-500 mt-1">
          Welcome back, {employee?.firstName || user.name?.split(' ')[0] || 'there'} · {data.today}
        </p>
      </div>

      {data.role === 'employee' && <EmployeeDashboard data={data} onNavigate={onNavigate} />}
      {data.role === 'manager' && <ManagerDashboard data={data} onNavigate={onNavigate} />}
      {(data.role === 'hr' || data.role === 'admin') && <HrDashboard data={data} onNavigate={onNavigate} />}
    </div>
  );
}

// ============================================================
// KPI Card
// ============================================================
function KpiCard({ label, value, sublabel, color = 'violet', icon }) {
  const colorMap = {
    violet: 'border-violet-200 bg-violet-50',
    emerald: 'border-emerald-200 bg-emerald-50',
    amber: 'border-amber-200 bg-amber-50',
    rose: 'border-rose-200 bg-rose-50',
    cyan: 'border-cyan-200 bg-cyan-50',
    slate: 'border-slate-200 bg-slate-50',
  };
  return (
    <div className={`rounded-xl border p-5 ${colorMap[color]}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase font-semibold text-slate-500 tracking-wide">{label}</p>
        {icon && <span className="text-lg">{icon}</span>}
      </div>
      <p className="text-3xl font-bold text-slate-900 mt-2">{value}</p>
      {sublabel && <p className="text-xs text-slate-500 mt-1">{sublabel}</p>}
    </div>
  );
}

// ============================================================
// EMPLOYEE
// ============================================================
function EmployeeDashboard({ data, onNavigate }) {
  const { kpis, attendanceTrend, leaveBalance, recentLeaves } = data;

  const trendData = attendanceTrend.map((t) => ({
    date: t.date,
    value: t.present,
    fill: t.status === 'present' ? STATUS_COLORS.present : t.status === 'late' ? STATUS_COLORS.late : STATUS_COLORS.absent,
  }));

  const balanceData = leaveBalance
    ? [
        { name: 'Casual', remaining: leaveBalance.casual.remaining, total: leaveBalance.casual.total },
        { name: 'Sick', remaining: leaveBalance.sick.remaining, total: leaveBalance.sick.total },
        { name: 'Earned', remaining: leaveBalance.earned.remaining, total: leaveBalance.earned.total },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Attendance (7d)" value={`${kpis.attendanceRate}%`} sublabel={`${kpis.presentDays}/${kpis.totalDays} days`} color="emerald" icon="📊" />
        <KpiCard label="Leave remaining" value={kpis.leaveRemaining} sublabel={`${kpis.leaveUsed} used this year`} color="violet" icon="🌴" />
        <KpiCard label="Pending requests" value={kpis.pendingRequests} sublabel="awaiting decision" color="amber" icon="⏳" />
        <KpiCard label="Today" value={data.today.slice(5)} sublabel="date" color="slate" icon="📅" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 7-day attendance trend */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Attendance — last 7 days</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trendData} margin={{ top: 5, right: 5, bottom: 5, left: -25 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" domain={[0, 1]} tickCount={2} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                formatter={(value, name, props) => [props.payload.status, 'Status']}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {trendData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Leave balance */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Leave balance</h3>
          {balanceData.length === 0 ? (
            <p className="text-sm text-slate-400">No balance record for this year.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={balanceData} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} stroke="#475569" width={60} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(value, name) => [`${value} day(s)`, name === 'remaining' ? 'Remaining' : 'Total']}
                />
                <Bar dataKey="total" fill="#e2e8f0" radius={[0, 4, 4, 0]} />
                <Bar dataKey="remaining" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Recent leave requests */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Recent leave requests</h3>
          {onNavigate && (
            <button type="button" onClick={() => onNavigate('leave')} className="text-xs text-violet-600 hover:text-violet-700 font-medium">
              View all →
            </button>
          )}
        </div>
        {recentLeaves.length === 0 ? (
          <div className="p-6 text-sm text-slate-400 text-center">No leave requests yet.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recentLeaves.map((l) => (
              <li key={l.id} className="px-6 py-3 flex items-center justify-between">
                <div>
                  <span className="font-medium text-slate-900 capitalize">{l.leaveType}</span>
                  <span className="text-sm text-slate-500 ml-2">{l.days} day(s) · {formatDate(l.startDate)} → {formatDate(l.endDate)}</span>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${statusStyle(l.status)}`}>
                  {l.status.replace('_', ' ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ============================================================
// MANAGER
// ============================================================
function ManagerDashboard({ data, onNavigate }) {
  const { kpis, attendanceSummary, attendanceSummaryTotal, teamLeaveUsage, teamLeaves } = data;

  const donutData = [
    { name: 'Present', value: attendanceSummary.present, color: STATUS_COLORS.present },
    { name: 'Late', value: attendanceSummary.late, color: STATUS_COLORS.late },
    { name: 'Absent', value: attendanceSummary.absent, color: STATUS_COLORS.absent },
    { name: 'On leave', value: attendanceSummary.leave, color: STATUS_COLORS.leave },
  ].filter((d) => d.value > 0);

  const usageData = Object.entries(teamLeaveUsage).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    days: value,
    fill: LEAVE_COLORS[name],
  }));

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Team size" value={kpis.teamSize} sublabel="direct reports" color="violet" icon="👥" />
        <KpiCard label="Present today" value={kpis.presentToday} sublabel={`of ${kpis.teamSize}`} color="emerald" icon="✓" />
        <KpiCard label="Absent today" value={kpis.absentToday} sublabel="not checked in" color="rose" icon="✕" />
        <KpiCard label="Pending approvals" value={kpis.pendingApprovals} sublabel="awaiting your action" color="amber" icon="⏳" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's team attendance donut */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Team attendance — today</h3>
          {donutData.length === 0 ? (
            <p className="text-sm text-slate-400">No attendance data for today.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={donutData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {donutData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Team leave usage */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Team leave usage (this year)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={usageData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                formatter={(value) => [`${value} day(s)`, 'Used']}
              />
              <Bar dataKey="days" radius={[4, 4, 0, 0]}>
                {usageData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Team recent leaves */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Recent team leave requests</h3>
          {onNavigate && kpis.pendingApprovals > 0 && (
            <button type="button" onClick={() => onNavigate('approvals')} className="text-xs text-violet-600 hover:text-violet-700 font-medium">
              {kpis.pendingApprovals} pending → Review
            </button>
          )}
        </div>
        {teamLeaves.length === 0 ? (
          <div className="p-6 text-sm text-slate-400 text-center">No team leave requests yet.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {teamLeaves.slice(0, 8).map((l) => (
              <li key={l.id} className="px-6 py-3 flex items-center justify-between">
                <div>
                  <span className="font-medium text-slate-900">{l.employee?.fullName || '—'}</span>
                  <span className="text-sm text-slate-500 ml-2 capitalize">{l.leaveType} · {l.days}d · {formatDate(l.startDate)}</span>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${statusStyle(l.status)}`}>
                  {l.status.replace('_', ' ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ============================================================
// HR / ADMIN
// ============================================================
function HrDashboard({ data, onNavigate }) {
  const { kpis, companyAttendance, companyAttendanceTotal, headcountByDept, attendanceByDept, leaveDistribution, leaveTypeUsage } = data;

  const attendanceDonut = [
    { name: 'Present', value: companyAttendance.present, color: STATUS_COLORS.present },
    { name: 'Late', value: companyAttendance.late, color: STATUS_COLORS.late },
    { name: 'Absent', value: companyAttendance.absent, color: STATUS_COLORS.absent },
    { name: 'On leave', value: companyAttendance.leave, color: STATUS_COLORS.leave },
  ].filter((d) => d.value > 0);

  const leaveDistData = Object.entries(leaveDistribution).map(([name, value]) => ({
    name: name.replace('_', ' '),
    value,
    color: LEAVE_STATUS_COLORS[name],
  })).filter((d) => d.value > 0);

  const leaveTypeData = Object.entries(leaveTypeUsage).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    days: value,
    fill: LEAVE_COLORS[name],
  }));

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total employees" value={kpis.totalEmployees} sublabel="active" color="violet" icon="👥" />
        <KpiCard label="Present today" value={kpis.presentToday} sublabel={`of ${kpis.totalEmployees}`} color="emerald" icon="✓" />
        <KpiCard label="Absent today" value={kpis.absentToday} sublabel="not checked in" color="rose" icon="✕" />
        <KpiCard label="Pending approvals" value={kpis.pendingApprovals} sublabel="awaiting action" color="amber" icon="⏳" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Company attendance donut */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Company attendance — today</h3>
          {attendanceDonut.length === 0 ? (
            <p className="text-sm text-slate-400">No data.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={attendanceDonut} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                  {attendanceDonut.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Leave distribution pie */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Leave requests (this year)</h3>
          {leaveDistData.length === 0 ? (
            <p className="text-sm text-slate-400">No leave requests this year.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={leaveDistData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} paddingAngle={2}>
                  {leaveDistData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Approved leave by type */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Approved leave by type (days)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={leaveTypeData} margin={{ top: 5, right: 5, bottom: 5, left: -25 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                formatter={(value) => [`${value} day(s)`, 'Used']}
              />
              <Bar dataKey="days" radius={[4, 4, 0, 0]}>
                {leaveTypeData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Attendance by department + Headcount */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Attendance rate by department — today</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={attendanceByDept} margin={{ top: 5, right: 20, bottom: 5, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" angle={-15} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" domain={[0, 100]} unit="%" />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                formatter={(value, name, props) => {
                  if (name === 'rate') return [`${value}%`, 'Attendance rate'];
                  return [value, name];
                }}
              />
              <Bar dataKey="rate" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Headcount by department</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={headcountByDept} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="#475569" width={100} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                formatter={(value) => [`${value} employee(s)`, 'Headcount']}
              />
              <Bar dataKey="count" fill="#06b6d4" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Approvals CTA */}
      {kpis.pendingApprovals > 0 && onNavigate && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-6 flex items-center justify-between">
          <div>
            <p className="font-semibold text-violet-900">{kpis.pendingApprovals} leave request(s) awaiting your action</p>
            <p className="text-sm text-violet-700 mt-0.5">Review and approve or reject them now.</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('approvals')}
            className="px-4 py-2 rounded-md bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700"
          >
            Go to approvals →
          </button>
        </div>
      )}
    </div>
  );
}

function statusStyle(status) {
  const map = {
    pending_manager: 'bg-amber-100 text-amber-700 border-amber-200',
    pending_hr: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    rejected: 'bg-rose-100 text-rose-700 border-rose-200',
    cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
  };
  return map[status] || 'bg-slate-100 text-slate-500 border-slate-200';
}
