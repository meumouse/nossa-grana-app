import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { useWorkspace } from '@/workspace/WorkspaceProvider';
import { useLiveCategories } from '@/hooks/useLiveData';
import { usePrivacy } from '@/ui/PrivacyProvider';
import { budgetApi } from '@/api/endpoints';
import { ApiError, OfflineError } from '@/api/client';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import type { BudgetView } from '@/api/types';

const GLOBAL = '__global__'; // categoria "Geral" (orçamento sem categoria)

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function monthLabel(d: Date): string {
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function handleError(err: unknown) {
  toast.error(
    err instanceof OfflineError
      ? 'Sem conexão — orçamentos precisam do servidor'
      : err instanceof ApiError
        ? err.message
        : 'Erro inesperado',
  );
}

export function BudgetsPage() {
  const { activeId } = useWorkspace();
  const { hidden } = usePrivacy();
  const qc = useQueryClient();
  const categories = useLiveCategories(activeId) ?? [];
  const expenseCats = categories.filter((c) => c.kind === 'EXPENSE');

  const [cursor, setCursor] = useState(() => new Date());
  const month = monthKey(cursor);

  const [opened, setOpened] = useState(false);
  const [categoryId, setCategoryId] = useState<string>(GLOBAL);
  const [amount, setAmount] = useState('');
  const [rollover, setRollover] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['budgets', activeId, month],
    queryFn: () => budgetApi.list(activeId!, month),
    enabled: !!activeId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['budgets', activeId, month] });

  const upsert = useMutation({
    mutationFn: () =>
      budgetApi.upsert(activeId!, {
        categoryId: categoryId === GLOBAL ? null : categoryId,
        month,
        amount: Number(amount.replace(',', '.')) || 0,
        rollover,
      }),
    onSuccess: () => {
      setOpened(false);
      invalidate();
      toast.success('Orçamento salvo');
    },
    onError: handleError,
  });

  const remove = useMutation({
    mutationFn: (id: string) => budgetApi.remove(activeId!, id),
    onSuccess: () => {
      invalidate();
      toast('Orçamento removido');
    },
    onError: handleError,
  });

  const openNew = () => {
    setCategoryId(GLOBAL);
    setAmount('');
    setRollover(false);
    setOpened(true);
  };

  const shiftMonth = (delta: number) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));

  const budgets = data?.budgets ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Orçamentos</h1>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          Novo orçamento
        </Button>
      </div>

      <div className="flex items-center justify-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => shiftMonth(-1)} aria-label="Mês anterior">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <span className="min-w-[140px] text-center font-medium capitalize">{monthLabel(cursor)}</span>
        <Button variant="ghost" size="icon" onClick={() => shiftMonth(1)} aria-label="Próximo mês">
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : isError ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Não foi possível carregar os orçamentos.
        </p>
      ) : budgets.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nenhum orçamento neste mês. Crie o primeiro.
        </p>
      ) : (
        <div className="space-y-2">
          {budgets.map((b) => (
            <BudgetCard key={b.id} budget={b} hidden={hidden} onRemove={() => remove.mutate(b.id)} />
          ))}
        </div>
      )}

      <Dialog open={opened} onOpenChange={(o) => !o && setOpened(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo orçamento</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!activeId) return;
              if (!amount.trim()) return toast.error('Informe o valor');
              upsert.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GLOBAL}>Geral (todas as despesas)</SelectItem>
                  {expenseCats.map((c) => (
                    <SelectItem key={c.key} value={c.id ?? c.key}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bud-amount">Valor orçado (mês)</Label>
              <CurrencyInput
                id="bud-amount"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="bud-rollover">Acumular sobra para o próximo mês</Label>
              <Switch id="bud-rollover" checked={rollover} onCheckedChange={setRollover} />
            </div>
            <Button type="submit" className="w-full" disabled={upsert.isPending}>
              {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BudgetCard({
  budget,
  hidden,
  onRemove,
}: {
  budget: BudgetView;
  hidden: boolean;
  onRemove: () => void;
}) {
  const pct = Math.min(100, Math.round(budget.progress * 100));
  const over = budget.progress > 1;
  const name = budget.category?.name ?? 'Geral';
  return (
    <Card className="space-y-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">{name}</p>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {formatMoney(budget.spent, hidden)} / {formatMoney(budget.amount, hidden)}
          </span>
          <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Remover">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', over ? 'bg-destructive' : 'bg-primary')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={cn('text-xs', over ? 'text-destructive' : 'text-muted-foreground')}>
        {over
          ? `Excedido em ${formatMoney(Math.abs(Number(budget.remaining)), hidden)}`
          : `Restam ${formatMoney(budget.remaining, hidden)}`}
      </p>
    </Card>
  );
}
