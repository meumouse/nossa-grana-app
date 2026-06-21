import type { LocalTransaction } from '@/db/dexie';
import { toCents } from './format';

/**
 * Detecção local (offline) de possíveis duplicidades: transações com o MESMO
 * tipo, MESMO valor e MESMA data (dia) são candidatas a duplicata. Transferências
 * são ignoradas (têm duas pernas legítimas de mesmo valor/data) e as marcadas
 * como "não é duplicata" (duplicateDismissed) saem da checagem.
 *
 * Retorna um Map: key da transação -> keys das OUTRAS transações do mesmo grupo.
 * Só entram grupos com 2+ itens; uma transação ausente do Map não tem alerta.
 */
export function detectDuplicates(txs: LocalTransaction[]): Map<string, string[]> {
  const buckets = new Map<string, string[]>();
  for (const t of txs) {
    if (t.deletedAt || t.duplicateDismissed || t.type === 'TRANSFER') continue;
    const day = t.date.slice(0, 10);
    const bucket = `${t.type}|${toCents(t.amount)}|${day}`;
    const arr = buckets.get(bucket) ?? [];
    arr.push(t.key);
    buckets.set(bucket, arr);
  }

  const result = new Map<string, string[]>();
  for (const keys of buckets.values()) {
    if (keys.length < 2) continue;
    for (const key of keys) {
      result.set(
        key,
        keys.filter((k) => k !== key),
      );
    }
  }
  return result;
}

/**
 * Mesma regra de agrupamento de {@link detectDuplicates}, mas retorna os grupos
 * (2+ transações) com as transações inteiras, não só as keys.
 */
export function duplicateGroups(txs: LocalTransaction[]): LocalTransaction[][] {
  const buckets = new Map<string, LocalTransaction[]>();
  for (const t of txs) {
    if (t.deletedAt || t.duplicateDismissed || t.type === 'TRANSFER') continue;
    const day = t.date.slice(0, 10);
    const bucket = `${t.type}|${toCents(t.amount)}|${day}`;
    const arr = buckets.get(bucket) ?? [];
    arr.push(t);
    buckets.set(bucket, arr);
  }
  return [...buckets.values()].filter((g) => g.length >= 2);
}

/**
 * Cópias redundantes de cada grupo de duplicidade: mantém UMA transação por
 * grupo e devolve as demais (candidatas a remoção). Preferimos manter uma já
 * sincronizada (com `id`) para reduzir churn de sincronização.
 */
export function redundantDuplicates(txs: LocalTransaction[]): LocalTransaction[] {
  const extras: LocalTransaction[] = [];
  for (const group of duplicateGroups(txs)) {
    const sorted = [...group].sort((a, b) => Number(Boolean(b.id)) - Number(Boolean(a.id)));
    extras.push(...sorted.slice(1));
  }
  return extras;
}
