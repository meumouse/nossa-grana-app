import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatDate, formatMoney } from '@/lib/format';
import type { LocalTransaction } from '@/db/dexie';

interface Props {
  opened: boolean;
  onClose: () => void;
  /** Grupos de possíveis duplicatas (2+ transações por grupo). */
  groups: LocalTransaction[][];
  /** key local da origem → nome (conta/cartão), p/ exibir a procedência. */
  accMap: Map<string, string>;
  hidden: boolean;
  /** Exclui (soft delete) as transações das keys informadas. */
  onDelete: (keys: string[]) => Promise<void>;
  /** Marca o grupo como legítimo (não é duplicata) — silencia o alerta. */
  onDismiss: (keys: string[]) => Promise<void>;
}

/**
 * Por grupo, escolhe a transação a MANTER por padrão: preferimos uma já
 * sincronizada (com `id`) — as demais nascem marcadas para exclusão. Espelha a
 * regra de `redundantDuplicates`.
 */
function defaultChecked(groups: LocalTransaction[][]): Set<string> {
  const checked = new Set<string>();
  for (const group of groups) {
    const sorted = [...group].sort((a, b) => Number(Boolean(b.id)) - Number(Boolean(a.id)));
    for (const t of sorted.slice(1)) checked.add(t.key);
  }
  return checked;
}

/**
 * Revisão guiada das possíveis duplicidades. O usuário decide, grupo a grupo,
 * quais lançamentos excluir e quais são legítimos — em vez do "remover tudo"
 * automático. Os grupos vêm do estado reativo do extrato: ao excluir/dispensar,
 * a lista se recompõe sozinha.
 */
export function DuplicateReviewModal({ opened, onClose, groups, accMap, hidden, onDelete, onDismiss }: Props) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [dismissingKey, setDismissingKey] = useState<string | null>(null);

  // Semeia a seleção padrão ao abrir.
  useEffect(() => {
    if (opened) setChecked(defaultChecked(groups));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  // Quando os grupos mudam (após excluir/dispensar), descarta keys que sumiram —
  // preservando as escolhas do usuário para as que continuam em revisão.
  useEffect(() => {
    const present = new Set(groups.flatMap((g) => g.map((t) => t.key)));
    setChecked((prev) => {
      const next = new Set([...prev].filter((k) => present.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [groups]);

  const toggle = (key: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const applyDelete = async () => {
    const keys = [...checked];
    if (keys.length === 0) return;
    setDeleting(true);
    try {
      await onDelete(keys);
    } finally {
      setDeleting(false);
    }
  };

  const dismissGroup = async (group: LocalTransaction[]) => {
    setDismissingKey(group[0]!.key);
    try {
      await onDismiss(group.map((t) => t.key));
    } finally {
      setDismissingKey(null);
    }
  };

  return (
    <Dialog open={opened} onOpenChange={(o) => !o && !deleting && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Analisar lançamentos</DialogTitle>
          <DialogDescription>
            Lançamentos com mesmo tipo, valor e data podem ser duplicados. Marque os que deseja excluir
            ou confirme que um grupo são lançamentos legítimos.
          </DialogDescription>
        </DialogHeader>

        {groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <ShieldCheck className="h-8 w-8 text-success" />
            Nenhuma duplicidade pendente. Tudo certo!
          </div>
        ) : (
          <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
            {groups.map((group) => {
              const ref = group[0]!;
              const income = ref.type === 'INCOME';
              return (
                <div key={ref.key} className="space-y-2 rounded-md border border-warning/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-warning">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {group.length} lançamentos iguais · {formatDate(ref.date)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0"
                      disabled={dismissingKey !== null}
                      onClick={() => void dismissGroup(group)}
                    >
                      {dismissingKey === ref.key ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      Não são duplicatas
                    </Button>
                  </div>
                  <div className="space-y-1">
                    {group.map((t) => {
                      const isChecked = checked.has(t.key);
                      return (
                        <label
                          key={t.key}
                          className={cn(
                            'flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm',
                            isChecked ? 'border-destructive/50 bg-destructive/5' : 'border-transparent',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 shrink-0 accent-destructive"
                            checked={isChecked}
                            onChange={() => toggle(t.key)}
                            aria-label={`Excluir ${t.description}`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-medium">{t.description}</span>
                              {t.status === 'PENDING' && <Badge variant="warning">pendente</Badge>}
                              {!t.id && <Badge variant="muted">na fila</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {accMap.get(t.accountId ?? t.creditCardId ?? '') ?? '—'}
                            </p>
                          </div>
                          <span
                            className={cn(
                              'whitespace-nowrap font-medium',
                              income ? 'text-success' : 'text-destructive',
                            )}
                          >
                            {income ? '+' : '−'}
                            {formatMoney(Math.abs(Number(t.amount)), hidden)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleting}>
            Fechar
          </Button>
          {groups.length > 0 && (
            <Button
              variant="destructive"
              onClick={() => void applyDelete()}
              disabled={deleting || checked.size === 0}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Excluir {checked.size > 0 ? `(${checked.size})` : 'selecionadas'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
