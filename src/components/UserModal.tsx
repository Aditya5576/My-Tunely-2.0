import React, { useState, useEffect } from 'react';
import {
  X,
  Mail,
  Lock,
  Plus,
  Trash2,
  Smartphone,
  Check,
  LogOut,
  Eye,
  EyeOff,
  User,
  Cloud,
  HardDrive,
  Loader2,
  Radio,
  ChevronRight,
  Sparkles,
  Palette,
} from 'lucide-react';
import { useUser, DEMO_ACCOUNTS } from '../context/UserContext';
import { useTheme } from '../context/ThemeContext';
import { useAudio } from '../hooks/useAudio';
import { formatFileSize } from '../utils/audioCore';
import { TunelyLogo } from './TunelyLogo';

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
    isLoggedIn,
    isCloudSynced,
    cloudAuthLoading,
    cloudError,
    profile,
    profilesList,
    offlineTracks,
    likedSongs,
    playlists,
    login,
    signup,
    loginWithGoogle,
    logout,
    switchUser,
    updateAutoResume,
    clearAllDownloads,
  } = useUser();

  const { activeQuality, soundProfile } = useAudio();
  const { themeMeta, fontMeta } = useTheme();

  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const [autoResumeEnabled, setAutoResumeEnabled] = useState(
    profile?.autoResumeOnInterruption ?? true
  );

  useEffect(() => {
    setAutoResumeEnabled(profile?.autoResumeOnInterruption ?? true);
  }, [profile?.autoResumeOnInterruption]);

  if (!isOpen) return null;

  const totalOfflineBytes = offlineTracks.reduce((acc, t) => acc + (t.sizeBytes || 0), 0);
  const qualityBadge = (profile?.preferredQuality || activeQuality).replace('kbps', ' kbps');
  const soundLabel = PROFILE_LABELS[profile?.soundProfile || soundProfile] || 'Studio Master';

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    const res = await loginWithGoogle();
    if (!res.success) {
      setErrorMessage(res.error || 'Google sign-in failed.');
      return;
    }
    setSuccessMessage('Google Cloud Sync active across your devices!');
    setTimeout(() => {
      setIsSwitching(false);
      onClose();
    }, 600);
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (authMode === 'signin') {
      const res = await login(email, password);
      if (!res.success) {
        setErrorMessage(res.error || 'Failed to sign in.');
        return;
      }
      setSuccessMessage('Signed in successfully!');
      setTimeout(() => {
        setIsSwitching(false);
        onClose();
      }, 500);
    } else {
      const res = await signup(email, password, name);
      if (!res.success) {
        setErrorMessage(res.error || 'Failed to create account.');
        return;
      }
      setSuccessMessage('Account created! Welcome to Tunely 2.0.');
      setTimeout(() => {
        setIsSwitching(false);
        onClose();
      }, 600);
    }
  };

  const handleDemoLogin = async (demoEmail: string, demoPass: string) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    const res = await login(demoEmail, demoPass);
    if (res.success) {
      setSuccessMessage(`Switched to ${demoEmail}`);
      setTimeout(() => {
        setIsSwitching(false);
        onClose();
      }, 400);
    } else {
      await switchUser(demoEmail);
      setIsSwitching(false);
      onClose();
    }
  };

  const handleLogout = async () => {
    await logout();
    setIsSwitching(true);
    setAuthMode('signin');
    setEmail('');
    setPassword('');
  };

  const handleToggleAutoResume = async () => {
    const nextVal = !autoResumeEnabled;
    setAutoResumeEnabled(nextVal);
    await updateAutoResume(nextVal);
  };

  const showAuthView = !isLoggedIn || isSwitching;

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
          className="absolute top-4 right-4 w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center transition active:scale-90 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {showAuthView ? (
          <div className="space-y-4">
            <div className="text-center pt-2">
              <div className="flex justify-center mb-2.5">
                <TunelyLogo size={48} glow />
              </div>
              <h2 className="text-lg font-extrabold text-[var(--text-primary)] tracking-tight">
                {authMode === 'signin' ? 'Sign In to Tunely 2.0' : 'Join Tunely 2.0'}
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Sync playlists, likes &amp; EQ settings across every device
              </p>
            </div>

            {/* Cross-Device Google Cloud Sync CTA */}
            <button
              type="button"
              disabled={cloudAuthLoading}
              onClick={handleGoogleSignIn}
              className="w-full min-h-[48px] px-4 py-2.5 rounded-2xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-900 text-xs font-bold flex items-center justify-center gap-2.5 shadow-md transition active:scale-95 cursor-pointer disabled:opacity-60"
            >
              {cloudAuthLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              ) : (
                <Cloud className="w-4 h-4 text-indigo-600" />
              )}
              <span>Continue with Google (Cloud Sync)</span>
            </button>

            <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
              <div className="h-px flex-1 bg-[var(--border-subtle)]" />
              <span>or use local profile</span>
              <div className="h-px flex-1 bg-[var(--border-subtle)]" />
            </div>

            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signin');
                  setErrorMessage(null);
                }}
                className={`min-h-[44px] py-2 text-xs font-semibold rounded-xl transition cursor-pointer flex items-center justify-center ${
                  authMode === 'signin'
                    ? 'bg-indigo-600 text-white shadow-sm font-bold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signup');
                  setErrorMessage(null);
                }}
                className={`min-h-[44px] py-2 text-xs font-semibold rounded-xl transition cursor-pointer flex items-center justify-center ${
                  authMode === 'signup'
                    ? 'bg-indigo-600 text-white shadow-sm font-bold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Create Account
              </button>
            </div>

            {(errorMessage || cloudError) && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-500 dark:text-rose-300 text-xs font-medium">
                {errorMessage || cloudError}
              </div>
            )}
            {successMessage && (
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-600 dark:text-emerald-300 text-xs flex items-center gap-2 font-medium">
                <Check className="w-4 h-4 text-emerald-500" />
                <span>{successMessage}</span>
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-3">
              {authMode === 'signup' && (
                <div>
                  <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">
                    Your Name
                  </label>
                  <div className="relative flex items-center">
                    <User className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 pointer-events-none" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Aditya Patil"
                      required
                      className="w-full h-11 pl-10 pr-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-muted)] text-base sm:text-xs focus:outline-none focus:border-[var(--accent-primary)] transition"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">
                  Email Address
                </label>
                <div className="relative flex items-center">
                  <Mail className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    required
                    autoComplete="email"
                    className="w-full h-11 pl-10 pr-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-muted)] text-base sm:text-xs focus:outline-none focus:border-[var(--accent-primary)] transition"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">
                  Password
                </label>
                <div className="relative flex items-center">
                  <Lock className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    autoComplete="current-password"
                    className="w-full h-11 pl-10 pr-12 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-muted)] text-base sm:text-xs focus:outline-none focus:border-[var(--accent-primary)] transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-0 w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer active:scale-95"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full min-h-[44px] py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold transition shadow-lg shadow-indigo-600/30 cursor-pointer mt-1 flex items-center justify-center active:scale-95"
              >
                {authMode === 'signin' ? 'Sign In' : 'Create Free Account'}
              </button>
            </form>

            {/* Quick Demo Accounts Selection */}
            <div className="pt-2 border-t border-[var(--border-subtle)]">
              <span className="text-xs font-bold text-[var(--text-secondary)] block mb-2">
                Or One-Tap Switch Local Account
              </span>
              <div className="space-y-2">
                {DEMO_ACCOUNTS.map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => handleDemoLogin(acc.email, acc.password)}
                    className="w-full min-h-[48px] p-2.5 rounded-2xl bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] flex items-center justify-between text-left transition cursor-pointer active:scale-[0.98]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-xl bg-gradient-to-tr ${acc.color} flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-sm`}
                      >
                        {acc.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--text-primary)] truncate leading-snug">
                          {acc.name}
                        </p>
                        <p className="text-[11px] text-[var(--text-secondary)] truncate leading-normal">
                          {acc.email}
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] text-[var(--accent-primary)] font-semibold px-2.5 py-1 rounded-lg bg-[var(--accent-soft)] border border-[var(--accent-border)] shrink-0">
                      Log In
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {isLoggedIn && isSwitching && (
              <button
                type="button"
                onClick={() => setIsSwitching(false)}
                className="w-full min-h-[44px] flex items-center justify-center text-center text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] pt-1 cursor-pointer"
              >
                Cancel and return to current account
              </button>
            )}

            <div className="pt-2 border-t border-[var(--border-subtle)] text-center">
              <p className="text-[11px] font-medium text-[var(--text-secondary)]">
                Tunely 2.0 ·{' '}
                <span className="text-[var(--text-primary)] font-semibold">
                  Developed by Aditya Patil
                </span>
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Profile Card */}
            <div className="flex items-center gap-3.5 pr-10">
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
                    profile?.avatarColor || 'from-violet-600 to-indigo-600'
                  } flex items-center justify-center text-lg font-bold text-white shadow shrink-0`}
                >
                  {profile?.name
                    ? profile.name.charAt(0).toUpperCase()
                    : activeEmail.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-base text-[var(--text-primary)] truncate">
                  {profile?.name || 'Listener'}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">{activeEmail}</p>
              </div>
            </div>

            {/* Cloud Sync Status Card */}
            <div
              className={`p-3.5 rounded-2xl border flex items-center justify-between gap-2 ${
                isCloudSynced
                  ? 'bg-emerald-500/10 border-emerald-500/35'
                  : 'bg-[var(--bg-surface)] border-[var(--border-subtle)]'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {isCloudSynced ? (
                  <Cloud className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <HardDrive className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                    {isCloudSynced ? 'Synced Across Devices' : 'Local Device Only'}
                  </p>
                  <p className="text-[11px] text-[var(--text-secondary)] truncate">
                    {isCloudSynced
                      ? 'Playlists, likes & EQ saved to Firebase'
                      : 'Sign in with Google to sync other phones'}
                  </p>
                </div>
              </div>
              {!isCloudSynced && (
                <button
                  onClick={handleGoogleSignIn}
                  disabled={cloudAuthLoading}
                  className="min-h-[44px] px-3 py-1.5 rounded-xl bg-[var(--pill-active-bg)] text-[var(--pill-active-text)] text-xs font-bold shrink-0 hover:opacity-90 transition cursor-pointer active:scale-95"
                >
                  Sync Now
                </button>
              )}
            </div>

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

            {/* Switch Account */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--text-secondary)]">Switch Account</span>
                <button
                  onClick={() => setIsSwitching(true)}
                  className="min-h-[44px] px-2 text-xs text-[var(--accent-primary)] font-semibold hover:opacity-80 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add or Google</span>
                </button>
              </div>

              <div className="space-y-2 max-h-36 overflow-y-auto no-scrollbar pr-1">
                {profilesList.map((p) => {
                  const isActive = p.email === activeEmail;
                  return (
                    <button
                      key={p.email}
                      onClick={() => switchUser(p.email)}
                      className={`w-full min-h-[48px] p-2.5 rounded-2xl border text-left flex items-center justify-between text-xs transition cursor-pointer active:scale-[0.98] ${
                        isActive
                          ? 'bg-[var(--accent-soft)] border-[var(--accent-border)] text-[var(--accent-primary)]'
                          : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-lg bg-gradient-to-tr ${
                            p.avatarColor || 'from-slate-700 to-slate-600'
                          } flex items-center justify-center text-xs font-bold text-white shrink-0`}
                        >
                          {p.name.charAt(0)}
                        </div>
                        <div className="min-w-0 truncate">
                          <span className="font-semibold text-[var(--text-primary)] block truncate leading-snug">
                            {p.name}
                          </span>
                          <span className="text-[11px] text-[var(--text-secondary)] truncate block leading-normal">
                            {p.email}
                          </span>
                        </div>
                      </div>
                      {isActive && (
                        <Check className="w-4 h-4 text-[var(--accent-primary)] shrink-0 ml-1 stroke-[3]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Settings Section */}
            <div className="space-y-2.5 pt-2 border-t border-[var(--border-subtle)]">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] block">
                Settings
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

            {/* Logout Action */}
            <div className="pt-1 border-t border-[var(--border-subtle)]">
              <button
                onClick={handleLogout}
                className="w-full min-h-[44px] py-2.5 rounded-xl bg-[var(--bg-surface)] hover:bg-rose-500/15 border border-[var(--border-subtle)] hover:border-rose-500/35 text-rose-500 dark:text-rose-400 text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer active:scale-95"
              >
                <LogOut className="w-4 h-4" />
                <span>Log Out of this Account</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
