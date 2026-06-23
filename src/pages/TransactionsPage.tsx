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
  RefreshCw,
  X,
  ArrowUpRight,
  ArrowDownRight,
  ArrowLeftRight,
  ChevronDown,
  Tag as TagIcon,
  Shapes,
  CreditCard,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Fab } from '@/components/ui/fab';
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
  DropdownMenuLabel,
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
import { useLiveAccounts, useLiveCards, useLiveCategories, useLiveTags, useLiveTransactions } from '@/hooks/useLiveData';
import { usePrivacy } from '@/ui/PrivacyProvider';
import { useSync } from '@/sync/SyncProvider';
import {
  bulkAddTagsLocal,
  bulkSetCategoryLocal,
  deleteTransactionLocal,
  dismissDuplicateLocal,
  payTransactionLocal,
  unpayTransactionLocal,
} from '@/sync/mutations';
import { memberApi, workspaceApi } from '@/api/endpoints';
import { detectDuplicates, duplicateGroups, redundantDuplicates } from '@/lib/duplicates';
import { TransactionFormModal } from '@/components/TransactionFormModal';
import { DuplicateReviewModal } from '@/components/DuplicateReviewModal';
import { TagPicker } from '@/components/TagPicker';
import { ImportAiModal } from '@/components/ImportAiModal';
import { ShareTransactionModal } from '@/components/ShareTransactionModal';
import { ConsistencyCheckModal } from '@/components/ConsistencyCheckModal';
import { RecurringFormModal, type RecurringInitial } from '@/components/RecurringFormModal';
import { InstallmentFormModal, type InstallmentInitial } from '@/components/InstallmentFormModal';
import { SuggestedRecurringSection } from '@/components/SuggestedRecurringSection';
import { LoadMore } from '@/components/LoadMore';
import { FiltersSheet, FilterField } from '@/components/FiltersSheet';
import { SelectionBar } from '@/components/SelectionBar';
import { BulkCategoryDialog } from '@/components/BulkCategoryDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { usePagedList } from '@/hooks/usePagedList';
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
  const tags = useLiveTags(activeId) ?? [];
  const { hidden } = usePrivacy();
  const { syncNow } = useSync();
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const txs = useLiveTransactions(activeId, filter === 'ALL' ? {} : { status: filter }) ?? [];

  // Filtros de localização (texto, conta, categoria, tipo).
  const [search, setSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [onlyDupes, setOnlyDupes] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>(undefined);

  const [opened, setOpened] = useState(false);
  const [importOpened, setImportOpened] = useState(false);
  const [checkOpened, setCheckOpened] = useState(false);
  const [editing, setEditing] = useState<LocalTransaction | null>(null);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  // Criar recorrência a partir de um lançamento (vincula a transação existente).
  const [recurringFrom, setRecurringFrom] = useState<{ initial: RecurringInitial; linkIds: string[] } | null>(null);
  // Criar parcelamento a partir de um lançamento. O original é removido ao criar
  // (o plano materializa a parcela 1..N — manter o original duplicaria o valor).
  const [installmentFrom, setInstallmentFrom] = useState<{
    initial: InstallmentInitial;
    linkKeys: string[];
  } | null>(null);

  // Seleção em massa (p/ marcar transações compartilhadas de uma vez).
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // Aplicação de tags em massa às transações selecionadas.
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkTagIds, setBulkTagIds] = useState<string[]>([]);
  const [bulkTagging, setBulkTagging] = useState(false);
  // Alteração de categoria em massa das transações selecionadas.
  const [bulkCatOpen, setBulkCatOpen] = useState(false);
  const [bulkCatting, setBulkCatting] = useState(false);

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

  // Membros reais do workspace (exceto eu) p/ vincular a parte do rateio a um
  // usuário com login — a despesa cai no painel "a pagar" dele enquanto pendente.
  const [members, setMembers] = useState<{ userId: string; name: string }[]>([]);
  useEffect(() => {
    if (!activeId) return;
    let live = true;
    memberApi
      .list(activeId)
      .then((r) => {
        if (!live) return;
        setMembers(
          r.members
            .filter((m) => m.user.id !== user?.id)
            .map((m) => ({
              userId: m.user.id,
              name: m.displayName || m.user.name || m.user.email,
            })),
        );
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [activeId, user?.id]);

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
  const tagMap = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  // Resolve a key local → id do servidor (recorrência é online, usa ids reais).
  const accIdMap = useMemo(() => new Map(accounts.map((a) => [a.key, a.id ?? a.key])), [accounts]);
  const cardIdMap = useMemo(() => new Map(cards.map((c) => [c.key, c.id ?? c.key])), [cards]);
  const catIdMap = useMemo(() => new Map(categories.map((c) => [c.key, c.id ?? c.key])), [categories]);
  const dupes = useMemo(() => detectDuplicates(txs), [txs]);
  // Cópias redundantes (mantém uma por grupo) — alvo do "Remover duplicadas".
  const removableDupes = useMemo(() => redundantDuplicates(txs), [txs]);
  // Grupos completos (2+ por grupo) — alimentam a revisão "Analisar lançamentos".
  const dupeGroups = useMemo(() => duplicateGroups(txs), [txs]);
  const [removeDupesOpen, setRemoveDupesOpen] = useState(false);
  const [removingDupes, setRemovingDupes] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  // Filtros da sidebar (sem a busca por texto, que fica inline) — alimenta o badge.
  const filterCount =
    (accountFilter !== 'ALL' ? 1 : 0) +
    (categoryFilter !== 'ALL' ? 1 : 0) +
    (typeFilter !== 'ALL' ? 1 : 0) +
    (tagFilter.length > 0 ? 1 : 0) +
    (onlyDupes ? 1 : 0) +
    (range?.from || range?.to ? 1 : 0);

  const filtersActive = search.trim() !== '' || filterCount > 0;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromStr = range?.from ? format(range.from, 'yyyy-MM-dd') : null;
    const toStr = range?.to ? format(range.to, 'yyyy-MM-dd') : null;
    return txs.filter((t) => {
      if (accountFilter !== 'ALL' && t.accountId !== accountFilter) return false;
      if (categoryFilter !== 'ALL' && (t.categoryId ?? '') !== categoryFilter) return false;
      if (typeFilter !== 'ALL' && t.type !== typeFilter) return false;
      if (tagFilter.length > 0 && !(t.tagIds ?? []).some((id) => tagFilter.includes(id))) return false;
      if (onlyDupes && !dupes.has(t.key)) return false;
      if (q && !`${t.description} ${t.notes ?? ''}`.toLowerCase().includes(q)) return false;
      const day = t.date.slice(0, 10);
      if (fromStr && day < fromStr) return false;
      if (toStr && day > toStr) return false;
      return true;
    });
  }, [txs, search, accountFilter, categoryFilter, typeFilter, tagFilter, onlyDupes, dupes, range]);

  // Paginação "carregar mais" sobre o extrato já filtrado. Volta à 1ª página
  // quando filtros, busca ou aba de status mudam.
  const paged = usePagedList(visible, {
    resetKey: `${filter}|${search}|${accountFilter}|${categoryFilter}|${typeFilter}|${tagFilter.join(',')}|${onlyDupes}|${range?.from?.toISOString() ?? ''}|${range?.to?.toISOString() ?? ''}`,
  });

  const clearFilters = () => {
    setSearch('');
    setAccountFilter('ALL');
    setCategoryFilter('ALL');
    setTypeFilter('ALL');
    setTagFilter([]);
    setOnlyDupes(false);
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

  // Abre o form de recorrência pré-preenchido a partir de um lançamento. A
  // transação existente é vinculada (não recriada) e só ocorrências futuras
  // são materializadas — sem duplicar o valor já lançado.
  const openRecurring = (t: LocalTransaction) => {
    const day = new Date(t.date).getUTCDate();
    setRecurringFrom({
      initial: {
        type: t.type as 'INCOME' | 'EXPENSE',
        accountId: t.accountId ? accIdMap.get(t.accountId) ?? null : null,
        categoryId: t.categoryId ? catIdMap.get(t.categoryId) ?? null : null,
        description: t.description,
        amount: Math.abs(Number(t.amount)),
        frequency: 'MONTHLY',
        anchorDay: Number.isFinite(day) ? day : null,
        startDate: new Date(t.date),
        tagIds: t.tagIds ?? [],
      },
      linkIds: t.id ? [t.id] : [],
    });
  };

  // Abre o form de parcelamento pré-preenchido a partir de um lançamento. O
  // valor do lançamento vira o total do plano; ao criar, o original é removido.
  const openInstallment = (t: LocalTransaction) => {
    const source = t.creditCardId
      ? `card:${cardIdMap.get(t.creditCardId) ?? t.creditCardId}`
      : t.accountId
        ? `acc:${accIdMap.get(t.accountId) ?? t.accountId}`
        : '';
    setInstallmentFrom({
      initial: {
        source,
        description: t.description,
        totalAmount: Math.abs(Number(t.amount)),
        firstDueDate: new Date(t.date),
        categoryId: t.categoryId ? catIdMap.get(t.categoryId) ?? null : null,
        tagIds: t.tagIds ?? [],
      },
      linkKeys: [t.key],
    });
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

  // Exclusão em lote a partir da revisão de duplicidades.
  const reviewDelete = async (keys: string[]) => {
    if (keys.length === 0) return;
    try {
      for (const key of keys) await deleteTransactionLocal(key);
      void syncNow();
      toast.success(keys.length === 1 ? '1 lançamento excluído' : `${keys.length} lançamentos excluídos`);
    } catch {
      toast.error('Não foi possível excluir os lançamentos');
    }
  };

  // Marca um grupo inteiro como legítimo (não é duplicata) a partir da revisão.
  const reviewDismiss = async (keys: string[]) => {
    await dismissDuplicateLocal(keys);
    void syncNow();
    toast('Grupo marcado como legítimo');
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

  // "Selecionar tudo" marca apenas os lançamentos visíveis (já revelados pela
  // paginação), conforme a regra acordada.
  const allSelected = paged.visible.length > 0 && paged.visible.every((t) => selected.has(t.key));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(paged.visible.map((t) => t.key)));

  // Total líquido das transações selecionadas (entradas somam, saídas subtraem;
  // transferências são neutras). Exibido na barra de seleção em massa.
  const selectedTotal = useMemo(() => {
    const byKey = new Map(txs.map((t) => [t.key, t]));
    let total = 0;
    for (const key of selected) {
      const t = byKey.get(key);
      if (!t || t.type === 'TRANSFER') continue;
      const amount = Math.abs(Number(t.amount));
      total += t.type === 'INCOME' ? amount : -amount;
    }
    return total;
  }, [selected, txs]);

  const openBulkTags = () => {
    if (selected.size === 0) return toast.error('Selecione ao menos uma transação');
    setBulkTagIds([]);
    setBulkTagOpen(true);
  };

  const applyBulkTags = async () => {
    if (bulkTagIds.length === 0) return;
    setBulkTagging(true);
    try {
      await bulkAddTagsLocal([...selected], bulkTagIds);
      void syncNow();
      toast.success(
        selected.size === 1
          ? 'Tags aplicadas a 1 lançamento'
          : `Tags aplicadas a ${selected.size} lançamentos`,
      );
      setBulkTagOpen(false);
      exitSelect();
    } catch {
      toast.error('Não foi possível aplicar as tags');
    } finally {
      setBulkTagging(false);
    }
  };

  const openBulkCategory = () => {
    if (selected.size === 0) return toast.error('Selecione ao menos uma transação');
    setBulkCatOpen(true);
  };

  const applyBulkCategory = async (categoryId: string | null) => {
    setBulkCatting(true);
    try {
      await bulkSetCategoryLocal([...selected], categoryId);
      void syncNow();
      toast.success(
        selected.size === 1
          ? 'Categoria alterada em 1 lançamento'
          : `Categoria alterada em ${selected.size} lançamentos`,
      );
      setBulkCatOpen(false);
      exitSelect();
    } catch {
      toast.error('Não foi possível alterar a categoria');
    } finally {
      setBulkCatting(false);
    }
  };

  const bulkDelete = async () => {
    setBulkDeleting(true);
    try {
      for (const key of selected) await deleteTransactionLocal(key);
      void syncNow();
      toast.success(
        selected.size === 1 ? 'Lançamento excluído' : `${selected.size} lançamentos excluídos`,
      );
      setBulkDeleteOpen(false);
      exitSelect();
    } catch {
      toast.error('Não foi possível excluir os lançamentos');
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Extrato</h1>
        <div className="flex flex-wrap items-center gap-2">
          {/* Ações de IA agrupadas num só botão (Importar / Verificar). */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="sm:w-auto sm:px-4" title="Ações de IA">
                <Sparkles className="h-4 w-4" />
                <span className="hidden sm:inline">IA</span>
                <ChevronDown className="hidden h-4 w-4 opacity-70 sm:inline" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Inteligência artificial</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setImportOpened(true)}>
                <Sparkles className="h-4 w-4" />
                Importar com IA
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCheckOpened(true)} disabled={txs.length === 0}>
                <AlertTriangle className="h-4 w-4" />
                Verificar inconsistências
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant={selectMode ? 'secondary' : 'outline'}
            size="icon"
            className="sm:w-auto sm:px-4"
            onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
            title={selectMode ? 'Cancelar seleção' : 'Selecionar'}
          >
            <CheckSquare className="h-4 w-4" />
            <span className="hidden sm:inline">{selectMode ? 'Cancelar' : 'Selecionar'}</span>
          </Button>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" />
            <span className="sm:hidden">Novo</span>
            <span className="hidden sm:inline">Novo lançamento</span>
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
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => setReviewOpen(true)}
          >
            <CheckSquare className="h-4 w-4" />
            Analisar lançamentos
          </Button>
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

      {activeId && (
        <SuggestedRecurringSection workspaceId={activeId} accounts={accounts} categories={categories} />
      )}

      <Tabs value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
        <TabsList className="grid w-full grid-cols-3 sm:inline-flex sm:w-auto">
          <TabsTrigger value="ALL">Todos</TabsTrigger>
          <TabsTrigger value="COMPLETED">Efetivados</TabsTrigger>
          <TabsTrigger value="PENDING">Pendentes</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por descrição ou observação"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <FiltersSheet activeCount={filterCount} onClear={clearFilters}>
            <FilterField label="Período">
              <DateRangePicker value={range} onChange={setRange} />
            </FilterField>
            <FilterField label="Conta">
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
            </FilterField>
            <FilterField label="Categoria">
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
            </FilterField>
            <FilterField label="Tipo">
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
            </FilterField>
            {activeId && tags.length > 0 && (
              <FilterField label="Tags">
                <TagPicker workspaceId={activeId} tags={tags} value={tagFilter} onChange={setTagFilter} />
              </FilterField>
            )}
            <FilterField label="Duplicidade">
              <label className="flex cursor-pointer items-center justify-between gap-2 rounded-md border p-2.5 text-sm">
                <span className="text-muted-foreground">Apenas possíveis duplicidades</span>
                <Switch checked={onlyDupes} onCheckedChange={setOnlyDupes} />
              </label>
            </FilterField>
          </FiltersSheet>
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
          {paged.visible.map((t) => {
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
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => (selectMode ? toggleSelected(t.key) : undefined)}
                  disabled={!selectMode}
                >
                  <span
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                      transfer
                        ? 'bg-muted text-muted-foreground'
                        : income
                          ? 'bg-success/15 text-success'
                          : 'bg-destructive/15 text-destructive',
                    )}
                  >
                    {transfer ? (
                      <ArrowLeftRight className="h-4 w-4" />
                    ) : income ? (
                      <ArrowUpRight className="h-4 w-4" />
                    ) : (
                      <ArrowDownRight className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
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
                    {(t.tagIds?.length ?? 0) > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {t.tagIds!.map((id) => {
                          const tag = tagMap.get(id);
                          if (!tag) return null;
                          return (
                            <span
                              key={id}
                              className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none"
                              style={tag.color ? { borderColor: tag.color, color: tag.color } : undefined}
                            >
                              {tag.name}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </button>
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
                  {!selectMode && (
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
                        {!transfer && t.accountId && (
                          <DropdownMenuItem onClick={() => openRecurring(t)} disabled={!t.id}>
                            <RefreshCw className="h-4 w-4" />
                            Criar recorrência
                          </DropdownMenuItem>
                        )}
                        {t.type === 'EXPENSE' && (
                          <DropdownMenuItem onClick={() => openInstallment(t)}>
                            <CreditCard className="h-4 w-4" />
                            Criar parcelamento
                          </DropdownMenuItem>
                        )}
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
                  )}
                </div>
              </Card>
            );
          })}
          <LoadMore
            shown={paged.shown}
            total={paged.total}
            hasMore={paged.hasMore}
            onLoadMore={paged.loadMore}
          />
        </div>
      )}

      {/* FAB de "Novo lançamento" (mobile) — escondido no modo seleção p/ não
          colidir com a barra de seleção. */}
      {!selectMode && <Fab label="Novo lançamento" icon={<Plus className="h-6 w-6" />} onClick={openNew} />}

      {/* Barra de ação da seleção em massa */}
      {selectMode && (
        <SelectionBar
          count={selected.size}
          total={selectedTotal}
          hidden={hidden}
          allSelected={allSelected}
          onToggleAll={toggleAll}
          onCancel={exitSelect}
        >
          <Button variant="outline" onClick={openBulkCategory} disabled={selected.size === 0}>
            <Shapes className="h-4 w-4" />
            Categoria
          </Button>
          <Button variant="outline" onClick={openBulkTags} disabled={selected.size === 0}>
            <TagIcon className="h-4 w-4" />
            Tags
          </Button>
          <Button variant="secondary" onClick={openBulkShare} disabled={selected.size === 0}>
            <Users className="h-4 w-4" />
            Compartilhar
          </Button>
          <Button
            variant="destructive"
            onClick={() => setBulkDeleteOpen(true)}
            disabled={selected.size === 0}
          >
            <Trash2 className="h-4 w-4" />
            Excluir
          </Button>
        </SelectionBar>
      )}

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title="Excluir lançamentos"
        description={
          selected.size === 1
            ? 'O lançamento selecionado será excluído. Esta ação não pode ser desfeita.'
            : `${selected.size} lançamentos selecionados serão excluídos. Esta ação não pode ser desfeita.`
        }
        loading={bulkDeleting}
        onConfirm={() => void bulkDelete()}
      />

      <BulkCategoryDialog
        open={bulkCatOpen}
        onOpenChange={setBulkCatOpen}
        categories={categories}
        count={selected.size}
        loading={bulkCatting}
        getValue={(c) => c.key}
        onApply={(id) => void applyBulkCategory(id)}
        noun={{ one: 'lançamento', many: 'lançamentos' }}
      />

      <Dialog open={bulkTagOpen} onOpenChange={(o) => !bulkTagging && setBulkTagOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar tags</DialogTitle>
            <DialogDescription>
              As tags escolhidas serão adicionadas a {selected.size}{' '}
              {selected.size === 1 ? 'lançamento' : 'lançamentos'} (as tags já aplicadas são mantidas).
            </DialogDescription>
          </DialogHeader>
          {activeId && (
            <TagPicker workspaceId={activeId} tags={tags} value={bulkTagIds} onChange={setBulkTagIds} />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkTagOpen(false)} disabled={bulkTagging}>
              Cancelar
            </Button>
            <Button onClick={() => void applyBulkTags()} disabled={bulkTagging || bulkTagIds.length === 0}>
              <TagIcon className="h-4 w-4" />
              {bulkTagging ? 'Aplicando…' : 'Aplicar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DuplicateReviewModal
        opened={reviewOpen}
        onClose={() => setReviewOpen(false)}
        groups={dupeGroups}
        accMap={accMap}
        hidden={hidden}
        onDelete={reviewDelete}
        onDismiss={reviewDismiss}
      />

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
            tags={tags}
            editing={editing}
          />
          <ImportAiModal opened={importOpened} onClose={() => setImportOpened(false)} workspaceId={activeId} />
          {recurringFrom && (
            <RecurringFormModal
              opened={!!recurringFrom}
              onClose={() => setRecurringFrom(null)}
              workspaceId={activeId}
              accounts={accounts}
              categories={categories}
              tags={tags}
              initial={recurringFrom.initial}
              linkTransactionIds={recurringFrom.linkIds}
              title="Criar recorrência"
            />
          )}
          {installmentFrom && (
            <InstallmentFormModal
              opened={!!installmentFrom}
              onClose={() => setInstallmentFrom(null)}
              workspaceId={activeId}
              accounts={accounts}
              cards={cards}
              categories={categories}
              tags={tags}
              ownerName={ownerName}
              initial={installmentFrom.initial}
              linkTransactionKeys={installmentFrom.linkKeys}
              title="Criar parcelamento"
            />
          )}
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
              members={members}
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
