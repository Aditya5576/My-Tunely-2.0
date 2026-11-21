import React, { useState } from 'react';
import { DownloadCloud, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { IOSInstallGuide } from './IOSInstallGuide';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running inside installed standalone PWA, hide
  if (isInstalled) {
    return null;
  }

  // Android / Chrome / Edge install prompt
  if (isInstallable) {
    return (
      <button
        onClick={install}
        aria-label="Install App"
        className={`min-h-[44px] min-w-[44px] flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 font-semibold text-white shadow-md shadow-indigo-600/30 hover:from-violet-500 hover:to-indigo-500 transition active:scale-95 cursor-pointer ${
          compact ? 'px-2.5 sm:px-3 text-xs' : 'px-4 text-xs'
        }`}
      >
        <DownloadCloud className="w-4 h-4" />
        <span className={compact ? 'hidden sm:inline' : ''}>Install</span>
      </button>
    );
  }

  // iOS Safari instruction
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          aria-label="Install on iPhone"
          className={`min-h-[44px] min-w-[44px] flex items-center justify-center gap-1.5 rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold hover:opacity-90 transition active:scale-95 cursor-pointer ${
            compact ? 'px-2.5 sm:px-3 text-xs' : 'px-4 text-xs'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          <span className={compact ? 'hidden sm:inline' : ''}>Install</span>
        </button>
        <IOSInstallGuide isOpen={showIOSGuide} onClose={() => setShowIOSGuide(false)} />
      </>
    );
  }

  // Default install guide button for browsers without beforeinstallprompt
  return (
    <>
      <button
        onClick={() => setShowIOSGuide(true)}
        aria-label="Install App Guide"
        className={`min-h-[44px] min-w-[44px] flex items-center justify-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] font-semibold transition active:scale-95 cursor-pointer ${
          compact ? 'px-2.5 sm:px-3 text-xs' : 'px-4 text-xs'
        }`}
      >
        <DownloadCloud className="w-4 h-4 text-[var(--accent-primary)]" />
        <span className="hidden sm:inline">App</span>
      </button>
      <IOSInstallGuide isOpen={showIOSGuide} onClose={() => setShowIOSGuide(false)} />
    </>
  );
};
