// src/components/views/AttendanceAdminView.jsx
// V2 Step 2 — Attendance admin (HR/Admin only).
// 5 tabs: Policies, Holidays, Schedules, Corrections, Reviews.
'use client';
import { useCallback, useEffect, useState } from 'react';

const STATUS_STYLES = {
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  inactive: 'bg-slate-100 text-slate-500 border-slate-200',
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  confirmed: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  applied: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-100 text-rose-700 border-rose-200',
  acknowledged: 'bg-slate-100 text-slate-500 border-slate-200',
  dismissed: 'bg-slate-100 text-slate-500 border-slate-200',
  upheld: 'bg-rose-100 text-rose-700 border-rose-200',
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function AttendanceAdminView({ user }) {
  const [tab, setTab] = useState('policies');

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Attendance Admin</h2>
        <p className="text-sm text-slate-500 mt-1">
          Policies · Holidays · Schedules · Corrections · Review queue
        </p>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {['policies', 'holidays', 'schedules', 'corrections', 'reviews'].map((t) => (
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

      {tab === 'policies' && <PoliciesTab />}
      {tab === 'holidays' && <HolidaysTab />}
      {tab === 'schedules' && <SchedulesTab />}
      {tab === 'corrections' && <CorrectionsTab />}
      {tab === 'reviews' && <ReviewsTab />}
    </div>
  );
}

// ============================================================
// Policies tab
// ============================================================
function PoliciesTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', effectiveDate: '', workdays: [1,2,3,4,5], startTime: '09:00', endTime: '17:00', graceMinutes: 15 });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/attendance/policies?status=all', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setItems(d.items || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true); setFormError('');
    try {
      const res = await fetch('/api/attendance/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) setFormError(d.error?._ || Object.values(d.error || {})[0] || 'Failed');
      else { setShowForm(false); load(); }
    } catch (e) { setFormError(e.message); }
    finally { setSaving(false); }
  }

  async function handleDeactivate(id) {
    if (!confirm('Deactivate this policy? It will be preserved in history.')) return;
    await fetch(`/api/attendance/policies/${id}`, { method: 'DELETE' });
    load();
  }

  function toggleWorkday(d) {
    setForm((f) => ({
      ...f,
      workdays: f.workdays.includes(d) ? f.workdays.filter((x) => x !== d) : [...f.workdays, d].sort(),
    }));
  }

  if (loading) return <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>;
  if (error) return <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">{error}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900">Attendance Policies ({items.length})</h3>
        <button type="button" onClick={() => setShowForm(true)} className="px-3 py-1.5 rounded-md bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700">+ New Policy</button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {items.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No policies yet. Create one to define workdays, hours, and grace period.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((p) => (
              <li key={p.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">{p.name}</span>
                      {p.isCurrent && <span className="text-xs font-semibold px-1.5 py-0.5 rounded border bg-emerald-100 text-emerald-700 border-emerald-200">CURRENT</span>}
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${STATUS_STYLES[p.status]}`}>{p.status}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {p.workdays.map((d) => WEEKDAY_LABELS[d]).join(', ')} · {p.startTime}–{p.endTime} · grace {p.graceMinutes}min · late after {String(Math.floor(p.lateAfterMinutes/60)).padStart(2,'0')}:{String(p.lateAfterMinutes%60).padStart(2,'0')}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">Effective {formatDate(p.effectiveDate)}{p.endDate ? ` → ${formatDate(p.endDate)}` : ' → current'}</div>
                  </div>
                  {p.status === 'active' && (
                    <button type="button" onClick={() => handleDeactivate(p.id)} className="px-2.5 py-1 rounded text-xs font-medium text-rose-600 hover:bg-rose-50">Deactivate</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setShowForm(false)} />
          <aside className="relative ml-auto w-full max-w-md bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between h-16 px-5 border-b border-slate-200 shrink-0">
              <span className="font-semibold text-slate-900">New Attendance Policy</span>
              <button type="button" onClick={() => setShowForm(false)} className="p-2 rounded hover:bg-slate-100 text-slate-500">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Name</label>
                <input type="text" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} required maxLength={80} className="w-full px-3 py-2 rounded-md border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Effective date</label>
                <input type="date" value={form.effectiveDate} onChange={(e) => setForm({...form, effectiveDate: e.target.value})} required className="w-full px-3 py-2 rounded-md border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Workdays</label>
                <div className="flex gap-1">
                  {WEEKDAY_LABELS.map((label, idx) => (
                    <button key={idx} type="button" onClick={() => toggleWorkday(idx)}
                      className={`px-2 py-1 rounded text-xs font-medium ${form.workdays.includes(idx) ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Start time</label>
                  <input type="time" value={form.startTime} onChange={(e) => setForm({...form, startTime: e.target.value})} required className="w-full px-3 py-2 rounded-md border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">End time</label>
                  <input type="time" value={form.endTime} onChange={(e) => setForm({...form, endTime: e.target.value})} required className="w-full px-3 py-2 rounded-md border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Grace period (minutes)</label>
                <input type="number" value={form.graceMinutes} onChange={(e) => setForm({...form, graceMinutes: parseInt(e.target.value, 10)})} min={0} max={120} required className="w-full px-3 py-2 rounded-md border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none text-sm" />
              </div>
              {formError && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">{formError}</div>}
              <div className="flex gap-2 mt-2">
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-md bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
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
// Holidays tab
// ============================================================
function HolidaysTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: '', name: '', type: 'company' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/attendance/holidays?status=all', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setItems(d.items || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true); setFormError('');
    try {
      const res = await fetch('/api/attendance/holidays', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) setFormError(d.error?._ || Object.values(d.error || {})[0] || 'Failed');
      else { setShowForm(false); setForm({ date: '', name: '', type: 'company' }); load(); }
    } catch (e) { setFormError(e.message); }
    finally { setSaving(false); }
  }

  async function handleDeactivate(id) {
    if (!confirm('Deactivate this holiday?')) return;
    await fetch(`/api/attendance/holidays/${id}`, { method: 'DELETE' });
    load();
  }

  if (loading) return <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>;
  if (error) return <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">{error}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900">Holidays ({items.length})</h3>
        <button type="button" onClick={() => setShowForm(true)} className="px-3 py-1.5 rounded-md bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700">+ New Holiday</button>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {items.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No holidays defined.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((h) => (
              <li key={h.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{h.name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 capitalize">{h.type}</span>
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${STATUS_STYLES[h.status]}`}>{h.status}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{h.date}</div>
                </div>
                {h.status === 'active' && <button type="button" onClick={() => handleDeactivate(h.id)} className="px-2.5 py-1 rounded text-xs font-medium text-rose-600 hover:bg-rose-50">Deactivate</button>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {showForm && (
        <div className="fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setShowForm(false)} />
          <aside className="relative ml-auto w-full max-w-md bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between h-16 px-5 border-b border-slate-200 shrink-0">
              <span className="font-semibold text-slate-900">New Holiday</span>
              <button type="button" onClick={() => setShowForm(false)} className="p-2 rounded hover:bg-slate-100 text-slate-500">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Date</label>
                <input type="date" value={form.date} onChange={(e) => setForm({...form, date: e.target.value})} required className="w-full px-3 py-2 rounded-md border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Name</label>
                <input type="text" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} required maxLength={100} className="w-full px-3 py-2 rounded-md border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
                <select value={form.type} onChange={(e) => setForm({...form, type: e.target.value})} className="w-full px-3 py-2 rounded-md border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none text-sm bg-white">
                  <option value="company">Company</option>
                  <option value="national">National</option>
                  <option value="religious">Religious</option>
                </select>
              </div>
              {formError && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">{formError}</div>}
              <div className="flex gap-2 mt-2">
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-md bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
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
// Schedules tab (list + create)
// ============================================================
function SchedulesTab() {
  const [items, setItems] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ employeeId: '', effectiveDate: '', customStartTime: '', customEndTime: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [schedRes, empRes, polRes] = await Promise.all([
        fetch('/api/attendance/schedules', { cache: 'no-store' }),
        fetch('/api/employees?limit=50', { cache: 'no-store' }),
        fetch('/api/attendance/policies?status=active', { cache: 'no-store' }),
      ]);
      const [sched, emp, pol] = await Promise.all([schedRes.json(), empRes.json(), polRes.json()]);
      setItems(sched.items || []);
      setEmployees(emp.items || []);
      setPolicies(pol.items || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true); setFormError('');
    try {
      const res = await fetch('/api/attendance/schedules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          customStartTime: form.customStartTime || null,
          customEndTime: form.customEndTime || null,
          customWorkdays: [],
        }),
      });
      const d = await res.json();
      if (!res.ok) setFormError(d.error?._ || Object.values(d.error || {})[0] || 'Failed');
      else { setShowForm(false); setForm({ employeeId: '', effectiveDate: '', customStartTime: '', customEndTime: '', reason: '' }); load(); }
    } catch (e) { setFormError(e.message); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>;
  if (error) return <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">{error}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900">Employee Schedules ({items.length})</h3>
        <button type="button" onClick={() => setShowForm(true)} className="px-3 py-1.5 rounded-md bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700">+ Assign Schedule</button>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {items.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No custom schedules. All employees use the company policy.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((s) => (
              <li key={s.id} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {s.isCurrent && <span className="text-xs font-semibold px-1.5 py-0.5 rounded border bg-emerald-100 text-emerald-700 border-emerald-200">CURRENT</span>}
                  <span className="text-xs text-slate-500">Effective {formatDate(s.effectiveDate)}{s.endDate ? ` → ${formatDate(s.endDate)}` : ' → current'}</span>
                </div>
                <div className="text-sm text-slate-700 mt-1">
                  {s.customStartTime || s.customEndTime ? `${s.customStartTime || '—'}–${s.customEndTime || '—'}` : 'Uses company policy times'}
                  {s.reason && <span className="text-xs text-slate-400 ml-2">({s.reason})</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {showForm && (
        <div className="fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setShowForm(false)} />
          <aside className="relative ml-auto w-full max-w-md bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between h-16 px-5 border-b border-slate-200 shrink-0">
              <span className="font-semibold text-slate-900">Assign Schedule Override</span>
              <button type="button" onClick={() => setShowForm(false)} className="p-2 rounded hover:bg-slate-100 text-slate-500">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Employee</label>
                <select value={form.employeeId} onChange={(e) => setForm({...form, employeeId: e.target.value})} required className="w-full px-3 py-2 rounded-md border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none text-sm bg-white">
                  <option value="">— Select —</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName} ({e.employeeId})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Effective date</label>
                <input type="date" value={form.effectiveDate} onChange={(e) => setForm({...form, effectiveDate: e.target.value})} required className="w-full px-3 py-2 rounded-md border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Custom start (optional)</label>
                  <input type="time" value={form.customStartTime} onChange={(e) => setForm({...form, customStartTime: e.target.value})} className="w-full px-3 py-2 rounded-md border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Custom end (optional)</label>
                  <input type="time" value={form.customEndTime} onChange={(e) => setForm({...form, customEndTime: e.target.value})} className="w-full px-3 py-2 rounded-md border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Reason</label>
                <input type="text" value={form.reason} onChange={(e) => setForm({...form, reason: e.target.value})} maxLength={500} className="w-full px-3 py-2 rounded-md border border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none text-sm" />
              </div>
              {formError && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">{formError}</div>}
              <div className="flex gap-2 mt-2">
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-md bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
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
// Corrections tab (queue + action)
// ============================================================
function CorrectionsTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acting, setActing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/attendance/corrections?status=all', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setItems(d.items || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleAction(id, action, rejectReason = '') {
    setActing(id);
    try {
      const res = await fetch(`/api/attendance/corrections/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, rejectReason }),
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error?._ || 'Failed');
      } else { load(); }
    } finally { setActing(null); }
  }

  if (loading) return <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>;
  if (error) return <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">{error}</div>;

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900 mb-4">Corrections Queue ({items.length})</h3>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {items.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No corrections.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((c) => (
              <li key={c.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-900">{c.employeeName}</span>
                      <span className="text-xs text-slate-400">{c.employeeCode}</span>
                      <span className="text-xs text-slate-500">· {c.date}</span>
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${STATUS_STYLES[c.status]}`}>{c.status}</span>
                    </div>
                    <div className="text-sm text-slate-700 mt-1">
                      Field: <span className="font-mono text-xs">{c.field}</span> · {c.originalValue || 'null'} → <span className="font-mono text-xs">{c.correctedValue}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Reason: {c.reason}</div>
                    <div className="text-xs text-slate-400 mt-0.5">By {c.createdByName} · {formatDateTime(c.createdAt)}</div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {c.status === 'pending' && (
                      <button type="button" onClick={() => handleAction(c.id, 'confirm')} disabled={acting === c.id} className="px-2.5 py-1 rounded text-xs font-medium text-cyan-700 bg-cyan-50 hover:bg-cyan-100 disabled:opacity-60">Confirm</button>
                    )}
                    {c.status === 'confirmed' && (
                      <button type="button" onClick={() => handleAction(c.id, 'apply')} disabled={acting === c.id} className="px-2.5 py-1 rounded text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-60">Apply</button>
                    )}
                    {(c.status === 'pending' || c.status === 'confirmed') && (
                      <button type="button" onClick={() => { const r = prompt('Reject reason (optional):'); handleAction(c.id, 'reject', r || ''); }} disabled={acting === c.id} className="px-2.5 py-1 rounded text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 disabled:opacity-60">Reject</button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Reviews tab (flagged records queue)
// ============================================================
function ReviewsTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acting, setActing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/attendance/reviews?verdict=pending', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setItems(d.items || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleVerdict(id, verdict) {
    const note = prompt(`Review note for "${verdict}" (optional):`) || '';
    setActing(id);
    try {
      const res = await fetch(`/api/attendance/reviews/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verdict, note }),
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error?._ || 'Failed');
      } else { load(); }
    } finally { setActing(null); }
  }

  if (loading) return <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>;
  if (error) return <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">{error}</div>;

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900 mb-4">Review Queue — Pending ({items.length})</h3>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {items.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No pending reviews.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-900">{r.employeeName}</span>
                      <span className="text-xs text-slate-400">{r.employeeCode}</span>
                      <span className="text-xs text-slate-500">· {r.date}</span>
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${r.flagSeverity === 'high' ? 'bg-rose-100 text-rose-700 border-rose-200' : r.flagSeverity === 'medium' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>{r.flagSeverity}</span>
                    </div>
                    <div className="text-sm text-slate-700 mt-1">{r.flagReason}</div>
                    {r.attendance && (
                      <div className="text-xs text-slate-500 mt-1">
                        Check-in: {r.attendance.checkInTime ? formatDateTime(r.attendance.checkInTime) : '—'} · Check-out: {r.attendance.checkOutTime ? formatDateTime(r.attendance.checkOutTime) : '—'} · Status: {r.attendance.effectiveStatus}
                      </div>
                    )}
                    <div className="text-xs text-slate-400 mt-0.5">Flagged by {r.flaggedByName || r.source} · {formatDateTime(r.flaggedAt)}</div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button type="button" onClick={() => handleVerdict(r.id, 'acknowledged')} disabled={acting === r.id} className="px-2.5 py-1 rounded text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 disabled:opacity-60">Ack</button>
                    <button type="button" onClick={() => handleVerdict(r.id, 'dismissed')} disabled={acting === r.id} className="px-2.5 py-1 rounded text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 disabled:opacity-60">Dismiss</button>
                    <button type="button" onClick={() => handleVerdict(r.id, 'upheld')} disabled={acting === r.id} className="px-2.5 py-1 rounded text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 disabled:opacity-60">Uphold</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
