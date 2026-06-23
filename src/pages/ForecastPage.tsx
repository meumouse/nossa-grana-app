import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useWorkspace } from '@/workspace/WorkspaceProvider';
import { analyticsApi } from '@/api/endpoints';
import { usePrivacy } from '@/ui/PrivacyProvider';
import { cn } from '@/lib/utils';
import { formatMoney, formatMonth } from '@/lib/format';

export function ForecastPage() {
  const { activeId } = useWorkspace();
  const { hidden } = usePrivacy();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['forecast', activeId],
    queryFn: () => analyticsApi.forecast(activeId!),
    enabled: !!activeId,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Previsão</h1>
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Não foi possível carregar a previsão. Ela precisa de conexão com o servidor.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const chartData = data.months.map((m) => ({
    month: formatMonth(m.month),
    saldo: Number(Number(m.projectedBalance).toFixed(2)),
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Previsão de saldo</h1>

      {data.firstNegativeMonth && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Atenção: o saldo projetado fica negativo em <b>{formatMonth(data.firstNegativeMonth)}</b>.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">Próximos {data.horizon} meses</CardTitle>
          <span className="text-xs text-muted-foreground">
            Média de variáveis: {formatMoney(data.avgVariableMonthly, hidden)}/mês
          </span>
        </CardHeader>
        <CardContent>
          {hidden ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Valores ocultos (modo privacidade)</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke="hsl(var(--muted-foreground))"
                  width={70}
                  tickFormatter={(v) => formatMoney(v)}
                />
                <Tooltip
                  formatter={(v: number) => formatMoney(v)}
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    color: 'hsl(var(--popover-foreground))',
                  }}
                />
                <Line type="monotone" dataKey="saldo" stroke="hsl(var(--primary))" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table className="whitespace-nowrap">
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead className="text-right">Receitas</TableHead>
                <TableHead className="text-right">Despesas</TableHead>
                <TableHead className="text-right">Estim. var.</TableHead>
                <TableHead className="text-right">Saldo proj.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.months.map((m) => (
                <TableRow key={m.month}>
                  <TableCell>{formatMonth(m.month)}</TableCell>
                  <TableCell className="text-right text-success">{formatMoney(m.knownIncome, hidden)}</TableCell>
                  <TableCell className="text-right text-destructive">{formatMoney(m.knownExpense, hidden)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatMoney(m.estimatedVariable, hidden)}
                  </TableCell>
                  <TableCell className={cn('text-right font-bold', m.negative && 'text-destructive')}>
                    {formatMoney(m.projectedBalance, hidden)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
