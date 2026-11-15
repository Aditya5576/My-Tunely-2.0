import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  getDocFromServer,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  Firestore,
  Timestamp,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { AudioQuality, Playlist, Song, SoundProfile } from '../types/music';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

const app = initializeApp(firebaseConfig);

let dbInstance: Firestore;
try {
  dbInstance = initializeFirestore(
    app,
    {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    },
    firebaseConfig.firestoreDatabaseId
  );
} catch {
  dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

export const db = dbInstance;
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection to Firestore on startup (only when browser is online)
async function testConnection() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore operating in local offline persistence mode.');
    }
  }
}
testConnection();

export function sanitizeFirestoreId(rawId: string): string {
  const cleaned = (rawId || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned || `id_${Date.now()}`;
}

export function sanitizeSongForCloud(song: Song): Record<string, unknown> {
  const safeDuration = Math.min(86400, Math.max(0, Math.round(Number(song.duration) || 210)));
  const safeName = (song.name || '').trim().slice(0, 300) || 'Untitled';
  return {
    id: sanitizeFirestoreId(song.id),
    name: safeName,
    duration: safeDuration,
    year: song.year ? String(song.year).slice(0, 20) : '',
    language: song.language ? String(song.language).slice(0, 40) : '',
    album: {
      id: String(song.album?.id || 'alb').slice(0, 128),
      name: String(song.album?.name || 'Single').slice(0, 200),
    },
    artists: {
      primary: (song.artists?.primary || []).slice(0, 8).map((a) => ({
        id: String(a.id || 'artist').slice(0, 128),
        name: String(a.name || 'Artist').slice(0, 120),
      })),
    },
    image: (song.image || []).slice(0, 4).map((img) => ({
      quality: String(img.quality || '150x150').slice(0, 32),
      url: String(img.url || '').slice(0, 512),
    })),
    downloadUrl: (song.downloadUrl || []).slice(0, 6).map((d) => ({
      quality: String(d.quality || '320kbps').slice(0, 32),
      url: String(d.url || '').slice(0, 512),
    })),
  };
}

export async function signInWithGoogleCloud(): Promise<FirebaseUser> {
  const cred = await signInWithPopup(auth, googleProvider);
  return cred.user;
}

export async function signOutCloud(): Promise<void> {
  await signOut(auth);
}

export function onCloudAuthChange(cb: (user: FirebaseUser | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}

export async function ensureCloudUserProfile(
  fbUser: FirebaseUser,
  defaults: {
    preferredQuality: AudioQuality;
    autoResumeOnInterruption: boolean;
    soundProfile?: SoundProfile;
    avatarColor?: string;
  }
): Promise<{
  preferredQuality: AudioQuality;
  autoResumeOnInterruption: boolean;
  soundProfile: SoundProfile;
  avatarColor?: string;
}> {
  const uid = sanitizeFirestoreId(fbUser.uid);
  const path = `users/${uid}`;
  const userRef = doc(db, 'users', uid);

  try {
    const snap = await getDoc(userRef);
    const defaultProfile = defaults.soundProfile || 'studio';
    if (!snap.exists()) {
      const safeDisplayName =
        (fbUser.displayName || fbUser.email?.split('@')[0] || 'Listener').trim().slice(0, 100) ||
        'Listener';
      const payload: Record<string, unknown> = {
        uid,
        email: (fbUser.email || 'user@tunely.app').slice(0, 256),
        name: safeDisplayName,
        avatarColor: (defaults.avatarColor || 'from-violet-600 to-indigo-600').slice(0, 100),
        preferredQuality: defaults.preferredQuality,
        autoResumeOnInterruption: defaults.autoResumeOnInterruption,
        soundProfile: defaultProfile,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (fbUser.photoURL && fbUser.photoURL.startsWith('https://')) {
        payload.avatarUrl = fbUser.photoURL.slice(0, 512);
      }
      await setDoc(userRef, payload);
      return { ...defaults, soundProfile: defaultProfile };
    }

    const data = snap.data();
    return {
      preferredQuality: (data.preferredQuality as AudioQuality) || defaults.preferredQuality,
      autoResumeOnInterruption:
        typeof data.autoResumeOnInterruption === 'boolean'
          ? data.autoResumeOnInterruption
          : defaults.autoResumeOnInterruption,
      soundProfile: (data.soundProfile as SoundProfile) || defaultProfile,
      avatarColor: (data.avatarColor as string) || defaults.avatarColor,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateCloudUserPreferences(
  uid: string,
  updates: {
    preferredQuality?: AudioQuality;
    autoResumeOnInterruption?: boolean;
    soundProfile?: SoundProfile;
  }
): Promise<void> {
  const safeUid = sanitizeFirestoreId(uid);
  const path = `users/${safeUid}`;
  try {
    await updateDoc(doc(db, 'users', safeUid), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

function sanitizeCoverUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 100000) return '';
  return /^(https:\/\/|data:image\/)/i.test(trimmed) ? trimmed : '';
}

export async function syncCreateCloudPlaylist(uid: string, playlist: Playlist): Promise<void> {
  const safeUid = sanitizeFirestoreId(uid);
  const safePlId = sanitizeFirestoreId(playlist.id);
  const path = `users/${safeUid}/playlists/${safePlId}`;
  try {
    await setDoc(doc(db, 'users', safeUid, 'playlists', safePlId), {
      id: safePlId,
      ownerId: safeUid,
      name: (playlist.name || '').trim().slice(0, 120) || 'Untitled Playlist',
      description: (playlist.description || '').slice(0, 300),
      coverColor: (playlist.coverColor || 'from-violet-600 to-indigo-700').slice(0, 100),
      coverUrl: sanitizeCoverUrl(playlist.coverUrl),
      songs: playlist.songs.slice(0, 450).map(sanitizeSongForCloud),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function syncUpdateCloudPlaylistDetails(uid: string, playlist: Playlist): Promise<void> {
  const safeUid = sanitizeFirestoreId(uid);
  const safePlId = sanitizeFirestoreId(playlist.id);
  const path = `users/${safeUid}/playlists/${safePlId}`;
  try {
    await updateDoc(doc(db, 'users', safeUid, 'playlists', safePlId), {
      name: (playlist.name || '').trim().slice(0, 120) || 'Untitled Playlist',
      description: (playlist.description || '').slice(0, 300),
      coverColor: (playlist.coverColor || 'from-violet-600 to-indigo-700').slice(0, 100),
      coverUrl: sanitizeCoverUrl(playlist.coverUrl),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    const msg = error instanceof Error ? error.message : String(error);
    if (code === 'not-found' || msg.includes('No document to update') || msg.includes('not-found')) {
      await syncCreateCloudPlaylist(uid, playlist);
      return;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function syncUpdateCloudPlaylistSongs(uid: string, playlist: Playlist): Promise<void> {
  const safeUid = sanitizeFirestoreId(uid);
  const safePlId = sanitizeFirestoreId(playlist.id);
  const path = `users/${safeUid}/playlists/${safePlId}`;
  try {
    await updateDoc(doc(db, 'users', safeUid, 'playlists', safePlId), {
      songs: playlist.songs.slice(0, 450).map(sanitizeSongForCloud),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    const msg = error instanceof Error ? error.message : String(error);
    if (code === 'not-found' || msg.includes('No document to update') || msg.includes('not-found')) {
      await syncCreateCloudPlaylist(uid, playlist);
      return;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function syncDeleteCloudPlaylist(uid: string, playlistId: string): Promise<void> {
  const safeUid = sanitizeFirestoreId(uid);
  const safePlId = sanitizeFirestoreId(playlistId);
  const path = `users/${safeUid}/playlists/${safePlId}`;
  try {
    await deleteDoc(doc(db, 'users', safeUid, 'playlists', safePlId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function syncCloudLikeSong(uid: string, song: Song): Promise<void> {
  const safeUid = sanitizeFirestoreId(uid);
  const safeSongId = sanitizeFirestoreId(song.id);
  const path = `users/${safeUid}/likedSongs/${safeSongId}`;
  try {
    await setDoc(doc(db, 'users', safeUid, 'likedSongs', safeSongId), {
      id: safeSongId,
      ownerId: safeUid,
      song: sanitizeSongForCloud(song),
      likedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function syncCloudUnlikeSong(uid: string, songId: string): Promise<void> {
  const safeUid = sanitizeFirestoreId(uid);
  const safeSongId = sanitizeFirestoreId(songId);
  const path = `users/${safeUid}/likedSongs/${safeSongId}`;
  try {
    await deleteDoc(doc(db, 'users', safeUid, 'likedSongs', safeSongId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

function toMillis(val: unknown): number {
  if (val && typeof val === 'object' && 'toMillis' in val && typeof (val as Timestamp).toMillis === 'function') {
    return (val as Timestamp).toMillis();
  }
  if (typeof val === 'number') return val;
  return Date.now();
}

export function subscribeCloudLibrary(
  uid: string,
  userEmail: string,
  onPlaylists: (playlists: Playlist[]) => void,
  onLikedSongs: (songs: Song[]) => void
): () => void {
  const safeUid = sanitizeFirestoreId(uid);
  const plPath = `users/${safeUid}/playlists`;
  const likesPath = `users/${safeUid}/likedSongs`;

  const plQuery = query(collection(db, 'users', safeUid, 'playlists'), where('ownerId', '==', safeUid));
  const likesQuery = query(collection(db, 'users', safeUid, 'likedSongs'), where('ownerId', '==', safeUid));

  const unsubPlaylists = onSnapshot(
    plQuery,
    (snapshot) => {
      const items: Playlist[] = snapshot.docs.map((d) => {
        const data = d.data();
        const rawCoverUrl = typeof data.coverUrl === 'string' && data.coverUrl.trim() ? data.coverUrl.trim() : undefined;
        return {
          id: String(data.id || d.id),
          name: String(data.name || 'Playlist'),
          description: String(data.description || ''),
          coverColor: String(data.coverColor || 'from-violet-600 to-indigo-700'),
          coverUrl: rawCoverUrl,
          createdAt: toMillis(data.createdAt),
          songs: Array.isArray(data.songs) ? (data.songs as Song[]) : [],
          userEmail,
        };
      });
      items.sort((a, b) => b.createdAt - a.createdAt);
      onPlaylists(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, plPath);
    }
  );

  const unsubLikes = onSnapshot(
    likesQuery,
    (snapshot) => {
      const rows = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          song: data.song as Song,
          likedAt: toMillis(data.likedAt),
        };
      });
      rows.sort((a, b) => b.likedAt - a.likedAt);
      onLikedSongs(rows.map((r) => r.song).filter(Boolean));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, likesPath);
    }
  );

  return () => {
    unsubPlaylists();
    unsubLikes();
  };
}
