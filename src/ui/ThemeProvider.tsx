import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

const KEY = 'ng.theme';

export type ThemeMode = 'light' | 'dark' | 'system';
type Resolved = 'light' | 'dark';

// Lê a preferência salva; cai em "system" (segue o SO) se ausente/inválida.
export function getStoredTheme(): ThemeMode {
  const v = localStorage.getItem(KEY);
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Resolve o tema efetivo e aplica/remove a classe .dark no <html> (exigida pelo
// Tailwind/shadcn). Exportada para ser chamada também no boot, antes do React,
// evitando o flash de tema errado. Retorna o tema realmente aplicado.
export function applyTheme(mode: ThemeMode): Resolved {
  const resolved: Resolved = mode === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : mode;
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  // Alinha controles nativos (scrollbars, inputs de data) ao tema.
  root.style.colorScheme = resolved;
  return resolved;
}

interface ThemeContextValue {
  theme: ThemeMode; // preferência escolhida pelo usuário
  resolved: Resolved; // tema efetivamente aplicado (resolve "system")
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => getStoredTheme());
  const [resolved, setResolved] = useState<Resolved>(() => applyTheme(getStoredTheme()));

  const setTheme = useCallback((mode: ThemeMode) => {
    localStorage.setItem(KEY, mode);
    setThemeState(mode);
    setResolved(applyTheme(mode));
  }, []);

  // Em "system", acompanha mudanças da preferência do SO em tempo real.
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setResolved(applyTheme('system'));
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme deve estar dentro de <ThemeProvider>');
  return ctx;
}
