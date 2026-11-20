import { AudioQuality, EqBands, ImageQuality, RepeatMode, Song, SoundProfile } from '../types/music';

export const SOUND_PROFILE_PRESETS: Record<
  SoundProfile,
  {
    bands: EqBands;
    compress: boolean;
    compressorThreshold: number;
    compressorRatio: number;
    makeupGain: number;
  }
> = {
  studio: {
    bands: { sub: 4.5, bass: 3.2, mid: 1.0, vocal: 2.4, air: 3.0 },
    compress: true,
    compressorThreshold: -2.5,
    compressorRatio: 1.35,
    makeupGain: 1.34,
  },
  bass: {
    bands: { sub: 7.5, bass: 5.2, mid: 0.4, vocal: 2.0, air: 2.6 },
    compress: true,
    compressorThreshold: -3.0,
    compressorRatio: 1.45,
    makeupGain: 1.32,
  },
  vocal: {
    bands: { sub: 2.0, bass: 2.0, mid: 0.8, vocal: 4.8, air: 3.2 },
    compress: true,
    compressorThreshold: -2.5,
    compressorRatio: 1.3,
    makeupGain: 1.32,
  },
  concert: {
    bands: { sub: 5.2, bass: 3.6, mid: 1.0, vocal: 2.6, air: 4.2 },
    compress: true,
    compressorThreshold: -3.0,
    compressorRatio: 1.4,
    makeupGain: 1.34,
  },
  night: {
    bands: { sub: 4.2, bass: 2.8, mid: 0.8, vocal: 1.4, air: 1.6 },
    compress: true,
    compressorThreshold: -8.0,
    compressorRatio: 1.8,
    makeupGain: 1.34,
  },
  flat: {
    bands: { sub: 0, bass: 0, mid: 0, vocal: 0, air: 0 },
    compress: false,
    compressorThreshold: 0,
    compressorRatio: 1,
    makeupGain: 1.0,
  },
};

export function clampEqGain(db: number): number {
  if (isNaN(db)) return 0;
  return Math.max(-8, Math.min(8, Number(db.toFixed(1))));
}

export function computeEffectiveEqBands(bands: EqBands, bassBoostPercent: number): EqBands {
  const boost = Math.max(0, Math.min(100, bassBoostPercent || 0)) / 100;
  return {
    sub: Math.min(10, clampEqGain(bands.sub) + boost * 4.5),
    bass: Math.min(9, clampEqGain(bands.bass) + boost * 2.5),
    mid: clampEqGain(bands.mid) - boost * 0.4,
    vocal: clampEqGain(bands.vocal),
    air: clampEqGain(bands.air),
  };
}

/**
 * Compute negative pre-gain headroom attenuation (in linear scale) based on effective EQ boosts
 * and makeup gain to guarantee the cumulative signal through EQ, compressor, and soft-limiter
 * stays strictly within 0 dBFS without hard-clipping or flatline scattering on headsets.
 */
export function computeHeadroomAttenuation(effectiveBands: EqBands, makeupGain: number = 1.0): number {
  const maxBoostDb = Math.max(
    0,
    effectiveBands.sub,
    effectiveBands.bass,
    effectiveBands.mid,
    effectiveBands.vocal,
    effectiveBands.air
  );
  // Account for constructive summing of adjacent boosted bands and makeup gain
  const makeupDb = makeupGain > 1.0 ? 20 * Math.log10(makeupGain) : 0;
  // Attenuate by 65% of max positive boost plus makeup gain above unity
  const totalOverheadDb = maxBoostDb * 0.65 + makeupDb;
  if (totalOverheadDb <= 0.05) {
    return 1.0;
  }
  // Convert dB to linear gain and clamp to safe floor (minimum 0.35 to prevent volume dropping too low)
  const linearScale = Math.pow(10, -totalOverheadDb / 20);
  return Math.max(0.35, Math.min(1.0, Number(linearScale.toFixed(4))));
}

/**
 * Parse LRC formatted synchronized lyrics ("[mm:ss.xx] Line text") into sorted seconds + text entries
 */
export function parseLrcLyrics(lrc: string | null | undefined): Array<{ time: number; text: string }> {
  if (!lrc || typeof lrc !== 'string') return [];
  const lines = lrc.split(/\r?\n/);
  const result: Array<{ time: number; text: string }> = [];
  const timeTagRegex = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g;

  for (const rawLine of lines) {
    const trimmedLine = rawLine.trim();
    if (!trimmedLine) continue;

    const timestamps: number[] = [];
    let match: RegExpExecArray | null;
    timeTagRegex.lastIndex = 0;
    while ((match = timeTagRegex.exec(trimmedLine)) !== null) {
      const mins = Number(match[1]) || 0;
      const secs = Number(match[2]) || 0;
      const fracRaw = match[3] || '0';
      const frac = Number(fracRaw) / Math.pow(10, fracRaw.length);
      timestamps.push(mins * 60 + secs + frac);
    }

    if (timestamps.length === 0) continue;
    const text = cleanHtmlEntities(trimmedLine.replace(timeTagRegex, '').trim());
    if (!text) continue;

    for (const t of timestamps) {
      result.push({ time: Number(t.toFixed(2)), text });
    }
  }

  result.sort((a, b) => a.time - b.time);
  return result;
}

/**
 * Find the active synchronized lyric index for a given playback time
 */
export function findActiveLyricIndex(
  lines: Array<{ time: number; text: string }>,
  currentTime: number
): number {
  if (!lines || lines.length === 0) return -1;
  const t = currentTime + 0.15; // subtle visual lead so user can read on the beat
  if (t < lines[0].time) return -1;

  let lo = 0;
  let hi = lines.length - 1;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= t) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/**
 * Clean HTML entities from JioSaavn text responses (e.g. &quot;, &amp;, &#039;)
 */
export function cleanHtmlEntities(text: string): string {
  if (!text) return '';
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Format duration in seconds to MM:SS or HH:MM:SS
 */
export function formatTime(seconds: number | undefined | null): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  const secsStr = secs < 10 ? `0${secs}` : `${secs}`;

  if (hrs > 0) {
    const minsStr = mins < 10 ? `0${mins}` : `${mins}`;
    return `${hrs}:${minsStr}:${secsStr}`;
  }
  return `${mins}:${secsStr}`;
}

/**
 * Format file size in bytes to MB or KB
 */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format global stream play counts concisely (e.g. 214M, 1.5M, 85K)
 */
export function formatPlayCount(count: number | undefined | null): string {
  if (!count || isNaN(count) || count < 1000) return '';
  if (count >= 1_000_000_000) {
    return `${(count / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  }
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  return `${Math.round(count / 1000)}K`;
}

/**
 * Select the best audio stream URL matching or closest to the requested quality
 */
export function resolveBestStreamUrl(song: Song, preferredQuality: AudioQuality = '320kbps'): string {
  if (!song || !song.downloadUrl || song.downloadUrl.length === 0) {
    return '';
  }

  const qualityPreferenceOrder: AudioQuality[] = ['320kbps', '160kbps', '96kbps', '48kbps', '12kbps'];
  const requestedIndex = qualityPreferenceOrder.indexOf(preferredQuality);

  // 1. Exact match
  const exact = song.downloadUrl.find((u) => u.quality === preferredQuality);
  if (exact && exact.url) return exact.url;

  // 2. Fallback to nearest lower quality, then higher
  for (let i = requestedIndex; i < qualityPreferenceOrder.length; i++) {
    const candidate = song.downloadUrl.find((u) => u.quality === qualityPreferenceOrder[i]);
    if (candidate && candidate.url) return candidate.url;
  }

  for (let i = requestedIndex - 1; i >= 0; i--) {
    const candidate = song.downloadUrl.find((u) => u.quality === qualityPreferenceOrder[i]);
    if (candidate && candidate.url) return candidate.url;
  }

  // 3. Fallback to last or first available
  return song.downloadUrl[song.downloadUrl.length - 1]?.url || song.downloadUrl[0]?.url || '';
}

export interface NetworkConnectionSnapshot {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

/**
 * Determines whether connectivity is currently constrained (slow-2g, 2g, 3g, saveData,
 * low downlink, high RTT, or empirically measured slow stream loading).
 */
export function isLowNetworkSpeed(
  conn?: NetworkConnectionSnapshot | null,
  measuredSlow: boolean = false
): boolean {
  if (measuredSlow) return true;
  if (!conn) return false;
  if (conn.saveData) return true;
  const eff = (conn.effectiveType || '').toLowerCase();
  if (eff === 'slow-2g' || eff === '2g' || eff === '3g') return true;
  if (typeof conn.downlink === 'number' && conn.downlink > 0 && conn.downlink < 1.8) return true;
  if (typeof conn.rtt === 'number' && conn.rtt >= 300) return true;
  return false;
}

/**
 * Selects a stall-resistant stream bitrate when operating on 2G/3G or slow connections,
 * respecting any even-lower manual quality cap already chosen by the user.
 */
export function getResilientLowNetQuality(
  preferredQuality: AudioQuality = '320kbps',
  conn?: NetworkConnectionSnapshot | null
): AudioQuality {
  const order: AudioQuality[] = ['320kbps', '160kbps', '96kbps', '48kbps', '12kbps'];
  let target: AudioQuality = '96kbps';
  const eff = (conn?.effectiveType || '').toLowerCase();
  const dl = typeof conn?.downlink === 'number' ? conn.downlink : 99;

  if (conn?.saveData || eff === 'slow-2g' || eff === '2g' || (dl > 0 && dl < 0.45)) {
    target = '48kbps';
  }

  return order.indexOf(preferredQuality) > order.indexOf(target) ? preferredQuality : target;
}

/**
 * Get best artwork URL based on target display size
 */
export function getBestImageUrl(images: ImageQuality[] | undefined, size: 'sm' | 'md' | 'lg' = 'md'): string {
  if (!images || images.length === 0) {
    // Elegant SVG fallback with vinyl music disc design
    return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="%231e1b4b"/><circle cx="150" cy="150" r="100" fill="%230f172a"/><circle cx="150" cy="150" r="60" fill="%23312e81"/><circle cx="150" cy="150" r="20" fill="%236366f1"/><circle cx="150" cy="150" r="6" fill="%23ffffff"/></svg>';
  }

  const sizeQualityMap = {
    sm: ['50x50', '150x150', '500x500'],
    md: ['150x150', '500x500', '50x50'],
    lg: ['500x500', '150x150', '50x50'],
  };

  const priority = sizeQualityMap[size];
  for (const q of priority) {
    const match = images.find((img) => img.quality === q);
    if (match && match.url) return match.url;
  }

  return images[images.length - 1]?.url || images[0]?.url || '';
}

/**
 * Unbiased Fisher-Yates array shuffle returning a fresh shallow copy
 */
export function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Fisher-Yates shuffle keeping the current track at the beginning
 */
export function shuffleQueue<T>(items: T[], currentItemIndex: number): T[] {
  if (items.length <= 1) return [...items];

  const safeIdx = currentItemIndex >= 0 && currentItemIndex < items.length ? currentItemIndex : 0;
  const currentItem = items[safeIdx];
  const others = items.filter((_, idx) => idx !== safeIdx);

  return [currentItem, ...shuffleArray(others)];
}

/**
 * Determine next track index taking repeat mode into account
 */
export function shouldAttemptAudioContextResume(contextState: string | undefined): boolean {
  return contextState === 'suspended' || contextState === 'interrupted';
}

export function resolveEffectivePlaybackState(audioPaused: boolean, contextState?: string): 'paused' | 'playing' {
  return audioPaused || (contextState !== undefined && contextState !== 'running') ? 'paused' : 'playing';
}

export function resolveNextTrackIndex(currentIndex: number, queueLength: number, repeatMode: RepeatMode): number | null {
  if (!Number.isInteger(queueLength) || !Number.isInteger(currentIndex) || queueLength <= 0 || currentIndex < 0 || currentIndex >= queueLength) return null;
  return getNextTrackIndex(currentIndex, queueLength, repeatMode);
}

export function getNextTrackIndex(
  currentIndex: number,
  queueLength: number,
  repeatMode: RepeatMode = 'all'
): number | null {
  if (queueLength === 0) return null;
  if (repeatMode === 'one') return currentIndex;

  if (currentIndex + 1 < queueLength) {
    return currentIndex + 1;
  }

  if (repeatMode === 'all') {
    return 0; // Wrap around
  }

  return null; // Stop when queue reaches end and repeat is off
}

/**
 * Determine previous track index
 * If playback has progressed > 3 seconds, replay current song. Otherwise go to previous track.
 */
export function getPrevTrackIndex(
  currentIndex: number,
  queueLength: number,
  currentTimeSeconds: number = 0
): number {
  if (queueLength === 0) return 0;
  if (currentTimeSeconds > 3) {
    return currentIndex; // Replay from start
  }
  if (currentIndex - 1 >= 0) {
    return currentIndex - 1;
  }
  return queueLength - 1; // Wrap to last track
}

function stripTitleParensForKey(raw: string): string {
  return cleanHtmlEntities(raw || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+[-–—]\s+.*$/g, ' ')
    .replace(/[^a-z0-9\u0900-\u097F\u0A00-\u0A7F\u0B80-\u0BFF\u0C00-\u0C7F]+/gi, '')
    .trim();
}

export function getNormalizedSongIdentityKey(song: Song): string {
  const titleKey = stripTitleParensForKey(song?.name || '');
  const primaryArtist = cleanHtmlEntities(song?.artists?.primary?.[0]?.name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097F]+/gi, '');
  return `${titleKey || song?.id || ''}::${primaryArtist}`;
}

export function getNormalizedAlbumKey(song: Song): string {
  const albumId = (song?.album?.id || '').trim();
  const rawAlbumName = cleanHtmlEntities(song?.album?.name || '').toLowerCase();
  const cleanAlbumName = rawAlbumName
    .replace(/\(original motion picture soundtrack\)/gi, '')
    .replace(/\(from [^)]+\)/gi, '')
    .replace(/[^a-z0-9\u0900-\u097F]+/gi, '')
    .trim();

  if (albumId && albumId !== 'alb') {
    return `id:${albumId}`;
  }
  if (cleanAlbumName && cleanAlbumName !== 'single') {
    return `name:${cleanAlbumName}`;
  }
  return '';
}

/**
 * Normalizes text for search indexing and matching: removes diacritics, lowercase,
 * removes punctuation and quotes, collapses whitespace while keeping Indic Unicode characters.
 */
export function normalizeSearchText(text: string): string {
  if (!text) return '';
  return cleanHtmlEntities(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’"`]/g, '')
    .replace(/[^\w\s\u0900-\u097F\u0A00-\u0A7F\u0B80-\u0BFF\u0C00-\u0C7F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strips cosmetic decoration, movie tags, video tags and trailing noise from song titles.
 */
export function stripTitleDecorations(title: string): string {
  if (!title) return '';
  return cleanHtmlEntities(title)
    .replace(/\b(from\s+["'][^"']+["']|from\s+[^)]+)/gi, ' ')
    .replace(/\b(official\s*(music\s*)?video|official\s*audio|lyric\s*video|full\s*song|video\s*song)\b/gi, ' ')
    .replace(/\b(feat\.|featuring)\s+[^)]+/gi, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+[-–—|]\s+.*$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculates a quality rating score (0..150+) based on stream bitrate, image resolution,
 * and metadata completeness to choose the best version among duplicates.
 */
export function getTrackQualityScore(song: Song): number {
  if (!song) return 0;
  let score = 0;
  // Bitrate scoring
  if (Array.isArray(song.downloadUrl) && song.downloadUrl.length > 0) {
    if (song.downloadUrl.some((d) => d && d.quality === '320kbps' && typeof d.url === 'string' && d.url.trim())) {
      score += 100;
    } else if (song.downloadUrl.some((d) => d && d.quality === '160kbps' && typeof d.url === 'string' && d.url.trim())) {
      score += 50;
    } else if (song.downloadUrl.some((d) => d && typeof d.url === 'string' && d.url.trim())) {
      score += 25;
    }
  }
  // Image metadata richness
  if (Array.isArray(song.image) && song.image.length > 0) {
    score += Math.min(20, song.image.length * 5);
    if (song.image.some((img) => img && (img.quality === '500x500' || img.quality === 'high') && typeof img.url === 'string' && img.url.trim())) {
      score += 10;
    }
  }
  // Album completeness
  if (song.album?.name && song.album.name.trim().toLowerCase() !== 'single' && song.album.name.trim().toLowerCase() !== 'unknown') {
    score += 15;
  }
  // Popularity / stream count
  if (typeof song.playCount === 'number' && song.playCount > 0) {
    score += Math.min(25, Math.log10(song.playCount) * 3);
  }
  return score;
}

/**
 * Deduplicates near-identical track versions (same normalized title + primary artist within ±3s duration)
 * while preserving distinct tracks and keeping the highest-bitrate / best-metadata version.
 */
export function deduplicateNearIdenticalSongs(songs: Song[]): Song[] {
  if (!Array.isArray(songs) || songs.length <= 1) return songs || [];

  const derivativePattern =
    /\b(lofi|lo-fi|lofi\s*flip|slowed|reverb|remix|mashup|karaoke|ringtone|8d|dj\s*mix|cover|instrumental|sped\s*up|unplugged)\b/i;

  const result: Song[] = [];
  const seenIds = new Set<string>();

  for (const candidate of songs) {
    if (!candidate || !candidate.id) continue;
    if (seenIds.has(candidate.id)) continue;

    const candidateIdentity = getNormalizedSongIdentityKey(candidate);
    const candidateDuration = Number(candidate.duration) || 0;
    const isCandidateDerivative = derivativePattern.test(cleanHtmlEntities(candidate.name || ''));

    const existingIndex = result.findIndex((existing) => {
      if (existing.id === candidate.id) return true;
      const existingIdentity = getNormalizedSongIdentityKey(existing);
      if (candidateIdentity && existingIdentity && candidateIdentity === existingIdentity) {
        // Do not merge an intentional remix/lofi edit with an original studio track
        const isExistingDerivative = derivativePattern.test(cleanHtmlEntities(existing.name || ''));
        if (isExistingDerivative !== isCandidateDerivative) return false;

        const existingDuration = Number(existing.duration) || 0;
        if (candidateDuration === 0 || existingDuration === 0) return true;
        return Math.abs(candidateDuration - existingDuration) <= 3;
      }
      return false;
    });

    if (existingIndex >= 0) {
      const existingSong = result[existingIndex];
      const existingScore = getTrackQualityScore(existingSong);
      const candidateScore = getTrackQualityScore(candidate);

      if (candidateScore > existingScore) {
        seenIds.delete(existingSong.id);
        seenIds.add(candidate.id);
        result[existingIndex] = candidate;
      }
    } else {
      seenIds.add(candidate.id);
      result.push(candidate);
    }
  }

  return result;
}

export interface DiversifySongsOptions {
  /** Maximum number of songs allowed from the same album/movie (default: 1) */
  maxPerAlbum?: number;
  /** Mutable set of song identity keys already shown in earlier sections */
  excludeKeys?: Set<string>;
}

/**
 * Removes duplicate tracks (by ID and normalized title+artist) and prevents multiple
 * tracks from the exact same movie/album from clustering back-to-back.
 */
export function diversifySongs(songs: Song[], options: DiversifySongsOptions = {}): Song[] {
  if (!Array.isArray(songs) || songs.length === 0) return [];
  const maxPerAlbum = Math.max(1, options.maxPerAlbum ?? 1);
  const excludeKeys = options.excludeKeys;

  const seenIds = new Set<string>();
  const seenIdentityKeys = new Set<string>();
  const albumCounts = new Map<string, number>();
  const picked: Song[] = [];

  for (const song of songs) {
    if (!song || !song.id) continue;
    if (seenIds.has(song.id)) continue;

    const identityKey = getNormalizedSongIdentityKey(song);
    if (identityKey && (seenIdentityKeys.has(identityKey) || excludeKeys?.has(identityKey))) {
      continue;
    }

    const albumKey = getNormalizedAlbumKey(song);
    if (albumKey) {
      const count = albumCounts.get(albumKey) || 0;
      if (count >= maxPerAlbum) {
        continue;
      }
      albumCounts.set(albumKey, count + 1);
    }

    seenIds.add(song.id);
    if (identityKey) {
      seenIdentityKeys.add(identityKey);
      excludeKeys?.add(identityKey);
    }
    picked.push(song);
  }

  return picked;
}

export interface MediaSessionActionCallbacks {
  play?: () => void;
  pause?: () => void;
  previous?: () => void;
  next?: () => void;
  seek?: (time: number) => void;
  stop?: () => void;
}

export interface MediaSessionLike {
  setActionHandler(
    action: string,
    handler: ((details: { seekTime?: number | null; seekOffset?: number | null }) => void) | null
  ): void;
}

/**
 * Configure MediaSession action handlers for lock-screen & control-center controls.
 *
 * CRITICAL FOR iOS / iPhone WebKit:
 * On iOS, registering 'seekbackward' or 'seekforward' causes Lock Screen and Control Center
 * to replace the Previous Track and Next Track buttons with 15-second skip buttons.
 * To ensure Previous and Next track buttons are always rendered, 'seekbackward' and
 * 'seekforward' handlers are explicitly cleared to null.
 */
export function registerMediaSessionActions(
  mediaSession: MediaSessionLike,
  callbacks: MediaSessionActionCallbacks
): void {
  if (!mediaSession || typeof mediaSession.setActionHandler !== 'function') return;

  // 1. Core playback & track transport
  if (callbacks.play) {
    try {
      mediaSession.setActionHandler('play', () => callbacks.play!());
    } catch {}
  }
  if (callbacks.pause) {
    try {
      mediaSession.setActionHandler('pause', () => callbacks.pause!());
    } catch {}
  }
  if (callbacks.previous) {
    try {
      mediaSession.setActionHandler('previoustrack', () => callbacks.previous!());
    } catch {}
  }
  if (callbacks.next) {
    try {
      mediaSession.setActionHandler('nexttrack', () => callbacks.next!());
    } catch {}
  }
  if (callbacks.seek) {
    try {
      mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined && details.seekTime !== null) {
          callbacks.seek!(details.seekTime);
        }
      });
    } catch {}
  }
  if (callbacks.stop) {
    try {
      mediaSession.setActionHandler('stop', () => callbacks.stop!());
    } catch {}
  }

  // 2. Explicitly clear seekbackward and seekforward to guarantee iOS Lock Screen
  // shows Next / Previous track buttons instead of ±15s seek buttons
  try {
    mediaSession.setActionHandler('seekbackward', null);
  } catch {}
  try {
    mediaSession.setActionHandler('seekforward', null);
  } catch {}
}

/**
 * Pure playlist import sanitization & deduplication helper.
 * Strips unsupported/undefined fields for Firestore safety, normalizes required Song fields,
 * enforces bounds (duration, string lengths), and filters out duplicate track IDs.
 */
export function sanitizePlaylistImportTracks(tracks: Array<Partial<Song> | null | undefined>): Song[] {
  const seenIds = new Set<string>();
  const sanitized: Song[] = [];

  for (const raw of tracks || []) {
    if (!raw) continue;
    const rawId = typeof raw.id === 'string' ? raw.id.trim() : '';
    const id = rawId || `tr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const name = cleanHtmlEntities(typeof raw.name === 'string' ? raw.name.trim() : '') || 'Untitled Track';
    const duration = Math.min(86400, Math.max(0, Math.round(Number(raw.duration) || 210)));

    const albumName = cleanHtmlEntities(typeof raw.album?.name === 'string' ? raw.album.name.trim() : '') || 'Single';
    const albumId = typeof raw.album?.id === 'string' && raw.album.id.trim() ? raw.album.id.trim() : 'alb';
    const album: { id: string; name: string } = {
      id: albumId.slice(0, 128),
      name: albumName.slice(0, 200),
    };

    const primaryArtists = Array.isArray(raw.artists?.primary) ? raw.artists.primary : [];
    const cleanPrimary = primaryArtists
      .map((a) => {
        if (!a) return null;
        const aName = cleanHtmlEntities(typeof a.name === 'string' ? a.name.trim() : '') || 'Artist';
        const aId = typeof a.id === 'string' && a.id.trim() ? a.id.trim() : 'artist';
        return { id: aId.slice(0, 128), name: aName.slice(0, 120) };
      })
      .filter((a): a is { id: string; name: string } => Boolean(a));

    const artists = {
      primary: (cleanPrimary.length > 0 ? cleanPrimary : [{ id: 'artist', name: 'Various Artists' }]).slice(0, 10),
    };

    const image = Array.isArray(raw.image)
      ? raw.image
          .filter((img) => img && typeof img.url === 'string' && img.url.trim())
          .slice(0, 6)
          .map((img) => ({ quality: String(img.quality || '150x150').slice(0, 32), url: String(img.url).trim().slice(0, 512) }))
      : [];

    const downloadUrl = Array.isArray(raw.downloadUrl)
      ? raw.downloadUrl
          .filter((d) => d && typeof d.url === 'string' && d.url.trim())
          .slice(0, 8)
          .map((d) => ({ quality: String(d.quality || '320kbps').slice(0, 32), url: String(d.url).trim().slice(0, 512) }))
      : [];

    const cleanSong: Song = {
      id: id.slice(0, 128),
      name: name.slice(0, 300),
      duration,
      album,
      artists,
      image,
      downloadUrl,
    };

    if (raw.year && String(raw.year).trim()) {
      cleanSong.year = String(raw.year).trim().slice(0, 20);
    }
    if (raw.language && String(raw.language).trim()) {
      cleanSong.language = String(raw.language).trim().slice(0, 40);
    }

    sanitized.push(cleanSong);
  }

  return sanitized;
}

export interface ParsedTrackEntry {
  title: string;
  artist: string;
}

/**
 * Pure deterministic parser for pasted song lines and CSV exports.
 * Supports:
 * - "Arijit Singh - Kesariya" (Artist - Song)
 * - "Kesariya - Arijit Singh" (Song - Artist)
 * - "Kesariya by Arijit Singh" (Song by Artist)
 * - "Kesariya, Arijit Singh" or CSV "Kesariya","Arijit Singh"
 * - Plain song titles "Kesariya"
 * - Numbered/bullet prefixes like "1. ", "12) ", "[1] ", "• ", "- "
 */
export function parseRawTrackList(rawText: string, maxTracks = 450): ParsedTrackEntry[] {
  if (!rawText || typeof rawText !== 'string') return [];

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.length > 0 &&
        !/^track\s*name\s*,/i.test(l) &&
        !/^"?track"?\s*,/i.test(l) &&
        !/^title\s*,\s*artist/i.test(l)
    );

  const tracks: ParsedTrackEntry[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    if (tracks.length >= maxTracks) break;

    // Strip leading track numbers/bullets like "1. ", "12) ", "[1] ", "• ", "- "
    let cleaned = line
      .replace(/^[•*\-\d]+[\.)\]]?\s+/, '')
      .replace(/^\[\d+\]\s*/, '')
      .trim();

    // Strip wrapping double or single quotes
    cleaned = cleaned.replace(/^["']+|["']+$/g, '').trim();
    if (!cleaned) continue;

    let title = cleaned;
    let artist = '';

    // CSV format ("Song","Artist" or Song,Artist)
    if (cleaned.includes(',')) {
      const cols = cleaned.split(',').map((c) => c.replace(/^["']+|["']+$/g, '').trim());
      if (cols.length >= 2 && cols[0]) {
        title = cols[0];
        artist = cols[1] || '';
      }
    } else if (/\s[-–—:]\s/.test(cleaned)) {
      const parts = cleaned.split(/\s[-–—:]\s/);
      title = parts[0].trim();
      artist = parts.slice(1).join(' ').trim();
    } else if (/\s+by\s+/i.test(cleaned)) {
      const parts = cleaned.split(/\s+by\s+/i);
      title = parts[0].trim();
      artist = parts.slice(1).join(' ').trim();
    }

    const key = `${title.toLowerCase()}::${artist.toLowerCase()}`;
    if (title && !seen.has(key)) {
      seen.add(key);
      tracks.push({ title, artist });
    }
  }

  return tracks;
}
