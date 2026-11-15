import { useEffect, useState } from 'react';
import { audioEngine } from '../services/audioEngine';
import { AudioQuality, EqBands, Song, SoundProfile } from '../types/music';
import {
  getNextTrackIndex,
  isLowNetworkSpeed,
  NetworkConnectionSnapshot,
  resolveBestStreamUrl,
} from '../utils/audioCore';

const SLOWNET_PREBUFFER_CACHE = 'tunely-slownet-prebuffer-v1';

export interface PrebufferStatus {
  isLowNetwork: boolean;
  currentBuffered: boolean;
  nextBuffered: boolean;
}

interface EventfulNetworkConnection extends NetworkConnectionSnapshot {
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

function getNetworkConnection(): EventfulNetworkConnection | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & {
    connection?: EventfulNetworkConnection;
    mozConnection?: EventfulNetworkConnection;
    webkitConnection?: EventfulNetworkConnection;
  };
  return nav.connection || nav.mozConnection || nav.webkitConnection || null;
}

// =============================================================================
// Singleton Dual-Layer Slow-Network Pre-Buffer Coordinator
// Shared across all useAudio() hook instances so 12+ mounted components never
// duplicate network fetches or audio buffer elements.
// =============================================================================
const hookSubscribers = new Set<() => void>();
let coordinatorActive = false;
let unsubscribeEngineForPrebuffer: (() => void) | null = null;
let stallMonitorTimer: ReturnType<typeof setInterval> | null = null;
let yieldTimer: ReturnType<typeof setTimeout> | null = null;
let activeAbortController: AbortController | null = null;
let lastEvalSignature = '';

// Layer 2: Dedicated silent HTMLAudioElement media-pipeline pre-bufferers
let layer2CurrentAudio: HTMLAudioElement | null = null;
let layer2NextAudio: HTMLAudioElement | null = null;

let currentPrebufferState: PrebufferStatus = {
  isLowNetwork: false,
  currentBuffered: false,
  nextBuffered: false,
};

function notifyHookConsumers(): void {
  hookSubscribers.forEach((cb) => cb());
}

function updatePrebufferState(partial: Partial<PrebufferStatus>): void {
  const nextState: PrebufferStatus = {
    ...currentPrebufferState,
    ...partial,
  };
  if (
    nextState.isLowNetwork !== currentPrebufferState.isLowNetwork ||
    nextState.currentBuffered !== currentPrebufferState.currentBuffered ||
    nextState.nextBuffered !== currentPrebufferState.nextBuffered
  ) {
    currentPrebufferState = nextState;
    notifyHookConsumers();
  }
}

function getOrCreateLayer2Element(slot: 'current' | 'next'): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  const existing = slot === 'current' ? layer2CurrentAudio : layer2NextAudio;
  if (existing) return existing;

  const el = new Audio();
  el.muted = true;
  el.preload = 'auto';
  el.setAttribute('playsinline', '');
  if (slot === 'current') {
    layer2CurrentAudio = el;
  } else {
    layer2NextAudio = el;
  }
  return el;
}

function primeLayer2Pipeline(slot: 'current' | 'next', srcUrl: string): void {
  if (!srcUrl) return;
  try {
    const el = getOrCreateLayer2Element(slot);
    if (!el) return;
    if (el.src !== srcUrl) {
      el.preload = 'auto';
      el.src = srcUrl;
      el.load();
    }
  } catch {}
}

function resetLayer2Pipelines(): void {
  for (const el of [layer2CurrentAudio, layer2NextAudio]) {
    if (!el) continue;
    try {
      el.pause();
      el.removeAttribute('src');
      el.load();
    } catch {}
  }
}

async function fetchTrackIntoLayer1Cache(
  song: Song,
  url: string,
  quality: AudioQuality,
  signal: AbortSignal
): Promise<string | null> {
  if (!song?.id || !url || signal.aborted) return null;

  const existingBlob = audioEngine.getPrebufferedBlobUrl(song.id);
  if (existingBlob) return existingBlob;

  // 1A. Check persistent CacheStorage first (survives quick reloads on flaky cellular)
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(SLOWNET_PREBUFFER_CACHE);
      const cachedResp = await cache.match(url);
      if (cachedResp && !signal.aborted) {
        const cachedBlob = await cachedResp.blob();
        if (cachedBlob.size > 0 && !signal.aborted) {
          const blobUrl = URL.createObjectURL(cachedBlob);
          audioEngine.registerPrebufferedTrack(song.id, blobUrl, quality);
          return blobUrl;
        }
      }
    } catch {}
  }

  if (signal.aborted) return null;

  // 1B. Aggressive background stream fetch into RAM Blob + CacheStorage
  try {
    const response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      signal,
    });
    if (!response.ok || signal.aborted) return null;

    if (typeof caches !== 'undefined') {
      try {
        const cache = await caches.open(SLOWNET_PREBUFFER_CACHE);
        await cache.put(url, response.clone());
      } catch {}
    }

    const blob = await response.blob();
    if (blob.size <= 0 || signal.aborted) return null;

    const blobUrl = URL.createObjectURL(blob);
    audioEngine.registerPrebufferedTrack(song.id, blobUrl, quality);
    return blobUrl;
  } catch {
    return null;
  }
}

function resolveNextQueueSong(): Song | null {
  const queue = audioEngine.getQueue();
  if (queue.length <= 1) return null;
  const currentSong = audioEngine.getCurrentSong();
  const repeatMode = audioEngine.getRepeatMode();
  const effectiveRepeat = repeatMode === 'one' ? 'all' : repeatMode;
  const nextIdx = getNextTrackIndex(audioEngine.getQueueIndex(), queue.length, effectiveRepeat);
  if (nextIdx === null || !queue[nextIdx]) return null;
  const candidate = queue[nextIdx];
  return candidate.id === currentSong?.id ? null : candidate;
}

function cancelPendingPrebufferCycle(): void {
  if (yieldTimer) {
    clearTimeout(yieldTimer);
    yieldTimer = null;
  }
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
}

async function runDualLayerPrebufferPipeline(
  currentSong: Song,
  nextSong: Song | null,
  quality: AudioQuality,
  signal: AbortSignal
): Promise<void> {
  if (signal.aborted) return;

  // Layer 1 + Layer 2 for Current Track (prioritized so active playback never stalls)
  const currentAlreadyCached = audioEngine.isTrackCachedInMemory(currentSong.id);
  if (currentAlreadyCached) {
    const cachedUrl = audioEngine.getPrebufferedBlobUrl(currentSong.id);
    if (cachedUrl) primeLayer2Pipeline('current', cachedUrl);
    audioEngine.promotePrebufferedCurrentTrack(currentSong.id);
    updatePrebufferState({ currentBuffered: true });
  } else {
    const currentStreamUrl = resolveBestStreamUrl(currentSong, quality);
    if (currentStreamUrl) {
      // Layer 2 warms native browser HTTP media cache immediately in parallel
      primeLayer2Pipeline('current', currentStreamUrl);
      // Layer 1 fetches full compact resilient blob into RAM + CacheStorage
      const blobUrl = await fetchTrackIntoLayer1Cache(currentSong, currentStreamUrl, quality, signal);
      if (signal.aborted) return;
      if (blobUrl) {
        primeLayer2Pipeline('current', blobUrl);
        audioEngine.promotePrebufferedCurrentTrack(currentSong.id);
        updatePrebufferState({ currentBuffered: true });
      }
    }
  }

  if (signal.aborted || !nextSong) return;

  // Layer 1 + Layer 2 for Next Track so transitions on 3G/slow networks start in 0ms
  const nextAlreadyCached = audioEngine.isTrackCachedInMemory(nextSong.id);
  if (nextAlreadyCached) {
    const cachedNextUrl = audioEngine.getPrebufferedBlobUrl(nextSong.id);
    if (cachedNextUrl) primeLayer2Pipeline('next', cachedNextUrl);
    updatePrebufferState({ nextBuffered: true });
    return;
  }

  const nextStreamUrl = resolveBestStreamUrl(nextSong, quality);
  if (!nextStreamUrl) return;

  primeLayer2Pipeline('next', nextStreamUrl);
  const nextBlobUrl = await fetchTrackIntoLayer1Cache(nextSong, nextStreamUrl, quality, signal);
  if (signal.aborted) return;
  if (nextBlobUrl) {
    primeLayer2Pipeline('next', nextBlobUrl);
    updatePrebufferState({ nextBuffered: true });
  }
}

function evaluateDualLayerPrebuffer(): void {
  const conn = getNetworkConnection();
  const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
  const isLow =
    isLowNetworkSpeed(conn, audioEngine.isSlowNetworkDetected()) && isOnline;

  const currentSong = audioEngine.getCurrentSong();
  const nextSong = resolveNextQueueSong();
  const playState = audioEngine.getPlayState();

  if (!isLow || !currentSong) {
    if (currentPrebufferState.isLowNetwork !== isLow) {
      lastEvalSignature = '';
      cancelPendingPrebufferCycle();
      resetLayer2Pipelines();
    }
    updatePrebufferState({
      isLowNetwork: isLow,
      currentBuffered: currentSong ? audioEngine.isTrackCachedInMemory(currentSong.id) : false,
      nextBuffered: nextSong ? audioEngine.isTrackCachedInMemory(nextSong.id) : false,
    });
    return;
  }

  const lowQuality = audioEngine.getLowNetworkTargetQuality();
  const currentCached = audioEngine.isTrackCachedInMemory(currentSong.id);
  const nextCached = nextSong ? audioEngine.isTrackCachedInMemory(nextSong.id) : false;

  updatePrebufferState({
    isLowNetwork: true,
    currentBuffered: currentCached,
    nextBuffered: nextCached,
  });

  // If the current track is already pre-buffered in RAM and actively stalling, promote immediately
  if (currentCached) {
    audioEngine.promotePrebufferedCurrentTrack(currentSong.id);
  }

  const signature = `${currentSong.id}|${nextSong?.id || 'none'}|${lowQuality}`;
  if (signature === lastEvalSignature && (activeAbortController || (currentCached && (!nextSong || nextCached)))) {
    return;
  }

  lastEvalSignature = signature;
  cancelPendingPrebufferCycle();

  const controller = new AbortController();
  activeAbortController = controller;

  // On initial track start, yield briefly (450ms) unless already loading/stalled so
  // the primary <audio> first audio frame gets clean 3G TCP priority before Layer 1 runs.
  const delayMs = playState === 'loading' || currentCached ? 0 : 450;
  if (delayMs === 0) {
    void runDualLayerPrebufferPipeline(currentSong, nextSong, lowQuality, controller.signal);
  } else {
    yieldTimer = setTimeout(() => {
      yieldTimer = null;
      if (!controller.signal.aborted) {
        void runDualLayerPrebufferPipeline(currentSong, nextSong, lowQuality, controller.signal);
      }
    }, delayMs);
  }
}

function handleNetworkOrOnlineChange(): void {
  lastEvalSignature = '';
  evaluateDualLayerPrebuffer();
}

function startCoordinator(): void {
  if (coordinatorActive) return;
  coordinatorActive = true;

  const conn = getNetworkConnection();
  conn?.addEventListener?.('change', handleNetworkOrOnlineChange);
  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleNetworkOrOnlineChange);
    window.addEventListener('offline', handleNetworkOrOnlineChange);
  }

  unsubscribeEngineForPrebuffer = audioEngine.subscribe(() => {
    evaluateDualLayerPrebuffer();
  });

  // Periodic buffer-health guard while low network is active: promotes RAM pre-buffer if buffer runs dry mid-track
  stallMonitorTimer = setInterval(() => {
    const currentSong = audioEngine.getCurrentSong();
    if (!currentSong) return;
    if (audioEngine.isSlowNetworkDetected()) {
      audioEngine.promotePrebufferedCurrentTrack(currentSong.id);
      evaluateDualLayerPrebuffer();
    }
  }, 2500);

  evaluateDualLayerPrebuffer();
}

function stopCoordinator(): void {
  if (!coordinatorActive) return;
  coordinatorActive = false;

  const conn = getNetworkConnection();
  conn?.removeEventListener?.('change', handleNetworkOrOnlineChange);
  if (typeof window !== 'undefined') {
    window.removeEventListener('online', handleNetworkOrOnlineChange);
    window.removeEventListener('offline', handleNetworkOrOnlineChange);
  }

  if (unsubscribeEngineForPrebuffer) {
    unsubscribeEngineForPrebuffer();
    unsubscribeEngineForPrebuffer = null;
  }

  if (stallMonitorTimer) {
    clearInterval(stallMonitorTimer);
    stallMonitorTimer = null;
  }

  cancelPendingPrebufferCycle();
  resetLayer2Pipelines();
  lastEvalSignature = '';
}

export function useAudio(trackProgress: boolean = false) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    hookSubscribers.add(bump);
    startCoordinator();

    const unsubscribeState = audioEngine.subscribe(bump);
    const unsubscribeProgress = trackProgress ? audioEngine.subscribeProgress(bump) : null;

    return () => {
      unsubscribeState();
      if (unsubscribeProgress) unsubscribeProgress();
      hookSubscribers.delete(bump);
      if (hookSubscribers.size === 0) {
        stopCoordinator();
      }
    };
  }, [trackProgress]);

  return {
    currentSong: audioEngine.getCurrentSong(),
    queue: audioEngine.getQueue(),
    queueIndex: audioEngine.getQueueIndex(),
    playState: audioEngine.getPlayState(),
    currentTime: audioEngine.getCurrentTime(),
    duration: audioEngine.getDuration(),
    bufferedEnd: audioEngine.getBufferedEnd(),
    volume: audioEngine.getVolume(),
    isMuted: audioEngine.getIsMuted(),
    isShuffled: audioEngine.getIsShuffled(),
    repeatMode: audioEngine.getRepeatMode(),
    preferredQuality: audioEngine.getPreferredQuality(),
    activeQuality: audioEngine.getActiveQuality(),
    soundProfile: audioEngine.getSoundProfile(),
    eqBands: audioEngine.getEqBands(),
    bassBoost: audioEngine.getBassBoost(),
    dynamicCompression: audioEngine.getDynamicCompression(),
    hiResEnhancer: audioEngine.getHiResEnhancer(),
    isIOS: audioEngine.getIsIOS(),
    iosStudioEqEnabled: audioEngine.getIosStudioEqEnabled(),
    sleepTimerRemaining: audioEngine.getSleepTimerRemaining(),
    isSleepTimerOnEndTrack: audioEngine.isSleepTimerOnEndTrack(),
    isLowNetwork: currentPrebufferState.isLowNetwork,
    prebufferStatus: currentPrebufferState,

    // Controls
    playSong: (song: Song, queueContext?: Song[], activeUserEmail?: string) =>
      audioEngine.playSong(song, queueContext, activeUserEmail),
    playShuffled: (songs: Song[], activeUserEmail?: string) =>
      audioEngine.playShuffled(songs, activeUserEmail),
    play: () => audioEngine.play(),
    pause: () => audioEngine.pause(),
    togglePlayPause: () => audioEngine.togglePlayPause(),
    seek: (sec: number) => audioEngine.seek(sec),
    next: () => audioEngine.next(),
    previous: () => audioEngine.previous(),
    toggleShuffle: () => audioEngine.toggleShuffle(),
    cycleRepeatMode: () => audioEngine.cycleRepeatMode(),
    setVolume: (vol: number) => audioEngine.setVolume(vol),
    toggleMute: () => audioEngine.toggleMute(),
    setPreferredQuality: (q: AudioQuality) => audioEngine.setPreferredQuality(q),
    setSoundProfile: (p: SoundProfile) => audioEngine.setSoundProfile(p),
    setEqBands: (bands: EqBands) => audioEngine.setEqBands(bands),
    setBassBoost: (pct: number) => audioEngine.setBassBoost(pct),
    setDynamicCompression: (enabled: boolean) => audioEngine.setDynamicCompression(enabled),
    setHiResEnhancer: (enabled: boolean) => audioEngine.setHiResEnhancer(enabled),
    setIosStudioEqEnabled: (enabled: boolean) => audioEngine.setIosStudioEqEnabled(enabled),
    resetEqToPreset: () => audioEngine.resetEqToPreset(),
    addToQueue: (s: Song) => audioEngine.addToQueue(s),
    playNext: (s: Song) => audioEngine.playNext(s),
    removeFromQueue: (idx: number) => audioEngine.removeFromQueue(idx),
    clearQueue: () => audioEngine.clearQueue(),
    setSleepTimer: (min: number | 'end_of_track') => audioEngine.setSleepTimer(min),
    clearSleepTimer: () => audioEngine.clearSleepTimer(),
    setAutoResume: (enabled: boolean) => audioEngine.setAutoResume(enabled),
  };
}
