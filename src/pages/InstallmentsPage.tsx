import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { useWorkspace } from '@/workspace/WorkspaceProvider';
import { useLiveAccounts, useLiveCategories } from '@/hooks/useLiveData';
import { usePrivacy } from '@/ui/PrivacyProvider';
import { installmentApi } from '@/api/endpoints';
import { ApiError, OfflineError } from '@/api/client';
import { formatDate, formatMoney } from '@/lib/format';
import type { InstallmentPlan } from '@/api/types';

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
  const { hidden } = usePrivacy();
  const qc = useQueryClient();
  const accounts = useLiveAccounts(activeId) ?? [];
  const categories = useLiveCategories(activeId) ?? [];

  const [opened, setOpened] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [installments, setInstallments] = useState('2');
  const [firstDueDate, setFirstDueDate] = useState<Date>(() => new Date());

  const { data, isLoading, isError } = useQuery({
    queryKey: ['installments', activeId],
    queryFn: () => installmentApi.list(activeId!),
    enabled: !!activeId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['installments', activeId] });

  const create = useMutation({
    mutationFn: () =>
      installmentApi.create(activeId!, {
        accountId,
        description: description.trim(),
        totalAmount: Number(totalAmount.replace(',', '.')) || 0,
        installments: Number(installments) || 2,
        firstDueDate: firstDueDate.toISOString(),
        categoryId: categoryId || null,
      }),
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
    setFirstDueDate(new Date());
    setOpened(true);
  };

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
            <div className="space-y-1.5">
              <Label>1º vencimento</Label>
              <DatePicker value={firstDueDate} onChange={(d) => d && setFirstDueDate(d)} />
            </div>
            {totalAmount.trim() && Number(installments) >= 2 && (
              <p className="text-xs text-muted-foreground">
                {installments}x de aprox.{' '}
                {formatMoney(
                  (Number(totalAmount.replace(',', '.')) || 0) / (Number(installments) || 1),
                  hidden,
                )}
              </p>
            )}
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
  const { data, isLoading } = useQuery({
    queryKey: ['installment', wsId, planId],
    queryFn: () => installmentApi.get(wsId!, planId!),
    enabled: !!wsId && !!planId,
  });
  const plan: InstallmentPlan | undefined = data?.plan;

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
            <div className="space-y-1">
              {(plan.transactions ?? []).map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <span>
                    {t.installmentNumber ? `${t.installmentNumber}ª · ` : ''}
                    {t.dueDate ? formatDate(t.dueDate) : formatDate(t.date)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{formatMoney(t.amount, hidden)}</span>
                    <Badge variant={t.status === 'COMPLETED' ? 'success' : 'muted'}>
                      {t.status === 'COMPLETED' ? 'paga' : 'pendente'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
