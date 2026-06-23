import { db, newClientId, nowIso, type LocalTransaction, type SyncEntity, type SyncOp } from '../db/dexie';
import type { TransactionStatus, TransactionType, TxShare } from '../api/types';

export interface TxInput {
  // Dono: conta OU cartão (key local). Exatamente um preenchido.
  accountId?: string | null;
  creditCardId?: string | null;
  type: Exclude<TransactionType, 'TRANSFER'>;
  status?: TransactionStatus;
  amount: number;
  description: string;
  notes?: string | null;
  categoryId?: string | null;
  date: string; // ISO
  dueDate?: string | null;
  duplicateDismissed?: boolean;
  shared?: boolean;
  shareCount?: number | null;
  shares?: TxShare[] | null;
  tagIds?: string[];
}

/** Enfileira uma mudança no outbox, colapsando upserts repetidos do mesmo item. */
async function enqueue(entity: SyncEntity, clientId: string, op: SyncOp, workspaceId: string) {
  const existing = await db.outbox.where('clientId').equals(clientId).toArray();
  if (existing.length) {
    await db.outbox.bulkDelete(existing.map((e) => e.seq!).filter(Boolean));
  }
  await db.outbox.add({ entity, clientId, op, workspaceId, createdAt: nowIso() });
}

export async function createTransactionLocal(workspaceId: string, input: TxInput): Promise<string> {
  const clientId = newClientId();
  const status = input.status ?? 'COMPLETED';
  const row: LocalTransaction = {
    key: clientId,
    id: null,
    clientId,
    workspaceId,
    accountId: input.accountId ?? null,
    creditCardId: input.creditCardId ?? null,
    type: input.type,
    status,
    amount: String(input.amount),
    currency: 'BRL',
    description: input.description,
    notes: input.notes ?? null,
    categoryId: input.categoryId ?? null,
    date: input.date,
    dueDate: input.dueDate ?? null,
    paidAt: status === 'COMPLETED' ? input.date : null,
    transferId: null,
    counterAccountId: null,
    counterCreditCardId: null,
    duplicateDismissed: input.duplicateDismissed ?? false,
    shared: input.shared ?? false,
    shareCount: input.shareCount ?? null,
    shares: input.shares ?? null,
    tagIds: input.tagIds ?? [],
    updatedAt: nowIso(),
    deletedAt: null,
  };

  await db.transaction('rw', db.transactions, db.outbox, async () => {
    await db.transactions.put(row);
    await enqueue('transaction', clientId, 'upsert', workspaceId);
  });
  return clientId;
}

export async function updateTransactionLocal(key: string, patch: Partial<TxInput>): Promise<void> {
  const row = await db.transactions.get(key);
  if (!row) return;
  const next: LocalTransaction = {
    ...row,
    ...(patch.accountId !== undefined ? { accountId: patch.accountId, creditCardId: null } : {}),
    ...(patch.creditCardId !== undefined ? { creditCardId: patch.creditCardId, accountId: null } : {}),
    ...(patch.type !== undefined ? { type: patch.type } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.amount !== undefined ? { amount: String(patch.amount) } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes ?? null } : {}),
    ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId ?? null } : {}),
    ...(patch.date !== undefined ? { date: patch.date } : {}),
    ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate ?? null } : {}),
    ...(patch.duplicateDismissed !== undefined ? { duplicateDismissed: patch.duplicateDismissed } : {}),
    ...(patch.shared !== undefined ? { shared: patch.shared } : {}),
    ...(patch.shareCount !== undefined ? { shareCount: patch.shareCount ?? null } : {}),
    ...(patch.shares !== undefined ? { shares: patch.shares ?? null } : {}),
    ...(patch.tagIds !== undefined ? { tagIds: patch.tagIds } : {}),
    updatedAt: nowIso(),
  };
  await db.transaction('rw', db.transactions, db.outbox, async () => {
    await db.transactions.put(next);
    await enqueue('transaction', row.clientId, 'upsert', row.workspaceId);
  });
}

/** Efetiva (pagar/receber) uma pendência. */
export async function payTransactionLocal(key: string, paidAt = nowIso()): Promise<void> {
  const row = await db.transactions.get(key);
  if (!row) return;
  await db.transaction('rw', db.transactions, db.outbox, async () => {
    await db.transactions.put({ ...row, status: 'COMPLETED', paidAt, updatedAt: nowIso() });
    await enqueue('transaction', row.clientId, 'upsert', row.workspaceId);
  });
}

/** Desfaz a efetivação: volta a transação para PENDING (conta a pagar/receber) e limpa o paidAt. */
export async function unpayTransactionLocal(key: string): Promise<void> {
  const row = await db.transactions.get(key);
  if (!row) return;
  await db.transaction('rw', db.transactions, db.outbox, async () => {
    await db.transactions.put({ ...row, status: 'PENDING', paidAt: null, updatedAt: nowIso() });
    await enqueue('transaction', row.clientId, 'upsert', row.workspaceId);
  });
}

/**
 * Marca um conjunto de transações como "não é duplicata" (legítimas),
 * silenciando o alerta de possível duplicidade para o grupo.
 */
export async function dismissDuplicateLocal(keys: string[]): Promise<void> {
  await db.transaction('rw', db.transactions, db.outbox, async () => {
    for (const key of keys) {
      const row = await db.transactions.get(key);
      if (!row || row.duplicateDismissed) continue;
      await db.transactions.put({ ...row, duplicateDismissed: true, updatedAt: nowIso() });
      await enqueue('transaction', row.clientId, 'upsert', row.workspaceId);
    }
  });
}

/**
 * Define o rateio de uma transação. Lista vazia/`null` desfaz o
 * compartilhamento. `shareCount` total de pessoas (default = nº de participantes).
 */
export async function setSharesLocal(
  key: string,
  shares: TxShare[] | null,
  shareCount?: number | null,
): Promise<void> {
  const row = await db.transactions.get(key);
  if (!row) return;
  const has = !!shares && shares.length > 0;
  await db.transaction('rw', db.transactions, db.outbox, async () => {
    await db.transactions.put({
      ...row,
      shared: has,
      shares: has ? shares : null,
      shareCount: has ? shareCount ?? shares!.length : null,
      updatedAt: nowIso(),
    });
    await enqueue('transaction', row.clientId, 'upsert', row.workspaceId);
  });
}

/** Aplica o MESMO rateio a várias transações de uma vez (marcação em massa). */
export async function bulkSetSharesLocal(
  keys: string[],
  shares: TxShare[],
  shareCount?: number | null,
): Promise<void> {
  const count = shareCount ?? shares.length;
  await db.transaction('rw', db.transactions, db.outbox, async () => {
    for (const key of keys) {
      const row = await db.transactions.get(key);
      if (!row) continue;
      // Clona o array de participantes p/ cada transação ter o seu próprio estado.
      await db.transactions.put({
        ...row,
        shared: true,
        shares: shares.map((s) => ({ ...s })),
        shareCount: count,
        updatedAt: nowIso(),
      });
      await enqueue('transaction', row.clientId, 'upsert', row.workspaceId);
    }
  });
}

/** Alterna o status "pago" de um participante (por índice) de uma transação. */
export async function toggleSharePaidLocal(key: string, shareIndex: number): Promise<void> {
  const row = await db.transactions.get(key);
  if (!row || !row.shares) return;
  const shares = row.shares.map((s, i) => (i === shareIndex ? { ...s, paid: !s.paid } : s));
  await db.transaction('rw', db.transactions, db.outbox, async () => {
    await db.transactions.put({ ...row, shares, updatedAt: nowIso() });
    await enqueue('transaction', row.clientId, 'upsert', row.workspaceId);
  });
}

export async function deleteTransactionLocal(key: string): Promise<void> {
  const row = await db.transactions.get(key);
  if (!row) return;

  await db.transaction('rw', db.transactions, db.outbox, async () => {
    if (!row.id) {
      // Nunca sincronizou: some localmente e descarta o que estava na fila.
      const pending = await db.outbox.where('clientId').equals(row.clientId).toArray();
      await db.outbox.bulkDelete(pending.map((e) => e.seq!).filter(Boolean));
      await db.transactions.delete(key);
      return;
    }
    await db.transactions.put({ ...row, deletedAt: nowIso(), updatedAt: nowIso() });
    await enqueue('transaction', row.clientId, 'delete', row.workspaceId);
  });
}
