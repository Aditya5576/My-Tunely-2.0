/**
 * Music and player data types for Tunely
 */

export type AudioQuality = '12kbps' | '48kbps' | '96kbps' | '160kbps' | '320kbps';

export interface ImageQuality {
  quality: string;
  url: string;
}

export interface DownloadUrl {
  quality: AudioQuality | string;
  url: string;
}

export interface ArtistRef {
  id: string;
  name: string;
  role?: string;
  image?: ImageQuality[];
}

export interface AlbumRef {
  id: string;
  name: string;
  url?: string;
}

export interface Song {
  id: string;
  name: string;
  type?: string;
  year?: string;
  releaseDate?: string | null;
  duration: number; // in seconds
  label?: string;
  explicitContent?: boolean;
  playCount?: number;
  language?: string;
  hasLyrics?: boolean;
  lyricsId?: string | null;
  url?: string;
  copyright?: string;
  album?: AlbumRef;
  artists?: {
    primary?: ArtistRef[];
    featured?: ArtistRef[];
    all?: ArtistRef[];
  };
  image: ImageQuality[];
  downloadUrl: DownloadUrl[];
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  coverColor?: string;
  createdAt: number;
  updatedAt?: number;
  cloudConfirmed?: true;
  songs: Song[];
  userEmail: string;
  revision?: number;
}

export interface UserProfile {
  email: string;
  name: string;
  password?: string;
  avatarUrl?: string;
  avatarColor?: string;
  createdAt: number;
  lastActive: number;
  preferredQuality: AudioQuality;
  autoResumeOnInterruption: boolean;
  soundProfile?: SoundProfile;
}

export interface DownloadedTrack {
  id: string;
  song: Song;
  audioBlob: Blob;
  quality: AudioQuality;
  sizeBytes: number;
  downloadedAt: number;
  userEmail: string;
}

export type PlayState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
export type RepeatMode = 'off' | 'all' | 'one';
export type SoundProfile = 'studio' | 'bass' | 'vocal' | 'concert' | 'night' | 'flat';

export interface EqBands {
  sub: number; // 55 Hz low-shelf (dB)
  bass: number; // 130 Hz warm punch (dB)
  mid: number; // 320 Hz anti-mud / body (dB)
  vocal: number; // 2.8 kHz presence & clarity (dB)
  air: number; // 11 kHz sparkle & openness (dB)
}

export interface FeedSection {
  id: string;
  title: string;
  subtitle?: string;
  songs: Song[];
}

export interface LyricLine {
  time: number; // seconds
  text: string;
}

export interface LyricsPayload {
  syncedLyrics: LyricLine[];
  plainLyrics: string | null;
  source: string;
}

export type AppTheme = 'midnight' | 'obsidian' | 'emerald' | 'crimson' | 'daylight';
export type AppFont = 'jakarta' | 'outfit' | 'dmsans' | 'manrope' | 'editorial';

