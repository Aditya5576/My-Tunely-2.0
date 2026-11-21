import React from 'react';
import {
  X,
  Check,
  Radio,
  Sparkles,
  SlidersHorizontal,
  RotateCcw,
  Volume2,
  Waves,
  Headphones,
} from 'lucide-react';
import { AudioQuality, EqBands, SoundProfile } from '../types/music';
import { useAudio } from '../hooks/useAudio';
import { useUser } from '../context/UserContext';
import { computeEffectiveEqBands } from '../utils/audioCore';

interface AudioQualityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const QUALITY_OPTIONS: Array<{
  id: AudioQuality;
  label: string;
  bitrate: string;
  badge?: string;
}> = [
  {
    id: '320kbps',
    label: 'Ultra HD + Hi-Res DSP',
    bitrate: '320+ kbps',
    badge: 'Studio',
  },
  {
    id: '160kbps',
    label: 'High Quality',
    bitrate: '160 kbps',
  },
  {
    id: '96kbps',
    label: 'Standard',
    bitrate: '96 kbps',
  },
  {
    id: '48kbps',
    label: 'Data Saver',
    bitrate: '48 kbps',
  },
  {
    id: '12kbps',
    label: 'Low Data',
    bitrate: '12 kbps',
  },
];

const SOUND_PROFILES: Array<{
  id: SoundProfile;
  label: string;
  sublabel: string;
}> = [
  { id: 'studio', label: 'Studio', sublabel: 'Rich 70Hz punch & warm clarity' },
  { id: 'bass', label: 'Deep Bass', sublabel: 'Heavy sub + warm low-end' },
  { id: 'vocal', label: 'Vocal Focus', sublabel: 'Full voices & warm presence' },
  { id: 'concert', label: 'Concert 3D', sublabel: 'Wide warm hall sparkle' },
  { id: 'night', label: 'Night Chill', sublabel: 'Balanced warmth & comfort' },
  { id: 'flat', label: 'Pure Flat', sublabel: 'Reference direct stream' },
];

const EQ_BAND_META: Array<{
  key: keyof EqBands;
  freq: string;
  label: string;
  accent: string;
}> = [
  { key: 'sub', freq: '70Hz', label: 'Sub', accent: 'from-rose-500 to-pink-500' },
  { key: 'bass', freq: '130Hz', label: 'Bass', accent: 'from-violet-500 to-fuchsia-500' },
  { key: 'mid', freq: '320Hz', label: 'Warmth', accent: 'from-indigo-500 to-blue-500' },
  { key: 'vocal', freq: '3.2kHz', label: 'Vocal', accent: 'from-cyan-400 to-sky-500' },
  { key: 'air', freq: '11kHz', label: 'Air', accent: 'from-emerald-400 to-teal-500' },
];

export const AudioQualityModal: React.FC<AudioQualityModalProps> = ({ isOpen, onClose }) => {
  const {
    preferredQuality,
    setPreferredQuality,
    soundProfile,
    setSoundProfile,
    eqBands,
    setEqBands,
    bassBoost,
    setBassBoost,
    dynamicCompression,
    setDynamicCompression,
    hiResEnhancer,
    setHiResEnhancer,
    isIOS,
    iosStudioEqEnabled,
    setIosStudioEqEnabled,
    resetEqToPreset,
  } = useAudio();
  const { updatePreferredQuality, updateSoundProfile } = useUser();

  if (!isOpen) return null;

  const effectiveBands = computeEffectiveEqBands(eqBands, bassBoost);

  const handleSelectQuality = (q: AudioQuality) => {
    setPreferredQuality(q);
    updatePreferredQuality(q);
    onClose();
  };

  const handleSelectProfile = (sp: SoundProfile) => {
    setSoundProfile(sp);
    updateSoundProfile(sp);
  };

  const handleBandChange = (key: keyof EqBands, value: number) => {
    setEqBands({
      ...eqBands,
      [key]: value,
    });
  };

  const formatDb = (val: number) => {
    const rounded = Number(val.toFixed(1));
    if (rounded > 0) return `+${rounded} dB`;
    if (rounded < 0) return `${rounded} dB`;
    return '0.0 dB';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm px-3 sm:px-4 safe-modal-inset animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-full overflow-y-auto no-scrollbar rounded-3xl bg-[var(--bg-elevated)] border border-[var(--border-strong)] p-4 sm:p-5 shadow-2xl text-[var(--text-primary)] relative animate-sheet-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Sound Mastering Header + Non-Overlapping Close Button */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2.5 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)] shrink-0">
              <SlidersHorizontal className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)] truncate">
                Studio Sound Engine
              </h3>
              <p className="text-[11px] sm:text-xs text-[var(--text-secondary)] truncate">
                Hi-Fi Audio Engine · Bit-Perfect Neutral · Soft Clip Guard
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={resetEqToPreset}
              aria-label="Reset EQ to preset"
              title="Reset sliders to selected profile defaults"
              className="h-11 px-3 min-w-[44px] min-h-[44px] rounded-full bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center gap-1.5 text-xs font-semibold transition active:scale-90 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </button>

            <button
              onClick={onClose}
              aria-label="Close quality selector"
              className="w-11 h-11 min-w-[44px] min-h-[44px] shrink-0 rounded-full bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center transition active:scale-90 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 2. 6 Mastering Profile Cards */}
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          {SOUND_PROFILES.map((sp) => {
            const active = soundProfile === sp.id;
            return (
              <button
                key={sp.id}
                type="button"
                onClick={() => handleSelectProfile(sp.id)}
                className={`min-h-[58px] p-3 rounded-2xl border text-left transition-all duration-150 cursor-pointer active:scale-95 ${
                  active
                    ? 'bg-[var(--accent-soft)] border-[var(--accent-border)] text-[var(--text-primary)] shadow-sm'
                    : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:border-[var(--border-strong)]'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span
                    className={`text-xs font-bold truncate ${
                      active ? 'text-[var(--accent-primary)]' : 'text-[var(--text-primary)]'
                    }`}
                  >
                    {sp.label}
                  </span>
                  {active && (
                    <Check className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0 stroke-[3]" />
                  )}
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                  {sp.sublabel}
                </p>
              </button>
            );
          })}
        </div>

        {/* 3. Live 5-Band EQ Spectrum Visualizer + Interactive Mastering Card */}
        <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-4 sm:p-5 mb-5 space-y-4 shadow-inner">
          {/* Spectrum Bars Preview */}
          <div className="grid grid-cols-5 gap-3 items-end h-20 px-1 pt-1">
            {EQ_BAND_META.map((band) => {
              const effectiveDb = effectiveBands[band.key];
              const pct = Math.max(12, Math.min(100, ((effectiveDb + 8) / 18) * 100));
              return (
                <div key={band.key} className="flex flex-col items-center justify-end h-full gap-1.5">
                  <div className="w-full max-w-[28px] flex-1 rounded-xl bg-[var(--bg-app)]/70 border border-[var(--border-subtle)] flex items-end overflow-hidden p-0.5">
                    <div
                      className={`w-full rounded-lg bg-gradient-to-t ${band.accent} transition-all duration-200`}
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-[var(--text-secondary)] leading-none">
                    {band.freq}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Interactive Fine-Tuning Sliders */}
          <div className="space-y-2.5 pt-3.5 border-t border-[var(--border-subtle)]">
            {EQ_BAND_META.map((band) => {
              const val = eqBands[band.key];
              return (
                <div
                  key={band.key}
                  className="min-h-[40px] grid grid-cols-[76px_minmax(0,1fr)_56px] items-center gap-3"
                >
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-[var(--text-primary)] block leading-tight">
                      {band.label}
                    </span>
                    <span className="text-[10px] font-mono text-[var(--text-muted)] block leading-tight mt-0.5">
                      {band.freq}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-8}
                    max={8}
                    step={0.5}
                    value={val}
                    aria-label={`${band.label} ${band.freq} EQ`}
                    onChange={(e) => handleBandChange(band.key, Number(e.target.value))}
                    className="tunely-slider w-full cursor-pointer"
                  />
                  <span className="text-[11px] font-mono tabular-nums text-right font-semibold text-[var(--accent-primary)]">
                    {formatDb(val)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Sub-Bass Boost + Hi-Res Earphone DSP + Studio Loudness Normalization */}
          <div className="pt-3.5 border-t border-[var(--border-subtle)] space-y-3.5">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                  <Waves className="w-4 h-4 text-rose-500" />
                  Sub-Bass Boost (70Hz)
                </span>
                <span className="font-mono text-xs tabular-nums text-rose-500 font-bold">
                  {bassBoost}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={bassBoost}
                aria-label="Sub-Bass Boost"
                onChange={(e) => setBassBoost(Number(e.target.value))}
                className="tunely-slider w-full cursor-pointer"
              />
            </div>

            <button
              type="button"
              onClick={() => setHiResEnhancer(!hiResEnhancer)}
              className={`w-full min-h-[50px] px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-3 transition cursor-pointer active:scale-[0.98] ${
                hiResEnhancer
                  ? 'bg-emerald-500/12 border-emerald-500/50 text-[var(--text-primary)]'
                  : 'bg-[var(--bg-app)]/50 border-[var(--border-subtle)] text-[var(--text-secondary)]'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 text-left">
                <Headphones className="w-4 h-4 text-emerald-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                    Hi-Res Spatial &amp; Earphone Clarifier
                  </p>
                  <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                    Beyond-320K vocal sparkle &amp; wide Mid-Side field
                  </p>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 ${
                  hiResEnhancer
                    ? 'bg-emerald-500 text-white'
                    : 'bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-muted)]'
                }`}
              >
                {hiResEnhancer ? 'ULTRA' : 'OFF'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setDynamicCompression(!dynamicCompression)}
              className={`w-full min-h-[50px] px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-3 transition cursor-pointer active:scale-[0.98] ${
                dynamicCompression
                  ? 'bg-[var(--accent-soft)] border-[var(--accent-border)] text-[var(--text-primary)]'
                  : 'bg-[var(--bg-app)]/50 border-[var(--border-subtle)] text-[var(--text-secondary)]'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 text-left">
                <Volume2 className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                    Rich Loudness &amp; Warmth
                  </p>
                  <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                    Full-bodied punch with open dynamic headroom
                  </p>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 ${
                  dynamicCompression
                    ? 'bg-[var(--accent-primary)] text-white'
                    : 'bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-muted)]'
                }`}
              >
                {dynamicCompression ? 'ON' : 'OFF'}
              </span>
            </button>

            {isIOS && (
              <button
                type="button"
                onClick={() => setIosStudioEqEnabled(!iosStudioEqEnabled)}
                className={`w-full min-h-[52px] px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-3 transition cursor-pointer active:scale-[0.98] ${
                  iosStudioEqEnabled
                    ? 'bg-amber-500/12 border-amber-500/50 text-[var(--text-primary)]'
                    : 'bg-[var(--bg-app)]/50 border-[var(--border-subtle)] text-[var(--text-secondary)]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 text-left">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                      iOS Studio EQ (Hi-Fi DSP)
                    </p>
                    <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                      {iosStudioEqEnabled
                        ? 'Clean Hi-Fi DSP active at full dynamic loudness'
                        : 'Native iOS playback active (best battery & Lock Screen)'}
                    </p>
                  </div>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 ${
                    iosStudioEqEnabled
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-muted)]'
                  }`}
                >
                  {iosStudioEqEnabled ? 'DSP ON' : 'NATIVE'}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Bitrate Section */}
        <div className="flex items-center gap-2.5 mb-3 pt-4 border-t border-[var(--border-subtle)]">
          <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-500 shrink-0">
            <Radio className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)] truncate">
              Streaming Bitrate
            </h3>
            <p className="text-[11px] sm:text-xs text-[var(--text-secondary)] truncate">
              Master source resolution
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {QUALITY_OPTIONS.map((opt) => {
            const isSelected = preferredQuality === opt.id;
            return (
              <div
                key={opt.id}
                onClick={() => handleSelectQuality(opt.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelectQuality(opt.id);
                  }
                }}
                role="button"
                tabIndex={0}
                className={`min-h-[48px] px-3.5 py-2.5 rounded-2xl border transition-all cursor-pointer grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 active:scale-98 ${
                  isSelected
                    ? 'bg-[var(--accent-soft)] border-[var(--accent-border)] shadow-sm'
                    : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-hover)]'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-xs sm:text-sm text-[var(--text-primary)] truncate">
                    {opt.label}
                  </span>
                  <span className="text-[11px] font-mono tabular-nums px-2 py-0.5 rounded-md bg-[var(--bg-app)]/60 text-[var(--text-secondary)] border border-[var(--border-subtle)] shrink-0">
                    {opt.bitrate}
                  </span>
                  {opt.badge && (
                    <span className="hidden xs:inline-flex sm:inline-flex items-center gap-0.5 text-[10px] font-bold text-[var(--accent-primary)] shrink-0">
                      <Sparkles className="w-3 h-3" />
                      {opt.badge}
                    </span>
                  )}
                </div>

                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                    isSelected
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-white'
                      : 'border-[var(--border-strong)] bg-transparent'
                  }`}
                >
                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
