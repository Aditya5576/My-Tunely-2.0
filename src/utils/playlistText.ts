import type { Song } from '../types/music';
import { cleanHtmlEntities } from './audioCore';

export interface TextPlaylistTrack {
  title: string;
  artist: string;
  allowReversed?: boolean;
}

const DASH_SEPARATOR = /\s+[-\u2013\u2014]\s+/;

export function parseRawTrackList(rawText: string): TextPlaylistTrack[] {
  const tracks: TextPlaylistTrack[] = [];
  const seen = new Set<string>();
  for (const row of rawText.split(/\r\n?|\n/)) {
    if (tracks.length >= 450) break;
    const line = row.trim().replace(/^(?:\d+[.)]\s+|[\u2022*]\s+)/, '').trim();
    if (!line || /^"?track(?:\s+name)?"?\s*,/i.test(line)) continue;
    if (/^[-\u2013\u2014]\s|\s[-\u2013\u2014]$/.test(line)) continue;

    const separator = line.match(DASH_SEPARATOR);
    const csv = line.match(/^("(?:[^"]|"")*"|[^,]+),\s*("(?:[^"]|"")*"|[^,]*)(?:,.*)?$/);
    const by = line.match(/^(.+?)\s+by\s+(.+)$/i);
    let title = line;
    let artist = '';
    if (separator?.index !== undefined && !line.startsWith('"')) {
      artist = line.slice(0, separator.index);
      title = line.slice(separator.index + separator[0].length);
    } else if (csv) {
      title = csv[1].trim().replace(/^"|"$/g, '').replace(/""/g, '"');
      artist = csv[2].trim().replace(/^"|"$/g, '').replace(/""/g, '"');
    } else if (by) {
      [, title, artist] = by;
    }

    title = cleanHtmlEntities(title).trim();
    artist = cleanHtmlEntities(artist).trim();
    const key = JSON.stringify([title.toLowerCase(), artist.toLowerCase()]);
    if (!title || seen.has(key)) continue;
    seen.add(key);
    tracks.push(separator?.index !== undefined && !line.startsWith('"')
      ? { title, artist, allowReversed: true }
      : { title, artist });
  }
  return tracks;
}

function normalizeTrackText(value: string): string {
  return cleanHtmlEntities(value).normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
}

export async function resolveTextPlaylistTrack(
  track: TextPlaylistTrack,
  search: (query: string) => Promise<Song[]>
): Promise<Song | null> {
  const orientations = track.allowReversed
    ? [track, { title: track.artist, artist: track.title }]
    : [track];
  let firstFoundCandidate: Song | null = null;

  for (const { title, artist } of orientations) {
    const expectedTitle = normalizeTrackText(title);
    const expectedArtist = normalizeTrackText(artist);
    if (!expectedTitle && !expectedArtist) continue;

    const queries = artist && title ? [title + ' ' + artist, artist + ' ' + title, title] : [title || artist];
    for (const query of queries) {
      const candidates = await search(query).catch(() => []);
      if (candidates.length > 0 && !firstFoundCandidate) {
        firstFoundCandidate = candidates[0];
      }
      const match = candidates.find((song) => {
        if (!song || !song.name) return false;
        const fullTitle = normalizeTrackText(song.name);
        const baseTitle = normalizeTrackText(song.name.replace(/\s*[([](?:from|feat\.?|ft\.?)\s.*$/i, ''));
        const artists = (song.artists?.primary || []).map((entry) => normalizeTrackText(entry?.name || ''));
        const titleMatches =
          fullTitle === expectedTitle ||
          baseTitle === expectedTitle ||
          (expectedTitle.length >= 3 && (fullTitle.includes(expectedTitle) || expectedTitle.includes(fullTitle)));
        const artistMatches =
          !expectedArtist ||
          artists.some((a) => a.includes(expectedArtist) || expectedArtist.includes(a));
        return titleMatches && artistMatches;
      });
      if (match) return match;
    }
  }

  return null;
}
