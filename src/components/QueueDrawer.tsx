import React from 'react';
import { X, Trash2, Music2, Play, Shuffle } from 'lucide-react';
import { useAudio } from '../hooks/useAudio';
import { cleanHtmlEntities, formatTime, getBestImageUrl } from '../utils/audioCore';

interface QueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QueueDrawer: React.FC<QueueDrawerProps> = ({ isOpen, onClose }) => {
  const { queue, queueIndex, isShuffled, playSong, toggleShuffle, removeFromQueue, clearQueue } =
    useAudio();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/75 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md mx-auto sm:max-w-xl md:max-w-2xl h-[78dvh] max-h-[82dvh] rounded-t-3xl bg-[var(--bg-elevated)] border-t border-[var(--border-strong)] px-5 pt-5 safe-drawer-pb shadow-2xl flex flex-col text-[var(--text-primary)] animate-sheet-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with 44px hit targets */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <Music2 className="w-5 h-5 text-[var(--accent-primary)]" />
            <h3 className="text-base font-bold text-[var(--text-primary)]">Playing Queue</h3>
            <span className="text-xs font-mono tabular-nums text-[var(--text-secondary)]">
              ({queue.length})
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {queue.length > 1 && (
              <>
                <button
                  onClick={toggleShuffle}
                  aria-label="Toggle shuffle queue"
                  aria-pressed={isShuffled}
                  title={isShuffled ? 'Shuffle On (tap to restore order)' : 'Shuffle Queue'}
                  className={`w-10 h-10 min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center transition cursor-pointer active:scale-90 ${
                    isShuffled
                      ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] border border-[var(--accent-border)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]'
                  }`}
                >
                  <Shuffle className="w-4 h-4" />
                </button>
                <button
                  onClick={clearQueue}
                  aria-label="Clear queue"
                  className="min-h-[44px] px-3 flex items-center justify-center text-xs text-[var(--text-secondary)] hover:text-rose-500 transition cursor-pointer font-semibold"
                >
                  Clear
                </button>
              </>
            )}
            <button
              onClick={onClose}
              aria-label="Close queue"
              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center transition cursor-pointer active:scale-90"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Queue List with CSS Grid layout */}
        <div className="flex-1 overflow-y-auto no-scrollbar py-3 space-y-2">
          {queue.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-[var(--text-secondary)] text-center">
              <Music2 className="w-10 h-10 mb-2 stroke-1 opacity-50" />
              <p className="text-sm font-medium">No tracks in queue</p>
            </div>
          ) : (
            queue.map((song, idx) => {
              const isCurrent = idx === queueIndex;
              const title = cleanHtmlEntities(song.name);
              const artists =
                song.artists?.primary?.map((a) => a.name).join(', ') || 'Unknown Artist';
              const artwork = getBestImageUrl(song.image, 'md');

              return (
                <div
                  key={`${song.id}_${idx}`}
                  className={`p-2.5 rounded-2xl grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 transition cursor-pointer active:scale-[0.99] ${
                    isCurrent
                      ? 'bg-[var(--accent-soft)] border border-[var(--accent-border)] text-[var(--accent-primary)]'
                      : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)]'
                  }`}
                  onClick={() => playSong(song)}
                >
                  <div className="relative w-11 h-11 rounded-xl overflow-hidden bg-slate-800 shrink-0">
                    <img src={artwork} alt={title} className="w-full h-full object-cover" />
                    {isCurrent && (
                      <div className="absolute inset-0 bg-indigo-950/60 flex items-center justify-center">
                        <Play className="w-3.5 h-3.5 text-indigo-300 fill-indigo-300 ml-0.5" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 pr-1">
                    <p
                      className={`text-xs font-bold truncate leading-snug ${
                        isCurrent ? 'text-[var(--accent-primary)]' : 'text-[var(--text-primary)]'
                      }`}
                    >
                      {title}
                    </p>
                    <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5 leading-normal">
                      {artists}
                    </p>
                  </div>

                  <div
                    className="flex items-center gap-1 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-[11px] font-mono tabular-nums text-[var(--text-secondary)] hidden sm:inline mr-1">
                      {formatTime(song.duration)}
                    </span>
                    <button
                      onClick={() => removeFromQueue(idx)}
                      aria-label="Remove from queue"
                      className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:text-rose-500 hover:bg-[var(--bg-surface-hover)] transition cursor-pointer active:scale-90"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
