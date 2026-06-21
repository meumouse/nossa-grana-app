import { db } from '../db/dexie';
import { institutionApi, syncApi } from '../api/endpoints';
import type { Account, Category, Transaction } from '../api/types';

const META_PULL = (ws: string) => `pull:${ws}`;

async function getWatermark(ws: string): Promise<string | undefined> {
  const row = await db.meta.get(META_PULL(ws));
  return row?.value;
}
async function setWatermark(ws: string, value: string): Promise<void> {
  await db.meta.put({ key: META_PULL(ws), value });
}

/** Traduz a `key` local de uma conta para a referência do servidor (id). */
async function accountServerRef(key: string): Promise<string> {
  const acc = await db.accounts.get(key);
  return acc?.id ?? key;
}
async function categoryServerRef(key: string | null): Promise<string | null> {
  if (!key) return null;
  const cat = await db.categories.get(key);
  return cat?.id ?? key;
}

// ---------- PUSH (apenas transações; contas/categorias são online) ----------
async function pushOutbox(ws: string): Promise<number> {
  const items = (await db.outbox.where('workspaceId').equals(ws).toArray()).sort(
    (a, b) => (a.seq ?? 0) - (b.seq ?? 0),
  );
  const txItems = items.filter((i) => i.entity === 'transaction');
  if (txItems.length === 0) return 0;

  const transactions: unknown[] = [];
  for (const item of txItems) {
    if (item.op === 'delete') {
      transactions.push({ clientId: item.clientId, deleted: true });
      continue;
    }
    const row = await db.transactions.where('clientId').equals(item.clientId).first();
    if (!row) continue;
    transactions.push({
      clientId: row.clientId,
      data: {
        accountId: await accountServerRef(row.accountId),
        type: row.type,
        status: row.status,
        amount: Number(row.amount),
        currency: row.currency,
        description: row.description,
        notes: row.notes,
        categoryId: await categoryServerRef(row.categoryId),
        date: row.date,
        dueDate: row.dueDate,
        paidAt: row.paidAt,
      },
    });
  }

  const res = await syncApi.push(ws, { accounts: [], categories: [], transactions });

  // Aplica o idMap (clientId -> id do servidor) nas linhas locais.
  for (const { clientId, id } of res.idMap) {
    await db.transactions.where('clientId').equals(clientId).modify({ id });
  }

  // Remove da fila o que foi enviado.
  await db.outbox.bulkDelete(txItems.map((i) => i.seq!).filter(Boolean));
  return txItems.length;
}

// ---------- PULL (delta de contas, categorias e transações) ----------
async function putAccount(a: Account): Promise<void> {
  let key = a.id;
  if (a.clientId) {
    const ex = await db.accounts.where('clientId').equals(a.clientId).first();
    if (ex) key = ex.key;
  }
  await db.accounts.put({
    key,
    id: a.id,
    clientId: a.clientId ?? key,
    workspaceId: a.workspaceId,
    name: a.name,
    type: a.type,
    currency: a.currency,
    institutionId: a.institutionId ?? null,
    iconColor: a.iconColor,
    openingBalance: a.openingBalance,
    includeInTotal: a.includeInTotal,
    archived: a.archived,
    sortOrder: a.sortOrder,
    creditLimit: a.creditLimit,
    statementClosingDay: a.statementClosingDay,
    paymentDueDay: a.paymentDueDay,
    lateInterestRate: a.lateInterestRate,
    overdraftLimit: a.overdraftLimit,
    overdraftInterestRate: a.overdraftInterestRate,
    updatedAt: a.updatedAt,
    deletedAt: a.deletedAt,
  });
}

async function putCategory(c: Category): Promise<void> {
  let key = c.id;
  if (c.clientId) {
    const ex = await db.categories.where('clientId').equals(c.clientId).first();
    if (ex) key = ex.key;
  }
  await db.categories.put({
    key,
    id: c.id,
    clientId: c.clientId ?? key,
    workspaceId: c.workspaceId,
    name: c.name,
    kind: c.kind,
    nature: c.nature,
    icon: c.icon,
    color: c.color,
    parentId: c.parentId,
    sortOrder: c.sortOrder,
    archived: c.archived,
    updatedAt: c.updatedAt,
    deletedAt: c.deletedAt,
  });
}

async function putTransaction(t: Transaction): Promise<void> {
  let key = t.id;
  if (t.clientId) {
    const ex = await db.transactions.where('clientId').equals(t.clientId).first();
    if (ex) key = ex.key;
  }
  await db.transactions.put({
    key,
    id: t.id,
    clientId: t.clientId ?? key,
    workspaceId: t.workspaceId,
    accountId: t.accountId,
    type: t.type,
    status: t.status,
    amount: t.amount,
    currency: t.currency,
    description: t.description,
    notes: t.notes,
    categoryId: t.categoryId,
    date: t.date,
    dueDate: t.dueDate,
    paidAt: t.paidAt,
    transferId: t.transferId,
    counterAccountId: t.counterAccountId,
    updatedAt: t.updatedAt,
    deletedAt: t.deletedAt,
  });
}

async function pullDelta(ws: string): Promise<number> {
  const since = await getWatermark(ws);
  const res = await syncApi.pull(ws, since);

  await db.transaction('rw', db.accounts, db.categories, db.transactions, db.meta, async () => {
    for (const a of res.accounts) await putAccount(a);
    for (const c of res.categories) await putCategory(c);
    for (const t of res.transactions) await putTransaction(t);
    await setWatermark(ws, res.serverTime);
  });

  return res.accounts.length + res.categories.length + res.transactions.length;
}

/**
 * Atualiza o catálogo de instituições (bancos) cacheado p/ render offline.
 * Substitui o conjunto do workspace (globais + customizadas) a cada sync.
 * Best-effort: falha aqui não interrompe a sincronização principal.
 */
async function refreshInstitutions(ws: string): Promise<void> {
  try {
    const { institutions } = await institutionApi.list(ws);
    await db.transaction('rw', db.institutions, async () => {
      await db.institutions.clear();
      await db.institutions.bulkPut(
        institutions.map((i) => ({
          id: i.id,
          workspaceId: i.workspaceId,
          name: i.name,
          shortName: i.shortName,
          logoUrl: i.logoUrl,
          brandColor: i.brandColor,
        })),
      );
    });
  } catch {
    // offline ou falha de rede: mantém o cache anterior.
  }
}

/** Sincronização completa: envia o outbox, puxa o delta e atualiza bancos. */
export async function runSync(ws: string): Promise<{ pushed: number; pulled: number }> {
  const pushed = await pushOutbox(ws);
  const pulled = await pullDelta(ws);
  await refreshInstitutions(ws);
  return { pushed, pulled };
}

/** Quantidade de itens pendentes de envio (badge "não sincronizado"). */
export async function pendingCount(ws: string): Promise<number> {
  return db.outbox.where('workspaceId').equals(ws).count();
}
