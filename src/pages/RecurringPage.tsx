import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { useWorkspace } from '@/workspace/WorkspaceProvider';
import { useLiveAccounts, useLiveCategories } from '@/hooks/useLiveData';
import { usePrivacy } from '@/ui/PrivacyProvider';
import { recurringApi } from '@/api/endpoints';
import { ApiError, OfflineError } from '@/api/client';
import { formatMoney } from '@/lib/format';
import type { RecurrenceFrequency, RecurringTransaction } from '@/api/types';

const FREQ_LABELS: Record<RecurrenceFrequency, string> = {
  DAILY: 'Diária',
  WEEKLY: 'Semanal',
  MONTHLY: 'Mensal',
  YEARLY: 'Anual',
};

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
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('MONTHLY');
  const [interval, setIntervalValue] = useState('1');
  const [startDate, setStartDate] = useState<Date>(() => new Date());
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [autoConfirm, setAutoConfirm] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['recurring', activeId],
    queryFn: () => recurringApi.list(activeId!),
    enabled: !!activeId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['recurring', activeId] });

  const create = useMutation({
    mutationFn: () =>
      recurringApi.create(activeId!, {
        accountId,
        type,
        amount: Number(amount.replace(',', '.')) || 0,
        description: description.trim(),
        categoryId: categoryId || null,
        frequency,
        interval: Number(interval) || 1,
        startDate: startDate.toISOString(),
        endDate: endDate ? endDate.toISOString() : null,
        autoConfirm,
      }),
    onSuccess: () => {
      setOpened(false);
      invalidate();
      toast.success('Recorrência criada');
    },
    onError: handleError,
  });

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

  const openNew = () => {
    setType('EXPENSE');
    setAccountId(accounts[0]?.id ?? accounts[0]?.key ?? '');
    setCategoryId('');
    setDescription('');
    setAmount('');
    setFrequency('MONTHLY');
    setIntervalValue('1');
    setStartDate(new Date());
    setEndDate(undefined);
    setAutoConfirm(false);
    setOpened(true);
  };

  const catOptions = categories.filter((c) => c.kind === type);
  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Recorrências</h1>
        <Button onClick={openNew}>
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
          {items.map((r) => (
            <RecurringCard
              key={r.id}
              item={r}
              hidden={hidden}
              onToggle={(isActive) => toggle.mutate({ id: r.id, isActive })}
              onRemove={() => remove.mutate(r.id)}
            />
          ))}
        </div>
      )}

      <Dialog open={opened} onOpenChange={(o) => !o && setOpened(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova recorrência</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!activeId) return;
              if (!accountId) return toast.error('Escolha a conta');
              if (!description.trim()) return toast.error('Informe a descrição');
              if (!amount.trim()) return toast.error('Informe o valor');
              create.mutate();
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={type} onValueChange={(v) => { setType(v as 'INCOME' | 'EXPENSE'); setCategoryId(''); }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EXPENSE">Despesa</SelectItem>
                    <SelectItem value="INCOME">Receita</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rec-amount">Valor</Label>
                <CurrencyInput
                  id="rec-amount"
                  placeholder="0,00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rec-desc">Descrição</Label>
              <Input
                id="rec-desc"
                placeholder="Ex.: Netflix, Aluguel, Salário"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
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
                  {catOptions.map((c) => (
                    <SelectItem key={c.key} value={c.id ?? c.key}>
                      {c.icon ? `${c.icon} ` : ''}
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Frequência</Label>
                <Select value={frequency} onValueChange={(v) => setFrequency(v as RecurrenceFrequency)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FREQ_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rec-interval">A cada</Label>
                <Input
                  id="rec-interval"
                  type="number"
                  min={1}
                  value={interval}
                  onChange={(e) => setIntervalValue(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Início</Label>
                <DatePicker value={startDate} onChange={(d) => d && setStartDate(d)} />
              </div>
              <div className="space-y-1.5">
                <Label>Fim (opcional)</Label>
                <DatePicker value={endDate} onChange={(d) => setEndDate(d ?? undefined)} />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="rec-auto">Efetivar automaticamente na data</Label>
              <Switch id="rec-auto" checked={autoConfirm} onCheckedChange={setAutoConfirm} />
            </div>

            <Button type="submit" className="w-full" disabled={create.isPending}>
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar
            </Button>
          </form>
        </DialogContent>
      </Dialog>
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
