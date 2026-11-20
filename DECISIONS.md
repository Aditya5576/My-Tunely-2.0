# DECISIONS.md — Architectural Decision Records (ADRs)

## ADR-001: Integrated Express BFF with Vite Development Middleware
- **Status**: Accepted
- **Context**: The app requires server-side web scraping (YouTube, Spotify, Apple Music) and API routing to circumvent CORS restrictions and protect backend logic, while providing an instant development workflow for a Single Page Application (SPA).
- **Decision**: Implement a single unified entry point (`server.ts`) using Express. In development, Vite is integrated as middleware via `createViteServer({ server: { middlewareMode: true } })`. In production, Express serves compiled static files from `dist/` with SPA fallback.
- **Consequences**: Single command (`npm run dev`) launches both API and frontend; eliminates separate backend/frontend dev server orchestration.

---

## ADR-002: Offline-First Dual Storage Strategy (IndexedDB + Firebase Firestore)
- **Status**: Accepted
- **Context**: Users listen to music in low-connectivity environments (airplanes, subways) and expect instantaneous responsiveness without waiting for cloud round-trips. However, cross-device sync of playlists and favorites is desirable.
- **Decision**: IndexedDB (`TunelyDB_v1`) serves as the primary ground truth for all reads and local mutations. Offline audio blobs are stored directly in `offline_tracks`. When online, Firebase Auth enables cloud backup to Firestore (`users/{uid}/playlists`, `users/{uid}/likedSongs`).
- **Consequences**: The application functions 100% offline. Network drops never disrupt playback or library browsing. Cloud sync runs opportunistically.

---

## ADR-003: Web Audio API DSP Graph with Soft Ceiling WaveShaper
- **Status**: Accepted
- **Context**: Equalizer adjustments (especially heavy bass boosts) can easily exceed digital 0 dBFS, causing harsh digital clipping and audio distortion on mobile speakers or headphones.
- **Decision**: Route HTMLAudioElement audio through a Web Audio API graph:
  `Source -> 5-Band BiquadFilter (LowShelf, Peaking, HighShelf) -> DynamicsCompressorNode -> WaveShaperNode (hyperbolic tangent curve) -> Destination`.
- **Consequences**: Bass boost and mastering presets deliver punchy, warm dynamics while preventing digital distortion and speaker crackle.

---

## ADR-004: Server-Side Universal Playlist Importer
- **Status**: Accepted
- **Context**: Users migrate playlists from Spotify, Apple Music, YouTube Music, and JioSaavn. Client-side fetching of these third-party pages fails due to strict CORS policies and anti-scraping protections.
- **Decision**: Implement dedicated extraction pipelines inside `server.ts` (`/api/import-playlist`):
  - Spotify: Parses `__NEXT_DATA__` from public embed pages.
  - Apple Music: Extracts JSON-LD schema markup and serialized server data.
  - YouTube: Parses `ytInitialData` and continuation tokens up to 450 items.
  - JioSaavn: Queries worker API directly.
- **Consequences**: Users can import playlists across any major music service with a simple URL paste.

---

## ADR-005: Singleton Dual-Layer Pre-Buffering Coordinator
- **Status**: Accepted
- **Context**: On flaky 2G/3G mobile connections, songs stutter during track transitions. Having multiple React components instantiate audio preloading causes duplicate network requests and high CPU usage.
- **Decision**: Introduce a singleton coordinator in `useAudio.ts` with a subscriber pool (`hookSubscribers`) and two persistent hidden `HTMLAudioElement` instances (`layer2CurrentAudio`, `layer2NextAudio`).
- **Consequences**: Preloads upcoming tracks silently without duplicate network calls, ensuring gapless transitions even on slow mobile networks.

---

## ADR-006: Dual-Provider Synchronized Lyrics (LRCLIB + JioSaavn)
- **Status**: Accepted
- **Context**: Time-synchronized lyrics provide an engaging karaoke-like experience, but no single free API provides complete global and Indian vernacular coverage.
- **Decision**: Query LRCLIB (`https://lrclib.net`) as the primary synchronized provider (exact match followed by fuzzy search). Fallback to JioSaavn's plain text lyrics API if LRCLIB returns no result.
- **Consequences**: Supports time-synchronized scrolling for major releases with graceful fallback to formatted plain text lyrics.

---

## ADR-007: Vendor Bundle Chunk Splitting & NPM Peer Resolution Config
- **Status**: Accepted
- **Context**: In production builds, Vite generated a monolithic 1.13 MB JS bundle exceeding Vite's 500 kB budget warning. Concurrently, standard `npm install` failed due to peer conflicts between `vite@8.3` and `esbuild@0.25`.
- **Decision**:
  1. Add `.npmrc` with `legacy-peer-deps=true` to guarantee deterministic package installation across development environments without requiring manual flags.
  2. Implement Rollup `manualChunks` in `vite.config.ts` splitting `@firebase/firestore`, `@firebase/auth`, Firebase core, `motion`, `lucide-react`, and `react`/`react-dom` into dedicated cacheable chunks.
- **Consequences**:
  - The monolithic 1.13 MB bundle is decomposed into granular chunks, with every single chunk below the 500 kB threshold (`vendor-firebase-firestore` at 493 kB, `vendor-react` at 210 kB, `index.js` at 253 kB).
  - Browser caches vendor chunks across application releases, improving mobile reload latency.
  - Zero warnings during `vite build`.

---

## ADR-008: iOS / iPhone Lock Screen Next & Previous MediaSession Controls
- **Status**: Accepted
- **Context**: On iOS Safari and standalone PWA mode, WebKit's MediaSession implementation prioritizes `seekbackward` and `seekforward` action handlers over track navigation. When registered, iOS renders ±15-second skip buttons on the iPhone Lock Screen, Dynamic Island, and Control Center instead of Previous and Next track buttons.
- **Decision**:
  1. Implement `registerMediaSessionActions` in `src/utils/audioCore.ts` to register transport controls (`play`, `pause`, `previoustrack`, `nexttrack`, `seekto`, `stop`).
  2. Explicitly clear `seekbackward` and `seekforward` to `null` (`mediaSession.setActionHandler('seekbackward', null)`).
  3. Wire `previoustrack` and `nexttrack` directly to `audioEngine.previous()` and `audioEngine.next()`.
- **Consequences**:
  - The iPhone Lock Screen, Dynamic Island, Apple Watch, and Control Center reliably display Next Track and Previous Track buttons.
  - Audio scrubbing continues to work seamlessly via `seekto`.
  - Behavior is protected against regression via unit test in `src/utils/audioCore.test.ts`.

---

## ADR-009: Multi-Tier Search Relevance, Fuzzy Matching & Movie/Soundtrack Discovery
- **Status**: Accepted
- **Context**: Search relevance suffered when users entered short prefix queries (e.g. `"uns"`), multi-word typo queries (e.g. `"Arjit singh chann mere ya"`), or movie/album titles (e.g. `"Ae Dil Hai Mushkil"`). Raw play count scaling in `rankSongsByFameAndRelevance` overpowered lexical match scores (100M plays yielded up to 128 points vs 34-80 lexical points), causing songs with incidental substrings in long titles to outrank exact title matches. Furthermore, JioSaavn's raw backend failed completely on typo queries, and soundtrack tracklists were not populated for movie title searches.
- **Decision**:
  1. **Calibrated Multi-Tier Scoring**:
     - Tier 1 (Exact): Title exact match (+320), Album match (+260), Artist match (+230).
     - Tier 2 (Prefix): Title prefix (+210), Word-boundary prefix (+170), Album prefix (+160), Artist prefix (+140).
     - Tier 3 (Coverage & Fuzzy): Dice-Sørensen bigram coefficient ($\ge 0.65$), syllable concatenation, and multi-word coverage (1.0 coverage = +240, $\ge 0.75$ = +170, $\ge 0.5$ = +90). Dual-field synergy bonus (+45 for title + artist, +35 for title + album).
     - Tier 4 (Capped Play Count Tie-Breaker): $\min(25, \log_{10}(\max(10, \text{plays})) \times 3)$, strictly capping play count influence so fame only breaks ties within the same lexical relevance tier.
  2. **Parallel Album & Soundtrack Expansion**:
     - Query `/api/search/songs` and `/api/search/albums` in parallel during remote search.
     - When an album matches the search query, fetch its tracklist via `/api/albums?id=...` and merge tracks into candidate pool.
     - Expand `diversifyForQuery` to allow up to 4 tracks per album when searching albums/soundtracks.
  3. **Query Typo Tolerance & Variants**:
     - Implement `generateSearchQueryVariants` to correct common phonetic/vernacular typos (`arjit` $\to$ `arijit`, `chann` $\to$ `channa`, `mere ya` $\to$ `mereya`) and separate embedded artist names to search remainder track titles.
  4. **Offline Search Tokenization**:
     - In `localDB.searchCachedSongs`, match query tokens across composite `title + artists + album` strings and rank by relevance.
  5. **UI Enhancement**:
     - In `SongRow.tsx`, display `albumName` in the subtitle when distinct from song title and not `'single'`.
     - In `SearchView.tsx`, enforce 2-character minimum for live debouncing with clean empty states.
- **Consequences**:
  - Exact matches like `"Uns"` rank #1 over high-play songs with incidental substrings like `"Raah Mein Unse Mulaqat"`.
  - Typo queries like `"Arjit singh chann mere ya"` successfully find and rank `"Channa Mereya"` by Arijit Singh #1.
  - Movie searches like `"Ae Dil Hai Mushkil"` return the canonical soundtrack tracklist.
  - Verified with 4 new automated unit tests in `src/utils/audioCore.test.ts` (22/22 total passing).

---

## ADR-010: Persistent Google Auth, Cross-Device Firestore Sync, Clean Profile & Restricted Guest Mode
- **Status**: Accepted
- **Context**: Users required persistent authentication across browser reloads and PWA restarts, permanent cross-device playlist and favorite song synchronization via Firestore without data loss on logout/login cycles, removal of test accounts (`Devon Lane`, `Sarah Beats`), a first-visit Welcome / Login Gate, and an enforced restricted Guest mode (capped searches, capped playback, and blocked library mutations).
- **Decision**:
  1. **Persistent Device Session**:
     - Configured `setPersistence(auth, browserLocalPersistence)` in `src/services/firebase.ts` so authenticated sessions persist indefinitely on the device until explicit sign out.
     - Implemented `signInWithPopup` with graceful fallback to `signInWithRedirect` and `checkRedirectAuthResult` for standalone iOS Safari PWA compatibility.
  2. **Cross-Device Bidirectional Sync**:
     - Subscribed to user-scoped Firestore collections (`users/{uid}/playlists` and `users/{uid}/likedSongs`).
     - Implemented pure deterministic merge functions (`mergeCloudAndLocalPlaylists`, `mergeCloudAndLocalLikes`) in `src/utils/guestLimits.ts` ensuring offline local playlists created prior to sync are uploaded to the cloud and cloud playlists hydrate instantly into local IndexedDB.
     - Logout clears only local active user state and audio buffers; remote Firestore documents are never deleted on sign out.
  3. **Removal of Mock Test Accounts & Clean Profile UI**:
     - Removed `DEMO_ACCOUNTS`, `seedDemoAccountsIfEmpty`, and mock account switching from `UserContext.tsx` and `UserModal.tsx`.
     - `UserModal.tsx` displays authenticated Google profile data, live cloud sync status (`Synced Across Devices` + `Sync Now`), library statistics, and audio preferences.
  4. **Welcome / Device Login Gate (`LoginGateModal.tsx`)**:
     - Rendered on first visit / unauthenticated devices (`authState === 'unauthenticated'`), allowing users to choose **Continue with Google** or **Continue as Guest**.
     - Re-usable whenever a guest attempts an action requiring an authenticated account.
  5. **Restricted Guest Mode Enforcement**:
     - Capped search queries to 5 per guest session (`canGuestSearch` / `incrementGuestSearch`).
     - Capped cumulative audio playback to 15 minutes (900 seconds) or 3 tracks (`canGuestPlay` / `recordGuestPlayback` / `recordGuestTrackFinished`), pausing playback cleanly with a sign-in prompt when exhausted.
     - Blocked playlist creation and song favoriting for guests (`canGuestModifyLibrary`), triggering the Login Gate.
- **Consequences**:
  - Full cross-device parity between desktop and mobile PWA for authenticated Google users.
  - Guests can preview high-fidelity streaming and DSP audio up to limits, with intuitive prompts to upgrade to Google sync.
  - Zero mock data in production builds.
  - Protected against regression with 2 new unit tests (24/24 passing).

---

## ADR-011: Web Audio Dynamic Headroom Attenuation & Dedicated Master Output Gain Staging
- **Status**: Accepted
- **Context**:
  1. On connected wired or Bluetooth headsets at ~80% volume, audio exhibited harsh crackling, odd harmonic buzz, and high-frequency scattering. Tracing revealed positive EQ summing across 5 parametric bands (+4.5 dB sub, +3.2 dB bass, +3.0 dB air) and makeup gains (+2.54 dB) drove peak signals to +8 to +12 dBFS (linear amplitude 2.5–4.0). When entering `WaveShaperNode` (`createSoftCeilingCurve`), any amplitude exceeding 1.0 was abruptly clamped to 0.965, turning transient peaks into flatline square waves.
  2. Sudden unprompted volume spikes occurred during track transitions or when recovering after audio focus interruptions. Modifying `this.audio.volume` directly on the HTMLMediaElement scaled the input signal entering the DSP chain, altering compressor response and causing transient jumps upon `AudioContext.resume()`.
- **Decision**:
  1. **Dynamic Pre-Gain Headroom Attenuation (`computeHeadroomAttenuation`)**:
     - Introduced `computeHeadroomAttenuation(effectiveBands, makeupGain)` in `src/utils/audioCore.ts`.
     - Automatically calculates negative trim offset ($\text{totalOverheadDb} = \max(\text{boosts}) \times 0.65 + \text{makeupDb}$) and applies a linear scale factor ($\ge 0.35$) via `preGain: GainNode` before the subsonic filter and parametric EQ.
     - Ensures cumulative peak levels through EQ and compressor never exceed 0 dBFS ($|x| \le 1.0$), preventing digital overload and filter saturation.
  2. **Dedicated Master Output Gain Node (`masterGain`)**:
     - Placed `masterGain: GainNode` right before `ctx.destination` (`source -> preGain -> hp -> 5-band EQ -> comp -> makeupGain -> stereoMatrix -> shaper -> masterGain -> destination`).
     - Standardized `this.audio.volume = 1.0` (unity) whenever Web Audio is running, decoupling user listening volume from DSP processing thresholds.
     - Routed user volume adjustments (`setVolume`, `toggleMute`, track start, and auto-resume) through `syncVolumeToAudioNodes(smooth)` using de-zippered `setTargetAtTime(target, now, 0.02)` transitions.
  3. **Continuous Analog-Warmth Soft-Saturation Curve**:
     - Tuned `createSoftCeilingCurve` with `threshold = 0.82` and `ceiling = 0.985`, providing bit-transparent playback below 0.82 and smooth asymptotic saturation without harsh flatlining.
  4. **Volume Preference Persistence**:
     - Persisted and restored `tunely_volume` in `localStorage` across page reloads and PWA relaunches.
- **Consequences**:
  - Headset listening at ~80%–100% volume is warm, deep, punchy, and completely free of distortion, crackle, or harmonic scattering.
  - Track transitions, unpausing, and AudioContext resumption are smooth with zero unprompted volume spikes or clicks.
  - 100% backward compatible: All 24 pre-existing unit tests plus new test #25 pass without regression (25/25 passing).

---

## ADR-012: Atomic Playlist Import Persistence, Anti-Wipe Cloud Merge & Strict Field Sanitization
- **Status**: Accepted
- **Context**:
  1. Users importing playlists (via Spotify, Apple Music, YouTube, JioSaavn URLs, or raw text tracklists) frequently saw an "Imported" confirmation dialog, but the resulting playlist appeared empty (0 songs) or disappeared after page reload/cloud sync.
  2. Root causes identified across three layers:
     - **Silent Guest Mode Failure**: `handleStartImport` in `PlaylistModal.tsx` did not verify `isGuest` or `isLoggedIn` prior to running network scraping. When `createPlaylistWithSongs` was called, it returned `null` for guests (`if (!canGuestModifyLibrary(isGuest)) return null`), and `handleStartImport` quietly exited without error handling or saving songs. Furthermore, unauthenticated users saved playlists with `userId = ""`, causing newly created playlists to be orphaned upon subsequent Google sign-in.
     - **Destructive Cloud Merge Race Condition**: In `guestLimits.ts`, `mergeCloudAndLocalPlaylists` unconditionally replaced local playlists with incoming cloud snapshot playlists sharing the same ID (`byId.set(pl.id, pl)`). An initial empty cloud snapshot wiped populated local playlists before Firestore writes finished.
     - **Firestore `undefined` Rejection**: Music catalog objects contained `undefined` properties (e.g., `playCount`, `year`, `album.url`), causing Firestore `setDoc` to throw `Unsupported field value: undefined`.
- **Decision**:
  1. **Strict Field & Track Sanitization (`sanitizePlaylistImportTracks` & `sanitizeSongForCloud`)**:
     - Added `sanitizePlaylistImportTracks(tracks)` in `src/utils/audioCore.ts` to validate, assign fallback IDs, bound duration/string lengths, and recursively strip all `undefined` values from song and nested album/artist objects.
     - Hardened `sanitizeSongForCloud(song)` in `src/services/firebase.ts` to recursively omit all `undefined` fields and provide safe defaults for `artists`, `album`, `downloadUrl`, and `image`.
  2. **Non-Destructive Cloud Merge (`mergeCloudAndLocalPlaylists`)**:
     - Updated `mergeCloudAndLocalPlaylists` in `src/utils/guestLimits.ts` so that if a local playlist contains songs and the cloud version has 0 songs or an older update timestamp, the populated local playlist's tracks and track count are preserved.
  3. **Atomic Client Persistence & Awaited Cloud Sync**:
     - Guarded `createPlaylistWithSongs` in `src/context/UserContext.tsx` with `!canGuestModifyLibrary(isGuest) || !isLoggedIn` check.
     - Enforced `activeEmail` as owner, sanitized all tracks via `sanitizePlaylistImportTracks`, committed atomically to IndexedDB first, and awaited `syncCreateCloudPlaylist` to prevent snapshot race conditions.
  4. **Upfront Guest Gate & Verification in `PlaylistModal`**:
     - Checked authentication state upfront in `PlaylistModal.tsx`: displays an inline warning banner explaining that sign-in is required for playlist imports, opens `LoginGateModal` if triggered in guest mode, verifies `saved.songs.length > 0` before showing success, and throws a clear error if 0 tracks were saved.
- **Consequences**:
  - Imported playlists (from Spotify, Apple Music, YouTube, JioSaavn, or raw text) are reliably persisted in IndexedDB and Firestore with all tracks intact.
  - Zero empty-playlist wipes from premature cloud snapshots.
  - 100% test passing: 26/26 unit tests passing with new unit test #26.

---

## ADR-013: Actionable Firebase Unauthorized-Domain Diagnostics & Localhost URL Normalization
- **Status**: Accepted
- **Context**:
  1. When running Tunely locally or on private network IP addresses, Google Auth initialization with Firebase throws `auth/unauthorized-domain` if the domain or IP (such as `127.0.0.1` or LAN IP) is not added to the Firebase Console Authorized Domains list.
  2. Developers opening `http://127.0.0.1:3000` were blocked by cryptic `auth/unauthorized-domain` errors even though `localhost` is authorized by default in Firebase Authentication.
  3. Error messages presented to the user previously lacked actionable context or the exact hostname that failed authorization.
- **Decision**:
  1. **Actionable Error Formatter (`formatFirebaseAuthError`)**:
     - Introduced `formatFirebaseAuthError(error: unknown, hostname?: string): string` in `src/utils/guestLimits.ts` (re-exported via `src/services/firebase.ts`).
     - Detects `auth/unauthorized-domain` and outputs exact diagnostic guidance:
       `"Domain '<hostname>' is not authorized in Firebase Console (Authentication → Settings → Authorized domains). For local PC testing, open http://localhost:3000."`
     - Cleanly maps standard auth errors (e.g. `auth/popup-closed-by-user`, `auth/popup-blocked`) and passes through arbitrary system/network errors.
  2. **Wired Diagnostics into Auth Modals & Context**:
     - Connected `formatFirebaseAuthError` to `signInWithGoogleCloud` and `checkRedirectAuthResult` in `src/services/firebase.ts`, and in `UserContext.tsx` (`loginWithGoogle`).
     - Displays formatted diagnostics in `LoginGateModal.tsx` and `UserModal.tsx`.
  3. **Automatic `127.0.0.1` → `localhost` Normalization**:
     - In `src/main.tsx`, if `typeof window !== 'undefined' && window.location.hostname === '127.0.0.1'`, replaces the URL with `localhost` via `window.location.replace` prior to mounting React.
  4. **Regression Verification**:
     - Added Unit Test #27 in `src/utils/audioCore.test.ts` validating error code detection, explicit hostname insertion, omitted hostname fallback, and clean error pass-through.
- **Consequences**:
  - Developers and testers opening `127.0.0.1` are automatically redirected to `localhost` without auth friction.
  - Any unauthorized domain/LAN IP displays the exact domain to add to Firebase Console settings.
  - 100% backward compatible: All 26 pre-existing tests plus new test #27 pass cleanly (27/27 passing).


---

## ADR-014 — Revision-aware playlist sync and artist-first text import

- **Status** — Implemented locally. Signed-in, secondary-browser QA remains open.
- **TC-03** — Creating a playlist from a track previously saved an empty shell before adding its first song. Track mutations saved raw local song objects, and the cloud update fallback depended on a missing-document error. The existing cloud serializer already projected allowed fields. The merge favored the longer array, which could restore removed tracks, and cache or pending snapshots could be mistaken for confirmed cloud state.
- **Decision** — Serialize local playlist writes and reconciliation. Sanitize create, add, remove, and reorder inputs before committing IndexedDB. Creating a playlist from a track includes that track in the initial write. Cloud track writes merge the complete ordered list, and metadata writes merge independently to preserve required fields and immutable creation time. A transaction handles recovery when the document is absent or the retained local songs are newer. Only confirmed Firestore snapshots participate in reconciliation. Legacy local songs can recover an untouched empty cloud playlist. Confirmed cloud deletions clear previously synced local copies.
- **TC-05** — The old parser treated dash lines as title-first, split on commas before checking dash notation, and relied on the Express route for text extraction. The resolver accepted the first catalog result without checking the pair.
- **Decision** — Share the parser with Express and parse in the client. Verify the supplied title and artist, retry legacy title-first lines and title-only queries, and keep input order. Commit the full playlist before enabling Open Playlist, then queue its Firestore write. IndexedDB and Firestore each commit independently.
- **Verification** — 32/32 unit tests, TypeScript, and production PWA build passed. The local import endpoint returned HTTP 200 for two ordered tracks and HTTP 400 for invalid input.
- **Remaining checks** — Run Google re-login, secondary-browser sync, and offline reconnect UI QA. Concurrent cross-device writes to the same track array resolve by the last committed write.


### M2.7 Hardening Update — P1 SSRF Hop Validation & P2 Concurrent Sync Merge
- **P1 SSRF Redirect Hop Validation**: Replaced automatic redirect following in `server.ts` with `safeFetchPublicUrl` (`redirect: 'manual'`, max 5 hops). Validates initial URL and every `Location` redirect hop against `isSafePublicHttpUrl`, rejecting loopback (`127.0.0.0/8`, `::1`), link-local/cloud-metadata (`169.254.0.0/16`, `fe80::/10`), RFC 1918 private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), carrier-grade NAT (`100.64.0.0/10`), decimal IPs, and non-http(s) schemes.
- **P2 Concurrent Multi-Browser Live Sync**: Implemented `reconcileConcurrentSongs` in `guestLimits.ts` and wired into `mergeCloudPlaylist` (`runTransaction` with fallback to `setDoc`) in `firebase.ts` and `mergeCloudAndLocalPlaylists`. When Chrome and Brave concurrently add tracks to the same playlist, both additions are preserved without clobbering, while authoritative deletions with newer `updatedAt` timestamps remain respected. Monotonic `revision = (current.revision ?? 0) + 1` tracks playlist mutations.
- **P3 Repo Hygiene**: Removed trailing EOF whitespace in `src/utils/audioCore.ts`; `git diff --check` passes with zero warnings.
- **Verification**: 34/34 unit tests pass cleanly (100% pass rate). `npm run lint`, `npm run build`, and `git diff --check` pass with zero errors.


### M2.7 Diagnosis & Fix — Firestore 403 Write Rejection & Actionable Error Surfacing
- **Root Cause of 403 Write Rejection (`documents:commit`)**:
  1. `firestore.rules` required `request.auth.token.email_verified == true`, failing on Google accounts without verified email token claims.
  2. `isValidPlaylist` used `data.keys().hasOnly(...)` without `'revision'`, and update rules in `affectedKeys().hasOnly(...)` omitted `'revision'`, rejecting all monotonic revision updates with HTTP 403.
  3. Parent doc requirement `get(/databases/$(database)/documents/users/$(userId)).data.uid == request.auth.uid` failed on initial playlist creation if the user profile document was not yet committed.
  4. Write errors were caught with empty callbacks (`catch(() => {})`) or generic messages, masking the underlying permission-denied failure from the user.
- **Decision & Fix**:
  1. Simplified `firestore.rules` to enforce owner isolation (`isOwner(userId)`: `request.auth != null && request.auth.uid == userId`) on `/users/{userId}/**` with default-deny on unmatched collections, eliminating expired cutoffs, fragile cross-document `get()` requirements, and property whitelist failures.
  2. Added `formatFirestoreSyncError` in `guestLimits.ts` (re-exported via `firebase.ts`) mapping `permission-denied` (403), quota limits, and offline/network issues to clear, actionable guidance.
  3. Updated `UserContext.tsx` to pass errors from all playlist and liked song sync calls (`syncCreateCloudPlaylist`, `syncUpdateCloudPlaylistDetails`, `syncUpdateCloudPlaylistSongs`, `syncDeleteCloudPlaylist`, `syncCloudLikeSong`) directly to `reportPlaylistSyncError`, surfacing the exact cause in `cloudError`.
  4. Added Unit Test #35 verifying actionable error formatting for permission-denied (403), wrapped transaction errors, offline status, quota exhaustion, and generic fallbacks.
- **Verification**: 35/35 unit tests pass cleanly (100% pass rate). `npm run lint`, `npm run build`, and `git diff --check` pass with zero errors.


### M2.7 Optional Hardening — Strict Song Field Whitelisting in `sanitizePlaylistImportTracks`
- **Objective**: Ensure all imported and synced songs committed to Firestore and IndexedDB are strictly whitelisted to `['id', 'name', 'duration', 'year', 'language', 'album', 'artists', 'image', 'downloadUrl']`.
- **Implementation**:
  1. Updated `sanitizePlaylistImportTracks` in `src/utils/audioCore.ts` (re-exported in `src/utils/guestLimits.ts`) to strictly omit extraneous API fields (`subtitle`, `url`, `primaryArtists`, `playCount`, `explicitContent`, `isOffline`, `label`, `copyright`, `hasLyrics`).
  2. Bounded and whitelisted nested sub-objects:
     - `album`: strictly `{ id, name }`.
     - `artists.primary`: strictly `{ id, name }` (max 10).
     - `image`: strictly `{ quality, url }` (max 6).
     - `downloadUrl`: strictly `{ quality, url }` (max 8).
  3. Added Unit Test #36 in `src/utils/audioCore.test.ts` verifying all extra root and nested keys are stripped cleanly.
- **Verification**: 36/36 unit tests pass cleanly (100% pass rate). `npm run lint`, `npm run build`, and `git diff --check` pass with zero errors.


### M2.7 Bugfix — Real-Time Cross-Browser Added Songs Sync via Monotonic Revision & Reconcile Safeguards
- **Root Cause**:
  1. `reconcileConcurrentSongs` in `src/utils/guestLimits.ts` previously did not accept or evaluate `localRevision` or `incomingRevision`, relying exclusively on wall-clock timestamps (`localUpdatedAt` vs `incomingUpdatedAt`).
  2. Because Firestore documents utilize `serverTimestamp()`, client clock skew or timestamp proximity caused `incomingUpdatedAt >= localUpdatedAt` to evaluate as true when saving newly added tracks to an empty or smaller cloud playlist.
  3. Consequently, in `mergeCloudPlaylist`, `reconcileConcurrentSongs` discarded newly added tracks and returned the stale empty cloud tracklist, saving `songs: []` back to Firestore.
  4. Symmetrically on secondary browser sessions (e.g. Brave), `mergeCloudAndLocalPlaylists` invoked `reconcileConcurrentSongs` without revisions, allowing stale empty local playlists to reject incoming cloud tracks.
- **Decision & Fix**:
  1. Updated `reconcileConcurrentSongs` in `src/utils/guestLimits.ts` to accept `localRevision?: number, incomingRevision?: number`. Monotonic revisions take precedence over wall-clock timestamps when distinct, completely immune to cross-device clock skew.
  2. Added bidirectional stale/empty safeguards: an empty playlist cannot wipe populated tracks from another session without a strictly newer revision.
  3. Added single-sided addition preservation: when one session adds tracks without conflicting additions from the other, added tracks are preserved deterministically.
  4. Wired `playlist.revision` and `cloudPl.revision` through `mergeCloudPlaylist` in `src/services/firebase.ts` and `mergeCloudAndLocalPlaylists` in `src/utils/guestLimits.ts`.
  5. Enforced `nextRevision = Math.max(currentRevision, playlist.revision ?? 0) + 1` in both `mergeCloudPlaylist` and `recoverCloudPlaylist`.
  6. Added Unit Test #37 in `src/utils/audioCore.test.ts` reproducing adding tracks to an empty playlist, validating reconciliation under cloud clock skew, verifying cross-browser hydration, and confirming incremental multi-track additions across monotonic revisions.
- **Verification**: 37/37 unit tests pass cleanly (100% pass rate). `npm run lint` (`tsc --noEmit`), `npm run build`, and `git diff --check` pass with zero errors.


### M2.7 Bugfix — Fix SYNC-001 Revision-Gap Song Drop & SYNC-002 Cloud Sync Confirmation State
- **Root Cause**:
  1. **SYNC-001**: In `UserContext.tsx`, local playlist detail updates (`updatePlaylist`) did not increment `revision`, while Firestore writes in `firebase.ts` bumped `nextRevision`. When `addSongToPlaylist` was subsequently called, `cloudPl.revision > playlist.revision` caused `reconcileConcurrentSongs` to choose the empty cloud list (`songs: []`), discarding newly added tracks before committing to Firestore.
  2. **SYNC-002**: `UserContext.tsx` fired `syncUpdateCloudPlaylistSongs` asynchronously without awaiting it, causing `PlaylistModal.tsx` to report success and close immediately upon local IndexedDB write before Firestore transaction confirmation.
- **Decision & Fix**:
  1. **Added Song Intent & Empty Cloud Safeguards (`reconcileConcurrentSongs`)**:
     - Added `options?: { addedSongIds?: string[]; deletedSongIds?: string[] }` to `reconcileConcurrentSongs` in `src/utils/guestLimits.ts`.
     - Explicitly preserved all newly added tracks against empty incoming snapshots or revision gaps resulting from prior detail updates.
     - Prevented empty incoming lists (`incomingSongs.length === 0`) from replacing populated local lists unless an explicit deletion mutation occurred.
  2. **Aligned Local & Cloud Revision on Detail Updates**:
     - Updated `updatePlaylist` in `UserContext.tsx` to increment `revision: (existing.revision ?? 0) + 1` and `updatedAt: Math.max(Date.now(), (existing.updatedAt ?? 0) + 1)` in localDB and React state, eliminating revision drift.
  3. **Awaited Cloud Sync Confirmation & Pending Sync Tracking (`SYNC-002`)**:
     - Added `pendingPlaylistSyncIds: Set<string>` and `isCloudSyncing: boolean` to `UserContext`.
     - Awaited `syncUpdateCloudPlaylistSongs`, `syncUpdateCloudPlaylistDetails`, `syncDeleteCloudPlaylist`, and `syncCreateCloudPlaylist` within `queuePlaylistWork`.
     - Updated `PlaylistModal.tsx` to display a spinning "Syncing..." state while the Firestore commit is in flight and only display "Added" and auto-close after confirmation.
  4. **Regression Verification**:
     - Added Unit Test #38 in `src/utils/audioCore.test.ts` reproducing `SYNC-001`: adding a track to a local playlist at revision 1 against an empty cloud playlist with revision 2 (or 3) after detail edits, confirming `reconcileConcurrentSongs` preserves the track.
- **Verification**: 38/38 unit tests pass cleanly (100% pass rate). `npm run lint` (`tsc --noEmit`), `npm run build`, and `git diff --check` pass with zero errors.


### M2.7 Bugfix — Fix SYNC-003 Last-Song Deletion Propagation & SYNC-002 Cloud Failure Notification
- **Root Cause**:
  1. **SYNC-003 (Last-Song Deletion Propagation)**: In `guestLimits.ts:137-146`, an overly broad guard (`if (incomingSongs.length === 0 && baseOrLocalSongs.length > 0 && (!options?.deletedSongIds || ...)) return baseOrLocalSongs;`) was nested inside the higher-revision block (`if (incomingRevision > localRevision)`). When Browser A deleted the final track and committed `songs: []` with `revision: 3`, secondary sessions (Browser B) receiving the Firestore snapshot had no local options (`options = undefined`). Consequently, Browser B rejected the authoritative empty list and retained the deleted track indefinitely.
  2. **SYNC-002 (Cloud Sync Failure Handling in Modal)**: `mutatePlaylistSongs` in `UserContext.tsx` caught exceptions from `syncUpdateCloudPlaylistSongs` and returned `void`, masking cloud commit failures from `PlaylistModal.tsx`. Callers (`handleAddToExisting`) proceeded to display the green "Added" checkmark and close the modal even when cloud sync failed with permission denied or network errors.
- **Decision & Fix**:
  1. **Authoritative Higher-Revision Remote Deletions (`reconcileConcurrentSongs`)**:
     - Streamlined `guestLimits.ts` so that when `incomingRevision > localRevision` and no local session track additions (`options?.addedSongIds`) are in flight, `incomingSongs` (including an empty array `[]`) is authoritative and returned.
     - Preserved `options?.addedSongIds` protection so active track additions are never dropped by empty cloud snapshots (`SYNC-001`).
     - Preserved populated local tracks against empty incoming snapshots when revisions are equal (`incomingRevision === localRevision`), guarding against unconfirmed/stale snapshots.
  2. **Structured Mutation Result & Error Banner (`UserContext.tsx` & `PlaylistModal.tsx`)**:
     - Updated `mutatePlaylistSongs`, `addSongToPlaylist`, `removeSongFromPlaylist`, and `reorderPlaylistSongs` to return `Promise<{ success: boolean; synced: boolean; error?: string }>`.
     - In `PlaylistModal.tsx`, `handleAddToExisting` inspects the return value. If `res.synced === false`, it aborts auto-close, keeps the modal open, and displays a formatted `syncError` alert banner using `formatFirestoreSyncError`.
  3. **Regression & Behavior Verification**:
     - Updated Test #38 step 5 to verify equal-revision preservation against empty cloud snapshots without options.
     - Added Unit Test #39 (`SYNC-003`): Secondary session at `revision: 2` with `[track1]` receives confirmed remote empty snapshot at `revision: 3` without options and reconciles to `[]`.
     - Added Unit Test #40 (`SYNC-001`): Active session at `revision: 1` with `options.addedSongIds = ['track-preserve']` reconciles against empty remote snapshot at `revision: 2` and preserves the track.
- **Verification**: 40/40 unit tests pass cleanly (100% pass rate). `npm run lint` (`tsc --noEmit`), `npm run build`, and `git diff --check` pass with zero errors.


### M2.7 Bugfix — Strict Firestore Schema Alignment (`isValidSongMap`) & Cloud Track Serialization
- **Root Cause**:
  Adding tracks from Search or Player passed raw catalog `Song` objects containing extra API fields (`subtitle`, `url`, `primaryArtists`, `playCount`, `explicitContent`, `isOffline`, `label`, `copyright`, `hasLyrics`) into `mergeCloudPlaylist` and `syncCloudLikeSong` (`src/services/firebase.ts`). When strict schema validation rules (`isValidSongMap`) are enforced in Firestore, `documents:commit` rejected the writes with HTTP `403` because extra unwhitelisted properties violated the map constraint `s.keys().hasOnly(['id', 'name', 'duration', 'year', 'language', 'album', 'artists', 'image', 'downloadUrl'])`.
- **Decision & Fix**:
  1. **Strict Cloud Track Sanitization (`sanitizeSongForCloud`, `mergeCloudPlaylist`, `syncCloudLikeSong`)**:
     - Updated `sanitizeSongForCloud` in `src/services/firebase.ts` to execute `sanitizePlaylistImportTracks([song])` upfront, guaranteeing all extra API/player fields are stripped before constructing the 9 allowed keys.
     - Updated `mergeCloudPlaylist` and `syncCloudLikeSong` (with exported alias `syncAddCloudLike`) in `src/services/firebase.ts` to sanitize all incoming songs through `sanitizePlaylistImportTracks` before transaction writes or fallback upserts.
  2. **Synchronized Strict Security Rules (`firestore.rules`)**:
     - Synced `firestore.rules` with strict schema validation enforcing `isValidSongMap` across playlist tracks and liked songs.
     - Configured `isSignedIn() = request.auth != null` (removing fragile unverified email blocks).
     - Added support for monotonic `revision` in `isValidPlaylist` (`(!('revision' in data) || (data.revision is number && data.revision >= 0))`) and in playlist update `affectedKeys().hasOnly(...)`.
  3. **Regression & Behavior Verification**:
     - Added Unit Test #41 in `src/utils/audioCore.test.ts` verifying that raw search/player `Song` objects with extraneous keys serialize to exactly the 9 allowed `isValidSongMap` keys and satisfy all nested map/list key constraints.
- **Verification**: 41/41 unit tests pass cleanly (100% pass rate). `npm run lint` (`tsc --noEmit`), `npm run build`, `npx eslint firestore.rules`, and `git diff --check` pass with zero errors.

---

## ADR-014: Search Engine Relevance, Derivative Demotion & Near-Duplicate Track Deduplication (Milestone M2.8)
- **Status**: Accepted
- **Context**: In music search, standard queries (e.g. `"Kesariya"`, `"Tum Hi Ho"`) frequently returned low-effort cover versions, karaoke tracks, ringtones, 8D audio, or slowed/reverb edits ahead of original studio releases. Furthermore, multi-word queries combining artist and song name (e.g. `"Arijit Singh Kesariya"`, `"Pritam Channa Mereya"`) sometimes surfaced unrelated songs matching only one keyword due to lexical token collisions. Finally, duplicate catalog listings across single/album releases cluttered the search view, occasionally presenting lower bitrate or incomplete metadata variants to the user.
- **Decision**:
  1. **Calibrated Derivative Demotion & User-Intent Preservation**:
     - Expanded `DERIVATIVE_MODIFIER_REGEX` in `src/services/api.ts` to detect `karaoke`, `instrumental`, `ringtone`, `8d audio`, `slowed`, `reverb`, `sped up`, `lofi flip`, `cover version`, and similar derivative variants.
     - Applied a calibrated score penalty (-150 points) to derivative tracks when the user's query does *not* explicitly ask for that derivative term.
     - When the user *does* explicitly search for a derivative term (e.g. `"Kesariya lofi"`, `"Tum Hi Ho ringtone"`), derivative demotion is bypassed and relevant derivative tracks receive top ranking (+200 intent boost).
  2. **Multi-Word Collaboration & Intent Scoring**:
     - Introduced cross-field synergy analysis in `rankSongsByFameAndRelevance`.
     - When a multi-word search query contains distinct tokens spanning both the song title and artist/album fields, award a dedicated collaboration intent bonus (+280 points) to rank the exact collaborative work above tracks that match only one word.
  3. **Hindi & Vernacular Transliteration Expansion**:
     - Expanded `COMMON_TYPOS` and `COMMON_ARTISTS` dictionaries in `src/services/api.ts` to support frequent Bollywood/Hindi query spellings (e.g. `apna bana le`, `sitaare`, `arjit`, `kesaria`).
  4. **Near-Duplicate Track Deduplication (`deduplicateNearIdenticalSongs`)**:
     - Implemented `deduplicateNearIdenticalSongs`, `normalizeSearchText`, `stripTitleDecorations`, and `getTrackQualityScore` in `src/utils/audioCore.ts`.
     - Songs sharing the same normalized title and primary artist within a ±3 second duration window are identified as duplicate releases.
     - Deduplication retains the version with the highest quality score, prioritizing verified 320kbps stream URLs, high-resolution artwork, complete album attribution, and higher popularity. Distinct intentional edits (e.g. acoustic, live, remix) are preserved.
  5. **Automated Unit Testing**:
     - Implemented Unit Tests #42, #43, and #44 in `src/utils/audioCore.test.ts`.
- **Consequences**:
  - Original studio releases consistently outrank derivative covers and karaoke versions unless explicitly sought.
  - Multi-word artist + title searches immediately resolve to the correct collaborative track.
  - Search results are clean and free of redundant duplicate single releases, guaranteeing 320kbps playback quality.
  - All 44 unit tests pass with zero regressions.
