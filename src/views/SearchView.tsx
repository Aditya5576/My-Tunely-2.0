import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Loader2, Music, Sparkles } from 'lucide-react';
import { Song } from '../types/music';
import { musicAPI } from '../services/api';
import { SongRow } from '../components/SongRow';
import { useUser } from '../context/UserContext';
import { GUEST_SEARCH_LIMIT } from '../utils/guestLimits';

interface SearchViewProps {
  initialQuery?: string;
  onOpenPlaylistModal: (song: Song) => void;
}

const BROWSE_GENRES = [
  { name: 'Bollywood Hits', color: 'from-rose-600 to-pink-700', query: 'Bollywood Hits' },
  { name: 'Arijit Singh', color: 'from-blue-600 to-indigo-800', query: 'Arijit Singh' },
  { name: 'Punjabi Pop', color: 'from-amber-600 to-orange-700', query: 'Punjabi Pop' },
  { name: 'Romance & Love', color: 'from-red-600 to-rose-700', query: 'Romantic' },
  { name: 'Indie & Acoustic', color: 'from-emerald-600 to-teal-800', query: 'Indie' },
  { name: 'Global Top 50', color: 'from-purple-600 to-indigo-800', query: 'Global Top 50' },
  { name: 'Party & Dance', color: 'from-fuchsia-600 to-pink-700', query: 'Party' },
  { name: 'Lo-Fi Chill', color: 'from-cyan-600 to-blue-700', query: 'Lo-Fi' },
];

export const SearchView: React.FC<SearchViewProps> = ({
  initialQuery = '',
  onOpenPlaylistModal,
}) => {
  const { isGuest, guestUsage, checkGuestSearchAllowed, recordGuestSearch, openLoginGate } = useUser();
  const [query, setQuery] = useState(initialQuery);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('tunely_recent_searches');
      return stored ? JSON.parse(stored) : ['Arijit Singh', 'Bollywood Hits', 'Global Top 50'];
    } catch {
      return ['Arijit Singh', 'Bollywood Hits'];
    }
  });

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRequestIdRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const saveRecentSearch = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed || trimmed.length < 2) return;
    setRecentSearches((prev) => {
      const filtered = prev.filter((item) => item.toLowerCase() !== trimmed.toLowerCase());
      const next = [trimmed, ...filtered].slice(0, 6);
      try {
        localStorage.setItem('tunely_recent_searches', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    try {
      localStorage.removeItem('tunely_recent_searches');
    } catch {}
  };

  const executeSearch = useCallback(async (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (!trimmed || trimmed.length < 2) {
      setSongs([]);
      setLoading(false);
      setSearchError(null);
      return;
    }

    if (isGuest && !checkGuestSearchAllowed()) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const currentRequestId = ++activeRequestIdRef.current;
    setLoading(true);
    setSearchError(null);

    try {
      const results = await musicAPI.searchSongs(trimmed, 20, controller.signal);
      if (currentRequestId === activeRequestIdRef.current) {
        setSongs(results || []);
        if (results && results.length > 0) {
          saveRecentSearch(trimmed);
          if (isGuest) {
            recordGuestSearch();
          }
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      if (currentRequestId === activeRequestIdRef.current) {
        console.warn('Search error:', err);
        setSearchError('Unable to load tracks. Please check connection and try again.');
      }
    } finally {
      if (currentRequestId === activeRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    if (!val.trim() || val.trim().length < 2) {
      if (abortControllerRef.current) abortControllerRef.current.abort();
      setSongs([]);
      setLoading(false);
      setSearchError(null);
      return;
    }

    setLoading(true);
    debounceTimerRef.current = setTimeout(() => {
      executeSearch(val);
    }, 220);
  };

  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
      executeSearch(initialQuery);
    }
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [initialQuery, executeSearch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    inputRef.current?.blur();
    executeSearch(query);
  };

  const handleClear = () => {
    setQuery('');
    setSongs([]);
    setLoading(false);
    setSearchError(null);
    inputRef.current?.focus();
  };

  const handleSelectTerm = (term: string) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    setQuery(term);
    inputRef.current?.blur();
    executeSearch(term);
  };

  return (
    <div className="pb-6 pt-1 space-y-4">
      {/* Sticky Clean Search Bar (sticks to top of main cleanly below Header) */}
      <div className="sticky top-0 z-20 bg-[var(--bg-shell)] pt-2 pb-2 -mx-1 px-1 transition-colors duration-200">
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--text-secondary)]">
            <Search className="w-4 h-4" />
          </div>
          <input
            ref={inputRef}
            type="text"
            enterKeyHint="search"
            value={query}
            onChange={handleQueryChange}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                inputRef.current?.blur();
              }
            }}
            placeholder="Search songs, artists, albums..."
            aria-label="Search songs, artists, or albums"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            className="w-full h-12 pl-10 pr-12 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-base sm:text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] focus:bg-[var(--bg-surface-hover)] shadow-sm transition"
          />
          {query ? (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear search"
              className="absolute inset-y-0 right-0 w-11 h-11 min-w-[44px] min-h-[44px] my-auto mr-1 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-xl active:scale-95 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </form>
      </div>

      {/* Guest Mode Search Quota Banner */}
      {isGuest && (
        <div className="flex items-center justify-between p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-500 dark:text-amber-300">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              Guest search quota: <strong>{guestUsage.searchesCount}</strong> / {GUEST_SEARCH_LIMIT} used
            </span>
          </div>
          <button
            onClick={() => openLoginGate('Sign in with Google for unlimited song searches.')}
            className="text-[11px] font-bold underline cursor-pointer hover:opacity-80 shrink-0 ml-2"
          >
            Unlock Unlimited
          </button>
        </div>
      )}

      {/* Smooth 60fps Loading Skeletons */}
      {loading && (
        <div className="space-y-2.5 pt-1 animate-fade-in">
          <div className="flex items-center gap-2 px-1 text-xs text-[var(--text-secondary)]">
            <Loader2 className="w-3.5 h-3.5 text-[var(--accent-primary)] animate-spin" />
            <span>Finding top global matches...</span>
          </div>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="w-full p-2.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center gap-3"
            >
              <div className="w-12 h-12 rounded-xl tunely-skeleton shrink-0" />
              <div className="flex-1 min-w-0 space-y-2">
                <div className="h-3.5 w-2/3 rounded-md tunely-skeleton" />
                <div className="h-3 w-1/2 rounded-md tunely-skeleton" />
              </div>
              <div className="w-16 h-8 rounded-xl tunely-skeleton shrink-0" />
            </div>
          ))}
        </div>
      )}

      {/* Search Error State */}
      {searchError && !loading && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/35 text-center space-y-2">
          <p className="text-xs font-semibold text-rose-500 dark:text-rose-300">{searchError}</p>
          <button
            onClick={() => executeSearch(query)}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition cursor-pointer"
          >
            Retry Search
          </button>
        </div>
      )}

      {/* When Query is Empty: Recent Searches & Browse Category Tiles */}
      {!query.trim() && (
        <div className="space-y-5 pt-1">
          {recentSearches.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--text-secondary)] tracking-tight">
                  Recent Searches
                </span>
                <button
                  onClick={clearRecentSearches}
                  className="min-h-[44px] px-2 flex items-center text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
                >
                  Clear all
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((term) => (
                  <button
                    key={term}
                    onClick={() => handleSelectTerm(term)}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-hover)] text-xs text-[var(--text-primary)] transition cursor-pointer flex items-center select-none active:scale-95"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <h2 className="text-sm font-bold text-[var(--text-primary)] tracking-tight">
              Browse All
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {BROWSE_GENRES.map((g) => (
                <div
                  key={g.name}
                  onClick={() => handleSelectTerm(g.query)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelectTerm(g.query);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className={`min-h-[108px] p-4 rounded-2xl bg-gradient-to-br ${g.color} shadow-lg flex flex-col justify-between cursor-pointer hover:brightness-110 active:scale-[0.97] transition-all duration-200 overflow-hidden relative group border border-white/15`}
                >
                  <span className="font-extrabold text-sm sm:text-base text-white tracking-tight leading-snug z-10">
                    {g.name}
                  </span>
                  <Music className="w-12 h-12 text-white/20 absolute -bottom-1 -right-1 rotate-12 group-hover:scale-110 transition duration-300" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Search Results Ranked by Global Popularity & Album Diversity */}
      {!loading && query.trim() && (
        <div className="space-y-2">
          {songs.length > 0 && (
            <div className="flex items-center justify-between px-1 pb-0.5">
              <span className="text-xs font-bold text-[var(--text-secondary)] tracking-tight">
                Top Matches
              </span>
              <span className="text-[11px] text-[var(--text-muted)]">Most popular first</span>
            </div>
          )}

          {songs.length > 0 ? (
            songs.map((song, idx) => (
              <SongRow
                key={`${song.id}_${idx}`}
                song={song}
                queueContext={songs}
                index={idx}
                onOpenPlaylistModal={onOpenPlaylistModal}
              />
            ))
          ) : (
            <div className="py-16 text-center text-[var(--text-secondary)] space-y-2">
              <Search className="w-8 h-8 mx-auto text-[var(--text-muted)] stroke-1" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">No tracks found</p>
              <p className="text-xs text-[var(--text-secondary)]">
                Try searching with a different artist, song name, or film.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
