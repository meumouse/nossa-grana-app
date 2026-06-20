import { db, newClientId, nowIso, type LocalTransaction, type SyncEntity, type SyncOp } from '../db/dexie';
import type { TransactionStatus, TransactionType } from '../api/types';

export interface TxInput {
  accountId: string; // key local da conta (= id do servidor p/ contas sincronizadas)
  type: Exclude<TransactionType, 'TRANSFER'>;
  status?: TransactionStatus;
  amount: number;
  description: string;
  notes?: string | null;
  categoryId?: string | null;
  date: string; // ISO
  dueDate?: string | null;
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
    accountId: input.accountId,
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
    ...(patch.accountId !== undefined ? { accountId: patch.accountId } : {}),
    ...(patch.type !== undefined ? { type: patch.type } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.amount !== undefined ? { amount: String(patch.amount) } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes ?? null } : {}),
    ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId ?? null } : {}),
    ...(patch.date !== undefined ? { date: patch.date } : {}),
    ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate ?? null } : {}),
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
