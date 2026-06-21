import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { recurringApi } from '@/api/endpoints';
import { ApiError, OfflineError } from '@/api/client';
import type { LocalAccount, LocalCategory } from '@/db/dexie';
import type { RecurrenceFrequency } from '@/api/types';

export const FREQ_LABELS: Record<RecurrenceFrequency, string> = {
  DAILY: 'Diária',
  WEEKLY: 'Semanal',
  MONTHLY: 'Mensal',
  YEARLY: 'Anual',
};

/** Pré-preenchimento opcional do form (criação a partir do extrato / sugestão). */
export interface RecurringInitial {
  type?: 'INCOME' | 'EXPENSE';
  /** Valor compatível com o Select de conta (id do servidor, ou key local). */
  accountId?: string | null;
  categoryId?: string | null;
  description?: string;
  amount?: number | string;
  frequency?: RecurrenceFrequency;
  interval?: number;
  anchorDay?: number | null;
  startDate?: Date;
  endDate?: Date | null;
}

interface Props {
  opened: boolean;
  onClose: () => void;
  workspaceId: string;
  accounts: LocalAccount[];
  categories: LocalCategory[];
  /** Pré-preenchimento; ausente = recorrência nova em branco. */
  initial?: RecurringInitial | null;
  /** Transações existentes da série, vinculadas ao criar (sem duplicar valores). */
  linkTransactionIds?: string[];
  /** Título do diálogo (default "Nova recorrência"). */
  title?: string;
  /** Chamado após criar com sucesso (além de fechar e dar toast). */
  onCreated?: () => void;
}

function handleError(err: unknown) {
  toast.error(
    err instanceof OfflineError
      ? 'Sem conexão — recorrências precisam do servidor'
      : err instanceof ApiError
        ? err.message
        : 'Erro inesperado',
  );
}

const amountToString = (v: number | string | undefined): string => {
  if (v == null || v === '') return '';
  return typeof v === 'number' ? String(v).replace('.', ',') : v;
};

export function RecurringFormModal({
  opened,
  onClose,
  workspaceId,
  accounts,
  categories,
  initial,
  linkTransactionIds,
  title = 'Nova recorrência',
  onCreated,
}: Props) {
  const qc = useQueryClient();
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
  // anchorDay não é editável na UI; vem do pré-preenchimento (extrato/sugestão).
  const [anchorDay, setAnchorDay] = useState<number | null>(null);

  // Reseta o form ao abrir, aplicando o pré-preenchimento quando houver.
  useEffect(() => {
    if (!opened) return;
    setType(initial?.type ?? 'EXPENSE');
    setAccountId(initial?.accountId ?? accounts[0]?.id ?? accounts[0]?.key ?? '');
    setCategoryId(initial?.categoryId ?? '');
    setDescription(initial?.description ?? '');
    setAmount(amountToString(initial?.amount));
    setFrequency(initial?.frequency ?? 'MONTHLY');
    setIntervalValue(String(initial?.interval ?? 1));
    setStartDate(initial?.startDate ?? new Date());
    setEndDate(initial?.endDate ?? undefined);
    setAnchorDay(initial?.anchorDay ?? null);
    setAutoConfirm(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const create = useMutation({
    mutationFn: () =>
      recurringApi.create(workspaceId, {
        accountId,
        type,
        amount: Number(amount.replace(',', '.')) || 0,
        description: description.trim(),
        categoryId: categoryId || null,
        frequency,
        interval: Number(interval) || 1,
        anchorDay: anchorDay ?? undefined,
        startDate: startDate.toISOString(),
        endDate: endDate ? endDate.toISOString() : null,
        autoConfirm,
        linkTransactionIds: linkTransactionIds?.length ? linkTransactionIds : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring', workspaceId] });
      qc.invalidateQueries({ queryKey: ['recurring-suggestions', workspaceId] });
      toast.success('Recorrência criada');
      onCreated?.();
      onClose();
    },
    onError: handleError,
  });

  const catOptions = categories.filter((c) => c.kind === type);

  return (
    <Dialog open={opened} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
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
              <Select
                value={type}
                onValueChange={(v) => {
                  setType(v as 'INCOME' | 'EXPENSE');
                  setCategoryId('');
                }}
              >
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
  );
}
