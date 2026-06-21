import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar as CalendarIcon, Check, CreditCard, Loader2, Plus, Search, Trash2, Users, X } from 'lucide-react';
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
import { useLiveAccounts, useLiveCategories, useLiveTransactions } from '@/hooks/useLiveData';
import { usePrivacy } from '@/ui/PrivacyProvider';
import { useSync } from '@/sync/SyncProvider';
import { payTransactionLocal } from '@/sync/mutations';
import { installmentApi, transactionApi, workspaceApi } from '@/api/endpoints';
import { ApiError, OfflineError } from '@/api/client';
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

export function InstallmentsPage() {
  const { activeId } = useWorkspace();
  const { user } = useAuth();
  const { hidden } = usePrivacy();
  const qc = useQueryClient();
  const accounts = useLiveAccounts(activeId) ?? [];
  const categories = useLiveCategories(activeId) ?? [];

  const ownerName = user?.name?.trim() || 'Você';

  const [opened, setOpened] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [accountId, setAccountId] = useState('');
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

  const create = useMutation({
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
            // não bloqueia a criação do parcelamento.
          }
        }
      }
      return installmentApi.create(activeId!, {
        accountId,
        description: description.trim(),
        totalAmount: Number(totalAmount.replace(',', '.')) || 0,
        installments: Number(installments) || 2,
        startInstallment: Number(startInstallment) || 1,
        firstDueDate: firstDueDate.toISOString(),
        categoryId: categoryId || null,
        shares: isShared ? shares : null,
        shareCount: isShared ? peopleCount : null,
      });
    },
    onSuccess: () => {
      setOpened(false);
      invalidate();
      toast.success('Parcelamento criado');
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
    setAccountId(accounts[0]?.id ?? accounts[0]?.key ?? '');
    setCategoryId('');
    setDescription('');
    setTotalAmount('');
    setInstallments('2');
    setStartInstallment('1');
    setFirstDueDate(new Date());
    setShares([ownerRow(ownerName)]);
    setShareCount(1);
    setNewName('');
    setOpened(true);
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

  const filtersActive = search.trim() !== '' || categoryFilter !== 'ALL';
  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allItems.filter((p) => {
      if (categoryFilter !== 'ALL' && p.categoryId !== categoryFilter) return false;
      if (q && !p.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allItems, search, categoryFilter]);

  const clearFilters = () => {
    setSearch('');
    setCategoryFilter('ALL');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Parcelamentos</h1>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          Novo parcelamento
        </Button>
      </div>

      {!isLoading && !isError && allItems.length > 0 && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por descrição"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="flex-1">
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
            {filtersActive && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4" />
                Limpar
              </Button>
            )}
          </div>
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
        <div className="space-y-2">
          {items.map((p) => (
            <Card
              key={p.id}
              className="flex cursor-pointer items-center justify-between gap-2 p-3 hover:bg-accent/40"
              onClick={() => setDetailId(p.id)}
            >
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
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={opened} onOpenChange={(o) => !o && setOpened(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo parcelamento</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!activeId) return;
              if (!accountId) return toast.error('Escolha a conta');
              if (!description.trim()) return toast.error('Informe a descrição');
              if (!totalAmount.trim()) return toast.error('Informe o valor total');
              if (Number(installments) < 2) return toast.error('Mínimo de 2 parcelas');
              if (Number(startInstallment) > Number(installments))
                return toast.error('A parcela atual não pode ser maior que o total');
              create.mutate();
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
              <Label>Conta</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.key} value={a.id ?? a.key}>
                      {a.name}
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

            <Button type="submit" className="w-full" disabled={create.isPending}>
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <InstallmentDetail
        wsId={activeId}
        planId={detailId}
        hidden={hidden}
        onClose={() => setDetailId(null)}
      />
    </div>
  );
}

function InstallmentDetail({
  wsId,
  planId,
  hidden,
  onClose,
}: {
  wsId: string | null;
  planId: string | null;
  hidden: boolean;
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
            <p className="text-sm text-muted-foreground">
              Total {formatMoney(plan.totalAmount, hidden)} em {plan.installments}x
            </p>

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
                        <Badge variant="success">paga</Badge>
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
