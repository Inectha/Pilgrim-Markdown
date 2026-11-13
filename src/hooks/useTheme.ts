import { useState, useEffect, useCallback } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_STORAGE_KEY = 'pilgrim-md-theme';
const LIGHT_THEME_COLOR = '#FFFBFE';
const DARK_THEME_COLOR = '#1C1B1F';

function getStoredTheme(): ThemePreference {
  try {
    const val = localStorage.getItem(THEME_STORAGE_KEY);
    if (val === 'light' || val === 'dark' || val === 'system') return val;
  } catch {
    // Ignore
  }
  return 'system';
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(getStoredTheme);
  const [systemDark, setSystemDark] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mql.addEventListener('change', listener);
    return () => mql.removeEventListener('change', listener);
  }, []);

  const isDark = preference === 'system' ? systemDark : preference === 'dark';

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Sync ChromeOS Window Controls Overlay titlebar theme-color meta tags
    const color = isDark ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    metas.forEach((meta) => {
      meta.setAttribute('content', color);
    });
  }, [isDark]);

  const cycleTheme = useCallback(() => {
    setPreference((prev) => {
      const next: ThemePreference =
        prev === 'system' ? (systemDark ? 'light' : 'dark') : prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Ignore
      }
      return next;
    });
  }, [systemDark]);

  return {
    preference,
    isDark,
    cycleTheme,
  };
}
