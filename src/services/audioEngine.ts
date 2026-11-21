import { AudioQuality, EqBands, PlayState, RepeatMode, Song, SoundProfile } from '../types/music';
import {
  cleanHtmlEntities,
  clampEqGain,
  computeEffectiveEqBands,
  computeHeadroomAttenuation,
  getBestImageUrl,
  getNextTrackIndex,
  resolveNextTrackIndex,
  shouldAttemptAudioContextResume,
  resolveEffectivePlaybackState,
  getPrevTrackIndex,
  getResilientLowNetQuality,
  isLowNetworkSpeed,
  NetworkConnectionSnapshot,
  resolveBestStreamUrl,
  registerMediaSessionActions,
  shuffleArray,
  shuffleQueue,
  SOUND_PROFILE_PRESETS,
  createLinearWaveShaperCurve,
  createSoftCeilingCurve,
} from '../utils/audioCore';
import { localDB } from './db';
import { musicAPI } from './api';

export type AudioEventListener = () => void;

const SOUND_PROFILE_KEY = 'tunely_sound_profile';
const EQ_BANDS_KEY = 'tunely_eq_bands_v2';
const BASS_BOOST_KEY = 'tunely_bass_boost';
const DYNAMIC_COMP_KEY = 'tunely_dynamic_comp_v2';
const HIRES_DSP_KEY = 'tunely_hires_dsp';
const IOS_STUDIO_EQ_KEY = 'tunely_ios_studio_eq_v2';
const OFFLINE_IDS_CACHE_KEY = 'tunely_offline_ids_v1';
const VOLUME_STORAGE_KEY = 'tunely_volume';

interface NetworkConnectionLike {
  effectiveType?: string;
  downlink?: number;
  saveData?: boolean;
  addEventListener?: (type: string, listener: () => void) => void;
}

function detectIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

class AudioEngine {
  private audio: HTMLAudioElement;
  private nextPreloadAudio: HTMLAudioElement | null = null;
  private prewarmedSongId: string | null = null;
  private isIOS: boolean = detectIOS();
  private currentSong: Song | null = null;
  private queue: Song[] = [];
  private originalQueue: Song[] = [];
  private queueIndex: number = -1;
  private isShuffled: boolean = false;
  private repeatMode: RepeatMode = 'all';
  private preferredQuality: AudioQuality = '320kbps';
  private activeQuality: AudioQuality = '320kbps';
  private soundProfile: SoundProfile = 'studio';
  private eqBands: EqBands = { ...SOUND_PROFILE_PRESETS.studio.bands };
  private bassBoost: number = 0;
  private dynamicCompression: boolean = SOUND_PROFILE_PRESETS.studio.compress;
  private hiResEnhancer: boolean = true;
  private playState: PlayState = 'idle';
  private currentTime: number = 0;
  private duration: number = 0;
  private bufferedEnd: number = 0;
  private volume: number = 1.0;
  private isMuted: boolean = false;
  private autoResumeOnInterruption: boolean = true;
  private intendedPlaying: boolean = false;
  private wasPlayingBeforeInterruption: boolean = false;
  private userPaused: boolean = false;
  private currentObjectUrl: string | null = null;
  private pendingSeekPos: number | null = null;
  private lastFallbackSongId: string | null = null;
  private autoResumeTimers: ReturnType<typeof setTimeout>[] = [];
  private interruptionWatchTimer: ReturnType<typeof setInterval> | null = null;
  private interruptionWatchStartedAt: number = 0;
  private stallWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private waitingTimer: ReturnType<typeof setTimeout> | null = null;
  private adaptiveQualityCap: AudioQuality | null = null;
  private loadToken: number = 0;
  private lastMediaPositionSync: number = 0;
  private isSwitchingTrack: boolean = false;
  private switchGuardTimer: ReturnType<typeof setTimeout> | null = null;
  private interruptedAt: number = 0;
  private isRecoveringIOSRoute: boolean = false;
  private lastIOSRouteRecoveryAt: number = 0;
  private appInitiatedPlay: boolean = false;
  private lastBufferedAdvanceAt: number = 0;
  private lastBufferedEnd: number = 0;
  private trackLoadStartedAt: number = 0;
  private measuredSlowNetwork: boolean = false;

  // In-memory index & pre-warmed Blob URLs so Lock Screen controls run synchronously (0 awaits)
  private offlineTrackIds: Set<string> = new Set();
  private offlineBlobUrlCache: Map<string, string> = new Map();
  private offlineIndexLoaded: boolean = false;
  // Dual-layer slow-network pre-buffered RAM Blob URLs (LRU capped at 6 tracks)
  private prebufferedTrackCache: Map<string, { blobUrl: string; quality: AudioQuality }> = new Map();

  // Web Audio Clean Hi-Fi Mastering + Unity-Mid Spatial Matrix + Transparent Limiter (default native on iOS)
  private iosStudioEqEnabled: boolean = false;
  private hiddenRecoveryAttempts: number = 0;
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private preGain: GainNode | null = null;
  private hpFilter: BiquadFilterNode | null = null;
  private subShelf: BiquadFilterNode | null = null;
  private bassPeak: BiquadFilterNode | null = null;
  private midPeak: BiquadFilterNode | null = null;
  private vocalPeak: BiquadFilterNode | null = null;
  private airShelf: BiquadFilterNode | null = null;
  private stereoLL: GainNode | null = null;
  private stereoLR: GainNode | null = null;
  private stereoRL: GainNode | null = null;
  private stereoRR: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private makeupGain: GainNode | null = null;
  private softCeilingShaper: WaveShaperNode | null = null;
  private masterGain: GainNode | null = null;
  private webAudioFailed: boolean = false;

  // Sleep timer
  private sleepTimerId: ReturnType<typeof setTimeout> | null = null;
  private sleepTimerEndTime: number | null = null;
  private sleepTimerEndTrack: boolean = false;

  // Event listeners split so high-frequency timeupdate events only re-render player progress views
  private listeners: Set<() => void> = new Set();
  private progressListeners: Set<() => void> = new Set();

  constructor() {
    this.audio = new Audio();
    this.configureAudioSession();
    this.audio.preload = 'auto';
    this.audio.setAttribute('playsinline', '');
    this.restoreSoundPreferences();
    this.syncVolumeToAudioNodes(false);
    if (this.shouldUseWebAudio()) {
      this.audio.crossOrigin = 'anonymous';
    }
    if ('preservesPitch' in this.audio) {
      (this.audio as HTMLAudioElement & { preservesPitch: boolean }).preservesPitch = true;
    }

    this.hydrateOfflineIndexSync();
    this.setupAudioListeners();
    this.setupInterruptionRecovery();
    this.setupMediaSession();
    this.refreshOfflineCacheIndex().catch(() => {});
  }

  private restoreSoundPreferences() {
    try {
      const savedProfile = localStorage.getItem(SOUND_PROFILE_KEY) as SoundProfile | null;
      if (savedProfile && savedProfile in SOUND_PROFILE_PRESETS) {
        this.soundProfile = savedProfile;
      }
      const preset = SOUND_PROFILE_PRESETS[this.soundProfile];
      this.eqBands = { ...preset.bands };
      this.dynamicCompression = preset.compress;

      const savedBandsRaw = localStorage.getItem(EQ_BANDS_KEY);
      if (savedBandsRaw) {
        const parsed = JSON.parse(savedBandsRaw) as Partial<EqBands>;
        if (parsed && typeof parsed === 'object') {
          this.eqBands = {
            sub: typeof parsed.sub === 'number' ? clampEqGain(parsed.sub) : preset.bands.sub,
            bass: typeof parsed.bass === 'number' ? clampEqGain(parsed.bass) : preset.bands.bass,
            mid: typeof parsed.mid === 'number' ? clampEqGain(parsed.mid) : preset.bands.mid,
            vocal: typeof parsed.vocal === 'number' ? clampEqGain(parsed.vocal) : preset.bands.vocal,
            air: typeof parsed.air === 'number' ? clampEqGain(parsed.air) : preset.bands.air,
          };
        }
      }

      const savedBoostRaw = localStorage.getItem(BASS_BOOST_KEY);
      if (savedBoostRaw !== null) {
        const parsedBoost = Number(savedBoostRaw);
        if (isFinite(parsedBoost)) {
          this.bassBoost = Math.max(0, Math.min(100, Math.round(parsedBoost)));
        }
      }

      const savedCompRaw = localStorage.getItem(DYNAMIC_COMP_KEY);
      if (savedCompRaw === 'true' || savedCompRaw === 'false') {
        this.dynamicCompression = savedCompRaw === 'true';
      }

      const savedHiResRaw = localStorage.getItem(HIRES_DSP_KEY);
      if (savedHiResRaw === 'true' || savedHiResRaw === 'false') {
        this.hiResEnhancer = savedHiResRaw === 'true';
      }

      const savedIosEqRaw = localStorage.getItem(IOS_STUDIO_EQ_KEY);
      if (savedIosEqRaw === 'true' || savedIosEqRaw === 'false') {
        this.iosStudioEqEnabled = savedIosEqRaw === 'true';
      } else if (this.isIOS) {
        this.iosStudioEqEnabled = false;
      }

      const savedVolumeRaw = localStorage.getItem(VOLUME_STORAGE_KEY);
      if (savedVolumeRaw !== null) {
        const parsedVolume = Number(savedVolumeRaw);
        if (isFinite(parsedVolume) && parsedVolume >= 0 && parsedVolume <= 1) {
          this.volume = parsedVolume;
          this.isMuted = parsedVolume === 0;
        }
      }
    } catch {}
  }

  private shouldUseWebAudio(): boolean {
    return !this.isIOS || this.iosStudioEqEnabled;
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  private notifyProgress() {
    this.progressListeners.forEach((fn) => fn());
  }

  public subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  public subscribeProgress(fn: () => void): () => void {
    this.progressListeners.add(fn);
    return () => {
      this.progressListeners.delete(fn);
    };
  }

  private hydrateOfflineIndexSync(): void {
    try {
      const raw = localStorage.getItem(OFFLINE_IDS_CACHE_KEY);
      if (raw !== null) {
        const ids = JSON.parse(raw);
        if (Array.isArray(ids)) {
          this.offlineTrackIds = new Set(ids.filter((id): id is string => typeof id === 'string'));
          this.offlineIndexLoaded = true;
        }
      }
    } catch {}
  }

  private persistOfflineIdsSync(): void {
    try {
      localStorage.setItem(OFFLINE_IDS_CACHE_KEY, JSON.stringify(Array.from(this.offlineTrackIds)));
    } catch {}
  }

  public async refreshOfflineCacheIndex(): Promise<void> {
    try {
      const tracks = await localDB.getAllOfflineTracks();
      this.offlineTrackIds = new Set(tracks.map((t) => t.id));
      this.offlineIndexLoaded = true;
      this.persistOfflineIdsSync();

      // Pre-create up to 20 Blob URLs in RAM so Lock-Screen Next/Prev stays 100% synchronous offline
      for (const t of tracks.slice(0, 20)) {
        if (t.audioBlob && !this.offlineBlobUrlCache.has(t.id)) {
          try {
            this.offlineBlobUrlCache.set(t.id, URL.createObjectURL(t.audioBlob));
          } catch {}
        }
      }
    } catch {}
  }

  public markOfflineTrack(songId: string, downloaded: boolean): void {
    if (!songId) return;
    if (downloaded) {
      this.offlineTrackIds.add(songId);
      localDB
        .getOfflineTrack(songId)
        .then((track) => {
          if (track?.audioBlob && !this.offlineBlobUrlCache.has(songId)) {
            this.offlineBlobUrlCache.set(songId, URL.createObjectURL(track.audioBlob));
          }
        })
        .catch(() => {});
    } else {
      this.offlineTrackIds.delete(songId);
      const cachedUrl = this.offlineBlobUrlCache.get(songId);
      if (cachedUrl) {
        URL.revokeObjectURL(cachedUrl);
        this.offlineBlobUrlCache.delete(songId);
      }
    }
    this.offlineIndexLoaded = true;
    this.persistOfflineIdsSync();
  }

  private initWebAudioGraph() {
    // Respect iPhone hybrid mode: bypassed by default so iOS lock-screen runs natively,
    // enabled dynamically when the user toggles iOS Studio EQ ON.
    if (!this.shouldUseWebAudio() || this.webAudioFailed || this.audioCtx) return;
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      let ctx: AudioContext;
      try {
        ctx = new AudioCtx({ latencyHint: 'playback' });
      } catch {
        ctx = new AudioCtx();
      }
      const source = ctx.createMediaElementSource(this.audio);

      // Pre-gain node applies dynamic headroom attenuation based on EQ boosts & makeup gain
      const preGain = ctx.createGain();
      preGain.gain.value = 1.0;

      // Gentle subsonic filter removes <18Hz DC rumble while keeping full deep sub-bass weight
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 18;
      hp.Q.value = 0.65;

      // 5-Band Studio Parametric Chain: 70Hz Sub -> 130Hz Punch -> 320Hz Warmth -> 3.2kHz Detail -> 11kHz Air
      const sub = ctx.createBiquadFilter();
      sub.type = 'lowshelf';
      sub.frequency.value = 70;

      const bass = ctx.createBiquadFilter();
      bass.type = 'peaking';
      bass.frequency.value = 130;
      bass.Q.value = 0.72;

      const mid = ctx.createBiquadFilter();
      mid.type = 'peaking';
      mid.frequency.value = 320;
      mid.Q.value = 0.8;

      const vocal = ctx.createBiquadFilter();
      vocal.type = 'peaking';
      vocal.frequency.value = 3200;
      vocal.Q.value = 0.78;

      const air = ctx.createBiquadFilter();
      air.type = 'highshelf';
      air.frequency.value = 11000;

      // Stage 1: Ultra-Transparent High-Headroom Mastering Stage (25ms attack preserves 100% drum transient punch)
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -2.5;
      comp.knee.value = 6;
      comp.ratio.value = 1.35;
      comp.attack.value = 0.025;
      comp.release.value = 0.22;

      const gain = ctx.createGain();
      gain.gain.value = 1.34;

      // Stage 2: Zero-Loss Unity-Mid Spatial Matrix (centered vocals & bass stay 100% unity)
      const splitter = ctx.createChannelSplitter(2);
      const merger = ctx.createChannelMerger(2);
      const sLL = ctx.createGain();
      const sLR = ctx.createGain();
      const sRL = ctx.createGain();
      const sRR = ctx.createGain();

      // Stage 3: Analog-Warmth Soft-Ceiling Peak Guard (bit-transparent below 0.82, zero flatlining/scattering)
      const shaper = ctx.createWaveShaper();
      shaper.curve = createSoftCeilingCurve();
      shaper.oversample = '2x';

      // Stage 4: Dedicated Master Output Gain Node (anti-pop, smooth de-zippering, prevents volume jumps)
      const masterGain = ctx.createGain();
      masterGain.gain.value = this.isMuted ? 0 : this.volume;

      source.connect(preGain);
      preGain.connect(hp);
      hp.connect(sub);
      sub.connect(bass);
      bass.connect(mid);
      mid.connect(vocal);
      vocal.connect(air);
      air.connect(comp);
      comp.connect(gain);

      gain.connect(splitter);
      splitter.connect(sLL, 0);
      splitter.connect(sLR, 1);
      splitter.connect(sRL, 0);
      splitter.connect(sRR, 1);
      sLL.connect(merger, 0, 0);
      sLR.connect(merger, 0, 0);
      sRL.connect(merger, 0, 1);
      sRR.connect(merger, 0, 1);

      merger.connect(shaper);
      shaper.connect(masterGain);
      masterGain.connect(ctx.destination);

      ctx.addEventListener('statechange', () => {
        this.updateMediaSessionPlaybackState(this.currentSong ? 'playing' : 'none');
        const state = ctx.state as string;
        if ((state === 'suspended' || state === 'interrupted') && this.intendedPlaying && !this.userPaused) {
          this.wasPlayingBeforeInterruption = true;
          if (!this.interruptedAt) this.interruptedAt = Date.now();
          this.startInterruptionWatchdog();
          // Nudge AudioContext resume unless screen is locked in Android background
          ctx.resume().catch(() => {});
        } else if (state === 'running' && this.wasPlayingBeforeInterruption && this.autoResumeOnInterruption) {
          this.scheduleAutoResume();
        }
      });

      this.audioCtx = ctx;
      this.sourceNode = source;
      this.preGain = preGain;
      this.hpFilter = hp;
      this.subShelf = sub;
      this.bassPeak = bass;
      this.midPeak = mid;
      this.vocalPeak = vocal;
      this.airShelf = air;
      this.stereoLL = sLL;
      this.stereoLR = sLR;
      this.stereoRL = sRL;
      this.stereoRR = sRR;
      this.compressor = comp;
      this.makeupGain = gain;
      this.softCeilingShaper = shaper;
      this.masterGain = masterGain;

      // Lock audio element volume to unity so browser media player does not scale DSP input
      this.audio.volume = 1.0;

      this.applySoundProfileNodes();
    } catch (err) {
      console.warn('[Tunely AudioEngine] Web Audio mastering unavailable, using direct playback:', err);
      this.webAudioFailed = true;
    }
  }

  private applySoundProfileNodes() {
    if (
      !this.audioCtx ||
      !this.preGain ||
      !this.subShelf ||
      !this.bassPeak ||
      !this.midPeak ||
      !this.vocalPeak ||
      !this.airShelf ||
      !this.compressor ||
      !this.makeupGain
    ) {
      return;
    }
    const preset = SOUND_PROFILE_PRESETS[this.soundProfile] || SOUND_PROFILE_PRESETS.studio;
    const effective = computeEffectiveEqBands(this.eqBands, this.bassBoost);
    const now = this.audioCtx.currentTime;

    // Gentle Hi-Res upper-mid & sparkle lift balanced against full bass & warm mid body
    const hiResPresenceBonus = this.hiResEnhancer && this.soundProfile !== 'flat' ? 0.5 : 0;
    const hiResAirBonus = this.hiResEnhancer && this.soundProfile !== 'flat' ? 0.9 : 0;

    // Zero-loss Mid-Side Spatial Matrix: M=(1+w/2)-(w/2)=1.000 exact center unity
    const width =
      !this.hiResEnhancer || this.soundProfile === 'flat'
        ? 0
        : this.soundProfile === 'concert'
        ? 0.22
        : this.soundProfile === 'night'
        ? 0.08
        : 0.14;

    // Apply negative pre-gain headroom attenuation taking into account constructive overlap,
    // makeup gain, stereo width injection, and enhancer gains to guarantee strictly zero clipping.
    const headroomScale = computeHeadroomAttenuation(effective, preset.makeupGain, {
      enhancerPresenceDb: hiResPresenceBonus,
      enhancerAirDb: hiResAirBonus,
      stereoWidth: width,
      minFloor: 0.12,
    });
    this.preGain.gain.setTargetAtTime(headroomScale, now, 0.025);

    // Switch between 100% bit-transparent linear identity curve in Flat mode and soft-tanh ceiling curve
    if (this.softCeilingShaper) {
      this.softCeilingShaper.curve =
        this.soundProfile === 'flat' || !this.dynamicCompression
          ? createLinearWaveShaperCurve()
          : createSoftCeilingCurve();
    }

    if (this.hpFilter) {
      this.hpFilter.frequency.setTargetAtTime(this.hiResEnhancer ? 18 : 10, now, 0.025);
    }

    this.subShelf.gain.setTargetAtTime(effective.sub, now, 0.025);
    this.bassPeak.gain.setTargetAtTime(effective.bass, now, 0.025);
    this.midPeak.gain.setTargetAtTime(effective.mid, now, 0.025);
    this.vocalPeak.gain.setTargetAtTime(Math.min(9.5, effective.vocal + hiResPresenceBonus), now, 0.025);
    this.airShelf.gain.setTargetAtTime(Math.min(9.5, effective.air + hiResAirBonus), now, 0.025);

    if (this.stereoLL && this.stereoLR && this.stereoRL && this.stereoRR) {
      const halfW = width * 0.5;
      this.stereoLL.gain.setTargetAtTime(1 + halfW, now, 0.03);
      this.stereoRR.gain.setTargetAtTime(1 + halfW, now, 0.03);
      this.stereoLR.gain.setTargetAtTime(-halfW, now, 0.03);
      this.stereoRL.gain.setTargetAtTime(-halfW, now, 0.03);
    }

    if (this.soundProfile === 'flat') {
      this.compressor.threshold.setTargetAtTime(0, now, 0.025);
      this.compressor.ratio.setTargetAtTime(1, now, 0.025);
      this.compressor.knee.setTargetAtTime(0, now, 0.025);
      this.makeupGain.gain.setTargetAtTime(1.0, now, 0.025);
    } else if (this.dynamicCompression) {
      this.compressor.threshold.setTargetAtTime(preset.compressorThreshold, now, 0.025);
      this.compressor.ratio.setTargetAtTime(preset.compressorRatio, now, 0.025);
      this.compressor.knee.setTargetAtTime(6, now, 0.025);
      this.makeupGain.gain.setTargetAtTime(preset.makeupGain, now, 0.025);
    } else {
      this.compressor.threshold.setTargetAtTime(0, now, 0.025);
      this.compressor.ratio.setTargetAtTime(1, now, 0.025);
      this.compressor.knee.setTargetAtTime(0, now, 0.025);
      this.makeupGain.gain.setTargetAtTime(1.15, now, 0.025);
    }
  }

  private ensureAudioContextResumed(): Promise<void> {
    if (!this.shouldUseWebAudio()) return Promise.resolve();
    if (!this.audioCtx && !this.webAudioFailed) {
      this.initWebAudioGraph();
    }
    if (this.audioCtx && shouldAttemptAudioContextResume(this.audioCtx.state)) {
      return this.audioCtx.resume().then(() => {
        this.syncVolumeToAudioNodes(true);
      }).catch(() => {});
    }
    return Promise.resolve();
  }

  /**
   * Explicitly resets or resumes AudioContext after phone calls / audio focus changes.
   */
  private resetAudioContextForCallEnd(): void {
    if (!this.shouldUseWebAudio()) return;
    if (!this.audioCtx) {
      this.initWebAudioGraph();
      return;
    }
    const state = this.audioCtx.state as string;
    if (state === 'closed') {
      this.audioCtx = null;
      this.sourceNode = null;
      this.softCeilingShaper = null;
      this.webAudioFailed = false;
      this.initWebAudioGraph();
      return;
    }
    if (state === 'interrupted' || state === 'suspended') {
      this.audioCtx.resume().catch(() => {
        try {
          this.audioCtx?.close().catch(() => {});
        } catch {}
        this.audioCtx = null;
        this.sourceNode = null;
        this.softCeilingShaper = null;
      });
    }
  }

  // Getters
  public getCurrentSong(): Song | null {
    return this.currentSong;
  }
  public getQueue(): Song[] {
    return this.queue;
  }
  public getQueueIndex(): number {
    return this.queueIndex;
  }
  public getPlayState(): PlayState {
    return this.playState;
  }
  public getCurrentTime(): number {
    return this.currentTime;
  }
  public getDuration(): number {
    return this.duration;
  }
  public getBufferedEnd(): number {
    return this.bufferedEnd;
  }
  public getVolume(): number {
    return this.volume;
  }
  public getIsMuted(): boolean {
    return this.isMuted;
  }
  public getIsShuffled(): boolean {
    return this.isShuffled;
  }
  public getRepeatMode(): RepeatMode {
    return this.repeatMode;
  }
  public getPreferredQuality(): AudioQuality {
    return this.preferredQuality;
  }
  public getActiveQuality(): AudioQuality {
    return this.activeQuality;
  }
  public getSoundProfile(): SoundProfile {
    return this.soundProfile;
  }
  public getEqBands(): EqBands {
    return { ...this.eqBands };
  }
  public getBassBoost(): number {
    return this.bassBoost;
  }
  public getDynamicCompression(): boolean {
    return this.dynamicCompression;
  }
  public getHiResEnhancer(): boolean {
    return this.hiResEnhancer;
  }
  public getSleepTimerRemaining(): number | null {
    if (!this.sleepTimerEndTime) return null;
    return Math.max(0, Math.floor((this.sleepTimerEndTime - Date.now()) / 1000));
  }
  public isSleepTimerOnEndTrack(): boolean {
    return this.sleepTimerEndTrack;
  }

  public getIsIOS(): boolean {
    return this.isIOS;
  }
  public getIosStudioEqEnabled(): boolean {
    return this.iosStudioEqEnabled;
  }

  public setIosStudioEqEnabled(enabled: boolean) {
    if (!this.isIOS || this.iosStudioEqEnabled === enabled) return;
    this.iosStudioEqEnabled = enabled;
    try {
      localStorage.setItem(IOS_STUDIO_EQ_KEY, String(enabled));
    } catch {}

    const curSong = this.currentSong;
    const resumePos = this.audio.currentTime > 0 ? this.audio.currentTime : this.currentTime;
    const wasPlaying = !this.audio.paused || this.intendedPlaying;

    if (enabled) {
      this.webAudioFailed = false;
      this.audio.crossOrigin = 'anonymous';
      this.ensureAudioContextResumed();
    } else {
      if (this.audioCtx) {
        try {
          this.audioCtx.close().catch(() => {});
        } catch {}
        this.audioCtx = null;
        this.sourceNode = null;
        this.softCeilingShaper = null;
      }
      // Recreate clean unrouted native <audio> element on iOS so Lock Screen returns cleanly
      const oldAudio = this.audio;
      oldAudio.pause();
      oldAudio.removeAttribute('src');
      oldAudio.load();
      this.audio = new Audio();
      this.audio.preload = 'auto';
      this.audio.setAttribute('playsinline', '');
      this.syncVolumeToAudioNodes(false);
      if ('preservesPitch' in this.audio) {
        (this.audio as HTMLAudioElement & { preservesPitch: boolean }).preservesPitch = true;
      }
      this.setupAudioListeners();
    }

    if (curSong && this.playState !== 'idle') {
      this.loadAndPlay(curSong, wasPlaying, resumePos);
    }
    this.notify();
  }

  public setSoundProfile(profile: SoundProfile) {
    const safeProfile: SoundProfile = profile in SOUND_PROFILE_PRESETS ? profile : 'studio';
    const preset = SOUND_PROFILE_PRESETS[safeProfile];
    this.soundProfile = safeProfile;
    this.eqBands = { ...preset.bands };
    this.dynamicCompression = preset.compress;
    try {
      localStorage.setItem(SOUND_PROFILE_KEY, safeProfile);
      localStorage.setItem(EQ_BANDS_KEY, JSON.stringify(this.eqBands));
      localStorage.setItem(DYNAMIC_COMP_KEY, String(this.dynamicCompression));
    } catch {}
    this.ensureAudioContextResumed();
    this.applySoundProfileNodes();
    this.notify();
  }

  public setEqBands(bands: EqBands) {
    this.eqBands = {
      sub: clampEqGain(bands.sub),
      bass: clampEqGain(bands.bass),
      mid: clampEqGain(bands.mid),
      vocal: clampEqGain(bands.vocal),
      air: clampEqGain(bands.air),
    };
    try {
      localStorage.setItem(EQ_BANDS_KEY, JSON.stringify(this.eqBands));
    } catch {}
    this.ensureAudioContextResumed();
    this.applySoundProfileNodes();
    this.notify();
  }

  public setBassBoost(percent: number) {
    this.bassBoost = Math.max(0, Math.min(100, Math.round(percent)));
    try {
      localStorage.setItem(BASS_BOOST_KEY, String(this.bassBoost));
    } catch {}
    this.ensureAudioContextResumed();
    this.applySoundProfileNodes();
    this.notify();
  }

  public setDynamicCompression(enabled: boolean) {
    this.dynamicCompression = enabled;
    try {
      localStorage.setItem(DYNAMIC_COMP_KEY, String(enabled));
    } catch {}
    this.ensureAudioContextResumed();
    this.applySoundProfileNodes();
    this.notify();
  }

  public setHiResEnhancer(enabled: boolean) {
    this.hiResEnhancer = enabled;
    try {
      localStorage.setItem(HIRES_DSP_KEY, String(enabled));
    } catch {}
    this.ensureAudioContextResumed();
    this.applySoundProfileNodes();
    this.notify();
  }

  public resetEqToPreset() {
    const preset = SOUND_PROFILE_PRESETS[this.soundProfile] || SOUND_PROFILE_PRESETS.studio;
    this.eqBands = { ...preset.bands };
    this.bassBoost = 0;
    this.dynamicCompression = preset.compress;
    this.hiResEnhancer = this.soundProfile !== 'flat';
    try {
      localStorage.setItem(EQ_BANDS_KEY, JSON.stringify(this.eqBands));
      localStorage.setItem(BASS_BOOST_KEY, '0');
      localStorage.setItem(DYNAMIC_COMP_KEY, String(this.dynamicCompression));
      localStorage.setItem(HIRES_DSP_KEY, String(this.hiResEnhancer));
    } catch {}
    this.ensureAudioContextResumed();
    this.applySoundProfileNodes();
    this.notify();
  }

  public setPreferredQuality(quality: AudioQuality) {
    this.adaptiveQualityCap = null;
    if (this.preferredQuality === quality) return;
    this.preferredQuality = quality;
    if (this.currentSong && this.playState !== 'idle' && !this.currentObjectUrl) {
      const curPos = this.audio.currentTime > 0 ? this.audio.currentTime : this.currentTime;
      const shouldPlay = !this.audio.paused || this.intendedPlaying;
      const nextUrl = resolveBestStreamUrl(this.currentSong, this.getEffectiveStreamQuality());
      if (nextUrl && nextUrl !== this.audio.currentSrc && nextUrl !== this.audio.src) {
        this.loadAndPlay(this.currentSong, shouldPlay, curPos);
      }
    }
    this.notify();
  }

  public setAutoResume(enabled: boolean) {
    this.autoResumeOnInterruption = enabled;
  }

  private getEffectiveStreamQuality(): AudioQuality {
    const order: AudioQuality[] = ['320kbps', '160kbps', '96kbps', '48kbps', '12kbps'];
    let target = this.preferredQuality;

    // Instant 48k or 96k switch when real measured latency or connection API indicates 2G/3G
    if (this.measuredSlowNetwork && order.indexOf(target) < order.indexOf('96kbps')) {
      target = '96kbps';
    }
    if (typeof navigator !== 'undefined' && 'connection' in navigator) {
      const conn = (navigator as Navigator & { connection?: NetworkConnectionLike }).connection;
      if (conn) {
        const dl = typeof conn.downlink === 'number' ? conn.downlink : 99;
        if (conn.saveData || conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g' || (dl > 0 && dl < 0.45)) {
          if (order.indexOf(target) < order.indexOf('48kbps')) {
            target = '48kbps';
          }
        } else if (conn.effectiveType === '3g' || (dl > 0 && dl < 1.35)) {
          if (order.indexOf(target) < order.indexOf('96kbps')) {
            target = '96kbps';
          }
        }
      }
    }

    if (this.adaptiveQualityCap && order.indexOf(target) < order.indexOf(this.adaptiveQualityCap)) {
      target = this.adaptiveQualityCap;
    }

    return target;
  }

  private clearAutoResumeTimers() {
    for (const t of this.autoResumeTimers) {
      clearTimeout(t);
    }
    this.autoResumeTimers = [];
  }

  private clearInterruptionWatchdog() {
    if (this.interruptionWatchTimer) {
      clearInterval(this.interruptionWatchTimer);
      this.interruptionWatchTimer = null;
    }
    this.interruptionWatchStartedAt = 0;
  }

  private startInterruptionWatchdog() {
    if (!this.autoResumeOnInterruption || this.userPaused || !this.intendedPlaying) return;
    if (this.interruptionWatchTimer) return;
    this.interruptionWatchStartedAt = Date.now();
    // Polls gently while interrupted so CallKit banner calls (which may not fire visibilitychange)
    // still auto-resume as soon as iOS releases AVAudioSession.
    this.interruptionWatchTimer = setInterval(() => {
      if (!this.autoResumeOnInterruption || this.userPaused || !this.intendedPlaying || !this.currentSong) {
        this.clearInterruptionWatchdog();
        return;
      }
      if (Date.now() - this.interruptionWatchStartedAt > 180000) {
        this.clearInterruptionWatchdog();
        return;
      }
      if (resolveEffectivePlaybackState(this.audio.paused, this.audioCtx?.state) === 'playing') {
        this.wasPlayingBeforeInterruption = false;
        this.interruptedAt = 0;
        this.hiddenRecoveryAttempts = 0;
        this.clearInterruptionWatchdog();
        return;
      }
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        // Retain up to 3 bounded auto-resume attempts when phone call finishes while locked
        if (this.hiddenRecoveryAttempts < 3 && this.wasPlayingBeforeInterruption) {
          this.hiddenRecoveryAttempts++;
          this.attemptAutoResumeStep();
        }
        return;
      }
      if (this.wasPlayingBeforeInterruption) {
        this.attemptAutoResumeStep();
      }
    }, 1500);
  }

  private clearStallWatchdog() {
    if (this.stallWatchdogTimer) {
      clearTimeout(this.stallWatchdogTimer);
      this.stallWatchdogTimer = null;
    }
  }

  private clearWaitingTimer() {
    if (this.waitingTimer) {
      clearTimeout(this.waitingTimer);
      this.waitingTimer = null;
    }
  }

  private getNavigatorConnection(): NetworkConnectionSnapshot | null {
    if (typeof navigator === 'undefined') return null;
    const nav = navigator as Navigator & {
      connection?: NetworkConnectionSnapshot;
      mozConnection?: NetworkConnectionSnapshot;
      webkitConnection?: NetworkConnectionSnapshot;
    };
    return nav.connection || nav.mozConnection || nav.webkitConnection || null;
  }

  private isConstrainedNetwork(): boolean {
    return isLowNetworkSpeed(this.getNavigatorConnection(), this.measuredSlowNetwork);
  }

  public isSlowNetworkDetected(): boolean {
    return this.isConstrainedNetwork();
  }

  public getLowNetworkTargetQuality(): AudioQuality {
    return getResilientLowNetQuality(this.preferredQuality, this.getNavigatorConnection());
  }

  public isTrackCachedInMemory(songId: string): boolean {
    if (!songId) return false;
    return this.offlineBlobUrlCache.has(songId) || this.prebufferedTrackCache.has(songId);
  }

  public getPrebufferedBlobUrl(songId: string): string | null {
    return this.prebufferedTrackCache.get(songId)?.blobUrl || null;
  }

  public registerPrebufferedTrack(songId: string, blobUrl: string, quality: AudioQuality): void {
    if (!songId || !blobUrl) return;
    const existing = this.prebufferedTrackCache.get(songId);
    if (existing && existing.blobUrl !== blobUrl) {
      if (this.currentObjectUrl !== existing.blobUrl) {
        try {
          URL.revokeObjectURL(existing.blobUrl);
        } catch {}
      }
      this.prebufferedTrackCache.delete(songId);
    }
    this.prebufferedTrackCache.set(songId, { blobUrl, quality });
    while (this.prebufferedTrackCache.size > 6) {
      const oldestKey = this.prebufferedTrackCache.keys().next().value;
      if (!oldestKey) break;
      const oldestEntry = this.prebufferedTrackCache.get(oldestKey);
      this.prebufferedTrackCache.delete(oldestKey);
      if (oldestEntry && this.currentObjectUrl !== oldestEntry.blobUrl) {
        try {
          URL.revokeObjectURL(oldestEntry.blobUrl);
        } catch {}
      }
    }
  }

  public promotePrebufferedCurrentTrack(songId: string): boolean {
    if (!songId || this.currentSong?.id !== songId) return false;
    if (this.currentObjectUrl) return false;
    const prebuffered = this.prebufferedTrackCache.get(songId);
    if (!prebuffered) return false;

    const bufferedAhead = Math.max(0, this.bufferedEnd - this.currentTime);
    const remaining = this.duration > 0 ? Math.max(0, this.duration - this.currentTime) : 999;
    const isStalling =
      this.playState === 'loading' ||
      this.audio.readyState < 3 ||
      (remaining > 6 && bufferedAhead < 3.5);
    if (!isStalling) return false;

    const resumePos = this.audio.currentTime > 0 ? this.audio.currentTime : this.currentTime;
    const shouldPlay = this.intendedPlaying && !this.userPaused;
    this.currentObjectUrl = prebuffered.blobUrl;
    this.activeQuality = prebuffered.quality;
    this.pendingSeekPos = resumePos > 0 ? resumePos : null;
    this.clearStallWatchdog();
    this.clearWaitingTimer();
    this.startAudioElementPlayback(this.currentSong, prebuffered.blobUrl, prebuffered.quality, shouldPlay, ++this.loadToken);
    this.notify();
    return true;
  }

  private armStallWatchdog() {
    this.clearStallWatchdog();
    if (!this.intendedPlaying || this.currentObjectUrl) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    this.stallWatchdogTimer = setTimeout(() => {
      if (!this.currentSong || !this.intendedPlaying || this.audio.paused) return;
      if (this.playState === 'loading' || this.audio.readyState < 3) {
        // As long as audio bytes are actively streaming in, never abort or restart the download!
        if (Date.now() - this.lastBufferedAdvanceAt < 4000) {
          this.armStallWatchdog();
          return;
        }
        this.measuredSlowNetwork = true;
        const stepDownMap: Partial<Record<AudioQuality, AudioQuality>> = {
          '320kbps': '160kbps',
          '160kbps': '96kbps',
          '96kbps': '48kbps',
          '48kbps': '12kbps',
        };
        const nextCap = stepDownMap[this.activeQuality];
        if (!nextCap) return;
        this.adaptiveQualityCap = nextCap;
        const resumeAt = this.audio.currentTime > 0 ? this.audio.currentTime : this.currentTime;
        this.loadAndPlay(this.currentSong, true, resumeAt);
      }
    }, 4200);
  }

  private prewarmNextTrack() {
    if (this.queue.length <= 1) return;
    const nextIdx = getNextTrackIndex(this.queueIndex, this.queue.length, this.repeatMode);
    if (nextIdx === null || !this.queue[nextIdx]) return;
    const nextSong = this.queue[nextIdx];
    if (nextSong.id === this.currentSong?.id || nextSong.id === this.prewarmedSongId) return;

    // Pre-warm offline Blob URL in RAM so lock-screen Next works synchronously offline
    if (this.offlineTrackIds.has(nextSong.id)) {
      this.prewarmedSongId = nextSong.id;
      if (!this.offlineBlobUrlCache.has(nextSong.id)) {
        localDB
          .getOfflineTrack(nextSong.id)
          .then((track) => {
            if (track?.audioBlob && !this.offlineBlobUrlCache.has(nextSong.id)) {
              this.offlineBlobUrlCache.set(nextSong.id, URL.createObjectURL(track.audioBlob));
            }
          })
          .catch(() => {});
      }
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const targetQuality = this.getEffectiveStreamQuality();
    const nextUrl = resolveBestStreamUrl(nextSong, targetQuality);
    if (!nextUrl) return;

    this.prewarmedSongId = nextSong.id;
    try {
      if (!this.nextPreloadAudio) {
        this.nextPreloadAudio = new Audio();
        this.nextPreloadAudio.muted = true;
        this.nextPreloadAudio.setAttribute('playsinline', '');
        if (this.shouldUseWebAudio()) {
          this.nextPreloadAudio.crossOrigin = 'anonymous';
        }
      }
      this.nextPreloadAudio.preload = 'auto';
      if (this.nextPreloadAudio.src !== nextUrl) {
        this.nextPreloadAudio.src = nextUrl;
        // Trigger browser pre-buffering into HTTP media cache (essential on 3G & iOS WebKit)
        this.nextPreloadAudio.load();
      }
    } catch {}
  }

  private beginTrackSwitchGuard() {
    this.isSwitchingTrack = true;
    if (this.switchGuardTimer) clearTimeout(this.switchGuardTimer);
    this.switchGuardTimer = setTimeout(() => {
      this.isSwitchingTrack = false;
      this.switchGuardTimer = null;
    }, 4500);
  }

  private endTrackSwitchGuard() {
    this.isSwitchingTrack = false;
    if (this.switchGuardTimer) {
      clearTimeout(this.switchGuardTimer);
      this.switchGuardTimer = null;
    }
  }

  /**
   * Re-initializes the audio buffer and AudioContext cleanly when returning from a phone call.
   */
  private reinitializeAudioBufferOnCallEnd(): void {
    this.resetAudioContextForCallEnd();
    if (!this.currentSong || !this.intendedPlaying || this.userPaused) return;
    const activeSrc = this.currentObjectUrl || this.audio.currentSrc || this.audio.src;
    if (!activeSrc) return;

    const now = Date.now();
    if (now - this.lastIOSRouteRecoveryAt < 1800) return;
    this.lastIOSRouteRecoveryAt = now;

    this.isRecoveringIOSRoute = true;
    const resumePos = this.audio.currentTime > 0 ? this.audio.currentTime : this.currentTime;
    this.pendingSeekPos = resumePos > 0 ? resumePos : null;
    this.interruptedAt = 0;
    this.wasPlayingBeforeInterruption = false;

    this.beginTrackSwitchGuard();
    try {
      this.audio.pause();
      this.syncVolumeToAudioNodes(false);
      this.audio.src = activeSrc;
      this.audio.load();
    } catch {}

    this.appInitiatedPlay = true;
    this.audio
      .play()
      .then(() => {
        this.isRecoveringIOSRoute = false;
        this.applyPendingSeekIfReady();
        this.endTrackSwitchGuard();
        this.clearInterruptionWatchdog();
        this.playState = 'playing';
        this.updateMediaSessionPlaybackState('playing');
        this.notify();
      })
      .catch(() => {
        this.isRecoveringIOSRoute = false;
        this.appInitiatedPlay = false;
        this.endTrackSwitchGuard();
        this.playState = 'paused';
        this.updateMediaSessionPlaybackState('paused');
        this.notify();
      });
  }

  private attemptAutoResumeStep(): void {
    if (!this.autoResumeOnInterruption || this.userPaused || !this.intendedPlaying || !this.currentSong) {
      return;
    }
    this.resetAudioContextForCallEnd();

    if (resolveEffectivePlaybackState(this.audio.paused, this.audioCtx?.state) === 'playing') {
      this.wasPlayingBeforeInterruption = false;
      this.interruptedAt = 0;
      this.clearAutoResumeTimers();
      this.clearInterruptionWatchdog();
      return;
    }
    if (!this.wasPlayingBeforeInterruption) return;

    const activeSrc = this.currentObjectUrl || this.audio.currentSrc || this.audio.src;
    if (!activeSrc) return;

    // If iOS or Android evicted the media decoder buffer during a call, re-initialize source cleanly
    if (this.audio.error || !this.audio.getAttribute('src') || (this.isIOS && this.interruptedAt > 0 && Date.now() - this.interruptedAt > 1200)) {
      this.beginTrackSwitchGuard();
      const resumePos = this.audio.currentTime > 0 ? this.audio.currentTime : this.currentTime;
      this.pendingSeekPos = resumePos > 0 ? resumePos : null;
      this.audio.src = activeSrc;
    }

    this.syncVolumeToAudioNodes(true);
    this.ensureAudioContextResumed();
    this.appInitiatedPlay = true;

    const playPromise = this.audio.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise
        .then(() => {
          this.applyPendingSeekIfReady();
          this.endTrackSwitchGuard();
          if (resolveEffectivePlaybackState(this.audio.paused, this.audioCtx?.state) !== 'playing') {
            this.updateMediaSessionPlaybackState('paused');
            return;
          }
          this.playState = 'playing';
          this.wasPlayingBeforeInterruption = false;
          this.interruptedAt = 0;
          this.clearAutoResumeTimers();
          this.clearInterruptionWatchdog();
          this.updateMediaSessionPlaybackState('playing');
          this.notify();
        })
        .catch(() => {
          this.appInitiatedPlay = false;
          this.endTrackSwitchGuard();
        });
    }
  }

  private scheduleAutoResume() {
    if (!this.autoResumeOnInterruption || this.userPaused || !this.intendedPlaying) return;
    this.clearAutoResumeTimers();

    this.attemptAutoResumeStep();
    this.autoResumeTimers.push(setTimeout(() => this.attemptAutoResumeStep(), 350));
    this.autoResumeTimers.push(setTimeout(() => this.attemptAutoResumeStep(), 900));
    this.autoResumeTimers.push(setTimeout(() => this.attemptAutoResumeStep(), 1800));
    this.autoResumeTimers.push(setTimeout(() => this.attemptAutoResumeStep(), 3000));
  }

  private applyPendingSeekIfReady() {
    if (this.pendingSeekPos === null || this.pendingSeekPos <= 0) return;
    const target = this.pendingSeekPos;
    const dur = this.audio.duration;
    const clamped =
      dur && isFinite(dur) && dur > 0 ? Math.min(target, Math.max(0, dur - 0.5)) : target;
    const hasSeekableRange =
      this.audio.seekable &&
      this.audio.seekable.length > 0 &&
      this.audio.seekable.end(this.audio.seekable.length - 1) >= Math.min(clamped, 1);

    if (!hasSeekableRange && this.audio.readyState < 2) return;

    try {
      this.audio.currentTime = clamped;
      this.currentTime = clamped;
      if (Math.abs(this.audio.currentTime - clamped) <= 2.5) {
        this.pendingSeekPos = null;
      }
    } catch {}
  }

  private setupAudioListeners() {
    this.audio.addEventListener('loadedmetadata', () => {
      this.applyPendingSeekIfReady();
      this.duration = this.audio.duration || this.currentSong?.duration || 0;
      if (this.currentSong) {
        this.updateMediaSessionMetadata(this.currentSong);
      }
      this.updateMediaSessionPosition(true);
      this.notifyProgress();
    });

    this.audio.addEventListener('loadeddata', () => {
      this.applyPendingSeekIfReady();
    });

    this.audio.addEventListener('play', () => {
      if (this.isRecoveringIOSRoute) return;
      const changed = this.playState !== 'playing';
      this.playState = 'playing';
      this.intendedPlaying = true;
      this.userPaused = false;
      this.hiddenRecoveryAttempts = 0;
      if (!this.shouldUseWebAudio() || resolveEffectivePlaybackState(this.audio.paused, this.audioCtx?.state) === 'playing') {
        this.clearAutoResumeTimers();
        this.clearInterruptionWatchdog();
      }
      this.clearWaitingTimer();
      this.updateMediaSessionPlaybackState('playing');
      if (changed) this.notify();
    });

    this.audio.addEventListener('pause', () => {
      if (this.isSwitchingTrack || this.isRecoveringIOSRoute) return;
      this.appInitiatedPlay = false;
      this.clearStallWatchdog();
      this.clearWaitingTimer();
      if (!this.userPaused && this.intendedPlaying && !this.audio.ended) {
        this.wasPlayingBeforeInterruption = true;
        if (!this.interruptedAt) {
          this.interruptedAt = Date.now();
        }
        this.startInterruptionWatchdog();
      }
      const changed = this.playState !== 'paused';
      this.playState = 'paused';
      if (this.userPaused || this.audio.ended) {
        this.updateMediaSessionPlaybackState('paused');
      }
      if (changed) this.notify();
    });

    this.audio.addEventListener('suspend', () => {
      if (this.isSwitchingTrack || this.isRecoveringIOSRoute) return;
      if (!this.userPaused && this.intendedPlaying && this.audio.paused && !this.audio.ended) {
        this.wasPlayingBeforeInterruption = true;
        if (!this.interruptedAt) {
          this.interruptedAt = Date.now();
        }
        this.startInterruptionWatchdog();
      }
    });

    this.audio.addEventListener('progress', () => {
      try {
        if (this.audio.buffered && this.audio.buffered.length > 0) {
          const maxEnd = this.audio.buffered.end(this.audio.buffered.length - 1);
          if (maxEnd > this.lastBufferedEnd + 0.05) {
            this.lastBufferedEnd = maxEnd;
            this.lastBufferedAdvanceAt = Date.now();
          }
          for (let i = 0; i < this.audio.buffered.length; i++) {
            if (this.audio.buffered.start(i) <= this.currentTime && this.currentTime <= this.audio.buffered.end(i)) {
              this.bufferedEnd = this.audio.buffered.end(i);
              break;
            }
          }
        }
      } catch {}
    });

    this.audio.addEventListener('canplay', () => {
      if (this.trackLoadStartedAt > 0) {
        const loadElapsed = Date.now() - this.trackLoadStartedAt;
        if (loadElapsed > 2500) {
          this.measuredSlowNetwork = true;
        } else if (loadElapsed < 900) {
          this.measuredSlowNetwork = false;
        }
        this.trackLoadStartedAt = 0;
      }
      this.applyPendingSeekIfReady();
      this.endTrackSwitchGuard();
      this.clearWaitingTimer();
      this.clearStallWatchdog();
      if (this.intendedPlaying && !this.userPaused && !this.audio.paused && this.playState !== 'playing') {
        this.playState = 'playing';
        this.updateMediaSessionPlaybackState('playing');
        this.notify();
      }
      this.prewarmNextTrack();
    });

    this.audio.addEventListener('waiting', () => {
      if (this.intendedPlaying) {
        this.armStallWatchdog();
        this.clearWaitingTimer();
        // Debounce spinner threshold so micro-stalls on play/seek do not flicker UI
        this.waitingTimer = setTimeout(() => {
          if (this.intendedPlaying && !this.userPaused && this.audio.readyState < 3 && this.playState !== 'loading') {
            this.playState = 'loading';
            this.notify();
          }
        }, 220);
      }
    });

    this.audio.addEventListener('stalled', () => {
      if (this.intendedPlaying && !this.audio.paused) {
        this.armStallWatchdog();
      }
    });

    this.audio.addEventListener('playing', () => {
      this.applyPendingSeekIfReady();
      this.endTrackSwitchGuard();
      // Catch iPhone spontaneous silent auto-resume after CallKit interruption ONLY when not triggered by our play()
      if (
        this.isIOS &&
        !this.appInitiatedPlay &&
        !this.isRecoveringIOSRoute &&
        this.interruptedAt > 0 &&
        Date.now() - this.interruptedAt > 700
      ) {
        this.reinitializeAudioBufferOnCallEnd();
        return;
      }
      this.appInitiatedPlay = false;
      const changed = this.playState !== 'playing';
      this.playState = 'playing';
      this.intendedPlaying = true;
      this.hiddenRecoveryAttempts = 0;
      if (!this.shouldUseWebAudio() || resolveEffectivePlaybackState(this.audio.paused, this.audioCtx?.state) === 'playing') {
        this.wasPlayingBeforeInterruption = false;
        this.interruptedAt = 0;
        this.clearAutoResumeTimers();
        this.clearInterruptionWatchdog();
      }
      this.clearStallWatchdog();
      this.clearWaitingTimer();
      this.updateMediaSessionPlaybackState('playing');
      if (changed) this.notify();
      this.prewarmNextTrack();
    });

    this.audio.addEventListener('timeupdate', () => {
      this.currentTime = this.audio.currentTime;
      this.duration = this.audio.duration || this.currentSong?.duration || 0;

      if (this.audio.buffered && this.audio.buffered.length > 0) {
        for (let i = 0; i < this.audio.buffered.length; i++) {
          if (this.audio.buffered.start(i) <= this.currentTime && this.currentTime <= this.audio.buffered.end(i)) {
            this.bufferedEnd = this.audio.buffered.end(i);
            break;
          }
        }
      }

      this.updateMediaSessionPosition(false);
      // Emit progress-only notification so app-wide lists/cards/views skip wasteful re-renders
      this.notifyProgress();
    });

    this.audio.addEventListener('durationchange', () => {
      this.duration = this.audio.duration || this.currentSong?.duration || 0;
      this.updateMediaSessionPosition(true);
      this.notifyProgress();
    });

    this.audio.addEventListener('ended', () => {
      this.clearStallWatchdog();
      if (this.sleepTimerEndTrack) {
        this.clearSleepTimer();
        this.pause();
        return;
      }
      this.handleTrackEnded();
    });

    this.audio.addEventListener('error', (e) => {
      this.clearStallWatchdog();
      // Ignore empty-src resets triggered deliberately on account switch
      if (!this.audio.getAttribute('src')) return;
      console.warn('[Tunely AudioEngine] Audio playback error:', e, this.audio.error);
      this.playState = 'error';
      this.handleStreamFallback();
      this.notify();
    });
  }

  private setupInterruptionRecovery() {
    const unlock = () => {
      this.configureAudioSession();
      void this.ensureAudioContextResumed();
      if (this.autoResumeOnInterruption && this.intendedPlaying && !this.userPaused && this.currentSong &&
          (this.audio.paused || this.audio.error)) this.play();
    };
    for (const event of ['touchstart', 'pointerdown', 'click']) {
      document.addEventListener(event, unlock, { passive: true });
    }
    const handleFocusRecoveryEvent = (evt?: Event) => {
      const detail = (evt as CustomEvent<{ state?: string; focus?: string }> | undefined)?.detail;
      const lostFocus =
        detail?.state === 'lost' ||
        detail?.focus === 'loss' ||
        detail?.focus === 'transient';

      if (lostFocus) {
        if (this.intendedPlaying && !this.userPaused) {
          this.wasPlayingBeforeInterruption = true;
          if (!this.interruptedAt) this.interruptedAt = Date.now();
          this.startInterruptionWatchdog();
        }
        return;
      }

      this.resetAudioContextForCallEnd();
      const shouldRecover =
        this.wasPlayingBeforeInterruption ||
        (this.isIOS && this.interruptedAt > 0 && this.intendedPlaying && !this.userPaused);
      if (shouldRecover && this.autoResumeOnInterruption) {
        if (this.isIOS && this.interruptedAt > 0 && Date.now() - this.interruptedAt > 700) {
          this.reinitializeAudioBufferOnCallEnd();
        }
        this.scheduleAutoResume();
      }
    };

    // Explicit audiofocuschange & MediaSession state listeners for post-call recovery
    window.addEventListener('audiofocuschange', handleFocusRecoveryEvent as EventListener);
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      const ms = navigator.mediaSession as unknown as Partial<EventTarget>;
      ms.addEventListener?.('audiofocuschange', handleFocusRecoveryEvent as EventListener);
      ms.addEventListener?.('statechange', handleFocusRecoveryEvent as EventListener);
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        handleFocusRecoveryEvent();
      }
    });

    window.addEventListener('focus', () => handleFocusRecoveryEvent());
    window.addEventListener('pageshow', () => handleFocusRecoveryEvent());

    // Adapt bitrate cap dynamically if cellular speed switches down mid-session
    if (typeof navigator !== 'undefined' && 'connection' in navigator) {
      const conn = (navigator as Navigator & { connection?: NetworkConnectionLike }).connection;
      conn?.addEventListener?.('change', () => {
        if (!this.isConstrainedNetwork()) {
          this.adaptiveQualityCap = null;
        }
      });
    }

    window.addEventListener('online', () => {
      if (this.intendedPlaying && !this.userPaused && this.currentSong && (this.playState === 'error' || this.audio.paused)) {
        this.wasPlayingBeforeInterruption = true;
        if (this.playState === 'error') {
          this.loadAndPlay(this.currentSong, true, this.currentTime);
        } else {
          this.scheduleAutoResume();
        }
      }
    });
  }

  private setupMediaSession() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    try {
      registerMediaSessionActions(navigator.mediaSession, {
        play: () => {
          if (this.audioCtx && shouldAttemptAudioContextResume(this.audioCtx.state)) {
            this.audioCtx.resume().catch(() => {});
          }
          this.play();
        },
        pause: () => {
          this.pause();
        },
        previous: () => {
          if (this.audioCtx && shouldAttemptAudioContextResume(this.audioCtx.state)) {
            this.audioCtx.resume().catch(() => {});
          }
          this.previous();
        },
        next: () => {
          if (this.audioCtx && shouldAttemptAudioContextResume(this.audioCtx.state)) {
            this.audioCtx.resume().catch(() => {});
          }
          this.next();
        },
        seek: (time) => {
          this.seek(time);
        },
        stop: () => this.pause(),
      });
    } catch (err) {
      console.warn('[Tunely] MediaSession action handler error:', err);
    }
  }

  private updateMediaSessionMetadata(song: Song) {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    const title = cleanHtmlEntities(song.name);
    const artist = song.artists?.primary?.map((a) => a.name).join(', ') || 'Unknown Artist';
    const album = song.album?.name ? cleanHtmlEntities(song.album.name) : 'Tunely';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';

    const rawCandidates = [
      { src: getBestImageUrl(song.image, 'sm'), sizes: '96x96' },
      { src: getBestImageUrl(song.image, 'md'), sizes: '192x192' },
      { src: getBestImageUrl(song.image, 'lg'), sizes: '512x512' },
    ];

    // Lock screen controls reject SVG data URLs on iOS & Android; guarantee valid raster URLs
    const validArtwork: MediaImage[] = rawCandidates
      .filter((item) => item.src && !item.src.startsWith('data:image/svg+xml'))
      .map((item) => ({
        src: item.src,
        sizes: item.sizes,
        type: item.src.endsWith('.png') ? 'image/png' : 'image/jpeg',
      }));

    if (validArtwork.length === 0) {
      validArtwork.push(
        { src: `${origin}/pwa-192x192.png`, sizes: '192x192', type: 'image/png' },
        { src: `${origin}/pwa-512x512.png`, sizes: '512x512', type: 'image/png' }
      );
    }

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist,
        album,
        artwork: validArtwork,
      });
      // Re-assert handlers after metadata update so Android OEM lock-screens never lose next/prev actions
      this.setupMediaSession();
    } catch (e) {
      console.warn('[Tunely] MediaSession metadata update error:', e);
    }
  }

  private updateMediaSessionPlaybackState(state: 'playing' | 'paused' | 'none') {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = state === 'playing'
        ? resolveEffectivePlaybackState(this.audio.paused, this.audioCtx?.state)
        : state;
    } catch {}
  }

  private updateMediaSessionPosition(force: boolean = false) {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    const now = Date.now();
    if (!force && now - this.lastMediaPositionSync < 900) return;
    this.lastMediaPositionSync = now;
    try {
      if (this.duration > 0 && !isNaN(this.duration) && isFinite(this.currentTime)) {
        navigator.mediaSession.setPositionState({
          duration: this.duration,
          playbackRate: this.audio.playbackRate || 1.0,
          position: Math.min(this.currentTime, this.duration),
        });
      }
    } catch {}
  }

  private async handleStreamFallback() {
    if (!this.currentSong) return;
    const expectedToken = this.loadToken;

    // If non-iOS CORS attribute blocked direct CDN audio, retry once without crossOrigin
    if (!this.isIOS && this.audio.crossOrigin === 'anonymous' && this.audio.src && !this.audioCtx) {
      this.audio.removeAttribute('crossorigin');
      this.audio.crossOrigin = null;
      this.webAudioFailed = true;
      const retryUrl = this.audio.src;
      this.pendingSeekPos = this.currentTime;
      this.audio.src = retryUrl;
      try {
        await this.audio.play();
        if (this.loadToken !== expectedToken) return;
        this.playState = 'playing';
        this.notify();
        return;
      } catch {}
    }

    const songId = this.currentSong.id;
    if (this.lastFallbackSongId !== songId) {
      this.lastFallbackSongId = songId;

      try {
        // Bypass stale cached URLs on stream error so fresh CDN URLs are resolved immediately
        const freshSong = await musicAPI.getSongDetails(songId, true);
        if (this.loadToken !== expectedToken) return;
        if (freshSong && freshSong.downloadUrl && freshSong.downloadUrl.length > 0 && this.currentSong?.id === songId) {
          this.currentSong = { ...this.currentSong, downloadUrl: freshSong.downloadUrl };
          const targetQuality = this.getEffectiveStreamQuality();
          const newUrl = resolveBestStreamUrl(this.currentSong, targetQuality);
          if (newUrl && newUrl !== this.audio.src) {
            this.pendingSeekPos = this.currentTime;
            this.activeQuality = this.detectQualityFromUrl(newUrl);
            this.audio.src = newUrl;
            this.ensureAudioContextResumed();
            await this.audio.play();
            if (this.loadToken !== expectedToken) return;
            this.playState = 'playing';
            this.notify();
            return;
          }
        }
      } catch (e) {
        console.warn('[Tunely AudioEngine] Stream fallback recovery failed:', e);
      }
    }

    setTimeout(() => {
      if (this.loadToken === expectedToken && this.playState === 'error' && this.queue.length > 1) {
        this.next();
      }
    }, 800);
  }

  private detectQualityFromUrl(url: string): AudioQuality {
    if (url.includes('_320')) return '320kbps';
    if (url.includes('_160')) return '160kbps';
    if (url.includes('_96')) return '96kbps';
    if (url.includes('_48')) return '48kbps';
    if (url.includes('_12')) return '12kbps';
    return this.preferredQuality;
  }

  public playSong(song: Song, queueContext?: Song[], activeUserEmail?: string): void {
    this.adaptiveQualityCap = null;
    if (queueContext && queueContext.length > 0) {
      this.originalQueue = [...queueContext];
      const idx = queueContext.findIndex((s) => s.id === song.id);
      if (this.isShuffled) {
        if (idx >= 0) {
          this.queue = shuffleQueue(queueContext, idx);
        } else {
          this.queue = [song, ...shuffleArray(queueContext)];
        }
        this.queueIndex = 0;
      } else {
        this.queue = [...queueContext];
        this.queueIndex = idx >= 0 ? idx : 0;
      }
    } else {
      if (!this.queue.some((s) => s.id === song.id)) {
        this.queue = [song, ...this.queue];
        this.originalQueue = [song, ...this.originalQueue];
        this.queueIndex = 0;
      } else {
        this.queueIndex = this.queue.findIndex((s) => s.id === song.id);
      }
    }

    this.currentSong = song;
    this.loadAndPlay(song, true, 0);

    if (activeUserEmail) {
      localDB.addToHistory(activeUserEmail, song).catch(() => {});
    }
  }

  public playShuffled(songs: Song[], activeUserEmail?: string): void {
    if (!songs || songs.length === 0) return;
    this.adaptiveQualityCap = null;
    this.originalQueue = [...songs];
    const shuffled = shuffleArray(songs);
    if (shuffled.length > 1 && this.currentSong && shuffled[0].id === this.currentSong.id) {
      const swapIdx = 1 + Math.floor(Math.random() * (shuffled.length - 1));
      [shuffled[0], shuffled[swapIdx]] = [shuffled[swapIdx], shuffled[0]];
    }
    this.isShuffled = true;
    this.queue = shuffled;
    this.queueIndex = 0;
    this.currentSong = shuffled[0];
    this.loadAndPlay(shuffled[0], true, 0);

    if (activeUserEmail) {
      localDB.addToHistory(activeUserEmail, shuffled[0]).catch(() => {});
    }
  }

  private startAudioElementPlayback(song: Song, audioSrc: string, resolvedQuality: AudioQuality, autoPlay: boolean, token: number) {
    if (this.loadToken !== token) return;

    this.activeQuality = resolvedQuality;
    this.trackLoadStartedAt = Date.now();
    this.lastBufferedEnd = 0;
    this.lastBufferedAdvanceAt = Date.now();
    this.beginTrackSwitchGuard();
    this.audio.src = audioSrc;
    this.syncVolumeToAudioNodes(false);
    this.updateMediaSessionMetadata(this.currentSong || song);
    this.updateMediaSessionPosition(true);
    this.configureAudioSession();

    if (autoPlay) {
      this.updateMediaSessionPlaybackState('playing');
      // Resume AudioContext in parallel WITHOUT awaiting so audio.play() keeps synchronous activation
      this.ensureAudioContextResumed();
      this.armStallWatchdog();
      this.appInitiatedPlay = true;
      const playPromise = this.audio.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise
          .then(() => {
            if (this.loadToken !== token) return;
            this.endTrackSwitchGuard();
            this.playState = 'playing';
            this.updateMediaSessionPlaybackState('playing');
            this.notify();
          })
          .catch((err) => {
            this.appInitiatedPlay = false;
            if (this.loadToken !== token) return;
            this.endTrackSwitchGuard();
            console.warn('[Tunely] Playback start interrupted or prevented:', err);
            this.clearStallWatchdog();
            this.playState = 'paused';
            this.updateMediaSessionPlaybackState('paused');
            this.notify();
          });
      }
    } else {
      this.endTrackSwitchGuard();
      this.playState = 'paused';
      this.updateMediaSessionPlaybackState('paused');
    }
  }

  private loadAndPlay(song: Song, autoPlay: boolean = true, startPos: number = 0): void {
    const token = ++this.loadToken;
    this.beginTrackSwitchGuard();
    this.currentTime = startPos > 0 ? startPos : 0;
    this.duration = song.duration || 0;
    this.bufferedEnd = 0;
    this.playState = autoPlay ? 'loading' : 'paused';
    this.intendedPlaying = autoPlay;
    this.userPaused = !autoPlay;
    this.wasPlayingBeforeInterruption = false;
    this.interruptedAt = 0;
    this.isRecoveringIOSRoute = false;
    this.appInitiatedPlay = autoPlay;
    this.lastFallbackSongId = null;
    this.pendingSeekPos = startPos > 0 ? startPos : null;
    this.clearAutoResumeTimers();
    this.clearInterruptionWatchdog();
    this.clearStallWatchdog();
    this.clearWaitingTimer();

    if (this.currentObjectUrl) {
      const ownedByOfflineCache = Array.from(this.offlineBlobUrlCache.values()).includes(this.currentObjectUrl);
      const ownedByPrebufferCache = Array.from(this.prebufferedTrackCache.values()).some(
        (entry) => entry.blobUrl === this.currentObjectUrl
      );
      if (!ownedByOfflineCache && !ownedByPrebufferCache) {
        URL.revokeObjectURL(this.currentObjectUrl);
      }
      this.currentObjectUrl = null;
    }

    const targetQuality = this.getEffectiveStreamQuality();
    const directUrl = resolveBestStreamUrl(song, targetQuality);
    const cachedOfflineUrl = this.offlineBlobUrlCache.get(song.id) || null;
    const prebufferedEntry = this.prebufferedTrackCache.get(song.id) || null;
    const canUsePrebuffered =
      Boolean(prebufferedEntry) &&
      (this.isConstrainedNetwork() || prebufferedEntry?.quality === targetQuality);
    const shouldCheckOffline =
      !cachedOfflineUrl && (!this.offlineIndexLoaded || this.offlineTrackIds.has(song.id));

    // FAST PATH 1: Cached offline Blob URL in RAM -> starts SYNCHRONOUSLY inside Lock-Screen / tap callback
    if (cachedOfflineUrl) {
      this.currentObjectUrl = cachedOfflineUrl;
      this.activeQuality = this.preferredQuality;
      this.notify();
      this.notifyProgress();
      this.startAudioElementPlayback(song, cachedOfflineUrl, this.preferredQuality, autoPlay, token);
      return;
    }

    // FAST PATH 1B: Pre-buffered RAM Blob URL from dual-layer slow-network pre-bufferer -> 0ms stall-free start
    if (!shouldCheckOffline && canUsePrebuffered && prebufferedEntry) {
      this.currentObjectUrl = prebufferedEntry.blobUrl;
      this.activeQuality = prebufferedEntry.quality;
      this.notify();
      this.notifyProgress();
      this.startAudioElementPlayback(song, prebufferedEntry.blobUrl, prebufferedEntry.quality, autoPlay, token);
      return;
    }

    // FAST PATH 2: Online track with stream URL ready starts SYNCHRONOUSLY inside Lock-Screen / tap callback (<2ms)
    if (!shouldCheckOffline && directUrl) {
      const detectedQuality = this.detectQualityFromUrl(directUrl);
      this.activeQuality = detectedQuality;
      this.notify();
      this.notifyProgress();
      this.startAudioElementPlayback(song, directUrl, detectedQuality, autoPlay, token);
      return;
    }

    // Notify optimistic UI state immediately while resolving offline blob or missing URL
    this.updateMediaSessionMetadata(song);
    this.notify();
    this.notifyProgress();

    void (async () => {
      let audioSrc = '';
      let resolvedQuality: AudioQuality = targetQuality;

      if (shouldCheckOffline) {
        try {
          const offlineTrack = await localDB.getOfflineTrack(song.id);
          if (this.loadToken !== token) return;
          if (offlineTrack && offlineTrack.audioBlob) {
            this.offlineTrackIds.add(song.id);
            const objUrl = URL.createObjectURL(offlineTrack.audioBlob);
            this.offlineBlobUrlCache.set(song.id, objUrl);
            this.currentObjectUrl = objUrl;
            audioSrc = objUrl;
            resolvedQuality = offlineTrack.quality || this.preferredQuality;
          }
        } catch (e) {
          console.warn('[Tunely] Error checking offline track:', e);
        }
      }

      if (!audioSrc) {
        if (directUrl) {
          audioSrc = directUrl;
          resolvedQuality = this.detectQualityFromUrl(directUrl);
        } else {
          try {
            const fresh = await musicAPI.getSongDetails(song.id);
            if (this.loadToken !== token) return;
            if (fresh && fresh.downloadUrl && fresh.downloadUrl.length > 0) {
              const resolvedSong = { ...song, downloadUrl: fresh.downloadUrl };
              if (this.currentSong?.id === song.id) {
                this.currentSong = resolvedSong;
              }
              audioSrc = resolveBestStreamUrl(resolvedSong, targetQuality);
              resolvedQuality = this.detectQualityFromUrl(audioSrc);
            }
          } catch {}
        }
      }

      if (this.loadToken !== token) return;
      if (!audioSrc) {
        this.playState = 'error';
        this.notify();
        return;
      }

      this.startAudioElementPlayback(this.currentSong || song, audioSrc, resolvedQuality, autoPlay, token);
    })();
  }

  public play(): void {
    this.configureAudioSession();
    this.intendedPlaying = true;
    this.userPaused = false;
    this.wasPlayingBeforeInterruption = false;
    this.interruptedAt = 0;
    this.isRecoveringIOSRoute = false;
    this.appInitiatedPlay = true;
    this.clearAutoResumeTimers();
    this.clearInterruptionWatchdog();
    this.clearWaitingTimer();
    if (!this.currentSong && this.queue.length > 0) {
      this.playSong(this.queue[0]);
      return;
    }

    const activeSrc = this.currentObjectUrl || this.audio.currentSrc || this.audio.src;
    if (!activeSrc) {
      if (this.currentSong) {
        this.loadAndPlay(this.currentSong, true, this.currentTime);
        return;
      }
      this.notify();
      return;
    }

    // Re-attach source cleanly inside user tap only if iOS/OS evicted or errored the media pipeline
    if (this.audio.error || !this.audio.getAttribute('src')) {
      this.beginTrackSwitchGuard();
      const resumeAt = this.audio.currentTime > 0 ? this.audio.currentTime : this.currentTime;
      this.pendingSeekPos = resumeAt > 0 ? resumeAt : null;
      this.audio.src = activeSrc;
    }

    this.syncVolumeToAudioNodes(true);

    // Optimistic synchronous UI state flip so button & artwork react in 0ms
    const hasBufferedData = this.audio.readyState >= 1;
    this.playState = hasBufferedData ? 'playing' : 'loading';
    this.updateMediaSessionPlaybackState('playing');
    this.notify();

    if (!hasBufferedData) {
      this.waitingTimer = setTimeout(() => {
        if (this.intendedPlaying && !this.userPaused && this.audio.readyState < 2) {
          this.playState = 'loading';
          this.notify();
        }
      }, 220);
    }

    this.ensureAudioContextResumed();
    const playPromise = this.audio.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise
        .then(() => {
          this.endTrackSwitchGuard();
          this.clearWaitingTimer();
          if (!this.userPaused && this.playState !== 'playing') {
            this.playState = 'playing';
            this.notify();
          }
        })
        .catch((err: unknown) => {
          this.appInitiatedPlay = false;
          this.endTrackSwitchGuard();
          this.clearWaitingTimer();
          const errName = (err as { name?: string } | null)?.name || '';
          console.warn('[Tunely] Play error:', err);
          if (errName === 'AbortError') {
            return;
          }
          // If stale CDN URL/media pipeline caused failure after interruption, recover via stream reload
          if (
            this.intendedPlaying &&
            !this.userPaused &&
            this.currentSong &&
            errName !== 'NotAllowedError'
          ) {
            this.handleStreamFallback();
            return;
          }
          if (!this.intendedPlaying || this.audio.paused) {
            this.playState = 'paused';
            this.updateMediaSessionPlaybackState('paused');
            this.notify();
          }
        });
    }
  }

  public pause(): void {
    this.intendedPlaying = false;
    this.userPaused = true;
    this.wasPlayingBeforeInterruption = false;
    this.interruptedAt = 0;
    this.isRecoveringIOSRoute = false;
    this.appInitiatedPlay = false;
    this.endTrackSwitchGuard();
    this.clearAutoResumeTimers();
    this.clearInterruptionWatchdog();
    this.clearStallWatchdog();
    this.clearWaitingTimer();
    // Flip UI state BEFORE native pause call for instant zero-lag response
    this.playState = 'paused';
    this.updateMediaSessionPlaybackState('paused');
    this.notify();
    this.audio.pause();
  }

  public togglePlayPause(): void {
    if (this.playState === 'playing' || (this.intendedPlaying && !this.audio.paused)) {
      this.pause();
    } else {
      this.play();
    }
  }

  public seek(seconds: number): void {
    if (!this.duration || isNaN(this.duration)) return;
    const clamped = Math.max(0, Math.min(seconds, this.duration));
    this.clearWaitingTimer();
    this.audio.currentTime = clamped;
    this.currentTime = clamped;
    this.updateMediaSessionPosition(true);
    this.notifyProgress();
  }

  public next(): void {
    if (this.queue.length === 0) return;
    this.ensureAudioContextResumed();
    const effectiveRepeat = this.repeatMode === 'one' ? 'all' : this.repeatMode;
    const nextIdx = getNextTrackIndex(this.queueIndex, this.queue.length, effectiveRepeat);
    if (nextIdx !== null && this.queue[nextIdx]) {
      this.queueIndex = nextIdx;
      this.currentSong = this.queue[nextIdx];
      this.loadAndPlay(this.currentSong, true, 0);
    } else {
      this.pause();
      this.seek(0);
    }
  }

  public previous(): void {
    if (this.queue.length === 0) return;
    this.ensureAudioContextResumed();
    const prevIdx = getPrevTrackIndex(this.queueIndex, this.queue.length, this.currentTime);
    if (prevIdx === this.queueIndex) {
      this.seek(0);
      this.play();
    } else if (this.queue[prevIdx]) {
      this.queueIndex = prevIdx;
      this.currentSong = this.queue[prevIdx];
      this.loadAndPlay(this.currentSong, true, 0);
    }
  }

  private handleTrackEnded(): void {
    // Read engine state at event time; no React render snapshot participates.
    const nextIndex = resolveNextTrackIndex(this.queueIndex, this.queue.length, this.repeatMode);
    if (nextIndex === null) {
      this.pause();
      return;
    }
    if (nextIndex === this.queueIndex) {
      this.seek(0);
      this.play();
    } else {
      this.queueIndex = nextIndex;
      this.currentSong = this.queue[nextIndex];
      void this.ensureAudioContextResumed();
      this.loadAndPlay(this.currentSong, true, 0);
    }
  }

  private configureAudioSession(): void {
    if (typeof navigator === 'undefined' || !('audioSession' in navigator)) return;
    try {
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'playback';
    } catch { /* Older WebKit versions may expose a read-only session. */ }
  }

  public toggleShuffle(): void {
    this.isShuffled = !this.isShuffled;
    if (this.isShuffled) {
      if (this.originalQueue.length === 0 && this.queue.length > 0) {
        this.originalQueue = [...this.queue];
      }
      if (this.queue.length > 1) {
        const currentIdx =
          this.queueIndex >= 0 && this.queueIndex < this.queue.length
            ? this.queueIndex
            : this.currentSong
            ? Math.max(0, this.queue.findIndex((s) => s.id === this.currentSong?.id))
            : 0;
        this.queue = shuffleQueue(this.queue, currentIdx);
        this.queueIndex = 0;
      }
    } else {
      if (this.originalQueue.length > 0) {
        this.queue = [...this.originalQueue];
        if (this.currentSong) {
          const idx = this.queue.findIndex((s) => s.id === this.currentSong?.id);
          this.queueIndex = idx >= 0 ? idx : 0;
        }
      }
    }
    this.prewarmNextTrack();
    this.notify();
  }

  public cycleRepeatMode(): void {
    if (this.repeatMode === 'off') {
      this.repeatMode = 'all';
    } else if (this.repeatMode === 'all') {
      this.repeatMode = 'one';
    } else {
      this.repeatMode = 'off';
    }
    this.prewarmNextTrack();
    this.notify();
  }

  /**
   * Synchronize current volume and mute state safely across both the Web Audio master gain node
   * and the native HTMLAudioElement fallback, with smooth de-zippering to prevent pops or volume spikes.
   */
  private syncVolumeToAudioNodes(smooth: boolean = true): void {
    const target = this.isMuted ? 0 : this.volume;
    if (this.audioCtx && this.masterGain && this.audioCtx.state !== 'closed') {
      try {
        this.audio.volume = 1.0;
        this.audio.muted = false;
        const now = this.audioCtx.currentTime;
        if (smooth) {
          this.masterGain.gain.setTargetAtTime(target, now, 0.02);
        } else {
          this.masterGain.gain.setValueAtTime(target, now);
        }
      } catch {
        this.audio.volume = target;
        this.audio.muted = this.isMuted;
      }
    } else {
      try {
        this.audio.volume = target;
        this.audio.muted = this.isMuted;
      } catch {}
    }
  }

  public setVolume(vol: number): void {
    const clamped = Math.max(0, Math.min(1, vol));
    this.volume = clamped;
    this.isMuted = clamped === 0;
    try {
      localStorage.setItem(VOLUME_STORAGE_KEY, String(clamped));
    } catch {}
    this.syncVolumeToAudioNodes(true);
    this.notify();
  }

  public toggleMute(): void {
    if (this.isMuted || this.volume === 0) {
      if (this.volume === 0) {
        this.volume = 1.0;
        try {
          localStorage.setItem(VOLUME_STORAGE_KEY, '1.0');
        } catch {}
      }
      this.isMuted = false;
    } else {
      this.isMuted = true;
    }
    this.syncVolumeToAudioNodes(true);
    this.notify();
  }

  // Queue Operations
  public addToQueue(song: Song): void {
    if (!this.queue.some((s) => s.id === song.id)) {
      this.queue.push(song);
      this.originalQueue.push(song);
      this.notify();
    }
  }

  public playNext(song: Song): void {
    const filtered = this.queue.filter((s) => s.id !== song.id);
    const insertIdx = this.queueIndex + 1;
    filtered.splice(insertIdx, 0, song);
    this.queue = filtered;
    this.prewarmNextTrack();
    this.notify();
  }

  public removeFromQueue(index: number): void {
    if (index < 0 || index >= this.queue.length) return;
    const removedSong = this.queue[index];
    const remaining = this.queue.filter((_, i) => i !== index);
    if (removedSong) {
      this.originalQueue = this.originalQueue.filter((s) => s.id !== removedSong.id);
    }

    if (remaining.length === 0) {
      this.resetForAccountSwitch();
      return;
    }

    if (index === this.queueIndex) {
      const shouldResume = this.intendedPlaying || this.playState === 'playing';
      const nextIdx = index < remaining.length ? index : 0;
      this.queue = remaining;
      this.queueIndex = nextIdx;
      this.currentSong = remaining[nextIdx];
      this.loadAndPlay(this.currentSong, shouldResume, 0);
      return;
    }

    this.queue = remaining;
    if (index < this.queueIndex) {
      this.queueIndex = Math.max(0, this.queueIndex - 1);
    }
    this.prewarmNextTrack();
    this.notify();
  }

  public clearQueue(): void {
    if (this.currentSong) {
      this.queue = [this.currentSong];
      this.originalQueue = [this.currentSong];
      this.queueIndex = 0;
    } else {
      this.queue = [];
      this.originalQueue = [];
      this.queueIndex = -1;
    }
    this.notify();
  }

  // Sleep Timer
  public setSleepTimer(minutes: number | 'end_of_track'): void {
    this.clearSleepTimer();
    if (minutes === 'end_of_track') {
      this.sleepTimerEndTrack = true;
      this.notify();
      return;
    }

    const durationMs = minutes * 60 * 1000;
    this.sleepTimerEndTime = Date.now() + durationMs;
    this.sleepTimerEndTrack = false;

    this.sleepTimerId = setTimeout(() => {
      this.pause();
      this.clearSleepTimer();
    }, durationMs);

    this.notify();
  }

  public clearSleepTimer(): void {
    if (this.sleepTimerId) {
      clearTimeout(this.sleepTimerId);
      this.sleepTimerId = null;
    }
    this.sleepTimerEndTime = null;
    this.sleepTimerEndTrack = false;
    this.notify();
  }

  /**
   * Completely halt playback and clear track/queue/lock-screen metadata when switching accounts or logging out.
   */
  public resetForAccountSwitch(): void {
    this.loadToken++;
    this.clearSleepTimer();
    this.clearAutoResumeTimers();
    this.clearInterruptionWatchdog();
    this.clearStallWatchdog();
    this.clearWaitingTimer();

    this.intendedPlaying = false;
    this.userPaused = true;
    this.wasPlayingBeforeInterruption = false;
    this.interruptedAt = 0;
    this.isRecoveringIOSRoute = false;
    this.appInitiatedPlay = false;
    this.endTrackSwitchGuard();
    this.pendingSeekPos = null;
    this.adaptiveQualityCap = null;
    this.lastFallbackSongId = null;
    this.prewarmedSongId = null;

    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();

    if (this.nextPreloadAudio) {
      try {
        this.nextPreloadAudio.removeAttribute('src');
        this.nextPreloadAudio.load();
      } catch {}
    }

    this.offlineBlobUrlCache.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    });
    this.offlineBlobUrlCache.clear();
    this.prebufferedTrackCache.forEach((entry) => {
      try {
        URL.revokeObjectURL(entry.blobUrl);
      } catch {}
    });
    this.prebufferedTrackCache.clear();
    this.currentObjectUrl = null;

    this.currentSong = null;
    this.queue = [];
    this.originalQueue = [];
    this.queueIndex = -1;
    this.playState = 'idle';
    this.currentTime = 0;
    this.duration = 0;
    this.bufferedEnd = 0;

    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
      } catch {}
    }

    this.notify();
    this.notifyProgress();
  }
}

export const audioEngine = new AudioEngine();
