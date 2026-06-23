import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { recurringApi } from '@/api/endpoints';
import { formatMoney } from '@/lib/format';
import { FREQ_LABELS, RecurringFormModal, type RecurringInitial } from '@/components/RecurringFormModal';
import { useSync } from '@/sync/SyncProvider';
import { useLiveTags } from '@/hooks/useLiveData';
import type { LocalAccount, LocalCategory } from '@/db/dexie';
import type { RecurringSuggestion } from '@/api/types';

interface Props {
  workspaceId: string;
  accounts: LocalAccount[];
  categories: LocalCategory[];
}

/** Chave estável de uma sugestão, p/ "ignorar" persistido localmente. */
const sugKey = (s: RecurringSuggestion) => `${s.accountId}|${s.type}|${s.description.trim().toLowerCase()}`;

function loadDismissed(ws: string): Set<string> {
  try {
    const raw = localStorage.getItem(`ng:dismissed-recurring:${ws}`);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(ws: string, keys: Set<string>) {
  try {
    localStorage.setItem(`ng:dismissed-recurring:${ws}`, JSON.stringify([...keys]));
  } catch {
    // localStorage indisponível (modo privado): ignora silenciosamente.
  }
}

/** Rótulo de cadência legível ("Mensal · todo dia 10"). */
function cadenceLabel(s: RecurringSuggestion): string {
  const base = s.interval > 1 ? `A cada ${s.interval} · ${FREQ_LABELS[s.frequency].toLowerCase()}` : FREQ_LABELS[s.frequency];
  if ((s.frequency === 'MONTHLY' || s.frequency === 'YEARLY') && s.anchorDay) {
    return `${base} · todo dia ${s.anchorDay}`;
  }
  return base;
}

/**
 * Seção "Recorrências sugeridas": séries regulares detectadas no extrato que
 * ainda não têm recorrência cadastrada. Cadastrar vincula as transações
 * existentes (sem duplicar valores); Ignorar oculta localmente.
 */
export function SuggestedRecurringSection({ workspaceId, accounts, categories }: Props) {
  const { online } = useSync();
  const tags = useLiveTags(workspaceId) ?? [];
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed(workspaceId));
  const [modalInitial, setModalInitial] = useState<RecurringInitial | null>(null);
  const [linkIds, setLinkIds] = useState<string[]>([]);
  const [opened, setOpened] = useState(false);

  const { data } = useQuery({
    queryKey: ['recurring-suggestions', workspaceId],
    queryFn: () => recurringApi.suggestions(workspaceId),
    enabled: !!workspaceId && online,
    // Detecção é cara (varre o extrato + IA): não refaz a cada foco.
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const accName = useMemo(
    () => new Map(accounts.map((a) => [a.id ?? a.key, a.name] as [string, string])),
    [accounts],
  );

  const visible = (data?.suggestions ?? []).filter((s) => !dismissed.has(sugKey(s)));
  if (visible.length === 0) return null;

  const ignore = (s: RecurringSuggestion) => {
    setDismissed((prev) => {
      const next = new Set(prev).add(sugKey(s));
      saveDismissed(workspaceId, next);
      return next;
    });
  };

  const register = (s: RecurringSuggestion) => {
    setModalInitial({
      type: s.type,
      accountId: s.accountId,
      categoryId: s.categoryId,
      description: s.description,
      amount: s.amount,
      frequency: s.frequency,
      interval: s.interval,
      anchorDay: s.anchorDay,
      // Começa na próxima ocorrência projetada; materializa só o futuro.
      startDate: new Date(s.nextDate),
    });
    setLinkIds(s.transactionIds);
    setOpened(true);
  };

  return (
    <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-primary">
        <Sparkles className="h-4 w-4" />
        Recorrências sugeridas pela IA
      </div>
      <p className="text-xs text-muted-foreground">
        Detectamos lançamentos que se repetem e ainda não têm recorrência. Cadastrar não duplica os
        valores já lançados — só passa a prever as próximas.
      </p>
      <div className="space-y-2">
        {visible.map((s) => (
          <Card key={sugKey(s)} className="flex items-center justify-between gap-2 p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <RefreshCw className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium">{s.description}</span>
                <Badge variant="muted">{s.occurrences}x</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {cadenceLabel(s)} · {accName.get(s.accountId) ?? '—'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <span
                className={`whitespace-nowrap font-bold ${s.type === 'INCOME' ? 'text-success' : 'text-destructive'}`}
              >
                {s.type === 'INCOME' ? '+' : '−'}
                {formatMoney(s.amount)}
              </span>
              <Button size="sm" onClick={() => register(s)}>
                Cadastrar
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Ignorar sugestão"
                onClick={() => ignore(s)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <RecurringFormModal
        opened={opened}
        onClose={() => setOpened(false)}
        workspaceId={workspaceId}
        accounts={accounts}
        categories={categories}
        tags={tags}
        initial={modalInitial}
        linkTransactionIds={linkIds}
        title="Cadastrar recorrência"
      />
    </div>
  );
}
