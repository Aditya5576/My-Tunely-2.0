import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Share2, PlusSquare, X } from 'lucide-react';
import { TunelyLogo } from './TunelyLogo';

interface IOSInstallGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

export const IOSInstallGuide: React.FC<IOSInstallGuideProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, [isOpen]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Install Tunely App"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm px-4 safe-modal-inset animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-[var(--bg-elevated)] border border-[var(--border-strong)] p-6 shadow-2xl text-[var(--text-primary)] relative max-h-full overflow-y-auto no-scrollbar animate-sheet-up"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close guide"
          className="absolute top-4 right-4 w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center transition active:scale-90 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4 pr-10">
          <TunelyLogo size={46} className="shrink-0" />
          <div>
            <h3 className="text-lg font-bold text-[var(--text-primary)]">
              {/android/i.test(navigator.userAgent || '')
                ? 'Install on Android'
                : 'Install on iPhone / iPad'}
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Full-screen app &amp; lock-screen controls
            </p>
          </div>
        </div>

        <div className="space-y-3 my-5 text-sm text-[var(--text-secondary)]">
          <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
            <div className="p-2 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)] shrink-0">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-[var(--text-primary)]">
                {/android/i.test(navigator.userAgent || '')
                  ? '1. Tap the Chrome ⋮ Menu'
                  : '1. Tap the Safari Share Button'}
              </p>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                {/android/i.test(navigator.userAgent || '')
                  ? 'Tap the three-dots (⋮) menu in the top-right corner of Chrome.'
                  : 'In iPhone Safari, tap the Share icon (box with up arrow) in the toolbar.'}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
            <div className="p-2 rounded-xl bg-pink-500/15 text-pink-500 shrink-0">
              <PlusSquare className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-[var(--text-primary)]">
                {/android/i.test(navigator.userAgent || '')
                  ? '2. Tap "Install app" or "Add to Home screen"'
                  : '2. Tap "Add to Home Screen"'}
              </p>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Confirm to launch Tunely 2.0 as a full-screen standalone app from your Home Screen.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full min-h-[44px] py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold hover:from-violet-500 hover:to-indigo-500 transition shadow-lg shadow-indigo-600/20 cursor-pointer active:scale-95"
        >
          Got it
        </button>
      </div>
    </div>,
    document.body
  );
};
