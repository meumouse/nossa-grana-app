import Dexie, { type Table } from 'dexie';
import type {
  AccountType,
  CategoryKind,
  CategoryNature,
  Money,
  TransactionStatus,
  TransactionType,
} from '../api/types';

/**
 * Modelo local (offline-first). Cada linha tem:
 *  - key:      chave primária estável local (clientId p/ criados aqui; id do
 *              servidor p/ registros que chegaram só pelo pull sem clientId).
 *  - id:       id do servidor (null enquanto não sincronizou).
 *  - clientId: UUID gerado no device (idempotência no push).
 *  - deletedAt: soft delete (propagado pelo sync).
 * Referências (accountId/categoryId) guardam a `key` local — traduzidas para
 * id/clientId do servidor no momento do push.
 */

export interface LocalAccount {
  key: string;
  id: string | null;
  clientId: string;
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
  lateInterestRate: Money | null;
  overdraftLimit: Money | null;
  overdraftInterestRate: Money | null;
  updatedAt: string;
  deletedAt: string | null;
}

export interface LocalCategory {
  key: string;
  id: string | null;
  clientId: string;
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

export interface LocalTransaction {
  key: string;
  id: string | null;
  clientId: string;
  workspaceId: string;
  accountId: string; // key local da conta
  type: TransactionType;
  status: TransactionStatus;
  amount: Money;
  currency: string;
  description: string;
  notes: string | null;
  categoryId: string | null; // key local da categoria
  date: string;
  dueDate: string | null;
  paidAt: string | null;
  transferId: string | null;
  counterAccountId: string | null;
  updatedAt: string;
  deletedAt: string | null;
}

export type SyncEntity = 'account' | 'category' | 'transaction';
export type SyncOp = 'upsert' | 'delete';

export interface OutboxItem {
  seq?: number;
  entity: SyncEntity;
  clientId: string;
  op: SyncOp;
  workspaceId: string;
  createdAt: string;
}

export interface MetaRow {
  key: string;
  value: string;
}

class NossaGranaDB extends Dexie {
  accounts!: Table<LocalAccount, string>;
  categories!: Table<LocalCategory, string>;
  transactions!: Table<LocalTransaction, string>;
  outbox!: Table<OutboxItem, number>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super('nossa-grana');
    this.version(1).stores({
      accounts: 'key, id, clientId, workspaceId',
      categories: 'key, id, clientId, workspaceId',
      transactions: 'key, id, clientId, workspaceId, accountId, status, date',
      outbox: '++seq, clientId, entity, workspaceId',
      meta: 'key',
    });
  }
}

export const db = new NossaGranaDB();

export function newClientId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
