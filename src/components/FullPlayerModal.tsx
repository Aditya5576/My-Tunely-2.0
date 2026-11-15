import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Heart,
  Download,
  Check,
  Shuffle,
  Repeat,
  Repeat1,
  SkipBack,
  SkipForward,
  Play,
  Pause,
  ListMusic,
  Moon,
  Radio,
  Plus,
  Volume2,
  VolumeX,
  AlignLeft,
  Disc3,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useAudio } from '../hooks/useAudio';
import { useUser } from '../context/UserContext';
import {
  cleanHtmlEntities,
  findActiveLyricIndex,
  formatTime,
  getBestImageUrl,
} from '../utils/audioCore';
import { LyricsPayload, Song } from '../types/music';
import { musicAPI } from '../services/api';
import { QueueDrawer } from './QueueDrawer';

interface FullPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenQualityModal: () => void;
  onOpenSleepTimer: () => void;
  onOpenPlaylistModal: (song: Song) => void;
}

const PROFILE_LABELS: Record<string, string> = {
  studio: 'Studio',
  bass: 'Deep Bass',
  vocal: 'Vocal',
  concert: 'Concert 3D',
  night: 'Night Chill',
  flat: 'Flat',
};

export const FullPlayerModal: React.FC<FullPlayerModalProps> = ({
  isOpen,
  onClose,
  onOpenQualityModal,
  onOpenSleepTimer,
  onOpenPlaylistModal,
}) => {
  const {
    currentSong,
    playState,
    currentTime,
    duration,
    bufferedEnd,
    volume,
    isMuted,
    isShuffled,
    repeatMode,
    activeQuality,
    soundProfile,
    hiResEnhancer,
    isIOS,
    sleepTimerRemaining,
    isSleepTimerOnEndTrack,
    togglePlayPause,
    seek,
    next,
    previous,
    toggleShuffle,
    cycleRepeatMode,
    setVolume,
    toggleMute,
  } = useAudio(true);

  const {
    isLiked,
    toggleLiked,
    downloadSongForOffline,
    deleteOfflineTrack,
    offlineTracks,
    downloadingSongIds,
  } = useUser();

  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);

  // Live Synchronized Lyrics state
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyricsPayload, setLyricsPayload] = useState<LyricsPayload | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsError, setLyricsError] = useState<string | null>(null);
  const [lyricsRetryTick, setLyricsRetryTick] = useState(0);

  const lineRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  // Reset cached UI lyrics payload cleanly whenever track changes
  useEffect(() => {
    setLyricsPayload(null);
    setLyricsError(null);
    lineRefs.current = {};
  }, [currentSong?.id]);

  // Fetch synchronized lyrics when Lyrics view is active and player is open
  useEffect(() => {
    if (!isOpen || !showLyrics || !currentSong) return;

    const controller = new AbortController();
    let cancelled = false;
    setLyricsLoading(true);
    setLyricsError(null);

    musicAPI
      .getSongLyrics(currentSong, controller.signal)
      .then((res) => {
        if (cancelled) return;
        setLyricsPayload(res);
      })
      .catch((err) => {
        if (cancelled || err?.name === 'AbortError') return;
        setLyricsError('Unable to reach lyrics service.');
      })
      .finally(() => {
        if (!cancelled) setLyricsLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isOpen, showLyrics, currentSong?.id, lyricsRetryTick]);

  const syncedLines = lyricsPayload?.syncedLyrics || [];
  const activeLyricIndex =
    showLyrics && syncedLines.length > 0 ? findActiveLyricIndex(syncedLines, currentTime) : -1;

  // Smooth auto-scroll active lyric line into center
  useEffect(() => {
    if (!isOpen || !showLyrics || activeLyricIndex < 0) return;
    const el = lineRefs.current[activeLyricIndex];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isOpen, showLyrics, activeLyricIndex]);

  if (!isOpen || !currentSong) return null;

  const title = cleanHtmlEntities(currentSong.name);
  const artists = currentSong.artists?.primary?.map((a) => a.name).join(', ') || 'Unknown Artist';
  const albumName = currentSong.album?.name ? cleanHtmlEntities(currentSong.album.name) : 'Tunely 2.0';
  const artwork = getBestImageUrl(currentSong.image, 'lg');
  const liked = isLiked(currentSong.id);
  const isDownloaded = offlineTracks.some((t) => t.id === currentSong.id);
  const downloadProgress = downloadingSongIds[currentSong.id];
  const isPlaying = playState === 'playing';

  const currentDisplayTime = isSeeking ? seekValue : currentTime;
  const progressPercent = duration > 0 ? (currentDisplayTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (bufferedEnd / duration) * 100 : 0;

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSeekValue(Number(e.target.value));
  };

  const handleSeekStart = () => {
    setIsSeeking(true);
    setSeekValue(currentTime);
  };

  const handleSeekEnd = () => {
    seek(seekValue);
    setIsSeeking(false);
  };

  const qualityBadge = activeQuality.replace('kbps', 'K').toUpperCase();
  const profileBadge = PROFILE_LABELS[soundProfile] || 'Studio';
  const plainLines = lyricsPayload?.plainLyrics
    ? lyricsPayload.plainLyrics
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l, idx, arr) => l.length > 0 || (idx > 0 && arr[idx - 1].length > 0))
    : [];

  return (
    <div className="fixed inset-0 z-50 bg-[var(--bg-app)] text-[var(--text-primary)] animate-fade-in flex flex-col overflow-hidden">
      {/* Clipped Background ambient glow from artwork */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute inset-0 opacity-20 dark:opacity-25 blur-xl scale-105 bg-cover bg-center transition-opacity duration-500"
          style={{ backgroundImage: `url(${artwork})` }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to bottom, rgba(0,0,0,0) 0%, var(--bg-app) 82%)',
          }}
        />
        <div className="absolute inset-0 bg-[var(--bg-app)]/72 dark:bg-[var(--bg-app)]/70" />
      </div>

      <div className="relative z-10 w-full h-full max-w-md mx-auto sm:max-w-xl md:max-w-2xl px-4 sm:px-6 flex flex-col overflow-hidden animate-sheet-up">
        {/* Zone 1: Pinned Top Navigation Bar (Clears iOS Notch / Dynamic Island) */}
        <div className="shrink-0 safe-player-top pb-2 grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2">
          <button
            onClick={onClose}
            aria-label="Minimize Player"
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] flex items-center justify-center transition-transform active:scale-90 cursor-pointer shadow-sm"
          >
            <ChevronDown className="w-6 h-6" />
          </button>

          <div className="text-center min-w-0 px-1">
            <div className="flex items-center justify-center gap-1.5">
              {isPlaying && (
                <span className="flex items-end gap-0.5 h-3" aria-hidden="true">
                  <span className="w-0.5 h-2.5 bg-[var(--accent-primary)] rounded-full animate-eq-1" />
                  <span className="w-0.5 h-3 bg-pink-500 rounded-full animate-eq-2" />
                  <span className="w-0.5 h-2 bg-[var(--accent-secondary)] rounded-full animate-eq-3" />
                </span>
              )}
              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                {showLyrics ? 'Live Lyrics' : 'Now Playing'}
              </span>
            </div>
            <p className="text-xs font-semibold text-[var(--text-primary)] truncate mt-0.5">
              {albumName}
            </p>
          </div>

          <button
            onClick={() => onOpenPlaylistModal(currentSong)}
            aria-label="Add to Playlist"
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] flex items-center justify-center transition-transform active:scale-90 cursor-pointer shadow-sm"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Zone 2: Flexible Center Showcase (Album Art OR Live Lyrics + Option Pills) */}
        <div className="flex-1 min-h-0 flex flex-col items-center justify-evenly overflow-y-auto no-scrollbar py-2 w-full">
          {!showLyrics ? (
            <div
              className={`relative w-[min(70vw,33dvh,288px)] h-[min(70vw,33dvh,288px)] sm:w-64 sm:h-64 md:w-72 md:h-72 aspect-square rounded-3xl overflow-hidden border border-[var(--border-strong)] bg-slate-900 transition-transform duration-200 ease-out shrink-0 ${
                isPlaying
                  ? 'scale-100 shadow-2xl shadow-indigo-900/45'
                  : 'scale-[0.94] opacity-90 shadow-xl shadow-black/40'
              }`}
            >
              <img
                src={artwork}
                alt={title}
                referrerPolicy="no-referrer"
                decoding="async"
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-full max-w-md h-[min(62vw,30dvh,256px)] sm:h-72 shrink-0 rounded-3xl bg-[var(--bg-elevated)] border border-[var(--border-strong)] shadow-xl flex flex-col overflow-hidden animate-fade-in">
              {/* Lyrics Panel Header */}
              <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      syncedLines.length > 0
                        ? 'bg-emerald-400 animate-pulse'
                        : 'bg-[var(--text-muted)]'
                    }`}
                  />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] truncate">
                    {syncedLines.length > 0
                      ? 'Synced · Tap line to seek'
                      : plainLines.length > 0
                      ? 'Lyrics'
                      : 'Lyrics Search'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowLyrics(false)}
                  className="px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1 transition cursor-pointer shrink-0"
                >
                  <Disc3 className="w-3.5 h-3.5" />
                  <span>Artwork</span>
                </button>
              </div>

              {/* Scrollable Lyrics Content */}
              <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-5">
                {lyricsLoading ? (
                  <div className="h-full flex flex-col items-center justify-center gap-2.5 text-[var(--text-secondary)]">
                    <Loader2 className="w-6 h-6 animate-spin text-[var(--accent-primary)]" />
                    <p className="text-xs font-medium">Searching synchronized lyrics...</p>
                  </div>
                ) : lyricsError ? (
                  <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-3">
                    <p className="text-xs text-rose-400 font-medium">{lyricsError}</p>
                    <button
                      type="button"
                      onClick={() => setLyricsRetryTick((t) => t + 1)}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Retry</span>
                    </button>
                  </div>
                ) : syncedLines.length > 0 ? (
                  <div className="space-y-2.5 py-8 text-center">
                    {syncedLines.map((line, idx) => {
                      const isActive = idx === activeLyricIndex;
                      const isPast = activeLyricIndex >= 0 && idx < activeLyricIndex;
                      return (
                        <button
                          key={`${line.time}_${idx}`}
                          ref={(el) => {
                            lineRefs.current[idx] = el;
                          }}
                          type="button"
                          onClick={() => seek(line.time)}
                          className={`w-full px-3 py-1.5 rounded-xl text-center transition-all duration-200 cursor-pointer block leading-relaxed ${
                            isActive
                              ? 'text-base sm:text-lg font-extrabold text-[var(--text-primary)] bg-[var(--accent-soft)] scale-[1.02] shadow-sm'
                              : isPast
                              ? 'text-xs sm:text-sm font-medium text-[var(--text-muted)] opacity-60 hover:opacity-90'
                              : 'text-xs sm:text-sm font-medium text-[var(--text-secondary)] opacity-85 hover:opacity-100'
                          }`}
                        >
                          {line.text}
                        </button>
                      );
                    })}
                  </div>
                ) : plainLines.length > 0 ? (
                  <div className="space-y-2 py-2 text-center">
                    {plainLines.map((line, idx) => (
                      <p
                        key={idx}
                        className="text-xs sm:text-sm font-medium text-[var(--text-primary)]/90 leading-relaxed"
                      >
                        {line}
                      </p>
                    ))}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-4 text-[var(--text-secondary)]">
                    <AlignLeft className="w-7 h-7 opacity-40" />
                    <p className="text-xs font-semibold text-[var(--text-primary)]">
                      No lyrics found for this track
                    </p>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      Instrumental or unlisted track. Tap Retry or switch back to artwork.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Stream Quality/Sound Profile, Lyrics Toggle & Sleep Timer Controls */}
          <div className="flex items-center justify-center gap-1.5 sm:gap-2 mt-2 max-w-full flex-wrap shrink-0">
            <button
              onClick={onOpenQualityModal}
              className="min-h-[40px] sm:min-h-[44px] px-2.5 sm:px-3.5 py-1.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer active:scale-95 shadow-sm whitespace-nowrap"
            >
              <Radio className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 shrink-0" />
              <span>
                {qualityBadge}
                {hiResEnhancer ? ' Hi-Res' : ''} · {profileBadge}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowLyrics((v) => !v)}
              aria-pressed={showLyrics}
              className={`min-h-[40px] sm:min-h-[44px] px-2.5 sm:px-3.5 py-1.5 rounded-2xl border text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95 shadow-sm whitespace-nowrap ${
                showLyrics
                  ? 'bg-[var(--accent-soft)] border-[var(--accent-border)] text-[var(--accent-primary)] font-bold'
                  : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
              }`}
            >
              <AlignLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>Lyrics</span>
            </button>

            <button
              onClick={onOpenSleepTimer}
              className={`min-h-[40px] sm:min-h-[44px] px-2.5 sm:px-3.5 py-1.5 rounded-2xl border text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95 shadow-sm whitespace-nowrap ${
                sleepTimerRemaining !== null || isSleepTimerOnEndTrack
                  ? 'bg-[var(--accent-soft)] border-[var(--accent-border)] text-[var(--accent-primary)] font-bold'
                  : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
              }`}
            >
              <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>
                {sleepTimerRemaining !== null
                  ? formatTime(sleepTimerRemaining)
                  : isSleepTimerOnEndTrack
                  ? 'End track'
                  : 'Sleep'}
              </span>
            </button>
          </div>
        </div>

        {/* Zone 3: Pinned Bottom Player Controls Stack (Clears iPhone Home Indicator) */}
        <div className="w-full shrink-0 safe-player-bottom pt-1.5 space-y-2.5">
          {/* Track Title & Like/Download row */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5">
            <div className="min-w-0 pr-1">
              <h2 className="text-base sm:text-xl font-black text-[var(--text-primary)] line-clamp-2 tracking-tight leading-tight">
                {title}
              </h2>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)] truncate mt-0.5 leading-normal">
                {artists}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isDownloaded ? (
                <button
                  onClick={() => deleteOfflineTrack(currentSong.id)}
                  aria-label="Downloaded offline. Tap to remove"
                  className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-500 hover:bg-rose-500/20 hover:text-rose-500 flex items-center justify-center transition cursor-pointer active:scale-90"
                  title="Saved in browser storage for 100% offline playback"
                >
                  <Check className="w-5 h-5 stroke-[2.5]" />
                </button>
              ) : (
                <button
                  disabled={downloadProgress !== undefined}
                  onClick={() => downloadSongForOffline(currentSong)}
                  aria-label="Download for offline playback"
                  className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] flex items-center justify-center transition cursor-pointer active:scale-90"
                  title="Download track to local IndexedDB"
                >
                  {downloadProgress !== undefined ? (
                    <div className="relative w-5 h-5 flex items-center justify-center">
                      <div className="w-4 h-4 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
                      <span className="text-[8px] font-bold text-[var(--accent-primary)] absolute">
                        {downloadProgress}
                      </span>
                    </div>
                  ) : (
                    <Download className="w-5 h-5" />
                  )}
                </button>
              )}

              <button
                onClick={() => toggleLiked(currentSong)}
                aria-label={liked ? 'Unlike' : 'Like'}
                className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-rose-500 hover:border-rose-500/40 flex items-center justify-center transition cursor-pointer active:scale-90"
              >
                <Heart
                  className={`w-5 h-5 transition-transform ${
                    liked ? 'fill-rose-500 text-rose-500 scale-110' : ''
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Progress Bar & Seek Slider */}
          <div>
            <div className="relative w-full flex items-center h-6 group">
              <div className="w-full h-1.5 rounded-full bg-[var(--border-strong)] overflow-hidden relative">
                <div
                  className="absolute top-0 bottom-0 left-0 bg-[var(--text-muted)]/35 transition-all duration-300"
                  style={{ width: `${bufferedPercent}%` }}
                />
                <div
                  className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-violet-500 via-indigo-500 to-pink-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.5}
                value={currentDisplayTime}
                onMouseDown={handleSeekStart}
                onTouchStart={handleSeekStart}
                onChange={handleSeekChange}
                onMouseUp={handleSeekEnd}
                onTouchEnd={handleSeekEnd}
                aria-label="Seek track"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between text-xs font-mono tabular-nums text-[var(--text-secondary)] px-0.5 -mt-0.5">
              <span>{formatTime(currentDisplayTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Playback Controls */}
          <div className="flex items-center justify-between gap-1 py-1">
            <button
              onClick={toggleShuffle}
              aria-label="Shuffle"
              className={`w-11 h-11 sm:w-12 sm:h-12 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full transition cursor-pointer active:scale-90 ${
                isShuffled
                  ? 'text-[var(--accent-primary)] bg-[var(--accent-soft)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]'
              }`}
            >
              <Shuffle className="w-5 h-5" />
            </button>

            <button
              onClick={previous}
              aria-label="Previous Track"
              className="w-11 h-11 sm:w-12 sm:h-12 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition active:scale-90 cursor-pointer"
            >
              <SkipBack className="w-6 h-6 sm:w-7 sm:h-7 fill-current" />
            </button>

            <button
              onClick={togglePlayPause}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="w-14 h-14 sm:w-16 sm:h-16 min-w-[56px] min-h-[56px] rounded-full bg-gradient-to-tr from-violet-600 via-indigo-500 to-pink-500 text-white flex items-center justify-center shadow-xl shadow-indigo-600/35 hover:scale-105 active:scale-95 transition cursor-pointer"
            >
              {playState === 'loading' ? (
                <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-6 h-6 sm:w-7 sm:h-7 fill-white" />
              ) : (
                <Play className="w-6 h-6 sm:w-7 sm:h-7 fill-white ml-0.5" />
              )}
            </button>

            <button
              onClick={next}
              aria-label="Next Track"
              className="w-11 h-11 sm:w-12 sm:h-12 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition active:scale-90 cursor-pointer"
            >
              <SkipForward className="w-6 h-6 sm:w-7 sm:h-7 fill-current" />
            </button>

            <button
              onClick={cycleRepeatMode}
              aria-label={`Repeat mode: ${repeatMode}`}
              className={`w-11 h-11 sm:w-12 sm:h-12 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full transition cursor-pointer active:scale-90 ${
                repeatMode !== 'off'
                  ? 'text-[var(--accent-primary)] bg-[var(--accent-soft)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]'
              }`}
            >
              {repeatMode === 'one' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
            </button>
          </div>

          {/* Bottom Secondary Utilities */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)]">
            {isIOS ? (
              <button
                type="button"
                onClick={toggleMute}
                aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
                aria-pressed={isMuted}
                className={`min-h-[44px] px-3 py-1.5 rounded-2xl border flex items-center gap-2 transition active:scale-95 cursor-pointer min-w-0 max-w-[62%] ${
                  isMuted
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                    : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                }`}
              >
                {isMuted ? (
                  <VolumeX className="w-4 h-4 text-rose-500 shrink-0" />
                ) : (
                  <Volume2 className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                )}
                <span className="text-[11px] font-semibold truncate">
                  {isMuted ? 'Muted · Tap to Unmute' : 'Sound On · Use side keys'}
                </span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0 flex-1 max-w-[180px]">
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                  className="w-11 h-11 min-w-[44px] min-h-[44px] shrink-0 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer rounded-full active:scale-90"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-rose-500" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  aria-label="Volume Slider"
                  className="tunely-slider w-full min-w-0 cursor-pointer"
                />
              </div>
            )}

            <button
              onClick={() => setIsQueueOpen(true)}
              aria-label="Open Queue"
              className="min-h-[44px] shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] text-xs font-semibold transition cursor-pointer active:scale-95 shadow-sm"
            >
              <ListMusic className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
              <span>Up Next</span>
            </button>
          </div>
        </div>
      </div>

      <QueueDrawer isOpen={isQueueOpen} onClose={() => setIsQueueOpen(false)} />
    </div>
  );
};
