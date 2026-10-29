// src/components/AppShell.jsx
// Main authenticated shell. Client component — manages active view state
// (persisted to localStorage) and renders sidebar + topbar + active view.
'use client';
import { useEffect, useState } from 'react';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import { navForRole, defaultViewForRole, ALL_VIEW_KEYS } from '@/lib/nav.js';
import DashboardView from './views/DashboardView.jsx';
import DirectoryView from './views/DirectoryView.jsx';
import OrganizationView from './views/OrganizationView.jsx';
import AttendanceView from './views/AttendanceView.jsx';
import AttendanceAdminView from './views/AttendanceAdminView.jsx';
import LeaveView from './views/LeaveView.jsx';
import ApprovalsView from './views/ApprovalsView.jsx';
import NotificationsView from './views/NotificationsView.jsx';

const VIEWS = {
  dashboard: DashboardView,
  directory: DirectoryView,
  organization: OrganizationView,
  attendance: AttendanceView,
  'attendance-admin': AttendanceAdminView,
  leave: LeaveView,
  approvals: ApprovalsView,
  notifications: NotificationsView,
};

const VIEW_TITLES = {
  dashboard: 'Dashboard',
  directory: 'Employee Directory',
  organization: 'Organization',
  attendance: 'Daily Attendance',
  'attendance-admin': 'Attendance Admin',
  leave: 'Leave Requests',
  approvals: 'Approvals',
  notifications: 'Notifications',
};

const STORAGE_KEY = 'feghr:activeView';

export default function AppShell({ user, employee }) {
  const items = navForRole(user.role);
  const validKeys = new Set(items.map((i) => i.key));
  const fallback = defaultViewForRole(user.role);

  const [activeView, setActiveView] = useState(fallback);
  const [menuOpen, setMenuOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  // On mount, restore the saved view (if still valid for this role).
  // setState-in-effect is intentional here: we must read localStorage only on the
  // client (after hydration) to avoid SSR/CSR mismatch.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && validKeys.has(saved) && ALL_VIEW_KEYS.includes(saved) && saved !== activeView) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setActiveView(saved);
      }
    } catch {
      // localStorage may be unavailable — ignore.
    }
    setHydrated(true);
  }, []);

  // Persist view changes.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, activeView);
    } catch {
      // ignore
    }
  }, [activeView, hydrated]);

  // Fetch unread notification count (Step 8 will implement the real API;
  // for now it returns 0 and the bell just shows nothing).
  useEffect(() => {
    let cancelled = false;
    async function loadUnread() {
      try {
        const res = await fetch('/api/notifications/unread-count', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && typeof data.count === 'number') {
          setUnread(data.count);
        }
      } catch {
        // API not implemented yet (Step 8) — leave at 0.
      }
    }
    loadUnread();
    const interval = setInterval(loadUnread, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  function handleSelect(key) {
    if (validKeys.has(key)) {
      setActiveView(key);
    }
  }

  function handleOpenNotifications() {
    setActiveView('notifications');
  }

  // Allow child views (e.g. NotificationsView) to navigate to another view by key.
  function handleNavigate(viewKey) {
    if (validKeys.has(viewKey)) {
      setActiveView(viewKey);
    }
  }

  const ActiveView = VIEWS[activeView] || DashboardView;
  const title = VIEW_TITLES[activeView] || 'FegHR';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Sidebar
        items={items}
        activeKey={activeView}
        onSelect={handleSelect}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />
      <div className="md:pl-64 flex-1 flex flex-col">
        <Topbar
          user={user}
          employee={employee}
          title={title}
          unreadNotifications={unread}
          onOpenMenu={() => setMenuOpen(true)}
          onOpenNotifications={handleOpenNotifications}
        />
        <main className="flex-1 p-4 md:p-8">
          <div className="max-w-6xl mx-auto">
            <ActiveView user={user} employee={employee} onNavigate={handleNavigate} />
          </div>
        </main>
        <footer className="mt-auto py-4 px-6 text-center text-xs text-slate-400 border-t border-slate-200 bg-white">
          FegHR V1 prototype · FegHR Demo · timezone Asia/Dhaka
        </footer>
      </div>
    </div>
  );
}
