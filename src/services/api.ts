import { FeedSection, LyricsPayload, Song } from '../types/music';
import { localDB } from './db';
import { cleanHtmlEntities, diversifySongs, parseLrcLyrics } from '../utils/audioCore';

const API_BASE = 'https://jiosaavn-api.adityapatil2348.workers.dev';

// Fallback seed songs to ensure offline first-run works beautifully
export const SEED_FALLBACK_TRACKS: Song[] = [
  {
    id: 'QcfFd62t',
    name: 'Tu Mil Jaaye (From "KING")',
    duration: 315,
    year: '2026',
    label: 'T-Series',
    language: 'hindi',
    image: [
      { quality: '50x50', url: 'https://c.saavncdn.com/320/Tu-Mil-Jaaye-From-KING-Hindi-2026-20261031131042-50x50.jpg' },
      { quality: '150x150', url: 'https://c.saavncdn.com/320/Tu-Mil-Jaaye-From-KING-Hindi-2026-20261031131042-150x150.jpg' },
      { quality: '500x500', url: 'https://c.saavncdn.com/320/Tu-Mil-Jaaye-From-KING-Hindi-2026-20261031131042-500x500.jpg' },
    ],
    artists: {
      primary: [{ id: '461968', name: 'Sachin-Jigar' }, { id: '459320', name: 'Arijit Singh' }],
    },
    album: { id: '82860841', name: 'Tu Mil Jaaye (From "KING")' },
    downloadUrl: [
      { quality: '12kbps', url: 'https://aac.saavncdn.com/320/4d91932291471256b3c9313360ebb834_12.mp4' },
      { quality: '48kbps', url: 'https://aac.saavncdn.com/320/4d91932291471256b3c9313360ebb834_48.mp4' },
      { quality: '96kbps', url: 'https://aac.saavncdn.com/320/4d91932291471256b3c9313360ebb834_96.mp4' },
      { quality: '160kbps', url: 'https://aac.saavncdn.com/320/4d91932291471256b3c9313360ebb834_160.mp4' },
      { quality: '320kbps', url: 'https://aac.saavncdn.com/320/4d91932291471256b3c9313360ebb834_320.mp4' },
    ],
  },
  {
    id: 'f_Jb27vX',
    name: 'Kesariya (From "Brahmastra")',
    duration: 268,
    year: '2022',
    label: 'Sony Music',
    language: 'hindi',
    image: [
      { quality: '50x50', url: 'https://c.saavncdn.com/191/Kesariya-From-Brahmastra-Hindi-2022-20220717092820-50x50.jpg' },
      { quality: '150x150', url: 'https://c.saavncdn.com/191/Kesariya-From-Brahmastra-Hindi-2022-20220717092820-150x150.jpg' },
      { quality: '500x500', url: 'https://c.saavncdn.com/191/Kesariya-From-Brahmastra-Hindi-2022-20220717092820-500x500.jpg' },
    ],
    artists: {
      primary: [{ id: '459320', name: 'Arijit Singh' }, { id: '456269', name: 'Pritam' }],
    },
    album: { id: '34481005', name: 'Kesariya' },
    downloadUrl: [
      { quality: '12kbps', url: 'https://aac.saavncdn.com/191/d50e6490656a8fb8166c4c514749f7ec_12.mp4' },
      { quality: '48kbps', url: 'https://aac.saavncdn.com/191/d50e6490656a8fb8166c4c514749f7ec_48.mp4' },
      { quality: '96kbps', url: 'https://aac.saavncdn.com/191/d50e6490656a8fb8166c4c514749f7ec_96.mp4' },
      { quality: '160kbps', url: 'https://aac.saavncdn.com/191/d50e6490656a8fb8166c4c514749f7ec_160.mp4' },
      { quality: '320kbps', url: 'https://aac.saavncdn.com/191/d50e6490656a8fb8166c4c514749f7ec_320.mp4' },
    ],
  },
];

export function sanitizeSearchQuery(query: string): string {
  if (!query) return '';
  return query
    .replace(/[\\\/]+/g, ' ')
    .replace(/[^\w\s\u0900-\u097F\u0A00-\u0A7F\u0B80-\u0BFF\u0C00-\u0C7F&'".-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeSong(raw: any): Song {
  if (!raw) {
    return {
      id: `err_${Date.now()}`,
      name: 'Unknown Track',
      duration: 210,
      image: [],
      downloadUrl: [],
    };
  }

  const id = String(raw.id || raw.songId || `song_${Date.now()}`);
  const rawName = raw.name || raw.title || raw.song || 'Untitled';
  const name = cleanHtmlEntities(rawName);
  const duration = Number(raw.duration) || 210;

  let artists = raw.artists;
  if (!artists || !artists.primary || artists.primary.length === 0) {
    const rawPrimary = raw.primaryArtists || raw.singers || raw.artist;
    if (typeof rawPrimary === 'string') {
      artists = {
        primary: rawPrimary.split(',').map((n: string) => ({
          id: n.trim().toLowerCase().replace(/\s+/g, '-'),
          name: cleanHtmlEntities(n.trim()),
        })),
      };
    } else if (Array.isArray(rawPrimary)) {
      artists = {
        primary: rawPrimary.map((a: any) => ({
          id: a.id || a.name || 'artist',
          name: cleanHtmlEntities(a.name || 'Artist'),
        })),
      };
    } else {
      artists = { primary: [{ id: '1', name: 'Various Artists' }] };
    }
  }

  let album = raw.album;
  if (typeof album === 'string') {
    album = { id: 'alb', name: cleanHtmlEntities(album) };
  } else if (album && typeof album === 'object') {
    album = {
      id: album.id || 'alb',
      name: cleanHtmlEntities(album.name || album.title || 'Single'),
      url: album.url,
    };
  } else {
    album = { id: 'alb', name: 'Single' };
  }

  let image = raw.image;
  if (typeof image === 'string') {
    image = [
      { quality: '50x50', url: image },
      { quality: '150x150', url: image },
      { quality: '500x500', url: image },
    ];
  } else if (!Array.isArray(image) || image.length === 0) {
    image = [];
  }

  let downloadUrl = raw.downloadUrl;
  if (typeof downloadUrl === 'string') {
    downloadUrl = [{ quality: '320kbps', url: downloadUrl }];
  } else if (!Array.isArray(downloadUrl)) {
    downloadUrl = [];
  }

  const playCount = Number(raw.playCount ?? raw.play_count ?? 0) || 0;

  return {
    id,
    name,
    duration,
    playCount: playCount > 0 ? playCount : undefined,
    year: raw.year ? String(raw.year) : undefined,
    label: raw.label,
    language: raw.language,
    album,
    artists,
    image,
    downloadUrl,
  };
}

export interface ImportPlaylistInput {
  url?: string;
  rawText?: string;
}

export interface ImportPlaylistResult {
  platform: string;
  playlistName: string;
  songs: Song[];
  totalExtracted: number;
  matchedCount: number;
  unmatchedCount: number;
  note?: string;
}

const DERIVATIVE_MODIFIER_REGEX =
  /\b(lofi|lo-fi|slowed|reverb|remix|mashup|karaoke|ringtone|8d|dj\s*mix|cover|instrumental|sped\s*up|unplugged|reprise)\b/i;

function stripTitleModifiers(title: string): string {
  return title
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+[-–—]\s+.*$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Ranks search results so globally famous original hits matching the query rank #1
 * above low-play remixes, lofi edits, mashups, or partial covers.
 */
export function rankSongsByFameAndRelevance(songs: Song[], query: string): Song[] {
  if (!Array.isArray(songs) || songs.length <= 1) return songs || [];
  const cleanQuery = sanitizeSearchQuery(query).toLowerCase();
  if (!cleanQuery) {
    return [...songs].sort((a, b) => (Number(b.playCount) || 0) - (Number(a.playCount) || 0));
  }

  const qTokens = cleanQuery.split(/\s+/).filter(Boolean);
  const queryRequestedDerivative = DERIVATIVE_MODIFIER_REGEX.test(cleanQuery);

  const scored = songs.map((song, idx) => {
    const rawTitle = cleanHtmlEntities(song.name || '').toLowerCase();
    const baseTitle = stripTitleModifiers(rawTitle);
    const artistsStr = (song.artists?.primary || []).map((a) => cleanHtmlEntities(a.name).toLowerCase()).join(' ');
    const albumStr = cleanHtmlEntities(song.album?.name || '').toLowerCase();
    const combinedText = `${rawTitle} ${artistsStr} ${albumStr}`;

    let score = 0;

    // 1. Title & Artist relevance matching
    if (baseTitle === cleanQuery || rawTitle === cleanQuery) {
      score += 80;
    } else if (baseTitle.startsWith(cleanQuery) || rawTitle.startsWith(cleanQuery)) {
      score += 52;
    } else if (rawTitle.includes(cleanQuery)) {
      score += 34;
    }

    if (qTokens.length > 0) {
      let matchedTokens = 0;
      for (const tok of qTokens) {
        if (combinedText.includes(tok)) matchedTokens++;
      }
      const coverage = matchedTokens / qTokens.length;
      score += coverage * 40;
      if (matchedTokens === qTokens.length) score += 20;
    }

    if (artistsStr && artistsStr.includes(cleanQuery)) {
      score += 26;
    }

    // 2. Global fame / popularity weighting using logarithmic playCount scale
    const plays = Math.max(0, Number(song.playCount) || 0);
    if (plays > 0) {
      score += Math.log10(Math.max(10, plays)) * 16;
    }

    // 3. Penalize unrequested lofi / slowed / remix / mashup / karaoke derivatives,
    // or boost them when the user explicitly searched for that style.
    const songHasDerivative = DERIVATIVE_MODIFIER_REGEX.test(`${rawTitle} ${albumStr}`);
    if (!queryRequestedDerivative && songHasDerivative) {
      score -= 48;
    } else if (queryRequestedDerivative && songHasDerivative) {
      score += 65;
    }

    // 4. Prefer tracks with playable stream URLs
    if (!song.downloadUrl || song.downloadUrl.length === 0) {
      score -= 25;
    }

    return { song, score, plays, idx };
  });

  scored.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 0.01) return b.score - a.score;
    if (b.plays !== a.plays) return b.plays - a.plays;
    return a.idx - b.idx;
  });

  return scored.map((item) => item.song);
}

let measuredSlowNetwork = false;

function isConstrainedNetwork(): boolean {
  if (measuredSlowNetwork) return true;
  if (typeof navigator === 'undefined') return false;
  const conn = (navigator as unknown as {
    connection?: { effectiveType?: string; saveData?: boolean; downlink?: number };
  }).connection;
  if (!conn) return false;
  if (conn.saveData) return true;
  if (conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g' || conn.effectiveType === '3g') {
    return true;
  }
  if (typeof conn.downlink === 'number' && conn.downlink > 0 && conn.downlink < 1.35) {
    return true;
  }
  return false;
}

class JioSaavnMusicService {
  private inMemoryCache = new Map<string, { data: any; expiry: number }>();

  private getCachedInMemory<T>(key: string): T | null {
    const entry = this.inMemoryCache.get(key);
    if (entry && entry.expiry > Date.now()) {
      return entry.data as T;
    }
    return null;
  }

  private setCachedInMemory<T>(key: string, data: T, ttlMs: number = 1000 * 60 * 30): void {
    this.inMemoryCache.set(key, { data, expiry: Date.now() + ttlMs });
  }

  private warmSongDetailsCache(songs: Song[]): void {
    for (const song of songs) {
      if (song?.id && song.downloadUrl && song.downloadUrl.length > 0) {
        this.setCachedInMemory(`song_details_${song.id}`, song, 1000 * 60 * 60);
      }
    }
  }

  private async fetchWithTimeout(url: string, timeoutMs: number, externalSignal?: AbortSignal): Promise<Response> {
    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }
    const startedAt = Date.now();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      const elapsed = Date.now() - startedAt;
      if (elapsed > 2200) {
        measuredSlowNetwork = true;
      } else if (elapsed < 900) {
        measuredSlowNetwork = false;
      }
      return res;
    } catch (err) {
      const elapsed = Date.now() - startedAt;
      if (elapsed > 2500 && !externalSignal?.aborted) {
        measuredSlowNetwork = true;
      }
      throw err;
    } finally {
      clearTimeout(timer);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  /**
   * Instant cache-first + abortable song search ranked by global popularity, relevance, and album diversity
   */
  async searchSongs(query: string, limit: number = 15, externalSignal?: AbortSignal): Promise<Song[]> {
    const sanitized = sanitizeSearchQuery(query);
    if (!sanitized) return [];

    const safeLimit = Math.min(Math.max(1, limit), 30);
    const encoded = encodeURIComponent(sanitized);
    const cacheKey = `search_songs_v3_${sanitized.toLowerCase()}_${safeLimit}`;

    // 1. Instant in-memory hit (<1ms)
    const mem = this.getCachedInMemory<Song[]>(cacheKey);
    if (mem && mem.length > 0) return mem;

    // 2. Instant IndexedDB cache hit (<5ms) with background refresh if online
    const idbCached = await localDB.getCachedApi<Song[]>(cacheKey, 1000 * 60 * 60 * 24 * 7);
    if (idbCached && idbCached.length > 0) {
      const rankedCached = this.diversifyForQuery(rankSongsByFameAndRelevance(idbCached, sanitized), sanitized);
      this.setCachedInMemory(cacheKey, rankedCached);
      this.warmSongDetailsCache(rankedCached);
      if (typeof navigator === 'undefined' || navigator.onLine) {
        this.fetchRemoteSearch(encoded, sanitized, safeLimit, cacheKey).catch(() => {});
      }
      return rankedCached;
    }

    // 3. Offline fast path: search local IndexedDB + seed tracks with zero network wait
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return this.searchLocalFallback(sanitized, safeLimit);
    }

    // 4. Online fetch with fast timeout and abort propagation
    const remoteSongs = await this.fetchRemoteSearch(encoded, sanitized, safeLimit, cacheKey, externalSignal);
    if (remoteSongs.length > 0) return remoteSongs;

    // 5. Fallback to local IndexedDB cached songs + seeds if network failed/timed out
    return this.searchLocalFallback(sanitized, safeLimit);
  }

  private diversifyForQuery(rankedSongs: Song[], rawQuery: string, forceMaxPerAlbum?: number): Song[] {
    if (forceMaxPerAlbum) {
      return diversifySongs(rankedSongs, { maxPerAlbum: forceMaxPerAlbum });
    }
    const cleanQ = sanitizeSearchQuery(rawQuery).toLowerCase();
    const isAlbumLookup =
      cleanQ.length >= 4 &&
      rankedSongs.slice(0, 5).some((s) => {
        const alb = cleanHtmlEntities(s.album?.name || '').toLowerCase();
        return alb && alb !== 'single' && alb.includes(cleanQ) && !cleanHtmlEntities(s.name).toLowerCase().includes(cleanQ);
      });

    return diversifySongs(rankedSongs, { maxPerAlbum: isAlbumLookup ? 3 : 1 });
  }

  private async fetchRemoteSearch(
    encoded: string,
    rawQuery: string,
    safeLimit: number,
    cacheKey: string,
    externalSignal?: AbortSignal,
    forceMaxPerAlbum?: number
  ): Promise<Song[]> {
    const slowNetwork = isConstrainedNetwork();
    const fetchLimit = Math.max(safeLimit * 2, 30);
    const primaryTimeout = slowNetwork ? 12000 : 5500;
    const secondaryTimeout = slowNetwork ? 9500 : 4500;

    // Primary endpoint with page=1 and deep pool so globally famous originals aren't missed
    try {
      const url = `${API_BASE}/api/search/songs?query=${encoded}&page=1&limit=${fetchLimit}`;
      const res = await this.fetchWithTimeout(url, primaryTimeout, externalSignal);
      if (res.ok) {
        const json = await res.json();
        const rawSongs = this.extractRawSongs(json);
        if (rawSongs.length > 0) {
          const normalized = this.deduplicateSongs(rawSongs.map(normalizeSong));
          const ranked = this.diversifyForQuery(
            rankSongsByFameAndRelevance(normalized, rawQuery),
            rawQuery,
            forceMaxPerAlbum
          ).slice(0, safeLimit);
          this.setCachedInMemory(cacheKey, ranked);
          this.warmSongDetailsCache(ranked);
          localDB.setCachedApi(cacheKey, ranked);
          return ranked;
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' && externalSignal?.aborted) {
        throw err;
      }
    }

    if (externalSignal?.aborted) return [];

    // Secondary fallback without pagination parameters
    try {
      const url = `${API_BASE}/api/search/songs?query=${encoded}`;
      const res = await this.fetchWithTimeout(url, secondaryTimeout, externalSignal);
      if (res.ok) {
        const json = await res.json();
        const rawSongs = this.extractRawSongs(json);
        if (rawSongs.length > 0) {
          const normalized = this.deduplicateSongs(rawSongs.map(normalizeSong));
          const ranked = this.diversifyForQuery(
            rankSongsByFameAndRelevance(normalized, rawQuery),
            rawQuery,
            forceMaxPerAlbum
          ).slice(0, safeLimit);
          this.setCachedInMemory(cacheKey, ranked);
          this.warmSongDetailsCache(ranked);
          localDB.setCachedApi(cacheKey, ranked);
          return ranked;
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' && externalSignal?.aborted) {
        throw err;
      }
    }

    return [];
  }

  /**
   * Universal Playlist Importer supporting >100 songs (up to 450) from links or pasted lists
   */
  async importPlaylistFromLink(
    input: ImportPlaylistInput,
    onProgress?: (completed: number, total: number, matched: number) => void
  ): Promise<ImportPlaylistResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    let data: {
      platform?: string;
      playlistName?: string;
      tracks?: Array<{ title: string; artist: string }>;
      preResolvedSongs?: unknown[];
      note?: string;
      error?: string;
    };

    try {
      const res = await fetch('/api/import-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Could not read tracks from that playlist link.');
      }
    } finally {
      clearTimeout(timer);
    }

    const platform = data.platform || 'External';
    const playlistName = cleanHtmlEntities(data.playlistName || 'Imported Playlist') || 'Imported Playlist';

    if (Array.isArray(data.preResolvedSongs) && data.preResolvedSongs.length > 0) {
      const resolved = this.deduplicateSongs(data.preResolvedSongs.map(normalizeSong)).slice(0, 450);
      onProgress?.(resolved.length, resolved.length, resolved.length);
      return {
        platform,
        playlistName,
        songs: resolved,
        totalExtracted: resolved.length,
        matchedCount: resolved.length,
        unmatchedCount: 0,
        note: data.note,
      };
    }

    const rawTracks = Array.isArray(data.tracks) ? data.tracks.slice(0, 450) : [];
    if (rawTracks.length === 0) {
      throw new Error('No songs found in that playlist.');
    }

    const total = rawTracks.length;
    const orderedResults: Array<Song | null> = new Array(total).fill(null);
    let completed = 0;
    let matchedCount = 0;
    let cursor = 0;
    const workerCount = Math.min(8, total);

    const resolveSingleTrack = async (track: { title: string; artist: string }): Promise<Song | null> => {
      const cleanTitle = cleanHtmlEntities(track.title || '').trim();
      const cleanArtist = cleanHtmlEntities(track.artist || '').trim();
      if (!cleanTitle) return null;

      const combinedQuery = cleanArtist ? `${cleanTitle} ${cleanArtist}` : cleanTitle;
      try {
        let candidates = await this.searchSongs(combinedQuery, 8);
        if (candidates.length === 0 && cleanArtist) {
          candidates = await this.searchSongs(cleanTitle, 8);
        }
        return candidates[0] || null;
      } catch {
        return null;
      }
    };

    const runWorker = async () => {
      while (cursor < total) {
        const idx = cursor++;
        const match = await resolveSingleTrack(rawTracks[idx]);
        orderedResults[idx] = match;
        completed++;
        if (match) matchedCount++;
        onProgress?.(completed, total, matchedCount);
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

    const dedupedSongs = this.deduplicateSongs(
      orderedResults.filter((s): s is Song => Boolean(s && s.id))
    ).slice(0, 450);

    return {
      platform,
      playlistName,
      songs: dedupedSongs,
      totalExtracted: total,
      matchedCount: dedupedSongs.length,
      unmatchedCount: Math.max(0, total - dedupedSongs.length),
      note: data.note,
    };
  }

  private async searchLocalFallback(sanitized: string, safeLimit: number): Promise<Song[]> {
    const idbMatches = await localDB.searchCachedSongs(sanitized, safeLimit);
    if (idbMatches.length > 0) return idbMatches;

    return SEED_FALLBACK_TRACKS.filter(
      (s) =>
        s.name.toLowerCase().includes(sanitized.toLowerCase()) ||
        s.artists?.primary?.some((a) => a.name.toLowerCase().includes(sanitized.toLowerCase()))
    );
  }

  private extractRawSongs(json: any): any[] {
    if (!json) return [];
    if (Array.isArray(json)) return json;
    if (Array.isArray(json.data?.results)) return json.data.results;
    if (Array.isArray(json.data)) return json.data;
    if (Array.isArray(json.data?.songs)) return json.data.songs;
    if (Array.isArray(json.data?.songs?.results)) return json.data.songs.results;
    if (Array.isArray(json.results)) return json.results;
    return [];
  }

  async getSongDetails(songId: string, forceRefresh: boolean = false): Promise<Song | null> {
    if (!songId) return null;
    const cacheKey = `song_details_${songId}`;

    if (!forceRefresh) {
      const mem = this.getCachedInMemory<Song>(cacheKey);
      if (mem) return mem;

      const idb = await localDB.getCachedApi<Song>(cacheKey, 1000 * 60 * 60 * 48);
      if (idb) {
        this.setCachedInMemory(cacheKey, idb);
        return idb;
      }
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return null;
    }

    try {
      const url = `${API_BASE}/api/songs/${songId}`;
      const res = await this.fetchWithTimeout(url, 3200);
      if (res.ok) {
        const json = await res.json();
        const rawSong = json?.data?.[0] || json?.data || null;
        if (rawSong) {
          const song = normalizeSong(rawSong);
          this.setCachedInMemory(cacheKey, song);
          await localDB.setCachedApi(cacheKey, song);
          return song;
        }
      }
    } catch (err) {
      console.warn(`[Tunely API] Failed to get song ${songId}:`, err);
    }

    return null;
  }

  /**
   * Stale-while-revalidate curated Home discovery feed with strict per-album and cross-section uniqueness
   */
  async getCuratedFeed(onBackgroundRefresh?: (sections: FeedSection[]) => void): Promise<FeedSection[]> {
    const cacheKey = 'tunely_curated_feed_v4';
    const mem = this.getCachedInMemory<FeedSection[]>(cacheKey);
    if (mem) return mem;

    const idb = await localDB.getCachedApi<FeedSection[]>(cacheKey, 1000 * 60 * 60 * 24 * 7);
    if (idb && idb.length > 0) {
      this.setCachedInMemory(cacheKey, idb);
      for (const sec of idb) this.warmSongDetailsCache(sec.songs || []);
      if (typeof navigator === 'undefined' || navigator.onLine) {
        this.refreshFeedBackground(cacheKey)
          .then((fresh) => {
            if (fresh && fresh.length > 0 && onBackgroundRefresh) {
              onBackgroundRefresh(fresh);
            }
          })
          .catch(() => {});
      }
      return idb;
    }

    return this.refreshFeedBackground(cacheKey);
  }

  private async refreshFeedBackground(cacheKey: string): Promise<FeedSection[]> {
    const categories = [
      { id: 'trending', title: 'Trending Hits', subtitle: 'Most played viral tracks right now', query: 'Hindi Hits' },
      { id: 'global', title: 'Global Hot 50', subtitle: 'International chart toppers', query: 'English Pop Hits' },
      { id: 'romance', title: 'Bollywood Romance', subtitle: 'Soulful melodies & timeless love songs', query: 'Arijit Singh Love Songs' },
      { id: 'indie', title: 'Fresh Indie & Chill', subtitle: 'Acoustic, lo-fi and indie pop gems', query: 'Indie' },
      { id: 'party', title: 'High Energy & Dance', subtitle: 'Upbeat rhythm to boost your tempo', query: 'Punjabi Hits' },
      { id: 'classics', title: 'All-Time Classics', subtitle: 'Evergreen favorites everyone knows', query: 'Best of Bollywood' },
    ];

    try {
      const slowNetwork = isConstrainedNetwork();
      const targetLimit = 30;
      const chunkSize = slowNetwork ? 2 : 3;
      const settled: PromiseSettledResult<FeedSection>[] = [];

      for (let i = 0; i < categories.length; i += chunkSize) {
        const chunk = categories.slice(i, i + chunkSize);
        const batch = await Promise.allSettled(
          chunk.map(async (cat): Promise<FeedSection> => {
            const songs = await this.fetchRemoteSearch(
              encodeURIComponent(cat.query),
              cat.query,
              targetLimit,
              `search_songs_v3_${cat.query.toLowerCase()}_${targetLimit}`,
              undefined,
              1
            );
            return {
              id: cat.id,
              title: cat.title,
              subtitle: cat.subtitle,
              songs,
            };
          })
        );
        settled.push(...batch);
      }

      // Filter across sections so each section shows distinct songs and max 1 track per album
      const globalSeenSongKeys = new Set<string>();
      const validSections = settled
        .filter((r): r is PromiseFulfilledResult<FeedSection> => r.status === 'fulfilled' && r.value.songs.length > 0)
        .map((r) => ({
          ...r.value,
          songs: diversifySongs(r.value.songs, {
            maxPerAlbum: 1,
            excludeKeys: globalSeenSongKeys,
          }).slice(0, 20),
        }))
        .filter((sec) => sec.songs.length > 0);

      if (validSections.length > 0) {
        this.setCachedInMemory(cacheKey, validSections);
        await localDB.setCachedApi(cacheKey, validSections);
        return validSections;
      }
    } catch (err) {
      console.warn('[Tunely API] Failed to refresh feed, using seeds:', err);
    }

    return [
      {
        id: 'seed-featured',
        title: 'Featured Music',
        subtitle: 'Ready to stream anytime',
        songs: SEED_FALLBACK_TRACKS,
      },
    ];
  }

  async downloadSongAudioBlob(streamUrl: string, onProgress?: (percent: number) => void): Promise<Blob> {
    const res = await fetch(streamUrl);
    if (!res.ok) throw new Error(`Download failed with status: ${res.status}`);

    const contentLength = Number(res.headers.get('content-length') || '0');
    if (!contentLength || !res.body) {
      return await res.blob();
    }

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        receivedBytes += value.length;
        if (onProgress && contentLength > 0) {
          onProgress(Math.min(100, Math.round((receivedBytes / contentLength) * 100)));
        }
      }
    }

    return new Blob(chunks as BlobPart[], { type: 'audio/mp4' });
  }

  async getSongLyrics(song: Song, externalSignal?: AbortSignal): Promise<LyricsPayload> {
    if (!song?.id) {
      return { syncedLyrics: [], plainLyrics: null, source: 'none' };
    }
    const cacheKey = `song_lyrics_v1_${song.id}`;
    const mem = this.getCachedInMemory<LyricsPayload>(cacheKey);
    if (mem) return mem;

    const idb = await localDB.getCachedApi<LyricsPayload>(cacheKey, 1000 * 60 * 60 * 24 * 14);
    if (idb && (idb.syncedLyrics.length > 0 || idb.plainLyrics)) {
      this.setCachedInMemory(cacheKey, idb, 1000 * 60 * 60);
      return idb;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { syncedLyrics: [], plainLyrics: null, source: 'offline' };
    }

    const title = cleanHtmlEntities(song.name || '');
    const artist = song.artists?.primary?.map((a) => cleanHtmlEntities(a.name)).join(', ') || '';
    const album = cleanHtmlEntities(song.album?.name || '');

    const params = new URLSearchParams({
      songId: song.id,
      title,
      artist,
      album,
      duration: String(Math.round(song.duration || 0)),
    });

    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else externalSignal.addEventListener('abort', onAbort, { once: true });
    }
    const timer = setTimeout(() => controller.abort(), 7000);

    try {
      const res = await fetch(`/api/lyrics?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) {
        return { syncedLyrics: [], plainLyrics: null, source: 'error' };
      }
      const raw = (await res.json()) as {
        syncedLyrics?: string | null;
        plainLyrics?: string | null;
        source?: string;
      };
      const payload: LyricsPayload = {
        syncedLyrics: parseLrcLyrics(raw.syncedLyrics),
        plainLyrics: raw.plainLyrics ? cleanHtmlEntities(raw.plainLyrics) : null,
        source: raw.source || 'lrclib',
      };
      if (payload.syncedLyrics.length > 0 || payload.plainLyrics) {
        this.setCachedInMemory(cacheKey, payload, 1000 * 60 * 60 * 4);
        await localDB.setCachedApi(cacheKey, payload);
      }
      return payload;
    } catch (err: any) {
      if (err?.name === 'AbortError' && externalSignal?.aborted) throw err;
      return { syncedLyrics: [], plainLyrics: null, source: 'error' };
    } finally {
      clearTimeout(timer);
      if (externalSignal) externalSignal.removeEventListener('abort', onAbort);
    }
  }

  private deduplicateSongs(songs: Song[]): Song[] {
    const seen = new Set<string>();
    return songs.filter((s) => {
      if (!s || !s.id || seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
  }
}

export const musicAPI = new JioSaavnMusicService();
