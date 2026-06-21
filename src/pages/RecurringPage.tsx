import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckSquare, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/workspace/WorkspaceProvider';
import { useLiveAccounts, useLiveCategories } from '@/hooks/useLiveData';
import { usePrivacy } from '@/ui/PrivacyProvider';
import { recurringApi } from '@/api/endpoints';
import { ApiError, OfflineError } from '@/api/client';
import { LoadMore } from '@/components/LoadMore';
import { SelectionBar } from '@/components/SelectionBar';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { usePagedList } from '@/hooks/usePagedList';
import { useSelection } from '@/hooks/useSelection';
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
  const sel = useSelection();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
  const allSelected = paged.visible.length > 0 && paged.visible.every((r) => sel.has(r.id));

  const bulkDelete = async () => {
    setDeleting(true);
    try {
      await Promise.all([...sel.selected].map((id) => recurringApi.remove(activeId!, id)));
      toast.success(
        sel.count === 1 ? 'Recorrência excluída' : `${sel.count} recorrências excluídas`,
      );
      setConfirmOpen(false);
      sel.exit();
      invalidate();
    } catch (err) {
      handleError(err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Recorrências</h1>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <Button
              variant={sel.active ? 'secondary' : 'outline'}
              onClick={() => (sel.active ? sel.exit() : sel.enter())}
            >
              <CheckSquare className="h-4 w-4" />
              {sel.active ? 'Cancelar' : 'Selecionar'}
            </Button>
          )}
          <Button onClick={() => setOpened(true)}>
            <Plus className="h-4 w-4" />
            Nova recorrência
          </Button>
        </div>
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
        <div className={cn('space-y-2', sel.active && 'pb-20')}>
          {paged.visible.map((r) => (
            <RecurringCard
              key={r.id}
              item={r}
              hidden={hidden}
              selectMode={sel.active}
              selected={sel.has(r.id)}
              onSelect={() => sel.toggle(r.id)}
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

      {sel.active && (
        <SelectionBar
          count={sel.count}
          allSelected={allSelected}
          onToggleAll={() => (allSelected ? sel.clear() : sel.setMany(paged.visible.map((r) => r.id)))}
          onCancel={sel.exit}
        >
          <Button variant="destructive" onClick={() => setConfirmOpen(true)} disabled={sel.count === 0}>
            <Trash2 className="h-4 w-4" />
            Excluir
          </Button>
        </SelectionBar>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Excluir recorrências"
        description={
          sel.count === 1
            ? 'A recorrência selecionada será excluída e as ocorrências futuras pendentes serão removidas. Esta ação não pode ser desfeita.'
            : `${sel.count} recorrências selecionadas serão excluídas e as ocorrências futuras pendentes serão removidas. Esta ação não pode ser desfeita.`
        }
        loading={deleting}
        onConfirm={() => void bulkDelete()}
      />

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
  selectMode,
  selected,
  onSelect,
  onToggle,
  onRemove,
}: {
  item: RecurringTransaction;
  hidden: boolean;
  selectMode: boolean;
  selected: boolean;
  onSelect: () => void;
  onToggle: (isActive: boolean) => void;
  onRemove: () => void;
}) {
  const every =
    item.interval > 1
      ? `A cada ${item.interval} · ${FREQ_LABELS[item.frequency].toLowerCase()}`
      : FREQ_LABELS[item.frequency];
  return (
    <Card
      className={cn(
        'flex items-center justify-between gap-2 p-3',
        !item.isActive && 'opacity-60',
        selectMode && 'cursor-pointer',
        selected && 'ring-2 ring-primary',
      )}
      onClick={selectMode ? onSelect : undefined}
    >
      {selectMode && (
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0 accent-primary"
          checked={selected}
          onChange={onSelect}
          aria-label={`Selecionar ${item.description}`}
        />
      )}
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
        {!selectMode && (
          <>
            <Switch
              checked={item.isActive}
              onCheckedChange={onToggle}
              aria-label={item.isActive ? 'Pausar' : 'Ativar'}
            />
            <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Excluir">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
