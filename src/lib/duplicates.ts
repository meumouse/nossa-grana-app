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
