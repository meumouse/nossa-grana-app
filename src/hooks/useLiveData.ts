import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  type LocalAccount,
  type LocalCreditCard,
  type LocalInstitution,
  type LocalTransaction,
} from '../db/dexie';
import { toCents } from '../lib/format';

/** Contas ativas (não arquivadas/excluídas) do workspace, ordenadas. */
export function useLiveAccounts(ws: string | null): LocalAccount[] | undefined {
  return useLiveQuery(async () => {
    if (!ws) return [];
    const rows = await db.accounts.where('workspaceId').equals(ws).toArray();
    return rows
      .filter((a) => !a.deletedAt && !a.archived)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }, [ws]);
}

/** Cartões de crédito ativos do workspace, ordenados. */
export function useLiveCards(ws: string | null): LocalCreditCard[] | undefined {
  return useLiveQuery(async () => {
    if (!ws) return [];
    const rows = await db.creditCards.where('workspaceId').equals(ws).toArray();
    return rows
      .filter((c) => !c.deletedAt && !c.archived)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }, [ws]);
}

/**
 * "Usado" por cartão (offline): Σ compras EXPENSE não pagas. Como o front não
 * tem o status da fatura localmente, aproxima por todas as EXPENSE do cartão.
 */
export function useCardsUsed(ws: string | null): Map<string, number> {
  const used = useLiveQuery(async () => {
    if (!ws) return new Map<string, number>();
    const txs = await db.transactions.where('workspaceId').equals(ws).toArray();
    const cents = new Map<string, number>();
    for (const t of txs) {
      if (t.deletedAt || !t.creditCardId || t.type !== 'EXPENSE') continue;
      cents.set(t.creditCardId, (cents.get(t.creditCardId) ?? 0) + toCents(t.amount));
    }
    return cents;
  }, [ws]);
  return used ?? new Map<string, number>();
}

/**
 * Catálogo de instituições (bancos) cacheado, ordenado por nome. Inclui as
 * globais (workspaceId = null) e as customizadas do workspace ativo.
 */
export function useLiveInstitutions(ws: string | null): LocalInstitution[] | undefined {
  return useLiveQuery(async () => {
    if (!ws) return [];
    const rows = await db.institutions.toArray();
    return rows
      .filter((i) => i.workspaceId === null || i.workspaceId === ws)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [ws]);
}

export function useLiveCategories(ws: string | null) {
  return useLiveQuery(async () => {
    if (!ws) return [];
    const rows = await db.categories.where('workspaceId').equals(ws).toArray();
    return rows
      .filter((c) => !c.deletedAt && !c.archived)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }, [ws]);
}

export interface TxFilter {
  status?: 'COMPLETED' | 'PENDING' | 'CANCELED';
  accountKey?: string;
  limit?: number;
}

export function useLiveTransactions(ws: string | null, filter: TxFilter = {}) {
  const { status, accountKey, limit } = filter;
  return useLiveQuery(async () => {
    if (!ws) return [];
    let rows = await db.transactions.where('workspaceId').equals(ws).toArray();
    rows = rows.filter((t) => !t.deletedAt);
    if (status) rows = rows.filter((t) => t.status === status);
    if (accountKey) rows = rows.filter((t) => t.accountId === accountKey);
    rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return limit ? rows.slice(0, limit) : rows;
  }, [ws, status, accountKey, limit]);
}

/**
 * Saldos por conta calculados LOCALMENTE (offline) a partir das transações:
 * openingBalance + Σ COMPLETED. Soma em centavos p/ evitar erro de float.
 * INCOME soma, EXPENSE subtrai, TRANSFER usa amount assinado.
 */
export function computeBalances(accounts: LocalAccount[], txs: LocalTransaction[]): Map<string, number> {
  const cents = new Map<string, number>();
  for (const a of accounts) cents.set(a.key, toCents(a.openingBalance));

  for (const t of txs) {
    if (t.deletedAt || t.status !== 'COMPLETED') continue;
    if (!t.accountId) continue; // compra de cartão não afeta saldo de conta
    const base = cents.get(t.accountId);
    if (base === undefined) continue;
    const amt = toCents(t.amount);
    if (t.type === 'INCOME') cents.set(t.accountId, base + amt);
    else if (t.type === 'EXPENSE') cents.set(t.accountId, base - amt);
    else cents.set(t.accountId, base + amt); // TRANSFER assinado
  }
  return cents;
}

export function useBalances(ws: string | null): Map<string, number> {
  const balances = useLiveQuery(async () => {
    if (!ws) return new Map<string, number>();
    const [accounts, txs] = await Promise.all([
      db.accounts.where('workspaceId').equals(ws).toArray(),
      db.transactions.where('workspaceId').equals(ws).toArray(),
    ]);
    return computeBalances(accounts, txs);
  }, [ws]);
  return balances ?? new Map<string, number>();
}
