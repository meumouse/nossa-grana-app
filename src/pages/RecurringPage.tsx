import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/sonner';
import { useWorkspace } from '@/workspace/WorkspaceProvider';
import { useLiveAccounts, useLiveCategories } from '@/hooks/useLiveData';
import { usePrivacy } from '@/ui/PrivacyProvider';
import { recurringApi } from '@/api/endpoints';
import { ApiError, OfflineError } from '@/api/client';
import { LoadMore } from '@/components/LoadMore';
import { usePagedList } from '@/hooks/usePagedList';
import { formatMoney } from '@/lib/format';
import { FREQ_LABELS, RecurringFormModal } from '@/components/RecurringFormModal';
import type { RecurringTransaction } from '@/api/types';

function handleError(err: unknown) {
  toast.error(
    err instanceof OfflineError
      ? 'Sem conexão — recorrências precisam do servidor'
      : err instanceof ApiError
        ? err.message
        : 'Erro inesperado',
  );
}

export function RecurringPage() {
  const { activeId } = useWorkspace();
  const { hidden } = usePrivacy();
  const qc = useQueryClient();
  const accounts = useLiveAccounts(activeId) ?? [];
  const categories = useLiveCategories(activeId) ?? [];

  const [opened, setOpened] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['recurring', activeId],
    queryFn: () => recurringApi.list(activeId!),
    enabled: !!activeId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['recurring', activeId] });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      recurringApi.update(activeId!, id, { isActive }),
    onSuccess: invalidate,
    onError: handleError,
  });

  const remove = useMutation({
    mutationFn: (id: string) => recurringApi.remove(activeId!, id),
    onSuccess: () => {
      invalidate();
      toast('Recorrência excluída');
    },
    onError: handleError,
  });

  const items = data?.items ?? [];
  const paged = usePagedList(items, { resetKey: activeId });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Recorrências</h1>
        <Button onClick={() => setOpened(true)}>
          <Plus className="h-4 w-4" />
          Nova recorrência
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : isError ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Não foi possível carregar as recorrências.
        </p>
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nenhuma recorrência. Crie assinaturas, salário, aluguel…
        </p>
      ) : (
        <div className="space-y-2">
          {paged.visible.map((r) => (
            <RecurringCard
              key={r.id}
              item={r}
              hidden={hidden}
              onToggle={(isActive) => toggle.mutate({ id: r.id, isActive })}
              onRemove={() => remove.mutate(r.id)}
            />
          ))}
          <LoadMore
            shown={paged.shown}
            total={paged.total}
            hasMore={paged.hasMore}
            onLoadMore={paged.loadMore}
          />
        </div>
      )}

      {activeId && (
        <RecurringFormModal
          opened={opened}
          onClose={() => setOpened(false)}
          workspaceId={activeId}
          accounts={accounts}
          categories={categories}
        />
      )}
    </div>
  );
}

function RecurringCard({
  item,
  hidden,
  onToggle,
  onRemove,
}: {
  item: RecurringTransaction;
  hidden: boolean;
  onToggle: (isActive: boolean) => void;
  onRemove: () => void;
}) {
  const every =
    item.interval > 1
      ? `A cada ${item.interval} · ${FREQ_LABELS[item.frequency].toLowerCase()}`
      : FREQ_LABELS[item.frequency];
  return (
    <Card className={`flex items-center justify-between gap-2 p-3 ${item.isActive ? '' : 'opacity-60'}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="truncate font-medium">{item.description}</p>
          {!item.isActive && <Badge variant="muted">pausada</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">
          {every}
          {item.category?.name ? ` · ${item.category.name}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`whitespace-nowrap font-bold ${item.type === 'INCOME' ? 'text-success' : 'text-destructive'}`}
        >
          {item.type === 'INCOME' ? '+' : '−'}
          {formatMoney(item.amount, hidden)}
        </span>
        <Switch
          checked={item.isActive}
          onCheckedChange={onToggle}
          aria-label={item.isActive ? 'Pausar' : 'Ativar'}
        />
        <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Excluir">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </Card>
  );
}
