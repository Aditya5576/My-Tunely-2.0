import { FeedSection, LyricsPayload, Song } from '../types/music';
import { localDB } from './db';
import { parseRawTrackList, resolveTextPlaylistTrack, type TextPlaylistTrack } from '../utils/playlistText';
import {
  cleanHtmlEntities,
  diversifySongs,
  parseLrcLyrics,
  normalizeSearchText,
  stripTitleDecorations,
  getTrackQualityScore,
  deduplicateNearIdenticalSongs,
} from '../utils/audioCore';

export {
  normalizeSearchText,
  stripTitleDecorations,
  getTrackQualityScore,
  deduplicateNearIdenticalSongs,
};

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

function cleanLyricsSearchTitle(title: string): string {
  return cleanHtmlEntities(title)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+[-–—]\s+(from|hindi|punjabi|tamil|telugu|remix|version).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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

export const DERIVATIVE_MODIFIER_REGEX =
  /\b(lofi|lo-fi|lofi\s*flip|slowed|reverb|remix|mashup|karaoke|ringtone|ring\s*tone|8d|8d\s*audio|dj\s*mix|cover|cover\s*version|instrumental|sped\s*up|speed\s*up|unplugged|reprise|bass\s*boosted)\b/i;

export function stripTitleModifiers(title: string): string {
  return stripTitleDecorations(title);
}

export function getBigrams(str: string): Set<string> {
  const s = (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const bigrams = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) {
    bigrams.add(s.slice(i, i + 2));
  }
  return bigrams;
}

export function diceCoefficient(a: string, b: string): number {
  const sA = (a || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const sB = (b || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (sA === sB) return 1.0;
  if (sA.length < 2 || sB.length < 2) return 0;
  const bgA = getBigrams(sA);
  const bgB = getBigrams(sB);
  let intersection = 0;
  for (const bg of bgA) {
    if (bgB.has(bg)) intersection++;
  }
  const total = bgA.size + bgB.size;
  return total > 0 ? (2 * intersection) / total : 0;
}

const COMMON_TYPOS: Record<string, string> = {
  arjit: 'arijit',
  arjith: 'arijit',
  arijith: 'arijit',
  atif: 'atif aslam',
  shreya: 'shreya ghoshal',
  diljit: 'diljit dosanjh',
  chann: 'channa',
  kabir: 'kabir singh',
  kesaria: 'kesariya',
  kesri: 'kesari',
  apnabanale: 'apna bana le',
  sitare: 'sitaare',
  sitaron: 'sitaare',
  tumhiho: 'tum hi ho',
  tumhi: 'tum hi',
  shayd: 'shayad',
  leja: 'leja re',
  kalank: 'kalank',
  lutt: 'lutt putt',
  jawan: 'jawan',
  pathan: 'pathaan',
};

const COMMON_ARTISTS = [
  'arijit singh',
  'arjit singh',
  'neha kakkar',
  'shreya ghoshal',
  'atif aslam',
  'diljit dosanjh',
  'pritam',
  'badshah',
  'yo yo honey singh',
  'jubin nautiyal',
  'armaan malik',
  'darshan raval',
  'sidhu moose wala',
  'kk',
  'sunidhi chauhan',
  'sachin-jigar',
  'anirudh ravichander',
  'vishal-shekhar',
];

export function generateSearchQueryVariants(rawQuery: string): string[] {
  const clean = sanitizeSearchQuery(rawQuery).toLowerCase().trim();
  if (!clean || clean.length < 3) return [];

  const variants = new Set<string>();

  // 1. Known word/typo replacements
  let replaced = clean;
  for (const [typo, fix] of Object.entries(COMMON_TYPOS)) {
    const reg = new RegExp(`\\b${typo}\\b`, 'gi');
    if (reg.test(replaced)) {
      replaced = replaced.replace(reg, fix).trim();
    }
  }
  replaced = replaced.replace(/\bmere\s+ya\b/gi, 'mereya');
  if (replaced !== clean) {
    variants.add(replaced);
  }

  // 2. Extract non-artist title portion if an artist name is embedded
  for (const artist of COMMON_ARTISTS) {
    if (clean.includes(artist)) {
      const stripped = clean.replace(artist, '').replace(/\s+/g, ' ').trim();
      if (stripped.length >= 3) {
        variants.add(stripped);
        let strippedFixed = stripped;
        for (const [typo, fix] of Object.entries(COMMON_TYPOS)) {
          strippedFixed = strippedFixed.replace(new RegExp(`\\b${typo}\\b`, 'gi'), fix);
        }
        strippedFixed = strippedFixed.replace(/\bmere\s+ya\b/gi, 'mereya').trim();
        if (strippedFixed !== stripped && strippedFixed.length >= 3) {
          variants.add(strippedFixed);
        }
      }
    }
  }

  return Array.from(variants).filter((v) => v !== clean);
}

/**
 * Ranks search results so globally famous original hits matching the query rank #1
 * above low-play remixes, lofi edits, mashups, karaoke, or partial covers.
 */
export function rankSongsByFameAndRelevance(songs: Song[], query: string): Song[] {
  if (!Array.isArray(songs) || songs.length <= 1) return songs || [];
  const cleanQuery = sanitizeSearchQuery(query).toLowerCase();
  if (!cleanQuery) {
    return [...songs].sort((a, b) => (Number(b.playCount) || 0) - (Number(a.playCount) || 0));
  }

  const qTokens = cleanQuery.split(/\s+/).filter(Boolean);
  const compactQuery = cleanQuery.replace(/[^a-z0-9]/g, '');
  const queryRequestedDerivative = DERIVATIVE_MODIFIER_REGEX.test(cleanQuery);
  const queryDerivativeMatches = cleanQuery.match(DERIVATIVE_MODIFIER_REGEX) || [];

  const scored = songs.map((song, idx) => {
    const rawTitle = cleanHtmlEntities(song.name || '').toLowerCase();
    const baseTitle = stripTitleModifiers(rawTitle);
    const compactTitle = baseTitle.replace(/[^a-z0-9]/g, '');
    const artists = (song.artists?.primary || []).map((a) => cleanHtmlEntities(a.name).toLowerCase());
    const artistsStr = artists.join(' ');
    const albumStr = cleanHtmlEntities(song.album?.name || '').toLowerCase();
    const baseAlbum = stripTitleModifiers(albumStr);
    const compactAlbum = baseAlbum.replace(/[^a-z0-9]/g, '');
    const derivativeText = `${rawTitle} ${albumStr} ${artistsStr}`;

    let score = 0;

    // --- TIER 1: EXACT MATCHES ---
    if (baseTitle === cleanQuery || rawTitle === cleanQuery || (compactTitle && compactTitle === compactQuery)) {
      score += 320;
    } else if (baseAlbum === cleanQuery || albumStr === cleanQuery || (compactAlbum && compactAlbum === compactQuery)) {
      score += 260;
    } else if (artistsStr === cleanQuery || artists.includes(cleanQuery)) {
      score += 230;
    }

    // --- TIER 2: PREFIX & WORD BOUNDARY MATCHES ---
    if (baseTitle.startsWith(cleanQuery) || rawTitle.startsWith(cleanQuery)) {
      score += 210;
    } else if (baseTitle.split(/\s+/).some((w) => w.startsWith(cleanQuery))) {
      score += 170;
    } else if (baseAlbum.startsWith(cleanQuery) || albumStr.startsWith(cleanQuery)) {
      score += 160;
    } else if (artistsStr.startsWith(cleanQuery) || artists.some((a) => a.startsWith(cleanQuery))) {
      score += 140;
    } else if (rawTitle.includes(cleanQuery)) {
      score += 70;
    }

    // --- TIER 3: MULTI-WORD COVERAGE & FUZZY MATCHES ---
    let titleMatches = 0;
    let artistMatches = 0;
    let albumMatches = 0;
    let anyMatches = 0;

    for (let i = 0; i < qTokens.length; i++) {
      const tok = qTokens[i];
      let tokMatched = false;

      // Check title match
      if (rawTitle.includes(tok) || diceCoefficient(rawTitle, tok) >= 0.65) {
        titleMatches++;
        tokMatched = true;
      }
      // Check adjacent syllable concatenation (e.g. 'mere' + 'ya' -> 'mereya')
      if (!tokMatched && i + 1 < qTokens.length) {
        const joined = tok + qTokens[i + 1];
        if (rawTitle.includes(joined) || diceCoefficient(rawTitle, joined) >= 0.65) {
          titleMatches += 2;
          tokMatched = true;
        }
      }

      // Check artist match
      if (artistsStr.includes(tok) || artists.some((a) => diceCoefficient(a, tok) >= 0.65)) {
        artistMatches++;
        tokMatched = true;
      }

      // Check album match
      if (albumStr.includes(tok) || diceCoefficient(albumStr, tok) >= 0.65) {
        albumMatches++;
        tokMatched = true;
      }

      if (tokMatched) {
        anyMatches++;
      }
    }

    const coverage = qTokens.length > 0 ? Math.min(1.0, anyMatches / qTokens.length) : 0;
    if (coverage >= 0.99) {
      score += 240;
    } else if (coverage >= 0.75) {
      score += 170;
    } else if (coverage >= 0.5) {
      score += 90;
    } else if (coverage > 0) {
      score += Math.round(coverage * 80);
    }

    // Multi-field synergy bonus
    if (titleMatches > 0 && artistMatches > 0) score += 45;
    if (titleMatches > 0 && albumMatches > 0) score += 35;

    // --- STRUCTURED COLLABORATION INTENT BONUS (Artist + Title or Movie + Title) ---
    const titleTokenList = baseTitle.split(/\s+/).filter((t) => t.length >= 2);
    const artistTokenList = artistsStr.split(/\s+/).filter((t) => t.length >= 2);
    const albumTokenList = baseAlbum.split(/\s+/).filter((t) => t.length >= 2 && t !== 'single');

    const titleTokensInQuery = titleTokenList.filter((t) => cleanQuery.includes(t) || qTokens.some((q) => diceCoefficient(t, q) >= 0.7));
    const artistTokensInQuery = artistTokenList.filter((t) => cleanQuery.includes(t) || qTokens.some((q) => diceCoefficient(t, q) >= 0.7));
    const albumTokensInQuery = albumTokenList.filter((t) => cleanQuery.includes(t) || qTokens.some((q) => diceCoefficient(t, q) >= 0.7));

    const titleRatio = titleTokenList.length > 0 ? titleTokensInQuery.length / titleTokenList.length : 0;
    const artistRatio = artistTokenList.length > 0 ? artistTokensInQuery.length / artistTokenList.length : 0;
    const albumRatio = albumTokenList.length > 0 ? albumTokensInQuery.length / albumTokenList.length : 0;

    if (titleTokensInQuery.length > 0 && artistTokensInQuery.length > 0) {
      if (titleRatio >= 0.5 && artistRatio >= 0.5) {
        score += 280; // Full collaboration match (e.g. "Arijit Singh Tum Hi Ho", "Pritam Shayad")
      } else {
        score += 130;
      }
    } else if (titleTokensInQuery.length > 0 && albumTokensInQuery.length > 0) {
      if (titleRatio >= 0.5 && albumRatio >= 0.5) {
        score += 260; // Movie + Title match (e.g. "Brahmastra Kesariya", "Ae Dil Hai Mushkil Channa")
      } else {
        score += 110;
      }
    }

    // --- TIER 4: GLOBAL POPULARITY (Capped Tie-breaker) ---
    const plays = Math.max(0, Number(song.playCount) || 0);
    if (plays > 0) {
      score += Math.min(25, Math.log10(Math.max(10, plays)) * 3);
    }

    // --- TIER 5: DERIVATIVE PENALTY / BOOST ---
    const songHasDerivative = DERIVATIVE_MODIFIER_REGEX.test(`${rawTitle} ${albumStr}`);
    if (!queryRequestedDerivative && songHasDerivative) {
      score -= 150; // Calibrated demotion so original studio tracks outrank remixes/lofi/karaoke/covers
    } else if (queryRequestedDerivative && songHasDerivative) {
      score += 160; // Explicit user request for derivative (e.g. "Kesariya Lofi", "Slowed")
      const specificMatch = queryDerivativeMatches.some((kw) => derivativeText.includes(kw.toLowerCase()));
      if (specificMatch) {
        score += 50;
      }
    }

    // Playable audio stream URL
    if (!song.downloadUrl || song.downloadUrl.length === 0) {
      score -= 30;
    } else if (song.downloadUrl.some((d) => d.quality === '320kbps' && Boolean(d.url))) {
      score += 15;
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
      cleanQ.length >= 3 &&
      rankedSongs.slice(0, 5).some((s) => {
        const alb = cleanHtmlEntities(s.album?.name || '').toLowerCase();
        return (
          alb &&
          alb !== 'single' &&
          (alb.includes(cleanQ) || cleanQ.includes(alb) || diceCoefficient(alb, cleanQ) >= 0.65)
        );
      });

    return diversifySongs(rankedSongs, { maxPerAlbum: isAlbumLookup ? 4 : 1 });
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
    const candidateSongs: Song[] = [];

    // Parallel fetch: songs AND albums
    const songPromise = this.fetchWithTimeout(
      `${API_BASE}/api/search/songs?query=${encoded}&page=1&limit=${fetchLimit}`,
      primaryTimeout,
      externalSignal
    )
      .then(async (res) => {
        if (res.ok) {
          const json = await res.json();
          return this.extractRawSongs(json);
        }
        return [];
      })
      .catch(() => []);

    const albumPromise = this.fetchWithTimeout(
      `${API_BASE}/api/search/albums?query=${encoded}&limit=5`,
      primaryTimeout,
      externalSignal
    )
      .then(async (res) => {
        if (res.ok) {
          const json = await res.json();
          const rawAlbums = json?.data?.results || json?.data || [];
          return Array.isArray(rawAlbums) ? rawAlbums : [];
        }
        return [];
      })
      .catch(() => []);

    const [rawSongs, rawAlbums] = await Promise.all([songPromise, albumPromise]);

    if (rawSongs.length > 0) {
      candidateSongs.push(...rawSongs.map(normalizeSong));
    }

    // If an album closely matches the query, fetch its tracklist
    if (rawAlbums.length > 0) {
      const cleanQ = sanitizeSearchQuery(rawQuery).toLowerCase();
      const topAlbum =
        rawAlbums.find((alb: any) => {
          const albName = cleanHtmlEntities(alb?.name || '').toLowerCase();
          return (
            albName === cleanQ ||
            albName.startsWith(cleanQ) ||
            albName.includes(cleanQ) ||
            cleanQ.includes(albName) ||
            diceCoefficient(albName, cleanQ) >= 0.65
          );
        }) || rawAlbums[0];

      if (topAlbum?.id) {
        try {
          const albumRes = await this.fetchWithTimeout(
            `${API_BASE}/api/albums?id=${topAlbum.id}`,
            4000,
            externalSignal
          );
          if (albumRes.ok) {
            const albumJson = await albumRes.json();
            const albumTracks = this.extractRawSongs(albumJson);
            if (Array.isArray(albumTracks) && albumTracks.length > 0) {
              candidateSongs.push(...albumTracks.map(normalizeSong));
            }
          }
        } catch {}
      }
    }

    // If candidateSongs is empty, try query variants (typo corrections, artist separation)
    if (candidateSongs.length === 0) {
      const variants = generateSearchQueryVariants(rawQuery);
      for (const variant of variants) {
        if (externalSignal?.aborted) break;
        try {
          const varRes = await this.fetchWithTimeout(
            `${API_BASE}/api/search/songs?query=${encodeURIComponent(variant)}&limit=${fetchLimit}`,
            secondaryTimeout,
            externalSignal
          );
          if (varRes.ok) {
            const varJson = await varRes.json();
            const varSongs = this.extractRawSongs(varJson);
            if (varSongs.length > 0) {
              candidateSongs.push(...varSongs.map(normalizeSong));
              break;
            }
          }
        } catch {}
      }
    }

    // Secondary fallback without pagination parameters if still empty
    if (candidateSongs.length === 0 && !externalSignal?.aborted) {
      try {
        const url = `${API_BASE}/api/search/songs?query=${encoded}`;
        const res = await this.fetchWithTimeout(url, secondaryTimeout, externalSignal);
        if (res.ok) {
          const json = await res.json();
          const raw = this.extractRawSongs(json);
          if (raw.length > 0) {
            candidateSongs.push(...raw.map(normalizeSong));
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' && externalSignal?.aborted) {
          throw err;
        }
      }
    }

    if (candidateSongs.length > 0) {
      const deduplicated = this.deduplicateSongs(candidateSongs);
      const ranked = this.diversifyForQuery(
        rankSongsByFameAndRelevance(deduplicated, rawQuery),
        rawQuery,
        forceMaxPerAlbum
      ).slice(0, safeLimit);

      this.setCachedInMemory(cacheKey, ranked);
      this.warmSongDetailsCache(ranked);
      localDB.setCachedApi(cacheKey, ranked);
      return ranked;
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
    let data: {
      platform?: string;
      playlistName?: string;
      tracks?: TextPlaylistTrack[];
      preResolvedSongs?: unknown[];
      note?: string;
      error?: string;
    } = {};

    if (input.rawText?.trim()) {
      data = { platform: 'Track List', tracks: parseRawTrackList(input.rawText) };
    } else {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      let fetchSuccess = false;
      try {
        const res = await fetch('/api/import-playlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(input),
          signal: controller.signal,
        });
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          data = await res.json();
          fetchSuccess = true;
        } else if (!res.ok && contentType.includes('application/json')) {
          const errData = await res.json();
          throw new Error(errData?.error || 'Could not read tracks from that playlist link.');
        }
      } catch (err: any) {
        if (err?.message && !err.message.includes('JSON')) {
          throw err;
        }
      } finally {
        clearTimeout(timer);
      }

      // If backend route returned HTML (SPA fallback on static hosting) or network failed
      if (!fetchSuccess) {
        const rawLink = input.url || '';
        const lower = rawLink.toLowerCase();
        if (lower.includes('jiosaavn.com') || lower.includes('saavn.com')) {
          try {
            const jsRes = await fetch(
              `${API_BASE}/api/playlists?link=${encodeURIComponent(rawLink)}&page=0&limit=100`,
              { headers: { Accept: 'application/json' } }
            );
            if (jsRes.ok) {
              const jsJson = (await jsRes.json()) as { data?: { name?: string; songs?: unknown[] } };
              const plData = jsJson?.data;
              if (plData && Array.isArray(plData.songs) && plData.songs.length > 0) {
                data = {
                  platform: 'JioSaavn',
                  playlistName: plData.name || 'JioSaavn Playlist',
                  tracks: [],
                  preResolvedSongs: plData.songs,
                };
                fetchSuccess = true;
              }
            }
          } catch {}
        }

        if (!fetchSuccess) {
          throw new Error(
            'Link scraping for Spotify, Apple Music, or YouTube requires the backend server. When using static web hosting, please paste the track list text directly into the Text Import tab.'
          );
        }
      }
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
      throw new Error(input.rawText ? 'No valid song lines found in the pasted text.' : 'No songs found in that playlist.');
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
      if (!cleanTitle && !cleanArtist) return null;

      const primaryQuery = cleanTitle && cleanArtist ? `${cleanTitle} ${cleanArtist}` : cleanTitle || cleanArtist;
      try {
        let candidates = await this.searchSongs(primaryQuery, 8);
        if (candidates.length === 0 && cleanTitle && cleanArtist) {
          candidates = await this.searchSongs(`${cleanArtist} ${cleanTitle}`, 8);
        }
        if (candidates.length === 0 && cleanTitle) {
          candidates = await this.searchSongs(cleanTitle, 8);
        }
        if (candidates.length === 0 && cleanArtist) {
          candidates = await this.searchSongs(cleanArtist, 8);
        }
        return candidates[0] || null;
      } catch {
        return null;
      }
    };

    const runWorker = async () => {
      while (cursor < total) {
        const idx = cursor++;
        const match = input.rawText
          ? await resolveTextPlaylistTrack(rawTracks[idx], (query) => this.searchSongs(query, 15))
          : await resolveSingleTrack(rawTracks[idx]);
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
    const idbMatches = await localDB.searchCachedSongs(sanitized, safeLimit * 2);
    const candidatePool = [...idbMatches];
    for (const s of SEED_FALLBACK_TRACKS) {
      if (!candidatePool.some((c) => c.id === s.id)) {
        candidatePool.push(s);
      }
    }
    const ranked = rankSongsByFameAndRelevance(candidatePool, sanitized);
    return this.diversifyForQuery(ranked, sanitized).slice(0, safeLimit);
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

    let raw: {
      syncedLyrics?: string | null;
      plainLyrics?: string | null;
      source?: string;
    } | null = null;

    try {
      const res = await fetch(`/api/lyrics?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        raw = (await res.json()) as {
          syncedLyrics?: string | null;
          plainLyrics?: string | null;
          source?: string;
        };
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' && externalSignal?.aborted) throw err;
    }

    // If backend route returned HTML (SPA fallback on static hosting) or failed, fall back to direct upstream LRCLIB & JioSaavn APIs
    if (!raw || (!raw.syncedLyrics && !raw.plainLyrics)) {
      raw = await this.fetchDirectUpstreamLyrics(song, controller.signal);
    }

    try {
      const payload: LyricsPayload = {
        syncedLyrics: parseLrcLyrics(raw?.syncedLyrics),
        plainLyrics: raw?.plainLyrics ? cleanHtmlEntities(raw.plainLyrics) : null,
        source: raw?.source || 'lrclib',
      };
      if (payload.syncedLyrics.length > 0 || payload.plainLyrics) {
        this.setCachedInMemory(cacheKey, payload, 1000 * 60 * 60 * 4);
        await localDB.setCachedApi(cacheKey, payload);
      }
      return payload;
    } finally {
      clearTimeout(timer);
      if (externalSignal) externalSignal.removeEventListener('abort', onAbort);
    }
  }

  private async fetchDirectUpstreamLyrics(
    song: Song,
    signal?: AbortSignal
  ): Promise<{ syncedLyrics?: string | null; plainLyrics?: string | null; source?: string }> {
    const rawTitle = cleanHtmlEntities(song.name || '').trim();
    const cleanTitle = cleanLyricsSearchTitle(rawTitle);
    const primaryArtist = cleanHtmlEntities(song.artists?.primary?.[0]?.name || '').split(',')[0].trim();
    const rawAlbum = cleanHtmlEntities(song.album?.name || '').trim();
    const cleanAlbum = cleanLyricsSearchTitle(rawAlbum);
    const targetDuration = Number(song.duration) || 0;

    let syncedLyrics: string | null = null;
    let plainLyrics: string | null = null;
    let source = 'lrclib';

    // 1. Direct LRCLIB exact match
    if (cleanTitle && primaryArtist) {
      try {
        const params = new URLSearchParams({
          track_name: cleanTitle,
          artist_name: primaryArtist,
        });
        if (cleanAlbum) params.set('album_name', cleanAlbum);
        if (targetDuration > 0) params.set('duration', String(Math.round(targetDuration)));

        const exactRes = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
          headers: { Accept: 'application/json' },
          signal,
        });
        if (exactRes.ok) {
          const exactJson = (await exactRes.json()) as { syncedLyrics?: string; plainLyrics?: string };
          if (exactJson?.syncedLyrics) syncedLyrics = exactJson.syncedLyrics;
          if (exactJson?.plainLyrics) plainLyrics = exactJson.plainLyrics;
        }
      } catch {}
    }

    // 2. LRCLIB search API
    if (!syncedLyrics && cleanTitle) {
      try {
        const searchTerms = primaryArtist ? `${cleanTitle} ${primaryArtist}` : cleanTitle;
        const searchRes = await fetch(
          `https://lrclib.net/api/search?q=${encodeURIComponent(searchTerms)}`,
          { headers: { Accept: 'application/json' }, signal }
        );
        if (searchRes.ok) {
          const list = (await searchRes.json()) as Array<{
            syncedLyrics?: string;
            plainLyrics?: string;
            duration?: number;
            trackName?: string;
          }>;
          if (Array.isArray(list) && list.length > 0) {
            const sorted = [...list].sort((a, b) => {
              const aSync = a.syncedLyrics ? 1 : 0;
              const bSync = b.syncedLyrics ? 1 : 0;
              if (bSync !== aSync) return bSync - aSync;
              if (targetDuration > 0) {
                const aDiff = Math.abs((a.duration || targetDuration) - targetDuration);
                const bDiff = Math.abs((b.duration || targetDuration) - targetDuration);
                return aDiff - bDiff;
              }
              return 0;
            });
            const best = sorted[0];
            if (best?.syncedLyrics) syncedLyrics = best.syncedLyrics;
            if (!plainLyrics && best?.plainLyrics) plainLyrics = best.plainLyrics;
          }
        }
      } catch {}
    }

    // 3. Fallback to direct JioSaavn lyrics API
    if (!syncedLyrics && !plainLyrics && song.id) {
      try {
        const jsRes = await fetch(`${API_BASE}/api/songs/${encodeURIComponent(song.id)}/lyrics`, {
          headers: { Accept: 'application/json' },
          signal,
        });
        if (jsRes.ok) {
          const jsJson = (await jsRes.json()) as { data?: { lyrics?: string } };
          if (jsJson?.data?.lyrics) {
            plainLyrics = cleanHtmlEntities(jsJson.data.lyrics.replace(/<br\s*\/?>/gi, '\n'));
            source = 'jiosaavn';
          }
        }
      } catch {}
    }

    return {
      syncedLyrics,
      plainLyrics,
      source: syncedLyrics || plainLyrics ? source : 'none',
    };
  }

  private deduplicateSongs(songs: Song[]): Song[] {
    return deduplicateNearIdenticalSongs(songs);
  }
}

export const musicAPI = new JioSaavnMusicService();
