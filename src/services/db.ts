import { AudioQuality, DownloadedTrack, Playlist, Song, UserProfile } from '../types/music';

const DB_NAME = 'TunelyDB_v1';
const DB_VERSION = 2;

class LocalDatabase {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;

        // Store 1: Offline downloaded tracks (audio blobs)
        if (!db.objectStoreNames.contains('offline_tracks')) {
          const store = db.createObjectStore('offline_tracks', { keyPath: 'id' });
          store.createIndex('userEmail', 'userEmail', { unique: false });
          store.createIndex('downloadedAt', 'downloadedAt', { unique: false });
        }

        // Store 2: API Cache (responses cached locally to avoid KV limit & work offline)
        if (!db.objectStoreNames.contains('cached_api')) {
          db.createObjectStore('cached_api', { keyPath: 'key' });
        }

        // Store 3: User Profiles (email-based)
        if (!db.objectStoreNames.contains('user_profiles')) {
          db.createObjectStore('user_profiles', { keyPath: 'email' });
        }

        // Store 4: Playlists
        if (!db.objectStoreNames.contains('user_playlists')) {
          const store = db.createObjectStore('user_playlists', { keyPath: 'id' });
          store.createIndex('userEmail', 'userEmail', { unique: false });
        }

        // Store 5: Favorites / Liked Songs
        if (!db.objectStoreNames.contains('user_favorites')) {
          const store = db.createObjectStore('user_favorites', { keyPath: 'user_song_key' });
          store.createIndex('userEmail', 'userEmail', { unique: false });
        }

        // Store 6: Recently Played History
        if (!db.objectStoreNames.contains('user_history')) {
          const store = db.createObjectStore('user_history', { keyPath: 'user_song_key' });
          store.createIndex('userEmail', 'userEmail', { unique: false });
          store.createIndex('playedAt', 'playedAt', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  // --- OFFLINE AUDIO TRACKS ---
  async saveOfflineTrack(song: Song, audioBlob: Blob, quality: AudioQuality, userEmail: string): Promise<DownloadedTrack> {
    const db = await this.getDB();
    const track: DownloadedTrack = {
      id: song.id,
      song,
      audioBlob,
      quality,
      sizeBytes: audioBlob.size,
      downloadedAt: Date.now(),
      userEmail,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction('offline_tracks', 'readwrite');
      const store = tx.objectStore('offline_tracks');
      const req = store.put(track);
      req.onsuccess = () => resolve(track);
      req.onerror = () => reject(req.error);
    });
  }

  async getOfflineTrack(songId: string): Promise<DownloadedTrack | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('offline_tracks', 'readonly');
      const store = tx.objectStore('offline_tracks');
      const req = store.get(songId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async getAllOfflineTracks(userEmail?: string): Promise<DownloadedTrack[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('offline_tracks', 'readonly');
      const store = tx.objectStore('offline_tracks');
      const req = store.getAll();
      req.onsuccess = () => {
        const results = req.result as DownloadedTrack[];
        if (!userEmail) return resolve(results);
        // Include tracks matching email or shared
        resolve(results.filter((t) => !t.userEmail || t.userEmail === userEmail));
      };
      req.onerror = () => reject(req.error);
    });
  }

  async deleteOfflineTrack(songId: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('offline_tracks', 'readwrite');
      const store = tx.objectStore('offline_tracks');
      const req = store.delete(songId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async clearAllOfflineTracks(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('offline_tracks', 'readwrite');
      const store = tx.objectStore('offline_tracks');
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // --- API CACHING LAYER ---
  async getCachedApi<T>(key: string, maxAgeMs: number = 1000 * 60 * 60 * 24): Promise<T | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const tx = db.transaction('cached_api', 'readonly');
        const store = tx.objectStore('cached_api');
        const req = store.get(key);
        req.onsuccess = () => {
          if (!req.result) return resolve(null);
          const { data, timestamp } = req.result;
          if (Date.now() - timestamp > maxAgeMs) {
            resolve(null);
          } else {
            resolve(data as T);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  async setCachedApi<T>(key: string, data: T): Promise<void> {
    try {
      const db = await this.getDB();
      new Promise<void>((resolve) => {
        const tx = db.transaction('cached_api', 'readwrite');
        const store = tx.objectStore('cached_api');
        store.put({ key, data, timestamp: Date.now() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      // Ignore cache write errors
    }
  }

  async searchCachedSongs(queryText: string, limit: number = 15): Promise<Song[]> {
    const q = queryText.trim().toLowerCase();
    if (!q) return [];
    try {
      const db = await this.getDB();
      const [cachedEntries, offlineRows] = await Promise.all([
        new Promise<Array<{ key: string; data: unknown }>>((resolve) => {
          const tx = db.transaction('cached_api', 'readonly');
          const req = tx.objectStore('cached_api').getAll();
          req.onsuccess = () => resolve((req.result as Array<{ key: string; data: unknown }>) || []);
          req.onerror = () => resolve([]);
        }),
        new Promise<DownloadedTrack[]>((resolve) => {
          const tx = db.transaction('offline_tracks', 'readonly');
          const req = tx.objectStore('offline_tracks').getAll();
          req.onsuccess = () => resolve((req.result as DownloadedTrack[]) || []);
          req.onerror = () => resolve([]);
        }),
      ]);

      const seen = new Set<string>();
      const matches: Song[] = [];

      const checkAndAdd = (s: Song) => {
        if (!s || !s.id || seen.has(s.id)) return;
        const name = (s.name || '').toLowerCase();
        const artists = (s.artists?.primary?.map((a) => a.name).join(' ') || '').toLowerCase();
        const album = (s.album?.name || '').toLowerCase();
        if (name.includes(q) || artists.includes(q) || album.includes(q)) {
          seen.add(s.id);
          matches.push(s);
        }
      };

      for (const item of offlineRows) {
        if (item.song) checkAndAdd(item.song);
      }

      for (const entry of cachedEntries) {
        if (Array.isArray(entry.data)) {
          for (const item of entry.data) {
            if (item && typeof item === 'object' && 'songs' in item && Array.isArray((item as { songs: Song[] }).songs)) {
              for (const s of (item as { songs: Song[] }).songs) checkAndAdd(s);
            } else if (item && typeof item === 'object' && 'downloadUrl' in item) {
              checkAndAdd(item as Song);
            }
          }
        }
      }

      return matches.slice(0, limit);
    } catch {
      return [];
    }
  }

  // --- USER PROFILES ---
  async getProfile(email: string): Promise<UserProfile | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('user_profiles', 'readonly');
      const store = tx.objectStore('user_profiles');
      const req = store.get(email);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async saveProfile(profile: UserProfile): Promise<UserProfile> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('user_profiles', 'readwrite');
      const store = tx.objectStore('user_profiles');
      const req = store.put(profile);
      req.onsuccess = () => resolve(profile);
      req.onerror = () => reject(req.error);
    });
  }

  async getAllProfiles(): Promise<UserProfile[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('user_profiles', 'readonly');
      const store = tx.objectStore('user_profiles');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async deleteProfile(email: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('user_profiles', 'readwrite');
      const store = tx.objectStore('user_profiles');
      const req = store.delete(email);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // --- PLAYLISTS ---
  async getUserPlaylists(userEmail: string): Promise<Playlist[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('user_playlists', 'readonly');
      const store = tx.objectStore('user_playlists');
      const req = store.getAll();
      req.onsuccess = () => {
        const all = req.result as Playlist[];
        resolve(all.filter((p) => p.userEmail === userEmail));
      };
      req.onerror = () => reject(req.error);
    });
  }

  async savePlaylist(playlist: Playlist): Promise<Playlist> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('user_playlists', 'readwrite');
      const store = tx.objectStore('user_playlists');
      const req = store.put(playlist);
      req.onsuccess = () => resolve(playlist);
      req.onerror = () => reject(req.error);
    });
  }

  async deletePlaylist(playlistId: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('user_playlists', 'readwrite');
      const store = tx.objectStore('user_playlists');
      const req = store.delete(playlistId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // --- FAVORITES / LIKED SONGS ---
  async getLikedSongs(userEmail: string): Promise<Song[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('user_favorites', 'readonly');
      const store = tx.objectStore('user_favorites');
      const req = store.getAll();
      req.onsuccess = () => {
        const items = req.result as Array<{ userEmail: string; song: Song; likedAt: number }>;
        const filtered = items
          .filter((i) => i.userEmail === userEmail)
          .sort((a, b) => b.likedAt - a.likedAt)
          .map((i) => i.song);
        resolve(filtered);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async isLiked(userEmail: string, songId: string): Promise<boolean> {
    const db = await this.getDB();
    const key = `${userEmail}__${songId}`;
    return new Promise((resolve) => {
      const tx = db.transaction('user_favorites', 'readonly');
      const store = tx.objectStore('user_favorites');
      const req = store.get(key);
      req.onsuccess = () => resolve(!!req.result);
      req.onerror = () => resolve(false);
    });
  }

  async toggleLikedSong(userEmail: string, song: Song): Promise<boolean> {
    const db = await this.getDB();
    const key = `${userEmail}__${song.id}`;
    const currentlyLiked = await this.isLiked(userEmail, song.id);

    return new Promise((resolve, reject) => {
      const tx = db.transaction('user_favorites', 'readwrite');
      const store = tx.objectStore('user_favorites');
      if (currentlyLiked) {
        const req = store.delete(key);
        req.onsuccess = () => resolve(false);
        req.onerror = () => reject(req.error);
      } else {
        const req = store.put({
          user_song_key: key,
          userEmail,
          song,
          likedAt: Date.now(),
        });
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      }
    });
  }

  // --- PLAYBACK HISTORY ---
  async addToHistory(userEmail: string, song: Song): Promise<void> {
    const db = await this.getDB();
    const key = `${userEmail}__${song.id}`;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('user_history', 'readwrite');
      const store = tx.objectStore('user_history');
      const req = store.put({
        user_song_key: key,
        userEmail,
        song,
        playedAt: Date.now(),
      });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getHistory(userEmail: string, limit: number = 30): Promise<Song[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('user_history', 'readonly');
      const store = tx.objectStore('user_history');
      const req = store.getAll();
      req.onsuccess = () => {
        const items = req.result as Array<{ userEmail: string; song: Song; playedAt: number }>;
        const sorted = items
          .filter((i) => i.userEmail === userEmail)
          .sort((a, b) => b.playedAt - a.playedAt)
          .slice(0, limit)
          .map((i) => i.song);
        resolve(sorted);
      };
      req.onerror = () => reject(req.error);
    });
  }
}

export const localDB = new LocalDatabase();
