import React, { useState, useEffect } from 'react';
import {
  X,
  Smartphone,
  Trash2,
  LogOut,
  Cloud,
  HardDrive,
  Loader2,
  Radio,
  ChevronRight,
  Sparkles,
  Palette,
  ShieldCheck,
  Search,
  Clock,
} from 'lucide-react';
import { useUser } from '../context/UserContext';
import { useTheme } from '../context/ThemeContext';
import { useAudio } from '../hooks/useAudio';
import { formatFileSize } from '../utils/audioCore';
import { TunelyLogo } from './TunelyLogo';
import { GUEST_SEARCH_LIMIT, GUEST_PLAYBACK_LIMIT_SECONDS } from '../utils/guestLimits';

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenQualityModal?: () => void;
  onOpenAppearanceModal?: () => void;
}

const PROFILE_LABELS: Record<string, string> = {
  studio: 'Studio Master',
  bass: 'Deep Bass',
  vocal: 'Vocal Focus',
  concert: 'Concert 3D',
  night: 'Night Chill',
  flat: 'Pure Flat',
};

export const UserModal: React.FC<UserModalProps> = ({
  isOpen,
  onClose,
  onOpenQualityModal,
  onOpenAppearanceModal,
}) => {
  const {
    activeEmail,
    isGuest,
    isLoggedIn,
    isCloudSynced,
    cloudAuthLoading,
    cloudError,
    profile,
    offlineTracks,
    likedSongs,
    playlists,
    guestUsage,
    loginWithGoogle,
    logout,
    updateAutoResume,
    clearAllDownloads,
    manualSyncCloudNow,
  } = useUser();

  const { activeQuality, soundProfile } = useAudio();
  const { themeMeta, fontMeta } = useTheme();

  const [autoResumeEnabled, setAutoResumeEnabled] = useState(
    profile?.autoResumeOnInterruption ?? true
  );
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  useEffect(() => {
    setAutoResumeEnabled(profile?.autoResumeOnInterruption ?? true);
  }, [profile?.autoResumeOnInterruption]);

  if (!isOpen) return null;

  const totalOfflineBytes = offlineTracks.reduce((acc, t) => acc + (t.sizeBytes || 0), 0);
  const qualityBadge = (profile?.preferredQuality || activeQuality).replace('kbps', ' kbps');
  const soundLabel = PROFILE_LABELS[profile?.soundProfile || soundProfile] || 'Studio Master';

  const handleGoogleSignIn = async () => {
    const res = await loginWithGoogle();
    if (res.success) {
      setSyncFeedback('Signed in with Google!');
      setTimeout(() => {
        setSyncFeedback(null);
        onClose();
      }, 500);
    }
  };

  const handleManualSync = async () => {
    setSyncFeedback('Syncing to Google Cloud...');
    await manualSyncCloudNow();
    setSyncFeedback('All playlists and likes synced!');
    setTimeout(() => setSyncFeedback(null), 2500);
  };

  const handleLogout = async () => {
    await logout();
    onClose();
  };

  const handleToggleAutoResume = async () => {
    const nextVal = !autoResumeEnabled;
    setAutoResumeEnabled(nextVal);
    await updateAutoResume(nextVal);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm px-4 safe-modal-inset animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-[var(--bg-elevated)] border border-[var(--border-strong)] p-5 shadow-2xl text-[var(--text-primary)] relative max-h-full overflow-y-auto no-scrollbar animate-sheet-up"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center transition active:scale-90 cursor-pointer z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="space-y-4">
          {/* User Profile Card */}
          <div className="flex items-center gap-3.5 pr-10 pt-1">
            {profile?.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={profile.name}
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-2xl object-cover shadow shrink-0 border border-[var(--border-subtle)]"
              />
            ) : (
              <div
                className={`w-12 h-12 rounded-2xl bg-gradient-to-tr ${
                  isGuest
                    ? 'from-slate-600 to-slate-700'
                    : profile?.avatarColor || 'from-violet-600 to-indigo-600'
                } flex items-center justify-center text-lg font-bold text-white shadow shrink-0`}
              >
                {isGuest ? 'G' : profile?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h3 className="font-bold text-base text-[var(--text-primary)] truncate">
                  {profile?.name || (isGuest ? 'Guest Listener' : 'Listener')}
                </h3>
                {isGuest ? (
                  <span className="px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-400 text-[10px] font-bold shrink-0">
                    Guest
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 text-[10px] font-bold shrink-0">
                    Google
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                {isGuest ? 'Limited local preview session' : activeEmail}
              </p>
            </div>
          </div>

          {/* Guest Mode Restriction Card */}
          {isGuest && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-500 dark:text-amber-300">
                  Guest Mode Limits
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">Local device</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center gap-2">
                  <Search className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-[var(--text-secondary)]">Searches</p>
                    <p className="font-bold text-[var(--text-primary)] tabular-nums">
                      {guestUsage.searchesCount} / {GUEST_SEARCH_LIMIT}
                    </p>
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-[var(--text-secondary)]">Playback</p>
                    <p className="font-bold text-[var(--text-primary)] tabular-nums">
                      {Math.floor(guestUsage.playbackSeconds / 60)} / {Math.floor(GUEST_PLAYBACK_LIMIT_SECONDS / 60)} min
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                disabled={cloudAuthLoading}
                onClick={handleGoogleSignIn}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-900 text-xs font-bold flex items-center justify-center gap-2 shadow transition active:scale-95 cursor-pointer disabled:opacity-60"
              >
                {cloudAuthLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                ) : (
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                )}
                <span>Sign in with Google for Unlimited</span>
              </button>
            </div>
          )}

          {/* Cloud Sync Status Card (when signed in) */}
          {isLoggedIn && (
            <div
              className={`p-3.5 rounded-2xl border flex items-center justify-between gap-2 ${
                isCloudSynced
                  ? 'bg-emerald-500/10 border-emerald-500/35'
                  : 'bg-[var(--bg-surface)] border-[var(--border-subtle)]'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Cloud className="w-4 h-4 text-emerald-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                    Synced Across Devices
                  </p>
                  <p className="text-[11px] text-[var(--text-secondary)] truncate">
                    Playlists &amp; likes saved to Firebase Cloud
                  </p>
                </div>
              </div>
              <button
                onClick={handleManualSync}
                disabled={cloudAuthLoading}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--pill-active-bg)] text-[var(--pill-active-text)] text-xs font-bold shrink-0 hover:opacity-90 transition cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {cloudAuthLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Sync Now'}
              </button>
            </div>
          )}

          {syncFeedback && (
            <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-500 dark:text-emerald-300 text-xs font-medium text-center">
              {syncFeedback}
            </div>
          )}

          {cloudError && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-200 text-xs">
              {cloudError}
            </div>
          )}

          {/* User Stats */}
          <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-center">
            <div>
              <p className="text-base font-bold text-[var(--text-primary)] tabular-nums">
                {likedSongs.length}
              </p>
              <p className="text-xs text-[var(--text-secondary)]">Liked</p>
            </div>
            <div>
              <p className="text-base font-bold text-[var(--text-primary)] tabular-nums">
                {playlists.length}
              </p>
              <p className="text-xs text-[var(--text-secondary)]">Playlists</p>
            </div>
            <div>
              <p className="text-base font-bold text-[var(--text-primary)] tabular-nums">
                {offlineTracks.length}
              </p>
              <p className="text-xs text-[var(--text-secondary)]">Offline</p>
            </div>
          </div>

          {/* Settings Section */}
          <div className="space-y-2.5 pt-2 border-t border-[var(--border-subtle)]">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] block">
              Preferences
            </span>

            {/* Theme & Font Customizer Trigger */}
            {onOpenAppearanceModal && (
              <button
                type="button"
                onClick={onOpenAppearanceModal}
                className="w-full min-h-[52px] p-3.5 rounded-2xl bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] flex items-center justify-between text-left transition cursor-pointer active:scale-[0.98]"
              >
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <Palette className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                      Theme &amp; Font Family
                    </p>
                    <p className="text-[11px] text-[var(--text-secondary)] truncate">
                      {themeMeta.label} · {fontMeta.label}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
              </button>
            )}

            {/* Audio Quality & Sound Mastering Trigger */}
            {onOpenQualityModal && (
              <button
                type="button"
                onClick={onOpenQualityModal}
                className="w-full min-h-[52px] p-3.5 rounded-2xl bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] flex items-center justify-between text-left transition cursor-pointer active:scale-[0.98]"
              >
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <Radio className="w-4 h-4 text-emerald-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                      Streaming Quality &amp; EQ
                    </p>
                    <p className="text-[11px] text-[var(--text-secondary)] truncate">
                      {qualityBadge} · {soundLabel}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
              </button>
            )}

            {/* Auto-Resume on Phone Call Interruption */}
            <div className="p-3.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-between">
              <div className="flex items-center gap-2.5 pr-2">
                <Smartphone className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-[var(--text-primary)]">
                    Auto-Resume Playback
                  </p>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Resumes music after phone calls automatically
                  </p>
                </div>
              </div>
              <button
                onClick={handleToggleAutoResume}
                aria-label="Toggle auto-resume on call interruption"
                className={`w-11 h-6 rounded-full transition-colors p-0.5 cursor-pointer shrink-0 flex items-center ${
                  autoResumeEnabled ? 'bg-indigo-600' : 'bg-slate-400 dark:bg-slate-700'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                    autoResumeEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Offline Storage Info */}
            <div className="p-3.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-[var(--text-primary)]">
                  Local Device Storage
                </p>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {formatFileSize(totalOfflineBytes)} used for offline cache
                </p>
              </div>
              {offlineTracks.length > 0 && (
                <button
                  onClick={clearAllDownloads}
                  className="min-h-[44px] px-3 text-xs text-rose-500 hover:text-rose-400 flex items-center gap-1 font-semibold transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Clear</span>
                </button>
              )}
            </div>
          </div>

          {/* App Info / Developer Credit Card */}
          <div className="p-3.5 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent-border)] flex items-center gap-3">
            <TunelyLogo size={36} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-extrabold text-[var(--text-primary)] tracking-tight">
                  Tunely 2.0
                </p>
                <Sparkles className="w-3 h-3 text-[var(--accent-primary)] shrink-0" />
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                Developed by{' '}
                <span className="font-bold text-[var(--accent-primary)]">Aditya Patil</span>
              </p>
            </div>
          </div>

          {/* Sign Out Action (when authenticated) */}
          {isLoggedIn && (
            <div className="pt-1 border-t border-[var(--border-subtle)]">
              <button
                onClick={handleLogout}
                className="w-full min-h-[44px] py-2.5 rounded-xl bg-[var(--bg-surface)] hover:bg-rose-500/15 border border-[var(--border-subtle)] hover:border-rose-500/35 text-rose-500 dark:text-rose-400 text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer active:scale-95"
              >
                <LogOut className="w-4 h-4" />
                <span>Log Out of Google Account</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
