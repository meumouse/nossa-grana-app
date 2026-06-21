import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckSquare, Loader2, Plus, TrendingUp, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { useWorkspace } from '@/workspace/WorkspaceProvider';
import { useLiveAccounts } from '@/hooks/useLiveData';
import { usePrivacy } from '@/ui/PrivacyProvider';
import { investmentApi } from '@/api/endpoints';
import { ApiError, OfflineError } from '@/api/client';
import { LoadMore } from '@/components/LoadMore';
import { SelectionBar } from '@/components/SelectionBar';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { usePagedList } from '@/hooks/usePagedList';
import { useSelection } from '@/hooks/useSelection';
import { cn } from '@/lib/utils';
import { formatDate, formatMoney } from '@/lib/format';
import type { InvestmentAsset, InvestmentClass, InvestmentTxKind } from '@/api/types';

const CLASS_LABELS: Record<InvestmentClass, string> = {
  STOCK: 'Ação',
  FII: 'FII',
  ETF: 'ETF',
  FUND: 'Fundo',
  FIXED_INCOME: 'Renda fixa',
  CRYPTO: 'Cripto',
  OTHER: 'Outro',
};

const KIND_LABELS: Record<InvestmentTxKind, string> = {
  BUY: 'Compra',
  SELL: 'Venda',
  DIVIDEND: 'Dividendo',
  INTEREST: 'Juros',
  CONTRIBUTION: 'Aporte',
  WITHDRAWAL: 'Resgate',
};

function handleError(err: unknown) {
  toast.error(
    err instanceof OfflineError
      ? 'Sem conexão — investimentos precisam do servidor'
      : err instanceof ApiError
        ? err.message
        : 'Erro inesperado',
  );
}

/** Resultado (P/L) = valor de mercado − investido; null se sem cotação. */
function profit(asset: InvestmentAsset): number | null {
  const mv = asset.position?.marketValue;
  if (mv == null) return null;
  return Number(mv) - Number(asset.position?.invested ?? 0);
}

export function InvestmentsPage() {
  const { activeId } = useWorkspace();
  const { hidden } = usePrivacy();
  const qc = useQueryClient();
  const accounts = useLiveAccounts(activeId) ?? [];

  const [assetOpen, setAssetOpen] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const sel = useSelection();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // form: ativo
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [assetClass, setAssetClass] = useState<InvestmentClass>('STOCK');
  const [lastPrice, setLastPrice] = useState('');

  // form: movimento
  const [txAssetId, setTxAssetId] = useState('');
  const [txAccountId, setTxAccountId] = useState('');
  const [txKind, setTxKind] = useState<InvestmentTxKind>('BUY');
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [fees, setFees] = useState('0');
  const [txDate, setTxDate] = useState<Date>(() => new Date());

  const { data, isLoading, isError } = useQuery({
    queryKey: ['investments', activeId],
    queryFn: () => investmentApi.listAssets(activeId!),
    enabled: !!activeId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['investments', activeId] });

  const createAsset = useMutation({
    mutationFn: () =>
      investmentApi.createAsset(activeId!, {
        name: name.trim(),
        symbol: symbol.trim() || null,
        class: assetClass,
        lastPrice: lastPrice.trim() ? Number(lastPrice.replace(',', '.')) : null,
      }),
    onSuccess: () => {
      setAssetOpen(false);
      invalidate();
      toast.success('Ativo criado');
    },
    onError: handleError,
  });

  const createTx = useMutation({
    mutationFn: () =>
      investmentApi.createTx(activeId!, {
        assetId: txAssetId,
        accountId: txAccountId,
        kind: txKind,
        quantity: Number(quantity.replace(',', '.')) || 0,
        unitPrice: Number(unitPrice.replace(',', '.')) || 0,
        fees: Number(fees.replace(',', '.')) || 0,
        date: txDate.toISOString(),
      }),
    onSuccess: () => {
      setTxOpen(false);
      invalidate();
      qc.invalidateQueries({ queryKey: ['investment', activeId] });
      toast.success('Movimento registrado');
    },
    onError: handleError,
  });

  const assets = data?.assets ?? [];
  const paged = usePagedList(assets, { resetKey: activeId });
  const allSelected = paged.visible.length > 0 && paged.visible.every((a) => sel.has(a.id));

  const bulkDelete = async () => {
    setDeleting(true);
    try {
      await Promise.all([...sel.selected].map((id) => investmentApi.removeAsset(activeId!, id)));
      toast.success(sel.count === 1 ? 'Ativo excluído' : `${sel.count} ativos excluídos`);
      setConfirmOpen(false);
      sel.exit();
      invalidate();
    } catch (err) {
      handleError(err);
    } finally {
      setDeleting(false);
    }
  };

  const openAsset = () => {
    setName('');
    setSymbol('');
    setAssetClass('STOCK');
    setLastPrice('');
    setAssetOpen(true);
  };
  const openTx = (assetId?: string) => {
    setTxAssetId(assetId ?? assets[0]?.id ?? '');
    setTxAccountId(accounts[0]?.id ?? accounts[0]?.key ?? '');
    setTxKind('BUY');
    setQuantity('');
    setUnitPrice('');
    setFees('0');
    setTxDate(new Date());
    setTxOpen(true);
  };

  const totalMarket = assets.reduce((s, a) => s + Number(a.position?.marketValue ?? a.position?.invested ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Investimentos</h1>
        <div className="flex flex-wrap gap-2">
          {assets.length > 0 && (
            <Button
              variant={sel.active ? 'secondary' : 'outline'}
              onClick={() => (sel.active ? sel.exit() : sel.enter())}
            >
              <CheckSquare className="h-4 w-4" />
              {sel.active ? 'Cancelar' : 'Selecionar'}
            </Button>
          )}
          <Button variant="outline" onClick={openAsset}>
            <Plus className="h-4 w-4" />
            Ativo
          </Button>
          <Button onClick={() => openTx()} disabled={assets.length === 0}>
            <Plus className="h-4 w-4" />
            Movimento
          </Button>
        </div>
      </div>

      {!isLoading && !isError && assets.length > 0 && (
        <Card className="flex items-center justify-between p-4">
          <span className="text-sm text-muted-foreground">Patrimônio (carteira)</span>
          <span className="text-lg font-bold">{formatMoney(totalMarket, hidden)}</span>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : isError ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Não foi possível carregar os investimentos.
        </p>
      ) : assets.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nenhum ativo. Cadastre uma ação, FII, fundo ou cripto.
        </p>
      ) : (
        <div className={cn('space-y-2', sel.active && 'pb-20')}>
          {paged.visible.map((a) => {
            const pl = profit(a);
            const qty = Number(a.position?.quantity ?? 0);
            return (
              <Card
                key={a.id}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-2 p-3 hover:bg-accent/40',
                  sel.has(a.id) && 'ring-2 ring-primary',
                )}
                onClick={() => (sel.active ? sel.toggle(a.id) : setDetailId(a.id))}
              >
                {sel.active && (
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 accent-primary"
                    checked={sel.has(a.id)}
                    onChange={() => sel.toggle(a.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Selecionar ${a.name}`}
                  />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <p className="truncate font-medium">
                      {a.symbol ? `${a.symbol} · ` : ''}
                      {a.name}
                    </p>
                    <Badge variant="muted">{CLASS_LABELS[a.class]}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {qty} cota(s) · PM {formatMoney(a.position?.avgPrice ?? 0, hidden)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold">
                    {formatMoney(a.position?.marketValue ?? a.position?.invested ?? 0, hidden)}
                  </p>
                  {pl !== null && (
                    <p className={cn('text-xs', pl >= 0 ? 'text-success' : 'text-destructive')}>
                      {pl >= 0 ? '+' : '−'}
                      {formatMoney(Math.abs(pl), hidden)}
                    </p>
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

      {sel.active && (
        <SelectionBar
          count={sel.count}
          allSelected={allSelected}
          onToggleAll={() => (allSelected ? sel.clear() : sel.setMany(paged.visible.map((a) => a.id)))}
          onCancel={sel.exit}
        >
          <Button variant="destructive" onClick={() => setConfirmOpen(true)} disabled={sel.count === 0}>
            <Trash2 className="h-4 w-4" />
            Excluir
          </Button>
        </SelectionBar>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Excluir ativos"
        description={
          sel.count === 1
            ? 'O ativo selecionado e todos os seus movimentos serão excluídos. Esta ação não pode ser desfeita.'
            : `${sel.count} ativos selecionados e todos os seus movimentos serão excluídos. Esta ação não pode ser desfeita.`
        }
        loading={deleting}
        onConfirm={() => void bulkDelete()}
      />

      {/* Novo ativo */}
      <Dialog open={assetOpen} onOpenChange={(o) => !o && setAssetOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo ativo</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!activeId) return;
              if (!name.trim()) return toast.error('Informe o nome');
              createAsset.mutate();
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="ast-symbol">Código</Label>
                <Input
                  id="ast-symbol"
                  placeholder="PETR4, BTC…"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Classe</Label>
                <Select value={assetClass} onValueChange={(v) => setAssetClass(v as InvestmentClass)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CLASS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ast-name">Nome</Label>
              <Input
                id="ast-name"
                placeholder="Ex.: Petrobras PN"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ast-price">Cotação atual (opcional)</Label>
              <CurrencyInput
                id="ast-price"
                placeholder="0,00"
                value={lastPrice}
                onChange={(e) => setLastPrice(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={createAsset.isPending}>
              {createAsset.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Novo movimento */}
      <Dialog open={txOpen} onOpenChange={(o) => !o && setTxOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo movimento</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!activeId) return;
              if (!txAssetId) return toast.error('Escolha o ativo');
              if (!txAccountId) return toast.error('Escolha a conta');
              if (!quantity.trim()) return toast.error('Informe a quantidade');
              createTx.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label>Ativo</Label>
              <Select value={txAssetId} onValueChange={setTxAssetId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o ativo" />
                </SelectTrigger>
                <SelectContent>
                  {assets.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.symbol ? `${a.symbol} · ` : ''}
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={txKind} onValueChange={(v) => setTxKind(v as InvestmentTxKind)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(KIND_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Conta</Label>
                <Select value={txAccountId} onValueChange={setTxAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Conta" />
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
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="iv-qty">Quantidade</Label>
                <Input
                  id="iv-qty"
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="iv-price">Preço unit.</Label>
                <CurrencyInput
                  id="iv-price"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="iv-fees">Taxas</Label>
                <CurrencyInput id="iv-fees" value={fees} onChange={(e) => setFees(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <DatePicker value={txDate} onChange={(d) => d && setTxDate(d)} />
            </div>
            <Button type="submit" className="w-full" disabled={createTx.isPending}>
              {createTx.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Registrar
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AssetDetail wsId={activeId} assetId={detailId} hidden={hidden} onClose={() => setDetailId(null)} />
    </div>
  );
}

function AssetDetail({
  wsId,
  assetId,
  hidden,
  onClose,
}: {
  wsId: string | null;
  assetId: string | null;
  hidden: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['investment', wsId, assetId],
    queryFn: () => investmentApi.getAsset(wsId!, assetId!),
    enabled: !!wsId && !!assetId,
  });

  const removeTx = useMutation({
    mutationFn: (id: string) => investmentApi.removeTx(wsId!, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['investment', wsId, assetId] });
      qc.invalidateQueries({ queryKey: ['investments', wsId] });
      toast('Movimento removido');
    },
    onError: handleError,
  });

  const asset = data?.asset;
  const pos = data?.position;
  const txs = asset?.transactions ?? [];

  return (
    <Dialog open={!!assetId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {asset ? `${asset.symbol ? `${asset.symbol} · ` : ''}${asset.name}` : 'Ativo'}
          </DialogTitle>
        </DialogHeader>
        {isLoading || !asset || !pos ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Stat label="Quantidade" value={String(Number(pos.quantity))} />
              <Stat label="Preço médio" value={formatMoney(pos.avgPrice, hidden)} />
              <Stat label="Investido" value={formatMoney(pos.invested, hidden)} />
              <Stat
                label="Valor de mercado"
                value={pos.marketValue != null ? formatMoney(pos.marketValue, hidden) : '—'}
              />
              <Stat label="Proventos" value={formatMoney(pos.income, hidden)} />
              <Stat
                label="Cotação"
                value={asset.lastPrice != null ? formatMoney(asset.lastPrice, hidden) : '—'}
              />
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium">Movimentos</p>
              {txs.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Nenhum movimento.</p>
              ) : (
                txs.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p>
                        {KIND_LABELS[t.kind]} · {Number(t.quantity)} × {formatMoney(t.unitPrice, hidden)}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDate(t.date)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remover movimento"
                      onClick={() => removeTx.mutate(t.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
