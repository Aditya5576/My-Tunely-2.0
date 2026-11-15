import React from 'react';
import { X, Palette, Type, Check, Sun, Moon } from 'lucide-react';
import { useTheme, THEME_OPTIONS, FONT_OPTIONS } from '../context/ThemeContext';
import { AppFont, AppTheme } from '../types/music';

interface AppearanceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FONT_PREVIEW_STYLE: Record<AppFont, React.CSSProperties> = {
  jakarta: { fontFamily: "'Plus Jakarta Sans', sans-serif" },
  outfit: { fontFamily: "'Outfit', sans-serif" },
  dmsans: { fontFamily: "'DM Sans', sans-serif" },
  manrope: { fontFamily: "'Manrope', sans-serif" },
  editorial: { fontFamily: "'Fraunces', Georgia, serif" },
};

export const AppearanceModal: React.FC<AppearanceModalProps> = ({ isOpen, onClose }) => {
  const { theme, font, setTheme, setFont } = useTheme();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm px-3 sm:px-4 safe-modal-inset animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-full overflow-y-auto no-scrollbar rounded-3xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-5 shadow-2xl text-[var(--text-primary)] relative animate-sheet-up space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)] shrink-0">
              <Palette className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-[var(--text-primary)] truncate">
                Theme &amp; Typography
              </h3>
              <p className="text-xs text-[var(--text-secondary)] truncate">
                Customize Tunely colors and font style
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close appearance settings"
            className="w-11 h-11 min-w-[44px] min-h-[44px] shrink-0 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center transition active:scale-90 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Color Theme Grid */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Color Theme
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {THEME_OPTIONS.map((t) => {
              const active = theme === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTheme(t.id as AppTheme)}
                  className={`min-h-[60px] p-3 rounded-2xl border text-left transition-all duration-150 flex items-center gap-3 cursor-pointer active:scale-[0.98] ${
                    active
                      ? 'bg-[var(--accent-soft)] border-[var(--accent-primary)] shadow-sm'
                      : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div
                    className="w-10 h-10 rounded-xl border border-white/15 shadow-inner flex items-center justify-center shrink-0 relative overflow-hidden"
                    style={{ backgroundColor: t.swatchBg }}
                  >
                    <span
                      className="w-4 h-4 rounded-full shadow"
                      style={{ backgroundColor: t.swatchAccent }}
                    />
                    <span className="absolute bottom-0.5 right-0.5 opacity-75">
                      {t.isDark ? (
                        <Moon className="w-2.5 h-2.5 text-white" />
                      ) : (
                        <Sun className="w-2.5 h-2.5 text-slate-900" />
                      )}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold text-[var(--text-primary)] truncate">
                        {t.label}
                      </span>
                      {active && <Check className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0 stroke-[3]" />}
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                      {t.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Font Family Picker */}
        <div className="space-y-2.5 pt-3 border-t border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <Type className="w-4 h-4 text-[var(--accent-primary)]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Font Family
            </span>
          </div>

          <div className="space-y-2">
            {FONT_OPTIONS.map((f) => {
              const active = font === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFont(f.id)}
                  className={`w-full min-h-[54px] px-3.5 py-2.5 rounded-2xl border flex items-center justify-between gap-3 text-left transition-all cursor-pointer active:scale-[0.98] ${
                    active
                      ? 'bg-[var(--accent-soft)] border-[var(--accent-primary)] shadow-sm'
                      : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span
                        className="text-sm font-bold text-[var(--text-primary)] truncate"
                        style={FONT_PREVIEW_STYLE[f.id]}
                      >
                        {f.label}
                      </span>
                      <span
                        className="text-xs text-[var(--text-secondary)] truncate"
                        style={FONT_PREVIEW_STYLE[f.id]}
                      >
                        · {f.sample}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                      {f.subtitle}
                    </p>
                  </div>

                  <div
                    className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                      active
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-white'
                        : 'border-[var(--border-strong)] bg-transparent'
                    }`}
                  >
                    {active && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
