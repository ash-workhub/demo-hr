// src/components/views/NoticesView.jsx
// V2 Step 5 — Company notices. All roles can read; HR/Admin can manage.
'use client';
import { useCallback, useEffect, useState } from 'react';

const STATUS_STYLES = {
  draft: 'bg-amber-100 text-amber-700 border-amber-200',
  published: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  archived: 'bg-slate-100 text-slate-500 border-slate-200',
};

const ROLE_LABELS = { employee: 'Employees', manager: 'Managers', hr: 'HR', admin: 'Admins' };

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function NoticesView({ user }) {
  const canManage = user.role === 'hr' || user.role === 'admin';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/notices', { cache: 'no-store' });
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

  async function handleMarkRead(id) {
    try {
      await fetch(`/api/notices/${id}/read`, { method: 'POST' });
      load();
    } catch {}
  }

  if (loading) return <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>;
  if (error) return <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">{error}</div>;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Company Notices</h2>
          <p className="text-sm text-slate-500 mt-1">
            {canManage ? 'Manage notices · drafts, publish, archive' : 'Notices addressed to you'}
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="px-3 py-1.5 rounded-md bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 shrink-0"
          >
            + New Notice
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {items.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No notices available.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => setSelected(n)}
                  className={`w-full flex items-start gap-3 p-4 text-left hover:bg-slate-50 transition ${!n.read && !canManage ? 'bg-violet-50/40' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-900 truncate">{n.title}</span>
                      {!n.read && !canManage && (
                        <span className="w-2 h-2 rounded-full bg-violet-500 shrink-0" />
                      )}
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${STATUS_STYLES[n.status]}`}>
                        {n.status}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5 line-clamp-1">{n.body}</p>
                    <div className="text-xs text-slate-400 mt-1">
                      {n.publishedAt ? `Published ${formatDate(n.publishedAt)} by ${n.publishedByName}` : `Created ${formatDate(n.createdAt)}`}
                      {canManage && n.audienceCount != null && ` · ${n.audienceCount} recipients`}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <NoticeDetail
          notice={selected}
          canManage={canManage}
          onClose={() => { setSelected(null); load(); }}
          onMarkRead={handleMarkRead}
        />
      )}

      {showForm && (
        <NoticeForm
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}

function NoticeDetail({ notice, canManage, onClose, onMarkRead }) {
  const [detail, setDetail] = useState(notice);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Fetch full detail
    (async () => {
      try {
        const res = await fetch(`/api/notices/${notice.id}`, { cache: 'no-store' });
        if (res.ok) {
          const d = await res.json();
          setDetail(d);
        }
      } catch {}
    })();
  }, [notice.id]);

  async function handleAction(action) {
    setLoading(true);
    try {
      const res = await fetch(`/api/notices/${notice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const d = await res.json();
        setDetail(d);
      } else {
        const d = await res.json();
        alert(d.error?._ || 'Failed');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <aside className="relative ml-auto w-full max-w-lg bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between h-16 px-5 border-b border-slate-200 shrink-0">
          <span className="font-semibold text-slate-900">Notice</span>
          <button type="button" onClick={onClose} className="p-2 rounded hover:bg-slate-100 text-slate-500">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <h3 className="text-xl font-bold text-slate-900">{detail.title}</h3>
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${STATUS_STYLES[detail.status]}`}>{detail.status}</span>
            <span className="text-xs text-slate-400">by {detail.authorName}</span>
          </div>
          <div className="text-sm text-slate-600 mt-4 whitespace-pre-wrap">{detail.body}</div>

          <div className="mt-6 pt-4 border-t border-slate-100 text-xs text-slate-500 space-y-1">
            <div>Audience: {(detail.audienceRoles || []).map((r) => ROLE_LABELS[r] || r).join(', ')}</div>
            {detail.publishedAt && <div>Published: {formatDate(detail.publishedAt)} by {detail.publishedByName}</div>}
            {detail.archivedAt && <div>Archived: {formatDate(detail.archivedAt)} by {detail.archivedByName}</div>}
          </div>

          {canManage && detail.status === 'draft' && (
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => handleAction('publish')} disabled={loading}
                className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60">
                {loading ? 'Publishing…' : 'Publish'}
              </button>
              <button type="button" onClick={() => handleAction('archive')} disabled={loading}
                className="px-4 py-2 rounded-md border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-60">
                Archive
              </button>
            </div>
          )}
          {canManage && detail.status === 'published' && (
            <div className="mt-4">
              <button type="button" onClick={() => handleAction('archive')} disabled={loading}
                className="px-4 py-2 rounded-md border border-rose-200 text-rose-600 text-sm font-medium hover:bg-rose-50 disabled:opacity-60">
                {loading ? 'Archiving…' : 'Archive Notice'}
              </button>
            </div>
          )}

          {!canManage && !detail.read && detail.status === 'published' && (
            <div className="mt-4">
              <button type="button" onClick={() => onMarkRead(detail.id)}
                className="px-4 py-2 rounded-md bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700">
                Mark as read
              </button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function NoticeForm({ onClose, onSaved }) {
  const [form, setForm] = useState({
    title: '',
    body: '',
    audienceRoles: ['employee', 'manager', 'hr', 'admin'],
    status: 'draft',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);

  function toggleRole(role) {
    setForm((f) => ({
      ...f,
      audienceRoles: f.audienceRoles.includes(role)
        ? f.audienceRoles.filter((r) => r !== role)
        : [...f.audienceRoles, role].sort(),
    }));
  }

  async function handlePreview() {
    setError('');
    try {
      const res = await fetch('/api/notices/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audienceRoles: form.audienceRoles }),
      });
      if (res.ok) {
        setPreview(await res.json());
      }
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/notices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error?._ || Object.values(d.error || {})[0] || 'Failed');
      } else {
        onSaved();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <aside className="relative ml-auto w-full max-w-lg bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between h-16 px-5 border-b border-slate-200 shrink-0">
          <span className="font-semibold text-slate-900">New Notice</span>
          <button type="button" onClick={onClose} className="p-2 rounded hover:bg-slate-100 text-slate-500">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Title</label>
            <input type="text" value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} required maxLength={200}
              className="w-full px-3 py-2 rounded-md border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Body</label>
            <textarea value={form.body} onChange={(e) => setForm({...form, body: e.target.value})} required maxLength={5000} rows={6}
              className="w-full px-3 py-2 rounded-md border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none text-sm resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Audience</label>
            <div className="flex gap-2 flex-wrap">
              {['employee', 'manager', 'hr', 'admin'].map((r) => (
                <button key={r} type="button" onClick={() => toggleRole(r)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium ${form.audienceRoles.includes(r) ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>
            <button type="button" onClick={handlePreview} className="mt-2 text-xs text-violet-600 hover:text-violet-700 font-medium">
              Preview audience count →
            </button>
            {preview && (
              <div className="mt-1 text-xs text-slate-600 bg-slate-50 rounded-md px-3 py-2 border border-slate-200">
                <strong>{preview.count}</strong> recipient(s) will see this notice
                <div className="text-xs text-slate-400 mt-0.5">
                  {Object.entries(preview.breakdown).map(([r, c]) => `${ROLE_LABELS[r] || r}: ${c}`).join(' · ')}
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
            <select value={form.status} onChange={(e) => setForm({...form, status: e.target.value})}
              className="w-full px-3 py-2 rounded-md border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none text-sm bg-white">
              <option value="draft">Save as draft</option>
              <option value="published">Publish immediately</option>
            </select>
          </div>
          {error && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">{error}</div>}
          <div className="flex gap-2 mt-2">
            <button type="submit" disabled={saving}
              className="px-4 py-2 rounded-md bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-60">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-md border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
