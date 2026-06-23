// Tipos espelhando as respostas da API. Dinheiro vem como STRING (Decimal) para
// preservar precisão — formate na UI, não faça aritmética pesada no front.

export type Money = string;

// Cartão de crédito NÃO é um tipo de conta — é entidade própria (ver CreditCard).
export type AccountType =
  | 'CHECKING'
  | 'SAVINGS'
  | 'CASH'
  | 'DEBIT_CARD'
  | 'MEAL_VOUCHER'
  | 'INVESTMENT'
  | 'LOAN'
  | 'OTHER';

export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER';
export type TransactionStatus = 'COMPLETED' | 'PENDING' | 'CANCELED';
export type CategoryKind = 'INCOME' | 'EXPENSE';
export type CategoryNature = 'FIXED' | 'VARIABLE' | 'LEISURE' | 'INVESTMENT' | 'INCOME' | 'OTHER';
export type MemberRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

/** Membro do workspace (perfil compartilhado). */
export interface Member {
  id: string;
  role: MemberRole;
  displayName: string | null;
  createdAt: string;
  user: { id: string; name: string | null; email: string; avatarUrl: string | null };
}

/** Convite pendente listado para o ADMIN do workspace. */
export interface Invitation {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  role: MemberRole;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  createdAt: string;
  expiresAt: string;
  /** Link de aceite p/ compartilhar (WhatsApp/copiar). */
  acceptUrl: string;
}

/** Convite recebido pelo usuário logado (notificação no painel). */
export interface MyInvitation {
  id: string;
  token: string;
  role: MemberRole;
  displayName: string | null;
  createdAt: string;
  expiresAt: string;
  workspace: { id: string; name: string };
  invitedBy: { name: string | null; surname: string | null };
}

export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  surname: string | null;
  avatarUrl: string | null;
  phone: string | null;
  locale: string;
  timezone: string;
}

/** Campos editáveis do perfil (PATCH parcial). Vazio limpa o campo. */
export interface ProfileUpdateInput {
  name?: string;
  surname?: string;
  email?: string;
  phone?: string;
  /** Preset (/avatars/xx.svg), data URI da foto, ou '' p/ remover. */
  avatarUrl?: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  type: 'PERSONAL' | 'SHARED';
  iconColor: string | null;
  role: MemberRole;
}

/** Providers de LLM suportados pela importação por IA. */
export type LlmProvider = 'openai' | 'anthropic' | 'google';

/** Um modelo disponível num provider, devolvido pela busca via API. */
export interface LlmModelInfo {
  id: string;
  label?: string | null;
}

export interface WorkspaceSettings {
  baseCurrency: string;
  monthStartDay: number;
  forecastHorizon: number;
  variableLookback: number;
  weekStartsOnMonday: boolean;
  // Pessoas cadastradas p/ rateio de transações compartilhadas (nomes).
  sharedContacts?: string[] | null;
  // Importação por IA. A chave nunca trafega de volta: só o booleano.
  llmProvider: string | null;
  llmModel: string | null;
  llmApiKeySet: boolean;
  // Cache da última busca de modelos (persistida no banco): popula o seletor
  // após recarregar sem rebuscar na API.
  llmModels?: LlmModelInfo[] | null;
  llmModelsProvider?: string | null;
  llmModelsFetchedAt?: string | null;
}

export interface WorkspaceSettingsInput {
  baseCurrency?: string;
  monthStartDay?: number;
  forecastHorizon?: number;
  variableLookback?: number;
  weekStartsOnMonday?: boolean;
  sharedContacts?: string[];
  llmProvider?: LlmProvider;
  llmModel?: string;
  /** Vazio limpa a chave; ausente mantém a atual. */
  llmApiKey?: string;
}

/** Instituição financeira (banco). Catálogo global (seed) + customizadas do workspace. */
export interface Institution {
  id: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  workspaceId: string | null;
}

export interface Account {
  id: string;
  clientId: string | null;
  workspaceId: string;
  name: string;
  type: AccountType;
  currency: string;
  institutionId: string | null;
  institution?: Pick<Institution, 'id' | 'name' | 'brandColor' | 'logoUrl'> | null;
  iconColor: string | null;
  openingBalance: Money;
  includeInTotal: boolean;
  archived: boolean;
  sortOrder: number;
  agency: string | null;
  accountNumber: string | null;
  accountDigit: string | null;
  overdraftLimit: Money | null;
  overdraftInterestRate: Money | null;
  balance?: Money;
  updatedAt: string;
  deletedAt: string | null;
}

/**
 * Cartão de crédito — entidade SEPARADA de conta. Não tem saldo nem entra no
 * patrimônio: tem limite e fatura. `creditAvailable` = limite − compras não pagas.
 */
export interface CreditCard {
  id: string;
  clientId: string | null;
  workspaceId: string;
  name: string;
  currency: string;
  institutionId: string | null;
  institution?: Pick<Institution, 'id' | 'name' | 'brandColor' | 'logoUrl'> | null;
  iconColor: string | null;
  archived: boolean;
  sortOrder: number;
  creditLimit: Money | null;
  statementClosingDay: number | null;
  paymentDueDay: number | null;
  lateInterestRate: Money | null;
  /** Conta corrente de onde a fatura é paga por padrão. */
  paymentAccountId: string | null;
  creditAvailable?: Money | null;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Category {
  id: string;
  clientId: string | null;
  workspaceId: string;
  name: string;
  kind: CategoryKind;
  nature: CategoryNature;
  icon: string | null;
  color: string | null;
  parentId: string | null;
  sortOrder: number;
  archived: boolean;
  updatedAt: string;
  deletedAt: string | null;
}

/** Participante do rateio de uma transação compartilhada. */
export interface TxShare {
  name: string;
  paid: boolean;
  /** true = o dono do perfil (entra como pago por padrão). */
  owner?: boolean;
  /**
   * Vínculo opcional a um membro real do workspace (User.id). Quando presente e
   * a parte está `paid: false`, a despesa aparece no painel desse membro.
   */
  userId?: string | null;
}

export interface Transaction {
  id: string;
  clientId: string | null;
  workspaceId: string;
  // Dono: conta OU cartão (exatamente um preenchido).
  accountId: string | null;
  creditCardId: string | null;
  type: TransactionType;
  status: TransactionStatus;
  amount: Money;
  currency: string;
  description: string;
  notes: string | null;
  categoryId: string | null;
  date: string;
  dueDate: string | null;
  paidAt: string | null;
  transferId: string | null;
  counterAccountId: string | null;
  counterCreditCardId: string | null;
  creditCardInvoiceId: string | null;
  installmentPlanId?: string | null;
  installmentNumber?: number | null;
  recurringTransactionId?: string | null;
  duplicateDismissed?: boolean;
  shared?: boolean;
  shareCount?: number | null;
  shares?: TxShare[] | null;
  updatedAt: string;
  deletedAt: string | null;
  category?: Pick<Category, 'id' | 'name' | 'color' | 'icon' | 'nature' | 'kind'> | null;
  account?: Pick<Account, 'id' | 'name' | 'type'> | null;
  creditCard?: Pick<CreditCard, 'id' | 'name'> | null;
}

// ---- Verificação de inconsistências (IA) ----
export type ConsistencyKind = 'DUPLICATE' | 'CATEGORY' | 'AMOUNT';
export type ConsistencySeverity = 'high' | 'medium' | 'low';

export interface ConsistencyFinding {
  kind: ConsistencyKind;
  severity: ConsistencySeverity;
  title: string;
  detail: string;
  suggestion?: string | null;
  /** Índices que referenciam a ordem das transações enviadas na análise. */
  transactionIndices: number[];
}

export interface AnalyzeTransactionInput {
  index: number;
  date: string;
  description: string;
  amount: number;
  type: 'INCOME' | 'EXPENSE';
  category?: string | null;
}

export interface ForecastMonth {
  month: string;
  startBalance: Money;
  knownIncome: Money;
  knownExpense: Money;
  estimatedVariable: Money;
  projectedBalance: Money;
  negative: boolean;
}

export interface Forecast {
  horizon: number;
  lookback: number;
  avgVariableMonthly: Money;
  months: ForecastMonth[];
  firstNegativeMonth: string | null;
}

/**
 * Previsão de parcelas de conta/banco agrupadas por mês (último dia do mês =
 * vencimento). As parcelas de cartão saem como faturas futuras em CreditCardInvoice.
 */
export interface AccountInstallmentForecast {
  accountId: string;
  accountName: string;
  month: string;
  dueDate: string;
  total: Money;
  count: number;
}

export interface DashboardSummary {
  month: string;
  totalBalance: Money;
  monthIncome: Money;
  monthExpense: Money;
  overdue: { count: number; amount: Money };
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

// ---- Orçamentos ----
export interface Budget {
  id: string;
  clientId: string | null;
  workspaceId: string;
  categoryId: string | null;
  month: string;
  amount: Money;
  rollover: boolean;
  createdAt: string;
  updatedAt: string;
  category?: Pick<Category, 'id' | 'name' | 'color' | 'icon'> | null;
}

/** Orçamento + consumo do mês (resposta do GET /budgets). */
export interface BudgetView extends Budget {
  spent: Money;
  remaining: Money;
  progress: number; // 0..1+ (gasto / orçado)
}

// ---- Recorrências ----
export type RecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface RecurringTransaction {
  id: string;
  clientId: string | null;
  workspaceId: string;
  accountId: string;
  type: 'INCOME' | 'EXPENSE';
  amount: Money;
  description: string;
  categoryId: string | null;
  frequency: RecurrenceFrequency;
  interval: number;
  anchorDay: number | null;
  startDate: string;
  endDate: string | null;
  materializedUntil: string | null;
  isActive: boolean;
  autoConfirm: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  category?: Pick<Category, 'id' | 'name' | 'color' | 'icon'> | null;
}

/**
 * Recorrência sugerida pela detecção (série regular ainda sem template). É um
 * candidato de cadastro: ao confirmar, as transações em `transactionIds` são
 * vinculadas (não recriadas) e só ocorrências futuras são materializadas.
 */
export interface RecurringSuggestion {
  description: string;
  type: 'INCOME' | 'EXPENSE';
  amount: number;
  accountId: string;
  categoryId: string | null;
  suggestedCategory: string | null;
  frequency: RecurrenceFrequency;
  interval: number;
  anchorDay: number | null;
  startDate: string;
  nextDate: string;
  confidence: number;
  occurrences: number;
  transactionIds: string[];
}

// ---- Parcelamentos ----
export interface InstallmentPlan {
  id: string;
  clientId: string | null;
  workspaceId: string;
  description: string;
  totalAmount: Money;
  installments: number;
  firstDueDate: string;
  categoryId: string | null;
  // Divisão do parcelamento entre pessoas (espelha o rateio de Transaction).
  shared?: boolean;
  shareCount?: number | null;
  shares?: TxShare[] | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  _count?: { transactions: number };
  transactions?: Transaction[];
}

// ---- Faturas de cartão ----
export type InvoiceStatus = 'OPEN' | 'CLOSED' | 'PAID' | 'OVERDUE';

export interface CreditCardInvoice {
  id: string;
  workspaceId: string;
  creditCardId: string;
  closingDate: string;
  dueDate: string;
  status: InvoiceStatus;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  total: Money;
  creditCard?: { id: string; name: string; paymentAccountId: string | null };
  transactions?: Transaction[];
}

// ---- Investimentos ----
export type InvestmentClass = 'STOCK' | 'FII' | 'ETF' | 'FUND' | 'FIXED_INCOME' | 'CRYPTO' | 'OTHER';
export type InvestmentTxKind =
  | 'BUY'
  | 'SELL'
  | 'DIVIDEND'
  | 'INTEREST'
  | 'CONTRIBUTION'
  | 'WITHDRAWAL';

export interface InvestmentPosition {
  quantity: Money;
  avgPrice: Money;
  invested: Money;
  income: Money;
  marketValue: Money | null;
}

export interface InvestmentAsset {
  id: string;
  workspaceId: string;
  symbol: string | null;
  name: string;
  class: InvestmentClass;
  currency: string;
  lastPrice: Money | null;
  lastPriceAt: string | null;
  createdAt: string;
  updatedAt: string;
  position?: InvestmentPosition;
  transactions?: InvestmentTransaction[];
}

export interface InvestmentTransaction {
  id: string;
  clientId: string | null;
  accountId: string;
  assetId: string;
  kind: InvestmentTxKind;
  quantity: Money;
  unitPrice: Money;
  fees: Money;
  date: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// ---- Importação por LLM ----
export type ImportSource = 'PDF' | 'IMAGE' | 'CSV' | 'OFX';
export type ImportStatus =
  | 'UPLOADED'
  | 'PROCESSING'
  | 'PENDING_REVIEW'
  | 'IMPORTING'
  | 'CONFIRMED'
  | 'CANCELED'
  | 'FAILED';
export type ImportItemStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'IMPORTED';

export interface ImportItem {
  id: string;
  batchId: string;
  date: string;
  description: string;
  amount: Money;
  type: 'INCOME' | 'EXPENSE';
  suggestedCategory: string | null;
  categoryId: string | null;
  accountId: string | null;
  creditCardId: string | null;
  status: ImportItemStatus;
  transactionId: string | null;
  confidence: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImportBatch {
  id: string;
  workspaceId: string;
  createdById: string | null;
  source: ImportSource;
  status: ImportStatus;
  filename: string | null;
  mimeType: string | null;
  fileSize: number | null;
  pageCount: number | null;
  model: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  items?: ImportItem[];
  _count?: { items: number };
  documentId?: string | null;
}

/** Resumo de um lote gerado a partir do documento (mostrado na lista). */
export interface DocumentBatchRef {
  id: string;
  status: ImportStatus;
  createdAt: string;
}

/** Documento persistido no storage (upload direto + os vindos do Extrato). */
export interface DocumentFile {
  id: string;
  workspaceId: string;
  createdById: string | null;
  filename: string;
  mimeType: string;
  fileSize: number;
  source: ImportSource;
  pageCount: number | null;
  createdAt: string;
  updatedAt: string;
  importBatches?: DocumentBatchRef[];
}
