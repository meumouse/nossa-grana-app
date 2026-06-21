import { useEffect, useState } from 'react';
import { AlertTriangle, Copy, Loader2, Sparkles, Tag, Trash2, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { formatDate, formatMoney } from '@/lib/format';
import type { ConsistencyFinding, ConsistencyKind } from '@/api/types';
import { consistencyApi } from '@/api/endpoints';
import { deleteTransactionLocal, dismissDuplicateLocal } from '@/sync/mutations';
import { useSync } from '@/sync/SyncProvider';
import type { LocalTransaction } from '@/db/dexie';

interface Props {
  opened: boolean;
  onClose: () => void;
  workspaceId: string;
  transactions: LocalTransaction[];
  accMap: Map<string, string>;
  catMap: Map<string, { name: string }>;
}

const CHECKS: ConsistencyKind[] = ['DUPLICATE', 'CATEGORY', 'AMOUNT'];

const KIND_META: Record<ConsistencyKind, { label: string; icon: typeof Copy }> = {
  DUPLICATE: { label: 'Possível duplicata', icon: Copy },
  CATEGORY: { label: 'Categoria suspeita', icon: Tag },
  AMOUNT: { label: 'Valor atípico', icon: TrendingUp },
};

function severityVariant(s: ConsistencyFinding['severity']) {
  return s === 'high' ? 'destructive' : s === 'medium' ? 'warning' : 'muted';
}

export function ConsistencyCheckModal({ opened, onClose, workspaceId, transactions, accMap, catMap }: Props) {
  const { syncNow } = useSync();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [findings, setFindings] = useState<ConsistencyFinding[] | null>(null);
  // Snapshot da lista enviada: o índice do achado referencia esta ordem.
  const [snapshot, setSnapshot] = useState<LocalTransaction[]>([]);

  const run = async () => {
    // Só INCOME/EXPENSE (a IA não analisa transferências); limita às 500 mais recentes.
    const subset = transactions.filter((t) => t.type !== 'TRANSFER').slice(0, 500);
    if (subset.length === 0) {
      setFindings([]);
      setSnapshot([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = subset.map((t, index) => ({
        index,
        date: t.date.slice(0, 10),
        description: t.description,
        amount: Math.abs(Number(t.amount)),
        type: t.type as 'INCOME' | 'EXPENSE',
        category: t.categoryId ? catMap.get(t.categoryId)?.name ?? null : null,
      }));
      const res = await consistencyApi.analyze(workspaceId, { checks: CHECKS, transactions: payload });
      setSnapshot(subset);
      setFindings(res.findings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao analisar o extrato');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (opened) void run();
    else {
      setFindings(null);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const removeTx = async (key: string) => {
    await deleteTransactionLocal(key);
    void syncNow();
    toast('Lançamento excluído');
    // Remove a transação dos achados exibidos (some das listas de índice).
    setFindings((prev) =>
      (prev ?? [])
        .map((f) => ({
          ...f,
          transactionIndices: f.transactionIndices.filter((i) => snapshot[i]?.key !== key),
        }))
        .filter((f) => f.transactionIndices.length > 0),
    );
  };

  const keepTx = async (keys: string[]) => {
    await dismissDuplicateLocal(keys);
    void syncNow();
    toast('Marcadas como legítimas');
  };

  return (
    <Dialog open={opened} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Verificar inconsistências
          </DialogTitle>
          <DialogDescription>
            A IA revisa o extrato em busca de duplicatas, categorias suspeitas e valores atípicos.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            Analisando {transactions.filter((t) => t.type !== 'TRANSFER').length} lançamentos…
          </div>
        )}

        {!loading && error && (
          <div className="space-y-3 py-6 text-center">
            <AlertTriangle className="mx-auto h-7 w-7 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" onClick={() => void run()}>
              Tentar novamente
            </Button>
          </div>
        )}

        {!loading && !error && findings && findings.length === 0 && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma inconsistência encontrada. 🎉
          </div>
        )}

        {!loading && !error && findings && findings.length > 0 && (
          <div className="space-y-3">
            {findings.map((f, fi) => {
              const meta = KIND_META[f.kind];
              const Icon = meta.icon;
              const txs = f.transactionIndices
                .map((i) => snapshot[i])
                .filter((t): t is LocalTransaction => Boolean(t));
              return (
                <div key={fi} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold">{f.title}</span>
                    <Badge variant={severityVariant(f.severity)} className="ml-auto">
                      {meta.label}
                    </Badge>
                  </div>
                  {f.detail && <p className="text-xs text-muted-foreground">{f.detail}</p>}
                  {f.suggestion && (
                    <p className="text-xs">
                      <span className="font-medium">Sugestão:</span> {f.suggestion}
                    </p>
                  )}
                  <div className="space-y-1">
                    {txs.map((t) => (
                      <div
                        key={t.key}
                        className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">{t.description}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatDate(t.date)} · {accMap.get(t.accountId ?? t.creditCardId ?? '') ?? '—'} ·{' '}
                            {formatMoney(Math.abs(Number(t.amount)))}
                          </p>
                        </div>
                        {f.kind === 'DUPLICATE' && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            aria-label="Excluir"
                            onClick={() => void removeTx(t.key)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  {f.kind === 'DUPLICATE' && txs.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => void keepTx(txs.map((t) => t.key))}
                    >
                      Não são duplicatas
                    </Button>
                  )}
                </div>
              );
            })}
            <Button variant="outline" className="w-full" onClick={() => void run()}>
              <Sparkles className="h-4 w-4" />
              Analisar novamente
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
