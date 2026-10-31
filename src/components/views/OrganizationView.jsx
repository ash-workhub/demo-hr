// src/components/views/OrganizationView.jsx
// V2 Step 1 — Organization management (HR/Admin only).
// Three tabs: Branches, Departments, Designations.
// Each tab: list + create form + edit/deactivate.
// Plus an "Assignment History" lookup for any employee.
'use client';
import { useCallback, useEffect, useState } from 'react';

const STATUS_STYLES = {
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  inactive: 'bg-slate-100 text-slate-500 border-slate-200',
};

export default function OrganizationView({ user }) {
  const [tab, setTab] = useState('branches');

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Organization</h2>
        <p className="text-sm text-slate-500 mt-1">
          Manage branches, departments, designations · view employee movement history
        </p>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {['branches', 'departments', 'designations', 'history'].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition capitalize ${
              tab === t ? 'bg-violet-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'branches' && <ReferenceManager type="branches" label="Branch" pluralLabel="Branches" fields={['code', 'name', 'address']} />}
      {tab === 'departments' && <ReferenceManager type="departments" label="Department" pluralLabel="Departments" fields={['code', 'name']} />}
      {tab === 'designations' && <ReferenceManager type="designations" label="Designation" pluralLabel="Designations" fields={['code', 'name']} />}
      {tab === 'history' && <AssignmentHistoryLookup />}
    </div>
  );
}

// ============================================================
// Generic reference-record manager (branches / departments / designations)
// ============================================================
function ReferenceManager({ type, label, pluralLabel, fields }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/${type}?status=all`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({});
    setFormError('');
    setShowForm(true);
  }

  function openEdit(item) {
    setEditing(item);
    setForm({ code: item.code, name: item.name, address: item.address || '' });
    setFormError('');
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const url = editing ? `/api/${type}/${editing.id}` : `/api/${type}`;
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error?._ || Object.values(data.error || {})[0] || 'Failed to save');
      } else {
        setShowForm(false);
        load();
      }
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(item) {
    if (!confirm(`Deactivate ${label.toLowerCase()} '${item.name}'? It will be hidden from new assignments but preserved in history.`)) return;
    try {
      const res = await fetch(`/api/${type}/${item.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error?._ || 'Failed to deactivate');
      } else {
        load();
      }
    } catch (e) {
      alert(e.message);
    }
  }

  if (loading) return <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">Loading…</div>;
  if (error) return <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">{error}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900">{pluralLabel} ({items.length})</h3>
        <button
          type="button"
          onClick={openCreate}
          className="px-3 py-1.5 rounded-md bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700"
        >
          + New {label.toLowerCase()}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {items.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No {label.toLowerCase()}s yet.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{item.code}</span>
                    <span className="font-medium text-slate-900">{item.name}</span>
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${STATUS_STYLES[item.status]}`}>
                      {item.status}
                    </span>
                  </div>
                  {item.address && <div className="text-xs text-slate-500 mt-0.5">{item.address}</div>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => openEdit(item)} className="px-2.5 py-1 rounded text-xs font-medium text-violet-600 hover:bg-violet-50">Edit</button>
                  {item.status === 'active' && (
                    <button type="button" onClick={() => handleDeactivate(item)} className="px-2.5 py-1 rounded text-xs font-medium text-rose-600 hover:bg-rose-50">Deactivate</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setShowForm(false)} aria-hidden="true" />
          <aside className="relative ml-auto w-full max-w-md bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between h-16 px-5 border-b border-slate-200 shrink-0">
              <span className="font-semibold text-slate-900">{editing ? `Edit ${label.toLowerCase()}` : `New ${label.toLowerCase()}`}</span>
              <button type="button" onClick={() => setShowForm(false)} aria-label="Close" className="p-2 rounded-md hover:bg-slate-100 text-slate-500">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Code</label>
                <input
                  type="text"
                  value={form.code || ''}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  required
                  maxLength={20}
                  placeholder="e.g. DHK-01"
                  className="w-full px-3 py-2 rounded-md border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Name</label>
                <input
                  type="text"
                  value={form.name || ''}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  maxLength={80}
                  placeholder="e.g. Dhaka HQ"
                  className="w-full px-3 py-2 rounded-md border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none text-sm"
                />
              </div>
              {fields.includes('address') && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Address</label>
                  <textarea
                    value={form.address || ''}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    rows={2}
                    maxLength={200}
                    className="w-full px-3 py-2 rounded-md border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none text-sm resize-none"
                  />
                </div>
              )}
              {formError && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">{formError}</div>}
              <div className="flex gap-2 mt-2">
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-md bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-60">
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-md border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50">Cancel</button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Assignment history lookup
// ============================================================
function AssignmentHistoryLookup() {
  const [employees, setEmployees] = useState([]);
  const [selected, setSelected] = useState('');
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/employees?limit=50', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        setEmployees(data.items || []);
      } catch {}
    })();
  }, []);

  async function loadHistory(empId) {
    setSelected(empId);
    setHistory(null);
    if (!empId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/assignments/${empId}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setHistory(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(d) {
    if (!d) return 'current';
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900 mb-4">Employee Assignment History</h3>
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <label className="block text-xs font-medium text-slate-500 mb-1">Select employee</label>
        <select
          value={selected}
          onChange={(e) => loadHistory(e.target.value)}
          className="w-full px-3 py-2 rounded-md border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none text-sm bg-white"
        >
          <option value="">— Choose an employee —</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.fullName} ({e.employeeId})</option>
          ))}
        </select>
      </div>

      {loading && <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">Loading…</div>}
      {error && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">{error}</div>}

      {history && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h4 className="font-semibold text-slate-900">{history.employee.fullName}</h4>
            <p className="text-xs text-slate-500">{history.employee.employeeCode} · joined {formatDate(history.employee.joinDate)}</p>
          </div>
          {history.history.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-sm">No assignment history.</div>
          ) : (
            <ol className="divide-y divide-slate-100">
              {history.history.map((h, i) => (
                <li key={h.id} className="px-6 py-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">#{history.history.length - i}</span>
                    {h.isCurrent && <span className="text-xs font-semibold px-1.5 py-0.5 rounded border bg-emerald-100 text-emerald-700 border-emerald-200">CURRENT</span>}
                    <span className="text-xs text-slate-500">{formatDate(h.effectiveDate)} → {formatDate(h.endDate)}</span>
                  </div>
                  <div className="text-sm text-slate-700 grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                    <div><span className="text-slate-400">Branch:</span> {h.branchName || '—'}</div>
                    <div><span className="text-slate-400">Department:</span> {h.departmentName || '—'}</div>
                    <div><span className="text-slate-400">Designation:</span> {h.designationName || '—'}</div>
                    <div><span className="text-slate-400">Manager:</span> {h.managerName || '—'}</div>
                  </div>
                  {h.reason && <div className="text-xs text-slate-500 mt-1 italic">"{h.reason}"</div>}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
