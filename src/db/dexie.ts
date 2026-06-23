import Dexie, { type Table } from 'dexie';
import type {
  AccountType,
  CategoryKind,
  CategoryNature,
  Money,
  TransactionStatus,
  TransactionType,
  TxShare,
} from '../api/types';

export type { TxShare } from '../api/types';

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
  institutionId: string | null;
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
  updatedAt: string;
  deletedAt: string | null;
}

/**
 * Cartão de crédito local (offline-first). Entidade SEPARADA de conta: não tem
 * saldo (openingBalance) — só limite + ciclo de fatura.
 */
export interface LocalCreditCard {
  key: string;
  id: string | null;
  clientId: string;
  workspaceId: string;
  name: string;
  currency: string;
  institutionId: string | null;
  iconColor: string | null;
  archived: boolean;
  sortOrder: number;
  creditLimit: Money | null;
  statementClosingDay: number | null;
  paymentDueDay: number | null;
  lateInterestRate: Money | null;
  paymentAccountId: string | null;
  updatedAt: string;
  deletedAt: string | null;
}

/**
 * Catálogo de instituições (bancos) cacheado localmente para render offline.
 * Atualizado a cada sync online (engine.refreshInstitutions). Inclui as globais
 * (workspaceId = null) e as customizadas do workspace.
 */
export interface LocalInstitution {
  id: string;
  workspaceId: string | null;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  brandColor: string | null;
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

/**
 * Tag cacheada localmente p/ render offline. Geridas ONLINE (criar/editar exige
 * rede); o cache é substituído a cada sync (engine.refreshTags). Por isso guarda
 * o `id` do servidor direto como chave — não tem `key`/`clientId` local.
 */
export interface LocalTag {
  id: string;
  workspaceId: string;
  name: string;
  color: string | null;
}

export interface LocalTransaction {
  key: string;
  id: string | null;
  clientId: string;
  workspaceId: string;
  // Dono: conta OU cartão (key local). Exatamente um preenchido.
  accountId: string | null; // key local da conta
  creditCardId: string | null; // key local do cartão
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
  counterCreditCardId: string | null;
  // Parcelamento de origem (quando a transação é uma parcela).
  installmentPlanId?: string | null;
  // Duplicidade: usuário confirmou que NÃO é duplicata (silencia o alerta).
  duplicateDismissed?: boolean;
  // Compartilhamento/divisão da conta entre pessoas.
  shared?: boolean;
  shareCount?: number | null;
  shares?: TxShare[] | null;
  // Tags vinculadas (ids do servidor — tags são geridas online).
  tagIds?: string[];
  updatedAt: string;
  deletedAt: string | null;
}

export type SyncEntity = 'account' | 'creditCard' | 'category' | 'transaction';
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
  creditCards!: Table<LocalCreditCard, string>;
  categories!: Table<LocalCategory, string>;
  transactions!: Table<LocalTransaction, string>;
  institutions!: Table<LocalInstitution, string>;
  tags!: Table<LocalTag, string>;
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
    // v2: catálogo de instituições (bancos) cacheado p/ render offline.
    this.version(2).stores({
      institutions: 'id, workspaceId',
    });
    // v3: cartão de crédito como entidade SEPARADA de conta (tabela própria) e
    // transações ganham creditCardId (compra no cartão). Dexie é schemaless fora
    // dos índices, então transações antigas seguem válidas (creditCardId = undefined).
    this.version(3).stores({
      creditCards: 'key, id, clientId, workspaceId',
      transactions: 'key, id, clientId, workspaceId, accountId, creditCardId, status, date',
    });
    // Campos de duplicidade/compartilhamento (duplicateDismissed, shared,
    // shareCount, shares) NÃO precisam de migração: Dexie é schemaless fora dos
    // índices e nenhum deles é indexado (boolean não é chave válida no IndexedDB).
    // v4: catálogo de tags cacheado p/ render offline (gerido online, como bancos).
    // `tagIds` na transação não é indexado (array) → sem migração de dados.
    this.version(4).stores({
      tags: 'id, workspaceId',
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
