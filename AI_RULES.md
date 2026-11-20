# AI_RULES.md — Engineering Invariants & Coding Rules

## 1. Core Operating Invariants

- **Execution Flow**: Every task must follow the strict sequence:
  `ANALYZE → PLAN → IMPLEMENT → TEST → VERIFY → DOCUMENT`
- **Scope Discipline**: Changes must be minimal, surgical, and classified (`TINY`, `SMALL`, `MEDIUM`, or `LARGE`). Refactoring outside the declared task objective is strictly forbidden.
- **Evidence Requirement**: Claims of "verified" or "tests pass" must be backed by actual CLI execution output from the current session.
- **Zero-Regression & Feature Preservation (MANDATORY)**:
  Existing verified features must NEVER break when introducing new features, refactoring, or fixing bugs:
  1. **Audio DSP Chain**: 5-band biquad EQ, bass boost, DynamicsCompressor, and WaveShaper soft ceiling.
  2. **Offline-First Playback**: IndexedDB audio blobs (`TunelyDB_v1` / `offline_tracks`) must play without network.
  3. **Synchronized Lyrics**: LRCLIB search/exact match and auto-scrolling synchronization in FullPlayer.
  4. **Universal Playlist Importer**: Multi-platform SSR link extraction (Spotify, Apple Music, YouTube, JioSaavn) and manual tracklist parser.
  5. **Automated Verification**: `npm test` (all unit tests), `npm run lint` (`tsc --noEmit`), and `npm run build` must pass before marking any task complete.

---

## 2. TypeScript & Code Style Standards

1. **Strict Types Only**:
   - Do NOT use `any` unless mapping untrusted third-party incoming API data, and even then immediately normalize into a typed entity (e.g. `normalizeSong(raw: any): Song`).
   - All component props, function parameters, and return types must be explicitly typed.
2. **Path Aliasing**:
   - Use the configured `@/*` alias mapping to the project root where applicable (configured in `tsconfig.json` and `vite.config.ts`).
3. **No Unused Code**:
   - Every import, variable, and helper function must be actively used. `tsc --noEmit` is run on every task and must pass with zero diagnostics.

---

## 3. React 19 & State Management Guidelines

1. **Component Purity**:
   - Keep UI components decoupled from low-level audio hardware. Use the singleton hooks (`useAudio`, `useTheme`, `useUser`) rather than directly instantiating services.
2. **Audio Pre-Buffering & Resource Preservation**:
   - `useAudio` uses a shared singleton coordinator (`hookSubscribers`, `layer2CurrentAudio`, `layer2NextAudio`). Never spawn duplicate `new Audio()` elements inside individual UI components.
3. **Modal & Viewport Scrolling**:
   - The shell enforces fixed viewport heights with iOS momentum scrolling (`-webkit-overflow-scrolling: touch`).
   - When a modal opens (`anyModalOpen` in `App.tsx`), `overflow: hidden` must be maintained on `document.documentElement` and `document.body` to prevent dual-scroll bouncing.

---

## 4. Audio Engine & DSP Safety Rules

1. **Clipping & Distortion Prevention**:
   - All EQ boosts must pass through `clampEqGain` (-8 dB to +8 dB) and soft ceiling shaping (`createSoftCeilingCurve` tanh waveshaper).
   - Never remove the DynamicsCompressor or WaveShaper nodes from the audio chain.
2. **iOS & Mobile Background Playback & MediaSession Controls**:
   - Always update `navigator.mediaSession` metadata (`title`, `artist`, `album`, `artwork`) on song change.
   - For iOS Lock Screen and Control Center compatibility, NEVER register `seekbackward` or `seekforward` handlers—keep them explicitly cleared to `null` so iOS renders Next Track and Previous Track buttons instead of 15s skip buttons.
   - Respect auto-resume logic after audio interruptions (calls, Siri, system alerts) without triggering infinite restart loops.
3. **Bitrate Selection Fallback**:
   - Always use `resolveBestStreamUrl` to pick the user's preferred bitrate (`320kbps`, `160kbps`, `96kbps`, `48kbps`, `12kbps`) or gracefully fallback to the nearest available stream.

---

## 5. Storage & Database Rules

1. **Dual Offline / Cloud Parity**:
   - All library operations (Likes, Playlists, History) MUST update local IndexedDB (`localDB`) first so the app remains fully functional in airplane mode.
   - Cloud synchronization (`syncCloudLikeSong`, `syncCreateCloudPlaylist`, etc.) must run asynchronously and tolerate offline failures gracefully without throwing unhandled exceptions.
2. **IndexedDB Versioning**:
   - Database name is `TunelyDB_v1` (Version 2). Do NOT alter object store schemas without providing migration steps in `onupgradeneeded`.
3. **Audio Blob Management**:
   - Audio blobs stored in `offline_tracks` must include `song`, `audioBlob`, `quality`, `sizeBytes`, and `userEmail`.
   - Always revoke Object URLs (`URL.revokeObjectURL`) when changing tracks or discarding offline audio buffers to prevent memory leaks.

---

## 6. Forbidden Operations

- ❌ **NO `git reset --hard` or `git clean -fd`**: Never discard existing untracked or modified files.
- ❌ **NO remote Git commands**: Never run `git push`, branch pushes, or PR merges without explicit authorization.
- ❌ **NO secrets exposure**: Never log or commit values from `.env*`, `firebase-applet-config.json`, or API tokens.
- ❌ **NO direct source modification during read-only / audit tasks**.
