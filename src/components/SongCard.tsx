import React from 'react';
import { Play } from 'lucide-react';
import { Song } from '../types/music';
import { cleanHtmlEntities, getBestImageUrl } from '../utils/audioCore';
import { useAudio } from '../hooks/useAudio';
import { useUser } from '../context/UserContext';

interface SongCardProps {
  song: Song;
  queueContext?: Song[];
}

export const SongCard: React.FC<SongCardProps> = ({ song, queueContext }) => {
  const { currentSong, playState, playSong, togglePlayPause } = useAudio();
  const { activeEmail } = useUser();

  const isCurrent = currentSong?.id === song.id;
  const isPlayingThis = isCurrent && playState === 'playing';

  const title = cleanHtmlEntities(song.name);
  const artists = song.artists?.primary?.map((a) => a.name).join(', ') || 'Unknown Artist';
  const artwork = getBestImageUrl(song.image, 'lg');

  const handleClick = () => {
    if (isCurrent) {
      togglePlayPause();
    } else {
      playSong(song, queueContext, activeEmail);
    }
  };

  return (
    <div
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Play ${title}`}
      className={`group w-[152px] sm:w-44 shrink-0 cursor-pointer transition-[transform,background-color,border-color] duration-150 ease-out p-3 rounded-2xl shadow-sm flex flex-col justify-between active:scale-[0.97] ${
        isCurrent
          ? 'bg-[var(--accent-soft)] border border-[var(--accent-border)] shadow-md'
          : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
      }`}
    >
      <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-slate-800 shadow-md">
        <img
          src={artwork}
          alt={title}
          referrerPolicy="no-referrer"
          decoding="async"
          className="w-full h-full object-cover"
          loading="lazy"
        />

        {/* 44px Play Button Overlay */}
        <div
          className={`absolute bottom-2 right-2 w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-950/50 transition-opacity duration-150 ${
            isCurrent
              ? 'opacity-100 scale-100'
              : 'opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0'
          }`}
        >
          {isPlayingThis ? (
            <div className="flex items-end gap-0.5 h-3.5">
              <span className="w-1 bg-white rounded-full animate-eq-1 h-2.5" />
              <span className="w-1 bg-white rounded-full animate-eq-2 h-3.5" />
              <span className="w-1 bg-white rounded-full animate-eq-3 h-2" />
            </div>
          ) : (
            <Play className="w-4 h-4 fill-white ml-0.5" />
          )}
        </div>
      </div>

      <div className="mt-2.5 min-w-0 w-full">
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
    </div>
  );
};
