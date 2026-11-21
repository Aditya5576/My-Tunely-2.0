import type { Song } from '../types/music';
import { cleanHtmlEntities } from './audioCore';

export interface TextPlaylistTrack {
  title: string;
  artist: string;
  allowReversed?: boolean;
}

export interface ParsedTrackDiagnostic {
  originalLine: string;
  lineNumber: number;
  track: TextPlaylistTrack | null;
  status: 'parsed' | 'duplicate_input' | 'invalid_row';
  errorReason?: string;
}

export interface ParseRawTrackListResult {
  tracks: TextPlaylistTrack[];
  diagnostics: ParsedTrackDiagnostic[];
  totalLines: number;
  duplicateCount: number;
  invalidCount: number;
}

const DASH_SEPARATOR = /\s+[-\u2013\u2014]\s+/;

/**
 * Parses a single CSV line according to RFC-4180 rules (quoted strings, escaped double quotes `""`, commas).
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        cur += char;
        i++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === ',') {
        fields.push(cur.trim());
        cur = '';
        i++;
      } else {
        cur += char;
        i++;
      }
    }
  }
  fields.push(cur.trim());
  return fields;
}

/**
 * Strips numbering prefixes such as "1.", "[1]", "(1)", "1)", "•", "*", "01 -"
 */
export function stripTrackNumberPrefix(raw: string): string {
  return raw
    .trim()
    .replace(/^(?:\[\d+\]|\(\d+\)|\d+[.)\]]\s*|[\u2022*]\s+|\d+\s*[-\u2013\u2014]\s+)/, '')
    .trim();
}

/**
 * Detects whether the fields represent a CSV header row (e.g. "Track Name", "Artist Name(s)")
 * and returns the column indices for title and artist if found.
 */
function detectCsvHeader(fields: string[]): { titleIdx: number; artistIdx: number } | null {
  if (fields.length < 2) return null;
  const lower = fields.map((f) => f.toLowerCase().trim().replace(/^"|"$/g, ''));
  let titleIdx = -1;
  let artistIdx = -1;

  for (let idx = 0; idx < lower.length; idx++) {
    const val = lower[idx];
    if (/(?:track|song|title)(?:\s+name)?/i.test(val) && titleIdx === -1) {
      titleIdx = idx;
    } else if (/(?:artist|performer|creator)(?:\s+name|\(s\))?/i.test(val) && artistIdx === -1) {
      artistIdx = idx;
    }
  }

  if (titleIdx !== -1 && artistIdx !== -1) {
    return { titleIdx, artistIdx };
  }
  return null;
}

export function parseRawTrackListDetailed(rawText: string): ParseRawTrackListResult {
  const tracks: TextPlaylistTrack[] = [];
  const diagnostics: ParsedTrackDiagnostic[] = [];
  const seen = new Set<string>();
  let duplicateCount = 0;
  let invalidCount = 0;

  if (!rawText || typeof rawText !== 'string') {
    return { tracks, diagnostics, totalLines: 0, duplicateCount: 0, invalidCount: 0 };
  }

  const rawLines = rawText.split(/\r\n?|\n/);
  let titleCol = -1;
  let artistCol = -1;
  let checkedHeader = false;

  for (let lineIdx = 0; lineIdx < rawLines.length; lineIdx++) {
    if (tracks.length >= 450) break;
    const rawLine = rawLines[lineIdx];
    const trimmedRaw = rawLine.trim();
    if (!trimmedRaw) continue;

    // Check header on the first non-empty row
    if (!checkedHeader) {
      checkedHeader = true;
      const firstRowCsv = parseCsvLine(trimmedRaw);
      const header = detectCsvHeader(firstRowCsv);
      if (header) {
        titleCol = header.titleIdx;
        artistCol = header.artistIdx;
        diagnostics.push({
          originalLine: rawLine,
          lineNumber: lineIdx + 1,
          track: null,
          status: 'invalid_row',
          errorReason: 'Header row detected and skipped',
        });
        continue;
      }
    }

    const cleanedLine = stripTrackNumberPrefix(trimmedRaw);
    if (!cleanedLine) continue;

    // Ignore standalone header-like fragments if not caught earlier
    if (/^"?track(?:\s+name)?"?\s*,/i.test(cleanedLine)) continue;
    if (/^[-\u2013\u2014]\s|\s[-\u2013\u2014]$/.test(cleanedLine)) {
      invalidCount++;
      diagnostics.push({
        originalLine: rawLine,
        lineNumber: lineIdx + 1,
        track: null,
        status: 'invalid_row',
        errorReason: 'Dangling dash separator without song data',
      });
      continue;
    }

    let title = '';
    let artist = '';
    let allowReversed = false;

    const startsWithQuote = cleanedLine.startsWith('"');
    const separator = cleanedLine.match(DASH_SEPARATOR);
    const by = cleanedLine.match(/^(.+?)\s+by\s+(.+)$/i);

    // 1. Quoted CSV row: starts with a quote (e.g. '"Hotel California - Live", "Eagles"' or '"Title","Artist"')
    if (startsWithQuote && cleanedLine.includes(',')) {
      const csvFields = parseCsvLine(cleanedLine);
      if (titleCol !== -1 && artistCol !== -1 && titleCol < csvFields.length && artistCol < csvFields.length) {
        title = csvFields[titleCol];
        artist = csvFields[artistCol];
      } else if (csvFields.length >= 2) {
        title = csvFields[0];
        artist = csvFields[1];
      } else {
        title = csvFields[0] || cleanedLine;
      }
    } else if (separator?.index !== undefined && !startsWithQuote) {
      // 2. Dash separator ("Artist - Title" or "Title - Artist")
      artist = cleanedLine.slice(0, separator.index);
      title = cleanedLine.slice(separator.index + separator[0].length);
      allowReversed = true;
    } else if (cleanedLine.includes(',')) {
      // 3. Unquoted CSV row (e.g. "Shape of You,Ed Sheeran,Divide")
      const csvFields = parseCsvLine(cleanedLine);
      if (titleCol !== -1 && artistCol !== -1 && titleCol < csvFields.length && artistCol < csvFields.length) {
        title = csvFields[titleCol];
        artist = csvFields[artistCol];
      } else if (csvFields.length >= 2) {
        title = csvFields[0];
        artist = csvFields[1];
      } else {
        title = csvFields[0] || cleanedLine;
      }
    } else if (by) {
      // 4. "Title by Artist"
      [, title, artist] = by;
    } else {
      // 5. Single-string line (title only)
      title = cleanedLine;
      artist = '';
    }

    title = cleanHtmlEntities(title).trim().replace(/^"|"$/g, '').replace(/""/g, '"').trim();
    artist = cleanHtmlEntities(artist).trim().replace(/^"|"$/g, '').replace(/""/g, '"').trim();

    if (!title && !artist) {
      invalidCount++;
      diagnostics.push({
        originalLine: rawLine,
        lineNumber: lineIdx + 1,
        track: null,
        status: 'invalid_row',
        errorReason: 'Empty title and artist after sanitization',
      });
      continue;
    }

    const key = JSON.stringify([title.toLowerCase(), artist.toLowerCase()]);
    if (seen.has(key)) {
      duplicateCount++;
      diagnostics.push({
        originalLine: rawLine,
        lineNumber: lineIdx + 1,
        track: { title, artist, allowReversed },
        status: 'duplicate_input',
        errorReason: 'Duplicate track in input text',
      });
      continue;
    }

    seen.add(key);
    const parsedTrack: TextPlaylistTrack = allowReversed
      ? { title, artist, allowReversed: true }
      : { title, artist };
    tracks.push(parsedTrack);
    diagnostics.push({
      originalLine: rawLine,
      lineNumber: lineIdx + 1,
      track: parsedTrack,
      status: 'parsed',
    });
  }

  return {
    tracks,
    diagnostics,
    totalLines: rawLines.length,
    duplicateCount,
    invalidCount,
  };
}

export function parseRawTrackList(rawText: string): TextPlaylistTrack[] {
  return parseRawTrackListDetailed(rawText).tracks;
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
