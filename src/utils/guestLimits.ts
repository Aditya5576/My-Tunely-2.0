import { Playlist, Song } from '../types/music';
import { sanitizePlaylistImportTracks } from './audioCore';

export { sanitizePlaylistImportTracks } from './audioCore';

export const GUEST_SEARCH_LIMIT = 5;
export const GUEST_PLAYBACK_LIMIT_SECONDS = 900; // 15 minutes
export const GUEST_TRACK_LIMIT = 3;

export interface GuestUsage {
  searchesCount: number;
  playbackSeconds: number;
  tracksPlayed: number;
}

const DEFAULT_GUEST_USAGE: GuestUsage = {
  searchesCount: 0,
  playbackSeconds: 0,
  tracksPlayed: 0,
};

const STORAGE_KEY = 'tunely_guest_usage_v1';

export function canGuestSearch(usage: GuestUsage): boolean {
  return (usage?.searchesCount || 0) < GUEST_SEARCH_LIMIT;
}

export function incrementGuestSearch(usage: GuestUsage): GuestUsage {
  return {
    ...usage,
    searchesCount: (usage?.searchesCount || 0) + 1,
  };
}

export function canGuestPlay(usage: GuestUsage): boolean {
  if (!usage) return true;
  const underTime = (usage.playbackSeconds || 0) < GUEST_PLAYBACK_LIMIT_SECONDS;
  const underTracks = (usage.tracksPlayed || 0) < GUEST_TRACK_LIMIT;
  return underTime && underTracks;
}

export function recordGuestPlayback(usage: GuestUsage, elapsedSeconds: number): GuestUsage {
  const safeElapsed = Math.max(0, Math.min(300, Math.round(elapsedSeconds || 0)));
  return {
    ...usage,
    playbackSeconds: (usage?.playbackSeconds || 0) + safeElapsed,
  };
}

export function recordGuestTrackFinished(usage: GuestUsage): GuestUsage {
  return {
    ...usage,
    tracksPlayed: (usage?.tracksPlayed || 0) + 1,
  };
}

export function canGuestModifyLibrary(isGuest: boolean): boolean {
  return !isGuest;
}

export function withPlaylistSongs(
  playlist: Playlist,
  songs: Partial<Song>[],
  updatedAt = Date.now(),
  revision = (playlist.revision ?? 0) + 1
): Playlist {
  return {
    ...playlist,
    updatedAt,
    revision,
    songs: sanitizePlaylistImportTracks(songs).slice(0, 450),
  };
}

/**
 * Reconcile concurrent song list edits across devices/browsers.
 * Preserves newly added tracks from both sessions without clobbering,
 * while respecting authoritative deletions from newer sessions.
 */
export function reconcileConcurrentSongs(
  baseOrLocalSongs: Song[],
  incomingSongs: Song[],
  localUpdatedAt?: number,
  incomingUpdatedAt?: number,
  localRevision?: number,
  incomingRevision?: number,
  options?: { addedSongIds?: string[]; deletedSongIds?: string[] }
): Song[] {
  const localIds = baseOrLocalSongs.map((s) => s.id);
  const incomingIds = incomingSongs.map((s) => s.id);
  if (localIds.length === incomingIds.length && localIds.every((id, i) => id === incomingIds[i])) {
    return baseOrLocalSongs;
  }

  const localIdSet = new Set(localIds);
  const incomingIdSet = new Set(incomingIds);

  const songsOnlyInLocal = baseOrLocalSongs.filter((s) => !incomingIdSet.has(s.id));
  const songsOnlyInIncoming = incomingSongs.filter((s) => !localIdSet.has(s.id));

  // True concurrent fork: both sessions added new unique songs
  if (songsOnlyInLocal.length > 0 && songsOnlyInIncoming.length > 0) {
    const merged = [...baseOrLocalSongs];
    for (const song of songsOnlyInIncoming) {
      if (!merged.some((m) => m.id === song.id) && merged.length < 450) {
        merged.push(song);
      }
    }
    return merged;
  }

  // Explicit added songs preservation (SYNC-001):
  // When an active session adds tracks, those newly added tracks must NEVER be dropped
  // by an empty incoming snapshot or a revision gap from prior detail updates.
  if (options?.addedSongIds && options.addedSongIds.length > 0) {
    const addedIdSet = new Set(options.addedSongIds);
    const locallyAdded = baseOrLocalSongs.filter((s) => addedIdSet.has(s.id));
    if (locallyAdded.length > 0) {
      if (incomingSongs.length === 0) {
        return baseOrLocalSongs;
      }
      const mergedWithAdded = [...incomingSongs];
      for (const s of locallyAdded) {
        if (!mergedWithAdded.some((m) => m.id === s.id) && mergedWithAdded.length < 450) {
          mergedWithAdded.push(s);
        }
      }
      return mergedWithAdded;
    }
  }

  // When monotonic revisions are present and distinct, higher revision takes priority
  if (localRevision !== undefined && incomingRevision !== undefined) {
    if (localRevision > incomingRevision) {
      return baseOrLocalSongs;
    }
    if (incomingRevision > localRevision) {
      return incomingSongs;
    }
  }

  // Linear progression or single-sided edit: evaluate timestamps
  if (localUpdatedAt !== undefined && incomingUpdatedAt !== undefined) {
    if (localUpdatedAt > incomingUpdatedAt) {
      return baseOrLocalSongs;
    }
    if (incomingUpdatedAt > localUpdatedAt) {
      return incomingSongs;
    }
  }

  // Stale/empty remote snapshots must never wipe populated local songs
  if (baseOrLocalSongs.length > 0 && incomingSongs.length === 0) {
    return baseOrLocalSongs;
  }

  // Stale/empty local snapshots must never wipe populated incoming songs
  if (incomingSongs.length > 0 && baseOrLocalSongs.length === 0) {
    return incomingSongs;
  }

  // Single-sided additions: if one side added tracks and the other didn't add any,
  // preserve the added tracks rather than discarding them
  if (songsOnlyInLocal.length > 0 && songsOnlyInIncoming.length === 0) {
    return baseOrLocalSongs;
  }
  if (songsOnlyInIncoming.length > 0 && songsOnlyInLocal.length === 0) {
    return incomingSongs;
  }

  return incomingSongs;
}

export function preferLocalPlaylistSongs(local: Playlist, cloud: Playlist): boolean {
  if (local.songs.length === cloud.songs.length
      && local.songs.every((song, index) => song.id === cloud.songs[index].id)) {
    return false;
  }
  // When monotonic revisions are present, compare revisions first
  if (local.revision !== undefined && cloud.revision !== undefined) {
    if (local.revision !== cloud.revision) {
      return local.revision > cloud.revision;
    }
  }
  // When both have explicit timestamps, timestamp strictly determines which is fresher
  if (local.updatedAt !== undefined && cloud.updatedAt !== undefined) {
    if (local.updatedAt !== cloud.updatedAt) {
      return local.updatedAt > cloud.updatedAt;
    }
  }
  // If timestamps are unavailable or identical, a populated local playlist must NEVER be wiped by an empty cloud playlist
  if (local.songs.length > 0 && cloud.songs.length === 0) {
    return true;
  }
  if (local.updatedAt !== undefined && cloud.updatedAt === undefined) {
    return true;
  }
  return false;
}

/** Merge confirmed cloud state with cached and local-only playlists. */
export function mergeCloudAndLocalPlaylists(localPlaylists: Playlist[], cloudPlaylists: Playlist[]): Playlist[] {
  const localById = new Map(localPlaylists.filter((playlist) => playlist?.id).map((playlist) => [playlist.id, playlist]));
  const byId = new Map([...localById].filter(([, playlist]) => !playlist.cloudConfirmed));
  for (const cloud of cloudPlaylists) {
    if (!cloud?.id) continue;
    const local = localById.get(cloud.id);
    if (!local) {
      byId.set(cloud.id, cloud);
      continue;
    }

    const reconciledSongs = reconcileConcurrentSongs(
      local.songs,
      cloud.songs,
      local.updatedAt,
      cloud.updatedAt,
      local.revision,
      cloud.revision
    );
    const chosenUpdatedAt = Math.max(local.updatedAt ?? 0, cloud.updatedAt ?? 0) || cloud.updatedAt;
    const chosenRevision = Math.max(local.revision ?? 0, cloud.revision ?? 0) || cloud.revision;

    byId.set(cloud.id, {
      ...cloud,
      songs: reconciledSongs,
      updatedAt: chosenUpdatedAt,
      revision: chosenRevision,
    });
  }
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Pure deterministic merge of cloud and local liked songs.
 */
export function mergeCloudAndLocalLikes(localLikes: Song[], cloudLikes: Song[]): Song[] {
  const seen = new Set<string>();
  const merged: Song[] = [];

  // Cloud likes first to preserve most recent remote additions
  for (const s of cloudLikes || []) {
    if (s?.id && !seen.has(s.id)) {
      seen.add(s.id);
      merged.push(s);
    }
  }

  for (const s of localLikes || []) {
    if (s?.id && !seen.has(s.id)) {
      seen.add(s.id);
      merged.push(s);
    }
  }

  return merged;
}

export function loadGuestUsage(): GuestUsage {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_GUEST_USAGE };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GUEST_USAGE };
    const parsed = JSON.parse(raw);
    return {
      searchesCount: Number(parsed.searchesCount) || 0,
      playbackSeconds: Number(parsed.playbackSeconds) || 0,
      tracksPlayed: Number(parsed.tracksPlayed) || 0,
    };
  } catch {
    return { ...DEFAULT_GUEST_USAGE };
  }
}

export function saveGuestUsage(usage: GuestUsage): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
  } catch {}
}

export function resetGuestUsage(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/**
 * Actionable Firebase Auth error formatter.
 * Translates cryptic Firebase codes (e.g. auth/unauthorized-domain) into clear, actionable developer guidance.
 */
export function formatFirebaseAuthError(error: unknown, hostname?: string): string {
  if (!error) return 'Authentication failed. Please try again.';

  const errObj = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : null;
  const code = typeof errObj?.code === 'string' ? errObj.code : '';
  const message =
    error instanceof Error
      ? error.message
      : typeof errObj?.message === 'string'
        ? errObj.message
        : typeof error === 'string'
          ? error
          : String(error);

  const isUnauthorizedDomain =
    code === 'auth/unauthorized-domain' ||
    message.includes('auth/unauthorized-domain') ||
    message.toLowerCase().includes('unauthorized domain');

  if (isUnauthorizedDomain) {
    const host =
      (hostname && hostname.trim()) ||
      (typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : '') ||
      'current domain';
    return `Domain '${host}' is not authorized in Firebase Console (Authentication → Settings → Authorized domains). For local PC testing, open http://localhost:3000.`;
  }

  if (code === 'auth/popup-closed-by-user') {
    return 'Google sign-in popup was closed before completing.';
  }

  if (code === 'auth/popup-blocked') {
    return 'Google sign-in popup was blocked by your browser. Please allow popups for this site.';
  }

  if (code === 'auth/cancelled-popup-request') {
    return 'Google sign-in was cancelled due to a concurrent request.';
  }

  return message && message !== '[object Object]' ? message : 'Google sign-in failed. Please try again.';
}


/**
 * SSRF Safeguard: Validates that a URL uses http/https and does NOT resolve
 * to loopback, link-local, private RFC1918, carrier-grade NAT, or internal metadata addresses.
 */
export function isSafePublicHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    let host = parsed.hostname.toLowerCase().trim();
    if (host.startsWith('[') && host.endsWith(']')) {
      host = host.slice(1, -1);
    }
    if (!host) return false;

    // Loopback, local hostnames and internal domain suffixes
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.endsWith('.lan') ||
      host.endsWith('.home.arpa')
    ) {
      return false;
    }

    // 127.0.0.0/8 & IPv6 ::1 loopback
    if (/^127\./.test(host) || host === '::1' || host === '0:0:0:0:0:0:0:1') return false;

    // 0.0.0.0/8 & unspecified IPv6 ::
    if (/^0\./.test(host) || host === '::' || host === '0:0:0:0:0:0:0:0') return false;

    // RFC 1918 private subnets
    if (/^10\./.test(host)) return false; // 10.0.0.0/8
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false; // 172.16.0.0/12
    if (/^192\.168\./.test(host)) return false; // 192.168.0.0/16

    // Link-local & cloud metadata (169.254.0.0/16)
    if (/^169\.254\./.test(host)) return false;

    // Carrier-Grade NAT (100.64.0.0/10)
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return false;

    // IPv6 Unique Local (fc00::/7)
    if (/^f[cd][0-9a-f]{0,2}:/i.test(host)) return false;

    // IPv6 Link-Local (fe80::/10)
    if (/^fe[89ab][0-9a-f]{0,2}:/i.test(host)) return false;

    // IPv4-mapped IPv6 (::ffff:127.0.0.1, etc.)
    if (/^::ffff:/i.test(host)) {
      const ipv4 = host.slice(7);
      return isSafePublicHttpUrl(`http://${ipv4}`);
    }

    // Reject pure integer IP representations (e.g. 2130706433 = 127.0.0.1)
    if (/^\d+$/.test(host)) return false;

    return true;
  } catch {
    return false;
  }
}

export interface SafeFetchOptions {
  maxRedirects?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
  fetchFn?: typeof fetch;
}

/**
 * Hop-by-hop redirect validating fetcher. Enforces redirect: 'manual' and
 * re-verifies public destination safety before each redirect jump (up to maxRedirects, default 5).
 */
export async function safeFetchPublicUrl(
  initialUrl: string,
  options: SafeFetchOptions = {}
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? 5;
  const timeoutMs = options.timeoutMs ?? 10000;
  const fetchImpl = options.fetchFn ?? fetch;
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!isSafePublicHttpUrl(currentUrl)) {
      throw new Error(`SSRF blocked: URL "${currentUrl}" resolves to a restricted or private address.`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetchImpl(currentUrl, {
        headers: options.headers,
        signal: controller.signal,
        redirect: 'manual',
      });
    } finally {
      clearTimeout(timer);
    }

    const isRedirect = [301, 302, 303, 307, 308].includes(res.status);
    if (!isRedirect) {
      return res;
    }

    const location = res.headers.get('location');
    if (!location) {
      return res;
    }

    try {
      currentUrl = new URL(location, currentUrl).toString();
    } catch {
      throw new Error(`Invalid redirect Location header: "${location}"`);
    }

    if (hop === maxRedirects) {
      throw new Error(`Too many redirects (exceeded limit of ${maxRedirects} hops)`);
    }
  }

  throw new Error(`Too many redirects`);
}


/**
 * Format Firestore sync and write errors into actionable user-facing diagnostics.
 * Surfaces permission-denied (403), quota limits, and network issues directly.
 */
export function formatFirestoreSyncError(error: unknown): string {
  const code = (error as { code?: string })?.code || '';
  const message = error instanceof Error ? error.message : String(error || '');
  const causeMsg = error && typeof error === 'object' && 'cause' in error && error.cause instanceof Error
    ? error.cause.message
    : '';
  const fullText = `${code} ${message} ${causeMsg}`;

  if (
    code === 'permission-denied' ||
    /permission-denied|PERMISSION_DENIED|403|insufficient permissions/i.test(fullText)
  ) {
    return 'Cloud sync blocked by Firestore permissions (403). Update Firestore Rules in Firebase Console.';
  }

  if (code === 'unavailable' || /offline|client is offline/i.test(fullText)) {
    return 'Cloud sync offline. Changes saved locally and will sync when reconnected.';
  }

  if (code === 'resource-exhausted' || /quota exceeded|resource-exhausted/i.test(fullText)) {
    return 'Cloud sync paused: Firestore quota exceeded.';
  }

  return 'Cloud sync paused. Your local copy is saved.';
}
