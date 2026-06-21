import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Check,
  Undo2,
  Sparkles,
  Users,
  AlertTriangle,
  CheckSquare,
  Search,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/workspace/WorkspaceProvider';
import { useAuth } from '@/auth/AuthProvider';
import { useLiveAccounts, useLiveCards, useLiveCategories, useLiveTransactions } from '@/hooks/useLiveData';
import { usePrivacy } from '@/ui/PrivacyProvider';
import { useSync } from '@/sync/SyncProvider';
import {
  deleteTransactionLocal,
  dismissDuplicateLocal,
  payTransactionLocal,
  unpayTransactionLocal,
} from '@/sync/mutations';
import { workspaceApi } from '@/api/endpoints';
import { detectDuplicates, redundantDuplicates } from '@/lib/duplicates';
import { TransactionFormModal } from '@/components/TransactionFormModal';
import { ImportAiModal } from '@/components/ImportAiModal';
import { ShareTransactionModal } from '@/components/ShareTransactionModal';
import { ConsistencyCheckModal } from '@/components/ConsistencyCheckModal';
import { formatDate, formatMoney } from '@/lib/format';
import type { LocalTransaction } from '@/db/dexie';
import type { TxShare } from '@/api/types';

type StatusFilter = 'ALL' | 'COMPLETED' | 'PENDING';

interface ShareTarget {
  keys: string[];
  initial?: TxShare[] | null;
  amount?: number | null;
}

export function TransactionsPage() {
  const { activeId } = useWorkspace();
  const { user } = useAuth();
  const accounts = useLiveAccounts(activeId) ?? [];
  const cards = useLiveCards(activeId) ?? [];
  const categories = useLiveCategories(activeId) ?? [];
  const { hidden } = usePrivacy();
  const { syncNow } = useSync();
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const txs = useLiveTransactions(activeId, filter === 'ALL' ? {} : { status: filter }) ?? [];

  // Filtros de localização (texto, conta, categoria, tipo).
  const [search, setSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [range, setRange] = useState<DateRange | undefined>(undefined);

  const [opened, setOpened] = useState(false);
  const [importOpened, setImportOpened] = useState(false);
  const [checkOpened, setCheckOpened] = useState(false);
  const [editing, setEditing] = useState<LocalTransaction | null>(null);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);

  // Seleção em massa (p/ marcar transações compartilhadas de uma vez).
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Pessoas cadastradas (settings) p/ autocomplete no rateio.
  const [contacts, setContacts] = useState<string[]>([]);
  useEffect(() => {
    if (!activeId) return;
    let live = true;
    workspaceApi
      .getSettings(activeId)
      .then((r) => live && setContacts(r.settings?.sharedContacts ?? []))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [activeId]);

  const ownerName = user?.name?.trim() || 'Você';

  // Nome por origem: contas + cartões (compras de cartão mostram o nome do cartão).
  const accMap = useMemo(
    () =>
      new Map<string, string>([
        ...accounts.map((a) => [a.key, a.name] as [string, string]),
        ...cards.map((c) => [c.key, c.name] as [string, string]),
      ]),
    [accounts, cards],
  );
  const catMap = useMemo(() => new Map(categories.map((c) => [c.key, c])), [categories]);
  const dupes = useMemo(() => detectDuplicates(txs), [txs]);
  // Cópias redundantes (mantém uma por grupo) — alvo do "Remover duplicadas".
  const removableDupes = useMemo(() => redundantDuplicates(txs), [txs]);
  const [removeDupesOpen, setRemoveDupesOpen] = useState(false);
  const [removingDupes, setRemovingDupes] = useState(false);

  const filtersActive =
    search.trim() !== '' ||
    accountFilter !== 'ALL' ||
    categoryFilter !== 'ALL' ||
    typeFilter !== 'ALL' ||
    Boolean(range?.from || range?.to);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromStr = range?.from ? format(range.from, 'yyyy-MM-dd') : null;
    const toStr = range?.to ? format(range.to, 'yyyy-MM-dd') : null;
    return txs.filter((t) => {
      if (accountFilter !== 'ALL' && t.accountId !== accountFilter) return false;
      if (categoryFilter !== 'ALL' && (t.categoryId ?? '') !== categoryFilter) return false;
      if (typeFilter !== 'ALL' && t.type !== typeFilter) return false;
      if (q && !`${t.description} ${t.notes ?? ''}`.toLowerCase().includes(q)) return false;
      const day = t.date.slice(0, 10);
      if (fromStr && day < fromStr) return false;
      if (toStr && day > toStr) return false;
      return true;
    });
  }, [txs, search, accountFilter, categoryFilter, typeFilter, range]);

  const clearFilters = () => {
    setSearch('');
    setAccountFilter('ALL');
    setCategoryFilter('ALL');
    setTypeFilter('ALL');
    setRange(undefined);
  };

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

  const unpay = async (t: LocalTransaction) => {
    await unpayTransactionLocal(t.key);
    void syncNow();
    toast.success('Efetivação removida');
  };

  const confirmRemoveDuplicates = async () => {
    if (removableDupes.length === 0) return;
    setRemovingDupes(true);
    try {
      for (const t of removableDupes) {
        await deleteTransactionLocal(t.key);
      }
      void syncNow();
      toast.success(
        removableDupes.length === 1
          ? '1 duplicada removida'
          : `${removableDupes.length} duplicadas removidas`,
      );
      setRemoveDupesOpen(false);
    } catch {
      toast.error('Não foi possível remover as duplicadas');
    } finally {
      setRemovingDupes(false);
    }
  };

  const keepNotDuplicate = async (t: LocalTransaction) => {
    const group = [t.key, ...(dupes.get(t.key) ?? [])];
    await dismissDuplicateLocal(group);
    void syncNow();
    toast('Marcada como legítima');
  };

  const toggleSelected = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const openBulkShare = () => {
    if (selected.size === 0) return toast.error('Selecione ao menos uma transação');
    setShareTarget({ keys: [...selected], initial: null, amount: null });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Extrato</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setCheckOpened(true)} disabled={txs.length === 0}>
            <Sparkles className="h-4 w-4" />
            Verificar inconsistências
          </Button>
          <Button
            variant={selectMode ? 'secondary' : 'outline'}
            onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
          >
            <CheckSquare className="h-4 w-4" />
            {selectMode ? 'Cancelar' : 'Selecionar'}
          </Button>
          <Button variant="outline" onClick={() => setImportOpened(true)}>
            <Sparkles className="h-4 w-4" />
            Importar com IA
          </Button>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" />
            Novo lançamento
          </Button>
        </div>
      </div>

      {dupes.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            {dupes.size} {dupes.size === 1 ? 'lançamento com' : 'lançamentos com'} possível duplicidade. Revise os
            marcados abaixo.
          </span>
          {removableDupes.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              className="shrink-0"
              onClick={() => setRemoveDupesOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              Remover duplicadas
            </Button>
          )}
        </div>
      )}

      <Tabs value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
        <TabsList>
          <TabsTrigger value="ALL">Todos</TabsTrigger>
          <TabsTrigger value="COMPLETED">Efetivados</TabsTrigger>
          <TabsTrigger value="PENDING">Pendentes</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por descrição ou observação"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <DateRangePicker value={range} onChange={setRange} />
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Conta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas as contas</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.key} value={a.key}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas as categorias</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos os tipos</SelectItem>
              <SelectItem value="INCOME">Receitas</SelectItem>
              <SelectItem value="EXPENSE">Despesas</SelectItem>
              <SelectItem value="TRANSFER">Transferências</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {filtersActive && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {visible.length} {visible.length === 1 ? 'resultado' : 'resultados'}
            </span>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4" />
              Limpar filtros
            </Button>
          </div>
        )}
      </div>

      {txs.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Nenhum lançamento ainda. Toque em “Novo”.</p>
      ) : visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nenhum lançamento corresponde aos filtros.
        </p>
      ) : (
        <div className="space-y-2 pb-20">
          {visible.map((t) => {
            const cat = t.categoryId ? catMap.get(t.categoryId) : null;
            const income = t.type === 'INCOME';
            const transfer = t.type === 'TRANSFER';
            const isDupe = dupes.has(t.key);
            const isSelected = selected.has(t.key);
            const paidCount = t.shares?.filter((s) => s.paid).length ?? 0;
            const peopleCount = t.shareCount ?? t.shares?.length ?? 0;
            return (
              <Card
                key={t.key}
                className={cn(
                  'flex items-center justify-between gap-2 p-3',
                  isDupe && 'border-warning/50',
                  isSelected && 'ring-2 ring-primary',
                )}
              >
                {selectMode && (
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 accent-primary"
                    checked={isSelected}
                    onChange={() => toggleSelected(t.key)}
                    aria-label={`Selecionar ${t.description}`}
                  />
                )}
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                  onClick={() => (selectMode ? toggleSelected(t.key) : undefined)}
                  disabled={!selectMode}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-medium">{t.description}</span>
                      {t.shared && (
                        <span title={`Dividido entre ${peopleCount} pessoas`}>
                          <Users className="h-3.5 w-3.5 text-primary" />
                        </span>
                      )}
                      {t.status === 'PENDING' && <Badge variant="warning">pendente</Badge>}
                      {!t.id && <Badge variant="muted">na fila</Badge>}
                      {isDupe && (
                        <Badge variant="warning" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          duplicada?
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(t.date)} · {accMap.get(t.accountId ?? t.creditCardId ?? '') ?? '—'}
                      {cat ? ` · ${cat.name}` : ''}
                      {t.shared ? ` · ${paidCount}/${peopleCount} pagaram` : ''}
                    </p>
                  </div>
                </button>
                {!selectMode && (
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
                        {t.status === 'COMPLETED' && (
                          <DropdownMenuItem onClick={() => void unpay(t)}>
                            <Undo2 className="h-4 w-4" />
                            Remover efetivação
                          </DropdownMenuItem>
                        )}
                        {!transfer && (
                          <DropdownMenuItem
                            onClick={() =>
                              setShareTarget({
                                keys: [t.key],
                                initial: t.shares ?? null,
                                amount: Math.abs(Number(t.amount)),
                              })
                            }
                          >
                            <Users className="h-4 w-4" />
                            {t.shared ? 'Gerenciar divisão' : 'Compartilhar / dividir'}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => openEdit(t)}>
                          <Pencil className="h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        {isDupe && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => void keepNotDuplicate(t)}>
                              <Check className="h-4 w-4" />
                              Não é duplicata
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuItem className="text-destructive" onClick={() => void remove(t)}>
                          <Trash2 className="h-4 w-4" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Barra de ação da seleção em massa */}
      {selectMode && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">{selected.size} selecionada(s)</span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={exitSelect}>
                <X className="h-4 w-4" />
                Cancelar
              </Button>
              <Button onClick={openBulkShare} disabled={selected.size === 0}>
                <Users className="h-4 w-4" />
                Compartilhar
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={removeDupesOpen} onOpenChange={(o) => !removingDupes && setRemoveDupesOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover duplicadas</DialogTitle>
            <DialogDescription>
              {removableDupes.length === 1
                ? 'Será removida 1 cópia redundante, mantendo o lançamento original. Esta ação não pode ser desfeita.'
                : `Serão removidas ${removableDupes.length} cópias redundantes, mantendo um lançamento de cada grupo. Esta ação não pode ser desfeita.`}
            </DialogDescription>
          </DialogHeader>
          {removableDupes.length > 0 && (
            <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border p-2">
              {removableDupes.map((t) => {
                const income = t.type === 'INCOME';
                return (
                  <div key={t.key} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">
                      {t.description}
                      <span className="text-muted-foreground">
                        {' · '}
                        {formatDate(t.date)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'whitespace-nowrap font-medium',
                        income ? 'text-success' : 'text-destructive',
                      )}
                    >
                      {income ? '+' : '−'}
                      {formatMoney(Math.abs(Number(t.amount)), hidden)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveDupesOpen(false)} disabled={removingDupes}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => void confirmRemoveDuplicates()} disabled={removingDupes}>
              <Trash2 className="h-4 w-4" />
              {removingDupes ? 'Removendo…' : 'Remover'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {activeId && (
        <>
          <TransactionFormModal
            opened={opened}
            onClose={() => setOpened(false)}
            workspaceId={activeId}
            accounts={accounts}
            cards={cards}
            categories={categories}
            editing={editing}
          />
          <ImportAiModal opened={importOpened} onClose={() => setImportOpened(false)} workspaceId={activeId} />
          <ConsistencyCheckModal
            opened={checkOpened}
            onClose={() => setCheckOpened(false)}
            workspaceId={activeId}
            transactions={txs}
            accMap={accMap}
            catMap={catMap}
          />
          {shareTarget && (
            <ShareTransactionModal
              opened={!!shareTarget}
              onClose={() => setShareTarget(null)}
              workspaceId={activeId}
              targetKeys={shareTarget.keys}
              initialShares={shareTarget.initial}
              amount={shareTarget.amount}
              contacts={contacts}
              ownerName={ownerName}
              onContactsAdded={(names) => setContacts((prev) => Array.from(new Set([...prev, ...names])))}
              onSaved={exitSelect}
            />
          )}
        </>
      )}
    </div>
  );
}
