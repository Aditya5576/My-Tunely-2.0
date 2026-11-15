import React from 'react';
import { Play, Pause, SkipForward, Heart } from 'lucide-react';
import { useAudio } from '../hooks/useAudio';
import { useUser } from '../context/UserContext';
import { cleanHtmlEntities, getBestImageUrl } from '../utils/audioCore';

interface MiniPlayerProps {
  onExpand: () => void;
}

export const MiniPlayer: React.FC<MiniPlayerProps> = ({ onExpand }) => {
  const { currentSong, playState, togglePlayPause, next, currentTime, duration } = useAudio(true);
  const { isLiked, toggleLiked } = useUser();

  if (!currentSong) return null;

  const title = cleanHtmlEntities(currentSong.name || (currentSong as any).title || 'Untitled');
  const artist =
    currentSong.artists?.primary?.map((a) => a.name).join(', ') ||
    (currentSong as any).primaryArtists ||
    'Unknown Artist';
  const artwork = getBestImageUrl(currentSong.image, 'md');
  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const liked = isLiked(currentSong.id);
  const isPlaying = playState === 'playing';

  return (
    <div className="shrink-0 w-full z-20 px-2.5 pt-1.5 pb-1.5 bg-[var(--bg-shell)] border-t border-[var(--border-subtle)]/50 animate-sheet-up">
      <div className="relative overflow-hidden rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-strong)] shadow-xl shadow-black/20 dark:shadow-black/55">
        {/* Progress bar line (GPU composited scaleX for smooth 60fps updates) */}
        <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-[var(--border-subtle)] overflow-hidden">
          <div
            className="h-full w-full origin-left bg-gradient-to-r from-violet-500 via-indigo-400 to-pink-500 transition-transform duration-200 ease-linear"
            style={{ transform: `scaleX(${Math.max(0, Math.min(1, progressPercent / 100))})` }}
          />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 p-2">
          {/* Left: Artwork + Track details (tap to expand) */}
          <div
            onClick={onExpand}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onExpand();
              }
            }}
            className="flex items-center gap-3 min-w-0 pr-1 cursor-pointer select-none group"
            role="button"
            tabIndex={0}
            aria-label={`Now playing: ${title} by ${artist}. Tap to open player`}
          >
            <div className="relative w-12 h-12 rounded-xl overflow-hidden shadow-md bg-slate-800 shrink-0 ring-1 ring-[var(--border-subtle)]">
              <img
                src={artwork}
                alt={title}
                referrerPolicy="no-referrer"
                decoding="async"
                className="w-full h-full object-cover"
                loading="lazy"
              />
              {isPlaying && (
                <div className="absolute inset-0 bg-black/35 flex items-end justify-center gap-0.5 pb-1.5">
                  <span className="w-1 h-3 bg-white rounded-full animate-eq-1" />
                  <span className="w-1 h-4 bg-indigo-300 rounded-full animate-eq-2" />
                  <span className="w-1 h-2.5 bg-pink-300 rounded-full animate-eq-3" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-[var(--text-primary)] truncate leading-snug">
                {title}
              </p>
              <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5 leading-normal">
                {artist}
              </p>
            </div>
          </div>

          {/* Right: Quick actions with at least 44px hit targets */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleLiked(currentSong);
              }}
              aria-label={liked ? 'Unlike song' : 'Like song'}
              className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[var(--text-secondary)] hover:text-rose-500 hover:bg-[var(--bg-surface)] active:scale-90 transition cursor-pointer"
            >
              <Heart
                className={`w-4 h-4 transition-transform ${
                  liked ? 'fill-rose-500 text-rose-500 scale-110' : ''
                }`}
              />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePlayPause();
              }}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-[var(--pill-active-bg)] text-[var(--pill-active-text)] flex items-center justify-center shadow-lg hover:opacity-90 transition active:scale-90 cursor-pointer"
            >
              {playState === 'loading' ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                next();
              }}
              aria-label="Next track"
              className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] active:scale-90 transition cursor-pointer"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
