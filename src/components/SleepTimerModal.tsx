import React from 'react';
import { X, Moon, Clock, Check } from 'lucide-react';
import { useAudio } from '../hooks/useAudio';
import { formatTime } from '../utils/audioCore';

interface SleepTimerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SleepTimerModal: React.FC<SleepTimerModalProps> = ({ isOpen, onClose }) => {
  const { sleepTimerRemaining, isSleepTimerOnEndTrack, setSleepTimer, clearSleepTimer } =
    useAudio();

  if (!isOpen) return null;

  const timerOptions = [
    { label: 'Turn Off Timer', value: 0 },
    { label: '15 Minutes', value: 15 },
    { label: '30 Minutes', value: 30 },
    { label: '45 Minutes', value: 45 },
    { label: '60 Minutes (1 Hour)', value: 60 },
    { label: 'End of Current Track', value: 'end_of_track' as const },
  ];

  const handleSelect = (val: number | 'end_of_track') => {
    if (val === 0) {
      clearSleepTimer();
    } else {
      setSleepTimer(val);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm px-4 safe-modal-inset animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm max-h-full overflow-y-auto no-scrollbar rounded-3xl bg-[var(--bg-elevated)] border border-[var(--border-strong)] p-6 shadow-2xl text-[var(--text-primary)] relative animate-sheet-up"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close sleep timer"
          className="absolute top-4 right-4 w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center transition active:scale-90 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 mb-2 pr-10">
          <div className="p-2 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)]">
            <Moon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-[var(--text-primary)]">Sleep Timer</h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Audio will gently pause automatically
            </p>
          </div>
        </div>

        {/* Active Timer Indicator */}
        {sleepTimerRemaining !== null && sleepTimerRemaining > 0 && (
          <div className="my-3 p-3 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent-border)] flex items-center gap-2 text-[var(--accent-primary)]">
            <Clock className="w-4 h-4 animate-spin" />
            <span className="text-xs font-semibold">
              Music will stop in {formatTime(sleepTimerRemaining)}
            </span>
          </div>
        )}

        {isSleepTimerOnEndTrack && (
          <div className="my-3 p-3 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent-border)] flex items-center gap-2 text-[var(--accent-primary)]">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-semibold">
              Music will stop at the end of this song
            </span>
          </div>
        )}

        <div className="space-y-2 my-4">
          {timerOptions.map((opt) => {
            const isZero = opt.value === 0;
            const isEnd = opt.value === 'end_of_track';
            const isActive = isZero
              ? sleepTimerRemaining === null && !isSleepTimerOnEndTrack
              : isEnd
              ? isSleepTimerOnEndTrack
              : false;

            return (
              <button
                key={opt.label}
                onClick={() => handleSelect(opt.value)}
                className={`w-full min-h-[48px] px-4 py-3 rounded-2xl border text-sm font-semibold flex items-center justify-between transition cursor-pointer active:scale-98 ${
                  isActive
                    ? 'bg-[var(--accent-soft)] border-[var(--accent-border)] text-[var(--accent-primary)] font-bold'
                    : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] hover:border-[var(--border-strong)]'
                }`}
              >
                <span>{opt.label}</span>
                {isActive && <Check className="w-4 h-4 text-[var(--accent-primary)]" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
