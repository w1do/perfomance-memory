import { useCallback, useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'pm-theme';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  );
  const toggle = useCallback(() => {
    setTheme((t) => {
      const next: Theme = t === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(KEY, next);
      } catch {
        // storage unavailable — theme still switches for this visit
      }
      return next;
    });
  }, []);
  return { theme, toggle };
}
