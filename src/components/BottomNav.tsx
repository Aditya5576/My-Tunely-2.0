import React from 'react';
import { Compass, Search, Library, HardDriveDownload } from 'lucide-react';
import { useUser } from '../context/UserContext';

export type NavTab = 'home' | 'search' | 'library' | 'downloads';

interface BottomNavProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onSelectTab }) => {
  const { offlineTracks } = useUser();

  const navItems = [
    { id: 'home' as NavTab, label: 'Home', icon: Compass },
    { id: 'search' as NavTab, label: 'Search', icon: Search },
    { id: 'library' as NavTab, label: 'Library', icon: Library },
    {
      id: 'downloads' as NavTab,
      label: 'Offline',
      icon: HardDriveDownload,
      badge: offlineTracks.length > 0 ? offlineTracks.length : null,
    },
  ];

  return (
    <nav className="shrink-0 w-full z-30 bg-[var(--bg-elevated)] border-t border-[var(--border-subtle)] px-3 pt-1 safe-nav-pad transition-colors duration-150">
      <div className="grid grid-cols-4 items-center gap-1.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              aria-label={item.label}
              className={`min-h-[44px] w-full flex flex-col items-center justify-center py-1 rounded-2xl transition-all duration-150 ease-out active:scale-95 cursor-pointer select-none ${
                isActive
                  ? 'text-[var(--text-primary)] font-bold bg-[var(--accent-soft)] border border-[var(--accent-border)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] border border-transparent'
              }`}
            >
              <div className="relative flex items-center justify-center">
                <Icon
                  className={`w-5 h-5 transition-transform duration-150 ease-out ${
                    isActive ? 'scale-110 text-[var(--accent-primary)]' : ''
                  }`}
                />
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 px-1 min-w-[14px] h-3.5 rounded-full bg-indigo-500 text-[9px] font-bold text-white flex items-center justify-center shadow-sm">
                    {item.badge}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] mt-1 tracking-tight leading-none ${
                  isActive ? 'text-[var(--text-primary)] font-semibold' : 'text-[var(--text-secondary)]'
                }`}
              >
                {item.label}
              </span>
              {isActive && (
                <span className="w-3.5 h-0.5 rounded-full bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] mt-1" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
