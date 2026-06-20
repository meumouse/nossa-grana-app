// Tipos espelhando as respostas da API. Dinheiro vem como STRING (Decimal) para
// preservar precisão — formate na UI, não faça aritmética pesada no front.

export type Money = string;

export type AccountType =
  | 'CHECKING'
  | 'SAVINGS'
  | 'CASH'
  | 'CREDIT_CARD'
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

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  locale: string;
  timezone: string;
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

export interface Account {
  id: string;
  clientId: string | null;
  workspaceId: string;
  name: string;
  type: AccountType;
  currency: string;
  iconColor: string | null;
  openingBalance: Money;
  includeInTotal: boolean;
  archived: boolean;
  sortOrder: number;
  creditLimit: Money | null;
  statementClosingDay: number | null;
  paymentDueDay: number | null;
  balance?: Money;
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

export interface Transaction {
  id: string;
  clientId: string | null;
  workspaceId: string;
  accountId: string;
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
  creditCardInvoiceId: string | null;
  updatedAt: string;
  deletedAt: string | null;
  category?: Pick<Category, 'id' | 'name' | 'color' | 'icon' | 'nature' | 'kind'> | null;
  account?: Pick<Account, 'id' | 'name' | 'type'> | null;
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
