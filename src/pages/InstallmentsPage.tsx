import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar as CalendarIcon, Check, CheckSquare, CreditCard, Loader2, Pencil, Plus, Search, Trash2, Undo2, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { useWorkspace } from '@/workspace/WorkspaceProvider';
import { useAuth } from '@/auth/AuthProvider';
import { useLiveAccounts, useLiveCards, useLiveCategories, useLiveTransactions } from '@/hooks/useLiveData';
import { usePrivacy } from '@/ui/PrivacyProvider';
import { useSync } from '@/sync/SyncProvider';
import { payTransactionLocal, unpayTransactionLocal } from '@/sync/mutations';
import { installmentApi, transactionApi, workspaceApi } from '@/api/endpoints';
import { ApiError, OfflineError } from '@/api/client';
import { LoadMore } from '@/components/LoadMore';
import { SelectionBar } from '@/components/SelectionBar';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { usePagedList } from '@/hooks/usePagedList';
import { useSelection } from '@/hooks/useSelection';
import { cn } from '@/lib/utils';
import { formatDate, formatMoney } from '@/lib/format';
import { fireConfetti } from '@/lib/confetti';
import type { InstallmentPlan, Transaction, TxShare } from '@/api/types';

function handleError(err: unknown) {
  toast.error(
    err instanceof OfflineError
      ? 'Sem conexão — parcelamentos precisam do servidor'
      : err instanceof ApiError
        ? err.message
        : 'Erro inesperado',
  );
}

function ownerRow(ownerName: string): TxShare {
  return { name: ownerName, paid: true, owner: true };
}

// O seletor de origem codifica conta vs cartão ("acc:<id>" | "card:<id>").
const accVal = (id: string) => `acc:${id}`;
const cardVal = (id: string) => `card:${id}`;

export function InstallmentsPage() {
  const { activeId } = useWorkspace();
  const { user } = useAuth();
  const { hidden } = usePrivacy();
  const qc = useQueryClient();
  const accounts = useLiveAccounts(activeId) ?? [];
  const cards = (useLiveCards(activeId) ?? []).filter((c) => !c.archived);
  const categories = useLiveCategories(activeId) ?? [];
  const liveTxs = useLiveTransactions(activeId) ?? [];

  const ownerName = user?.name?.trim() || 'Você';

  const [opened, setOpened] = useState(false);
  // Quando preenchido, o diálogo está editando um parcelamento existente.
  const [editId, setEditId] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  // Plano em edição tem parcela paga fora do prefixo (ex.: 3ª paga, 1ª/2ª não).
  // O recálculo segue o modelo de prefixo, então avisamos o usuário.
  const [paidGap, setPaidGap] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const sel = useSelection();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [accountFilter, setAccountFilter] = useState('ALL');
  const [cardFilter, setCardFilter] = useState('ALL');
  // Origem: conta ou cartão, codificada em "acc:<id>" / "card:<id>".
  const [source, setSource] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [installments, setInstallments] = useState('2');
  const [startInstallment, setStartInstallment] = useState('1');
  const [firstDueDate, setFirstDueDate] = useState<Date>(() => new Date());

  // Divisão entre pessoas (rateio). shares[0] é sempre o dono.
  const [shares, setShares] = useState<TxShare[]>([ownerRow(ownerName)]);
  const [newName, setNewName] = useState('');
  const [shareCount, setShareCount] = useState(1);

  // Pessoas cadastradas (settings) p/ autocomplete no rateio.
  const [contacts, setContacts] = useState<string[]>([]);
  useEffect(() => {
    if (!activeId) return;
    let live = true;
    workspaceApi
      .getSettings(activeId)
      .then((r) => live && setContacts(r.settings?.sharedContacts ?? []))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [activeId]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['installments', activeId],
    queryFn: () => installmentApi.list(activeId!),
    enabled: !!activeId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['installments', activeId] });

  const others = shares.filter((s) => !s.owner);
  const isShared = others.length > 0;
  const peopleCount = Math.max(shareCount, shares.length);

  const save = useMutation({
    mutationFn: async () => {
      // Cadastra nomes novos nas settings (best-effort, p/ autocomplete futuro).
      if (isShared) {
        const known = new Set(contacts.map((c) => c.toLowerCase()));
        const fresh = others.map((s) => s.name).filter((n) => !known.has(n.toLowerCase()));
        if (fresh.length > 0) {
          const merged = Array.from(new Set([...contacts, ...fresh]));
          try {
            await workspaceApi.updateSettings(activeId!, { sharedContacts: merged });
            setContacts(merged);
          } catch {
            // não bloqueia o salvamento do parcelamento.
          }
        }
      }
      const isCard = source.startsWith('card:');
      const ownerId = source.slice(source.indexOf(':') + 1);
      const body = {
        accountId: isCard ? undefined : ownerId,
        creditCardId: isCard ? ownerId : undefined,
        description: description.trim(),
        totalAmount: Number(totalAmount.replace(',', '.')) || 0,
        installments: Number(installments) || 2,
        startInstallment: Number(startInstallment) || 1,
        firstDueDate: firstDueDate.toISOString(),
        categoryId: categoryId || null,
        shares: isShared ? shares : null,
        shareCount: isShared ? peopleCount : null,
      };
      return editId
        ? installmentApi.update(activeId!, editId, body)
        : installmentApi.create(activeId!, body);
    },
    onSuccess: () => {
      toast.success(editId ? 'Parcelamento atualizado' : 'Parcelamento criado');
      setOpened(false);
      setEditId(null);
      invalidate();
      // Atualiza também o detalhe (parcelas regeradas) caso esteja aberto.
      qc.invalidateQueries({ queryKey: ['installment', activeId] });
    },
    onError: handleError,
  });

  const remove = useMutation({
    mutationFn: (id: string) => installmentApi.remove(activeId!, id),
    onSuccess: () => {
      invalidate();
      toast('Parcelamento excluído');
    },
    onError: handleError,
  });

  const openNew = () => {
    const firstAcc = accounts[0];
    const firstCard = cards[0];
    setEditId(null);
    setSource(
      firstAcc
        ? accVal(firstAcc.id ?? firstAcc.key)
        : firstCard
          ? cardVal(firstCard.id ?? firstCard.key)
          : '',
    );
    setCategoryId('');
    setDescription('');
    setTotalAmount('');
    setInstallments('2');
    setStartInstallment('1');
    setFirstDueDate(new Date());
    setShares([ownerRow(ownerName)]);
    setShareCount(1);
    setNewName('');
    setPaidGap(false);
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
      setPaidGap(totalPaid > leadingPaid);
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
      setSource(src);
      setCategoryId(plan.categoryId ?? '');
      setDescription(plan.description);
      setTotalAmount(String(plan.totalAmount).replace('.', ','));
      setInstallments(String(plan.installments));
      setStartInstallment(String(start));
      setFirstDueDate(new Date(firstDue));
      setShares(planShares);
      setShareCount(Math.max(plan.shareCount ?? planShares.length, planShares.length));
      setNewName('');
      setDetailId(null);
      setOpened(true);
    } catch (err) {
      handleError(err);
    } finally {
      setLoadingEdit(false);
    }
  };

  const addPerson = (raw: string) => {
    const name = raw.trim();
    if (!name) return;
    if (shares.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      toast.error('Essa pessoa já está no rateio');
      return;
    }
    setShares((prev) => {
      const next = [...prev, { name, paid: false }];
      setShareCount((c) => Math.max(c, next.length));
      return next;
    });
    setNewName('');
  };

  const removePerson = (i: number) =>
    setShares((prev) => prev.filter((_, idx) => idx !== i));

  const togglePaid = (i: number) =>
    setShares((prev) => prev.map((s, idx) => (idx === i ? { ...s, paid: !s.paid } : s)));

  const shareSuggestions = contacts.filter(
    (c) => !shares.some((s) => s.name.toLowerCase() === c.toLowerCase()),
  );
  const perPerson =
    isShared && peopleCount > 0
      ? (Number(totalAmount.replace(',', '.')) || 0) / peopleCount
      : null;

  const expenseCats = categories.filter((c) => c.kind === 'EXPENSE');
  const allItems = data?.items ?? [];

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

  const filtersActive =
    search.trim() !== '' ||
    categoryFilter !== 'ALL' ||
    accountFilter !== 'ALL' ||
    cardFilter !== 'ALL';
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
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por descrição"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-48">
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
          {accounts.length > 0 && (
            <Select value={accountFilter} onValueChange={setAccountFilter}>
              <SelectTrigger className="w-full sm:w-44">
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
          )}
          {cards.length > 0 && (
            <Select value={cardFilter} onValueChange={setCardFilter}>
              <SelectTrigger className="w-full sm:w-44">
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
          )}
          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4" />
              Limpar
            </Button>
          )}
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
          <Button variant="destructive" onClick={() => setConfirmOpen(true)} disabled={sel.count === 0}>
            <Trash2 className="h-4 w-4" />
            Excluir
          </Button>
        </SelectionBar>
      )}

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

      <Dialog
        open={opened}
        onOpenChange={(o) => {
          if (!o) {
            setOpened(false);
            setEditId(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar parcelamento' : 'Novo parcelamento'}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!activeId) return;
              if (!source) return toast.error('Escolha a conta ou o cartão');
              if (!description.trim()) return toast.error('Informe a descrição');
              if (!totalAmount.trim()) return toast.error('Informe o valor total');
              if (Number(installments) < 2) return toast.error('Mínimo de 2 parcelas');
              if (Number(startInstallment) > Number(installments))
                return toast.error('A parcela atual não pode ser maior que o total');
              save.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="ins-desc">Descrição</Label>
              <Input
                id="ins-desc"
                placeholder="Ex.: Geladeira"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="ins-total">Valor total</Label>
                <CurrencyInput
                  id="ins-total"
                  placeholder="0,00"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ins-n">Parcelas</Label>
                <Input
                  id="ins-n"
                  type="number"
                  min={2}
                  max={360}
                  value={installments}
                  onChange={(e) => setInstallments(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Conta ou cartão</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a conta ou o cartão" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={`acc-${a.key}`} value={accVal(a.id ?? a.key)}>
                      {a.name}
                    </SelectItem>
                  ))}
                  {cards.map((c) => (
                    <SelectItem key={`card-${c.key}`} value={cardVal(c.id ?? c.key)}>
                      {c.name} (cartão)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={categoryId || 'none'} onValueChange={(v) => setCategoryId(v === 'none' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem categoria</SelectItem>
                  {expenseCats.map((c) => (
                    <SelectItem key={c.key} value={c.id ?? c.key}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="ins-start">Parcela atual</Label>
                <Input
                  id="ins-start"
                  type="number"
                  min={1}
                  max={Number(installments) || 1}
                  value={startInstallment}
                  onChange={(e) => setStartInstallment(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  {Number(startInstallment) > 1
                    ? `Vencimento da ${Number(startInstallment)}ª`
                    : '1º vencimento'}
                </Label>
                <DatePicker value={firstDueDate} onChange={(d) => d && setFirstDueDate(d)} />
              </div>
            </div>
            {Number(startInstallment) > 1 && (
              <p className="text-xs text-muted-foreground">
                As parcelas 1 a {Number(startInstallment) - 1} serão registradas como pagas.
              </p>
            )}
            {totalAmount.trim() && Number(installments) >= 2 && (
              <p className="text-xs text-muted-foreground">
                {installments}x de aprox.{' '}
                {formatMoney(
                  (Number(totalAmount.replace(',', '.')) || 0) / (Number(installments) || 1),
                  hidden,
                )}
              </p>
            )}

            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Dividir com outras pessoas</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Cada parcela será dividida e poderá ter o pagamento marcado por pessoa.
              </p>

              <div className="space-y-2">
                {shares.map((s, i) => (
                  <div
                    key={`${s.name}-${i}`}
                    className="flex items-center justify-between gap-2 rounded-md border p-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium">{s.name}</span>
                      {s.owner && <span className="text-xs text-muted-foreground">(você)</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                        <Switch checked={s.paid} onCheckedChange={() => togglePaid(i)} />
                        {s.paid ? 'pago' : 'a pagar'}
                      </label>
                      {!s.owner && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => removePerson(i)}
                          aria-label="Remover pessoa"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Input
                  list="installment-contacts"
                  placeholder="Nome da pessoa"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addPerson(newName);
                    }
                  }}
                />
                <datalist id="installment-contacts">
                  {shareSuggestions.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <Button type="button" variant="outline" onClick={() => addPerson(newName)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {isShared && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="ins-people">Total de pessoas no rateio</Label>
                    <Input
                      id="ins-people"
                      type="number"
                      min={shares.length}
                      className="w-20"
                      value={peopleCount}
                      onChange={(e) =>
                        setShareCount(Math.max(shares.length, Number(e.target.value) || shares.length))
                      }
                    />
                  </div>
                  {perPerson != null && (
                    <p className="text-xs text-muted-foreground">
                      Cada pessoa paga aprox.{' '}
                      <span className="font-medium text-foreground">
                        {formatMoney(perPerson, hidden)}
                      </span>{' '}
                      do total ({formatMoney(perPerson / (Number(installments) || 1), hidden)} por parcela)
                    </p>
                  )}
                </>
              )}
            </div>

            {editId && (
              <p className="text-xs text-muted-foreground">
                As parcelas serão recalculadas com os novos valores e datas.
              </p>
            )}
            {editId && paidGap && (
              <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-400">
                Este parcelamento tem parcelas pagas fora de ordem (uma parcela
                posterior foi quitada antes de anteriores). Ao salvar, apenas as{' '}
                {Number(startInstallment) - 1 > 0 ? `${Number(startInstallment) - 1} primeiras` : '0'}{' '}
                parcelas continuarão marcadas como pagas — confira o campo
                “Parcela atual”.
              </div>
            )}
            <Button type="submit" className="w-full" disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editId ? 'Salvar alterações' : 'Criar'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

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
