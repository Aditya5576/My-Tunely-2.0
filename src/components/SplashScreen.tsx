import React, { useEffect, useRef, useState } from 'react';
import { TunelyLogo } from './TunelyLogo';

interface SplashScreenProps {
  onFinish?: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const [phase, setPhase] = useState<'visible' | 'exiting' | 'gone'>('visible');
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const dismissedRef = useRef(false);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const holdMs = prefersReducedMotion ? 900 : 2500;
    const exitMs = prefersReducedMotion ? 160 : 320;

    const exitTimer = setTimeout(() => {
      if (!dismissedRef.current) {
        setPhase('exiting');
      }
    }, holdMs);

    const doneTimer = setTimeout(() => {
      if (!dismissedRef.current) {
        dismissedRef.current = true;
        setPhase('gone');
        onFinishRef.current?.();
      }
    }, holdMs + exitMs);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  if (phase === 'gone') return null;

  const dismissNow = () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setPhase('exiting');
    setTimeout(() => {
      setPhase('gone');
      onFinishRef.current?.();
    }, 200);
  };

  return (
    <div
      onClick={dismissNow}
      role="status"
      aria-label="Loading Tunely 2.0"
      className={`fixed inset-0 z-50 flex flex-col items-center justify-between bg-[var(--bg-app)] text-[var(--text-primary)] px-6 safe-splash-pad select-none cursor-pointer transition-opacity duration-300 ease-out ${
        phase === 'exiting' ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Ambient Radial Aura */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="absolute inset-0 opacity-75"
          style={{
            background:
              'radial-gradient(circle at 50% 38%, rgba(217, 70, 239, 0.16), rgba(99, 102, 241, 0.08) 38%, transparent 68%)',
          }}
        />
      </div>

      {/* Top Spacer */}
      <div className="h-4" />

      {/* Center Logo & Brand Lockup */}
      <div className="relative z-10 flex flex-col items-center text-center animate-sheet-up">
        <div className="relative mb-7">
          <div className="absolute -inset-3.5 rounded-[32px] bg-gradient-to-tr from-fuchsia-500/35 via-indigo-500/25 to-cyan-400/35 blur-xl animate-splash-ring" />
          <TunelyLogo size={104} glow className="relative" />
        </div>

        <h1 className="inline-flex items-baseline gap-2.5 leading-none">
          <span className="font-display text-4xl sm:text-[42px] font-black tracking-[-0.04em] text-[var(--text-primary)]">
            Tunely
          </span>
          <span className="relative font-mono text-lg sm:text-xl font-bold tracking-[0.08em] bg-gradient-to-r from-[#e879f9] via-[#818cf8] to-[#22d3ee] bg-clip-text text-transparent pb-0.5">
            2.0
            <span
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-gradient-to-r from-[#e879f9]/85 via-[#818cf8]/85 to-[#22d3ee]/85"
            />
          </span>
        </h1>
        <p className="mt-3 text-xs sm:text-sm font-medium text-[var(--text-secondary)] tracking-wide">
          Studio Audio · Offline · Cloud Sync
        </p>

        {/* Subtle Acoustic Equalizer Loader */}
        <div className="mt-6 flex items-end justify-center gap-1.5 h-5" aria-hidden="true">
          <span className="w-1 rounded-full bg-indigo-500 animate-eq-1 h-4" />
          <span className="w-1 rounded-full bg-violet-500 animate-eq-2 h-5" />
          <span className="w-1 rounded-full bg-pink-500 animate-eq-3 h-3.5" />
          <span className="w-1 rounded-full bg-indigo-400 animate-eq-2 h-4.5" />
        </div>
      </div>

      {/* Bottom Attribution */}
      <div className="relative z-10 text-center space-y-1">
        <p className="text-xs font-semibold text-[var(--text-secondary)] tracking-wide">
          Developed by Aditya Patil
        </p>
      </div>
    </div>
  );
};
