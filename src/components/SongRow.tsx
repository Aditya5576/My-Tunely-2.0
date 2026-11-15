import React, { useState } from 'react';
import { Play, MoreVertical, Heart, Download, Check, ListPlus, Radio, Trash2 } from 'lucide-react';
import { Song } from '../types/music';
import { cleanHtmlEntities, formatPlayCount, formatTime, getBestImageUrl } from '../utils/audioCore';
import { useAudio } from '../hooks/useAudio';
import { useUser } from '../context/UserContext';

interface SongRowProps {
  song: Song;
  queueContext?: Song[];
  index?: number;
  showIndex?: boolean;
  onOpenPlaylistModal?: (song: Song) => void;
  onRemoveFromPlaylist?: (songId: string) => void;
  isCustomPlaylist?: boolean;
}

export const SongRow: React.FC<SongRowProps> = ({
  song,
  queueContext,
  index,
  showIndex = false,
  onOpenPlaylistModal,
  onRemoveFromPlaylist,
  isCustomPlaylist = false,
}) => {
  const { currentSong, playState, playSong, togglePlayPause, playNext, addToQueue } = useAudio();
  const {
    isLiked,
    toggleLiked,
    downloadSongForOffline,
    offlineTracks,
    deleteOfflineTrack,
    downloadingSongIds,
    activeEmail,
  } = useUser();
  const [showMenu, setShowMenu] = useState(false);

  const isCurrent = currentSong?.id === song.id;
  const isPlayingThis = isCurrent && playState === 'playing';
  const isDownloaded = offlineTracks.some((t) => t.id === song.id);
  const downloadProgress = downloadingSongIds[song.id];
  const liked = isLiked(song.id);

  const title = cleanHtmlEntities(song.name || (song as any).title || 'Untitled');
  const artists =
    song.artists?.primary?.map((a) => a.name).join(', ') ||
    (song as any).primaryArtists ||
    (song as any).singers ||
    'Unknown Artist';
  const artwork = getBestImageUrl(song.image, 'md');

  const handleRowClick = () => {
    if (isCurrent) {
      togglePlayPause();
    } else {
      playSong(song, queueContext, activeEmail);
    }
  };

  return (
    <div className="relative group">
      <div
        onClick={handleRowClick}
        className={`w-full p-2.5 rounded-2xl grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 transition-[transform,background-color,border-color] duration-150 ease-out cursor-pointer active:scale-[0.985] ${
          isCurrent
            ? 'bg-[var(--accent-soft)] border border-[var(--accent-border)] shadow-sm'
            : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
        }`}
      >
        {/* Left Column: Index + Artwork */}
        <div className="flex items-center gap-2.5 shrink-0">
          {showIndex && typeof index === 'number' && (
            <span className="w-5 text-center text-xs font-mono tabular-nums text-[var(--text-secondary)] shrink-0 font-medium">
              {index + 1}
            </span>
          )}

          <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-slate-800 shrink-0 shadow-sm ring-1 ring-[var(--border-subtle)]">
            <img
              src={artwork}
              alt={title}
              referrerPolicy="no-referrer"
              decoding="async"
              className="w-full h-full object-cover"
              loading="lazy"
            />
            <div
              className={`absolute inset-0 bg-black/45 flex items-center justify-center transition-opacity duration-200 ${
                isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
            >
              {isPlayingThis ? (
                <div className="flex items-end gap-0.5 h-4">
                  <span className="w-1 bg-white rounded-full animate-eq-1 h-3" />
                  <span className="w-1 bg-indigo-300 rounded-full animate-eq-2 h-4" />
                  <span className="w-1 bg-pink-300 rounded-full animate-eq-3 h-2.5" />
                </div>
              ) : (
                <Play className="w-4 h-4 text-white fill-white ml-0.5" />
              )}
            </div>
          </div>
        </div>

        {/* Center Column: Title & Artists */}
        <div className="min-w-0 pr-1 flex flex-col justify-center">
          <p
            className={`text-sm font-semibold truncate leading-snug ${
              isCurrent ? 'text-[var(--accent-primary)]' : 'text-[var(--text-primary)]'
            }`}
          >
            {title}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-[var(--text-secondary)] truncate leading-normal">
            {isDownloaded && (
              <span className="inline-flex items-center text-[10px] text-emerald-500 font-bold shrink-0">
                <Check className="w-3 h-3 mr-0.5 stroke-[3]" /> Offline
              </span>
            )}
            <span className="truncate">{artists}</span>
            {song.playCount && song.playCount >= 50000 && (
              <span className="text-[10px] text-[var(--accent-primary)] font-medium tabular-nums shrink-0">
                • {formatPlayCount(song.playCount)} plays
              </span>
            )}
          </div>
        </div>

        {/* Right Column: Duration + 44px Hit Target Action Buttons */}
        <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <span className="text-xs text-[var(--text-secondary)] font-mono tabular-nums hidden sm:inline mr-1.5">
            {formatTime(song.duration)}
          </span>

          <button
            onClick={() => toggleLiked(song)}
            aria-label={liked ? 'Unlike' : 'Like'}
            className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[var(--text-secondary)] hover:text-rose-500 hover:bg-[var(--bg-surface)] active:scale-90 transition cursor-pointer"
          >
            <Heart
              className={`w-4 h-4 transition-transform ${
                liked ? 'fill-rose-500 text-rose-500 scale-110' : ''
              }`}
            />
          </button>

          <button
            onClick={() => setShowMenu((v) => !v)}
            aria-label="Track actions"
            className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] active:scale-90 transition cursor-pointer"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Dropdown Actions Menu */}
      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div className="absolute right-2 top-12 z-50 w-56 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-strong)] shadow-2xl p-1.5 text-xs text-[var(--text-primary)] animate-sheet-up">
            <button
              onClick={() => {
                playNext(song);
                setShowMenu(false);
              }}
              className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-left hover:bg-[var(--bg-surface-hover)] flex items-center gap-3 transition cursor-pointer"
            >
              <Radio className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
              <span className="font-medium text-[var(--text-primary)]">Play Next</span>
            </button>

            <button
              onClick={() => {
                addToQueue(song);
                setShowMenu(false);
              }}
              className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-left hover:bg-[var(--bg-surface-hover)] flex items-center gap-3 transition cursor-pointer"
            >
              <ListPlus className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
              <span className="font-medium text-[var(--text-primary)]">Add to Queue</span>
            </button>

            {onOpenPlaylistModal && (
              <button
                onClick={() => {
                  onOpenPlaylistModal(song);
                  setShowMenu(false);
                }}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-left hover:bg-[var(--bg-surface-hover)] flex items-center gap-3 transition cursor-pointer"
              >
                <ListPlus className="w-4 h-4 text-emerald-500 shrink-0" />
                <span className="font-medium text-[var(--text-primary)]">Add to Playlist...</span>
              </button>
            )}

            {isDownloaded ? (
              <button
                onClick={() => {
                  deleteOfflineTrack(song.id);
                  setShowMenu(false);
                }}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-left hover:bg-[var(--bg-surface-hover)] text-rose-500 flex items-center gap-3 transition cursor-pointer"
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                <span className="font-medium">Remove Offline File</span>
              </button>
            ) : (
              <button
                disabled={downloadProgress !== undefined}
                onClick={() => {
                  downloadSongForOffline(song);
                  setShowMenu(false);
                }}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-left hover:bg-[var(--bg-surface-hover)] text-emerald-500 flex items-center gap-3 transition cursor-pointer"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span className="font-medium">
                  {downloadProgress !== undefined
                    ? `Downloading ${downloadProgress}%`
                    : 'Download for Offline'}
                </span>
              </button>
            )}

            {isCustomPlaylist && onRemoveFromPlaylist && (
              <button
                onClick={() => {
                  onRemoveFromPlaylist(song.id);
                  setShowMenu(false);
                }}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-left hover:bg-[var(--bg-surface-hover)] text-rose-500 border-t border-[var(--border-subtle)] mt-1 flex items-center gap-3 transition cursor-pointer"
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                <span className="font-medium">Remove from Playlist</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};
