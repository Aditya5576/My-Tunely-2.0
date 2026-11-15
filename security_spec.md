# Security Specification & Hardened Rules Audit (Tunely 2.0)

## 1. Data Invariants
1. **Default-Deny Global Root**: Every path not explicitly matched is denied (`allow read, write: if false`).
2. **Verified Owner Isolation (`/users/{userId}`)**: Access requires `request.auth != null`, `request.auth.token.email_verified == true`, valid alphanumeric/underscore/hyphen ID (`isValidId`), and `request.auth.uid == userId`. Directory listing (`list`) of `/users` is explicitly disabled (`false`).
3. **Email & Avatar Anti-Spoofing**: Profile `email` must match `request.auth.token.email` (when present on the token) and is immutable after creation. Optional `avatarUrl` must use `https://` and stay `<= 512` chars.
4. **Master Gate (`/users/{userId}/playlists` & `/users/{userId}/likedSongs`)**: Every create/update verifies parent `/users/{userId}` ownership synchronously via `get(/databases/$(database)/documents/users/$(userId)).data.uid == request.auth.uid`, blocking orphaned writes.
5. **Bounded Embedded Track Payloads (`isValidSongMap`)**: Every track object stored inside `playlists.songs` (head `[0]` and tail `[size - 1]`) or `likedSongs.song` enforces strict allowlisted keys (`hasOnly`), valid IDs, clamped durations (`0..86400`), and bounded nested maps/lists (`album`, `artists`, `image`, `downloadUrl`).
6. **Temporal Integrity & Action-Based Updates**: `createdAt`, `updatedAt`, and `likedAt` must equal `request.time`; `uid`, `email`, `id`, `ownerId`, and `createdAt` remain immutable; updates only mutate explicitly allowlisted field subsets (`affectedKeys().hasOnly(...)`).
7. **Secure List Queries**: `allow list` on `playlists` and `likedSongs` validates `existing().ownerId == request.auth.uid` without `get()`/`exists()` calls, forcing queries to filter by `ownerId`.

## 2. Adversarial Red Team Test Cases Verified
1. **Unauthenticated read/write** (`request.auth == null`) -> `PERMISSION_DENIED`.
2. **Unverified email token spoofing** (`email_verified == false`) -> `PERMISSION_DENIED`.
3. **Cross-user PII profile read** (User B reading `/users/userA`) -> `PERMISSION_DENIED`.
4. **Global user enumeration** (`list /users`) -> `PERMISSION_DENIED`.
5. **Identity/email spoofing** (`email != request.auth.token.email` or `ownerId != request.auth.uid`) -> `PERMISSION_DENIED`.
6. **Avatar URL XSS/scheme injection** (`avatarUrl: "javascript:alert(1)"`) -> `PERMISSION_DENIED` (`^https://.*`).
7. **Shadow/ghost field injection** (`isAdmin: true` on user/playlist/likedSong/song map) -> `PERMISSION_DENIED` (`hasOnly` gates).
8. **ID poisoning** (ID > 128 chars or containing slashes/spaces) -> `PERMISSION_DENIED` (`isValidId`).
9. **Client timestamp forgery** (`createdAt != request.time` / `updatedAt != request.time`) -> `PERMISSION_DENIED`.
10. **Immutable field tampering** (changing `uid`, `email`, `ownerId`, `id`, or `createdAt`) -> `PERMISSION_DENIED`.
11. **Array DoS & tail smuggling** (`songs.size() > 300` or malformed song appended at tail) -> `PERMISSION_DENIED` (`isValidSongMap` checks head & tail).
12. **Orphaned subcollection write** (writing playlist/like before parent `/users/{userId}` exists) -> `PERMISSION_DENIED`.
