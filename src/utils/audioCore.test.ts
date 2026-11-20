import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanHtmlEntities,
  formatTime,
  formatFileSize,
  formatPlayCount,
  resolveBestStreamUrl,
  getBestImageUrl,
  getNextTrackIndex,
  getPrevTrackIndex,
} from './audioCore';
import { Playlist, Song } from '../types/music';

test('cleanHtmlEntities decodes common HTML entities from JioSaavn', () => {
  assert.equal(cleanHtmlEntities('Tu Mil Jaaye (From &quot;KING&quot;)'), 'Tu Mil Jaaye (From "KING")');
  assert.equal(cleanHtmlEntities('Rock &amp; Roll'), 'Rock & Roll');
  assert.equal(cleanHtmlEntities('It&#039;s Magic'), "It's Magic");
});

test('formatTime formats seconds properly to MM:SS and HH:MM:SS', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(45), '0:45');
  assert.equal(formatTime(65), '1:05');
  assert.equal(formatTime(315), '5:15');
  assert.equal(formatTime(3665), '1:01:05');
  assert.equal(formatTime(null), '0:00');
});

test('formatFileSize converts bytes to KB and MB', () => {
  assert.equal(formatFileSize(0), '0 B');
  assert.equal(formatFileSize(1024 * 500), '500.0 KB');
  assert.equal(formatFileSize(1024 * 1024 * 8.5), '8.5 MB');
});

test('resolveBestStreamUrl picks preferred bitrate or nearest available', () => {
  const dummySong: Song = {
    id: 'test-1',
    name: 'Sample Song',
    duration: 200,
    image: [],
    downloadUrl: [
      { quality: '12kbps', url: 'https://cdn/12.mp4' },
      { quality: '48kbps', url: 'https://cdn/48.mp4' },
      { quality: '96kbps', url: 'https://cdn/96.mp4' },
      { quality: '160kbps', url: 'https://cdn/160.mp4' },
      { quality: '320kbps', url: 'https://cdn/320.mp4' },
    ],
  };

  assert.equal(resolveBestStreamUrl(dummySong, '320kbps'), 'https://cdn/320.mp4');
  assert.equal(resolveBestStreamUrl(dummySong, '96kbps'), 'https://cdn/96.mp4');

  // Fallback when exact is missing
  const partialSong: Song = {
    ...dummySong,
    downloadUrl: [
      { quality: '96kbps', url: 'https://cdn/96.mp4' },
      { quality: '160kbps', url: 'https://cdn/160.mp4' },
    ],
  };
  assert.equal(resolveBestStreamUrl(partialSong, '320kbps'), 'https://cdn/160.mp4');
});

test('getBestImageUrl prioritizes requested size', () => {
  const images = [
    { quality: '50x50', url: 'https://cdn/50.jpg' },
    { quality: '150x150', url: 'https://cdn/150.jpg' },
    { quality: '500x500', url: 'https://cdn/500.jpg' },
  ];

  assert.equal(getBestImageUrl(images, 'sm'), 'https://cdn/50.jpg');
  assert.equal(getBestImageUrl(images, 'md'), 'https://cdn/150.jpg');
  assert.equal(getBestImageUrl(images, 'lg'), 'https://cdn/500.jpg');
});

test('getNextTrackIndex handles repeat modes and end of queue', () => {
  // repeat: all
  assert.equal(getNextTrackIndex(0, 3, 'all'), 1);
  assert.equal(getNextTrackIndex(2, 3, 'all'), 0); // wrap

  // repeat: one
  assert.equal(getNextTrackIndex(1, 3, 'one'), 1);

  // repeat: off
  assert.equal(getNextTrackIndex(1, 3, 'off'), 2);
  assert.equal(getNextTrackIndex(2, 3, 'off'), null); // stops
});

test('getPrevTrackIndex rewinds if > 3s or moves to previous track', () => {
  // If > 3 seconds, rewinds current track (index stays 1)
  assert.equal(getPrevTrackIndex(1, 4, 15), 1);

  // If <= 3 seconds, goes to previous track (0)
  assert.equal(getPrevTrackIndex(1, 4, 1.5), 0);

  // If at first track and <= 3s, wraps to end
  assert.equal(getPrevTrackIndex(0, 4, 0), 3);
});

test('sanitizeSearchQuery cleans slashes, special characters and whitespace', async () => {
  const { sanitizeSearchQuery } = await import('../services/api');
  assert.equal(sanitizeSearchQuery('Love / Romance'), 'Love Romance');
  assert.equal(sanitizeSearchQuery('   Arijit   Singh   '), 'Arijit Singh');
  assert.equal(sanitizeSearchQuery('KGF: Chapter 2'), 'KGF Chapter 2');
  assert.equal(sanitizeSearchQuery(''), '');
});

test('normalizeSong transforms various raw API schemas reliably', async () => {
  const { normalizeSong } = await import('../services/api');

  // Case A: string image, string primaryArtists, string duration
  const rawA = {
    id: 'song-123',
    title: 'Rockstar &amp; Rebel',
    duration: '240',
    primaryArtists: 'Pritam, Arijit Singh',
    album: 'Rockstar',
    image: 'https://cdn/cover.jpg',
    downloadUrl: 'https://cdn/320.mp4',
  };

  const songA = normalizeSong(rawA);
  assert.equal(songA.id, 'song-123');
  assert.equal(songA.name, 'Rockstar & Rebel');
  assert.equal(songA.duration, 240);
  assert.equal(songA.artists?.primary?.length, 2);
  assert.equal(songA.artists?.primary?.[0].name, 'Pritam');
  assert.equal(songA.image.length, 3);
  assert.equal(songA.downloadUrl.length, 1);
  assert.equal(songA.downloadUrl[0].quality, '320kbps');
});

test('formatPlayCount formats stream counts cleanly', () => {
  assert.equal(formatPlayCount(0), '');
  assert.equal(formatPlayCount(500), '');
  assert.equal(formatPlayCount(85400), '85K');
  assert.equal(formatPlayCount(1520000), '1.5M');
  assert.equal(formatPlayCount(214396174), '214.4M');
  assert.equal(formatPlayCount(1200000000), '1.2B');
});

test('rankSongsByFameAndRelevance ranks globally famous original hits above lofi/remixes', async () => {
  const { rankSongsByFameAndRelevance } = await import('../services/api');

  const lofiSong: Song = {
    id: 'lofi-1',
    name: 'Kesariya (Lofi Flip)',
    duration: 180,
    playCount: 450000,
    artists: { primary: [{ id: 'a1', name: 'DJ Indie' }] },
    image: [],
    downloadUrl: [{ quality: '320kbps', url: 'https://cdn/lofi.mp4' }],
  };

  const megaHit: Song = {
    id: 'hit-1',
    name: 'Kesariya (From "Brahmastra")',
    duration: 268,
    playCount: 214396174,
    artists: { primary: [{ id: 'a2', name: 'Arijit Singh' }] },
    image: [],
    downloadUrl: [{ quality: '320kbps', url: 'https://cdn/hit.mp4' }],
  };

  const obscureCover: Song = {
    id: 'cover-1',
    name: 'Kesariya',
    duration: 210,
    playCount: 1200,
    artists: { primary: [{ id: 'a3', name: 'Random Cover' }] },
    image: [],
    downloadUrl: [{ quality: '320kbps', url: 'https://cdn/cover.mp4' }],
  };

  const ranked = rankSongsByFameAndRelevance([lofiSong, obscureCover, megaHit], 'Kesariya');
  assert.equal(ranked[0].id, 'hit-1');
  assert.equal(ranked[ranked.length - 1].id, 'lofi-1');

  // If the user explicitly searches "Kesariya Lofi", do not penalize lofi!
  const rankedLofi = rankSongsByFameAndRelevance([obscureCover, lofiSong, megaHit], 'Kesariya Lofi');
  assert.equal(rankedLofi[0].id, 'lofi-1');
});

test('rankSongsByFameAndRelevance ranks short exact matches over prefix and incidental substring songs ("uns")', async () => {
  const { rankSongsByFameAndRelevance } = await import('../services/api');

  const songUns: Song = {
    id: 'uns-1',
    name: 'Uns',
    duration: 180,
    playCount: 2_000_000,
    artists: { primary: [{ id: 'a1', name: 'Independent Artist' }] },
    image: [],
    downloadUrl: [{ quality: '320kbps', url: 'https://cdn/uns.mp4' }],
  };

  const songUnstoppable: Song = {
    id: 'uns-2',
    name: 'Unstoppable',
    duration: 210,
    playCount: 85_000_000,
    artists: { primary: [{ id: 'a2', name: 'Sia' }] },
    image: [],
    downloadUrl: [{ quality: '320kbps', url: 'https://cdn/unstoppable.mp4' }],
  };

  const songRaah: Song = {
    id: 'uns-3',
    name: 'Raah Mein Unse Mulaqat',
    duration: 310,
    playCount: 160_000_000,
    artists: { primary: [{ id: 'a3', name: 'Kumar Sanu' }] },
    image: [],
    downloadUrl: [{ quality: '320kbps', url: 'https://cdn/raah.mp4' }],
  };

  const ranked = rankSongsByFameAndRelevance([songRaah, songUnstoppable, songUns], 'uns');
  assert.equal(ranked[0].id, 'uns-1', 'Exact match "Uns" must rank #1');
  assert.equal(ranked[1].id, 'uns-2', 'Prefix match "Unstoppable" must rank #2');
  assert.equal(ranked[2].id, 'uns-3', 'Incidental substring match in title must rank #3');
});

test('rankSongsByFameAndRelevance handles multi-word typo queries with dual-field synergy ("Arjit singh chann mere ya")', async () => {
  const { rankSongsByFameAndRelevance } = await import('../services/api');

  const songChanna: Song = {
    id: 'channa-1',
    name: 'Channa Mereya',
    duration: 289,
    playCount: 120_000_000,
    album: { id: 'alb-adhm', name: 'Ae Dil Hai Mushkil' },
    artists: { primary: [{ id: 'art-arijit', name: 'Arijit Singh' }] },
    image: [],
    downloadUrl: [{ quality: '320kbps', url: 'https://cdn/channa.mp4' }],
  };

  const songTumHiHo: Song = {
    id: 'tum-1',
    name: 'Tum Hi Ho',
    duration: 262,
    playCount: 650_000_000,
    album: { id: 'alb-aashiqui', name: 'Aashiqui 2' },
    artists: { primary: [{ id: 'art-arijit', name: 'Arijit Singh' }] },
    image: [],
    downloadUrl: [{ quality: '320kbps', url: 'https://cdn/tum.mp4' }],
  };

  const ranked = rankSongsByFameAndRelevance([songTumHiHo, songChanna], 'Arjit singh chann mere ya');
  assert.equal(ranked[0].id, 'channa-1', 'Channa Mereya must rank #1 for query matching title + artist despite play count gap');
});

test('rankSongsByFameAndRelevance prioritizes movie soundtrack songs for album queries ("Ae Dil Hai Mushkil")', async () => {
  const { rankSongsByFameAndRelevance } = await import('../services/api');

  const movieTrack: Song = {
    id: 'adhm-track',
    name: 'Bulleya',
    duration: 348,
    playCount: 75_000_000,
    album: { id: 'alb-adhm', name: 'Ae Dil Hai Mushkil' },
    artists: { primary: [{ id: 'art-amit', name: 'Amit Mishra' }] },
    image: [],
    downloadUrl: [{ quality: '320kbps', url: 'https://cdn/bulleya.mp4' }],
  };

  const unrelatedSong: Song = {
    id: 'unrelated',
    name: 'Dil Diyan Gallan',
    duration: 260,
    playCount: 350_000_000,
    album: { id: 'alb-tiger', name: 'Tiger Zinda Hai' },
    artists: { primary: [{ id: 'art-atif', name: 'Atif Aslam' }] },
    image: [],
    downloadUrl: [{ quality: '320kbps', url: 'https://cdn/dil.mp4' }],
  };

  const ranked = rankSongsByFameAndRelevance([unrelatedSong, movieTrack], 'Ae Dil Hai Mushkil');
  assert.equal(ranked[0].id, 'adhm-track', 'Soundtrack track must outrank higher-play track from unrelated album');
});

test('diceCoefficient and generateSearchQueryVariants calculate fuzzy similarity and typo variants', async () => {
  const { diceCoefficient, generateSearchQueryVariants } = await import('../services/api');

  assert.ok(diceCoefficient('arijit', 'arjit') >= 0.65, 'Arijit vs Arjit similarity');
  assert.ok(diceCoefficient('channa mereya', 'chann mere ya') >= 0.65, 'Channa Mereya vs chann mere ya similarity');
  assert.equal(diceCoefficient('abc', 'xyz'), 0, 'Completely different strings have 0 similarity');

  const variants = generateSearchQueryVariants('Arjit singh chann mere ya');
  assert.ok(variants.length > 0, 'Variants generated for typo query');
  assert.ok(
    variants.some((v) => v.includes('arijit') || v.includes('channa') || v.includes('mereya')),
    'Variants include normalized words'
  );
});

test('SOUND_PROFILE_PRESETS, clampEqGain, and computeEffectiveEqBands configure Studio & Deep Bass properly', async () => {
  const { SOUND_PROFILE_PRESETS, clampEqGain, computeEffectiveEqBands } = await import('./audioCore');

  assert.equal(Object.keys(SOUND_PROFILE_PRESETS).length, 6);
  assert.ok(SOUND_PROFILE_PRESETS.bass.bands.sub > SOUND_PROFILE_PRESETS.studio.bands.sub);
  assert.equal(SOUND_PROFILE_PRESETS.flat.compress, false);
  assert.equal(SOUND_PROFILE_PRESETS.studio.compress, true);

  // Ensure primary mastering profiles avoid aggressive squashing & mid-scoop thinness
  for (const key of ['studio', 'bass', 'vocal', 'concert'] as const) {
    const preset = SOUND_PROFILE_PRESETS[key];
    assert.ok(preset.compressorThreshold >= -4, `${key} threshold should stay transparent`);
    assert.ok(preset.compressorRatio <= 1.5, `${key} ratio should stay gentle`);
    assert.ok(preset.makeupGain >= 1.3, `${key} makeupGain should stay full and rich`);
    assert.ok(preset.bands.mid >= 0, `${key} mid band should not scoop warmth`);
  }

  assert.equal(clampEqGain(12), 8);
  assert.equal(clampEqGain(-14), -8);
  assert.equal(clampEqGain(2.46), 2.5);

  const boosted = computeEffectiveEqBands(SOUND_PROFILE_PRESETS.bass.bands, 100);
  assert.equal(boosted.sub, 10);
  assert.ok(boosted.bass > SOUND_PROFILE_PRESETS.bass.bands.bass);
});

test('parseLrcLyrics and findActiveLyricIndex parse timestamps and track active lyric line', async () => {
  const { parseLrcLyrics, findActiveLyricIndex } = await import('./audioCore');
  const sample = `[00:09.44] Mujhko itna bataye koi\n[00:13.40] \n[00:19.02] Kaise tujhse dil na lagaye koi?\n[00:29.91] Rabba ne tujhko banane mein`;

  const parsed = parseLrcLyrics(sample);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].time, 9.44);
  assert.equal(parsed[1].text, 'Kaise tujhse dil na lagaye koi?');

  assert.equal(findActiveLyricIndex(parsed, 2), -1);
  assert.equal(findActiveLyricIndex(parsed, 10), 0);
  assert.equal(findActiveLyricIndex(parsed, 19), 1);
  assert.equal(findActiveLyricIndex(parsed, 45), 2);
});

test('diversifySongs prevents repetitive same-album tracks and duplicate title+artist releases', async () => {
  const { diversifySongs } = await import('./audioCore');

  const makeTrack = (id: string, name: string, albumId: string, albumName: string, artist = 'Arijit Singh'): Song => ({
    id,
    name,
    duration: 240,
    album: { id: albumId, name: albumName },
    artists: { primary: [{ id: 'art_1', name: artist }] },
    image: [],
    downloadUrl: [],
  });

  const tracks: Song[] = [
    makeTrack('s1', 'Kesariya (From "Brahmastra")', 'alb_brahmastra', 'Brahmastra'),
    makeTrack('s2', 'Deva Deva (From "Brahmastra")', 'alb_brahmastra', 'Brahmastra'),
    makeTrack('s3', 'Rasiya (From "Brahmastra")', 'alb_brahmastra', 'Brahmastra'),
    makeTrack('s4', 'Kesariya', 'alb_comp', 'Best of 2022'), // Duplicate same title + artist
    makeTrack('s5', 'Apna Bana Le', 'alb_bhediya', 'Bhediya'),
    makeTrack('s6', 'Chaleya', 'alb_jawan', 'Jawan', 'Anirudh Ravichander'),
  ];

  // Max 1 track per album & dedupe Kesariya re-release
  const diverseOne = diversifySongs(tracks, { maxPerAlbum: 1 });
  assert.deepEqual(
    diverseOne.map((s) => s.id),
    ['s1', 's5', 's6']
  );

  // Exclude already shown keys across sections
  const seenKeys = new Set<string>();
  const firstSection = diversifySongs(tracks, { maxPerAlbum: 1, excludeKeys: seenKeys });
  assert.equal(firstSection.length, 3);

  const secondSection = diversifySongs(
    [
      makeTrack('s5_dup', 'Apna Bana Le (Remix)', 'alb_other', 'Remix Tape'),
      makeTrack('s7', 'Heeriye', 'alb_heeriye', 'Heeriye', 'Jasleen Royal'),
    ],
    { maxPerAlbum: 1, excludeKeys: seenKeys }
  );
  assert.deepEqual(
    secondSection.map((s) => s.id),
    ['s7']
  );
});

test('isValidPlaylistCoverUrl validates https URLs, data URIs, and length limits', async () => {
  const { isValidPlaylistCoverUrl } = await import('./imageUtils');
  assert.equal(isValidPlaylistCoverUrl('https://c.saavncdn.com/cover.jpg'), true);
  assert.equal(isValidPlaylistCoverUrl('data:image/jpeg;base64,/9j/4AAQ'), true);
  assert.equal(isValidPlaylistCoverUrl('http://insecure.example.com/a.jpg'), false);
  assert.equal(isValidPlaylistCoverUrl('javascript:alert(1)'), false);
  assert.equal(isValidPlaylistCoverUrl(''), false);
});

test('shuffleArray and shuffleQueue preserve all items and keep active track first', async () => {
  const { shuffleArray, shuffleQueue } = await import('./audioCore');
  const items = ['t1', 't2', 't3', 't4', 't5', 't6'];

  const shuffled = shuffleArray(items);
  assert.equal(shuffled.length, items.length);
  assert.deepEqual([...shuffled].sort(), [...items].sort());
  // Ensure input array wasn't mutated
  assert.deepEqual(items, ['t1', 't2', 't3', 't4', 't5', 't6']);

  const queued = shuffleQueue(items, 2);
  assert.equal(queued[0], 't3');
  assert.equal(queued.length, items.length);
  assert.deepEqual([...queued].sort(), [...items].sort());

  // Safe fallback for out-of-range index
  const fallback = shuffleQueue(items, -1);
  assert.equal(fallback[0], 't1');
  assert.equal(fallback.length, items.length);
});

test('isLowNetworkSpeed and getResilientLowNetQuality handle 2G/3G/4G and telemetry fallback', async () => {
  const { isLowNetworkSpeed, getResilientLowNetQuality } = await import('./audioCore');

  assert.equal(isLowNetworkSpeed({ effectiveType: '4g', downlink: 10, rtt: 50 }, false), false);
  assert.equal(isLowNetworkSpeed({ effectiveType: '3g', downlink: 2.0 }, false), true);
  assert.equal(isLowNetworkSpeed({ effectiveType: '2g' }, false), true);
  assert.equal(isLowNetworkSpeed({ effectiveType: '4g', saveData: true }, false), true);
  assert.equal(isLowNetworkSpeed({ effectiveType: '4g', downlink: 0.9 }, false), true);
  assert.equal(isLowNetworkSpeed({ effectiveType: '4g', rtt: 450 }, false), true);
  assert.equal(isLowNetworkSpeed(null, true), true);
  assert.equal(isLowNetworkSpeed(null, false), false);

  assert.equal(getResilientLowNetQuality('320kbps', { effectiveType: '3g' }), '96kbps');
  assert.equal(getResilientLowNetQuality('320kbps', { effectiveType: '2g' }), '48kbps');
  assert.equal(getResilientLowNetQuality('320kbps', { saveData: true }), '48kbps');
  assert.equal(getResilientLowNetQuality('12kbps', { effectiveType: '3g' }), '12kbps');
});

test('registerMediaSessionActions configures next/prev controls and explicitly clears seekbackward/seekforward for iOS Lock Screen', async () => {
  const { registerMediaSessionActions } = await import('./audioCore');
  const registered = new Map<string, any>();
  const mockMediaSession = {
    setActionHandler: (action: string, handler: any) => {
      registered.set(action, handler);
    },
  };

  let played = false;
  let paused = false;
  let nextCalled = false;
  let prevCalled = false;
  let seekTime = -1;
  let stopped = false;

  registerMediaSessionActions(mockMediaSession, {
    play: () => {
      played = true;
    },
    pause: () => {
      paused = true;
    },
    previous: () => {
      prevCalled = true;
    },
    next: () => {
      nextCalled = true;
    },
    seek: (t) => {
      seekTime = t;
    },
    stop: () => {
      stopped = true;
    },
  });

  // Transport handlers must be present functions
  assert.equal(typeof registered.get('play'), 'function');
  assert.equal(typeof registered.get('pause'), 'function');
  assert.equal(typeof registered.get('previoustrack'), 'function');
  assert.equal(typeof registered.get('nexttrack'), 'function');
  assert.equal(typeof registered.get('seekto'), 'function');
  assert.equal(typeof registered.get('stop'), 'function');

  // CRITICAL iOS WebKit contract: seekbackward and seekforward MUST be cleared to null
  // so iPhone Lock Screen renders Next / Previous buttons instead of 15-second skip buttons
  assert.equal(registered.get('seekbackward'), null);
  assert.equal(registered.get('seekforward'), null);

  // Verify invocations work as expected
  registered.get('play')();
  assert.equal(played, true);
  registered.get('pause')();
  assert.equal(paused, true);
  registered.get('nexttrack')();
  assert.equal(nextCalled, true);
  registered.get('previoustrack')();
  assert.equal(prevCalled, true);
  registered.get('seekto')({ seekTime: 85 });
  assert.equal(seekTime, 85);
  registered.get('stop')();
  assert.equal(stopped, true);
});

test('Guest Mode quotas enforce search cap, playback time limits, and library write restrictions', async () => {
  const {
    canGuestSearch,
    incrementGuestSearch,
    canGuestPlay,
    recordGuestPlayback,
    recordGuestTrackFinished,
    canGuestModifyLibrary,
    GUEST_SEARCH_LIMIT,
    GUEST_PLAYBACK_LIMIT_SECONDS,
    GUEST_TRACK_LIMIT,
  } = await import('./guestLimits');

  assert.equal(GUEST_SEARCH_LIMIT, 5);
  assert.equal(GUEST_PLAYBACK_LIMIT_SECONDS, 900);
  assert.equal(GUEST_TRACK_LIMIT, 3);

  // 1. Search Quota
  let usage = { searchesCount: 0, playbackSeconds: 0, tracksPlayed: 0 };
  assert.equal(canGuestSearch(usage), true);
  for (let i = 0; i < 5; i++) {
    usage = incrementGuestSearch(usage);
  }
  assert.equal(usage.searchesCount, 5);
  assert.equal(canGuestSearch(usage), false, '5th search should exhaust guest search limit');

  // 2. Playback Limits (Time & Track counts)
  let playUsage = { searchesCount: 0, playbackSeconds: 850, tracksPlayed: 1 };
  assert.equal(canGuestPlay(playUsage), true, '850s is under 900s limit');
  playUsage = recordGuestPlayback(playUsage, 50);
  assert.equal(playUsage.playbackSeconds, 900);
  assert.equal(canGuestPlay(playUsage), false, '900s reaches cumulative 15-minute cap');

  let trackUsage = { searchesCount: 0, playbackSeconds: 200, tracksPlayed: 2 };
  assert.equal(canGuestPlay(trackUsage), true, '2 tracks is under 3 tracks limit');
  trackUsage = recordGuestTrackFinished(trackUsage);
  assert.equal(trackUsage.tracksPlayed, 3);
  assert.equal(canGuestPlay(trackUsage), false, '3rd track reaches guest preview limit');

  // 3. Library Modification Restrictions
  assert.equal(canGuestModifyLibrary(true), false, 'Guests must NOT be allowed to mutate library');
  assert.equal(canGuestModifyLibrary(false), true, 'Authenticated users are permitted full library writes');
});

test('mergeCloudAndLocalPlaylists and mergeCloudAndLocalLikes preserve offline items and deduplicate safely', async () => {
  const { mergeCloudAndLocalPlaylists, mergeCloudAndLocalLikes } = await import('./guestLimits');

  // 1. Playlists Merge
  const localPl: Playlist = {
    id: 'pl-local-1',
    name: 'Local Offline Mix',
    songs: [],
    coverColor: 'color-1',
    createdAt: 1000,
    userEmail: 'user@example.com',
  };
  const sharedPlLocal: Playlist = {
    id: 'pl-shared',
    name: 'Shared Playlist (Old Local Title)',
    songs: [],
    coverColor: 'color-2',
    createdAt: 2000,
    userEmail: 'user@example.com',
  };
  const sharedPlCloud: Playlist = {
    id: 'pl-shared',
    name: 'Shared Playlist (Fresh Cloud Title from iPhone)',
    songs: [],
    coverColor: 'color-2',
    createdAt: 3000,
    userEmail: 'user@example.com',
  };
  const cloudOnlyPl: Playlist = {
    id: 'pl-cloud-only',
    name: 'Cloud Playlist from Laptop',
    songs: [],
    coverColor: 'color-3',
    createdAt: 4000,
    userEmail: 'user@example.com',
  };

  const mergedPl = mergeCloudAndLocalPlaylists([localPl, sharedPlLocal], [sharedPlCloud, cloudOnlyPl]);
  assert.equal(mergedPl.length, 3, 'Must contain 3 unique playlists without duplicate IDs');
  const sharedResolved = mergedPl.find((p) => p.id === 'pl-shared');
  assert.equal(
    sharedResolved?.name,
    'Shared Playlist (Fresh Cloud Title from iPhone)',
    'Cloud version must take precedence for matching IDs'
  );
  assert.ok(
    mergedPl.some((p) => p.id === 'pl-local-1'),
    'Local offline playlist must be preserved and never dropped'
  );

  // 2. Liked Songs Merge
  const songA: Song = { id: 'song-a', name: 'Song A', duration: 180, image: [], downloadUrl: [] };
  const songB: Song = { id: 'song-b', name: 'Song B', duration: 200, image: [], downloadUrl: [] };
  const songC: Song = { id: 'song-c', name: 'Song C', duration: 220, image: [], downloadUrl: [] };

  const mergedLikes = mergeCloudAndLocalLikes([songA, songB], [songB, songC]);
  assert.equal(mergedLikes.length, 3, 'Must merge unique songs without duplicating songB');
  assert.deepEqual(
    mergedLikes.map((s) => s.id).sort(),
    ['song-a', 'song-b', 'song-c'],
    'Must include all songs from both local and cloud'
  );
});

test('computeHeadroomAttenuation prevents EQ summing overload, clipping and flatline scattering', async () => {
  const { computeHeadroomAttenuation, SOUND_PROFILE_PRESETS, computeEffectiveEqBands } = await import(
    './audioCore'
  );

  // 1. Flat EQ with unity makeup gain produces exactly 1.0 (bit-transparent unity)
  const flatScale = computeHeadroomAttenuation(SOUND_PROFILE_PRESETS.flat.bands, 1.0);
  assert.equal(flatScale, 1.0, 'Flat EQ must not attenuate signal');

  // 2. Studio EQ (+4.5 dB sub boost, 1.34 makeup gain) scales down dynamically
  const studioPreset = SOUND_PROFILE_PRESETS.studio;
  const studioScale = computeHeadroomAttenuation(studioPreset.bands, studioPreset.makeupGain);
  assert.ok(studioScale < 1.0, 'Studio profile must apply headroom attenuation');
  assert.ok(studioScale >= 0.5 && studioScale <= 0.6, `Studio scale ${studioScale} should be between 0.5 and 0.6`);

  // 3. Deep Bass with 100% Bass Boost (+10 dB sub, +9 dB bass) applies deep attenuation
  const boostedBassBands = computeEffectiveEqBands(SOUND_PROFILE_PRESETS.bass.bands, 100);
  const bassScale = computeHeadroomAttenuation(boostedBassBands, SOUND_PROFILE_PRESETS.bass.makeupGain);
  assert.ok(bassScale < studioScale, 'Bass boost must attenuate more than studio to prevent distortion');
  assert.ok(bassScale >= 0.35 && bassScale <= 0.45, `Bass scale ${bassScale} should be safely padded`);

  // 4. Clamping safety: Extreme hypothetical boost never drops below minimum floor 0.35
  const extremeBands = { sub: 25, bass: 20, mid: 10, vocal: 15, air: 15 };
  const extremeScale = computeHeadroomAttenuation(extremeBands, 2.5);
  assert.equal(extremeScale, 0.35, 'Extreme boost must clamp to safe minimum 0.35 floor');
});

test('sanitizePlaylistImportTracks sanitizes fields, strips undefined values for Firestore, and deduplicates IDs', async () => {
  const { sanitizePlaylistImportTracks } = await import('./audioCore');
  const { mergeCloudAndLocalPlaylists } = await import('./guestLimits');

  // 1. Raw songs with undefined properties, missing albums, HTML entities, and duplicates
  const rawImportList = [
    {
      id: 'song-dup-1',
      name: 'Kesariya &amp; Love',
      duration: 215,
      year: undefined,
      playCount: undefined,
      label: undefined,
      language: undefined,
      album: { id: 'alb-1', name: 'Brahmastra &amp; More', url: undefined },
      artists: { primary: [{ id: 'art-1', name: 'Arijit Singh &amp; Pritam' }] },
      image: [{ quality: '500x500', url: 'https://example.com/cover.jpg' }],
      downloadUrl: [{ quality: '320kbps', url: 'https://example.com/audio.mp3' }],
    },
    // Duplicate ID should be deduplicated
    {
      id: 'song-dup-1',
      name: 'Kesariya Duplicate',
      duration: 215,
      album: { id: 'alb-1', name: 'Brahmastra' },
      artists: { primary: [{ id: 'art-1', name: 'Arijit Singh' }] },
      image: [],
      downloadUrl: [],
    },
    // Song with missing album / artist
    {
      id: 'song-2',
      name: 'Apna Bana Le',
      duration: 260,
      image: [],
      downloadUrl: [],
    },
  ];

  const sanitized = sanitizePlaylistImportTracks(rawImportList as any);
  assert.equal(sanitized.length, 2, 'Must deduplicate matching song IDs');

  // Verify Kesariya: decoded HTML entities, zero undefined fields
  const track1 = sanitized[0];
  assert.equal(track1.name, 'Kesariya & Love');
  assert.equal(track1.album?.name, 'Brahmastra & More');
  assert.equal(track1.artists?.primary?.[0]?.name, 'Arijit Singh & Pritam');
  assert.equal('year' in track1, false, 'Undefined year must be stripped for Firestore');
  assert.equal('playCount' in track1, false, 'Undefined playCount must be stripped for Firestore');
  assert.equal(track1.album ? 'url' in track1.album : false, false, 'Undefined album.url must be stripped for Firestore');

  // Verify track 2 defaults
  const track2 = sanitized[1];
  assert.equal(track2.album?.name, 'Single');
  assert.equal(track2.artists?.primary?.[0]?.name, 'Various Artists');

  // 2. Verify mergeCloudAndLocalPlaylists preserves local tracks when cloud doc is empty (prevents wipeout)
  const localImportedPlaylist = {
    id: 'pl-imported-1',
    name: 'Imported Spotify Hits',
    songs: sanitized,
    coverColor: 'from-violet-600 to-indigo-700',
    createdAt: 1000,
    userEmail: 'user@example.com',
  };

  const emptyCloudSnapshotPlaylist = {
    id: 'pl-imported-1',
    name: 'Imported Spotify Hits',
    songs: [], // Empty cloud snapshot before write completes
    coverColor: 'from-violet-600 to-indigo-700',
    createdAt: 2000,
    userEmail: 'user@example.com',
  };

  const merged = mergeCloudAndLocalPlaylists([localImportedPlaylist], [emptyCloudSnapshotPlaylist]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].songs.length, 2, 'Must retain local songs when cloud snapshot is empty');
});

test('formatFirebaseAuthError formats actionable unauthorized-domain guidance and passes through other errors', async () => {
  const { formatFirebaseAuthError } = await import('./guestLimits');

  // 1. auth/unauthorized-domain with explicit hostname
  const unauthDomainErr = {
    code: 'auth/unauthorized-domain',
    message: 'Firebase: Error (auth/unauthorized-domain).',
  };
  const formattedExplicit = formatFirebaseAuthError(unauthDomainErr, '192.168.1.15');
  assert.equal(
    formattedExplicit,
    "Domain '192.168.1.15' is not authorized in Firebase Console (Authentication → Settings → Authorized domains). For local PC testing, open http://localhost:3000."
  );

  // 2. auth/unauthorized-domain fallback when hostname is omitted
  const formattedFallback = formatFirebaseAuthError(unauthDomainErr);
  assert.equal(
    formattedFallback,
    "Domain 'current domain' is not authorized in Firebase Console (Authentication → Settings → Authorized domains). For local PC testing, open http://localhost:3000."
  );

  // 3. auth/popup-closed-by-user mapping
  const popupClosedErr = { code: 'auth/popup-closed-by-user', message: 'Popup closed' };
  assert.equal(
    formatFirebaseAuthError(popupClosedErr),
    'Google sign-in popup was closed before completing.'
  );

  // 4. auth/popup-blocked mapping
  const popupBlockedErr = { code: 'auth/popup-blocked', message: 'Popup blocked' };
  assert.equal(
    formatFirebaseAuthError(popupBlockedErr),
    'Google sign-in popup was blocked by your browser. Please allow popups for this site.'
  );

  // 5. Pass-through for custom standard Error
  const customErr = new Error('Database offline');
  assert.equal(formatFirebaseAuthError(customErr), 'Database offline');

  // 6. Pass-through for generic auth error object
  const networkErr = { code: 'auth/network-request-failed', message: 'Network connection failed' };
  assert.equal(formatFirebaseAuthError(networkErr), 'Network connection failed');
});










test('playlist edits serialize a complete, ordered track list without undefined fields', async () => {
  const { withPlaylistSongs } = await import('./guestLimits');
  const first = { id: 'first', name: 'First', album: { id: 'a', name: 'Album', url: undefined } };
  const second = { id: 'second', name: 'Second', year: undefined };
  const playlist = { id: 'pl', name: 'Test', userEmail: 'test@example.com', createdAt: 1, songs: [] };
  const edited = withPlaylistSongs(playlist, [second, first, second], 10);
  assert.deepEqual(edited.songs.map(song => song.id), ['second', 'first']);
  assert.deepEqual(edited.songs, JSON.parse(JSON.stringify(edited.songs)));
  assert.equal(edited.updatedAt, 10);
  assert.deepEqual(withPlaylistSongs(edited, [], 11).songs, []);
});

test('playlist hydration preserves newer local songs and applies confirmed cloud removals and order', async () => {
  const { mergeCloudAndLocalPlaylists, withPlaylistSongs } = await import('./guestLimits');
  const playlist = { id: 'pl', name: 'Test', userEmail: 'test@example.com', createdAt: 1, songs: [] };
  const first = { id: 'first', name: 'First' };
  const second = { id: 'second', name: 'Second' };
  const local = withPlaylistSongs(playlist, [first, second], 10);
  const stale = withPlaylistSongs(playlist, [], 8);
  const reordered = withPlaylistSongs(playlist, [second, first], 11);
  const shorter = withPlaylistSongs(playlist, [second], 12);
  const cleared = withPlaylistSongs(playlist, [], 13);
  for (const [cached, cloud, expected] of [
    [[local], stale, ['first', 'second']],
    [[], local, ['first', 'second']],
    [[local], reordered, ['second', 'first']],
    [[reordered], shorter, ['second']],
    [[shorter], cleared, []],
  ] as const) {
    assert.deepEqual(mergeCloudAndLocalPlaylists([...cached], [cloud])[0].songs.map(song => song.id), expected);
  }
});

test('text tracklists preserve display order and parse artist-first, CSV and title-only rows', async () => {
  const { parseRawTrackList } = await import('./playlistText');
  assert.deepEqual(parseRawTrackList([
    'Track Name,Artist', '1. Artist A - Title, Part II', 'artist a - title, part ii',
    '2) Artist B \u2014 Title - Live', '"Hello, World","Artist C"', 'Song by Artist D', 'Solo', '- Invalid',
  ].join('\r\n')), [
    { title: 'Title, Part II', artist: 'Artist A', allowReversed: true },
    { title: 'Title - Live', artist: 'Artist B', allowReversed: true },
    { title: 'Hello, World', artist: 'Artist C' },
    { title: 'Song', artist: 'Artist D' },
    { title: 'Solo', artist: '' },
  ]);
});

test('text import verifies the artist and title and retries legacy title-first rows', async () => {
  const { parseRawTrackList, resolveTextPlaylistTrack } = await import('./playlistText');
  const { sanitizePlaylistImportTracks } = await import('./audioCore');
  const [wrong, correct] = sanitizePlaylistImportTracks([
    { id: 'wrong', name: 'Song', artists: { primary: [{ id: 'other', name: 'Other Artist' }] } },
    { id: 'right', name: 'Song (From "Soundtrack")', artists: { primary: [{ id: 'artist', name: 'Artist A' }] } },
  ]);
  const tracks = parseRawTrackList('Artist A - Song\nSong - Artist A\nUnknown Artist - Song');
  const search = async (query: string) => query === 'Song' ? [wrong, correct] : [wrong];
  assert.equal(await resolveTextPlaylistTrack(tracks[0], search), correct);
  assert.equal(await resolveTextPlaylistTrack(tracks[1], search), correct);
  assert.equal(await resolveTextPlaylistTrack(tracks[2], search), null);
});

test('confirmed remote playlist deletions do not hydrate or remove local-only playlists', async () => {
  const { mergeCloudAndLocalPlaylists } = await import('./guestLimits');
  const localOnly = { id: 'local', name: 'Local', userEmail: 'test@example.com', createdAt: 1, songs: [] };
  const deleted = { ...localOnly, id: 'deleted', cloudConfirmed: true as const };
  assert.deepEqual(mergeCloudAndLocalPlaylists([localOnly, deleted], []), [localOnly]);
});


test('isSafePublicHttpUrl and safeFetchPublicUrl reject loopback, link-local, RFC1918, decimal and redirect-hop SSRF', async () => {
  const { isSafePublicHttpUrl, safeFetchPublicUrl } = await import('./guestLimits');

  // 1. Valid public URLs allowed
  assert.equal(isSafePublicHttpUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'), true);
  assert.equal(isSafePublicHttpUrl('https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb'), true);
  assert.equal(isSafePublicHttpUrl('https://www.youtube.com/playlist?list=PL4fGSI1pDJn6jXS_PEoNcnw42AmwkFQvC'), true);
  assert.equal(isSafePublicHttpUrl('http://public-service.example.org/feed.xml'), true);

  // 2. Loopback, private and link-local blocked
  assert.equal(isSafePublicHttpUrl('http://localhost:3000'), false, 'localhost must be rejected');
  assert.equal(isSafePublicHttpUrl('http://127.0.0.1:8080/admin'), false, '127.0.0.1 must be rejected');
  assert.equal(isSafePublicHttpUrl('http://10.0.0.1/secrets'), false, '10.0.0.0/8 must be rejected');
  assert.equal(isSafePublicHttpUrl('http://172.16.0.5/api'), false, '172.16.0.0/12 must be rejected');
  assert.equal(isSafePublicHttpUrl('http://192.168.1.1/router'), false, '192.168.0.0/16 must be rejected');
  assert.equal(isSafePublicHttpUrl('http://169.254.169.254/latest/meta-data'), false, 'AWS metadata 169.254 must be rejected');
  assert.equal(isSafePublicHttpUrl('http://100.64.0.1/info'), false, 'Carrier-grade NAT must be rejected');
  assert.equal(isSafePublicHttpUrl('http://[::1]:3000/'), false, 'IPv6 ::1 must be rejected');
  assert.equal(isSafePublicHttpUrl('http://[fc00::1]/'), false, 'IPv6 Unique Local must be rejected');
  assert.equal(isSafePublicHttpUrl('http://[fe80::1]/'), false, 'IPv6 Link-Local must be rejected');
  assert.equal(isSafePublicHttpUrl('http://router.local'), false, '.local must be rejected');
  assert.equal(isSafePublicHttpUrl('http://auth.internal'), false, '.internal must be rejected');
  assert.equal(isSafePublicHttpUrl('http://2130706433'), false, 'Integer/decimal IP representation of 127.0.0.1 must be rejected');
  assert.equal(isSafePublicHttpUrl('ftp://example.com/resource'), false, 'Non-http/https protocol must be rejected');

  // 3. Hop-by-hop redirect SSRF rejection
  const mockFetchRedirectToMetadata: typeof fetch = async (url) => {
    if (String(url) === 'https://legit-playlist.com/share') {
      return new Response(null, {
        status: 302,
        headers: { location: 'http://169.254.169.254/latest/meta-data/credentials' },
      });
    }
    return new Response('ok', { status: 200 });
  };

  await assert.rejects(
    safeFetchPublicUrl('https://legit-playlist.com/share', { fetchFn: mockFetchRedirectToMetadata }),
    /SSRF blocked/,
    'Must abort when redirect target resolves to private/link-local address'
  );

  // 4. Excessive redirect loop rejection (>5 hops)
  const mockFetchLoop: typeof fetch = async (url) => {
    return new Response(null, {
      status: 301,
      headers: { location: 'https://legit-playlist.com/loop' },
    });
  };

  await assert.rejects(
    safeFetchPublicUrl('https://legit-playlist.com/loop', { fetchFn: mockFetchLoop, maxRedirects: 3 }),
    /Too many redirects/,
    'Must abort when redirect count exceeds maxRedirects'
  );

  // 5. Safe legitimate redirect succeeds
  const mockFetchSafeRedirect: typeof fetch = async (url) => {
    if (String(url) === 'https://legit-playlist.com/short') {
      return new Response(null, {
        status: 301,
        headers: { location: 'https://legit-playlist.com/canonical' },
      });
    }
    return new Response('playlist-content', { status: 200 });
  };

  const safeRes = await safeFetchPublicUrl('https://legit-playlist.com/short', { fetchFn: mockFetchSafeRedirect });
  assert.equal(safeRes.status, 200);
  assert.equal(await safeRes.text(), 'playlist-content');
});

test('concurrent multi-browser playlist edits merge newly added tracks and preserve monotonic revisions', async () => {
  const { mergeCloudAndLocalPlaylists, reconcileConcurrentSongs, withPlaylistSongs } = await import('./guestLimits');

  const basePlaylist: Playlist = {
    id: 'pl-shared-sync',
    name: 'Collaborative Party Mix',
    songs: [],
    coverColor: 'from-blue-600 to-indigo-700',
    createdAt: 1000,
    updatedAt: 1000,
    revision: 1,
    userEmail: 'user@example.com',
  };

  const trackA: Song = { id: 'song-a', name: 'Song A', duration: 180, image: [], downloadUrl: [] };
  const trackB: Song = { id: 'song-b', name: 'Song B', duration: 200, image: [], downloadUrl: [] };
  const trackC: Song = { id: 'song-c', name: 'Song C (Added on Chrome)', duration: 210, image: [], downloadUrl: [] };
  const trackD: Song = { id: 'song-d', name: 'Song D (Added on Brave)', duration: 220, image: [], downloadUrl: [] };

  // Base state has tracks A and B
  const baseWithAB = withPlaylistSongs(basePlaylist, [trackA, trackB], 1000, 1);

  // Chrome session adds track C
  const chromeEdit = withPlaylistSongs(baseWithAB, [trackA, trackB, trackC], 1100, 2);

  // Brave session concurrently adds track D
  const braveEdit = withPlaylistSongs(baseWithAB, [trackA, trackB, trackD], 1150, 2);

  // 1. Direct song reconciliation must preserve both non-conflicting additions
  const reconciled = reconcileConcurrentSongs(chromeEdit.songs, braveEdit.songs, chromeEdit.updatedAt, braveEdit.updatedAt);
  assert.equal(reconciled.length, 4, 'Must merge unique songs from both concurrent sessions');
  assert.deepEqual(
    reconciled.map((s) => s.id),
    ['song-a', 'song-b', 'song-c', 'song-d'],
    'Must keep local order and append non-conflicting incoming songs'
  );

  // 2. mergeCloudAndLocalPlaylists preserves both additions and increments monotonic revision
  const mergedPlaylists = mergeCloudAndLocalPlaylists([chromeEdit], [braveEdit]);
  assert.equal(mergedPlaylists.length, 1);
  const resultPl = mergedPlaylists[0];
  assert.equal(resultPl.songs.length, 4, 'Merged playlist must contain all 4 tracks');
  assert.deepEqual(resultPl.songs.map((s) => s.id), ['song-a', 'song-b', 'song-c', 'song-d']);
  assert.ok((resultPl.revision ?? 0) >= 2, 'Revision must be monotonically tracked');

  // 3. Authoritative deletion from a newer session remains authoritative
  const deletionSession = withPlaylistSongs(baseWithAB, [trackB], 1500, 3); // trackA was deleted at t=1500
  const afterDeletion = reconcileConcurrentSongs(chromeEdit.songs, deletionSession.songs, chromeEdit.updatedAt, deletionSession.updatedAt);
  assert.equal(afterDeletion.length, 1);
  assert.equal(afterDeletion[0].id, 'song-b', 'Authoritative deletion with newer timestamp must be respected');
});


test('formatFirestoreSyncError formats permission-denied (403) and offline sync errors actionably', async () => {
  const { formatFirestoreSyncError } = await import('./guestLimits');

  // 1. Explicit permission-denied error object (code)
  const permErrCode = { code: 'permission-denied', message: 'Missing or insufficient permissions.' };
  assert.equal(
    formatFirestoreSyncError(permErrCode),
    'Cloud sync blocked by Firestore permissions (403). Update Firestore Rules in Firebase Console.'
  );

  // 2. HTTP 403 in Error message (e.g. from fetch / REST / commit response)
  const http403Err = new Error('POST https://firestore.googleapis.com/.../documents:commit 403 (Forbidden)');
  assert.equal(
    formatFirestoreSyncError(http403Err),
    'Cloud sync blocked by Firestore permissions (403). Update Firestore Rules in Firebase Console.'
  );

  // 3. Error with wrapped cause (e.g. nested transaction rejection)
  const wrappedErr = new Error('Cloud playlist update failed.', {
    cause: new Error('FirebaseError: [code=permission-denied]: Missing or insufficient permissions.'),
  });
  assert.equal(
    formatFirestoreSyncError(wrappedErr),
    'Cloud sync blocked by Firestore permissions (403). Update Firestore Rules in Firebase Console.'
  );

  // 4. Offline / unavailable error
  const offlineErr = { code: 'unavailable', message: 'The client is offline' };
  assert.equal(
    formatFirestoreSyncError(offlineErr),
    'Cloud sync offline. Changes saved locally and will sync when reconnected.'
  );

  // 5. Quota exceeded error
  const quotaErr = { code: 'resource-exhausted', message: 'Quota exceeded for project.' };
  assert.equal(
    formatFirestoreSyncError(quotaErr),
    'Cloud sync paused: Firestore quota exceeded.'
  );

  // 6. Generic/fallback error
  const genericErr = new Error('Unknown server error');
  assert.equal(
    formatFirestoreSyncError(genericErr),
    'Cloud sync paused. Your local copy is saved.'
  );
});


test('sanitizePlaylistImportTracks strictly whitelists song and nested sub-object fields for Firestore', async () => {
  const { sanitizePlaylistImportTracks } = await import('./guestLimits');

  const rawExtraneousSong = {
    id: 'track-extra-1',
    name: 'Dil Nu &amp; More',
    duration: 195,
    year: '2023',
    language: 'punjabi',
    // Extraneous root API fields that must be stripped
    subtitle: 'AP Dhillon - Dil Nu',
    url: 'https://jiosaavn.com/song/dil-nu/xyz',
    primaryArtists: 'AP Dhillon',
    playCount: 15420000,
    explicitContent: false,
    isOffline: false,
    label: 'Run-Up Records',
    copyright: '© 2023 Run-Up',
    hasLyrics: true,
    type: 'song',
    releaseDate: '2023-08-10',
    // Album with extra nested keys
    album: {
      id: 'alb-extra',
      name: 'Two Hearts Never Break The Same',
      url: 'https://jiosaavn.com/album/two-hearts/123',
      type: 'album',
      explicit: false,
    },
    // Artists with extra nested keys
    artists: {
      primary: [
        {
          id: 'art-ap',
          name: 'AP Dhillon &amp; Shinda',
          role: 'Singer, Composer',
          image: [{ quality: '500x500', url: 'https://example.com/ap.jpg' }],
          url: 'https://jiosaavn.com/artist/ap-dhillon',
        },
      ],
      featured: [{ id: 'feat-1', name: 'Extra Feat' }],
      all: [{ id: 'all-1', name: 'All Artist' }],
    },
    // Image with extra nested keys
    image: [
      { quality: '500x500', url: 'https://example.com/cover-500.jpg', size: 'large', ratio: '1:1' },
    ],
    // DownloadUrl with extra nested keys
    downloadUrl: [
      { quality: '320kbps', url: 'https://example.com/stream-320.mp4', bitrate: 320, codec: 'aac' },
    ],
  };

  const [sanitized] = sanitizePlaylistImportTracks([rawExtraneousSong as any]);
  assert.ok(sanitized, 'Sanitized song must be returned');

  // 1. Root keys must strictly match whitelist
  const allowedRootKeys = new Set(['id', 'name', 'duration', 'year', 'language', 'album', 'artists', 'image', 'downloadUrl']);
  for (const key of Object.keys(sanitized)) {
    assert.ok(allowedRootKeys.has(key), `Key "${key}" must be within allowed Firestore whitelist`);
  }

  // 2. Specific unwanted fields are confirmed stripped
  assert.equal('subtitle' in sanitized, false);
  assert.equal('url' in sanitized, false);
  assert.equal('primaryArtists' in sanitized, false);
  assert.equal('playCount' in sanitized, false);
  assert.equal('explicitContent' in sanitized, false);
  assert.equal('isOffline' in sanitized, false);
  assert.equal('label' in sanitized, false);
  assert.equal('copyright' in sanitized, false);
  assert.equal('hasLyrics' in sanitized, false);

  // 3. Album has strictly { id, name }
  assert.deepEqual(Object.keys(sanitized.album || {}).sort(), ['id', 'name']);
  assert.equal(sanitized.album?.name, 'Two Hearts Never Break The Same');

  // 4. Artists primary has strictly { id, name } and HTML entities decoded
  assert.equal('featured' in sanitized.artists!, false);
  assert.equal('all' in sanitized.artists!, false);
  assert.deepEqual(Object.keys(sanitized.artists?.primary?.[0] || {}).sort(), ['id', 'name']);
  assert.equal(sanitized.artists?.primary?.[0]?.name, 'AP Dhillon & Shinda');

  // 5. Image and downloadUrl have strictly { quality, url }
  assert.deepEqual(Object.keys(sanitized.image?.[0] || {}).sort(), ['quality', 'url']);
  assert.deepEqual(Object.keys(sanitized.downloadUrl?.[0] || {}).sort(), ['quality', 'url']);
});


test('adding songs to an empty or existing playlist preserves tracks across browser sessions and monotonic revisions', async () => {
  const { mergeCloudAndLocalPlaylists, reconcileConcurrentSongs, withPlaylistSongs } = await import('./guestLimits');

  const baseEmpty: Playlist = {
    id: 'pl-empty-sync',
    name: 'Empty Party Mix',
    songs: [],
    coverColor: 'from-violet-600 to-indigo-700',
    createdAt: 1000,
    updatedAt: 1000,
    revision: 1,
    userEmail: 'user@example.com',
  };

  const track1: Song = { id: 'track-1', name: 'First Track', duration: 180, image: [], downloadUrl: [] };
  const track2: Song = { id: 'track-2', name: 'Second Track', duration: 210, image: [], downloadUrl: [] };

  // 1. Browser A adds track1 to empty playlist: bumped revision to 2
  const browserAWithTrack1 = withPlaylistSongs(baseEmpty, [track1], 1100, 2);
  assert.equal(browserAWithTrack1.songs.length, 1);
  assert.equal(browserAWithTrack1.revision, 2);

  // 2. Browser A saves to Firestore: reconcileConcurrentSongs against empty cloud (even with server clock skew)
  // Even if cloud updatedAt appears newer (e.g. 1150) due to serverTimestamp skew, revision 2 > 1 preserves track1
  const reconciledCloudWrite = reconcileConcurrentSongs(
    browserAWithTrack1.songs,
    baseEmpty.songs,
    browserAWithTrack1.updatedAt,
    1150, // cloud timestamp ahead of client clock
    browserAWithTrack1.revision,
    baseEmpty.revision
  );
  assert.equal(reconciledCloudWrite.length, 1, 'Cloud write must preserve newly added track1 despite clock skew');
  assert.equal(reconciledCloudWrite[0].id, 'track-1');

  // 3. Browser B receives Firestore snapshot with track1: hydrates into Browser B's empty local state
  const hydratedOnBrowserB = reconcileConcurrentSongs(
    baseEmpty.songs,
    browserAWithTrack1.songs,
    baseEmpty.updatedAt,
    browserAWithTrack1.updatedAt,
    baseEmpty.revision,
    browserAWithTrack1.revision
  );
  assert.equal(hydratedOnBrowserB.length, 1, 'Browser B must accept incoming track1 from cloud');
  assert.equal(hydratedOnBrowserB[0].id, 'track-1');

  // 4. mergeCloudAndLocalPlaylists hydrates Browser B and propagates monotonic revision
  const mergedInBrowserB = mergeCloudAndLocalPlaylists([baseEmpty], [browserAWithTrack1]);
  assert.equal(mergedInBrowserB.length, 1);
  assert.equal(mergedInBrowserB[0].songs.length, 1);
  assert.equal(mergedInBrowserB[0].songs[0].id, 'track-1');
  assert.equal(mergedInBrowserB[0].revision, 2);

  // 5. Browser A subsequently adds track2: bumped revision to 3
  const browserAWithTrack2 = withPlaylistSongs(browserAWithTrack1, [track1, track2], 1200, 3);
  const reconciledSecond = reconcileConcurrentSongs(
    browserAWithTrack2.songs,
    browserAWithTrack1.songs,
    browserAWithTrack2.updatedAt,
    browserAWithTrack1.updatedAt,
    browserAWithTrack2.revision,
    browserAWithTrack1.revision
  );
  assert.equal(reconciledSecond.length, 2, 'Subsequent track addition must preserve both tracks');
  assert.deepEqual(reconciledSecond.map((s) => s.id), ['track-1', 'track-2']);
});


test('SYNC-001: adding a song preserves tracks even when cloud playlist has revision gap and empty songs', async () => {
  const { reconcileConcurrentSongs, withPlaylistSongs } = await import('./guestLimits');

  const basePlaylist: Playlist = {
    id: 'pl-detail-edited',
    name: 'Party Mix',
    songs: [],
    coverColor: 'from-violet-600 to-indigo-700',
    createdAt: 1000,
    updatedAt: 1000,
    revision: 1,
    userEmail: 'user@example.com',
  };

  const track1: Song = { id: 'track-first', name: 'First Song', duration: 180, image: [], downloadUrl: [] };

  // 1. In Firestore, a detail edit previously bumped the cloud document to revision: 2 while songs: [] remained empty
  const cloudSnapshotEmptyAfterDetailEdit: Playlist = {
    ...basePlaylist,
    name: 'Party Mix (Renamed in Cloud)',
    revision: 2,
    updatedAt: 1100,
    songs: [],
  };

  // 2. Locally, the user session was at revision: 1 and adds track1 (local revision becomes 2, or stale at 1)
  const localPlaylistWithAddedSong = withPlaylistSongs(basePlaylist, [track1], 1150, 2);

  // 3. Cloud write reconciliation with explicit addedSongIds intent
  const reconciledWithIntent = reconcileConcurrentSongs(
    localPlaylistWithAddedSong.songs,
    cloudSnapshotEmptyAfterDetailEdit.songs,
    localPlaylistWithAddedSong.updatedAt,
    cloudSnapshotEmptyAfterDetailEdit.updatedAt,
    localPlaylistWithAddedSong.revision, // 2
    cloudSnapshotEmptyAfterDetailEdit.revision, // 2
    { addedSongIds: ['track-first'] }
  );
  assert.equal(reconciledWithIntent.length, 1, 'Must preserve track1 when addedSongIds intent is passed');
  assert.equal(reconciledWithIntent[0].id, 'track-first');

  // 4. Stale local revision gap: even if cloud revision is strictly higher (rev 3 vs local rev 2) with songs: [],
  // an empty cloud snapshot must NEVER drop newly added tracks
  const cloudHigherRevisionEmpty: Playlist = {
    ...cloudSnapshotEmptyAfterDetailEdit,
    revision: 3,
    updatedAt: 1200,
    songs: [],
  };
  const reconciledHigherCloudRev = reconcileConcurrentSongs(
    localPlaylistWithAddedSong.songs,
    cloudHigherRevisionEmpty.songs,
    localPlaylistWithAddedSong.updatedAt,
    cloudHigherRevisionEmpty.updatedAt,
    localPlaylistWithAddedSong.revision, // 2
    cloudHigherRevisionEmpty.revision, // 3 (higher revision on empty cloud)
    { addedSongIds: ['track-first'] }
  );
  assert.equal(reconciledHigherCloudRev.length, 1, 'Must preserve track1 despite cloud revision being higher');
  assert.equal(reconciledHigherCloudRev[0].id, 'track-first');

  // 5. At equal revisions (e.g. metadata edit in cloud vs local add), a populated local list is preserved against an empty cloud list without explicit options
  const reconciledWithoutOptions = reconcileConcurrentSongs(
    localPlaylistWithAddedSong.songs,
    cloudSnapshotEmptyAfterDetailEdit.songs,
    localPlaylistWithAddedSong.updatedAt,
    cloudSnapshotEmptyAfterDetailEdit.updatedAt,
    localPlaylistWithAddedSong.revision, // 2
    cloudSnapshotEmptyAfterDetailEdit.revision // 2
  );
  assert.equal(reconciledWithoutOptions.length, 1, 'Must preserve populated local songs against empty cloud snapshot of equal revision');
  assert.equal(reconciledWithoutOptions[0].id, 'track-first');
});

test('SYNC-003: authoritative remote deletion of the final song propagates to secondary sessions', async () => {
  const { reconcileConcurrentSongs, withPlaylistSongs } = await import('./guestLimits');

  const basePlaylist: Playlist = {
    id: 'pl-delete-sync',
    name: 'Shared Vibes',
    songs: [],
    coverColor: 'from-violet-600 to-indigo-700',
    createdAt: 1000,
    updatedAt: 1000,
    revision: 1,
    userEmail: 'user@example.com',
  };

  const track1: Song = { id: 'track-last', name: 'Last Song Standing', duration: 210, image: [], downloadUrl: [] };

  // Browser B currently has track1 at revision 2
  const browserBLocal = withPlaylistSongs(basePlaylist, [track1], 1100, 2);

  // Browser A removed track1, committing an authoritative empty playlist to Firestore with revision 3
  const remoteSnapshotEmpty = {
    ...browserBLocal,
    songs: [],
    revision: 3,
    updatedAt: 1200,
  };

  // Browser B receives the snapshot listener update (options is undefined during onSnapshot)
  const reconciledOnBrowserB = reconcileConcurrentSongs(
    browserBLocal.songs,
    remoteSnapshotEmpty.songs,
    browserBLocal.updatedAt,
    remoteSnapshotEmpty.updatedAt,
    browserBLocal.revision, // 2
    remoteSnapshotEmpty.revision // 3
  );

  assert.equal(reconciledOnBrowserB.length, 0, 'Browser B must accept authoritative deletion of the last song when remote revision is higher');
});

test('SYNC-001: active track addition preserves songs even when reconciling against an empty higher-revision snapshot', async () => {
  const { reconcileConcurrentSongs, withPlaylistSongs } = await import('./guestLimits');

  const basePlaylist: Playlist = {
    id: 'pl-active-add',
    name: 'Road Trip Mix',
    songs: [],
    coverColor: 'from-violet-600 to-indigo-700',
    createdAt: 1000,
    updatedAt: 1000,
    revision: 1,
    userEmail: 'user@example.com',
  };

  const track1: Song = { id: 'track-preserve', name: 'Preserved Highway Song', duration: 195, image: [], downloadUrl: [] };

  // Browser A is locally adding track1 (local revision 1, with options.addedSongIds)
  const browserALocal = withPlaylistSongs(basePlaylist, [track1], 1100, 1);

  // Remote snapshot arrives or is read during write transaction with revision 2 and songs: []
  const cloudEmptySnapshot = {
    ...browserALocal,
    songs: [],
    revision: 2,
    updatedAt: 1200,
  };

  const reconciledPreserved = reconcileConcurrentSongs(
    browserALocal.songs,
    cloudEmptySnapshot.songs,
    browserALocal.updatedAt,
    cloudEmptySnapshot.updatedAt,
    browserALocal.revision, // 1
    cloudEmptySnapshot.revision, // 2
    { addedSongIds: ['track-preserve'] }
  );

  assert.equal(reconciledPreserved.length, 1, 'Locally added song must be preserved against higher-revision empty snapshot when addedSongIds is provided');
  assert.equal(reconciledPreserved[0].id, 'track-preserve');
});

test('Unit Test 41: cloud song serialization strictly outputs only the 9 allowed isValidSongMap keys for raw search/player songs', async () => {
  const { sanitizeSongForCloud } = await import('../services/firebase');

  const rawSearchSong: Song = {
    id: 'song-search-123',
    name: 'Search Result &amp; Hit Track',
    duration: 215,
    year: '2024',
    language: 'hindi',
    album: { id: 'alb-1', name: 'Album &amp; Co' },
    artists: {
      primary: [
        { id: 'art-1', name: 'Artist 1' },
        { id: 'art-2', name: 'Artist 2' },
      ],
    },
    image: [
      { quality: '500x500', url: 'https://c.saavncdn.com/123/500x500.jpg' },
    ],
    downloadUrl: [
      { quality: '320kbps', url: 'https://aac.saavncdn.com/123/320.mp4' },
    ],
    // Extraneous raw search/player fields that trigger Firestore 403 under strict isValidSongMap:
    ...({
      subtitle: 'Artist 1, Artist 2',
      url: 'https://www.jiosaavn.com/song/hit-track/xyz',
      primaryArtists: 'Artist 1, Artist 2',
      playCount: 154000,
      explicitContent: false,
      isOffline: false,
      hasLyrics: true,
      label: 'T-Series',
      copyright: '© 2024 T-Series',
    } as any),
  };

  const serialized = sanitizeSongForCloud(rawSearchSong);

  // 1. Exact 9 keys verification
  const allowedKeys = ['album', 'artists', 'downloadUrl', 'duration', 'id', 'image', 'language', 'name', 'year'].sort();
  const actualKeys = Object.keys(serialized).sort();
  assert.deepEqual(actualKeys, allowedKeys, 'Serialized cloud song must contain only the exact 9 allowed keys for isValidSongMap');

  // 2. Extraneous keys completely omitted
  const forbiddenKeys = ['subtitle', 'url', 'primaryArtists', 'playCount', 'explicitContent', 'isOffline', 'hasLyrics', 'label', 'copyright'];
  for (const key of forbiddenKeys) {
    assert.equal(key in serialized, false, `Forbidden key "${key}" must not exist on serialized song`);
  }

  // 3. Nested object keys conformance
  const albumKeys = Object.keys(serialized.album as Record<string, unknown>).sort();
  assert.deepEqual(albumKeys, ['id', 'name'], 'Album map must contain only id and name');

  const artistsPrimary = (serialized.artists as { primary: Record<string, unknown>[] }).primary;
  assert.ok(Array.isArray(artistsPrimary) && artistsPrimary.length > 0);
  for (const artist of artistsPrimary) {
    assert.deepEqual(Object.keys(artist).sort(), ['id', 'name'], 'Each primary artist map must contain only id and name');
  }

  const images = serialized.image as Record<string, unknown>[];
  assert.ok(Array.isArray(images) && images.length > 0);
  for (const img of images) {
    assert.deepEqual(Object.keys(img).sort(), ['quality', 'url'], 'Each image map must contain only quality and url');
  }

  const downloadUrls = serialized.downloadUrl as Record<string, unknown>[];
  assert.ok(Array.isArray(downloadUrls) && downloadUrls.length > 0);
  for (const d of downloadUrls) {
    assert.deepEqual(Object.keys(d).sort(), ['quality', 'url'], 'Each downloadUrl map must contain only quality and url');
  }
});

test('Unit Test 42: original studio track ranks above karaoke, slowed+reverb, and cover versions for standard title queries, while derivative queries rank derivative #1', async () => {
  const { rankSongsByFameAndRelevance } = await import('../services/api');

  const studioTrack: Song = {
    id: 'studio-kesariya',
    name: 'Kesariya (From "Brahmastra")',
    duration: 268,
    playCount: 150_000_000,
    album: { id: 'alb-brah', name: 'Brahmastra' },
    artists: { primary: [{ id: 'art-arijit', name: 'Arijit Singh' }, { id: 'art-pritam', name: 'Pritam' }] },
    image: [{ quality: '500x500', url: 'https://cdn/500.jpg' }],
    downloadUrl: [{ quality: '320kbps', url: 'https://cdn/studio.mp4' }],
  };

  const karaokeTrack: Song = {
    id: 'karaoke-kesariya',
    name: 'Kesariya - Karaoke Version',
    duration: 268,
    playCount: 50_000,
    album: { id: 'alb-kar', name: 'Bollywood Karaoke Hits' },
    artists: { primary: [{ id: 'art-kar', name: 'Karaoke Studio' }] },
    image: [],
    downloadUrl: [{ quality: '320kbps', url: 'https://cdn/karaoke.mp4' }],
  };

  const slowedReverbTrack: Song = {
    id: 'slowed-kesariya',
    name: 'Kesariya (Slowed + Reverb)',
    duration: 310,
    playCount: 450_000,
    album: { id: 'alb-slow', name: 'Midnight Vibe' },
    artists: { primary: [{ id: 'art-dj', name: 'DJ Slowed Vibes' }] },
    image: [],
    downloadUrl: [{ quality: '320kbps', url: 'https://cdn/slowed.mp4' }],
  };

  const coverTrack: Song = {
    id: 'cover-kesariya',
    name: 'Kesariya (Cover Version)',
    duration: 250,
    playCount: 80_000,
    album: { id: 'alb-cov', name: 'Acoustic Covers' },
    artists: { primary: [{ id: 'art-indie', name: 'Indie Singer' }] },
    image: [],
    downloadUrl: [{ quality: '320kbps', url: 'https://cdn/cover.mp4' }],
  };

  // 1. Standard query "Kesariya": Original studio track must rank #1 above all derivative versions
  const pool = [karaokeTrack, slowedReverbTrack, coverTrack, studioTrack];
  const rankedStandard = rankSongsByFameAndRelevance(pool, 'Kesariya');
  assert.equal(rankedStandard[0].id, 'studio-kesariya', 'Original studio hit must rank #1 for standard song query');

  // 2. Specific derivative query "Kesariya Slowed": Slowed+Reverb track must rank #1
  const rankedSlowed = rankSongsByFameAndRelevance(pool, 'Kesariya Slowed');
  assert.equal(rankedSlowed[0].id, 'slowed-kesariya', 'Slowed version must rank #1 when user explicitly queries "Kesariya Slowed"');

  // 3. Specific derivative query "Kesariya Karaoke": Karaoke track must rank #1
  const rankedKaraoke = rankSongsByFameAndRelevance(pool, 'Kesariya Karaoke');
  assert.equal(rankedKaraoke[0].id, 'karaoke-kesariya', 'Karaoke version must rank #1 when user explicitly queries "Kesariya Karaoke"');
});

test('Unit Test 43: multi-word combined artist + title queries rank exact collaboration above unrelated tracks matching only one word', async () => {
  const { rankSongsByFameAndRelevance } = await import('../services/api');

  // Candidate 1: Exact collaboration matching "Arijit Singh Tum Hi Ho"
  const collaborationTrack: Song = {
    id: 'tum-hi-ho-arijit',
    name: 'Tum Hi Ho',
    duration: 262,
    playCount: 85_000_000,
    album: { id: 'alb-aashiqui2', name: 'Aashiqui 2' },
    artists: { primary: [{ id: 'art-arijit', name: 'Arijit Singh' }] },
    image: [],
    downloadUrl: [{ quality: '320kbps', url: 'https://cdn/tum.mp4' }],
  };

  // Candidate 2: High-play track by Arijit Singh that does NOT match title "Tum Hi Ho"
  const higherPlayArtistTrack: Song = {
    id: 'channa-mereya-arijit',
    name: 'Channa Mereya',
    duration: 289,
    playCount: 750_000_000, // 9x higher play count!
    album: { id: 'alb-adhm', name: 'Ae Dil Hai Mushkil' },
    artists: { primary: [{ id: 'art-arijit', name: 'Arijit Singh' }] },
    image: [],
    downloadUrl: [{ quality: '320kbps', url: 'https://cdn/channa.mp4' }],
  };

  // Candidate 3: Track matching title "Tum Hi Ho" but performed by an unrelated artist
  const differentArtistTrack: Song = {
    id: 'tum-hi-ho-other',
    name: 'Tum Hi Ho',
    duration: 260,
    playCount: 15_000_000,
    album: { id: 'alb-tribute', name: 'Romantic Tribute' },
    artists: { primary: [{ id: 'art-other', name: 'Other Performer' }] },
    image: [],
    downloadUrl: [{ quality: '320kbps', url: 'https://cdn/other.mp4' }],
  };

  const rankedArijitTum = rankSongsByFameAndRelevance(
    [higherPlayArtistTrack, differentArtistTrack, collaborationTrack],
    'Arijit Singh Tum Hi Ho'
  );
  assert.equal(
    rankedArijitTum[0].id,
    'tum-hi-ho-arijit',
    'Exact collaboration matching both artist and title must rank #1 over single-word matches'
  );

  // Collaboration 2: "Pritam Shayad"
  const pritamShayad: Song = {
    id: 'shayad-pritam',
    name: 'Shayad',
    duration: 247,
    playCount: 120_000_000,
    album: { id: 'alb-laj2', name: 'Love Aaj Kal' },
    artists: { primary: [{ id: 'art-pritam', name: 'Pritam' }, { id: 'art-arijit', name: 'Arijit Singh' }] },
    image: [],
    downloadUrl: [{ quality: '320kbps', url: 'https://cdn/shayad.mp4' }],
  };

  const pritamOtherSong: Song = {
    id: 'kesariya-pritam',
    name: 'Kesariya',
    duration: 268,
    playCount: 500_000_000,
    album: { id: 'alb-brah', name: 'Brahmastra' },
    artists: { primary: [{ id: 'art-pritam', name: 'Pritam' }] },
    image: [],
    downloadUrl: [{ quality: '320kbps', url: 'https://cdn/kesariya.mp4' }],
  };

  const otherShayad: Song = {
    id: 'shayad-unrelated',
    name: 'Shayad',
    duration: 215,
    playCount: 10_000,
    album: { id: 'alb-indie', name: 'Indie Singles' },
    artists: { primary: [{ id: 'art-unknown', name: 'Unknown Soloist' }] },
    image: [],
    downloadUrl: [{ quality: '320kbps', url: 'https://cdn/unknown.mp4' }],
  };

  const rankedPritamShayad = rankSongsByFameAndRelevance(
    [pritamOtherSong, otherShayad, pritamShayad],
    'Pritam Shayad'
  );
  assert.equal(
    rankedPritamShayad[0].id,
    'shayad-pritam',
    '"Pritam Shayad" collaboration must rank #1 over other songs by Pritam or songs by other artists'
  );
});

test('Unit Test 44: near-duplicate tracks with identical normalized title/artist are deduplicated cleanly, retaining the track with valid 320kbps downloadUrl', async () => {
  const { deduplicateNearIdenticalSongs } = await import('../utils/audioCore');

  const highQualityTrack: Song = {
    id: 'kesariya-320',
    name: 'Kesariya (From "Brahmastra")',
    duration: 268,
    playCount: 150_000_000,
    album: { id: 'alb-brah', name: 'Brahmastra' },
    artists: { primary: [{ id: 'art-arijit', name: 'Arijit Singh' }] },
    image: [{ quality: '500x500', url: 'https://cdn/500x500.jpg' }],
    downloadUrl: [{ quality: '320kbps', url: 'https://cdn/320.mp4' }],
  };

  const lowQualityDuplicate: Song = {
    id: 'kesariya-96',
    name: 'Kesariya',
    duration: 267, // Within ±3s duration
    playCount: 20_000,
    album: { id: 'alb', name: 'Single' },
    artists: { primary: [{ id: 'art-arijit', name: 'Arijit Singh' }] },
    image: [],
    downloadUrl: [{ quality: '96kbps', url: 'https://cdn/96.mp4' }],
  };

  const distinctTrack: Song = {
    id: 'apna-bana-le',
    name: 'Apna Bana Le',
    duration: 261,
    playCount: 95_000_000,
    album: { id: 'alb-bhediya', name: 'Bhediya' },
    artists: { primary: [{ id: 'art-arijit', name: 'Arijit Singh' }] },
    image: [{ quality: '500x500', url: 'https://cdn/apna.jpg' }],
    downloadUrl: [{ quality: '320kbps', url: 'https://cdn/apna.mp4' }],
  };

  // Test with low quality first in list, high quality second
  const dedupedLowFirst = deduplicateNearIdenticalSongs([lowQualityDuplicate, highQualityTrack, distinctTrack]);
  assert.equal(dedupedLowFirst.length, 2, 'Must deduplicate the near-duplicate Kesariya versions into 1 track');
  const kesariyaRetained1 = dedupedLowFirst.find((s) => s.name.includes('Kesariya'));
  assert.ok(kesariyaRetained1);
  assert.equal(kesariyaRetained1.id, 'kesariya-320', 'Must retain 320kbps track even when low quality duplicate appeared first');
  assert.equal(kesariyaRetained1.downloadUrl?.[0]?.quality, '320kbps');

  // Test with high quality first in list, low quality second
  const dedupedHighFirst = deduplicateNearIdenticalSongs([highQualityTrack, lowQualityDuplicate, distinctTrack]);
  assert.equal(dedupedHighFirst.length, 2, 'Must deduplicate the near-duplicate Kesariya versions into 1 track');
  const kesariyaRetained2 = dedupedHighFirst.find((s) => s.name.includes('Kesariya'));
  assert.ok(kesariyaRetained2);
  assert.equal(kesariyaRetained2.id, 'kesariya-320', 'Must retain 320kbps track when high quality appeared first');
  assert.equal(kesariyaRetained2.downloadUrl?.[0]?.quality, '320kbps');
});
test('45: natural queue completion respects repeat and boundaries', async () => {
  const { resolveNextTrackIndex } = await import('./audioCore');
  assert.equal(resolveNextTrackIndex(0, 3, 'off'), 1);
  assert.equal(resolveNextTrackIndex(2, 3, 'off'), null);
  assert.equal(resolveNextTrackIndex(2, 3, 'all'), 0);
  assert.equal(resolveNextTrackIndex(1, 3, 'one'), 1);
  assert.equal(resolveNextTrackIndex(0, 0, 'one'), null);
  assert.equal(resolveNextTrackIndex(-1, 3, 'off'), null);
});

test('46: suspended and interrupted contexts can resume', async () => {
  const { shouldAttemptAudioContextResume } = await import('./audioCore');
  for (const state of ['suspended', 'interrupted']) assert.equal(shouldAttemptAudioContextResume(state), true);
  for (const state of ['running', 'closed']) assert.equal(shouldAttemptAudioContextResume(state), false);
});

test('47: effective playback reflects both media and context', async () => {
  const { resolveEffectivePlaybackState } = await import('./audioCore');
  assert.equal(resolveEffectivePlaybackState(false, 'running'), 'playing');
  assert.equal(resolveEffectivePlaybackState(false, undefined), 'playing');
  assert.equal(resolveEffectivePlaybackState(true, 'running'), 'paused');
  for (const state of ['suspended', 'interrupted', 'closed']) assert.equal(resolveEffectivePlaybackState(false, state), 'paused');
});
