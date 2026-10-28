// src/components/Sidebar.jsx
// Responsive sidebar. On desktop (md+) it's a fixed left column.
// On mobile it's a slide-in drawer controlled by `open` / `onClose`.
import { NavIcon } from './Icons.jsx';

function NavList({ items, activeKey, onSelect }) {
  return (
    <nav className="flex flex-col gap-1" aria-label="Main navigation">
      {items.map((item) => {
        const isActive = item.key === activeKey;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item.key)}
            aria-current={isActive ? 'page' : undefined}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition w-full text-left ${
              isActive
                ? 'bg-violet-50 text-violet-700 border border-violet-200'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
            }`}
          >
            <NavIcon name={item.icon} size={18} className="shrink-0" />
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default function Sidebar({ items, activeKey, onSelect, open, onClose }) {
  return (
    <>
      {/* Desktop: fixed sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-64 md:fixed md:inset-y-0 md:border-r md:border-slate-200 md:bg-white">
        <div className="flex items-center gap-2.5 h-16 px-5 border-b border-slate-200">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white font-bold flex items-center justify-center text-lg">
            F
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-bold text-slate-900">FegHR V1</span>
            <span className="text-xs text-slate-500">HR Prototype</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavList items={items} activeKey={activeKey} onSelect={onSelect} />
        </div>
        <div className="p-3 border-t border-slate-200 text-xs text-slate-400">
          FegHR Demo · Asia/Dhaka
        </div>
      </aside>

      {/* Mobile: slide-in drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={onClose}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[80%] bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between h-16 px-5 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white font-bold flex items-center justify-center text-lg">
                  F
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="font-bold text-slate-900">FegHR V1</span>
                  <span className="text-xs text-slate-500">HR Prototype</span>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close menu"
                className="p-2 rounded-md hover:bg-slate-100 text-slate-500"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <NavList
                items={items}
                activeKey={activeKey}
                onSelect={(k) => {
                  onSelect(k);
                  onClose();
                }}
              />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
