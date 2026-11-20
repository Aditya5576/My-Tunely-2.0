import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { AudioQuality, DownloadedTrack, Playlist, Song, SoundProfile, UserProfile } from '../types/music';
import { localDB } from '../services/db';
import { musicAPI } from '../services/api';
import { resolveBestStreamUrl, sanitizePlaylistImportTracks } from '../utils/audioCore';
import { audioEngine } from '../services/audioEngine';
import {
  auth,
  onCloudAuthChange,
  signInWithGoogleCloud,
  signOutCloud,
  ensureCloudUserProfile,
  subscribeCloudLibrary,
  syncCreateCloudPlaylist,
  recoverCloudPlaylist,
  syncUpdateCloudPlaylistDetails,
  syncUpdateCloudPlaylistSongs,
  syncDeleteCloudPlaylist,
  syncCloudLikeSong,
  syncCloudUnlikeSong,
  updateCloudUserPreferences,
  checkRedirectAuthResult,
} from '../services/firebase';
import {
  canGuestModifyLibrary,
  canGuestPlay,
  canGuestSearch,
  GuestUsage,
  incrementGuestSearch,
  loadGuestUsage,
  mergeCloudAndLocalLikes,
  mergeCloudAndLocalPlaylists,
  preferLocalPlaylistSongs,
  withPlaylistSongs,
  recordGuestPlayback,
  recordGuestTrackFinished,
  resetGuestUsage,
  saveGuestUsage,
  formatFirebaseAuthError,
  formatFirestoreSyncError,
} from '../utils/guestLimits';

export type AuthState = 'loading' | 'authenticated' | 'guest' | 'unauthenticated';

interface UserContextType {
  activeEmail: string;
  authState: AuthState;
  isGuest: boolean;
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
  guestUsage: GuestUsage;

  // Gate Management
  isLoginGateOpen: boolean;
  loginGateReason: string | null;
  openLoginGate: (reason?: string) => void;
  closeLoginGate: () => void;
  continueAsGuest: () => void;

  // Authentication Actions
  loginWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  manualSyncCloudNow: () => Promise<void>;

  // Guest Quota Helpers
  checkGuestSearchAllowed: () => boolean;
  recordGuestSearch: () => void;
  checkGuestPlaybackAllowed: () => boolean;
  recordGuestPlaybackSeconds: (seconds: number) => void;
  recordGuestTrackFinished: () => void;

  // Library Actions
  updatePreferredQuality: (quality: AudioQuality) => Promise<void>;
  updateSoundProfile: (soundProfile: SoundProfile) => Promise<void>;
  updateAutoResume: (enabled: boolean) => Promise<void>;
  toggleLiked: (song: Song) => Promise<boolean>;
  isLiked: (songId: string) => boolean;
  createPlaylist: (name: string, description?: string, coverColor?: string, coverUrl?: string) => Promise<Playlist | null>;
  createPlaylistWithSongs: (
    name: string,
    songs: Song[],
    description?: string,
    coverColor?: string,
    coverUrl?: string
  ) => Promise<Playlist | null>;
  updatePlaylist: (
    playlistId: string,
    updates: { name: string; description?: string; coverColor?: string; coverUrl?: string }
  ) => Promise<Playlist | null>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  addSongToPlaylist: (playlistId: string, song: Song) => Promise<{ success: boolean; synced: boolean; error?: string }>;
  removeSongFromPlaylist: (playlistId: string, songId: string) => Promise<{ success: boolean; synced: boolean; error?: string }>;
  reorderPlaylistSongs: (playlistId: string, songId: string, direction: -1 | 1) => Promise<{ success: boolean; synced: boolean; error?: string }>;
  downloadSongForOffline: (song: Song) => Promise<void>;
  deleteOfflineTrack: (songId: string) => Promise<void>;
  clearAllDownloads: () => Promise<void>;
  toggleOfflineModeOnly: () => void;
  refreshUserData: () => Promise<void>;
  isCloudSyncing: boolean;
  pendingPlaylistSyncIds: Set<string>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [activeEmail, setActiveEmail] = useState<string>('');
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [cloudAuthLoading, setCloudAuthLoading] = useState<boolean>(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [likedSongs, setLikedSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [offlineTracks, setOfflineTracks] = useState<DownloadedTrack[]>([]);
  const [history, setHistory] = useState<Song[]>([]);
  const [isOfflineModeOnly, setIsOfflineModeOnly] = useState<boolean>(false);
  const [downloadingSongIds, setDownloadingSongIds] = useState<Record<string, number>>({});
  const [guestUsage, setGuestUsage] = useState<GuestUsage>(() => loadGuestUsage());
  const [pendingPlaylistSyncIds, setPendingPlaylistSyncIds] = useState<Set<string>>(new Set());

  const [isLoginGateOpen, setIsLoginGateOpen] = useState<boolean>(false);
  const [loginGateReason, setLoginGateReason] = useState<string | null>(null);

  const playlistQueue = useRef<Promise<void>>(Promise.resolve());
  const queuePlaylistWork = useCallback(<T,>(work: () => Promise<T>): Promise<T> => {
    const next = playlistQueue.current.then(work);
    playlistQueue.current = next.then(() => {}, () => {});
    return next;
  }, []);
  const reportPlaylistSyncError = (uid: string, error?: unknown): void => {
    if (auth.currentUser?.uid === uid) {
      setCloudError(formatFirestoreSyncError(error));
    }
  };
  const cloudUnsubRef = useRef<(() => void) | null>(null);
  const activeEmailRef = useRef<string>(activeEmail);
  const authStateRef = useRef<AuthState>(authState);

  useEffect(() => {
    activeEmailRef.current = activeEmail;
    authStateRef.current = authState;
  }, [activeEmail, authState]);

  const isGuest = authState === 'guest';
  const isLoggedIn = authState === 'authenticated';
  const isCloudSynced = !!firebaseUser && authState === 'authenticated';

  const openLoginGate = useCallback((reason?: string) => {
    setLoginGateReason(reason || null);
    setIsLoginGateOpen(true);
  }, []);

  const closeLoginGate = useCallback(() => {
    setIsLoginGateOpen(false);
    setLoginGateReason(null);
  }, []);

  const continueAsGuest = useCallback(() => {
    setAuthState('guest');
    setActiveEmail('guest@tunely.local');
    localStorage.setItem('tunely_guest_mode', 'true');
    localStorage.setItem('tunely_auth_state', 'guest');
    closeLoginGate();

    const guestProfile: UserProfile = {
      email: 'guest@tunely.local',
      name: 'Guest Listener',
      avatarColor: 'from-slate-600 to-slate-700',
      createdAt: Date.now(),
      lastActive: Date.now(),
      preferredQuality: '320kbps',
      autoResumeOnInterruption: true,
      soundProfile: 'studio',
    };
    setProfile(guestProfile);
    setLikedSongs([]);
    setPlaylists([]);
  }, [closeLoginGate]);

  const checkGuestSearchAllowed = useCallback((): boolean => {
    if (!isGuest) return true;
    const allowed = canGuestSearch(guestUsage);
    if (!allowed) {
      openLoginGate("You've reached the 5-search guest limit. Sign in with Google for unlimited searches.");
    }
    return allowed;
  }, [isGuest, guestUsage, openLoginGate]);

  const recordGuestSearch = useCallback(() => {
    if (!isGuest) return;
    setGuestUsage((prev) => {
      const next = incrementGuestSearch(prev);
      saveGuestUsage(next);
      return next;
    });
  }, [isGuest]);

  const checkGuestPlaybackAllowed = useCallback((): boolean => {
    if (!isGuest) return true;
    const allowed = canGuestPlay(guestUsage);
    if (!allowed) {
      audioEngine.pause();
      openLoginGate('Guest listening preview limit reached (15 minutes). Sign in with Google for unlimited music.');
    }
    return allowed;
  }, [isGuest, guestUsage, openLoginGate]);

  const recordGuestPlaybackSeconds = useCallback(
    (seconds: number) => {
      if (!isGuest) return;
      setGuestUsage((prev) => {
        const next = recordGuestPlayback(prev, seconds);
        saveGuestUsage(next);
        if (!canGuestPlay(next)) {
          audioEngine.pause();
          openLoginGate('Guest listening preview limit reached (15 minutes). Sign in with Google for unlimited music.');
        }
        return next;
      });
    },
    [isGuest, openLoginGate]
  );

  const recordGuestTrackFinishedAction = useCallback(() => {
    if (!isGuest) return;
    setGuestUsage((prev) => {
      const next = recordGuestTrackFinished(prev);
      saveGuestUsage(next);
      if (!canGuestPlay(next)) {
        audioEngine.pause();
        openLoginGate('Guest listening preview limit reached (3 tracks). Sign in with Google for unlimited music.');
      }
      return next;
    });
  }, [isGuest, openLoginGate]);

  const refreshUserData = useCallback(async () => {
    if (authStateRef.current === 'guest') {
      const downloads = await localDB.getAllOfflineTracks('guest@tunely.local');
      setOfflineTracks(downloads);
      return;
    }

    if (!activeEmail || authStateRef.current !== 'authenticated') {
      setProfile(null);
      setLikedSongs([]);
      setPlaylists([]);
      setOfflineTracks([]);
      setHistory([]);
      return;
    }

    let prof = await localDB.getProfile(activeEmail);
    if (prof) {
      prof.lastActive = Date.now();
      await localDB.saveProfile(prof);
      setProfile(prof);
      audioEngine.setPreferredQuality(prof.preferredQuality);
      audioEngine.setAutoResume(prof.autoResumeOnInterruption);
      const hydratedProfile = prof.soundProfile || 'studio';
      if (audioEngine.getSoundProfile() !== hydratedProfile) {
        audioEngine.setSoundProfile(hydratedProfile);
      }
    }

    const likes = await localDB.getLikedSongs(activeEmail);
    setLikedSongs(likes);

    const userPlaylists = await localDB.getUserPlaylists(activeEmail);
    setPlaylists(userPlaylists);

    const downloads = await localDB.getAllOfflineTracks(activeEmail);
    setOfflineTracks(downloads);

    const hist = await localDB.getHistory(activeEmail, 30);
    setHistory(hist);
  }, [activeEmail]);

  // Check for redirect result on boot (for Safari standalone PWA)
  useEffect(() => {
    checkRedirectAuthResult().catch((err) => {
      const host = typeof window !== 'undefined' ? window.location.hostname : undefined;
      const msg = formatFirebaseAuthError(err, host);
      setCloudError(msg);
    });
  }, []);

  // Firebase Auth & Firestore Real-Time Synchronizer
  useEffect(() => {
    const unsubAuth = onCloudAuthChange(async (fbUser) => {
      if (cloudUnsubRef.current) {
        cloudUnsubRef.current();
        cloudUnsubRef.current = null;
      }

      setFirebaseUser(fbUser);
      setPlaylists([]);
      setCloudError(null);

      if (!fbUser) {
        // No authenticated Google account
        const savedGuest = localStorage.getItem('tunely_guest_mode') === 'true';
        if (savedGuest) {
          setAuthState('guest');
          setActiveEmail('guest@tunely.local');
          setProfile({
            email: 'guest@tunely.local',
            name: 'Guest Listener',
            avatarColor: 'from-slate-600 to-slate-700',
            createdAt: Date.now(),
            lastActive: Date.now(),
            preferredQuality: '320kbps',
            autoResumeOnInterruption: true,
            soundProfile: 'studio',
          });
        } else {
          setAuthState('unauthenticated');
          setActiveEmail('');
          setProfile(null);
          setIsLoginGateOpen(true);
        }
        return;
      }

      // Authenticated with Google!
      const cloudEmail = (fbUser.email || `${fbUser.uid}@tunely.app`).toLowerCase();
      localStorage.removeItem('tunely_guest_mode');
      localStorage.setItem('tunely_active_email', cloudEmail);
      localStorage.setItem('tunely_auth_state', 'authenticated');

      if (activeEmailRef.current !== cloudEmail && authStateRef.current === 'authenticated') {
        audioEngine.resetForAccountSwitch();
      }

      setActiveEmail(cloudEmail);
      setAuthState('authenticated');
      setIsLoginGateOpen(false);

      try {
        await queuePlaylistWork(async () => {
          const cached = await localDB.getUserPlaylists(cloudEmail);
          if (auth.currentUser?.uid === fbUser.uid) setPlaylists(cached);
        });
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
        setProfile(updatedProf);

        audioEngine.setPreferredQuality(updatedProf.preferredQuality);
        audioEngine.setAutoResume(updatedProf.autoResumeOnInterruption);
        const syncedProfile = updatedProf.soundProfile || 'studio';
        if (audioEngine.getSoundProfile() !== syncedProfile) {
          audioEngine.setSoundProfile(syncedProfile);
        }

        // Hydrate from local IndexedDB first so offline works instantly
        const localLikes = await localDB.getLikedSongs(cloudEmail);
        if (localLikes.length > 0) setLikedSongs(localLikes);

        // Bi-directional real-time cloud listener
        if (auth.currentUser?.uid !== fbUser.uid) return;
        cloudUnsubRef.current = subscribeCloudLibrary(
          fbUser.uid,
          cloudEmail,
          (cloudPlaylists) => {
            void queuePlaylistWork(async () => {
              if (auth.currentUser?.uid !== fbUser.uid) return;
              const currentLocal = await localDB.getUserPlaylists(cloudEmail);
              const merged = mergeCloudAndLocalPlaylists(currentLocal, cloudPlaylists);
              for (const playlist of merged) await localDB.savePlaylist(playlist);
              if (auth.currentUser?.uid !== fbUser.uid) return;
              setPlaylists(merged);

              const cloudById = new Map(cloudPlaylists.map((playlist) => [playlist.id, playlist]));
              for (const local of currentLocal) {
                const cloud = cloudById.get(local.id);
                if (!cloud && local.cloudConfirmed) {
                  await localDB.deletePlaylist(local.id);
                } else if (!cloud || preferLocalPlaylistSongs(local, cloud)) {
                  void recoverCloudPlaylist(fbUser.uid, local).catch((err) => reportPlaylistSyncError(fbUser.uid, err));
                }
              }
            }).catch((err) => {
              reportPlaylistSyncError(fbUser.uid, err);
            });
          },
          async (cloudLikes) => {
            const currentLocalLikes = await localDB.getLikedSongs(cloudEmail);
            const mergedLikes = mergeCloudAndLocalLikes(currentLocalLikes, cloudLikes);

            for (const s of mergedLikes) {
              if (!currentLocalLikes.some((l) => l.id === s.id)) {
                await localDB.toggleLikedSong(cloudEmail, s);
              }
            }
            setLikedSongs(mergedLikes);

            // Upload local-only likes to cloud
            for (const loc of currentLocalLikes) {
              if (!cloudLikes.some((c) => c.id === loc.id)) {
                await syncCloudLikeSong(fbUser.uid, loc).catch((err) => reportPlaylistSyncError(fbUser.uid, err));
              }
            }
          }
        );
      } catch (err) {
        console.warn('[Tunely Cloud Sync] Sync initialization notice:', err);
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
      resetGuestUsage();
      setGuestUsage(loadGuestUsage());
      return { success: true };
    } catch (err: any) {
      const host = typeof window !== 'undefined' ? window.location.hostname : undefined;
      const msg = formatFirebaseAuthError(err, host);
      setCloudError(msg);
      return { success: false, error: msg };
    } finally {
      setCloudAuthLoading(false);
    }
  };

  const logout = async () => {
    audioEngine.resetForAccountSwitch();
    if (cloudUnsubRef.current) {
      cloudUnsubRef.current();
      cloudUnsubRef.current = null;
    }
    if (firebaseUser) {
      await signOutCloud().catch(() => {});
    }

    setFirebaseUser(null);
    setActiveEmail('');
    setProfile(null);
    setLikedSongs([]);
    setPlaylists([]);
    setOfflineTracks([]);
    setHistory([]);

    localStorage.removeItem('tunely_active_email');
    localStorage.removeItem('tunely_guest_mode');
    localStorage.setItem('tunely_auth_state', 'unauthenticated');

    setAuthState('unauthenticated');
    setIsLoginGateOpen(true);
  };

  const manualSyncCloudNow = async () => {
    if (!firebaseUser) {
      openLoginGate('Sign in with Google to sync your playlists and likes across devices.');
      return;
    }
    setCloudAuthLoading(true);
    try {
      const currentLocal = await localDB.getUserPlaylists(activeEmail);
      for (const pl of currentLocal) {
        await recoverCloudPlaylist(firebaseUser.uid, pl);
      }
      const currentLikes = await localDB.getLikedSongs(activeEmail);
      for (const song of currentLikes) {
        await syncCloudLikeSong(firebaseUser.uid, song).catch(() => {});
      }
      setCloudError(null);
    } catch (err: any) {
      setCloudError('Manual sync failed. Please check internet connection.');
    } finally {
      setCloudAuthLoading(false);
    }
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

  const toggleLiked = async (song: Song): Promise<boolean> => {
    if (!canGuestModifyLibrary(isGuest)) {
      openLoginGate('Sign in with Google to save favorite songs across your devices.');
      return false;
    }

    const isNowLiked = await localDB.toggleLikedSong(activeEmail, song);
    const updated = await localDB.getLikedSongs(activeEmail);
    setLikedSongs(updated);

    if (firebaseUser) {
      if (isNowLiked) {
        syncCloudLikeSong(firebaseUser.uid, song).catch((err) => reportPlaylistSyncError(firebaseUser.uid, err));
      } else {
        syncCloudUnlikeSong(firebaseUser.uid, song.id).catch((err) => reportPlaylistSyncError(firebaseUser.uid, err));
      }
    }
    return isNowLiked;
  };

  const isLiked = (songId: string): boolean => {
    return likedSongs.some((s) => s.id === songId);
  };

  const createPlaylist = async (
    name: string,
    description?: string,
    coverColor?: string,
    coverUrl?: string
  ): Promise<Playlist | null> => {
    return createPlaylistWithSongs(name, [], description, coverColor, coverUrl);
  };

  const createPlaylistWithSongs = async (
    name: string,
    songs: Song[],
    description?: string,
    coverColor?: string,
    coverUrl?: string
  ): Promise<Playlist | null> => {
    if (!canGuestModifyLibrary(isGuest) || !isLoggedIn) {
      openLoginGate('Sign in with Google to create and sync playlists across your devices.');
      return null;
    }

    const colors = [
      'from-rose-500 to-red-700',
      'from-amber-500 to-orange-700',
      'from-emerald-500 to-teal-700',
      'from-cyan-500 to-blue-700',
      'from-violet-500 to-purple-800',
      'from-fuchsia-500 to-pink-700',
    ];
    const pickedColor = coverColor || colors[Math.floor(Math.random() * colors.length)];

    const cleanCoverUrl = coverUrl?.trim() ? coverUrl.trim() : undefined;

    const newPlaylist = withPlaylistSongs({
      id: `pl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim() || 'Imported Playlist',
      description: description?.trim() || '',
      coverColor: pickedColor,
      coverUrl: cleanCoverUrl,
      createdAt: Date.now(),
      songs: [],
      userEmail: activeEmail,
    }, songs);

    return queuePlaylistWork(async () => {
      if (firebaseUser && auth.currentUser?.uid !== firebaseUser.uid) return null;
      await localDB.savePlaylist(newPlaylist);
      if (firebaseUser && auth.currentUser?.uid !== firebaseUser.uid) return null;
      setPlaylists((prev) => [newPlaylist, ...prev.filter((p) => p.id !== newPlaylist.id)]);
      if (firebaseUser) {
        setPendingPlaylistSyncIds((prev) => new Set(prev).add(newPlaylist.id));
        try {
          await syncCreateCloudPlaylist(firebaseUser.uid, newPlaylist);
        } catch (err) {
          reportPlaylistSyncError(firebaseUser.uid, err);
        } finally {
          setPendingPlaylistSyncIds((prev) => {
            const next = new Set(prev);
            next.delete(newPlaylist.id);
            return next;
          });
        }
      }
      return newPlaylist;
    });
  };

  const updatePlaylist = async (
    playlistId: string,
    updates: { name: string; description?: string; coverColor?: string; coverUrl?: string }
  ): Promise<Playlist | null> => {
    if (!canGuestModifyLibrary(isGuest)) {
      openLoginGate('Sign in with Google to edit playlists.');
      return null;
    }

    return queuePlaylistWork(async () => {
      if (firebaseUser && auth.currentUser?.uid !== firebaseUser.uid) return null;
      const existing = await localDB.getPlaylist(playlistId);
      if (!existing || existing.userEmail !== activeEmail) return null;

      const nextName = updates.name.trim() || existing.name;
      const nextDescription =
        updates.description !== undefined ? updates.description.trim() : existing.description || '';
      const nextColor = updates.coverColor || existing.coverColor || 'from-violet-600 to-indigo-700';
      const nextCoverUrl =
        updates.coverUrl !== undefined ? updates.coverUrl.trim() || undefined : existing.coverUrl;
      const nextRevision = (existing.revision ?? 0) + 1;
      const nextUpdatedAt = Math.max(Date.now(), (existing.updatedAt ?? 0) + 1);

      const updated: Playlist = {
        ...existing,
        name: nextName,
        description: nextDescription,
        coverColor: nextColor,
        coverUrl: nextCoverUrl,
        updatedAt: nextUpdatedAt,
        revision: nextRevision,
      };

      updated.songs = sanitizePlaylistImportTracks(updated.songs);
      await localDB.savePlaylist(updated);
      if (firebaseUser && auth.currentUser?.uid !== firebaseUser.uid) return null;
      setPlaylists((prev) => prev.map((p) => (p.id === playlistId ? updated : p)));

      if (firebaseUser) {
        setPendingPlaylistSyncIds((prev) => new Set(prev).add(playlistId));
        try {
          await syncUpdateCloudPlaylistDetails(firebaseUser.uid, updated);
        } catch (err) {
          reportPlaylistSyncError(firebaseUser.uid, err);
        } finally {
          setPendingPlaylistSyncIds((prev) => {
            const next = new Set(prev);
            next.delete(playlistId);
            return next;
          });
        }
      }
      return updated;
    });
  };

  const deletePlaylist = async (playlistId: string): Promise<void> => {
    if (!canGuestModifyLibrary(isGuest)) {
      openLoginGate('Sign in with Google to manage playlists.');
      return;
    }

    await queuePlaylistWork(async () => {
      if (firebaseUser && auth.currentUser?.uid !== firebaseUser.uid) return;
      const playlist = await localDB.getPlaylist(playlistId);
      if (!playlist || playlist.userEmail !== activeEmail) return;
      await localDB.deletePlaylist(playlistId);
      if (firebaseUser && auth.currentUser?.uid !== firebaseUser.uid) return;
      setPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
      if (firebaseUser) {
        setPendingPlaylistSyncIds((prev) => new Set(prev).add(playlistId));
        try {
          await syncDeleteCloudPlaylist(firebaseUser.uid, playlistId);
        } catch (err) {
          reportPlaylistSyncError(firebaseUser.uid, err);
        } finally {
          setPendingPlaylistSyncIds((prev) => {
            const next = new Set(prev);
            next.delete(playlistId);
            return next;
          });
        }
      }
    });
  };

  const mutatePlaylistSongs = async (
    playlistId: string,
    editSongs: (songs: Song[]) => Song[],
    options?: { addedSongIds?: string[]; deletedSongIds?: string[] }
  ): Promise<{ success: boolean; synced: boolean; error?: string }> => {
    if (!canGuestModifyLibrary(isGuest)) {
      openLoginGate('Sign in with Google to manage playlists.');
      return { success: false, synced: false, error: 'Sign in with Google to manage playlists.' };
    }

    let result: { success: boolean; synced: boolean; error?: string } = { success: true, synced: true };

    await queuePlaylistWork(async () => {
      if (firebaseUser && auth.currentUser?.uid !== firebaseUser.uid) {
        result = { success: false, synced: false, error: 'User session mismatch' };
        return;
      }
      const playlist = await localDB.getPlaylist(playlistId);
      if (!playlist || playlist.userEmail !== activeEmail) {
        result = { success: false, synced: false, error: 'Playlist not found' };
        return;
      }
      const songs = editSongs(playlist.songs);
      if (songs === playlist.songs) {
        result = { success: true, synced: true };
        return;
      }

      const addedSongIds =
        options?.addedSongIds ??
        songs.filter((s) => !playlist.songs.some((p) => p.id === s.id)).map((s) => s.id);
      const deletedSongIds =
        options?.deletedSongIds ??
        playlist.songs.filter((p) => !songs.some((s) => s.id === p.id)).map((p) => p.id);

      const updated = withPlaylistSongs(
        playlist,
        songs,
        Math.max(Date.now(), (playlist.updatedAt ?? 0) + 1)
      );
      await localDB.savePlaylist(updated);
      if (firebaseUser && auth.currentUser?.uid !== firebaseUser.uid) {
        result = { success: false, synced: false, error: 'User session mismatch' };
        return;
      }
      setPlaylists((prev) => prev.map((item) => (item.id === playlistId ? updated : item)));
      if (firebaseUser) {
        setPendingPlaylistSyncIds((prev) => new Set(prev).add(playlistId));
        try {
          await syncUpdateCloudPlaylistSongs(firebaseUser.uid, updated, {
            addedSongIds,
            deletedSongIds,
          });
          result = { success: true, synced: true };
        } catch (err) {
          const syncErrorMsg = formatFirestoreSyncError(err);
          reportPlaylistSyncError(firebaseUser.uid, err);
          result = { success: true, synced: false, error: syncErrorMsg };
        } finally {
          setPendingPlaylistSyncIds((prev) => {
            const next = new Set(prev);
            next.delete(playlistId);
            return next;
          });
        }
      } else {
        result = { success: true, synced: true };
      }
    });

    return result;
  };

  const addSongToPlaylist = (playlistId: string, song: Song): Promise<{ success: boolean; synced: boolean; error?: string }> =>
    mutatePlaylistSongs(
      playlistId,
      (songs) => {
        if (songs.some((item) => item.id === song.id)) return songs;
        if (songs.length >= 450) {
          setCloudError('This playlist already contains 450 tracks.');
          return songs;
        }
        return [...songs, song];
      },
      { addedSongIds: [song.id] }
    );

  const removeSongFromPlaylist = (playlistId: string, songId: string): Promise<{ success: boolean; synced: boolean; error?: string }> =>
    mutatePlaylistSongs(
      playlistId,
      (songs) =>
        songs.some((song) => song.id === songId)
          ? songs.filter((song) => song.id !== songId)
          : songs,
      { deletedSongIds: [songId] }
    );

  const reorderPlaylistSongs = (playlistId: string, songId: string, direction: -1 | 1): Promise<{ success: boolean; synced: boolean; error?: string }> =>
    mutatePlaylistSongs(playlistId, (songs) => {
      const index = songs.findIndex((song) => song.id === songId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= songs.length) return songs;
      const reordered = [...songs];
      const [moved] = reordered.splice(index, 1);
      reordered.splice(target, 0, moved);
      return reordered;
    });

  const downloadSongForOffline = async (song: Song): Promise<void> => {
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

      const downloaded = await localDB.saveOfflineTrack(
        targetSong,
        blob,
        preferred,
        activeEmail || 'guest@tunely.local'
      );
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

  const deleteOfflineTrack = async (songId: string): Promise<void> => {
    await localDB.deleteOfflineTrack(songId);
    audioEngine.markOfflineTrack(songId, false);
    setOfflineTracks((prev) => prev.filter((t) => t.id !== songId));
  };

  const clearAllDownloads = async (): Promise<void> => {
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
        authState,
        isGuest,
        isLoggedIn,
        isCloudSynced,
        cloudAuthLoading,
        cloudError,
        profile,
        profilesList: profile ? [profile] : [],
        likedSongs,
        playlists,
        offlineTracks,
        history,
        isOfflineModeOnly,
        downloadingSongIds,
        guestUsage,
        isLoginGateOpen,
        loginGateReason,
        openLoginGate,
        closeLoginGate,
        continueAsGuest,
        loginWithGoogle,
        logout,
        manualSyncCloudNow,
        checkGuestSearchAllowed,
        recordGuestSearch,
        checkGuestPlaybackAllowed,
        recordGuestPlaybackSeconds,
        recordGuestTrackFinished: recordGuestTrackFinishedAction,
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
        reorderPlaylistSongs,
        downloadSongForOffline,
        deleteOfflineTrack,
        clearAllDownloads,
        toggleOfflineModeOnly,
        refreshUserData,
        isCloudSyncing: pendingPlaylistSyncIds.size > 0,
        pendingPlaylistSyncIds,
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
