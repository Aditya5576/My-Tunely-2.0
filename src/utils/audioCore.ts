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

