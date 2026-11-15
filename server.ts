import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const JIOSAAVN_API = 'https://jiosaavn-api.adityapatil2348.workers.dev';
const MAX_IMPORT_TRACKS = 450;

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

interface ExtractedTrack {
  title: string;
  artist: string;
}

interface PlaylistExtractionResult {
  platform: string;
  playlistName: string;
  tracks: ExtractedTrack[];
  preResolvedSongs?: unknown[];
  note?: string;
}

function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#039;|&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\\u0026/g, '&')
    .replace(/\u00a0/g, ' ')
    .trim();
}

function cleanVideoTitleNoise(rawTitle: string): { title: string; inferredArtist: string } {
  let title = decodeHtmlEntities(rawTitle)
    .replace(/\((official\s*(music\s*)?video|lyric\s*video|lyrics|audio|full\s*song|full\s*video|hd|4k|video\s*song)\)/gi, '')
    .replace(/\[(official\s*(music\s*)?video|lyric\s*video|lyrics|audio|full\s*song|hd|4k)\]/gi, '')
    .replace(/\|\s*(t-series|zee music|sony music|yrf|tips official|speed records).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  let inferredArtist = '';
  const dashSplit = title.split(/\s[-–—]\s/);
  if (dashSplit.length >= 2 && dashSplit[0].length >= 2 && dashSplit[1].length >= 2) {
    // Common YouTube pattern: "Artist - Song Title"
    inferredArtist = dashSplit[0].trim();
    title = dashSplit.slice(1).join(' - ').trim();
  }

  return { title: title || rawTitle.trim(), inferredArtist };
}

function isSafePublicHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function fetchText(url: string, timeoutMs: number = 9000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function extractJioSaavnPlaylist(url: string): Promise<PlaylistExtractionResult> {
  const songs: unknown[] = [];
  let playlistName = 'JioSaavn Playlist';
  let songCount = 0;

  for (let page = 0; page < 5; page++) {
    const endpoint = `${JIOSAAVN_API}/api/playlists?link=${encodeURIComponent(url)}&page=${page}&limit=100`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(endpoint, { headers: { Accept: 'application/json' }, signal: controller.signal });
      if (!res.ok) break;
      const json = (await res.json()) as {
        data?: { name?: string; songCount?: number; songs?: unknown[] };
      };
      const data = json?.data;
      if (!data) break;
      if (data.name && page === 0) playlistName = decodeHtmlEntities(data.name);
      if (typeof data.songCount === 'number') songCount = data.songCount;
      const batch = Array.isArray(data.songs) ? data.songs : [];
      if (batch.length === 0) break;
      songs.push(...batch);
      if (songs.length >= MAX_IMPORT_TRACKS || (songCount > 0 && songs.length >= songCount)) {
        break;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    platform: 'JioSaavn',
    playlistName,
    tracks: [],
    preResolvedSongs: songs.slice(0, MAX_IMPORT_TRACKS),
  };
}

async function extractSpotifyPlaylist(url: string): Promise<PlaylistExtractionResult> {
  const idMatch = url.match(/playlist[/:]([a-zA-Z0-9]{10,40})/);
  if (!idMatch) {
    throw new Error('Could not find a valid Spotify playlist ID in that link.');
  }
  const playlistId = idMatch[1];

  const embedHtml = await fetchText(`https://open.spotify.com/embed/playlist/${playlistId}`, 10000);
  const nextDataMatch = embedHtml.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);

  if (nextDataMatch) {
    const nextData = JSON.parse(nextDataMatch[1]) as {
      props?: {
        pageProps?: {
          state?: {
            data?: {
              entity?: {
                name?: string;
                title?: string;
                trackList?: Array<{ title?: string; subtitle?: string }>;
              };
            };
          };
        };
      };
    };

    const entity = nextData?.props?.pageProps?.state?.data?.entity;
    const rawTracks = Array.isArray(entity?.trackList) ? entity.trackList : [];
    const tracks: ExtractedTrack[] = rawTracks
      .filter((t) => t?.title)
      .map((t) => ({
        title: decodeHtmlEntities(t.title || ''),
        artist: decodeHtmlEntities(t.subtitle || ''),
      }));

    if (tracks.length > 0) {
      let note: string | undefined;
      if (tracks.length >= 100) {
        note =
          'Spotify public embed exposes the first 100 tracks directly. For 100+ Spotify playlists, you can also paste the extra song list below.';
      }
      return {
        platform: 'Spotify',
        playlistName: decodeHtmlEntities(entity?.name || entity?.title || 'Spotify Playlist'),
        tracks: tracks.slice(0, MAX_IMPORT_TRACKS),
        note,
      };
    }
  }

  throw new Error('Playlist may be private or unavailable. Make sure the Spotify playlist is set to Public.');
}

async function extractAppleMusicPlaylist(url: string): Promise<PlaylistExtractionResult> {
  const html = await fetchText(url, 11000);
  let playlistName = 'Apple Music Playlist';
  const tracks: ExtractedTrack[] = [];
  const seen = new Set<string>();

  const ldMatches = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  for (const m of ldMatches) {
    try {
      const ld = JSON.parse(m[1]) as {
        name?: string;
        track?: Array<{ name?: string; byArtist?: { name?: string } | Array<{ name?: string }> }>;
      };
      if (ld?.name) playlistName = decodeHtmlEntities(ld.name);
      if (Array.isArray(ld?.track)) {
        for (const t of ld.track) {
          if (!t?.name) continue;
          const artistObj = Array.isArray(t.byArtist) ? t.byArtist[0] : t.byArtist;
          const title = decodeHtmlEntities(t.name);
          const artist = decodeHtmlEntities(artistObj?.name || '');
          const key = `${title.toLowerCase()}::${artist.toLowerCase()}`;
          if (!seen.has(key)) {
            seen.add(key);
            tracks.push({ title, artist });
          }
        }
      }
    } catch {
      // Ignore malformed JSON-LD block
    }
  }

  const sdMatch = html.match(/id="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/);
  if (sdMatch) {
    try {
      const parsed = JSON.parse(sdMatch[1]) as unknown;
      const walkApple = (node: unknown) => {
        if (!node || typeof node !== 'object' || tracks.length >= MAX_IMPORT_TRACKS) return;
        if (Array.isArray(node)) {
          for (const item of node) walkApple(item);
          return;
        }
        const obj = node as Record<string, unknown>;
        if (
          typeof obj.title === 'string' &&
          typeof obj.artistName === 'string' &&
          (obj.duration !== undefined ||
            (obj.contentDescriptor &&
              typeof obj.contentDescriptor === 'object' &&
              (obj.contentDescriptor as Record<string, unknown>).kind === 'song'))
        ) {
          const title = decodeHtmlEntities(obj.title);
          const artist = decodeHtmlEntities(obj.artistName);
          const key = `${title.toLowerCase()}::${artist.toLowerCase()}`;
          if (title && !seen.has(key)) {
            seen.add(key);
            tracks.push({ title, artist });
          }
        }
        for (const val of Object.values(obj)) {
          walkApple(val);
        }
      };
      walkApple(parsed);
    } catch {
      // Ignore serialized data failure
    }
  }

  if (tracks.length === 0) {
    throw new Error('Could not extract tracks from that Apple Music link. Make sure the playlist is public.');
  }

  return {
    platform: 'Apple Music',
    playlistName,
    tracks: tracks.slice(0, MAX_IMPORT_TRACKS),
  };
}

function collectYouTubeItemsAndTokens(
  node: unknown,
  tracks: ExtractedTrack[],
  seen: Set<string>,
  tokens: string[]
) {
  if (!node || typeof node !== 'object' || tracks.length >= MAX_IMPORT_TRACKS) return;
  if (Array.isArray(node)) {
    for (const item of node) collectYouTubeItemsAndTokens(item, tracks, seen, tokens);
    return;
  }

  const obj = node as Record<string, unknown>;

  if (obj.playlistVideoRenderer && typeof obj.playlistVideoRenderer === 'object') {
    const r = obj.playlistVideoRenderer as {
      title?: { runs?: Array<{ text?: string }>; simpleText?: string };
      shortBylineText?: { runs?: Array<{ text?: string }> };
    };
    const rawTitle = r.title?.runs?.map((x) => x.text || '').join('') || r.title?.simpleText || '';
    const rawChannel = (r.shortBylineText?.runs?.[0]?.text || '')
      .replace(/\s*-\s*Topic$/i, '')
      .replace(/VEVO$/i, '')
      .trim();
    if (rawTitle) {
      const cleaned = cleanVideoTitleNoise(rawTitle);
      const artist = cleaned.inferredArtist || rawChannel;
      const key = `${cleaned.title.toLowerCase()}::${artist.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        tracks.push({ title: cleaned.title, artist });
      }
    }
  }

  if (obj.musicResponsiveListItemRenderer && typeof obj.musicResponsiveListItemRenderer === 'object') {
    const r = obj.musicResponsiveListItemRenderer as {
      flexColumns?: Array<{
        musicResponsiveListItemFlexColumnRenderer?: {
          text?: { runs?: Array<{ text?: string }> };
        };
      }>;
    };
    const col0 = r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs
      ?.map((x) => x.text || '')
      .join('')
      .trim();
    const col1Runs = r.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
    const col1 = col1Runs
      .map((x) => x.text || '')
      .join('')
      .split('•')[0]
      .trim();
    if (col0) {
      const cleaned = cleanVideoTitleNoise(col0);
      const artist = col1 && !/^\d+:\d+$/.test(col1) ? decodeHtmlEntities(col1) : cleaned.inferredArtist;
      const key = `${cleaned.title.toLowerCase()}::${artist.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        tracks.push({ title: cleaned.title, artist });
      }
    }
  }

  if (obj.continuationCommand && typeof obj.continuationCommand === 'object') {
    const token = (obj.continuationCommand as { token?: string }).token;
    if (typeof token === 'string' && token && !tokens.includes(token)) {
      tokens.push(token);
    }
  }

  for (const val of Object.values(obj)) {
    collectYouTubeItemsAndTokens(val, tracks, seen, tokens);
  }
}

async function extractYouTubePlaylist(url: string): Promise<PlaylistExtractionResult> {
  let listId = '';
  try {
    const parsed = new URL(url);
    listId = parsed.searchParams.get('list') || '';
  } catch {
    const m = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    listId = m?.[1] || '';
  }
  if (!listId) {
    throw new Error('Could not locate a YouTube playlist ID (?list=...) in that URL.');
  }

  const isMusicUrl = url.includes('music.youtube.com');
  const tracks: ExtractedTrack[] = [];
  const seen = new Set<string>();
  const visitedTokens = new Set<string>();
  const pendingTokens: string[] = [];

  const targetUrl = isMusicUrl
    ? `https://music.youtube.com/playlist?list=${encodeURIComponent(listId)}`
    : `https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}`;

  const html = await fetchText(targetUrl, 11000);
  let playlistName = isMusicUrl ? 'YouTube Music Playlist' : 'YouTube Playlist';

  const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
  if (titleMatch?.[1]) playlistName = decodeHtmlEntities(titleMatch[1]);

  const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  const clientVerMatch = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/);
  const innertubeKey = apiKeyMatch?.[1] || '';
  const clientVersion = clientVerMatch?.[1] || (isMusicUrl ? '1.20240101.01.00' : '2.20240101.00.00');
  const clientName = isMusicUrl ? 'WEB_REMIX' : 'WEB';

  const ytDataMatch = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
  if (ytDataMatch) {
    try {
      const d = JSON.parse(ytDataMatch[1]);
      collectYouTubeItemsAndTokens(d, tracks, seen, pendingTokens);
    } catch {
      // Ignore parse error and try fallback
    }
  }

  // Fallback parse for YT Music escaped initialData.push JSON
  if (tracks.length === 0) {
    const ymMatches = [...html.matchAll(/initialData\.push\(\{[^}]*data:\s*'([\s\S]*?)'\s*\}\);/g)];
    for (const m of ymMatches) {
      try {
        const unescaped = m[1]
          .replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
        const parsed = JSON.parse(unescaped);
        collectYouTubeItemsAndTokens(parsed, tracks, seen, pendingTokens);
      } catch {
        // Ignore chunk
      }
    }
  }

  // Follow continuation tokens to fetch > 100 tracks (up to 450)
  const browseOrigin = isMusicUrl ? 'https://music.youtube.com' : 'https://www.youtube.com';
  let pageCount = 0;
  while (pendingTokens.length > 0 && tracks.length < MAX_IMPORT_TRACKS && innertubeKey && pageCount < 6) {
    const token = pendingTokens.shift()!;
    if (visitedTokens.has(token)) continue;
    visitedTokens.add(token);
    pageCount++;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      const res = await fetch(`${browseOrigin}/youtubei/v1/browse?key=${innertubeKey}`, {
        method: 'POST',
        headers: {
          ...BROWSER_HEADERS,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          context: { client: { clientName, clientVersion } },
          continuation: token,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const contJson = await res.json();
        collectYouTubeItemsAndTokens(contJson, tracks, seen, pendingTokens);
      }
    } catch {
      break;
    }
  }

  // If standard YouTube gave 0 tracks (e.g. chart page), retry via YT Music endpoint
  if (tracks.length === 0 && !isMusicUrl) {
    return extractYouTubePlaylist(`https://music.youtube.com/playlist?list=${encodeURIComponent(listId)}`);
  }

  if (tracks.length === 0) {
    throw new Error('No tracks found in that YouTube playlist. Ensure it is Public or Unlisted.');
  }

  return {
    platform: isMusicUrl ? 'YouTube Music' : 'YouTube',
    playlistName,
    tracks: tracks.slice(0, MAX_IMPORT_TRACKS),
  };
}

async function extractGenericPlaylistUrl(url: string): Promise<PlaylistExtractionResult> {
  const html = await fetchText(url, 10000);
  let playlistName = 'Imported Web Playlist';
  const titleM = html.match(/<meta property="og:title" content="([^"]+)"/i) || html.match(/<title>([^<]+)<\/title>/i);
  if (titleM?.[1]) playlistName = decodeHtmlEntities(titleM[1]);

  const tracks: ExtractedTrack[] = [];
  const seen = new Set<string>();

  const ldMatches = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of ldMatches) {
    try {
      const obj = JSON.parse(m[1]) as unknown;
      const walk = (n: unknown) => {
        if (!n || typeof n !== 'object' || tracks.length >= MAX_IMPORT_TRACKS) return;
        if (Array.isArray(n)) {
          n.forEach(walk);
          return;
        }
        const rec = n as Record<string, unknown>;
        if (rec['@type'] === 'MusicRecording' && typeof rec.name === 'string') {
          const byArtist = rec.byArtist as { name?: string } | Array<{ name?: string }> | undefined;
          const artistName = Array.isArray(byArtist) ? byArtist[0]?.name || '' : byArtist?.name || '';
          const t = decodeHtmlEntities(rec.name);
          const a = decodeHtmlEntities(artistName);
          const k = `${t.toLowerCase()}::${a.toLowerCase()}`;
          if (t && !seen.has(k)) {
            seen.add(k);
            tracks.push({ title: t, artist: a });
          }
        }
        Object.values(rec).forEach(walk);
      };
      walk(obj);
    } catch {
      // Ignore malformed JSON-LD
    }
  }

  if (tracks.length === 0) {
    throw new Error(
      'Could not auto-detect tracks from that website URL. Try a Spotify, Apple Music, YouTube, or JioSaavn playlist link — or paste the track list directly.'
    );
  }

  return {
    platform: 'Web Link',
    playlistName,
    tracks: tracks.slice(0, MAX_IMPORT_TRACKS),
  };
}

function parseRawTrackList(rawText: string): ExtractedTrack[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 1 && !/^track\s*name\s*,/i.test(l) && !/^"?track"?\s*,/i.test(l));

  const tracks: ExtractedTrack[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    if (tracks.length >= MAX_IMPORT_TRACKS) break;
    // Strip leading track numbers like "1. " or "12) "
    const cleanedLine = line.replace(/^\d+[\.)]\s+/, '').trim();
    if (!cleanedLine) continue;

    let title = cleanedLine;
    let artist = '';

    // CSV format ("Song","Artist" or Song,Artist)
    if (cleanedLine.includes(',')) {
      const cols = cleanedLine.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
      if (cols.length >= 2 && cols[0]) {
        title = cols[0];
        artist = cols[1] || '';
      }
    } else if (/\s[-–—]\s/.test(cleanedLine)) {
      const parts = cleanedLine.split(/\s[-–—]\s/);
      title = parts[0].trim();
      artist = parts.slice(1).join(' ').trim();
    } else if (/\s+by\s+/i.test(cleanedLine)) {
      const parts = cleanedLine.split(/\s+by\s+/i);
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

function cleanLyricsTitle(title: string): string {
  return decodeHtmlEntities(title)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+[-–—]\s+(from|hindi|punjabi|tamil|telugu|remix|version).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Synchronized Lyrics Fetcher Route (LRCLIB search API + JioSaavn fallback)
  app.get('/api/lyrics', async (req: Request, res: Response) => {
    try {
      const songId = String(req.query.songId || '').trim();
      const rawTitle = String(req.query.title || '').trim();
      const rawArtist = String(req.query.artist || '').trim();
      const rawAlbum = String(req.query.album || '').trim();
      const targetDuration = Number(req.query.duration) || 0;

      const cleanTitle = cleanLyricsTitle(rawTitle);
      const primaryArtist = decodeHtmlEntities(rawArtist).split(',')[0].trim();

      if (!cleanTitle && !songId) {
        res.status(400).json({ error: 'Song title or ID is required.' });
        return;
      }

      let syncedLyrics: string | null = null;
      let plainLyrics: string | null = null;
      let source = 'lrclib';

      // 1. Try direct LRCLIB exact match if we have title + artist
      if (cleanTitle && primaryArtist) {
        try {
          const params = new URLSearchParams({
            track_name: cleanTitle,
            artist_name: primaryArtist,
          });
          if (rawAlbum) params.set('album_name', cleanLyricsTitle(rawAlbum));
          if (targetDuration > 0) params.set('duration', String(Math.round(targetDuration)));

          const exactRes = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
            headers: { Accept: 'application/json', 'User-Agent': 'Tunely/2.0' },
          });
          if (exactRes.ok) {
            const exactJson = (await exactRes.json()) as { syncedLyrics?: string; plainLyrics?: string };
            if (exactJson?.syncedLyrics) syncedLyrics = exactJson.syncedLyrics;
            if (exactJson?.plainLyrics) plainLyrics = exactJson.plainLyrics;
          }
        } catch {}
      }

      // 2. Fallback to LRCLIB search API for synced LRC matches
      if (!syncedLyrics && cleanTitle) {
        try {
          const searchTerms = primaryArtist ? `${cleanTitle} ${primaryArtist}` : cleanTitle;
          const searchRes = await fetch(
            `https://lrclib.net/api/search?q=${encodeURIComponent(searchTerms)}`,
            { headers: { Accept: 'application/json', 'User-Agent': 'Tunely/2.0' } }
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

      // 3. Fallback to JioSaavn lyrics endpoint if neither synced nor plain found yet
      if (!syncedLyrics && !plainLyrics && songId) {
        try {
          const jsRes = await fetch(`${JIOSAAVN_API}/api/songs/${encodeURIComponent(songId)}/lyrics`, {
            headers: { Accept: 'application/json' },
          });
          if (jsRes.ok) {
            const jsJson = (await jsRes.json()) as { data?: { lyrics?: string } };
            if (jsJson?.data?.lyrics) {
              plainLyrics = decodeHtmlEntities(jsJson.data.lyrics.replace(/<br\s*\/?>/gi, '\n'));
              source = 'jiosaavn';
            }
          }
        } catch {}
      }

      res.json({
        syncedLyrics,
        plainLyrics,
        source: syncedLyrics || plainLyrics ? source : 'none',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch lyrics.';
      res.status(500).json({ error: msg });
    }
  });

  // Universal Playlist Importer Route (supports JioSaavn, YouTube/YT Music, Spotify, Apple Music, Generic URL & 100+ raw lists)
  app.post('/api/import-playlist', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as { url?: string; rawText?: string };
      const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';
      const rawText = typeof body.rawText === 'string' ? body.rawText.trim() : '';

      if (rawText) {
        const parsedTracks = parseRawTrackList(rawText);
        if (parsedTracks.length === 0) {
          res.status(400).json({ error: 'No valid song lines found in the pasted text.' });
          return;
        }
        res.json({
          platform: 'Track List',
          playlistName: 'Imported Playlist',
          tracks: parsedTracks,
        });
        return;
      }

      if (!rawUrl || !isSafePublicHttpUrl(rawUrl)) {
        res.status(400).json({ error: 'Please enter a valid public playlist link (https://...).' });
        return;
      }

      const lower = rawUrl.toLowerCase();
      let result: PlaylistExtractionResult;

      if (lower.includes('jiosaavn.com') || lower.includes('saavn.com')) {
        result = await extractJioSaavnPlaylist(rawUrl);
      } else if (lower.includes('open.spotify.com')) {
        result = await extractSpotifyPlaylist(rawUrl);
      } else if (lower.includes('music.apple.com')) {
        result = await extractAppleMusicPlaylist(rawUrl);
      } else if (
        lower.includes('youtube.com') ||
        lower.includes('youtu.be') ||
        lower.includes('music.youtube.com')
      ) {
        result = await extractYouTubePlaylist(rawUrl);
      } else {
        result = await extractGenericPlaylistUrl(rawUrl);
      }

      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to import playlist link.';
      res.status(422).json({ error: msg });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
        watch: null,
      },
      appType: 'spa',
    });

    if (process.env.DISABLE_HMR === 'true') {
      app.get('/@vite/client', (_req: Request, res: Response) => {
        res.type('application/javascript').send(`
import "/node_modules/vite/dist/client/env.mjs";
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    style.remove();
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    accept() {},
    prune() {},
    dispose() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
    data: {},
  };
}
export function injectQuery(url) {
  return url;
}
export class ErrorOverlay {}
`);
      });
    }

    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Tunely 2.0 server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Tunely server:', err);
  process.exit(1);
});
