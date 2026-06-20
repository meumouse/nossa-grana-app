// Armazenamento de sessão (tokens, usuário, workspace ativo) em localStorage,
// com um listener simples para a UI reagir a logout forçado.

import type { User } from './types';

const KEYS = {
  access: 'ng.access',
  refresh: 'ng.refresh',
  user: 'ng.user',
  workspace: 'ng.ws',
} as const;

type Listener = () => void;
const listeners = new Set<Listener>();

export function onSessionChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  listeners.forEach((fn) => fn());
}

export const session = {
  get accessToken(): string | null {
    return localStorage.getItem(KEYS.access);
  },
  get refreshToken(): string | null {
    return localStorage.getItem(KEYS.refresh);
  },
  get user(): User | null {
    const raw = localStorage.getItem(KEYS.user);
    return raw ? (JSON.parse(raw) as User) : null;
  },
  get workspaceId(): string | null {
    return localStorage.getItem(KEYS.workspace);
  },

  setTokens(access: string, refresh: string) {
    localStorage.setItem(KEYS.access, access);
    localStorage.setItem(KEYS.refresh, refresh);
    emit();
  },
  setUser(user: User) {
    localStorage.setItem(KEYS.user, JSON.stringify(user));
    emit();
  },
  setWorkspace(id: string) {
    localStorage.setItem(KEYS.workspace, id);
    emit();
  },
  clear() {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
    emit();
  },
};
