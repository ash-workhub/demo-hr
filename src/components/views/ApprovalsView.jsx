// src/components/views/ApprovalsView.jsx
// Pending approvals queue (manager/hr/admin). Approve / reject with notes.
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

const STATUS_STYLES = {
  pending_manager: 'bg-amber-100 text-amber-700 border-amber-200',
  pending_hr: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-100 text-rose-700 border-rose-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

const STATUS_LABELS = {
  pending_manager: 'Awaiting manager',
  pending_hr: 'Awaiting HR',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
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

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ApprovalsView({ user, employee }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acting, setActing] = useState(null); // id of leave being acted on
  const processedIds = useRef(new Set()); // guard against duplicate API calls

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/leave?scope=pending', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
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

  async function handleAction(id, decision, note = '') {
    // Guard: prevent duplicate API calls for the same leave ID.
    if (processedIds.current.has(id)) return;
    processedIds.current.add(id);
    
    setActing(id);
    // Optimistic update: immediately remove the item from the local list
    // so the user can't click it again while the API request is in flight.
    setItems((prev) => prev.filter((it) => it.id !== id));
    try {
      const res = await fetch(`/api/leave/${id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note }),
      });
      const data = await res.json();
      if (!res.ok) {
        // API failed — reload the list to restore the item
        alert(data.error?._ || 'Action failed');
        processedIds.current.delete(id); // allow retry
        await load();
      } else {
        // Success — reload to get the updated list
        await load();
      }
    } catch (e) {
      alert(e.message);
      processedIds.current.delete(id); // allow retry
      // Network error — reload to restore the item
      await load();
    } finally {
      setActing(null);
    }
  }

  if (loading) {
    return <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">Loading…</div>;
  }

  if (error) {
    return <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">{error}</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Approvals</h2>
        <p className="text-sm text-slate-500 mt-1">
          {user.role === 'manager' && 'Leave requests from your direct reports — your approval moves them to HR.'}
          {user.role === 'hr' && 'Leaves awaiting HR final approval.'}
          {user.role === 'admin' && 'All pending leaves across both stages.'}
        </p>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
          No pending approvals. You're all caught up!
        </div>
      ) : (
        <ul className="space-y-4">
          {items.map((lr) => (
            <ApprovalCard
              key={lr.id}
              lr={lr}
              user={user}
              acting={acting === lr.id}
              onApprove={(note) => handleAction(lr.id, 'approved', note)}
              onReject={(note) => handleAction(lr.id, 'rejected', note)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ApprovalCard({ lr, user, acting, onApprove, onReject }) {
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState('');
  const [pendingDecision, setPendingDecision] = useState(null); // 'approve' | 'reject'
  const [submitted, setSubmitted] = useState(false); // guard: prevent double-submit at card level

  function startAction(decision) {
    if (submitted) return;
    setPendingDecision(decision);
    setShowNote(true);
  }

  async function confirmAction() {
    if (submitted) return;
    setSubmitted(true); // immediately block any further clicks
    const decision = pendingDecision;
    setShowNote(false);
    setNote('');
    setPendingDecision(null);
    if (decision === 'approve') await onApprove(note);
    else await onReject(note);
  }

  function cancelAction() {
    setShowNote(false);
    setNote('');
    setPendingDecision(null);
  }

  return (
    <li className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-start gap-3">
        <Avatar name={lr.employee?.fullName} color={lr.employee?.avatarColor} size={44} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-900">{lr.employee?.fullName || 'Unknown'}</span>
            <span className="text-xs text-slate-400">{lr.employee?.employeeCode}</span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500">{lr.employee?.department}</span>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-sm font-medium text-slate-900 capitalize">{lr.leaveType}</span>
            <span className="text-sm text-slate-500">· {lr.days} day(s)</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${STATUS_STYLES[lr.status]}`}>
              {STATUS_LABELS[lr.status] || lr.status}
            </span>
          </div>
          <div className="text-sm text-slate-600 mt-1">
            {formatDate(lr.startDate)} → {formatDate(lr.endDate)}
          </div>
          <div className="text-sm text-slate-700 mt-2 bg-slate-50 rounded-md px-3 py-2 border border-slate-100">
            {lr.reason}
          </div>

          {showNote ? (
            <div className="mt-3 flex flex-col gap-2">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={`Note for ${pendingDecision === 'approve' ? 'approval' : 'rejection'} (optional, max 500 chars)`}
                maxLength={500}
                rows={2}
                className="w-full px-3 py-2 rounded-md border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none text-sm resize-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={confirmAction}
                  disabled={submitted || acting === lr.id}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold text-white disabled:opacity-60 ${
                    pendingDecision === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {submitted || acting === lr.id ? 'Processing…' : `Confirm ${pendingDecision}`}
                </button>
                <button
                  type="button"
                  onClick={cancelAction}
                  disabled={submitted || acting === lr.id}
                  className="px-3 py-1.5 rounded-md border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => startAction('approve')}
                disabled={!!acting}
                className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-60"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => startAction('reject')}
                disabled={!!acting}
                className="px-3 py-1.5 rounded-md bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 disabled:opacity-60"
              >
                Reject
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
