import { api, wsPath } from './client';
import type {
  Account,
  AnalyzeTransactionInput,
  AuthResponse,
  Budget,
  BudgetView,
  Category,
  ConsistencyFinding,
  ConsistencyKind,
  CreditCard,
  CreditCardInvoice,
  DashboardSummary,
  Forecast,
  ImportBatch,
  ImportItem,
  InstallmentPlan,
  Institution,
  LlmModelInfo,
  LlmProvider,
  InvestmentAsset,
  InvestmentPosition,
  InvestmentTransaction,
  InvestmentTxKind,
  InvoiceStatus,
  Invitation,
  Member,
  MemberRole,
  MyInvitation,
  ProfileUpdateInput,
  RecurrenceFrequency,
  RecurringSuggestion,
  RecurringTransaction,
  Transaction,
  TxShare,
  User,
  Workspace,
  WorkspaceSettings,
  WorkspaceSettingsInput,
} from './types';

// ---- Auth ----
export const authApi = {
  register: (body: { email: string; password: string; name?: string }) =>
    api.post<AuthResponse>('/api/auth/register', body, false),
  login: (body: { email: string; password: string }) =>
    api.post<AuthResponse>('/api/auth/login', body, false),
  google: (body: { credential: string }) =>
    api.post<AuthResponse>('/api/auth/google', body, false),
  me: () => api.get<{ user: User }>('/api/auth/me'),
  updateProfile: (body: ProfileUpdateInput) =>
    api.patch<{ user: User }>('/api/auth/me', body),
  logout: (refreshToken: string) => api.post<void>('/api/auth/logout', { refreshToken }, false),
  forgotPassword: (email: string) =>
    api.post<{ message: string }>('/api/auth/forgot-password', { email }, false),
  resetPassword: (token: string, password: string) =>
    api.post<{ message: string }>('/api/auth/reset-password', { token, password }, false),
  verifyEmail: (token: string) =>
    api.post<{ message: string }>('/api/auth/verify-email', { token }, false),
  resendVerification: () =>
    api.post<{ message: string }>('/api/auth/resend-verification', undefined, true),
};

// ---- Workspaces ----
export const workspaceApi = {
  list: () => api.get<{ workspaces: Workspace[] }>('/api/workspaces'),
  create: (body: { name: string; type?: 'PERSONAL' | 'SHARED' }) =>
    api.post<{ workspace: Workspace }>('/api/workspaces', body),
  getSettings: (ws: string) =>
    api.get<{ settings: WorkspaceSettings | null }>(wsPath(ws, '/settings')),
  updateSettings: (ws: string, body: WorkspaceSettingsInput) =>
    api.patch<{ settings: WorkspaceSettings }>(wsPath(ws, '/settings'), body),
  // Busca via API os modelos do provider. A chave pode ir no corpo p/ testar
  // uma ainda não salva; senão o backend usa a do workspace ou a de env.
  listLlmModels: (ws: string, body: { provider?: LlmProvider; apiKey?: string }) =>
    api.post<{ provider: LlmProvider; models: LlmModelInfo[]; fetchedAt: string }>(
      wsPath(ws, '/settings/llm/models'),
      body,
    ),
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

// ---- Credit cards (online) ----
export const cardApi = {
  list: (ws: string) => api.get<{ cards: CreditCard[] }>(wsPath(ws, '/cards')),
  create: (ws: string, body: Partial<CreditCard> & { name: string }) =>
    api.post<{ card: CreditCard }>(wsPath(ws, '/cards'), body),
  update: (ws: string, id: string, body: Partial<CreditCard>) =>
    api.patch<{ card: CreditCard }>(wsPath(ws, `/cards/${id}`), body),
  remove: (ws: string, id: string) => api.del<void>(wsPath(ws, `/cards/${id}`)),
};

// ---- Institutions / bancos (online, catálogo) ----
export const institutionApi = {
  list: (ws: string) => api.get<{ institutions: Institution[] }>(wsPath(ws, '/institutions')),
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

// ---- Verificação de inconsistências com IA (online) ----
export const consistencyApi = {
  analyze: (ws: string, body: { checks: ConsistencyKind[]; transactions: AnalyzeTransactionInput[] }) =>
    api.post<{ findings: ConsistencyFinding[] }>(wsPath(ws, '/transactions/analyze'), body),
};

// ---- Transfer (online) ----
export const transferApi = {
  create: (
    ws: string,
    body: { fromAccountId: string; toAccountId: string; amount: number; description?: string; date: string },
  ) => api.post(wsPath(ws, '/transactions/transfer'), body),
};

// ---- Transações (online, edição pontual: ex. data de uma parcela) ----
export interface TransactionUpdateInput {
  date?: string; // ISO
  dueDate?: string | null; // ISO
}

export const transactionApi = {
  update: (ws: string, id: string, body: TransactionUpdateInput) =>
    api.patch<{ transaction: Transaction }>(wsPath(ws, `/transactions/${id}`), body),
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
  creditCards: CreditCard[];
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
  creditCardId?: string | null;
  status?: 'PENDING' | 'ACCEPTED' | 'REJECTED';
}

/** Dono padrão do lote: conta OU cartão (no máximo um preenchido). */
export interface ImportOwner {
  accountId?: string;
  creditCardId?: string;
}

export const importApi = {
  upload: (ws: string, file: File, owner: ImportOwner = {}) => {
    const form = new FormData();
    form.append('file', file);
    const q = new URLSearchParams();
    if (owner.accountId) q.set('accountId', owner.accountId);
    if (owner.creditCardId) q.set('creditCardId', owner.creditCardId);
    const qs = q.toString() ? `?${q}` : '';
    return api.postForm<{ batch: ImportBatch }>(wsPath(ws, `/imports${qs}`), form);
  },
  list: (ws: string) => api.get<{ items: ImportBatch[] }>(wsPath(ws, '/imports')),
  get: (ws: string, id: string) => api.get<{ batch: ImportBatch }>(wsPath(ws, `/imports/${id}`)),
  patchItem: (ws: string, id: string, itemId: string, body: ImportItemPatch) =>
    api.patch<{ item: ImportItem }>(wsPath(ws, `/imports/${id}/items/${itemId}`), body),
  // Quando há fila (Redis), a API responde 202 com queued:true e o processamento
  // segue em background — acompanhe via `get` (polling) até CONFIRMED/FAILED.
  // Sem fila, vem queued:false com `imported` já preenchido.
  confirm: (ws: string, id: string, owner: ImportOwner = {}) =>
    api.post<{ batch: ImportBatch; imported?: number; queued: boolean }>(
      wsPath(ws, `/imports/${id}/confirm`),
      { defaultAccountId: owner.accountId, defaultCreditCardId: owner.creditCardId },
    ),
  remove: (ws: string, id: string) => api.del<void>(wsPath(ws, `/imports/${id}`)),
};

// ---- Orçamentos (online) ----
export interface BudgetUpsert {
  categoryId?: string | null;
  month: string; // YYYY-MM-DD (dia 1 do mês)
  amount: number;
  rollover?: boolean;
}

export const budgetApi = {
  list: (ws: string, month: string) =>
    api.get<{ month: string; budgets: BudgetView[] }>(
      wsPath(ws, `/budgets?month=${encodeURIComponent(month)}`),
    ),
  upsert: (ws: string, body: BudgetUpsert) =>
    api.post<{ budget: Budget }>(wsPath(ws, '/budgets'), body),
  remove: (ws: string, id: string) => api.del<void>(wsPath(ws, `/budgets/${id}`)),
};

// ---- Recorrências (online) ----
export interface RecurringInput {
  accountId: string;
  type: 'INCOME' | 'EXPENSE';
  amount: number;
  description: string;
  categoryId?: string | null;
  frequency: RecurrenceFrequency;
  interval?: number;
  anchorDay?: number | null;
  startDate: string;
  endDate?: string | null;
  autoConfirm?: boolean;
  /** Ids de transações existentes da série, p/ vincular (sem duplicar valores). */
  linkTransactionIds?: string[];
}

export const recurringApi = {
  list: (ws: string) =>
    api.get<{ items: RecurringTransaction[] }>(wsPath(ws, '/recurring')),
  // Séries regulares detectadas no extrato ainda sem recorrência cadastrada.
  suggestions: (ws: string) =>
    api.get<{ suggestions: RecurringSuggestion[] }>(wsPath(ws, '/recurring/suggestions')),
  create: (ws: string, body: RecurringInput) =>
    api.post<{ recurring: RecurringTransaction }>(wsPath(ws, '/recurring'), body),
  update: (ws: string, id: string, body: Partial<RecurringInput> & { isActive?: boolean }) =>
    api.patch<{ recurring: RecurringTransaction }>(wsPath(ws, `/recurring/${id}`), body),
  remove: (ws: string, id: string) => api.del<void>(wsPath(ws, `/recurring/${id}`)),
};

// ---- Parcelamentos (online) ----
export interface InstallmentInput {
  // Dono das parcelas: conta OU cartão (exatamente um).
  accountId?: string;
  creditCardId?: string;
  description: string;
  totalAmount: number;
  installments: number;
  /** Parcela em que o parcelamento já se encontra (1 = compra nova). */
  startInstallment?: number;
  /** Vencimento da parcela inicial (startInstallment). */
  firstDueDate: string;
  categoryId?: string | null;
  /** Divisão entre pessoas. Inclui o dono (owner: true). Vazio = sem divisão. */
  shares?: TxShare[] | null;
  /** Total de pessoas no rateio (default = nº de participantes). */
  shareCount?: number | null;
}

export const installmentApi = {
  list: (ws: string) => api.get<{ items: InstallmentPlan[] }>(wsPath(ws, '/installments')),
  get: (ws: string, id: string) =>
    api.get<{ plan: InstallmentPlan }>(wsPath(ws, `/installments/${id}`)),
  create: (ws: string, body: InstallmentInput) =>
    api.post<{ plan: InstallmentPlan }>(wsPath(ws, '/installments'), body),
  update: (ws: string, id: string, body: InstallmentInput) =>
    api.patch<{ plan: InstallmentPlan }>(wsPath(ws, `/installments/${id}`), body),
  remove: (ws: string, id: string) => api.del<void>(wsPath(ws, `/installments/${id}`)),
};

// ---- Faturas de cartão (online) ----
export const invoiceApi = {
  list: (ws: string, params: { creditCardId?: string; status?: InvoiceStatus } = {}) => {
    const q = new URLSearchParams();
    if (params.creditCardId) q.set('creditCardId', params.creditCardId);
    if (params.status) q.set('status', params.status);
    const qs = q.toString();
    return api.get<{ invoices: CreditCardInvoice[] }>(
      wsPath(ws, `/invoices${qs ? `?${qs}` : ''}`),
    );
  },
  get: (ws: string, id: string) =>
    api.get<{ invoice: CreditCardInvoice }>(wsPath(ws, `/invoices/${id}`)),
  pay: (ws: string, id: string, body: { paymentAccountId?: string; paidAt?: string } = {}) =>
    api.post<{ invoice: CreditCardInvoice }>(wsPath(ws, `/invoices/${id}/pay`), body),
};

// ---- Investimentos (online) ----
export interface AssetInput {
  symbol?: string | null;
  name: string;
  class: InvestmentAsset['class'];
  currency?: string;
  lastPrice?: number | null;
}

export interface InvestmentTxInput {
  accountId: string;
  assetId: string;
  kind: InvestmentTxKind;
  quantity: number;
  unitPrice: number;
  fees?: number;
  date: string;
}

export const investmentApi = {
  listAssets: (ws: string) =>
    api.get<{ assets: InvestmentAsset[] }>(wsPath(ws, '/investments/assets')),
  getAsset: (ws: string, id: string) =>
    api.get<{ asset: InvestmentAsset; position: InvestmentPosition }>(
      wsPath(ws, `/investments/assets/${id}`),
    ),
  createAsset: (ws: string, body: AssetInput) =>
    api.post<{ asset: InvestmentAsset }>(wsPath(ws, '/investments/assets'), body),
  updateAsset: (ws: string, id: string, body: Partial<AssetInput>) =>
    api.patch<{ asset: InvestmentAsset }>(wsPath(ws, `/investments/assets/${id}`), body),
  createTx: (ws: string, body: InvestmentTxInput) =>
    api.post<{ transaction: InvestmentTransaction }>(wsPath(ws, '/investments/transactions'), body),
  removeTx: (ws: string, id: string) =>
    api.del<void>(wsPath(ws, `/investments/transactions/${id}`)),
};

// ---- Membros & convites (online) ----
export const memberApi = {
  list: (ws: string) => api.get<{ members: Member[] }>(wsPath(ws, '/members')),
  update: (ws: string, id: string, body: { role?: MemberRole; displayName?: string | null }) =>
    api.patch<{ member: Member }>(wsPath(ws, `/members/${id}`), body),
  remove: (ws: string, id: string) => api.del<void>(wsPath(ws, `/members/${id}`)),
};

export interface CreateInvitationInput {
  email?: string;
  phone?: string;
  displayName?: string;
  role?: MemberRole;
}

export const invitationApi = {
  list: (ws: string) => api.get<{ invitations: Invitation[] }>(wsPath(ws, '/invitations')),
  create: (ws: string, body: CreateInvitationInput) =>
    api.post<{ invitation: Invitation }>(wsPath(ws, '/invitations'), body),
  revoke: (ws: string, id: string) =>
    api.post<void>(wsPath(ws, `/invitations/${id}/revoke`)),
  // Rotas não escopadas (o usuário ainda não é membro).
  mine: () => api.get<{ invitations: MyInvitation[] }>('/api/invitations/mine'),
  accept: (token: string) =>
    api.post<{ workspaceId: string }>('/api/invitations/accept', { token }),
  decline: (token: string) => api.post<void>('/api/invitations/decline', { token }),
};

export const syncApi = {
  pull: (ws: string, since?: string) => {
    const qs = since ? `?since=${encodeURIComponent(since)}` : '';
    return api.get<PullResponse>(wsPath(ws, `/sync/pull${qs}`));
  },
  push: (ws: string, body: unknown) => api.post<PushResponse>(wsPath(ws, '/sync/push'), body),
};
