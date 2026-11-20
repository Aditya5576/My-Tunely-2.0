# AGENTS.md — Agent Governance & Operational Rules

## 1. Project Overview & Context
- **Application Name**: My Tunely 2.0 (Tunely 2.0)
- **Repository**: `https://github.com/Aditya5576/My-Tunely-2.0.git`
- **Purpose**: High-performance, offline-first Progressive Web Application (PWA) for music streaming, synchronized lyrics display, audio mastering/equalization, playlist import across platforms (Spotify, Apple Music, YouTube, JioSaavn), and offline playback using IndexedDB audio blobs.
- **Author/Creator**: Aditya Patil

---

## 2. Technology Stack & Runtime Architecture
- **Language**: TypeScript 7.0 (Strict typing, ES2022 target, bundler module resolution)
- **Frontend Framework**: React 19 (`react` 19.0.1, `react-dom` 19.0.1)
- **Build Tool & Dev Server**: Vite 8.3 (`@vitejs/plugin-react`, `vite-plugin-pwa`)
- **Backend / BFF Server**: Express 4.21 (`server.ts` executed via `tsx`)
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite` + `@tailwindcss/postcss`)
- **Motion & Icons**: Motion 12 (`motion`), Lucide React (`lucide-react`)
- **Audio Engine**: Web Audio API (`AudioContext`, BiquadFilterNodes, DynamicsCompressorNode, WaveShaper soft ceiling) + HTMLAudioElement + MediaSession API
- **Offline Storage**: IndexedDB via native wrapper (`TunelyDB_v1` in `src/services/db.ts`)
- **Cloud & Auth**: Firebase 13 (`firebase/auth`, `firebase/firestore` with offline persistent cache)
- **AI Integrations**: Google GenAI SDK (`@google/genai`) for AI music suggestions

---

## 3. Standard Operational Commands

```bash
# Install dependencies (.npmrc sets legacy-peer-deps automatically)
npm install

# Development server (starts Express server + Vite middleware on port 3000)
npm run dev

# Production build (Vite client build + PWA service worker compilation)
npm run build

# Preview production build
npm run preview

# Clean build artifacts
npm run clean

# TypeScript typecheck & linting
npm run lint

# Run unit tests (via tsx and Node.js built-in test runner)
npm test
```

---

## 4. Antigravity & Agent Invariants

1. **One Main Agent Only**: No delegating to subagents or running uncoordinated parallel workers.
2. **Inspect Before Mutating**: Always inspect `AI_RULES.md`, `AI_BRAIN.md`, and `PROJECT_INDEX.md` before editing. Never scan `node_modules/`, `.git/`, `dist/`, `build/`, or `coverage/`.
3. **Local Scope & Zero Unrelated Refactoring**: Keep code modifications strictly scoped (`TINY` / `SMALL` / `MEDIUM`). Do not reformat or rewrite working code.
4. **Preserve All Work**: Never discard staged, unstaged, or untracked local changes.
5. **Forbidden Git Commands**: Strictly NO `git reset --hard`, `git clean -fd`, or forced pushes (`git push --force`). Local verification only; NO pushing or merging without explicit approval.
6. **No Secret Leaks**: Never print, log, or commit `.env*` secrets, Firebase private keys, or API tokens.
7. **Evidence-Based Reporting**: Never fabricate test or typecheck results. Always report exact console outputs, changed files, and pass counts.
8. **Zero-Regression & Feature Preservation**: Existing verified features (Audio DSP Chain, offline IndexedDB playback, synchronized lyrics, universal playlist importer, and all automated unit tests) must never regress. Always run `npm test`, `npm run lint`, and `npm run build` to confirm zero regression before completing any task.
