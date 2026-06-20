import { session } from './tokens';
import type { ApiErrorBody } from './types';

const BASE = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class OfflineError extends Error {
  constructor() {
    super('Sem conexão');
    this.name = 'OfflineError';
  }
}

interface RequestOpts {
  method?: string;
  body?: unknown;
  auth?: boolean; // default true
  signal?: AbortSignal;
}

// Evita várias renovações simultâneas: compartilha a mesma promise de refresh.
let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshing) return refreshing;
  const token = session.refreshToken;
  if (!token) return false;

  refreshing = (async () => {
    try {
      const res = await fetch(`${BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: token }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { accessToken: string; refreshToken: string };
      session.setTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

async function raw<T>(path: string, opts: RequestOpts, retry = true): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.auth !== false && session.accessToken) {
    headers.authorization = `Bearer ${session.accessToken}`;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch {
    throw new OfflineError();
  }

  if (res.status === 401 && retry && opts.auth !== false) {
    const ok = await tryRefresh();
    if (ok) return raw<T>(path, opts, false);
    session.clear();
    throw new ApiError(401, 'UNAUTHORIZED', 'Sessão expirada');
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const err = (data as ApiErrorBody | undefined)?.error;
    throw new ApiError(res.status, err?.code ?? 'ERROR', err?.message ?? 'Erro na requisição', err?.details);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => raw<T>(path, { method: 'GET', signal }),
  post: <T>(path: string, body?: unknown, auth = true) => raw<T>(path, { method: 'POST', body, auth }),
  patch: <T>(path: string, body?: unknown) => raw<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string) => raw<T>(path, { method: 'DELETE' }),
};

/** Prefixo das rotas escopadas no workspace ativo. */
export function wsPath(workspaceId: string, suffix: string): string {
  return `/api/workspaces/${workspaceId}${suffix}`;
}
