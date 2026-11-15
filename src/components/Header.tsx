import React from 'react';
import { User, WifiOff, Cloud, Palette } from 'lucide-react';
import { useUser } from '../context/UserContext';
import { PWAInstallButton } from './PWAInstallButton';

interface HeaderProps {
  onOpenUserModal: () => void;
  onOpenQualityModal: () => void;
  onOpenAppearanceModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenUserModal,
  onOpenAppearanceModal,
}) => {
  const { activeEmail, isLoggedIn, isCloudSynced, profile, isOfflineModeOnly } = useUser();

  const userInitial = profile?.name
    ? profile.name.charAt(0).toUpperCase()
    : activeEmail.charAt(0).toUpperCase();

  return (
    <header className="shrink-0 z-30 w-full bg-[var(--bg-elevated)] px-3.5 sm:px-5 safe-header-pad pb-2.5 flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] transition-colors duration-200">
      {/* Brand Lockup */}
      <div className="flex items-center gap-2 sm:gap-2.5 min-h-[44px] min-w-0 whitespace-nowrap shrink-0 select-none group">
        {/* Clean Proportional Logo Mark */}
        <div
          className="relative flex items-center justify-center w-[48px] h-[28px] sm:w-[54px] sm:h-[32px] shrink-0"
          aria-hidden="true"
        >
          <img
            src="/tunely-header-logo.png"
            alt="Tunely"
            draggable={false}
            className="w-full h-full object-contain select-none"
          />
        </div>

        {/* Sculpted Wordmark + Gradient Edition Superscript */}
        <div className="flex items-start gap-1 leading-none min-w-0">
          <span className="font-display font-extrabold text-[21px] sm:text-[22px] text-[var(--text-primary)] tracking-[-0.045em] leading-none">
            Tunely
          </span>
          <span className="font-mono text-[10px] sm:text-[10.5px] font-extrabold tracking-[0.04em] leading-none pt-[1px] bg-gradient-to-r from-pink-500 via-indigo-400 to-cyan-400 bg-clip-text text-transparent">
            2.0
          </span>
        </div>
      </div>

      {/* Right Controls: Clean 44px touch targets */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {isOfflineModeOnly && (
          <span className="flex items-center gap-1.5 text-amber-500 text-xs font-semibold whitespace-nowrap mr-0.5">
            <WifiOff className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Offline</span>
          </span>
        )}

        <button
          type="button"
          onClick={onOpenAppearanceModal}
          aria-label="Customize Theme and Font"
          title="Theme & Font Family"
          className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent-primary)] flex items-center justify-center transition-all duration-150 cursor-pointer active:scale-90"
        >
          <Palette className="w-4 h-4" />
        </button>

        <PWAInstallButton compact />

        {!isLoggedIn ? (
          <button
            onClick={onOpenUserModal}
            className="min-h-[44px] px-4 py-2 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all duration-150 shadow-md shadow-indigo-600/25 cursor-pointer flex items-center justify-center active:scale-95 whitespace-nowrap"
          >
            Sign In
          </button>
        ) : (
          <button
            onClick={onOpenUserModal}
            aria-label="User Account and Settings"
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-all duration-150 cursor-pointer active:scale-95 ${
              isCloudSynced
                ? 'gap-1.5 p-1 pl-2.5 sm:gap-2 sm:pl-3'
                : 'w-11 h-11 p-1 sm:w-auto sm:h-auto sm:gap-2 sm:p-1 sm:pl-3'
            }`}
          >
            {isCloudSynced && <Cloud className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
            <span className="max-w-[85px] truncate hidden sm:inline font-medium">
              {profile?.name || activeEmail.split('@')[0]}
            </span>
            {profile?.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={profile.name}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-full object-cover shadow-sm shrink-0"
              />
            ) : (
              <div
                className={`w-8 h-8 rounded-full bg-gradient-to-tr ${
                  profile?.avatarColor || 'from-violet-600 to-indigo-600'
                } flex items-center justify-center text-xs font-bold text-white shadow-sm shrink-0`}
              >
                {userInitial || <User className="w-4 h-4" />}
              </div>
            )}
          </button>
        )}
      </div>
    </header>
  );
};
