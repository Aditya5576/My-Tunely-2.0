import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
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
  runTransaction,
  Firestore,
  Timestamp,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { AudioQuality, Playlist, Song, SoundProfile } from '../types/music';
import { formatFirebaseAuthError, formatFirestoreSyncError, preferLocalPlaylistSongs, reconcileConcurrentSongs } from '../utils/guestLimits';
import { sanitizePlaylistImportTracks } from '../utils/audioCore';

export { formatFirebaseAuthError, formatFirestoreSyncError } from '../utils/guestLimits';

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

// Enforce browserLocalPersistence so device sessions survive reloads & restarts permanently
if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn('[Tunely Firebase] Persistence initialization notice:', err);
  });
}

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
  const [sanitized] = sanitizePlaylistImportTracks([song]);
  const s = sanitized || song;
  const safeDuration = Math.min(86400, Math.max(0, Math.round(Number(s?.duration) || 210)));
  const safeName = (s?.name || '').trim().slice(0, 300) || 'Untitled';
  const out: Record<string, unknown> = {
    id: sanitizeFirestoreId(s?.id),
    name: safeName,
    duration: safeDuration,
    year: s?.year ? String(s.year).slice(0, 20) : '',
    language: s?.language ? String(s.language).slice(0, 40) : '',
    album: {
      id: String(s?.album?.id || 'alb').slice(0, 128),
      name: String(s?.album?.name || 'Single').slice(0, 200),
    },
    artists: {
      primary: (s?.artists?.primary || []).slice(0, 8).map((a) => ({
        id: String(a?.id || 'artist').slice(0, 128),
        name: String(a?.name || 'Artist').slice(0, 120),
      })),
    },
    image: (s?.image || [])
      .filter((img) => img && typeof img.url === 'string' && img.url.trim())
      .slice(0, 4)
      .map((img) => ({
        quality: String(img.quality || '150x150').slice(0, 32),
        url: String(img.url).slice(0, 512),
      })),
    downloadUrl: (s?.downloadUrl || [])
      .filter((d) => d && typeof d.url === 'string' && d.url.trim())
      .slice(0, 6)
      .map((d) => ({
        quality: String(d.quality || '320kbps').slice(0, 32),
        url: String(d.url).slice(0, 512),
      })),
  };
  return out;
}

export async function signInWithGoogleCloud(): Promise<FirebaseUser> {
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    return cred.user;
  } catch (err: any) {
    // If popup was blocked or user is in iOS standalone PWA, fall back to redirect
    if (
      err?.code === 'auth/popup-blocked' ||
      err?.code === 'auth/cancelled-popup-request' ||
      err?.code === 'auth/operation-not-supported-in-this-environment'
    ) {
      await signInWithRedirect(auth, googleProvider);
      return auth.currentUser as FirebaseUser;
    }
    const host = typeof window !== 'undefined' ? window.location.hostname : undefined;
    const formatted = formatFirebaseAuthError(err, host);
    if (err && typeof err === 'object') {
      err.message = formatted;
    }
    throw err;
  }
}

export async function checkRedirectAuthResult(): Promise<FirebaseUser | null> {
  try {
    const res = await getRedirectResult(auth);
    return res?.user || null;
  } catch (err: any) {
    const host = typeof window !== 'undefined' ? window.location.hostname : undefined;
    const formatted = formatFirebaseAuthError(err, host);
    if (err && typeof err === 'object') {
      err.message = formatted;
    }
    throw err;
  }
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

function cloudPlaylistDetails(playlist: Playlist) {
  return {
    name: (playlist.name || '').trim().slice(0, 120) || 'Untitled Playlist',
    description: (playlist.description || '').slice(0, 300),
    coverColor: (playlist.coverColor || 'from-violet-600 to-indigo-700').slice(0, 100),
    coverUrl: sanitizeCoverUrl(playlist.coverUrl),
  };
}

function cloudPlaylistSongs(playlist: Playlist): Record<string, unknown>[] {
  return sanitizePlaylistImportTracks(playlist.songs).slice(0, 450).map(sanitizeSongForCloud);
}

function newCloudPlaylist(uid: string, id: string, playlist: Playlist) {
  return {
    id,
    ownerId: uid,
    ...cloudPlaylistDetails(playlist),
    songs: cloudPlaylistSongs(playlist),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    revision: playlist.revision ?? 1,
  };
}

export async function syncCreateCloudPlaylist(uid: string, playlist: Playlist): Promise<void> {
  const safeUid = sanitizeFirestoreId(uid);
  const safePlId = sanitizeFirestoreId(playlist.id);
  const ref = doc(db, 'users', safeUid, 'playlists', safePlId);
  try {
    await setDoc(ref, newCloudPlaylist(safeUid, safePlId, playlist), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${safeUid}/playlists/${safePlId}`);
  }
}

export async function recoverCloudPlaylist(uid: string, playlist: Playlist): Promise<void> {
  const safeUid = sanitizeFirestoreId(uid);
  const safePlId = sanitizeFirestoreId(playlist.id);
  const ref = doc(db, 'users', safeUid, 'playlists', safePlId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) {
      if (!playlist.cloudConfirmed) {
        transaction.set(ref, newCloudPlaylist(safeUid, safePlId, playlist), { merge: true });
      }
      return;
    }
    const cloudData = snapshot.data();
    const cloudPl = readCloudPlaylist(cloudData, safePlId, playlist.userEmail);
    if (preferLocalPlaylistSongs(playlist, cloudPl)) {
      const nextRevision = Math.max(cloudPl.revision ?? 0, playlist.revision ?? 0) + 1;
      transaction.set(ref, {
        songs: cloudPlaylistSongs(playlist),
        revision: nextRevision,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }
  });
}

async function mergeCloudPlaylist(
  uid: string,
  playlist: Playlist,
  fields: Record<string, unknown>,
  options?: { addedSongIds?: string[]; deletedSongIds?: string[] }
): Promise<void> {
  const safeUid = sanitizeFirestoreId(uid);
  const safePlId = sanitizeFirestoreId(playlist.id);
  const sanitizedPlaylist: Playlist = {
    ...playlist,
    songs: sanitizePlaylistImportTracks(playlist.songs),
  };
  const ref = doc(db, 'users', safeUid, 'playlists', safePlId);
  try {
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) {
        transaction.set(ref, newCloudPlaylist(safeUid, safePlId, sanitizedPlaylist), { merge: true });
        return;
      }
      const cloudData = snapshot.data();
      const currentRevision = typeof cloudData.revision === 'number' ? cloudData.revision : (sanitizedPlaylist.revision ?? 0);
      const nextRevision = Math.max(currentRevision, sanitizedPlaylist.revision ?? 0) + 1;

      let writeFields = { ...fields };
      if (fields.songs && Array.isArray(fields.songs)) {
        const cloudPl = readCloudPlaylist(cloudData, safePlId, sanitizedPlaylist.userEmail);
        const reconciled = reconcileConcurrentSongs(
          sanitizedPlaylist.songs,
          cloudPl.songs,
          sanitizedPlaylist.updatedAt,
          cloudPl.updatedAt,
          sanitizedPlaylist.revision,
          cloudPl.revision,
          options
        );
        writeFields.songs = cloudPlaylistSongs({ ...sanitizedPlaylist, songs: reconciled });
      }

      transaction.set(ref, {
        ...writeFields,
        revision: nextRevision,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    });
  } catch (error) {
    try {
      const code = (error as { code?: string })?.code;
      if (sanitizedPlaylist.cloudConfirmed || (code !== 'permission-denied' && code !== 'not-found')) {
        let fallbackFields = { ...fields };
        if (fields.songs && Array.isArray(fields.songs)) {
          fallbackFields.songs = cloudPlaylistSongs(sanitizedPlaylist);
        }
        await setDoc(ref, {
          ...fallbackFields,
          revision: (sanitizedPlaylist.revision ?? 0) + 1,
          updatedAt: serverTimestamp(),
        }, { merge: true });
        return;
      }
      // A partial upsert cannot create a document under the full-document create rules.
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (snapshot.exists()) throw error;
        transaction.set(ref, newCloudPlaylist(safeUid, safePlId, sanitizedPlaylist), { merge: true });
      });
    } catch (fallbackError) {
      handleFirestoreError(fallbackError, OperationType.UPDATE, `users/${safeUid}/playlists/${safePlId}`);
    }
  }
}

export async function syncUpdateCloudPlaylistDetails(uid: string, playlist: Playlist): Promise<void> {
  await mergeCloudPlaylist(uid, playlist, cloudPlaylistDetails(playlist));
}

export async function syncUpdateCloudPlaylistSongs(
  uid: string,
  playlist: Playlist,
  options?: { addedSongIds?: string[]; deletedSongIds?: string[] }
): Promise<void> {
  await mergeCloudPlaylist(uid, playlist, { songs: cloudPlaylistSongs(playlist) }, options);
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
  const [sanitizedSong] = sanitizePlaylistImportTracks([song]);
  try {
    await setDoc(doc(db, 'users', safeUid, 'likedSongs', safeSongId), {
      id: safeSongId,
      ownerId: safeUid,
      song: sanitizeSongForCloud(sanitizedSong || song),
      likedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export const syncAddCloudLike = syncCloudLikeSong;

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

function readCloudPlaylist(data: Record<string, unknown>, id: string, userEmail: string): Playlist {
  return {
    id: String(data.id || id),
    name: String(data.name || 'Playlist'),
    description: String(data.description || ''),
    coverColor: String(data.coverColor || 'from-violet-600 to-indigo-700'),
    coverUrl: typeof data.coverUrl === 'string' && data.coverUrl.trim() ? data.coverUrl.trim() : undefined,
    createdAt: toMillis(data.createdAt),
    updatedAt: data.updatedAt == null ? undefined : toMillis(data.updatedAt),
    cloudConfirmed: true,
    songs: Array.isArray(data.songs) ? sanitizePlaylistImportTracks(data.songs) : [],
    userEmail,
    revision: typeof data.revision === 'number' ? data.revision : 1,
  };
}

export function subscribeCloudLibrary(
  uid: string,
  userEmail: string,
  onPlaylists: (playlists: Playlist[]) => void,
  onLikedSongs: (songs: Song[]) => void
): () => void {
  const safeUid = sanitizeFirestoreId(uid);
  const likesPath = `users/${safeUid}/likedSongs`;

  const plQuery = query(collection(db, 'users', safeUid, 'playlists'), where('ownerId', '==', safeUid));
  const likesQuery = query(collection(db, 'users', safeUid, 'likedSongs'), where('ownerId', '==', safeUid));

  const unsubPlaylists = onSnapshot(
    plQuery,
    { includeMetadataChanges: true },
    (snapshot) => {
      // Don't drop remote confirmed updates! Only skip if this is an in-flight local write
      if (snapshot.metadata.hasPendingWrites) return;
      const items = snapshot.docs.map((d) => readCloudPlaylist(d.data(), d.id, userEmail));
      items.sort((a, b) => b.createdAt - a.createdAt);
      onPlaylists(items);
    },
    (error) => {
      console.warn('[Tunely Cloud Sync] Playlist subscription failed:', error.code);
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
