import { useMemo, useState } from 'react';
import { Plus, MoreVertical, Pencil, Trash2, Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/workspace/WorkspaceProvider';
import { useLiveAccounts, useLiveCategories, useLiveTransactions } from '@/hooks/useLiveData';
import { usePrivacy } from '@/ui/PrivacyProvider';
import { useSync } from '@/sync/SyncProvider';
import { deleteTransactionLocal, payTransactionLocal } from '@/sync/mutations';
import { TransactionFormModal } from '@/components/TransactionFormModal';
import { ImportAiModal } from '@/components/ImportAiModal';
import { formatDate, formatMoney } from '@/lib/format';
import type { LocalTransaction } from '@/db/dexie';

type StatusFilter = 'ALL' | 'COMPLETED' | 'PENDING';

export function TransactionsPage() {
  const { activeId } = useWorkspace();
  const accounts = useLiveAccounts(activeId) ?? [];
  const categories = useLiveCategories(activeId) ?? [];
  const { hidden } = usePrivacy();
  const { syncNow } = useSync();
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const txs = useLiveTransactions(activeId, filter === 'ALL' ? {} : { status: filter }) ?? [];

  const [opened, setOpened] = useState(false);
  const [importOpened, setImportOpened] = useState(false);
  const [editing, setEditing] = useState<LocalTransaction | null>(null);

  const accMap = useMemo(() => new Map(accounts.map((a) => [a.key, a.name])), [accounts]);
  const catMap = useMemo(() => new Map(categories.map((c) => [c.key, c])), [categories]);

  const openNew = () => {
    setEditing(null);
    setOpened(true);
  };
  const openEdit = (t: LocalTransaction) => {
    setEditing(t);
    setOpened(true);
  };

  const remove = async (t: LocalTransaction) => {
    await deleteTransactionLocal(t.key);
    void syncNow();
    toast('Lançamento excluído');
  };

  const pay = async (t: LocalTransaction) => {
    await payTransactionLocal(t.key);
    void syncNow();
    toast.success('Lançamento efetivado');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Lançamentos</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpened(true)}>
            <Sparkles className="h-4 w-4" />
            Importar com IA
          </Button>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" />
            Novo
          </Button>
        </div>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
        <TabsList>
          <TabsTrigger value="ALL">Todos</TabsTrigger>
          <TabsTrigger value="COMPLETED">Efetivados</TabsTrigger>
          <TabsTrigger value="PENDING">Pendentes</TabsTrigger>
        </TabsList>
      </Tabs>

      {txs.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Nenhum lançamento ainda. Toque em “Novo”.</p>
      ) : (
        <div className="space-y-2">
          {txs.map((t) => {
            const cat = t.categoryId ? catMap.get(t.categoryId) : null;
            const income = t.type === 'INCOME';
            const transfer = t.type === 'TRANSFER';
            return (
              <Card key={t.key} className="flex items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium">
                      {cat?.icon ? `${cat.icon} ` : ''}
                      {t.description}
                    </span>
                    {t.status === 'PENDING' && <Badge variant="warning">pendente</Badge>}
                    {!t.id && <Badge variant="muted">na fila</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(t.date)} · {accMap.get(t.accountId) ?? '—'}
                    {cat ? ` · ${cat.name}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <span
                    className={cn(
                      'whitespace-nowrap font-bold',
                      transfer ? 'text-muted-foreground' : income ? 'text-success' : 'text-destructive',
                    )}
                  >
                    {income ? '+' : transfer ? '' : '−'}
                    {formatMoney(Math.abs(Number(t.amount)), hidden)}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Ações">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {t.status === 'PENDING' && (
                        <DropdownMenuItem onClick={() => void pay(t)}>
                          <Check className="h-4 w-4" />
                          Efetivar
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => openEdit(t)}>
                        <Pencil className="h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => void remove(t)}>
                        <Trash2 className="h-4 w-4" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {activeId && (
        <>
          <TransactionFormModal
            opened={opened}
            onClose={() => setOpened(false)}
            workspaceId={activeId}
            accounts={accounts}
            categories={categories}
            editing={editing}
          />
          <ImportAiModal
            opened={importOpened}
            onClose={() => setImportOpened(false)}
            workspaceId={activeId}
          />
        </>
      )}
    </div>
  );
}
