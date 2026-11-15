import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { AudioQuality, DownloadedTrack, Playlist, Song, SoundProfile, UserProfile } from '../types/music';
import { localDB } from '../services/db';
import { musicAPI } from '../services/api';
import { resolveBestStreamUrl } from '../utils/audioCore';
import { audioEngine } from '../services/audioEngine';
import {
  onCloudAuthChange,
  signInWithGoogleCloud,
  signOutCloud,
  ensureCloudUserProfile,
  subscribeCloudLibrary,
  syncCreateCloudPlaylist,
  syncUpdateCloudPlaylistDetails,
  syncUpdateCloudPlaylistSongs,
  syncDeleteCloudPlaylist,
  syncCloudLikeSong,
  syncCloudUnlikeSong,
  updateCloudUserPreferences,
  sanitizeFirestoreId,
} from '../services/firebase';

interface UserContextType {
  activeEmail: string;
  isLoggedIn: boolean;
  isCloudSynced: boolean;
  cloudAuthLoading: boolean;
  cloudError: string | null;
  profile: UserProfile | null;
  profilesList: UserProfile[];
  likedSongs: Song[];
  playlists: Playlist[];
  offlineTracks: DownloadedTrack[];
  history: Song[];
  isOfflineModeOnly: boolean;
  downloadingSongIds: Record<string, number>;

  // Authentication Actions
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (email: string, password: string, name: string) => Promise<{ success: boolean; error?: string }>;
  loginWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  switchUser: (email: string, name?: string) => Promise<void>;

  // Library & Player Settings Actions
  updatePreferredQuality: (quality: AudioQuality) => Promise<void>;
  updateSoundProfile: (soundProfile: SoundProfile) => Promise<void>;
  updateAutoResume: (enabled: boolean) => Promise<void>;
  toggleLiked: (song: Song) => Promise<boolean>;
  isLiked: (songId: string) => boolean;
  createPlaylist: (name: string, description?: string, coverColor?: string, coverUrl?: string) => Promise<Playlist>;
  createPlaylistWithSongs: (
    name: string,
    songs: Song[],
    description?: string,
    coverColor?: string,
    coverUrl?: string
  ) => Promise<Playlist>;
  updatePlaylist: (
    playlistId: string,
    updates: { name: string; description?: string; coverColor?: string; coverUrl?: string }
  ) => Promise<Playlist | null>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  addSongToPlaylist: (playlistId: string, song: Song) => Promise<void>;
  removeSongFromPlaylist: (playlistId: string, songId: string) => Promise<void>;
  downloadSongForOffline: (song: Song) => Promise<void>;
  deleteOfflineTrack: (songId: string) => Promise<void>;
  clearAllDownloads: () => Promise<void>;
  toggleOfflineModeOnly: () => void;
  refreshUserData: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const DEMO_ACCOUNTS = [
  {
    email: 'aditya.patil.tech@gmail.com',
    password: 'password123',
    name: 'Aditya Patil',
    role: 'Primary Account',
    color: 'from-violet-600 to-indigo-600',
  },
  {
    email: 'sarah.beats@tunely.fm',
    password: 'password123',
    name: 'Sarah Beats',
    role: 'Indie & Chill',
    color: 'from-emerald-600 to-teal-700',
  },
  {
    email: 'rockstar@groove.com',
    password: 'password123',
    name: 'Devon Lane',
    role: 'High Energy & Rock',
    color: 'from-amber-600 to-rose-700',
  },
];

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeEmail, setActiveEmail] = useState<string>(() => {
    return localStorage.getItem('tunely_active_email') || DEMO_ACCOUNTS[0].email;
  });
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    return localStorage.getItem('tunely_is_logged_in') !== 'false';
  });
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [cloudAuthLoading, setCloudAuthLoading] = useState<boolean>(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profilesList, setProfilesList] = useState<UserProfile[]>([]);
  const [likedSongs, setLikedSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [offlineTracks, setOfflineTracks] = useState<DownloadedTrack[]>([]);
  const [history, setHistory] = useState<Song[]>([]);
  const [isOfflineModeOnly, setIsOfflineModeOnly] = useState<boolean>(false);
  const [downloadingSongIds, setDownloadingSongIds] = useState<Record<string, number>>({});

  const cloudUnsubRef = useRef<(() => void) | null>(null);
  const mergedCloudUidRef = useRef<string | null>(null);
  const activeEmailRef = useRef<string>(activeEmail);
  const isLoggedInRef = useRef<boolean>(isLoggedIn);

  useEffect(() => {
    activeEmailRef.current = activeEmail;
    isLoggedInRef.current = isLoggedIn;
  }, [activeEmail, isLoggedIn]);

  // Seed demo accounts on initial run if database has no profiles
  const seedDemoAccountsIfEmpty = useCallback(async () => {
    const existing = await localDB.getAllProfiles();
    if (existing.length === 0) {
      for (const demo of DEMO_ACCOUNTS) {
        const prof: UserProfile = {
          email: demo.email,
          name: demo.name,
          password: demo.password,
          avatarColor: demo.color,
          createdAt: Date.now(),
          lastActive: Date.now(),
          preferredQuality: '320kbps',
          autoResumeOnInterruption: true,
          soundProfile: 'studio',
        };
        await localDB.saveProfile(prof);

        await localDB.savePlaylist({
          id: `pl_seed_${demo.email.replace(/[^\w]/g, '_')}`,
          name: `${demo.name}'s Favorites`,
          description: `Personalized playlist for ${demo.role}`,
          coverColor: demo.color,
          createdAt: Date.now(),
          songs: [],
          userEmail: demo.email,
        });
      }
    }
  }, []);

  const refreshUserData = useCallback(async () => {
    await seedDemoAccountsIfEmpty();

    if (!activeEmail || !isLoggedIn) {
      setProfile(null);
      setLikedSongs([]);
      setPlaylists([]);
      setOfflineTracks([]);
      setHistory([]);
      const allProfiles = await localDB.getAllProfiles();
      setProfilesList(allProfiles);
      return;
    }

    let prof = await localDB.getProfile(activeEmail);
    if (!prof) {
      const defaultName = activeEmail.split('@')[0].replace(/[._]/g, ' ') || 'Tunely Listener';
      prof = {
        email: activeEmail,
        name: defaultName.charAt(0).toUpperCase() + defaultName.slice(1),
        password: 'password123',
        createdAt: Date.now(),
        lastActive: Date.now(),
        preferredQuality: '320kbps',
        autoResumeOnInterruption: true,
        soundProfile: 'studio',
      };
      await localDB.saveProfile(prof);
    } else {
      prof.lastActive = Date.now();
      await localDB.saveProfile(prof);
    }
    setProfile(prof);
    audioEngine.setPreferredQuality(prof.preferredQuality);
    audioEngine.setAutoResume(prof.autoResumeOnInterruption);
    const hydratedProfile = prof.soundProfile || 'studio';
    if (audioEngine.getSoundProfile() !== hydratedProfile) {
      audioEngine.setSoundProfile(hydratedProfile);
    }

    const allProfiles = await localDB.getAllProfiles();
    setProfilesList(allProfiles);

    const likes = await localDB.getLikedSongs(activeEmail);
    setLikedSongs(likes);

    let userPlaylists = await localDB.getUserPlaylists(activeEmail);
    if (userPlaylists.length === 0) {
      const defaultPlaylist: Playlist = {
        id: `pl_${Date.now()}`,
        name: `${prof.name}'s Mix`,
        description: 'Personalized favorite tracks and daily repeats',
        coverColor: 'from-violet-600 to-indigo-700',
        createdAt: Date.now(),
        songs: [],
        userEmail: activeEmail,
      };
      await localDB.savePlaylist(defaultPlaylist);
      userPlaylists = [defaultPlaylist];
    }
    setPlaylists(userPlaylists);

    const downloads = await localDB.getAllOfflineTracks(activeEmail);
    setOfflineTracks(downloads);

    const hist = await localDB.getHistory(activeEmail, 30);
    setHistory(hist);
  }, [activeEmail, isLoggedIn, seedDemoAccountsIfEmpty]);

  useEffect(() => {
    localStorage.setItem('tunely_active_email', activeEmail);
    localStorage.setItem('tunely_is_logged_in', isLoggedIn ? 'true' : 'false');
    refreshUserData();
  }, [activeEmail, isLoggedIn, refreshUserData]);

  // Real-time Firebase Auth & Firestore Cloud Sync listener
  useEffect(() => {
    const unsubAuth = onCloudAuthChange(async (fbUser) => {
      if (cloudUnsubRef.current) {
        cloudUnsubRef.current();
        cloudUnsubRef.current = null;
      }

      setFirebaseUser(fbUser);
      setCloudError(null);

      if (!fbUser) {
        mergedCloudUidRef.current = null;
        return;
      }

      const cloudEmail = (fbUser.email || `${fbUser.uid}@tunely.app`).toLowerCase();

      // If switching from another logged-in identity, halt active playback immediately
      if (activeEmailRef.current !== cloudEmail || !isLoggedInRef.current) {
        audioEngine.resetForAccountSwitch();
      }

      try {
        const existingProf = await localDB.getProfile(cloudEmail);
        const cloudPrefs = await ensureCloudUserProfile(fbUser, {
          preferredQuality: existingProf?.preferredQuality || '320kbps',
          autoResumeOnInterruption: existingProf?.autoResumeOnInterruption ?? true,
          soundProfile: existingProf?.soundProfile || 'studio',
          avatarColor: existingProf?.avatarColor || 'from-violet-600 to-indigo-600',
        });

        const updatedProf: UserProfile = {
          email: cloudEmail,
          name: fbUser.displayName || existingProf?.name || cloudEmail.split('@')[0],
          avatarUrl: fbUser.photoURL || existingProf?.avatarUrl,
          avatarColor: cloudPrefs.avatarColor || 'from-violet-600 to-indigo-600',
          createdAt: existingProf?.createdAt || Date.now(),
          lastActive: Date.now(),
          preferredQuality: cloudPrefs.preferredQuality,
          autoResumeOnInterruption: cloudPrefs.autoResumeOnInterruption,
          soundProfile: cloudPrefs.soundProfile || 'studio',
        };
        await localDB.saveProfile(updatedProf);

        setActiveEmail(cloudEmail);
        setIsLoggedIn(true);
        setProfile(updatedProf);
        audioEngine.setPreferredQuality(updatedProf.preferredQuality);
        audioEngine.setAutoResume(updatedProf.autoResumeOnInterruption);
        const syncedProfile = updatedProf.soundProfile || 'studio';
        if (audioEngine.getSoundProfile() !== syncedProfile) {
          audioEngine.setSoundProfile(syncedProfile);
        }

        const preLocalPlaylists = await localDB.getUserPlaylists(cloudEmail);
        const preLocalLikes = await localDB.getLikedSongs(cloudEmail);

        cloudUnsubRef.current = subscribeCloudLibrary(
          fbUser.uid,
          cloudEmail,
          async (cloudPlaylists) => {
            if (mergedCloudUidRef.current !== fbUser.uid) {
              mergedCloudUidRef.current = fbUser.uid;
              if (cloudPlaylists.length === 0 && preLocalPlaylists.length > 0) {
                for (const lp of preLocalPlaylists) {
                  await syncCreateCloudPlaylist(fbUser.uid, lp).catch(() => {});
                }
                return;
              }
            }

            if (cloudPlaylists.length === 0) {
              const starter: Playlist = {
                id: `pl_cloud_${sanitizeFirestoreId(fbUser.uid).slice(0, 8)}`,
                name: `${updatedProf.name}'s Mix`,
                description: 'Synced across all your devices',
                coverColor: updatedProf.avatarColor || 'from-violet-600 to-indigo-700',
                createdAt: Date.now(),
                songs: [],
                userEmail: cloudEmail,
              };
              await localDB.savePlaylist(starter);
              setPlaylists([starter]);
              syncCreateCloudPlaylist(fbUser.uid, starter).catch(() => {});
            } else {
              for (const cp of cloudPlaylists) {
                await localDB.savePlaylist(cp);
              }
              setPlaylists(cloudPlaylists);
            }
          },
          async (cloudLikes) => {
            if (cloudLikes.length === 0 && preLocalLikes.length > 0) {
              for (const ls of preLocalLikes) {
                await syncCloudLikeSong(fbUser.uid, ls).catch(() => {});
              }
              setLikedSongs(preLocalLikes);
              return;
            }
            setLikedSongs(cloudLikes);
          }
        );
      } catch (err) {
        console.warn('[Tunely Cloud Sync] Sync initialization error:', err);
        setCloudError('Cloud sync paused — local library remains active.');
      }
    });

    return () => {
      unsubAuth();
      if (cloudUnsubRef.current) {
        cloudUnsubRef.current();
        cloudUnsubRef.current = null;
      }
    };
  }, []);

  const loginWithGoogle = async (): Promise<{ success: boolean; error?: string }> => {
    setCloudAuthLoading(true);
    setCloudError(null);
    try {
      await signInWithGoogleCloud();
      return { success: true };
    } catch (err: any) {
      const msg = err?.code === 'auth/popup-closed-by-user'
        ? 'Google sign-in popup was closed before completing.'
        : err?.message || 'Google sign-in failed. Please try again.';
      setCloudError(msg);
      return { success: false, error: msg };
    } finally {
      setCloudAuthLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password.trim()) {
      return { success: false, error: 'Email and password are required.' };
    }

    const existing = await localDB.getProfile(cleanEmail);
    if (!existing) {
      return { success: false, error: 'Account not found. Please click Create Account or Continue with Google.' };
    }

    if (existing.password && existing.password !== password.trim()) {
      return { success: false, error: 'Incorrect password. Please try again.' };
    }

    if (cleanEmail !== activeEmail || !isLoggedIn) {
      audioEngine.resetForAccountSwitch();
    }

    if (firebaseUser) {
      await signOutCloud().catch(() => {});
    }

    setActiveEmail(cleanEmail);
    setIsLoggedIn(true);
    return { success: true };
  };

  const signup = async (email: string, password: string, name: string): Promise<{ success: boolean; error?: string }> => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password.trim()) {
      return { success: false, error: 'Email and password are required.' };
    }

    const existing = await localDB.getProfile(cleanEmail);
    if (existing) {
      return { success: false, error: 'An account with this email already exists. Please log in.' };
    }

    audioEngine.resetForAccountSwitch();

    if (firebaseUser) {
      await signOutCloud().catch(() => {});
    }

    const colors = [
      'from-violet-600 to-indigo-600',
      'from-rose-600 to-pink-600',
      'from-emerald-600 to-teal-700',
      'from-amber-600 to-orange-700',
      'from-blue-600 to-cyan-700',
    ];
    const pickedColor = colors[Math.floor(Math.random() * colors.length)];

    const newProfile: UserProfile = {
      email: cleanEmail,
      name: name.trim() || cleanEmail.split('@')[0],
      password: password.trim(),
      avatarColor: pickedColor,
      createdAt: Date.now(),
      lastActive: Date.now(),
      preferredQuality: '320kbps',
      autoResumeOnInterruption: true,
      soundProfile: 'studio',
    };
    await localDB.saveProfile(newProfile);

    await localDB.savePlaylist({
      id: `pl_${Date.now()}`,
      name: `${newProfile.name}'s Heavy Rotation`,
      description: 'Personalized favorite tracks and daily repeats',
      coverColor: pickedColor,
      createdAt: Date.now(),
      songs: [],
      userEmail: cleanEmail,
    });

    setActiveEmail(cleanEmail);
    setIsLoggedIn(true);
    return { success: true };
  };

  const logout = async () => {
    audioEngine.resetForAccountSwitch();
    if (firebaseUser) {
      await signOutCloud().catch(() => {});
    }
    setIsLoggedIn(false);
    localStorage.setItem('tunely_is_logged_in', 'false');
  };

  const switchUser = async (email: string, name?: string) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return;

    if (cleanEmail === activeEmail && isLoggedIn) {
      return;
    }

    // Stop previous account's playing music and clear its queue immediately
    audioEngine.resetForAccountSwitch();

    if (firebaseUser && firebaseUser.email?.toLowerCase() !== cleanEmail) {
      await signOutCloud().catch(() => {});
    }

    let existing = await localDB.getProfile(cleanEmail);
    if (!existing) {
      existing = {
        email: cleanEmail,
        name: name || cleanEmail.split('@')[0] || 'Listener',
        password: 'password123',
        createdAt: Date.now(),
        lastActive: Date.now(),
        preferredQuality: '320kbps',
        autoResumeOnInterruption: true,
        soundProfile: 'studio',
      };
      await localDB.saveProfile(existing);
    }

    setActiveEmail(cleanEmail);
    setIsLoggedIn(true);
  };

  const updatePreferredQuality = async (quality: AudioQuality) => {
    audioEngine.setPreferredQuality(quality);
    if (!profile) return;
    const updated = { ...profile, preferredQuality: quality };
    await localDB.saveProfile(updated);
    setProfile(updated);

    if (firebaseUser) {
      updateCloudUserPreferences(firebaseUser.uid, { preferredQuality: quality }).catch(() => {});
    }
  };

  const updateSoundProfile = async (soundProfile: SoundProfile) => {
    audioEngine.setSoundProfile(soundProfile);
    if (!profile) return;
    const updated = { ...profile, soundProfile };
    await localDB.saveProfile(updated);
    setProfile(updated);

    if (firebaseUser) {
      updateCloudUserPreferences(firebaseUser.uid, { soundProfile }).catch(() => {});
    }
  };

  const updateAutoResume = async (enabled: boolean) => {
    audioEngine.setAutoResume(enabled);
    if (!profile) return;
    const updated = { ...profile, autoResumeOnInterruption: enabled };
    await localDB.saveProfile(updated);
    setProfile(updated);

    if (firebaseUser) {
      updateCloudUserPreferences(firebaseUser.uid, { autoResumeOnInterruption: enabled }).catch(() => {});
    }
  };

  const toggleLiked = async (song: Song) => {
    const isNowLiked = await localDB.toggleLikedSong(activeEmail, song);
    const updated = await localDB.getLikedSongs(activeEmail);
    setLikedSongs(updated);

    if (firebaseUser) {
      if (isNowLiked) {
        syncCloudLikeSong(firebaseUser.uid, song).catch((e) => console.warn('[Cloud Like Error]', e));
      } else {
        syncCloudUnlikeSong(firebaseUser.uid, song.id).catch((e) => console.warn('[Cloud Unlike Error]', e));
      }
    }
    return isNowLiked;
  };

  const isLiked = (songId: string) => {
    return likedSongs.some((s) => s.id === songId);
  };

  const createPlaylist = async (
    name: string,
    description?: string,
    coverColor?: string,
    coverUrl?: string
  ) => {
    return createPlaylistWithSongs(name, [], description, coverColor, coverUrl);
  };

  const createPlaylistWithSongs = async (
    name: string,
    songs: Song[],
    description?: string,
    coverColor?: string,
    coverUrl?: string
  ) => {
    const colors = [
      'from-rose-500 to-red-700',
      'from-amber-500 to-orange-700',
      'from-emerald-500 to-teal-700',
      'from-cyan-500 to-blue-700',
      'from-violet-500 to-purple-800',
      'from-fuchsia-500 to-pink-700',
    ];
    const pickedColor = coverColor || colors[Math.floor(Math.random() * colors.length)];

    // Deduplicate imported songs while keeping order
    const seen = new Set<string>();
    const uniqueSongs: Song[] = [];
    for (const s of songs) {
      if (s?.id && !seen.has(s.id)) {
        seen.add(s.id);
        uniqueSongs.push(s);
      }
    }

    const cleanCoverUrl = coverUrl?.trim() ? coverUrl.trim() : undefined;

    const newPlaylist: Playlist = {
      id: `pl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim() || 'Imported Playlist',
      description: description?.trim() || '',
      coverColor: pickedColor,
      coverUrl: cleanCoverUrl,
      createdAt: Date.now(),
      songs: uniqueSongs,
      userEmail: activeEmail,
    };

    await localDB.savePlaylist(newPlaylist);
    setPlaylists((prev) => [newPlaylist, ...prev]);

    if (firebaseUser) {
      syncCreateCloudPlaylist(firebaseUser.uid, newPlaylist).catch((e) =>
        console.warn('[Cloud Playlist Error]', e)
      );
    }
    return newPlaylist;
  };

  const updatePlaylist = async (
    playlistId: string,
    updates: { name: string; description?: string; coverColor?: string; coverUrl?: string }
  ): Promise<Playlist | null> => {
    const existing = playlists.find((p) => p.id === playlistId);
    if (!existing) return null;

    const nextName = updates.name.trim() || existing.name;
    const nextDescription =
      updates.description !== undefined ? updates.description.trim() : existing.description || '';
    const nextColor = updates.coverColor || existing.coverColor || 'from-violet-600 to-indigo-700';
    const nextCoverUrl =
      updates.coverUrl !== undefined
        ? updates.coverUrl.trim() || undefined
        : existing.coverUrl;

    const updated: Playlist = {
      ...existing,
      name: nextName,
      description: nextDescription,
      coverColor: nextColor,
      coverUrl: nextCoverUrl,
    };

    await localDB.savePlaylist(updated);
    setPlaylists((prev) => prev.map((p) => (p.id === playlistId ? updated : p)));

    if (firebaseUser) {
      syncUpdateCloudPlaylistDetails(firebaseUser.uid, updated).catch((e) =>
        console.warn('[Cloud Playlist Rename Error]', e)
      );
    }
    return updated;
  };

  const deletePlaylist = async (playlistId: string) => {
    await localDB.deletePlaylist(playlistId);
    setPlaylists((prev) => prev.filter((p) => p.id !== playlistId));

    if (firebaseUser) {
      syncDeleteCloudPlaylist(firebaseUser.uid, playlistId).catch((e) => console.warn('[Cloud Delete Error]', e));
    }
  };

  const addSongToPlaylist = async (playlistId: string, song: Song) => {
    const pl = playlists.find((p) => p.id === playlistId);
    if (!pl) return;
    if (pl.songs.some((s) => s.id === song.id)) return;

    const updated: Playlist = {
      ...pl,
      songs: [...pl.songs, song],
    };
    await localDB.savePlaylist(updated);
    setPlaylists((prev) => prev.map((p) => (p.id === playlistId ? updated : p)));

    if (firebaseUser) {
      syncUpdateCloudPlaylistSongs(firebaseUser.uid, updated).catch((e) => console.warn('[Cloud Update Error]', e));
    }
  };

  const removeSongFromPlaylist = async (playlistId: string, songId: string) => {
    const pl = playlists.find((p) => p.id === playlistId);
    if (!pl) return;

    const updated: Playlist = {
      ...pl,
      songs: pl.songs.filter((s) => s.id !== songId),
    };
    await localDB.savePlaylist(updated);
    setPlaylists((prev) => prev.map((p) => (p.id === playlistId ? updated : p)));

    if (firebaseUser) {
      syncUpdateCloudPlaylistSongs(firebaseUser.uid, updated).catch((e) => console.warn('[Cloud Remove Error]', e));
    }
  };

  const downloadSongForOffline = async (song: Song) => {
    if (downloadingSongIds[song.id] !== undefined) return;

    setDownloadingSongIds((prev) => ({ ...prev, [song.id]: 0 }));

    try {
      const preferred = profile?.preferredQuality || '320kbps';
      let targetSong = song;
      const hasPreferred = song.downloadUrl?.some((u) => u.quality === preferred && u.url);
      if (!hasPreferred || !song.downloadUrl || song.downloadUrl.length === 0) {
        const fresh = await musicAPI.getSongDetails(song.id).catch(() => null);
        if (fresh && fresh.downloadUrl && fresh.downloadUrl.length > 0) {
          targetSong = { ...song, downloadUrl: fresh.downloadUrl };
        }
      }

      const streamUrl = resolveBestStreamUrl(targetSong, preferred);
      if (!streamUrl) throw new Error('No valid audio stream URL available');

      const blob = await musicAPI.downloadSongAudioBlob(streamUrl, (pct) => {
        setDownloadingSongIds((prev) => ({ ...prev, [song.id]: pct }));
      });

      const downloaded = await localDB.saveOfflineTrack(targetSong, blob, preferred, activeEmail);
      audioEngine.markOfflineTrack(song.id, true);
      setOfflineTracks((prev) => [downloaded, ...prev.filter((t) => t.id !== song.id)]);
    } catch (err) {
      console.error('[Tunely] Offline track download error:', err);
    } finally {
      setDownloadingSongIds((prev) => {
        const copy = { ...prev };
        delete copy[song.id];
        return copy;
      });
    }
  };

  const deleteOfflineTrack = async (songId: string) => {
    await localDB.deleteOfflineTrack(songId);
    audioEngine.markOfflineTrack(songId, false);
    setOfflineTracks((prev) => prev.filter((t) => t.id !== songId));
  };

  const clearAllDownloads = async () => {
    await localDB.clearAllOfflineTracks();
    audioEngine.refreshOfflineCacheIndex().catch(() => {});
    setOfflineTracks([]);
  };

  const toggleOfflineModeOnly = () => {
    setIsOfflineModeOnly((prev) => !prev);
  };

  return (
    <UserContext.Provider
      value={{
        activeEmail,
        isLoggedIn,
        isCloudSynced: !!firebaseUser,
        cloudAuthLoading,
        cloudError,
        profile,
        profilesList,
        likedSongs,
        playlists,
        offlineTracks,
        history,
        isOfflineModeOnly,
        downloadingSongIds,
        login,
        signup,
        loginWithGoogle,
        logout,
        switchUser,
        updatePreferredQuality,
        updateSoundProfile,
        updateAutoResume,
        toggleLiked,
        isLiked,
        createPlaylist,
        createPlaylistWithSongs,
        updatePlaylist,
        deletePlaylist,
        addSongToPlaylist,
        removeSongFromPlaylist,
        downloadSongForOffline,
        deleteOfflineTrack,
        clearAllDownloads,
        toggleOfflineModeOnly,
        refreshUserData,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
}
