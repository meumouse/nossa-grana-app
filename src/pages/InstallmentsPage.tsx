import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar as CalendarIcon, Check, CheckSquare, CreditCard, Loader2, Pencil, Plus, Search, Shapes, Trash2, Undo2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { useWorkspace } from '@/workspace/WorkspaceProvider';
import { useAuth } from '@/auth/AuthProvider';
import { useLiveAccounts, useLiveCards, useLiveCategories, useLiveTags, useLiveTransactions } from '@/hooks/useLiveData';
import { usePrivacy } from '@/ui/PrivacyProvider';
import { useSync } from '@/sync/SyncProvider';
import { payTransactionLocal, unpayTransactionLocal } from '@/sync/mutations';
import { installmentApi, transactionApi } from '@/api/endpoints';
import { ApiError, OfflineError } from '@/api/client';
import { FiltersSheet, FilterField } from '@/components/FiltersSheet';
import { LoadMore } from '@/components/LoadMore';
import { SelectionBar } from '@/components/SelectionBar';
import { BulkCategoryDialog } from '@/components/BulkCategoryDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  InstallmentFormModal,
  accVal,
  cardVal,
  ownerRow,
  type InstallmentInitial,
} from '@/components/InstallmentFormModal';
import { usePagedList } from '@/hooks/usePagedList';
import { useSelection } from '@/hooks/useSelection';
import { cn } from '@/lib/utils';
import { formatDate, formatMoney } from '@/lib/format';
import { fireConfetti } from '@/lib/confetti';
import type { InstallmentPlan, Transaction } from '@/api/types';

function handleError(err: unknown) {
  toast.error(
    err instanceof OfflineError
      ? 'Sem conexão — parcelamentos precisam do servidor'
      : err instanceof ApiError
        ? err.message
        : 'Erro inesperado',
  );
}

export function InstallmentsPage() {
  const { activeId } = useWorkspace();
  const { user } = useAuth();
  const { hidden } = usePrivacy();
  const { syncNow } = useSync();
  const qc = useQueryClient();
  const accounts = useLiveAccounts(activeId) ?? [];
  const cards = (useLiveCards(activeId) ?? []).filter((c) => !c.archived);
  const categories = useLiveCategories(activeId) ?? [];
  const tags = useLiveTags(activeId) ?? [];
  const liveTxs = useLiveTransactions(activeId) ?? [];

  const ownerName = user?.name?.trim() || 'Você';

  const [opened, setOpened] = useState(false);
  // Quando preenchido, o diálogo está editando um parcelamento existente.
  const [editId, setEditId] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  // Plano em edição tem parcela paga fora do prefixo (ex.: 3ª paga, 1ª/2ª não).
  // O recálculo segue o modelo de prefixo, então avisamos o usuário.
  const [paidGap, setPaidGap] = useState(false);
  // Pré-preenchimento passado ao formulário (edição) — null = novo em branco.
  const [initial, setInitial] = useState<InstallmentInitial | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const sel = useSelection();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [bulkCatOpen, setBulkCatOpen] = useState(false);
  const [bulkCatting, setBulkCatting] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [accountFilter, setAccountFilter] = useState('ALL');
  const [cardFilter, setCardFilter] = useState('ALL');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['installments', activeId],
    queryFn: () => installmentApi.list(activeId!),
    enabled: !!activeId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['installments', activeId] });

  const remove = useMutation({
    mutationFn: (id: string) => installmentApi.remove(activeId!, id),
    onSuccess: () => {
      invalidate();
      toast('Parcelamento excluído');
    },
    onError: handleError,
  });

  const openNew = () => {
    setEditId(null);
    setPaidGap(false);
    setInitial(null);
    setOpened(true);
  };

  // Abre o diálogo em modo edição, pré-preenchendo com os dados do plano. O
  // número/vencimento da "parcela atual" é derivado das parcelas já quitadas.
  const openEdit = async (id: string) => {
    if (!activeId) return;
    setLoadingEdit(true);
    try {
      const { plan } = await installmentApi.get(activeId, id);
      const txs = (plan.transactions ?? [])
        .slice()
        .sort((a, b) => (a.installmentNumber ?? 0) - (b.installmentNumber ?? 0));
      // Prefixo contíguo de parcelas pagas (a partir da 1ª). Se houver parcela
      // paga além desse prefixo, o recálculo (modelo de prefixo) não a preserva.
      let leadingPaid = 0;
      for (const t of txs) {
        if (t.status === 'COMPLETED') leadingPaid += 1;
        else break;
      }
      const totalPaid = txs.filter((t) => t.status === 'COMPLETED').length;
      const start = Math.min(Math.max(leadingPaid + 1, 1), plan.installments);
      const startTx = txs.find((t) => t.installmentNumber === start);
      const firstDue = startTx?.dueDate ?? startTx?.date ?? plan.firstDueDate;
      const ref = txs[0];
      const src = ref?.creditCardId
        ? cardVal(ref.creditCardId)
        : ref?.accountId
          ? accVal(ref.accountId)
          : '';
      const planShares =
        plan.shared && plan.shares && plan.shares.length > 0 ? plan.shares : [ownerRow(ownerName)];
      setEditId(id);
      setPaidGap(totalPaid > leadingPaid);
      setInitial({
        source: src,
        categoryId: plan.categoryId ?? '',
        tagIds: (plan.tags ?? []).map((t) => t.id),
        description: plan.description,
        totalAmount: String(plan.totalAmount).replace('.', ','),
        installments: String(plan.installments),
        startInstallment: String(start),
        firstDueDate: new Date(firstDue),
        shares: planShares,
        shareCount: Math.max(plan.shareCount ?? planShares.length, planShares.length),
      });
      setDetailId(null);
      setOpened(true);
    } catch (err) {
      handleError(err);
    } finally {
      setLoadingEdit(false);
    }
  };

  const allItems = data?.items ?? [];
  const expenseCats = categories.filter((c) => c.kind === 'EXPENSE');

  // O plano não guarda conta/cartão — a origem vive nas parcelas (transações).
  // Mapeia planId → { accountId, creditCardId } a partir dos dados locais.
  const planSource = useMemo(() => {
    const m = new Map<string, { accountId: string | null; creditCardId: string | null }>();
    for (const t of liveTxs) {
      const pid = t.installmentPlanId;
      if (pid && !m.has(pid)) {
        m.set(pid, { accountId: t.accountId ?? null, creditCardId: t.creditCardId ?? null });
      }
    }
    return m;
  }, [liveTxs]);

  // Filtros da sidebar (sem a busca por texto, que fica inline) — alimenta o badge.
  const filterCount =
    (categoryFilter !== 'ALL' ? 1 : 0) +
    (accountFilter !== 'ALL' ? 1 : 0) +
    (cardFilter !== 'ALL' ? 1 : 0);
  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allItems.filter((p) => {
      if (categoryFilter !== 'ALL' && p.categoryId !== categoryFilter) return false;
      if (q && !p.description.toLowerCase().includes(q)) return false;
      if (accountFilter !== 'ALL' && planSource.get(p.id)?.accountId !== accountFilter) return false;
      if (cardFilter !== 'ALL' && planSource.get(p.id)?.creditCardId !== cardFilter) return false;
      return true;
    });
  }, [allItems, search, categoryFilter, accountFilter, cardFilter, planSource]);

  const paged = usePagedList(items, {
    resetKey: `${search}|${categoryFilter}|${accountFilter}|${cardFilter}`,
  });
  const allSelected = paged.visible.length > 0 && paged.visible.every((p) => sel.has(p.id));

  const bulkCategory = async (categoryId: string | null) => {
    setBulkCatting(true);
    try {
      await Promise.all(
        [...sel.selected].map((id) => installmentApi.setCategory(activeId!, id, categoryId)),
      );
      // As parcelas (transações) mudaram no servidor — puxa p/ refletir no extrato.
      void syncNow();
      toast.success(
        sel.count === 1
          ? 'Categoria alterada em 1 parcelamento'
          : `Categoria alterada em ${sel.count} parcelamentos`,
      );
      setBulkCatOpen(false);
      sel.exit();
      invalidate();
      qc.invalidateQueries({ queryKey: ['installment', activeId] });
    } catch (err) {
      handleError(err);
    } finally {
      setBulkCatting(false);
    }
  };

  const bulkDelete = async () => {
    setDeleting(true);
    try {
      await Promise.all([...sel.selected].map((id) => installmentApi.remove(activeId!, id)));
      toast.success(
        sel.count === 1 ? 'Parcelamento excluído' : `${sel.count} parcelamentos excluídos`,
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

  const clearFilters = () => {
    setSearch('');
    setCategoryFilter('ALL');
    setAccountFilter('ALL');
    setCardFilter('ALL');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Parcelamentos</h1>
        <div className="flex items-center gap-2">
          {allItems.length > 0 && (
            <Button
              variant={sel.active ? 'secondary' : 'outline'}
              size="icon"
              className="sm:w-auto sm:px-4"
              onClick={() => (sel.active ? sel.exit() : sel.enter())}
              title={sel.active ? 'Cancelar seleção' : 'Selecionar'}
            >
              <CheckSquare className="h-4 w-4" />
              <span className="hidden sm:inline">{sel.active ? 'Cancelar' : 'Selecionar'}</span>
            </Button>
          )}
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" />
            <span className="sm:hidden">Novo</span>
            <span className="hidden sm:inline">Novo parcelamento</span>
          </Button>
        </div>
      </div>

      {!isLoading && !isError && allItems.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por descrição"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <FiltersSheet activeCount={filterCount} onClear={clearFilters}>
            <FilterField label="Categoria">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas as categorias</SelectItem>
                  {expenseCats.map((c) => (
                    <SelectItem key={c.key} value={c.id ?? c.key}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            {accounts.length > 0 && (
              <FilterField label="Conta">
                <Select value={accountFilter} onValueChange={setAccountFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Conta" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todas as contas</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a.key} value={a.id ?? a.key}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
            )}
            {cards.length > 0 && (
              <FilterField label="Cartão">
                <Select value={cardFilter} onValueChange={setCardFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Cartão" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos os cartões</SelectItem>
                    {cards.map((c) => (
                      <SelectItem key={c.key} value={c.id ?? c.key}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
            )}
          </FiltersSheet>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : isError ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Não foi possível carregar os parcelamentos.
        </p>
      ) : allItems.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nenhum parcelamento. Divida uma compra em parcelas.
        </p>
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nenhum parcelamento corresponde aos filtros.
        </p>
      ) : (
        <div className={cn('space-y-2', sel.active && 'pb-20')}>
          {paged.visible.map((p) => (
            <Card
              key={p.id}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-2 p-3 hover:bg-accent/40',
                sel.has(p.id) && 'ring-2 ring-primary',
              )}
              onClick={() => (sel.active ? sel.toggle(p.id) : setDetailId(p.id))}
            >
              {sel.active && (
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 accent-primary"
                  checked={sel.has(p.id)}
                  onChange={() => sel.toggle(p.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Selecionar ${p.description}`}
                />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="truncate font-medium">{p.description}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {p.installments}x · 1ª em {formatDate(p.firstDueDate)}
                </p>
                {p.tags && p.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.tags.map((t) => (
                      <span
                        key={t.id}
                        className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none"
                        style={t.color ? { borderColor: t.color, color: t.color } : undefined}
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap font-bold">{formatMoney(p.totalAmount, hidden)}</span>
                {!sel.active && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Editar"
                      disabled={loadingEdit}
                      onClick={(e) => {
                        e.stopPropagation();
                        void openEdit(p.id);
                      }}
                    >
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Excluir"
                      onClick={(e) => {
                        e.stopPropagation();
                        remove.mutate(p.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </>
                )}
              </div>
            </Card>
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
          onToggleAll={() => (allSelected ? sel.clear() : sel.setMany(paged.visible.map((p) => p.id)))}
          onCancel={sel.exit}
        >
          <Button variant="outline" onClick={() => setBulkCatOpen(true)} disabled={sel.count === 0}>
            <Shapes className="h-4 w-4" />
            Categoria
          </Button>
          <Button variant="destructive" onClick={() => setConfirmOpen(true)} disabled={sel.count === 0}>
            <Trash2 className="h-4 w-4" />
            Excluir
          </Button>
        </SelectionBar>
      )}

      <BulkCategoryDialog
        open={bulkCatOpen}
        onOpenChange={setBulkCatOpen}
        categories={expenseCats}
        count={sel.count}
        loading={bulkCatting}
        getValue={(c) => c.id ?? c.key}
        onApply={(id) => void bulkCategory(id)}
        noun={{ one: 'parcelamento', many: 'parcelamentos' }}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Excluir parcelamentos"
        description={
          sel.count === 1
            ? 'O parcelamento selecionado será excluído e as parcelas futuras pendentes serão removidas. Esta ação não pode ser desfeita.'
            : `${sel.count} parcelamentos selecionados serão excluídos e as parcelas futuras pendentes serão removidas. Esta ação não pode ser desfeita.`
        }
        loading={deleting}
        onConfirm={() => void bulkDelete()}
      />

      {activeId && (
        <InstallmentFormModal
          opened={opened}
          onClose={() => {
            setOpened(false);
            setEditId(null);
          }}
          workspaceId={activeId}
          accounts={accounts}
          cards={cards}
          categories={categories}
          tags={tags}
          ownerName={ownerName}
          initial={initial}
          editId={editId}
          paidGap={paidGap}
        />
      )}

      <InstallmentDetail
        wsId={activeId}
        planId={detailId}
        hidden={hidden}
        onEdit={(id) => void openEdit(id)}
        onClose={() => setDetailId(null)}
      />
    </div>
  );
}

function InstallmentDetail({
  wsId,
  planId,
  hidden,
  onEdit,
  onClose,
}: {
  wsId: string | null;
  planId: string | null;
  hidden: boolean;
  onEdit: (id: string) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { syncNow } = useSync();
  const { data, isLoading } = useQuery({
    queryKey: ['installment', wsId, planId],
    queryFn: () => installmentApi.get(wsId!, planId!),
    enabled: !!wsId && !!planId,
  });
  const plan: InstallmentPlan | undefined = data?.plan;

  // Status local (offline-first) das parcelas, mais recente que o do servidor
  // logo após efetivar — mapeado pelo id da transação no servidor.
  const localTxs = useLiveTransactions(wsId) ?? [];
  const localStatusByServerId = useMemo(() => {
    const m = new Map<string, { key: string; status: string }>();
    for (const t of localTxs) if (t.id) m.set(t.id, { key: t.key, status: t.status });
    return m;
  }, [localTxs]);

  const [payingId, setPayingId] = useState<string | null>(null);
  const [unpayingId, setUnpayingId] = useState<string | null>(null);

  // Ajusta o vencimento de uma parcela (ex.: cair em feriado/fim de semana).
  const updateDate = useMutation({
    mutationFn: ({ id, date }: { id: string; date: Date }) =>
      transactionApi.update(wsId!, id, { date: date.toISOString(), dueDate: date.toISOString() }),
    onSuccess: () => {
      void syncNow();
      qc.invalidateQueries({ queryKey: ['installment', wsId, planId] });
      qc.invalidateQueries({ queryKey: ['installments', wsId] });
      toast.success('Vencimento da parcela atualizado');
    },
    onError: handleError,
  });

  const effectiveStatus = (t: Transaction) =>
    (t.id ? localStatusByServerId.get(t.id)?.status : undefined) ?? t.status;

  const pendingCount = (plan?.transactions ?? []).filter(
    (t) => effectiveStatus(t) !== 'COMPLETED',
  ).length;

  const payParcela = async (t: Transaction) => {
    const local = t.id ? localStatusByServerId.get(t.id) : undefined;
    if (!local) {
      toast.error('Parcela ainda não sincronizada — tente novamente em instantes');
      return;
    }
    const isLast = pendingCount === 1; // esta é a única pendente → quita o plano
    setPayingId(t.id);
    try {
      await payTransactionLocal(local.key);
      void syncNow();
      await qc.invalidateQueries({ queryKey: ['installment', wsId, planId] });
      qc.invalidateQueries({ queryKey: ['installments', wsId] });
      if (isLast) {
        fireConfetti();
        toast.success('🎉 Parcelamento quitado!');
      } else {
        toast.success('Parcela efetivada');
      }
    } catch {
      toast.error('Não foi possível efetivar a parcela');
    } finally {
      setPayingId(null);
    }
  };

  const unpayParcela = async (t: Transaction) => {
    const local = t.id ? localStatusByServerId.get(t.id) : undefined;
    if (!local) {
      toast.error('Parcela ainda não sincronizada — tente novamente em instantes');
      return;
    }
    setUnpayingId(t.id);
    try {
      await unpayTransactionLocal(local.key);
      void syncNow();
      await qc.invalidateQueries({ queryKey: ['installment', wsId, planId] });
      qc.invalidateQueries({ queryKey: ['installments', wsId] });
      toast.success('Pagamento da parcela removido');
    } catch {
      toast.error('Não foi possível remover o pagamento');
    } finally {
      setUnpayingId(null);
    }
  };

  return (
    <Dialog open={!!planId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{plan?.description ?? 'Parcelamento'}</DialogTitle>
        </DialogHeader>
        {isLoading || !plan ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Total {formatMoney(plan.totalAmount, hidden)} em {plan.installments}x
              </p>
              <Button variant="outline" size="sm" className="h-8" onClick={() => onEdit(plan.id)}>
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </Button>
            </div>

            {plan.shared && plan.shares && plan.shares.length > 0 && (
              <div className="space-y-1.5 rounded-md border p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Dividido entre {Math.max(plan.shareCount ?? plan.shares.length, plan.shares.length)}{' '}
                  pessoas
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {plan.shares.map((s, i) => (
                    <Badge key={`${s.name}-${i}`} variant="muted">
                      {s.name}
                      {s.owner ? ' (você)' : ''}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Cada parcela rastreia o pagamento por pessoa na lista de transações.
                </p>
              </div>
            )}

            <div className="space-y-1">
              {(plan.transactions ?? []).map((t) => {
                const tShares = t.shares ?? [];
                const paidCount = tShares.filter((s) => s.paid).length;
                const isPaid = effectiveStatus(t) === 'COMPLETED';
                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      {t.installmentNumber ? (
                        <span className="text-muted-foreground">{t.installmentNumber}ª</span>
                      ) : null}
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1.5 px-2 font-normal"
                            disabled={updateDate.isPending || !t.id}
                          >
                            <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                            {t.dueDate ? formatDate(t.dueDate) : formatDate(t.date)}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={new Date(t.dueDate ?? t.date)}
                            onSelect={(d) => d && t.id && updateDate.mutate({ id: t.id, date: d })}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="flex items-center gap-2">
                      {t.shared && tShares.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {paidCount}/{tShares.length} pagaram
                        </span>
                      )}
                      <span className="font-medium">{formatMoney(t.amount, hidden)}</span>
                      {isPaid ? (
                        <div className="flex items-center gap-1.5">
                          <Badge variant="success">paga</Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground"
                            title="Remover pagamento"
                            disabled={unpayingId !== null || !t.id}
                            onClick={() => void unpayParcela(t)}
                          >
                            {unpayingId === t.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Undo2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7"
                          disabled={payingId !== null}
                          onClick={() => void payParcela(t)}
                        >
                          {payingId === t.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                          Efetivar
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
