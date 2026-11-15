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
import { Song } from '../types/music';

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






