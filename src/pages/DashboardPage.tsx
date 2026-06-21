import { useMemo, useState } from 'react';
import {
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/workspace/WorkspaceProvider';
import { useLiveAccounts, useLiveCards, useLiveCategories, useLiveTransactions, useBalances } from '@/hooks/useLiveData';
import { useAuth } from '@/auth/AuthProvider';
import { usePrivacy } from '@/ui/PrivacyProvider';
import { TransactionFormModal } from '@/components/TransactionFormModal';
import { formatDate, formatMoney, formatMoneyCents, fromCents, toCents } from '@/lib/format';

const CHART_FALLBACK = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

function StatCard({
  label,
  value,
  icon,
  badge,
  valueClassName,
  highlight,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  badge?: { text: string; tone: 'success' | 'destructive' | 'muted' };
  valueClassName?: string;
  highlight?: boolean;
}) {
  return (
    <Card
      className={cn(
        highlight && 'border-transparent bg-gradient-to-br from-primary to-primary/75 text-primary-foreground shadow-md',
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span
            className={cn(
              'text-xs font-semibold uppercase tracking-wide',
              highlight ? 'text-primary-foreground/80' : 'text-muted-foreground',
            )}
          >
            {label}
          </span>
          <span
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full',
              highlight ? 'bg-primary-foreground/15' : 'bg-muted',
            )}
          >
            {icon}
          </span>
        </div>
        <p className={cn('mt-2 text-2xl font-extrabold tracking-tight', valueClassName)}>{value}</p>
        {badge && (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs">
            <Badge
              variant={highlight ? 'secondary' : badge.tone}
              className={cn(highlight && 'bg-primary-foreground/15 text-primary-foreground')}
            >
              {badge.text}
            </Badge>
            <span className={cn(highlight ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
              este mês
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const { activeId, active } = useWorkspace();
  const { user } = useAuth();
  const accounts = useLiveAccounts(activeId) ?? [];
  const cards = useLiveCards(activeId) ?? [];
  const categories = useLiveCategories(activeId) ?? [];
  const balances = useBalances(activeId);
  const txs = useLiveTransactions(activeId) ?? [];
  const { hidden } = usePrivacy();
  const [opened, setOpened] = useState(false);

  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const stats = useMemo(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, balances, txs, ym]);

  // Série dos últimos 6 meses (receitas vs despesas) para o gráfico.
  const series = useMemo(() => {
    const map = new Map<string, { receitas: number; despesas: number }>();
    const order: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      order.push(key);
      map.set(key, { receitas: 0, despesas: 0 });
    }
    for (const t of txs) {
      if (t.deletedAt || t.status !== 'COMPLETED') continue;
      const key = t.date.slice(0, 7);
      const row = map.get(key);
      if (!row) continue;
      if (t.type === 'INCOME') row.receitas += toCents(t.amount);
      else if (t.type === 'EXPENSE') row.despesas += toCents(t.amount);
    }
    return order.map((key) => {
      const [y, m] = key.split('-');
      const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('pt-BR', { month: 'short' });
      const row = map.get(key)!;
      return { label, receitas: fromCents(row.receitas), despesas: fromCents(row.despesas) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs]);

  // Gastos do mês por categoria (donut).
  const spending = useMemo(() => {
    const catMap = new Map(categories.map((c) => [c.key, c]));
    const byCat = new Map<string, number>();
    let totalCents = 0;
    for (const t of txs) {
      if (t.deletedAt || t.status !== 'COMPLETED' || t.type !== 'EXPENSE') continue;
      if (!t.date.startsWith(ym)) continue;
      const k = t.categoryId ?? '__none__';
      byCat.set(k, (byCat.get(k) ?? 0) + toCents(t.amount));
      totalCents += toCents(t.amount);
    }
    const rows = [...byCat.entries()]
      .map(([k, cents]) => {
        const cat = k === '__none__' ? undefined : catMap.get(k);
        return { name: cat?.name ?? 'Sem categoria', color: cat?.color ?? null, cents };
      })
      .sort((a, b) => b.cents - a.cents);

    const top = rows.slice(0, 5);
    const restCents = rows.slice(5).reduce((s, r) => s + r.cents, 0);
    if (restCents > 0) top.push({ name: 'Outros', color: null, cents: restCents });

    const data = top.map((r, i) => ({
      name: r.name,
      value: fromCents(r.cents),
      cents: r.cents,
      color: r.color ?? CHART_FALLBACK[i % CHART_FALLBACK.length],
    }));
    return { data, totalCents };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs, categories, ym]);

  const netCents = stats.incomeCents - stats.expenseCents;
  const expenseShare = stats.incomeCents > 0 ? Math.round((stats.expenseCents / stats.incomeCents) * 100) : 0;

  const recent = txs.slice(0, 6);
  const accMap = useMemo(
    () =>
      new Map<string, string>([
        ...accounts.map((a) => [a.key, a.name] as [string, string]),
        ...cards.map((c) => [c.key, c.name] as [string, string]),
      ]),
    [accounts, cards],
  );
  const topAccounts = useMemo(
    () =>
      [...accounts]
        .map((a) => ({ a, bal: balances.get(a.key) ?? 0 }))
        .sort((x, y) => y.bal - x.bal)
        .slice(0, 4),
    [accounts, balances],
  );

  const moneyAxis = (v: number) =>
    hidden ? '••' : new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(v);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Olá, {user?.name?.split(' ')[0] ?? 'tudo bem'} 👋
          </h1>
          <p className="text-sm text-muted-foreground">
            Aqui está o resumo de {active?.name ?? 'suas finanças'}.
          </p>
        </div>
        <Button onClick={() => setOpened(true)}>
          <Plus className="h-4 w-4" />
          Lançar
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          highlight
          label="Saldo consolidado"
          value={formatMoneyCents(stats.totalCents, hidden)}
          icon={<Wallet className="h-4 w-4" />}
          badge={{
            text: `${netCents >= 0 ? '+' : '−'}${formatMoneyCents(Math.abs(netCents), hidden)}`,
            tone: 'muted',
          }}
        />
        <StatCard
          label="Receitas do mês"
          value={formatMoneyCents(stats.incomeCents, hidden)}
          valueClassName="text-success"
          icon={<ArrowUpRight className="h-4 w-4 text-success" />}
          badge={{ text: 'entradas', tone: 'success' }}
        />
        <StatCard
          label="Despesas do mês"
          value={formatMoneyCents(stats.expenseCents, hidden)}
          valueClassName="text-destructive"
          icon={<ArrowDownRight className="h-4 w-4 text-destructive" />}
          badge={{
            text: stats.incomeCents > 0 ? `${expenseShare}% das receitas` : 'saídas',
            tone: 'destructive',
          }}
        />
      </div>

      {/* Gráfico + donut */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">Visão do orçamento</CardTitle>
            <Badge variant="muted">Últimos 6 meses</Badge>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                <defs>
                  <linearGradient id="gReceitas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gDespesas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke="hsl(var(--muted-foreground))"
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  tickFormatter={moneyAxis}
                />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 'var(--radius)',
                    color: 'hsl(var(--popover-foreground))',
                    fontSize: 12,
                  }}
                  formatter={(value: number, name) => [formatMoney(value, hidden), name === 'receitas' ? 'Receitas' : 'Despesas']}
                  labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                />
                <Area type="monotone" dataKey="receitas" stroke="hsl(var(--chart-1))" strokeWidth={2} fill="url(#gReceitas)" />
                <Area type="monotone" dataKey="despesas" stroke="hsl(var(--chart-2))" strokeWidth={2} fill="url(#gDespesas)" />
              </AreaChart>
            </ResponsiveContainer>
            <div className="mt-2 flex items-center justify-center gap-6 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-chart-1" /> Receitas
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-chart-2" /> Despesas
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Gastos por categoria</CardTitle>
          </CardHeader>
          <CardContent>
            {spending.data.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Sem despesas neste mês.</p>
            ) : (
              <>
                <div className="relative mx-auto h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={spending.data}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={58}
                        outerRadius={84}
                        paddingAngle={2}
                        strokeWidth={0}
                      >
                        {spending.data.map((d, i) => (
                          <Cell key={i} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: 'var(--radius)',
                          color: 'hsl(var(--popover-foreground))',
                          fontSize: 12,
                        }}
                        formatter={(value: number, name) => [formatMoney(value, hidden), name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[11px] uppercase text-muted-foreground">Gasto</span>
                    <span className="text-lg font-bold">{formatMoneyCents(spending.totalCents, hidden)}</span>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {spending.data.map((d, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
                        <span className="truncate text-muted-foreground">{d.name}</span>
                      </span>
                      <span className="font-medium">{formatMoneyCents(d.cents, hidden)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Atividade + contas */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Últimos lançamentos</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nada por aqui ainda.</p>
            ) : (
              <div className="divide-y divide-border">
                {recent.map((t) => {
                  const income = t.type === 'INCOME';
                  return (
                    <div key={t.key} className="flex items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                            income ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive',
                          )}
                        >
                          {income ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{t.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(t.date)} · {accMap.get(t.accountId ?? t.creditCardId ?? '') ?? '—'}
                          </p>
                        </div>
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Minhas contas</CardTitle>
          </CardHeader>
          <CardContent>
            {topAccounts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma conta cadastrada.</p>
            ) : (
              <div className="space-y-3">
                {topAccounts.map(({ a, bal }) => (
                  <div key={a.key} className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <TrendingUp className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{a.name}</p>
                        <p className="text-xs text-muted-foreground">{a.type}</p>
                      </div>
                    </div>
                    <span className={cn('whitespace-nowrap font-semibold', bal < 0 && 'text-destructive')}>
                      {formatMoneyCents(bal, hidden)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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
