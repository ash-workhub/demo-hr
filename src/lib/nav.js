// src/lib/nav.js
// Role-aware navigation config. Each item has a `key` (matches view registry),
// a `label`, an `icon` (inline SVG component), and `roles` (who can see it).
// `roles: null` means everyone.

export const NAV_ITEMS = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: 'dashboard',
    roles: null,
  },
  {
    key: 'directory',
    label: 'Employee Directory',
    icon: 'people',
    roles: null,
  },
  {
    key: 'organization',
    label: 'Organization',
    icon: 'building',
    roles: ['hr', 'admin'],
  },
  {
    key: 'attendance',
    label: 'Daily Attendance',
    icon: 'clock',
    roles: null,
  },
  {
    key: 'attendance-admin',
    label: 'Attendance Admin',
    icon: 'clock',
    roles: ['hr', 'admin'],
  },
  {
    key: 'leave',
    label: 'Leave Requests',
    icon: 'calendar',
    roles: null,
  },
  {
    key: 'approvals',
    label: 'Approvals',
    icon: 'check',
    roles: ['manager', 'hr', 'admin'],
  },
  {
    key: 'notifications',
    label: 'Notifications',
    icon: 'bell',
    roles: null,
  },
];

// Returns the nav items visible to a given role.
export function navForRole(role) {
  return NAV_ITEMS.filter((item) => item.roles === null || item.roles.includes(role));
}

// Default view for a given role (the first item they can see).
export function defaultViewForRole(role) {
  return navForRole(role)[0]?.key || 'dashboard';
}

// All valid view keys (for validation).
export const ALL_VIEW_KEYS = NAV_ITEMS.map((i) => i.key);
