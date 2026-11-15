import React, { useState, useEffect } from 'react';
import {
  Heart,
  Plus,
  Music,
  Play,
  Shuffle,
  Trash2,
  ArrowLeft,
  Clock,
  Link2,
  Pencil,
} from 'lucide-react';
import { Playlist, Song } from '../types/music';
import { useUser } from '../context/UserContext';
import { useAudio } from '../hooks/useAudio';
import { SongRow } from '../components/SongRow';
import { formatTime } from '../utils/audioCore';

interface LibraryViewProps {
  initialPlaylistId?: string | null;
  initialViewMode?: 'all' | 'liked' | 'history';
  onClearInitialTarget?: () => void;
  onOpenCreatePlaylist: () => void;
  onOpenImportPlaylist?: () => void;
  onEditPlaylist?: (playlist: Playlist) => void;
  onOpenUserModal: () => void;
  onOpenPlaylistModal: (song: Song) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  initialPlaylistId = null,
  initialViewMode = 'all',
  onClearInitialTarget,
  onOpenCreatePlaylist,
  onOpenImportPlaylist,
  onEditPlaylist,
  onOpenUserModal,
  onOpenPlaylistModal,
}) => {
  const {
    activeEmail,
    isLoggedIn,
    likedSongs,
    playlists,
    history,
    deletePlaylist,
    removeSongFromPlaylist,
  } = useUser();
  const { playSong, playShuffled, isShuffled } = useAudio();

  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(initialPlaylistId);
  const [viewMode, setViewMode] = useState<'all' | 'liked' | 'history'>(initialViewMode);

  useEffect(() => {
    if (initialPlaylistId) {
      setActivePlaylistId(initialPlaylistId);
      setViewMode('all');
    } else if (initialViewMode) {
      setViewMode(initialViewMode);
    }
  }, [initialPlaylistId, initialViewMode]);

  const activePlaylist = activePlaylistId
    ? playlists.find((p) => p.id === activePlaylistId) || null
    : null;

  const handlePlayAll = (songs: Song[], shuffle: boolean = false) => {
    if (songs.length === 0) return;
    if (shuffle) {
      playShuffled(songs, activeEmail);
    } else {
      playSong(songs[0], songs, activeEmail);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="pb-6 pt-16 text-center space-y-4 px-4">
        <div className="w-16 h-16 rounded-3xl bg-[var(--accent-soft)] border border-[var(--accent-border)] flex items-center justify-center mx-auto text-[var(--accent-primary)]">
          <Music className="w-8 h-8" />
        </div>
        <div className="max-w-xs mx-auto space-y-1">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Your Personal Library</h2>
          <p className="text-xs text-[var(--text-secondary)]">
            Sign in to save liked songs, create custom playlists, and sync across devices.
          </p>
        </div>
        <button
          onClick={onOpenUserModal}
          className="min-h-[44px] px-6 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-lg shadow-indigo-600/30 cursor-pointer"
        >
          Sign In or Register
        </button>
      </div>
    );
  }

  // Inside a custom playlist (always live-derived from playlists array!)
  if (activePlaylist) {
    const totalSecs = activePlaylist.songs.reduce((acc, s) => acc + (s.duration || 0), 0);

    return (
      <div className="pb-6 pt-2 space-y-4">
        <button
          onClick={() => {
            setActivePlaylistId(null);
            onClearInitialTarget?.();
          }}
          className="min-h-[44px] px-2 -ml-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Library</span>
        </button>

        {/* Playlist Header */}
        <div
          className={`relative overflow-hidden p-5 rounded-3xl bg-gradient-to-tr ${
            activePlaylist.coverColor || 'from-violet-600 to-indigo-700'
          } shadow-xl text-white`}
        >
          {activePlaylist.coverUrl && (
            <>
              <img
                src={activePlaylist.coverUrl}
                alt=""
                aria-hidden="true"
                referrerPolicy="no-referrer"
                className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-50 pointer-events-none"
              />
              <div className="absolute inset-0 bg-slate-950/55 pointer-events-none" />
            </>
          )}

          <div className="relative z-10 flex items-center gap-4">
            {activePlaylist.coverUrl ? (
              <img
                src={activePlaylist.coverUrl}
                alt={activePlaylist.name}
                referrerPolicy="no-referrer"
                className="w-16 h-16 rounded-2xl object-cover shrink-0 shadow-lg border border-white/20"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-black/25 flex items-center justify-center shrink-0 shadow-inner">
                <Music className="w-8 h-8 text-white/90" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-black text-white truncate">{activePlaylist.name}</h2>
              {activePlaylist.description ? (
                <p className="text-xs text-white/85 truncate mt-0.5">{activePlaylist.description}</p>
              ) : null}
              <p className="text-xs text-white/80 mt-0.5">
                {activePlaylist.songs.length} songs • {formatTime(totalSecs)}
              </p>
            </div>
          </div>

          <div className="relative z-10 flex items-center justify-between mt-4 pt-3 border-t border-white/20">
            <div className="flex items-center gap-2.5">
              <button
                disabled={activePlaylist.songs.length === 0}
                onClick={() => handlePlayAll(activePlaylist.songs, false)}
                className="min-h-[44px] px-5 py-2.5 rounded-full bg-white text-slate-950 text-xs font-bold flex items-center gap-2 shadow-md hover:bg-slate-100 transition active:scale-95 disabled:opacity-40 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-slate-950 ml-0.5" />
                <span>Play</span>
              </button>
              <button
                disabled={activePlaylist.songs.length === 0}
                onClick={() => handlePlayAll(activePlaylist.songs, true)}
                aria-label="Shuffle playlist"
                aria-pressed={isShuffled}
                className={`w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center transition active:scale-95 disabled:opacity-40 cursor-pointer ${
                  isShuffled
                    ? 'bg-white text-indigo-700 shadow-md'
                    : 'bg-black/30 hover:bg-black/50 text-white'
                }`}
                title="Shuffle"
              >
                <Shuffle className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              {onEditPlaylist && (
                <button
                  onClick={() => onEditPlaylist(activePlaylist)}
                  className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-white/85 hover:text-white hover:bg-black/25 transition cursor-pointer active:scale-90"
                  aria-label="Rename or edit playlist artwork"
                  title="Rename / Edit Cover"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => {
                  deletePlaylist(activePlaylist.id);
                  setActivePlaylistId(null);
                  onClearInitialTarget?.();
                }}
                className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-white/75 hover:text-rose-300 hover:bg-black/25 transition cursor-pointer active:scale-90"
                title="Delete Playlist"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Songs List */}
        <div className="space-y-2">
          {activePlaylist.songs.length === 0 ? (
            <div className="py-12 text-center text-[var(--text-secondary)]">
              <Music className="w-8 h-8 mx-auto opacity-40 mb-1" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">Playlist is empty</p>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Search tracks and tap &apos;Add to Playlist&apos;.
              </p>
            </div>
          ) : (
            activePlaylist.songs.map((s, idx) => (
              <SongRow
                key={`${s.id}_${idx}`}
                song={s}
                queueContext={activePlaylist.songs}
                index={idx}
                showIndex
                isCustomPlaylist
                onOpenPlaylistModal={onOpenPlaylistModal}
                onRemoveFromPlaylist={(sId) => removeSongFromPlaylist(activePlaylist.id, sId)}
              />
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pb-6 pt-3 space-y-4">
      {/* Library Title & Quick Actions */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold text-[var(--text-primary)] tracking-tight">
          Your Library
        </h1>
        <div className="flex items-center gap-2">
          {onOpenImportPlaylist && (
            <button
              onClick={onOpenImportPlaylist}
              className="min-h-[44px] flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-bold transition cursor-pointer active:scale-95"
            >
              <Link2 className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              <span>Import</span>
            </button>
          )}
          <button
            onClick={onOpenCreatePlaylist}
            className="min-h-[44px] flex items-center gap-1.5 px-4 py-2 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-sm cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>New</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs with 44px Hit Targets */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        <button
          onClick={() => setViewMode('all')}
          className={`min-h-[44px] px-4 py-2 rounded-2xl text-xs font-semibold transition cursor-pointer flex items-center justify-center whitespace-nowrap active:scale-95 ${
            viewMode === 'all'
              ? 'bg-[var(--pill-active-bg)] text-[var(--pill-active-text)] font-bold shadow'
              : 'bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
          }`}
        >
          Playlists ({playlists.length})
        </button>
        <button
          onClick={() => setViewMode('liked')}
          className={`min-h-[44px] px-4 py-2 rounded-2xl text-xs font-semibold transition cursor-pointer flex items-center justify-center whitespace-nowrap active:scale-95 ${
            viewMode === 'liked'
              ? 'bg-[var(--pill-active-bg)] text-[var(--pill-active-text)] font-bold shadow'
              : 'bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
          }`}
        >
          Liked Songs ({likedSongs.length})
        </button>
        <button
          onClick={() => setViewMode('history')}
          className={`min-h-[44px] px-4 py-2 rounded-2xl text-xs font-semibold transition cursor-pointer flex items-center justify-center whitespace-nowrap active:scale-95 ${
            viewMode === 'history'
              ? 'bg-[var(--pill-active-bg)] text-[var(--pill-active-text)] font-bold shadow'
              : 'bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
          }`}
        >
          History
        </button>
      </div>

      {/* Liked Songs Tab */}
      {viewMode === 'liked' && (
        <div className="space-y-2.5">
          {likedSongs.length === 0 ? (
            <div className="py-12 text-center text-[var(--text-secondary)]">
              <Heart className="w-8 h-8 mx-auto opacity-40 mb-1" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">No liked songs yet</p>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Tap the heart icon while playing any song.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 pb-1">
                <button
                  onClick={() => handlePlayAll(likedSongs, false)}
                  className="min-h-[44px] px-4 py-2 rounded-full bg-[var(--pill-active-bg)] text-[var(--pill-active-text)] text-xs font-bold flex items-center gap-1.5 shadow-sm hover:opacity-90 transition active:scale-95 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  <span>Play All</span>
                </button>
                <button
                  onClick={() => handlePlayAll(likedSongs, true)}
                  aria-label="Shuffle Liked Songs"
                  aria-pressed={isShuffled}
                  className={`min-h-[44px] px-4 py-2 rounded-full border text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer ${
                    isShuffled
                      ? 'bg-[var(--accent-soft)] border-[var(--accent-border)] text-[var(--accent-primary)]'
                      : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                  }`}
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  <span>Shuffle</span>
                </button>
              </div>
              {likedSongs.map((s, idx) => (
                <SongRow
                  key={s.id}
                  song={s}
                  queueContext={likedSongs}
                  index={idx}
                  showIndex
                  onOpenPlaylistModal={onOpenPlaylistModal}
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* History Tab */}
      {viewMode === 'history' && (
        <div className="space-y-2.5">
          {history.length === 0 ? (
            <div className="py-12 text-center text-[var(--text-secondary)]">
              <Clock className="w-8 h-8 mx-auto opacity-40 mb-1" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">No history yet</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 pb-1">
                <button
                  onClick={() => handlePlayAll(history, false)}
                  className="min-h-[44px] px-4 py-2 rounded-full bg-[var(--pill-active-bg)] text-[var(--pill-active-text)] text-xs font-bold flex items-center gap-1.5 shadow-sm hover:opacity-90 transition active:scale-95 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  <span>Play All</span>
                </button>
                <button
                  onClick={() => handlePlayAll(history, true)}
                  aria-label="Shuffle Listening History"
                  aria-pressed={isShuffled}
                  className={`min-h-[44px] px-4 py-2 rounded-full border text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer ${
                    isShuffled
                      ? 'bg-[var(--accent-soft)] border-[var(--accent-border)] text-[var(--accent-primary)]'
                      : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                  }`}
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  <span>Shuffle</span>
                </button>
              </div>
              {history.map((s, idx) => (
                <SongRow
                  key={`${s.id}_${idx}`}
                  song={s}
                  queueContext={history}
                  index={idx}
                  showIndex
                  onOpenPlaylistModal={onOpenPlaylistModal}
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* Playlists Tab */}
      {viewMode === 'all' && (
        <div className="space-y-2.5">
          {/* Pinned Liked Songs Card */}
          <div
            onClick={() => setViewMode('liked')}
            className="p-3.5 rounded-2xl bg-gradient-to-r from-rose-500/20 via-pink-500/10 to-[var(--bg-surface)] border border-rose-500/35 hover:border-rose-500/60 transition-all duration-200 active:scale-[0.99] cursor-pointer flex items-center justify-between shadow-sm"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-rose-600 to-pink-500 flex items-center justify-center shadow-md shadow-rose-950/30">
                <Heart className="w-6 h-6 fill-white text-white" />
              </div>
              <div>
                <p className="font-bold text-sm text-[var(--text-primary)]">Liked Songs</p>
                <p className="text-xs text-rose-600 dark:text-rose-200/80 mt-0.5 tabular-nums font-medium">
                  {likedSongs.length} tracks
                </p>
              </div>
            </div>
            <button
              disabled={likedSongs.length === 0}
              onClick={(e) => {
                e.stopPropagation();
                handlePlayAll(likedSongs, false);
              }}
              aria-label="Play Liked Songs"
              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-rose-600/90 hover:bg-rose-500 text-white flex items-center justify-center transition disabled:opacity-30 cursor-pointer active:scale-90 shrink-0"
            >
              <Play className="w-4 h-4 fill-current ml-0.5" />
            </button>
          </div>

          {/* User Playlists */}
          {playlists.map((pl) => (
            <div
              key={pl.id}
              onClick={() => setActivePlaylistId(pl.id)}
              className="p-3.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)] hover:border-[var(--border-strong)] transition-all duration-200 active:scale-[0.99] cursor-pointer flex items-center justify-between shadow-sm"
            >
              <div className="flex items-center gap-3.5 min-w-0 pr-2">
                {pl.coverUrl ? (
                  <img
                    src={pl.coverUrl}
                    alt={pl.name}
                    referrerPolicy="no-referrer"
                    className="w-12 h-12 rounded-xl object-cover shadow-md shrink-0 border border-white/15"
                  />
                ) : (
                  <div
                    className={`w-12 h-12 rounded-xl bg-gradient-to-tr ${
                      pl.coverColor || 'from-violet-600 to-indigo-700'
                    } flex items-center justify-center text-white shadow-md shrink-0`}
                  >
                    <Music className="w-6 h-6 text-white/95" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-bold text-sm text-[var(--text-primary)] truncate">{pl.name}</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5 tabular-nums">
                    {pl.songs.length} tracks
                  </p>
                </div>
              </div>

              <button
                disabled={pl.songs.length === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  handlePlayAll(pl.songs, false);
                }}
                aria-label={`Play ${pl.name}`}
                className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:text-white hover:bg-indigo-600 flex items-center justify-center transition disabled:opacity-30 cursor-pointer active:scale-90 shrink-0"
              >
                <Play className="w-4 h-4 fill-current ml-0.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
