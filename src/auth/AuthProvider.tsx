import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { authApi } from '../api/endpoints';
import { onSessionChange, session } from '../api/tokens';
import { db } from '../db/dexie';
import type { User } from '../api/types';

type Status = 'loading' | 'authed' | 'guest';

interface AuthContextValue {
  user: User | null;
  status: Status;
  login: (email: string, password: string) => Promise<void>;
  /** Login/cadastro com Google: recebe o ID token (`credential`) do GIS. */
  loginWithGoogle: (credential: string) => Promise<void>;
  register: (input: { email: string; password: string; name?: string }) => Promise<void>;
  logout: () => Promise<void>;
  /** Atualiza o usuário em memória + localStorage (ex.: após salvar o perfil). */
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function wipeLocalData() {
  await Promise.all([db.accounts.clear(), db.categories.clear(), db.transactions.clear(), db.outbox.clear(), db.meta.clear()]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => session.user);
  const [status, setStatus] = useState<Status>(() =>
    session.accessToken && session.user ? 'authed' : 'guest',
  );

  // Reage a logout forçado (ex.: refresh falhou no client → session.clear()).
  useEffect(() => {
    return onSessionChange(() => {
      if (!session.accessToken) {
        setUser(null);
        setStatus('guest');
      }
    });
  }, []);

  const finishAuth = (u: User, access: string, refresh: string) => {
    session.setTokens(access, refresh);
    session.setUser(u);
    setUser(u);
    setStatus('authed');
  };

  const login = async (email: string, password: string) => {
    const res = await authApi.login({ email, password });
    finishAuth(res.user, res.accessToken, res.refreshToken);
  };

  const loginWithGoogle = async (credential: string) => {
    const res = await authApi.google({ credential });
    finishAuth(res.user, res.accessToken, res.refreshToken);
  };

  const register = async (input: { email: string; password: string; name?: string }) => {
    const res = await authApi.register(input);
    finishAuth(res.user, res.accessToken, res.refreshToken);
  };

  const logout = async () => {
    const rt = session.refreshToken;
    if (rt) await authApi.logout(rt).catch(() => undefined);
    await wipeLocalData().catch(() => undefined);
    session.clear();
    setUser(null);
    setStatus('guest');
  };

  const updateUser = (u: User) => {
    session.setUser(u);
    setUser(u);
  };

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, loginWithGoogle, register, logout, updateUser }),
    [user, status],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve estar dentro de <AuthProvider>');
  return ctx;
}
