import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/sonner';
import { useWorkspace } from '@/workspace/WorkspaceProvider';
import { useLiveTransactions } from '@/hooks/useLiveData';
import { usePrivacy } from '@/ui/PrivacyProvider';
import { useSync } from '@/sync/SyncProvider';
import { payTransactionLocal } from '@/sync/mutations';
import { formatDate, formatMoney } from '@/lib/format';
import type { LocalTransaction } from '@/db/dexie';

type Kind = 'payable' | 'receivable';

export function PayablesPage() {
  const { activeId } = useWorkspace();
  const { hidden } = usePrivacy();
  const { syncNow } = useSync();
  const [kind, setKind] = useState<Kind>('payable');
  const pending = useLiveTransactions(activeId, { status: 'PENDING' }) ?? [];
  const today = new Date().toISOString().slice(0, 10);

  const items = useMemo(() => {
    const wanted = kind === 'payable' ? 'EXPENSE' : 'INCOME';
    return pending.filter((t) => t.type === wanted && t.dueDate).sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1));
  }, [pending, kind]);

  const pay = async (t: LocalTransaction) => {
    await payTransactionLocal(t.key);
    void syncNow();
    toast.success(kind === 'payable' ? 'Conta paga' : 'Recebimento confirmado');
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">A pagar / receber</h1>

      <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
        <TabsList>
          <TabsTrigger value="payable">A pagar</TabsTrigger>
          <TabsTrigger value="receivable">A receber</TabsTrigger>
        </TabsList>
      </Tabs>

      {items.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nada {kind === 'payable' ? 'a pagar' : 'a receber'} no momento.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((t) => {
            const overdue = !!t.dueDate && t.dueDate < today;
            return (
              <Card key={t.key} className="flex items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.description}</p>
                  <div className="flex items-center gap-2">
                    <span className={overdue ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                      Vence {t.dueDate ? formatDate(t.dueDate) : '—'}
                    </span>
                    {overdue && <Badge variant="destructive">vencida</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="whitespace-nowrap font-bold">{formatMoney(Number(t.amount), hidden)}</span>
                  <Button size="sm" variant="secondary" onClick={() => void pay(t)}>
                    <Check className="h-4 w-4" />
                    {kind === 'payable' ? 'Pagar' : 'Receber'}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
