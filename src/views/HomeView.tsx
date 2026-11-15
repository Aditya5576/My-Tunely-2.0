import React, { useEffect, useState } from 'react';
import {
  Play,
  Pause,
  Heart,
  Music,
  Plus,
  ChevronLeft,
  ChevronRight,
  Link2,
  Shuffle,
} from 'lucide-react';
import { FeedSection, Song } from '../types/music';
import { musicAPI, SEED_FALLBACK_TRACKS } from '../services/api';
import { SongCard } from '../components/SongCard';
import { useAudio } from '../hooks/useAudio';
import { useUser } from '../context/UserContext';
import { cleanHtmlEntities, getBestImageUrl } from '../utils/audioCore';

interface HomeViewProps {
  onOpenPlaylistModal: (song: Song) => void;
  onSearchGenre: (genre: string) => void;
  onOpenPlaylist: (playlistId: string) => void;
  onOpenLikedSongs: () => void;
  onCreatePlaylist: () => void;
  onImportPlaylist?: () => void;
}

const CATEGORY_CHIPS = ['All', 'Hindi', 'Global', 'Punjabi', 'Romance', 'Chill', 'Party'];

export const HomeView: React.FC<HomeViewProps> = ({
  onSearchGenre,
  onOpenPlaylist,
  onOpenLikedSongs,
  onCreatePlaylist,
  onImportPlaylist,
}) => {
  const [sections, setSections] = useState<FeedSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChip, setActiveChip] = useState('All');
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const { currentSong, playState, isShuffled, playSong, playShuffled, togglePlayPause } = useAudio();
  const { activeEmail, isLoggedIn, isOfflineModeOnly, offlineTracks, playlists, likedSongs } =
    useUser();

  const loadFeed = async () => {
    setLoading(true);
    try {
      if (isOfflineModeOnly && offlineTracks.length > 0) {
        setSections([
          {
            id: 'offline-feed',
            title: 'Downloaded Songs',
            songs: offlineTracks.map((t) => t.song),
          },
        ]);
      } else {
        const feed = await musicAPI.getCuratedFeed((freshSections) => {
          setSections(freshSections);
        });
        setSections(feed);
      }
    } catch {
      setSections([
        {
          id: 'seed-fallback',
          title: 'Featured Music',
          songs: SEED_FALLBACK_TRACKS,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeed();
  }, [isOfflineModeOnly, offlineTracks.length]);

  const handleChipClick = (chip: string) => {
    setActiveChip(chip);
    if (chip !== 'All') {
      onSearchGenre(chip);
    }
  };

  // Interleave songs across every curated section so Featured Spotlight spans dozens of diverse hits
  const spotlightPool: Song[] = (() => {
    const interleaved: Song[] = [];
    const seenIds = new Set<string>();
    const maxLen = sections.reduce((max, s) => Math.max(max, s.songs?.length || 0), 0);
    for (let i = 0; i < maxLen; i++) {
      for (const sec of sections) {
        const candidate = sec.songs?.[i];
        if (candidate && candidate.id && !seenIds.has(candidate.id)) {
          seenIds.add(candidate.id);
          interleaved.push(candidate);
        }
      }
    }
    return interleaved.length > 0 ? interleaved : SEED_FALLBACK_TRACKS;
  })();

  const safeSpotlightIdx =
    spotlightPool.length > 0 ? spotlightIndex % spotlightPool.length : 0;
  const featuredSong = spotlightPool[safeSpotlightIdx];
  const featuredTitle = featuredSong ? cleanHtmlEntities(featuredSong.name) : '';
  const featuredArtists =
    featuredSong?.artists?.primary?.map((a) => cleanHtmlEntities(a.name)).join(', ') ||
    'Featured Artist';
  const featuredAlbum = cleanHtmlEntities(featuredSong?.album?.name || '');
  const featuredArtwork = featuredSong ? getBestImageUrl(featuredSong.image, 'lg') : '';
  const isFeaturedCurrent = Boolean(featuredSong && currentSong?.id === featuredSong.id);
  const isFeaturedPlaying = isFeaturedCurrent && playState === 'playing';

  const handleShuffleSpotlight = () => {
    if (spotlightPool.length === 0) return;
    playShuffled(spotlightPool, activeEmail);
  };

  return (
    <div className="pb-6 pt-3 space-y-6">
      {/* Category Filter Chips with 44px Hit Targets */}
      <div className="flex items-center gap-2 overflow-x-auto touch-pan-x touch-pan-y pb-1 no-scrollbar -mx-1 px-1">
        {CATEGORY_CHIPS.map((chip) => (
          <button
            key={chip}
            onClick={() => handleChipClick(chip)}
            className={`min-h-[44px] px-4 py-2 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all duration-150 active:scale-95 cursor-pointer flex items-center justify-center select-none ${
              activeChip === chip
                ? 'bg-[var(--pill-active-bg)] text-[var(--pill-active-text)] shadow-md font-bold'
                : 'bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] hover:border-[var(--border-strong)]'
            }`}
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Featured Spotlight Banner above Playlists */}
      {featuredSong && (
        <section
          aria-label="Featured Pick"
          className="relative rounded-3xl overflow-hidden border border-white/15 shadow-xl bg-[#0e1426]"
        >
          {/* Soft Ambient Cover Layer & Scrim for Crisp Contrast */}
          <img
            src={featuredArtwork}
            alt=""
            aria-hidden="true"
            referrerPolicy="no-referrer"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover scale-105 blur-md opacity-45 pointer-events-none select-none"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/92 via-slate-950/82 to-slate-950/60 pointer-events-none" />

          <div className="relative z-10 p-3.5 sm:p-5 space-y-2.5">
            {/* Top Row: Unclipped Label + Arrows */}
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-300/95 truncate">
                Featured Spotlight
              </p>
              {spotlightPool.length > 1 && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setSpotlightIndex(
                        (prev) => (prev - 1 + spotlightPool.length) % spotlightPool.length
                      )
                    }
                    aria-label="Previous featured song"
                    className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors active:scale-90 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSpotlightIndex((prev) => (prev + 1) % spotlightPool.length)
                    }
                    aria-label="Next featured song"
                    className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors active:scale-90 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Body Row: Thumbnail + Wide Title/Artists/Actions */}
            <div className="flex items-center gap-3.5 sm:gap-4">
              <div
                onClick={() =>
                  isFeaturedCurrent
                    ? togglePlayPause()
                    : playSong(featuredSong, spotlightPool, activeEmail)
                }
                className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden shrink-0 shadow-2xl border border-white/15 cursor-pointer group active:scale-95 transition-transform"
              >
                <img
                  src={featuredArtwork}
                  alt={featuredTitle}
                  referrerPolicy="no-referrer"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
                {isFeaturedPlaying && (
                  <div className="absolute inset-0 bg-black/45 flex items-end justify-center gap-1 pb-2">
                    <span className="w-1 h-3.5 bg-white rounded-full animate-eq-1" />
                    <span className="w-1 h-5 bg-cyan-300 rounded-full animate-eq-2" />
                    <span className="w-1 h-3 bg-fuchsia-300 rounded-full animate-eq-3" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1 flex flex-col justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-display text-base sm:text-xl font-extrabold text-white truncate leading-tight">
                    {featuredTitle}
                  </h2>
                  <p className="text-xs text-slate-300 truncate mt-0.5">
                    {featuredArtists}
                    {featuredAlbum && featuredAlbum.toLowerCase() !== featuredTitle.toLowerCase()
                      ? ` · ${featuredAlbum}`
                      : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      isFeaturedCurrent
                        ? togglePlayPause()
                        : playSong(featuredSong, spotlightPool, activeEmail)
                    }
                    className="min-h-[40px] sm:min-h-[44px] px-4 py-1.5 rounded-full bg-white hover:bg-slate-100 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 shadow-lg transition-transform active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {isFeaturedPlaying ? (
                      <>
                        <Pause className="w-3.5 h-3.5 fill-slate-950 shrink-0" />
                        <span>Pause</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-slate-950 ml-0.5 shrink-0" />
                        <span>Play Now</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleShuffleSpotlight}
                    aria-label="Shuffle Trending Mix"
                    aria-pressed={isShuffled}
                    className={`min-h-[40px] sm:min-h-[44px] px-3.5 py-1.5 rounded-full border text-xs font-semibold flex items-center gap-1.5 transition-colors active:scale-95 cursor-pointer whitespace-nowrap shrink-0 ${
                      isShuffled
                        ? 'bg-indigo-500/85 hover:bg-indigo-500 border-indigo-300/60 text-white shadow-md shadow-indigo-900/40'
                        : 'bg-white/12 hover:bg-white/20 border-white/15 text-white'
                    }`}
                  >
                    <Shuffle className="w-3.5 h-3.5 shrink-0" />
                    <span>Shuffle</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Your Playlists & Saved Collection directly on Home */}
      {isLoggedIn && (
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">
              Your Playlists &amp; Saved
            </h2>
            <div className="flex items-center gap-1">
              {onImportPlaylist && (
                <button
                  onClick={onImportPlaylist}
                  className="min-h-[44px] px-2.5 flex items-center gap-1 text-xs font-semibold text-[var(--accent-secondary)] hover:opacity-80 transition cursor-pointer"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  <span>Import</span>
                </button>
              )}
              <button
                onClick={onCreatePlaylist}
                className="min-h-[44px] px-2.5 flex items-center gap-1 text-xs font-semibold text-[var(--accent-primary)] hover:opacity-80 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>New</span>
              </button>
            </div>
          </div>

          <div className="flex items-stretch gap-3 overflow-x-auto touch-pan-x touch-pan-y pb-1 no-scrollbar -mx-1 px-1">
            {/* Pinned Liked Songs Card */}
            <div
              onClick={onOpenLikedSongs}
              className="w-[164px] sm:w-44 min-h-[116px] shrink-0 rounded-2xl bg-gradient-to-br from-rose-500/20 via-pink-500/10 to-[var(--bg-surface)] border border-rose-500/35 hover:border-rose-500/60 p-3.5 flex flex-col justify-between gap-3 cursor-pointer transition-all duration-200 active:scale-[0.98] shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 to-pink-500 flex items-center justify-center shadow-md shadow-rose-950/30 shrink-0">
                  <Heart className="w-5 h-5 fill-white text-white" />
                </div>
                {likedSongs.length > 0 ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      playSong(likedSongs[0], likedSongs, activeEmail);
                    }}
                    aria-label="Play Liked Songs"
                    className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-md active:scale-90 transition cursor-pointer shrink-0"
                  >
                    <Play className="w-4 h-4 fill-white ml-0.5" />
                  </button>
                ) : (
                  <span className="w-9 h-9 rounded-full bg-[var(--bg-surface)] flex items-center justify-center text-rose-500 dark:text-rose-200/80 shrink-0">
                    <ChevronRight className="w-4 h-4" />
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-[var(--text-primary)] truncate leading-snug">
                  Liked Songs
                </p>
                <p className="text-[11px] text-rose-600 dark:text-rose-200/80 mt-0.5 tabular-nums font-medium">
                  {likedSongs.length} tracks
                </p>
              </div>
            </div>

            {/* User Created / Saved Playlists */}
            {playlists.map((pl) => (
              <div
                key={pl.id}
                onClick={() => onOpenPlaylist(pl.id)}
                className="w-[164px] sm:w-44 min-h-[116px] shrink-0 rounded-2xl bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] p-3.5 flex flex-col justify-between gap-3 cursor-pointer transition-all duration-200 active:scale-[0.98] shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  {pl.coverUrl ? (
                    <img
                      src={pl.coverUrl}
                      alt={pl.name}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-xl object-cover shadow-md shrink-0 border border-white/15"
                    />
                  ) : (
                    <div
                      className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${
                        pl.coverColor || 'from-violet-600 to-indigo-700'
                      } flex items-center justify-center shadow-md shrink-0`}
                    >
                      <Music className="w-5 h-5 text-white/95" />
                    </div>
                  )}
                  {pl.songs.length > 0 ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        playSong(pl.songs[0], pl.songs, activeEmail);
                      }}
                      aria-label={`Play ${pl.name}`}
                      className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-md active:scale-90 transition cursor-pointer shrink-0"
                    >
                      <Play className="w-4 h-4 fill-white ml-0.5" />
                    </button>
                  ) : (
                    <span className="w-9 h-9 rounded-full bg-[var(--bg-surface)] flex items-center justify-center text-[var(--text-secondary)] shrink-0">
                      <ChevronRight className="w-4 h-4" />
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[var(--text-primary)] truncate leading-snug">
                    {pl.name}
                  </p>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 tabular-nums">
                    {pl.songs.length} tracks
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Dynamic Carousels */}
      {loading && sections.length === 0 ? (
        <div className="space-y-6">
          {[1, 2].map((n) => (
            <div key={n} className="space-y-3">
              <div className="h-5 w-36 rounded-lg tunely-skeleton" />
              <div className="flex gap-3.5 overflow-hidden">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="w-[152px] sm:w-44 p-3 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-2.5 shrink-0"
                  >
                    <div className="aspect-square w-full rounded-xl tunely-skeleton" />
                    <div className="h-3.5 w-3/4 rounded-md tunely-skeleton" />
                    <div className="h-3 w-1/2 rounded-md tunely-skeleton" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        sections.map((section) => {
          if (!section.songs || section.songs.length === 0) return null;
          return (
            <section key={section.id} className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">
                  {section.title}
                </h2>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => playShuffled(section.songs, activeEmail)}
                    aria-label={`Shuffle ${section.title}`}
                    title={`Shuffle ${section.title}`}
                    className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:bg-[var(--bg-surface)] transition cursor-pointer active:scale-90"
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => playSong(section.songs[0], section.songs, activeEmail)}
                    className="min-h-[44px] px-3 flex items-center justify-center text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
                  >
                    Play all
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3.5 overflow-x-auto touch-pan-x touch-pan-y pb-2 no-scrollbar -mx-1 px-1">
                {section.songs.map((song) => (
                  <SongCard key={song.id} song={song} queueContext={section.songs} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
};
