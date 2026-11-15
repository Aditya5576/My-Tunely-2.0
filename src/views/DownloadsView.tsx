import React from 'react';
import { Play, Shuffle, Trash2, DownloadCloud } from 'lucide-react';
import { useUser } from '../context/UserContext';
import { useAudio } from '../hooks/useAudio';
import { SongRow } from '../components/SongRow';
import { formatFileSize } from '../utils/audioCore';
import { Song } from '../types/music';

interface DownloadsViewProps {
  onOpenPlaylistModal: (song: Song) => void;
  onGoToSearch: () => void;
}

export const DownloadsView: React.FC<DownloadsViewProps> = ({
  onOpenPlaylistModal,
  onGoToSearch,
}) => {
  const {
    offlineTracks,
    clearAllDownloads,
    isOfflineModeOnly,
    toggleOfflineModeOnly,
    activeEmail,
  } = useUser();
  const { playSong, playShuffled, isShuffled } = useAudio();

  const totalBytes = offlineTracks.reduce((acc, t) => acc + (t.sizeBytes || 0), 0);
  const downloadedSongs = offlineTracks.map((t) => t.song);
  const swReady =
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    Boolean(navigator.serviceWorker.controller);

  const handlePlayAll = (shuffle: boolean = false) => {
    if (downloadedSongs.length === 0) return;
    if (shuffle) {
      playShuffled(downloadedSongs, activeEmail);
    } else {
      playSong(downloadedSongs[0], downloadedSongs, activeEmail);
    }
  };

  return (
    <div className="pb-6 pt-3 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-[var(--text-primary)] tracking-tight">
            Downloads
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            {offlineTracks.length} tracks • {formatFileSize(totalBytes)}
          </p>
        </div>

        {/* Offline Mode Switch with 44px hit target */}
        <div className="flex items-center gap-2.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-1.5 rounded-2xl shadow-sm">
          <span className="text-xs font-semibold text-[var(--text-primary)]">Offline Only</span>
          <button
            onClick={toggleOfflineModeOnly}
            aria-label="Toggle Offline Mode"
            className={`w-11 h-6 rounded-full transition-colors p-0.5 cursor-pointer flex items-center ${
              isOfflineModeOnly ? 'bg-indigo-600' : 'bg-slate-400 dark:bg-slate-700'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                isOfflineModeOnly ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Offline Status & Testing Guide */}
      <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3.5 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-[var(--text-primary)]">
            True Offline Playback Ready
          </span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
              swReady && offlineTracks.length > 0
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/35'
                : 'bg-[var(--accent-soft)] text-[var(--accent-primary)] border border-[var(--accent-border)]'
            }`}
          >
            {swReady ? 'Shell Cached' : 'Dev Preview'}
          </span>
        </div>
        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
          1. Open the published/shared app URL (not Dev preview) &amp; download at least 1 song.
          2. Toggle <strong className="text-[var(--text-primary)]">Offline Only</strong> or turn on Airplane Mode.
          3. Play any downloaded track below—audio loads directly from on-device storage.
        </p>
      </div>

      {/* Action Controls with 44px Hit Targets */}
      {offlineTracks.length > 0 && (
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => handlePlayAll(false)}
              className="min-h-[44px] px-5 py-2.5 rounded-full bg-[var(--pill-active-bg)] text-[var(--pill-active-text)] text-xs font-bold flex items-center gap-2 shadow-md hover:opacity-90 transition active:scale-95 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current ml-0.5" />
              <span>Play All</span>
            </button>
            <button
              onClick={() => handlePlayAll(true)}
              aria-label="Shuffle downloaded songs"
              aria-pressed={isShuffled}
              className={`w-11 h-11 min-w-[44px] min-h-[44px] rounded-full border flex items-center justify-center transition active:scale-95 cursor-pointer ${
                isShuffled
                  ? 'bg-[var(--accent-soft)] border-[var(--accent-border)] text-[var(--accent-primary)] shadow-sm'
                  : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              title="Shuffle"
            >
              <Shuffle className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={clearAllDownloads}
            className="min-h-[44px] px-3 text-xs text-rose-500 hover:text-rose-400 flex items-center gap-1.5 font-semibold cursor-pointer active:scale-95"
          >
            <Trash2 className="w-4 h-4" />
            <span>Clear All</span>
          </button>
        </div>
      )}

      {/* Song List in CSS Grid Rows */}
      <div className="space-y-2">
        {offlineTracks.length === 0 ? (
          <div className="py-16 text-center text-[var(--text-secondary)] space-y-3">
            <DownloadCloud className="w-10 h-10 mx-auto opacity-40 stroke-1" />
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">No downloaded songs</p>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Download songs to listen without internet.
              </p>
            </div>
            <button
              onClick={onGoToSearch}
              className="min-h-[44px] px-5 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-md cursor-pointer active:scale-95"
            >
              Explore Music
            </button>
          </div>
        ) : (
          offlineTracks.map((item, idx) => (
            <SongRow
              key={item.id}
              song={item.song}
              queueContext={downloadedSongs}
              index={idx}
              showIndex
              onOpenPlaylistModal={onOpenPlaylistModal}
            />
          ))
        )}
      </div>
    </div>
  );
};
