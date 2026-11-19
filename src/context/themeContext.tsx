import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'tantawy_dark_mode';

const readStoredTheme = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

const applyThemeClass = (dark: boolean) => {
  try {
    document.documentElement.classList.toggle('dark', dark);
  } catch {}
};

interface ThemeContextType {
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (dark: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState<boolean>(readStoredTheme);

  useEffect(() => {
    applyThemeClass(isDark);
    try {
      localStorage.setItem(STORAGE_KEY, String(isDark));
    } catch {}
  }, [isDark]);

  const toggleTheme = useCallback(() => setIsDark((prev) => !prev), []);
  const setTheme = useCallback((dark: boolean) => setIsDark(dark), []);

  const value = useMemo(
    () => ({ isDark, toggleTheme, setTheme }),
    [isDark, toggleTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}

/**
 * نسخة آمنة من useTheme للرسوم البيانية والكروت اللي بتتعرض أحيانًا خارج
 * ThemeProvider (مثلاً سكربتات العرض). بترجّع الوضع النهاري كافتراضي بدل ما ترمي خطأ.
 */
export function useThemeSafe(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  return (
    ctx ?? {
      isDark: false,
      toggleTheme: () => {},
      setTheme: () => {}
    }
  );
}
