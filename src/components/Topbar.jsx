// src/components/Topbar.jsx
// Top bar: mobile hamburger, page title, notification bell (with unread count),
// user chip (avatar + name + role), sign out.
import { useEffect, useState } from 'react';
import { MenuIcon, BellIcon, LogOutIcon } from './Icons.jsx';
import SignOutButton from './SignOutButton.jsx';

const ROLE_STYLES = {
  admin: 'bg-rose-100 text-rose-700 border-rose-200',
  hr: 'bg-pink-100 text-pink-700 border-pink-200',
  manager: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  employee: 'bg-slate-100 text-slate-700 border-slate-200',
};

function Avatar({ name, color }) {
  const initials = (name || '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
      style={{ backgroundColor: color || '#6b7280' }}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}

export default function Topbar({ user, employee, title, unreadNotifications, onOpenMenu, onOpenNotifications }) {
  const roleStyle = ROLE_STYLES[user.role] || ROLE_STYLES.employee;

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/90 backdrop-blur border-b border-slate-200 flex items-center gap-3 px-4 md:px-6">
      {/* Mobile menu button */}
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Open menu"
        className="md:hidden p-2 rounded-md hover:bg-slate-100 text-slate-600"
      >
        <MenuIcon size={22} />
      </button>

      {/* Title */}
      <h1 className="text-lg font-semibold text-slate-900 truncate flex-1">
        {title}
      </h1>

      {/* Notifications bell */}
      <button
        type="button"
        onClick={onOpenNotifications}
        aria-label={`Notifications${unreadNotifications > 0 ? `, ${unreadNotifications} unread` : ''}`}
        className="relative p-2 rounded-md hover:bg-slate-100 text-slate-600"
      >
        <BellIcon size={20} />
        {unreadNotifications > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center"
            aria-hidden="true"
          >
            {unreadNotifications > 9 ? '9+' : unreadNotifications}
          </span>
        )}
      </button>

      {/* User chip */}
      <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200">
        <Avatar name={user.name} color={employee?.avatarColor} />
        <div className="hidden sm:flex flex-col leading-tight">
          <span className="text-sm font-medium text-slate-900 truncate max-w-[140px]">
            {user.name}
          </span>
          <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded border ${roleStyle} w-fit`}>
            {user.role}
          </span>
        </div>
      </div>

      {/* Sign out (desktop inline, mobile icon-only) */}
      <div className="hidden md:block">
        <SignOutButton />
      </div>
    </header>
  );
}
