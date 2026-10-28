// src/components/views/DirectoryView.jsx
// Employee Directory. Searchable list + profile side panel + (HR/admin) edit form.
'use client';
import { useCallback, useEffect, useState } from 'react';
import { CloseIcon } from '../Icons.jsx';

const ROLE_BADGE = {
  admin: 'bg-rose-100 text-rose-700 border-rose-200',
  hr: 'bg-pink-100 text-pink-700 border-pink-200',
  manager: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  employee: 'bg-slate-100 text-slate-700 border-slate-200',
};

function Avatar({ name, color, size = 40 }) {
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
  const date = new Date(d);
  if (isNaN(date)) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function DirectoryView({ user, employee }) {
  const canEdit = user.role === 'hr' || user.role === 'admin';
  const canDelete = user.role === 'admin';

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [q, setQ] = useState('');
  const [department, setDepartment] = useState('all');
  const [status, setStatus] = useState('active');

  const [selected, setSelected] = useState(null);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [editing, setEditing] = useState(false);
  const [managers, setManagers] = useState([]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (department && department !== 'all') params.set('department', department);
      params.set('status', status);
      params.set('page', String(page));
      params.set('limit', '20');
      const res = await fetch(`/api/employees?${params}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
      setDepartments(data.departments || []);
    } catch (e) {
      setError(e.message || 'Failed to load employees');
    } finally {
      setLoading(false);
    }
  }, [q, department, status, page]);

  useEffect(() => {
    const t = setTimeout(loadList, 250); // debounce search
    return () => clearTimeout(t);
  }, [loadList]);

  // Load full detail when an employee is selected.
  // Note: the synchronous setSelectedDetail(null) below is intentional — it
  // resets the panel to "loading" when the selection changes. The lint rule
  // react-hooks/set-state-in-effect flags this, but here it is correct: we
  // need to clear stale data immediately so the UI doesn't flash the previous
  // employee's details while the new fetch is in flight.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedDetail(null);
    if (!selected) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/employees/${selected}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setSelectedDetail(data);
      } catch (e) {
        if (!cancelled) setSelectedDetail({ error: e.message });
      }
    })();
    return () => { cancelled = true; };
  }, [selected]);

  // Load managers list when editing (for the manager dropdown).
  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/employees?status=active&limit=50', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        // Only show people who are managers/hr/admin as potential managers.
        const potential = (data.items || []).filter(
          (e) => ['manager', 'hr', 'admin'].includes(e.role) && e.id !== selected
        );
        setManagers(potential);
      } catch {
        // ignore
      }
    })();
    return () => { cancelled = true; };
  }, [editing, selected]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
    loadList();
  }

  function openProfile(id) {
    setSelected(id);
    setEditing(false);
  }

  function closeProfile() {
    setSelected(null);
    setSelectedDetail(null);
    setEditing(false);
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Employee Directory</h2>
        <p className="text-sm text-slate-500 mt-1">
          {total} {total === 1 ? 'employee' : 'employees'}{canEdit ? ' · HR/admin can edit' : ' · read-only'}
        </p>
      </div>

      {/* Filters */}
      <form onSubmit={handleSearchSubmit} className="bg-white rounded-xl border border-slate-200 p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label htmlFor="dir-q" className="block text-xs font-medium text-slate-500 mb-1">Search</label>
          <input
            id="dir-q"
            type="text"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Name, email, ID, designation…"
            className="w-full px-3 py-2 rounded-md border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none text-sm"
          />
        </div>
        <div>
          <label htmlFor="dir-dept" className="block text-xs font-medium text-slate-500 mb-1">Department</label>
          <select
            id="dir-dept"
            value={department}
            onChange={(e) => { setDepartment(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-md border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none text-sm bg-white"
          >
            <option value="all">All departments</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="dir-status" className="block text-xs font-medium text-slate-500 mb-1">Status</label>
          <select
            id="dir-status"
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-md border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none text-sm bg-white"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
        </div>
      </form>

      {error && (
        <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {/* List */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No employees match your filters.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => openProfile(e.id)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 text-left transition"
                >
                  <Avatar name={e.fullName} color={e.avatarColor} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900 truncate">{e.fullName}</span>
                      <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded border ${ROLE_BADGE[e.role] || ROLE_BADGE.employee}`}>
                        {e.role}
                      </span>
                      {e.status === 'inactive' && (
                        <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded border bg-slate-100 text-slate-500 border-slate-200">
                          inactive
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      {e.designation} · {e.department} · {e.email}
                    </div>
                  </div>
                  <div className="text-xs text-slate-400 shrink-0 hidden sm:block">
                    {e.employeeId}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-slate-500">
            Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page === pages}
              className="px-3 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Profile side panel */}
      {selected && (
        <ProfilePanel
          detail={selectedDetail}
          canEdit={canEdit}
          canDelete={canDelete}
          editing={editing}
          managers={managers}
          onEdit={() => setEditing(true)}
          onCancelEdit={() => setEditing(false)}
          onClose={closeProfile}
          onSaved={(updated) => {
            setSelectedDetail(updated);
            setEditing(false);
            loadList();
          }}
          currentUser={user}
        />
      )}
    </div>
  );
}

function ProfilePanel({ detail, canEdit, canDelete, editing, managers, onEdit, onCancelEdit, onClose, onSaved, currentUser }) {
  if (!detail) {
    return (
      <div className="fixed inset-0 z-40 flex">
        <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden="true" />
        <aside className="relative ml-auto w-full max-w-md bg-white shadow-xl flex flex-col">
          <div className="flex items-center justify-between h-16 px-5 border-b border-slate-200">
            <span className="font-semibold text-slate-900">Employee profile</span>
            <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-md hover:bg-slate-100 text-slate-500">
              <CloseIcon size={20} />
            </button>
          </div>
          <div className="flex-1 p-6 text-sm text-slate-400">Loading…</div>
        </aside>
      </div>
    );
  }

  if (detail.error) {
    return (
      <div className="fixed inset-0 z-40 flex">
        <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden="true" />
        <aside className="relative ml-auto w-full max-w-md bg-white shadow-xl flex flex-col">
          <div className="flex items-center justify-between h-16 px-5 border-b border-slate-200">
            <span className="font-semibold text-slate-900">Error</span>
            <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-md hover:bg-slate-100 text-slate-500">
              <CloseIcon size={20} />
            </button>
          </div>
          <div className="flex-1 p-6 text-sm text-rose-600">{detail.error}</div>
        </aside>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden="true" />
      <aside className="relative ml-auto w-full max-w-md bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between h-16 px-5 border-b border-slate-200 shrink-0">
          <span className="font-semibold text-slate-900">
            {editing ? 'Edit profile' : 'Employee profile'}
          </span>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-md hover:bg-slate-100 text-slate-500">
            <CloseIcon size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {editing ? (
            <EditForm
              detail={detail}
              managers={managers}
              onCancel={onCancelEdit}
              onSaved={onSaved}
            />
          ) : (
            <ProfileDetail detail={detail} canEdit={canEdit} canDelete={canDelete} onEdit={onEdit} currentUser={currentUser} />
          )}
        </div>
      </aside>
    </div>
  );
}

function ProfileDetail({ detail, canEdit, canDelete, onEdit, currentUser }) {
  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <Avatar name={detail.fullName} color={detail.avatarColor} size={64} />
        <div>
          <h3 className="text-lg font-bold text-slate-900">{detail.fullName}</h3>
          <p className="text-sm text-slate-500">{detail.designation}</p>
          <span className={`inline-block mt-1 text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded border ${ROLE_BADGE[detail.role] || ROLE_BADGE.employee}`}>
            {detail.role}
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-3 text-sm">
        <Field label="Employee ID" value={detail.employeeId} />
        <Field label="Email" value={detail.email} />
        <Field label="Phone" value={detail.phone || '—'} />
        <Field label="Department" value={detail.department} />
        <Field label="Designation" value={detail.designation} />
        <Field label="Manager" value={detail.manager ? `${detail.manager.fullName} (${detail.manager.employeeId})` : '—'} />
        <Field label="Reports" value={detail.reportsCount != null ? `${detail.reportsCount} direct` : '—'} />
        <Field label="Join date" value={formatDate(detail.joinDate)} />
        <Field label="Status" value={detail.status} />
      </dl>

      {(canEdit || canDelete) && (
        <div className="mt-6 flex gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="px-4 py-2 rounded-md bg-violet-600 text-white text-sm font-medium hover:bg-violet-700"
            >
              Edit
            </button>
          )}
          {canDelete && detail.status === 'active' && detail.id !== currentUser.employeeId && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!confirm('Deactivate this employee? They will be unable to sign in. This can be undone by setting status back to active.')) return;
                const res = await fetch(`/api/employees/${detail.id}`, { method: 'DELETE' });
                if (res.ok) {
                  alert('Employee deactivated.');
                  window.location.reload();
                } else {
                  alert('Failed to deactivate.');
                }
              }}
            >
              <button type="submit" className="px-4 py-2 rounded-md border border-rose-200 text-rose-600 text-sm font-medium hover:bg-rose-50">
                Deactivate
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-slate-100 last:border-b-0">
      <dt className="text-slate-500 shrink-0">{label}</dt>
      <dd className="font-medium text-slate-900 text-right break-all">{value}</dd>
    </div>
  );
}

function EditForm({ detail, managers, onCancel, onSaved }) {
  const [form, setForm] = useState({
    firstName: detail.firstName || '',
    lastName: detail.lastName || '',
    email: detail.email || '',
    phone: detail.phone || '',
    department: detail.department || '',
    designation: detail.designation || '',
    managerId: detail.managerId || '',
    role: detail.role || 'employee',
    joinDate: detail.joinDate ? new Date(detail.joinDate).toISOString().slice(0, 10) : '',
    avatarColor: detail.avatarColor || '#6b7280',
    status: detail.status || 'active',
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const res = await fetch(`/api/employees/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors(data.error || { _: 'Failed to save' });
      } else {
        onSaved(data);
      }
    } catch (err) {
      setErrors({ _: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <FormField label="First name" error={errors.firstName}>
          <input type="text" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} required className={inputCls} />
        </FormField>
        <FormField label="Last name" error={errors.lastName}>
          <input type="text" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} required className={inputCls} />
        </FormField>
      </div>
      <FormField label="Email" error={errors.email}>
        <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required className={inputCls} />
      </FormField>
      <FormField label="Phone" error={errors.phone}>
        <input type="text" value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputCls} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Department" error={errors.department}>
          <input type="text" value={form.department} onChange={(e) => set('department', e.target.value)} required className={inputCls} />
        </FormField>
        <FormField label="Designation" error={errors.designation}>
          <input type="text" value={form.designation} onChange={(e) => set('designation', e.target.value)} required className={inputCls} />
        </FormField>
      </div>
      <FormField label="Manager" error={errors.managerId}>
        <select value={form.managerId} onChange={(e) => set('managerId', e.target.value)} className={inputCls}>
          <option value="">— No manager —</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>{m.fullName} ({m.employeeId})</option>
          ))}
        </select>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Role" error={errors.role}>
          <select value={form.role} onChange={(e) => set('role', e.target.value)} className={inputCls}>
            <option value="employee">Employee</option>
            <option value="manager">Manager</option>
            <option value="hr">HR</option>
            <option value="admin">Admin</option>
          </select>
        </FormField>
        <FormField label="Status" error={errors.status}>
          <select value={form.status} onChange={(e) => set('status', e.target.value)} className={inputCls}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </FormField>
      </div>
      <FormField label="Join date" error={errors.joinDate}>
        <input type="date" value={form.joinDate} onChange={(e) => set('joinDate', e.target.value)} required className={inputCls} />
      </FormField>
      <FormField label="Avatar color" error={errors.avatarColor}>
        <input type="color" value={form.avatarColor} onChange={(e) => set('avatarColor', e.target.value)} className="h-10 w-16 rounded border border-slate-300" />
      </FormField>

      {errors._ && (
        <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
          {errors._}
        </div>
      )}

      <div className="flex gap-2 mt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-md bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-md border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

const inputCls = 'w-full px-3 py-2 rounded-md border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none text-sm';

function FormField({ label, error, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-500">{label}</label>
      {children}
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  );
}
