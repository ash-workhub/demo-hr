// src/components/views/NotificationsView.jsx
// In-app notifications. List with filter (all/unread), mark-as-read, mark-all-read,
// and deep-linking to other views via the link field.
'use client';
import { useCallback, useEffect, useState } from 'react';

const TYPE_ICONS = {
  leave_submitted: { color: 'bg-amber-100 text-amber-700', label: '📝' },
  leave_manager_approved: { color: 'bg-cyan-100 text-cyan-700', label: '✓' },
  leave_hr_approved: { color: 'bg-emerald-100 text-emerald-700', label: '✓' },
  leave_rejected: { color: 'bg-rose-100 text-rose-700', label: '✕' },
  leave_cancelled: { color: 'bg-slate-100 text-slate-500', label: '−' },
  attendance_reminder: { color: 'bg-violet-100 text-violet-700', label: '⏰' },
  system: { color: 'bg-slate-100 text-slate-500', label: 'ℹ' },
};

function formatRelative(d) {
  if (!d) return '';
  const date = new Date(d);
  const diff = Date.now() - date.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export default function NotificationsView({ onNavigate }) {
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [markingAll, setMarkingAll] = useState(false);
  const [markingOne, setMarkingOne] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/notifications?filter=${filter}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleMarkAllRead() {
    setMarkingAll(true);
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark-all-read' }),
      });
      if (res.ok) await load();
    } finally {
      setMarkingAll(false);
    }
  }

  async function handleMarkOneRead(id, navigateAfter) {
    setMarkingOne(id);
    try {
      const res = await fetch(`/api/notifications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        await load();
        if (navigateAfter) onNavigate?.(navigateAfter);
      }
    } finally {
      setMarkingOne(null);
    }
  }

  function handleClick(n) {
    // If unread, mark as read. Then navigate if there's a link.
    const shouldNavigate = n.link && onNavigate;
    if (!n.read) {
      handleMarkOneRead(n.id, shouldNavigate ? n.link : null);
    } else if (shouldNavigate) {
      onNavigate(n.link);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Notifications</h2>
          <p className="text-sm text-slate-500 mt-1">
            {unreadCount > 0 ? `${unreadCount} unread` : 'You\'re all caught up'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={markingAll}
            className="px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-60 shrink-0"
          >
            {markingAll ? 'Marking…' : 'Mark all as read'}
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
            filter === 'all' ? 'bg-violet-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => setFilter('unread')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
            filter === 'unread' ? 'bg-violet-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          Unread {unreadCount > 0 && `(${unreadCount})`}
        </button>
      </div>

      {error && (
        <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2 mb-4">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            {filter === 'unread' ? 'No unread notifications.' : 'No notifications yet.'}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((n) => {
              const icon = TYPE_ICONS[n.type] || TYPE_ICONS.system;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleClick(n)}
                    disabled={markingOne === n.id}
                    className={`w-full flex items-start gap-3 p-4 text-left hover:bg-slate-50 transition disabled:opacity-60 ${
                      !n.read ? 'bg-violet-50/40' : ''
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${icon.color}`}>
                      {icon.label}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900 truncate">{n.title}</span>
                        {!n.read && (
                          <span className="w-2 h-2 rounded-full bg-violet-500 shrink-0" aria-label="Unread" />
                        )}
                      </div>
                      <p className="text-sm text-slate-600 mt-0.5">{n.message}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-xs text-slate-400">{formatRelative(n.createdAt)}</span>
                        {n.link && (
                          <span className="text-xs text-violet-600 font-medium">
                            → View {n.link}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
