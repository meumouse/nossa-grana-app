import { useMemo, useState } from 'react';
import { Plus, ArrowUpRight, ArrowDownRight, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/workspace/WorkspaceProvider';
import { useLiveAccounts, useLiveCategories, useLiveTransactions, useBalances } from '@/hooks/useLiveData';
import { usePrivacy } from '@/ui/PrivacyProvider';
import { TransactionFormModal } from '@/components/TransactionFormModal';
import { formatDate, formatMoney, formatMoneyCents, toCents } from '@/lib/format';

function StatCard({ label, value, className, icon }: { label: string; value: string; className?: string; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
          {icon}
        </div>
        <p className={cn('mt-1 text-xl font-extrabold', className)}>{value}</p>
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const { activeId, active } = useWorkspace();
  const accounts = useLiveAccounts(activeId) ?? [];
  const categories = useLiveCategories(activeId) ?? [];
  const balances = useBalances(activeId);
  const txs = useLiveTransactions(activeId) ?? [];
  const { hidden } = usePrivacy();
  const [opened, setOpened] = useState(false);

  const stats = useMemo(() => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const today = now.toISOString().slice(0, 10);

    let totalCents = 0;
    for (const a of accounts) if (a.includeInTotal) totalCents += balances.get(a.key) ?? 0;

    let incomeCents = 0;
    let expenseCents = 0;
    let overdueCount = 0;
    let overdueCents = 0;
    for (const t of txs) {
      if (t.deletedAt) continue;
      if (t.status === 'COMPLETED' && t.date.startsWith(ym)) {
        if (t.type === 'INCOME') incomeCents += toCents(t.amount);
        else if (t.type === 'EXPENSE') expenseCents += toCents(t.amount);
      }
      if (t.status === 'PENDING' && t.dueDate && t.dueDate < today) {
        overdueCount += 1;
        overdueCents += toCents(t.amount);
      }
    }
    return { totalCents, incomeCents, expenseCents, overdueCount, overdueCents };
  }, [accounts, balances, txs]);

  const recent = txs.slice(0, 6);
  const accMap = useMemo(() => new Map(accounts.map((a) => [a.key, a.name])), [accounts]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Olá 👋</h1>
          <p className="text-sm text-muted-foreground">{active?.name ?? 'Workspace'}</p>
        </div>
        <Button onClick={() => setOpened(true)}>
          <Plus className="h-4 w-4" />
          Lançar
        </Button>
      </div>

      <Card className="bg-primary text-primary-foreground">
        <CardContent className="p-6">
          <p className="text-sm opacity-85">Saldo consolidado</p>
          <p className="text-3xl font-extrabold">{formatMoneyCents(stats.totalCents, hidden)}</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          label="Receitas do mês"
          value={formatMoneyCents(stats.incomeCents, hidden)}
          className="text-success"
          icon={<ArrowUpRight className="h-4 w-4 text-success" />}
        />
        <StatCard
          label="Despesas do mês"
          value={formatMoneyCents(stats.expenseCents, hidden)}
          className="text-destructive"
          icon={<ArrowDownRight className="h-4 w-4 text-destructive" />}
        />
        <StatCard
          label="Vencidas"
          value={`${stats.overdueCount} · ${formatMoneyCents(stats.overdueCents, hidden)}`}
          className={stats.overdueCount > 0 ? 'text-warning' : undefined}
          icon={<AlertTriangle className="h-4 w-4 text-warning" />}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Últimos lançamentos</CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nada por aqui ainda.</p>
          ) : (
            <div className="space-y-2">
              {recent.map((t) => {
                const income = t.type === 'INCOME';
                return (
                  <div key={t.key} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{t.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(t.date)} · {accMap.get(t.accountId) ?? '—'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {t.status === 'PENDING' && <Badge variant="warning">pendente</Badge>}
                      <span className={cn('whitespace-nowrap font-bold', income ? 'text-success' : 'text-destructive')}>
                        {income ? '+' : '−'}
                        {formatMoney(Math.abs(Number(t.amount)), hidden)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {activeId && (
        <TransactionFormModal
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
