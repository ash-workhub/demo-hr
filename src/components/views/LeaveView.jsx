// src/components/views/LeaveView.jsx
// Leave Requests. Apply form + my requests list + balance card.
'use client';
import { useCallback, useEffect, useState } from 'react';

const STATUS_STYLES = {
  pending_manager: 'bg-amber-100 text-amber-700 border-amber-200',
  pending_hr: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-100 text-rose-700 border-rose-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

const STATUS_LABELS = {
  pending_manager: 'Pending manager',
  pending_hr: 'Pending HR',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function LeaveView({ user, employee }) {
  const [tab, setTab] = useState('apply'); // 'apply' | 'history'
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/leave', { cache: 'no-store' });
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
    return <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">Loading…</div>;
  }
  if (error) {
    return <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">{error}</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Leave Requests</h2>
        <p className="text-sm text-slate-500 mt-1">Apply for leave · Manager → HR approval chain</p>
      </div>

      <div className="flex gap-2 mb-6">
        <button
          type="button"
          onClick={() => setTab('apply')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition ${
            tab === 'apply' ? 'bg-violet-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          Apply
        </button>
        <button
          type="button"
          onClick={() => setTab('history')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition ${
            tab === 'history' ? 'bg-violet-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          My requests ({data?.myRequests?.length || 0})
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {tab === 'apply' ? (
            <ApplyForm balance={data?.balance} onApplied={load} />
          ) : (
            <MyRequestsList requests={data?.myRequests || []} onChanged={load} />
          )}
        </div>
        <div>
          <BalanceCard balance={data?.balance} />
        </div>
      </div>
    </div>
  );
}

function ApplyForm({ balance, onApplied }) {
  const [form, setForm] = useState({
    leaveType: 'casual',
    startDate: '',
    endDate: '',
    reason: '',
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState('');

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // Auto-set endDate = startDate when the user picks a start date and hasn't set an end yet.
  // setState-in-effect is intentional here: we're synchronizing endDate to startDate
  // for UX convenience, and only when endDate is empty (so we never overwrite user input).
  useEffect(() => {
    if (form.startDate && !form.endDate) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      set('endDate', form.startDate);
    }
  }, [form.startDate, form.endDate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setSuccess('');
    try {
      const res = await fetch('/api/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors(data.error || { _: 'Failed to submit' });
      } else {
        setSuccess(`Leave request submitted — ${data.days} day(s). Status: ${data.status.replace('_', ' ')}`);
        setForm({ leaveType: 'casual', startDate: '', endDate: '', reason: '' });
        onApplied();
      }
    } catch (err) {
      setErrors({ _: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-slate-900">Apply for leave</h3>

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Leave type</label>
        <select
          value={form.leaveType}
          onChange={(e) => set('leaveType', e.target.value)}
          className="w-full px-3 py-2 rounded-md border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none text-sm bg-white"
        >
          <option value="casual">Casual</option>
          <option value="sick">Sick</option>
          <option value="earned">Earned</option>
          <option value="unpaid">Unpaid</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Start date</label>
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => set('startDate', e.target.value)}
            required
            className="w-full px-3 py-2 rounded-md border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">End date</label>
          <input
            type="date"
            value={form.endDate}
            onChange={(e) => set('endDate', e.target.value)}
            required
            min={form.startDate}
            className="w-full px-3 py-2 rounded-md border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Reason</label>
        <textarea
          value={form.reason}
          onChange={(e) => set('reason', e.target.value)}
          required
          minLength={5}
          maxLength={1000}
          rows={3}
          placeholder="Brief reason for the leave…"
          className="w-full px-3 py-2 rounded-md border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none text-sm resize-none"
        />
      </div>

      {errors._ && (
        <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
          {errors._}
          {errors.balance && (
            <div className="text-xs mt-1">
              Remaining: {errors.balance.remaining} day(s) of {errors.balance.total}
            </div>
          )}
        </div>
      )}
      {success && (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
          {success}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="px-4 py-2 rounded-md bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-60"
      >
        {saving ? 'Submitting…' : 'Submit request'}
      </button>
    </form>
  );
}

function MyRequestsList({ requests, onChanged }) {
  const [cancelling, setCancelling] = useState(null);

  async function handleCancel(id) {
    if (!confirm('Cancel this leave request?')) return;
    setCancelling(id);
    try {
      const res = await fetch(`/api/leave/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error?._ || 'Failed to cancel');
      } else {
        onChanged();
      }
    } finally {
      setCancelling(null);
    }
  }

  if (requests.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
        No leave requests yet. Submit one from the "Apply" tab.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <ul className="divide-y divide-slate-100">
        {requests.map((r) => {
          const canCancel = r.status === 'pending_manager' || r.status === 'pending_hr';
          return (
            <li key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900 capitalize">{r.leaveType}</span>
                    <span className="text-sm text-slate-500">{r.days} day(s)</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${STATUS_STYLES[r.status] || STATUS_STYLES.cancelled}`}>
                      {STATUS_LABELS[r.status] || r.status}
                    </span>
                  </div>
                  <div className="text-sm text-slate-600 mt-1">
                    {formatDate(r.startDate)} → {formatDate(r.endDate)}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 line-clamp-2">{r.reason}</div>
                  <div className="text-xs text-slate-400 mt-1">
                    Submitted {formatDateTime(r.createdAt)}
                  </div>
                </div>
                {canCancel && (
                  <button
                    type="button"
                    onClick={() => handleCancel(r.id)}
                    disabled={cancelling === r.id}
                    className="px-3 py-1.5 rounded-md border border-rose-200 text-rose-600 text-xs font-medium hover:bg-rose-50 disabled:opacity-60 shrink-0"
                  >
                    {cancelling === r.id ? 'Cancelling…' : 'Cancel'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function BalanceCard({ balance }) {
  if (!balance) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Leave balance</h3>
        <p className="text-sm text-slate-400">No balance record for this year.</p>
      </div>
    );
  }

  const types = [
    { key: 'casual', label: 'Casual', color: 'bg-amber-500' },
    { key: 'sick', label: 'Sick', color: 'bg-rose-500' },
    { key: 'earned', label: 'Earned', color: 'bg-emerald-500' },
    { key: 'unpaid', label: 'Unpaid', color: 'bg-slate-500' },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900">Leave balance</h3>
        <span className="text-xs text-slate-400">{balance.year}</span>
      </div>
      <ul className="space-y-3">
        {types.map((t) => {
          const b = balance[t.key];
          if (t.key === 'unpaid') {
            return (
              <li key={t.key}>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-700">{t.label}</span>
                  <span className="font-medium text-slate-900">{b.used} day(s) used</span>
                </div>
                <p className="text-xs text-slate-400">No cap</p>
              </li>
            );
          }
          const remaining = (b.total || 0) - (b.used || 0);
          const pct = b.total ? Math.round(((b.used || 0) / b.total) * 100) : 0;
          return (
            <li key={t.key}>
              <div className="flex justify-between text-sm">
                <span className="text-slate-700">{t.label}</span>
                <span className="font-medium text-slate-900">
                  {remaining} / {b.total} left
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className={`h-full ${t.color}`} style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{b.used} used · {remaining} remaining</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
