import { api, wsPath } from './client';
import type {
  Account,
  AuthResponse,
  Category,
  DashboardSummary,
  Forecast,
  ImportBatch,
  ImportItem,
  Transaction,
  User,
  Workspace,
} from './types';

// ---- Auth ----
export const authApi = {
  register: (body: { email: string; password: string; name?: string }) =>
    api.post<AuthResponse>('/api/auth/register', body, false),
  login: (body: { email: string; password: string }) =>
    api.post<AuthResponse>('/api/auth/login', body, false),
  me: () => api.get<{ user: User }>('/api/auth/me'),
  logout: (refreshToken: string) => api.post<void>('/api/auth/logout', { refreshToken }, false),
};

// ---- Workspaces ----
export const workspaceApi = {
  list: () => api.get<{ workspaces: Workspace[] }>('/api/workspaces'),
  create: (body: { name: string; type?: 'PERSONAL' | 'SHARED' }) =>
    api.post<{ workspace: Workspace }>('/api/workspaces', body),
};

// ---- Accounts (online) ----
export const accountApi = {
  list: (ws: string) => api.get<{ accounts: Account[] }>(wsPath(ws, '/accounts')),
  create: (ws: string, body: Partial<Account> & { name: string; type: string }) =>
    api.post<{ account: Account }>(wsPath(ws, '/accounts'), body),
  update: (ws: string, id: string, body: Partial<Account>) =>
    api.patch<{ account: Account }>(wsPath(ws, `/accounts/${id}`), body),
  remove: (ws: string, id: string) => api.del<void>(wsPath(ws, `/accounts/${id}`)),
};

// ---- Categories (online) ----
export const categoryApi = {
  list: (ws: string) => api.get<{ categories: Category[] }>(wsPath(ws, '/categories')),
  create: (
    ws: string,
    body: { name: string; kind: string; nature?: string; color?: string; icon?: string },
  ) => api.post<{ category: Category }>(wsPath(ws, '/categories'), body),
  update: (ws: string, id: string, body: Partial<Category>) =>
    api.patch<{ category: Category }>(wsPath(ws, `/categories/${id}`), body),
  remove: (ws: string, id: string) => api.del<void>(wsPath(ws, `/categories/${id}`)),
};

// ---- Transfer (online) ----
export const transferApi = {
  create: (
    ws: string,
    body: { fromAccountId: string; toAccountId: string; amount: number; description?: string; date: string },
  ) => api.post(wsPath(ws, '/transactions/transfer'), body),
};

// ---- Payables / analytics (online, leitura) ----
export const analyticsApi = {
  payables: (ws: string, params: { kind?: 'payable' | 'receivable'; overdue?: boolean } = {}) => {
    const q = new URLSearchParams();
    if (params.kind) q.set('kind', params.kind);
    if (params.overdue) q.set('overdue', 'true');
    const qs = q.toString();
    return api.get<{ items: Transaction[] }>(wsPath(ws, `/transactions/payables${qs ? `?${qs}` : ''}`));
  },
  summary: (ws: string) => api.get<DashboardSummary>(wsPath(ws, '/forecast/summary')),
  forecast: (ws: string) => api.get<Forecast>(wsPath(ws, '/forecast')),
};

// ---- Sync ----
export interface PullResponse {
  serverTime: string;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
}

export interface PushResponse {
  idMap: Array<{ clientId: string; id: string }>;
  serverTime: string;
}

// ---- Importação por LLM (extratos, comprovantes, CSV/OFX) ----
export interface ImportItemPatch {
  date?: string;
  description?: string;
  amount?: number;
  type?: 'INCOME' | 'EXPENSE';
  categoryId?: string | null;
  accountId?: string | null;
  status?: 'PENDING' | 'ACCEPTED' | 'REJECTED';
}

export const importApi = {
  upload: (ws: string, file: File, accountId?: string) => {
    const form = new FormData();
    form.append('file', file);
    const qs = accountId ? `?accountId=${encodeURIComponent(accountId)}` : '';
    return api.postForm<{ batch: ImportBatch }>(wsPath(ws, `/imports${qs}`), form);
  },
  list: (ws: string) => api.get<{ items: ImportBatch[] }>(wsPath(ws, '/imports')),
  get: (ws: string, id: string) => api.get<{ batch: ImportBatch }>(wsPath(ws, `/imports/${id}`)),
  patchItem: (ws: string, id: string, itemId: string, body: ImportItemPatch) =>
    api.patch<{ item: ImportItem }>(wsPath(ws, `/imports/${id}/items/${itemId}`), body),
  confirm: (ws: string, id: string, defaultAccountId?: string) =>
    api.post<{ batch: ImportBatch; imported: number }>(wsPath(ws, `/imports/${id}/confirm`), {
      defaultAccountId,
    }),
  remove: (ws: string, id: string) => api.del<void>(wsPath(ws, `/imports/${id}`)),
};

export const syncApi = {
  pull: (ws: string, since?: string) => {
    const qs = since ? `?since=${encodeURIComponent(since)}` : '';
    return api.get<PullResponse>(wsPath(ws, `/sync/pull${qs}`));
  },
  push: (ws: string, body: unknown) => api.post<PushResponse>(wsPath(ws, '/sync/push'), body),
};
