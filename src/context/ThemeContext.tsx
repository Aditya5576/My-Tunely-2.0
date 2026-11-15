import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppFont, AppTheme } from '../types/music';

interface ThemeContextType {
  theme: AppTheme;
  font: AppFont;
  isDark: boolean;
  themeMeta: (typeof THEME_OPTIONS)[number];
  fontMeta: (typeof FONT_OPTIONS)[number];
  setTheme: (theme: AppTheme) => void;
  setFont: (font: AppFont) => void;
}

export const THEME_OPTIONS: Array<{
  id: AppTheme;
  label: string;
  description: string;
  swatchBg: string;
  swatchAccent: string;
  themeColor: string;
  isDark: boolean;
}> = [
  {
    id: 'midnight',
    label: 'Midnight Studio',
    description: 'Deep obsidian navy & indigo aura',
    swatchBg: '#070b14',
    swatchAccent: '#6366f1',
    themeColor: '#070b14',
    isDark: true,
  },
  {
    id: 'obsidian',
    label: 'OLED Pitch',
    description: 'Pure black screen & electric violet',
    swatchBg: '#000000',
    swatchAccent: '#8b5cf6',
    themeColor: '#000000',
    isDark: true,
  },
  {
    id: 'emerald',
    label: 'Emerald Vinyl',
    description: 'Deep studio green & mint glow',
    swatchBg: '#06110d',
    swatchAccent: '#10b981',
    themeColor: '#06110d',
    isDark: true,
  },
  {
    id: 'crimson',
    label: 'Crimson Stage',
    description: 'Velvet dark & coral spotlight',
    swatchBg: '#12070c',
    swatchAccent: '#f43f5e',
    themeColor: '#12070c',
    isDark: true,
  },
  {
    id: 'daylight',
    label: 'Daylight Paper',
    description: 'Crisp bright studio canvas',
    swatchBg: '#f3f6fc',
    swatchAccent: '#4f46e5',
    themeColor: '#f3f6fc',
    isDark: false,
  },
];

export const FONT_OPTIONS: Array<{
  id: AppFont;
  label: string;
  sample: string;
  subtitle: string;
}> = [
  {
    id: 'jakarta',
    label: 'Plus Jakarta Sans',
    sample: 'Tunely 2.0 Studio',
    subtitle: 'Clean geometric clarity',
  },
  {
    id: 'outfit',
    label: 'Outfit',
    sample: 'Tunely 2.0 Studio',
    subtitle: 'Rounded modern display',
  },
  {
    id: 'dmsans',
    label: 'DM Sans',
    sample: 'Tunely 2.0 Studio',
    subtitle: 'Swiss crisp precision',
  },
  {
    id: 'manrope',
    label: 'Manrope',
    sample: 'Tunely 2.0 Studio',
    subtitle: 'Balanced studio grotesque',
  },
  {
    id: 'editorial',
    label: 'Fraunces Serif',
    sample: 'Tunely 2.0 Studio',
    subtitle: 'Vinyl editorial headings',
  },
];

const THEME_STORAGE_KEY = 'tunely_app_theme';
const FONT_STORAGE_KEY = 'tunely_app_font';

const VALID_THEMES = new Set<AppTheme>(['midnight', 'obsidian', 'emerald', 'crimson', 'daylight']);
const VALID_FONTS = new Set<AppFont>(['jakarta', 'outfit', 'dmsans', 'manrope', 'editorial']);

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<AppTheme>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY) as AppTheme | null;
      if (saved && VALID_THEMES.has(saved)) return saved;
    } catch {}
    return 'midnight';
  });

  const [font, setFontState] = useState<AppFont>(() => {
    try {
      const saved = localStorage.getItem(FONT_STORAGE_KEY) as AppFont | null;
      if (saved && VALID_FONTS.has(saved)) return saved;
    } catch {}
    return 'jakarta';
  });

  const themeMeta = THEME_OPTIONS.find((t) => t.id === theme) || THEME_OPTIONS[0];
  const fontMeta = FONT_OPTIONS.find((f) => f.id === font) || FONT_OPTIONS[0];

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-font', font);

    if (themeMeta.isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', themeMeta.themeColor);
    }

    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
      localStorage.setItem(FONT_STORAGE_KEY, font);
    } catch {}
  }, [theme, font, themeMeta]);

  const setTheme = (next: AppTheme) => {
    if (VALID_THEMES.has(next)) setThemeState(next);
  };

  const setFont = (next: AppFont) => {
    if (VALID_FONTS.has(next)) setFontState(next);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        font,
        isDark: themeMeta.isDark,
        themeMeta,
        fontMeta,
        setTheme,
        setFont,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
