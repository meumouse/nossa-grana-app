import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Landmark, Loader2, Receipt, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { useWorkspace } from '@/workspace/WorkspaceProvider';
import { useLiveAccounts, useLiveCards } from '@/hooks/useLiveData';
import { usePrivacy } from '@/ui/PrivacyProvider';
import { analyticsApi, invoiceApi } from '@/api/endpoints';
import { ApiError, OfflineError } from '@/api/client';
import { formatDate, formatMoney } from '@/lib/format';
import type { CreditCardInvoice, InvoiceStatus } from '@/api/types';

type BadgeInfo = { label: string; variant: 'muted' | 'warning' | 'success' | 'destructive' };

const STATUS: Record<InvoiceStatus, BadgeInfo> = {
  OPEN: { label: 'Aberta', variant: 'muted' },
  CLOSED: { label: 'Fechada', variant: 'warning' },
  PAID: { label: 'Paga', variant: 'success' },
  OVERDUE: { label: 'Vencida', variant: 'destructive' },
};

const PROJECTED: BadgeInfo = { label: 'Prevista', variant: 'muted' };

/** Fatura cujo ciclo ainda não fechou — é uma previsão (ex.: parcelas futuras). */
function isProjected(inv: Pick<CreditCardInvoice, 'closingDate'>): boolean {
  return new Date(inv.closingDate).getTime() > Date.now();
}

function handleError(err: unknown) {
  toast.error(
    err instanceof OfflineError
      ? 'Sem conexão — faturas precisam do servidor'
      : err instanceof ApiError
        ? err.message
        : 'Erro inesperado',
  );
}

export function InvoicesPage() {
  const { activeId } = useWorkspace();
  const { hidden } = usePrivacy();
  const qc = useQueryClient();
  const accounts = useLiveAccounts(activeId) ?? [];
  const cards = useLiveCards(activeId) ?? [];
  const cardName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cards) m.set(c.id ?? c.key, c.name);
    return m;
  }, [cards]);
  // qualquer conta pode pagar a fatura (cartões não são contas)
  const payAccounts = accounts;

  const [detailId, setDetailId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAccountId, setPayAccountId] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['invoices', activeId],
    queryFn: () => invoiceApi.list(activeId!),
    enabled: !!activeId,
  });

  // Previsão de parcelas vinculadas a conta/banco (sem conceito de fatura).
  const { data: acctData } = useQuery({
    queryKey: ['installment-forecast', activeId],
    queryFn: () => analyticsApi.installmentForecast(activeId!),
    enabled: !!activeId,
  });
  const accountForecasts = acctData?.accounts ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ['invoices', activeId] });

  const pay = useMutation({
    mutationFn: () =>
      invoiceApi.pay(activeId!, payingId!, payAccountId ? { paymentAccountId: payAccountId } : {}),
    onSuccess: () => {
      setPayingId(null);
      invalidate();
      toast.success('Fatura paga');
    },
    onError: handleError,
  });

  const invoices = data?.invoices ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Faturas de cartão</h1>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : isError ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Não foi possível carregar as faturas.
        </p>
      ) : invoices.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nenhuma fatura. Elas são geradas a partir das compras no cartão.
        </p>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv) => {
            const projected = isProjected(inv);
            const st = projected ? PROJECTED : STATUS[inv.status];
            return (
              <Card
                key={inv.id}
                className="flex cursor-pointer items-center justify-between gap-2 p-3 hover:bg-accent/40"
                onClick={() => setDetailId(inv.id)}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <p className="truncate font-medium">{cardName.get(inv.creditCardId) ?? 'Cartão'}</p>
                    <Badge variant={st.variant}>{st.label}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Fecha {formatDate(inv.closingDate)} · vence {formatDate(inv.dueDate)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="whitespace-nowrap font-bold">{formatMoney(inv.total, hidden)}</span>
                  {inv.status !== 'PAID' && Number(inv.total) > 0 && !projected && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPayAccountId('');
                        setPayingId(inv.id);
                      }}
                    >
                      <Wallet className="h-4 w-4" />
                      Pagar
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {accountForecasts.length > 0 && (
        <div className="space-y-2 pt-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Parcelas a vencer por conta</h2>
          {accountForecasts.map((f) => (
            <Card
              key={`${f.accountId}-${f.month}`}
              className="flex items-center justify-between gap-2 p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Landmark className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="truncate font-medium">{f.accountName}</p>
                  <Badge variant="muted">Prevista</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Vence {formatDate(f.dueDate)} · {f.count} parcela{f.count > 1 ? 's' : ''}
                </p>
              </div>
              <span className="whitespace-nowrap font-bold">{formatMoney(f.total, hidden)}</span>
            </Card>
          ))}
        </div>
      )}

      {/* Pagar fatura */}
      <Dialog open={!!payingId} onOpenChange={(o) => !o && setPayingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pagar fatura</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Conta de pagamento</Label>
            <Select value={payAccountId || 'default'} onValueChange={(v) => setPayAccountId(v === 'default' ? '' : v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Conta padrão do cartão</SelectItem>
                {payAccounts.map((a) => (
                  <SelectItem key={a.key} value={a.id ?? a.key}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              O pagamento é registrado como transferência da conta escolhida para o cartão.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => pay.mutate()} disabled={pay.isPending} className="w-full">
              {pay.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InvoiceDetail wsId={activeId} invoiceId={detailId} hidden={hidden} onClose={() => setDetailId(null)} />
    </div>
  );
}

function InvoiceDetail({
  wsId,
  invoiceId,
  hidden,
  onClose,
}: {
  wsId: string | null;
  invoiceId: string | null;
  hidden: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['invoice', wsId, invoiceId],
    queryFn: () => invoiceApi.get(wsId!, invoiceId!),
    enabled: !!wsId && !!invoiceId,
  });
  const inv: CreditCardInvoice | undefined = data?.invoice;

  return (
    <Dialog open={!!invoiceId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{inv?.creditCard?.name ?? 'Fatura'}</DialogTitle>
        </DialogHeader>
        {isLoading || !inv ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Fecha {formatDate(inv.closingDate)} · vence {formatDate(inv.dueDate)}
              </span>
              <span className="font-bold text-foreground">{formatMoney(inv.total, hidden)}</span>
            </div>
            <div className="space-y-1">
              {(inv.transactions ?? []).length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Sem lançamentos nesta fatura.</p>
              ) : (
                (inv.transactions ?? []).map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate">{t.description}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(t.date)}</p>
                    </div>
                    <span className="font-medium">{formatMoney(t.amount, hidden)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
