import React from 'react';
import { X, Cloud, Loader2, Sparkles, Music, Sliders, ShieldCheck } from 'lucide-react';
import { TunelyLogo } from './TunelyLogo';
import { useUser } from '../context/UserContext';

interface LoginGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason?: string | null;
}

export const LoginGateModal: React.FC<LoginGateModalProps> = ({
  isOpen,
  onClose,
  reason,
}) => {
  const {
    loginWithGoogle,
    cloudAuthLoading,
    cloudError,
    continueAsGuest,
    isGuest,
    authState,
  } = useUser();

  if (!isOpen) return null;

  const canDismiss = isGuest || authState === 'authenticated';

  const handleGoogleSignIn = async () => {
    const res = await loginWithGoogle();
    if (res.success) {
      onClose();
    }
  };

  const handleGuestChoice = () => {
    continueAsGuest();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-4 safe-modal-inset animate-fade-in"
      onClick={canDismiss ? onClose : undefined}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-[var(--bg-elevated)] border border-[var(--border-strong)] p-6 shadow-2xl text-[var(--text-primary)] relative animate-sheet-up overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ambient Top Glow */}
        <div
          className="pointer-events-none absolute inset-x-0 -top-24 h-48 opacity-40 blur-2xl"
          style={{ background: 'var(--accent-primary)' }}
        />

        {canDismiss && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center transition active:scale-90 cursor-pointer z-10"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="relative space-y-4 pt-1">
          {/* Logo & Headline */}
          <div className="text-center space-y-2">
            <div className="flex justify-center">
              <TunelyLogo size={52} glow />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-[var(--text-primary)] tracking-tight">
                Welcome to Tunely 2.0
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                High-fidelity, offline-first personal music streaming
              </p>
            </div>
          </div>

          {/* Trigger Reason / Notice Banner */}
          {reason && (
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-500 dark:text-amber-300 text-xs font-semibold text-center flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>{reason}</span>
            </div>
          )}

          {/* Feature Highlights */}
          <div className="space-y-2 py-1">
            <div className="p-2.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/15 flex items-center justify-center text-indigo-400 shrink-0">
                <Cloud className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-[var(--text-primary)] leading-snug">
                  Cross-Device Cloud Sync
                </p>
                <p className="text-[11px] text-[var(--text-secondary)] leading-normal">
                  Playlists &amp; likes sync seamlessly between iPhone &amp; PC
                </p>
              </div>
            </div>

            <div className="p-2.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 shrink-0">
                <Music className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-[var(--text-primary)] leading-snug">
                  Unlimited 320kbps Streams
                </p>
                <p className="text-[11px] text-[var(--text-secondary)] leading-normal">
                  Full catalog search with synchronized karaoke lyrics
                </p>
              </div>
            </div>

            <div className="p-2.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-rose-500/15 flex items-center justify-center text-rose-400 shrink-0">
                <Sliders className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-[var(--text-primary)] leading-snug">
                  Studio DSP Mastering
                </p>
                <p className="text-[11px] text-[var(--text-secondary)] leading-normal">
                  5-band biquad equalizer and soft-ceiling limiter
                </p>
              </div>
            </div>
          </div>

          {cloudError && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-500 dark:text-rose-300 text-xs font-medium text-center">
              {cloudError}
            </div>
          )}

          {/* Action CTAs */}
          <div className="space-y-2 pt-1">
            <button
              type="button"
              disabled={cloudAuthLoading}
              onClick={handleGoogleSignIn}
              className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-950 text-xs font-bold flex items-center justify-center gap-2.5 shadow-lg transition active:scale-[0.98] cursor-pointer disabled:opacity-60"
            >
              {cloudAuthLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
              )}
              <span>Continue with Google</span>
            </button>

            <button
              type="button"
              onClick={handleGuestChoice}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer"
            >
              <span>Continue as Guest</span>
              <span className="text-[10px] text-[var(--text-muted)]">(5 searches · 15 min preview)</span>
            </button>
          </div>

          <div className="pt-2 text-center border-t border-[var(--border-subtle)]">
            <p className="text-[11px] font-medium text-[var(--text-secondary)]">
              Tunely 2.0 ·{' '}
              <span className="text-[var(--text-primary)] font-semibold">
                Developed by Aditya Patil
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
