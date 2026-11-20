# PROJECT_INDEX.md — Exhaustive Repository Index & File Catalog

> **Note for AI Agents**: Consult this index to identify relevant files, exports, and responsibilities before reading or modifying code. Never scan `node_modules/`, `.git/`, `dist/`, or `dev-dist/`.

---

## 1. Root Configuration & Server Files

| Path | Lines | Key Exports / Identifiers | Primary Responsibility |
|:-----|:-----:|:--------------------------|:-----------------------|
| `.firebaserc` | 15 | Firebase Project Configuration | Maps default deployment target to project `my-tunely` with target `tunely -> my-tunely`. |
| `firebase.json` | 63 | Firebase Hosting Config | Configures static PWA hosting (`dist`) for target `tunely`, SPA rewrite `** -> /index.html`, and PWA cache-control headers including `/`. |
| `.npmrc` | 1 | `legacy-peer-deps=true` | NPM configuration enabling automatic peer dependency resolution. |
| `package.json` | 42 | Scripts: `dev`, `build`, `lint`, `test`, `preview` | NPM dependencies, build & test scripts, package metadata (`my-tunely-2`). |
| `tsconfig.json` | 28 | TS Compiler Configuration | Compiler flags (ES2022, bundler module resolution, path alias `@/*`). |
| `vite.config.ts` | 147 | `default export defineConfig` | Vite bundler plugins (React, Tailwind CSS v4, VitePWA with Workbox caching, Rollup manualChunks). |
| `server.ts` | 731 | `startServer`, `cleanVideoTitleNoise`, `isSafePublicHttpUrl`, `safeFetchPublicUrl` | Express BFF server handling lyrics and link imports with SSRF redirect hop validation. Shares the text parser with the client. |
| `.env.example` | 8 | `GEMINI_API_KEY`, `APP_URL` | Environment variable template for Gemini AI API and deployment host URL. |
| `eslint.config.js` | 7 | ESLint Flat Config | Security rules for Firestore linting. |
| `firestore.rules` | 196 | Strict Schema Security Rules | Comprehensive owner isolation and strict schema validation (`isValidSongMap`, `isValidPlaylist` with monotonic `revision` support, `isValidLikedSong`, `isValidUserProfile`, and `isSignedIn() = request.auth != null`). |
| `firebase-applet-config.json` | 12 | Project Configuration | Public Firebase client configuration credentials. |
| `firebase-blueprint.json` | 161 | Blueprint Schema | Schema and index definitions for Firestore collections. |
| `security_spec.md` | 22 | Documentation | Security specification and compliance notes. |
| `metadata.json` | 6 | Metadata | Project app metadata. |
| `index.html` | 30 | HTML5 Template | Web app entry point, PWA meta tags, Google fonts, and root container. |

---

## 2. Core Source Types & Utilities (`src/`)

| Path | Lines | Key Exports / Identifiers | Primary Responsibility |
|:-----|:-----:|:--------------------------|:-----------------------|
| `src/main.tsx` | 9 | React DOM Root | Bootstraps React 19 application into `#root` with automatic `127.0.0.1` -> `localhost` normalization. |
| `src/App.tsx` | 324 | `default export App`, `MainApp` | Shell coordinator managing active tabs, navigation, modals, guest playback tracking, and edge-to-edge layout. |
| `src/index.css` | 360 | CSS Variables & Animations | Tailwind styles, color theme palettes (Midnight, Obsidian, Emerald, Crimson, Daylight), custom animations. |
| `src/types/music.ts` | 124 | `Song`, `Playlist`, `UserProfile`, `DownloadedTrack`, `AudioQuality`, `EqBands`, `SoundProfile`, `LyricsPayload` | Domain types, including optional monotonic playlist revision and cloud confirmation fields. |
| `src/utils/audioCore.ts` | 819 | `SOUND_PROFILE_PRESETS`, `clampEqGain`, `computeEffectiveEqBands`, `computeHeadroomAttenuation`, `sanitizePlaylistImportTracks`, `parseLrcLyrics`, `registerMediaSessionActions`, `cleanHtmlEntities`, `formatTime`, `resolveBestStreamUrl`, `shuffleQueue`, `deduplicateNearIdenticalSongs`, `normalizeSearchText`, `stripTitleDecorations`, `getTrackQualityScore` | Pure deterministic helper functions for lyrics parsing, bitrate selection, queue management, DSP presets, headroom attenuation, strict playlist import track whitelisting and sanitization, MediaSession action registration, and near-duplicate track deduplication. |
| `src/utils/guestLimits.ts` | 503 | `withPlaylistSongs`, `mergeCloudAndLocalPlaylists`, `reconcileConcurrentSongs`, `isSafePublicHttpUrl`, `safeFetchPublicUrl`, `formatFirebaseAuthError`, `formatFirestoreSyncError`, `sanitizePlaylistImportTracks` | Guest limits, SSRF URL security, concurrent multi-browser sync reconciliation, revision tracking, added song intent preservation, actionable sync error diagnostics, and track sanitization re-export. |
| `src/utils/playlistText.ts` | 89 | `parseRawTrackList`, `resolveTextPlaylistTrack`, `TextPlaylistTrack` | Shared text parser and verified catalog matching. |
| `src/utils/audioCore.test.ts` | 1600 | 47 unit tests (node:test) | Audio, search relevance & derivative ranking (#42), collaboration intent (#43), near-duplicate deduplication (#44), guest quotas, sync merge, track sanitization & whitelisting, text parsing, SSRF hop validation, concurrent sync, added songs sync, revision-gap preservation, last-song deletion propagation (SYNC-003), cloud song schema serialization (Unit 41), and Firestore error diagnostics. |
| `src/utils/imageUtils.ts` | 63 | `getHighResImageUrl`, `getProxiedImageUrl` | Helpers to upscale and fallback album cover images from CDN URLs. |

---

## 3. Services & State Management (`src/services/`, `src/context/`, `src/hooks/`)

| Path | Lines | Key Exports / Identifiers | Primary Responsibility |
|:-----|:-----:|:--------------------------|:-----------------------|
| `src/services/db.ts` | 431 | `localDB`, `LocalDatabase`, `savePlaylist` | IndexedDB stores and cached search. Playlist writes resolve after transaction commit. |
| `src/services/api.ts` | 1295 | `musicAPI`, `importPlaylistFromLink`, `rankSongsByFameAndRelevance` | Catalog search, ordered import resolution, multi-tier search relevance ranking, derivative demotion, typo expansion, track deduplication, and direct upstream HTTPS fallback for static hosting. |
| `src/services/audioEngine.ts` | 2261 | `audioEngine`, `AudioEngine` | High-fidelity Web Audio API engine managing playback, dynamic headroom attenuation, 5-band EQ, de-zippered master gain, soft ceiling limiter, MediaSession, and sleep timer. |
| `src/services/firebase.ts` | 555 | `syncCreateCloudPlaylist`, `syncUpdateCloudPlaylistSongs`, `recoverCloudPlaylist`, `subscribeCloudLibrary` | Firestore merge writes with monotonic revision tracking, transaction recovery, confirmed playlist snapshots, authentication and preferences. |
| `src/context/UserContext.tsx` | 935 | `UserProvider`, `useUser`, `reorderPlaylistSongs` | Authentication, local-first playlist writes, serialized reconciliation, likes, downloads, guest quotas, cloud sync pending tracking, and actionable cloudError surfacing. |
| `src/context/ThemeContext.tsx` | 170 | `ThemeProvider`, `useTheme`, `THEME_OPTIONS`, `FONT_OPTIONS` | React context providing dynamic theme and font customization with local storage persistence. |
| `src/hooks/useAudio.ts` | 396 | `useAudio`, `PrebufferStatus` | React hook connecting components to `audioEngine` with singleton dual-layer slow-network pre-buffering. |
| `src/hooks/useOnlineStatus.ts` | 17 | `useOnlineStatus` | Hook tracking `navigator.onLine` with event listeners for `online` and `offline`. |
| `src/hooks/usePWAInstall.ts` | 73 | `usePWAInstall` | Hook capturing the `beforeinstallprompt` browser event for PWA installation. |

---

## 4. Views & Screens (`src/views/`)

| Path | Lines | Key Exports / Identifiers | Primary Responsibility |
|:-----|:-----:|:--------------------------|:-----------------------|
| `src/views/HomeView.tsx` | 432 | `HomeView` | Discover feed, trending songs, hero banner, genre pills, personalized quick actions, and recent history. |
| `src/views/SearchView.tsx` | 359 | `SearchView` | Live search input with 2-char minimum debouncing, guest search quota tracking, recent searches, and offline catalog fallback. |
| `src/views/LibraryView.tsx` | 484 | LibraryView | Playlists, likes, history and track management. |
| `src/views/DownloadsView.tsx` | 157 | `DownloadsView` | Offline downloaded tracks list, storage consumption indicator, clear cache, and offline playback. |

---

## 5. UI Components & Modals (`src/components/`)

| Path | Lines | Key Exports / Identifiers | Primary Responsibility |
|:-----|:-----:|:--------------------------|:-----------------------|
| `src/components/FullPlayerModal.tsx` | 590 | `FullPlayerModal` | Full-screen player sheet with cover art, synchronized LRC lyrics, EQ presets, scrubber, and playback controls. |
| `src/components/MiniPlayer.tsx` | 120 | `MiniPlayer` | Docked persistent player bar showing current track, progress bar, play/pause, next track, and expand trigger. |
| `src/components/Header.tsx` | 113 | `Header` | Sticky top navigation bar with brand logo, sound mastering button, theme switcher, and user avatar. |
| `src/components/BottomNav.tsx` | 67 | `BottomNav`, `NavTab` | Fixed bottom mobile tab navigation (Home, Search, Library, Downloads). |
| `src/components/SongRow.tsx` | 276 | SongRow | Song controls and playlist track ordering actions. |
| `src/components/SongCard.tsx` | 86 | `SongCard` | Compact vertical grid card for songs in curated sections and recommendations. |
| `src/components/QueueDrawer.tsx` | 132 | `QueueDrawer` | Up next queue slide-out drawer with track reordering and clear queue. |
| `src/components/PlaylistModal.tsx` | 881 | PlaylistModal, PlaylistModalInitialMode | Playlist creation, editing, and link or text import with auth checks, sync state tracking, and Open Playlist action. |
| `src/components/AudioQualityModal.tsx` | 439 | `AudioQualityModal` | Modal for selecting streaming bitrates (12kbps–320kbps) and fine-tuning 5-band EQ and bass boost. |
| `src/components/SleepTimerModal.tsx` | 101 | `SleepTimerModal` | Modal to set automatic playback sleep timers (5m, 15m, 30m, 45m, 60m, end of song). |
| `src/components/UserModal.tsx` | 414 | `UserModal` | Account settings modal with Google profile, cloud sync status, guest quota indicator, and audio preferences. |
| `src/components/LoginGateModal.tsx` | 180 | `LoginGateModal` | Welcome & device gate modal for Google sign-in and guest mode selection with feature showcases. |
| `src/components/AppearanceModal.tsx` | 162 | `AppearanceModal` | Modal to customize visual themes (5 palettes) and display typography (5 fonts). |
| `src/components/OfflineIndicator.tsx` | 14 | `OfflineIndicator` | Subtle top alert banner displayed when the device is offline. |
| `src/components/PWAInstallButton.tsx` | 61 | `PWAInstallButton` | UI button prompting user to install the application as a standalone PWA. |
| `src/components/IOSInstallGuide.tsx` | 98 | `IOSInstallGuide` | Step-by-step visual sheet guiding iOS Safari users to "Add to Home Screen". |
| `src/components/SplashScreen.tsx` | 103 | `SplashScreen` | Animated initial boot splash screen displaying Tunely branding. |
| `src/components/TunelyLogo.tsx` | 31 | `TunelyLogo` | SVG brand icon component with animated gradient wave. |

## M4 Queue, Recovery and Safe-Area Update
- src/services/audioEngine.ts: live-state natural completion; guarded AudioSession; context-aware recovery and MediaSession state; passive gesture hooks.
- src/utils/audioCore.ts: resolveNextTrackIndex, shouldAttemptAudioContextResume, resolveEffectivePlaybackState.
- src/utils/audioCore.test.ts: 47 tests including M4 cases 45-47.
- index.html: zoom-enabled viewport-fit=cover.
- src/App.tsx and src/components/FullPlayerModal.tsx: horizontal safe-area shells.
- src/index.css: full bottom safe areas for navigation, player and modal; shared horizontal inset utility.