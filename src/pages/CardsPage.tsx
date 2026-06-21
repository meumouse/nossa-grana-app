import { useState } from 'react';
import { Plus, MoreVertical, Pencil, Trash2, ReceiptText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/sonner';
import { BankLogo } from '@/components/BankLogo';
import { useWorkspace } from '@/workspace/WorkspaceProvider';
import { useLiveAccounts, useLiveCards, useCardsUsed, useLiveInstitutions } from '@/hooks/useLiveData';
import { usePrivacy } from '@/ui/PrivacyProvider';
import { useSync } from '@/sync/SyncProvider';
import { cardApi } from '@/api/endpoints';
import { ApiError, OfflineError } from '@/api/client';
import { formatMoneyCents, toCents } from '@/lib/format';
import type { LocalCreditCard } from '@/db/dexie';

/** "1.234,56" | "8,99" -> número; vazio -> undefined. */
const parseNum = (v: string): number | undefined => {
  const s = v.trim().replace(/\./g, '').replace(',', '.');
  if (s === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};
const parseDay = (v: string): number | undefined => {
  const n = parseNum(v);
  if (n === undefined) return undefined;
  return Math.min(31, Math.max(1, Math.round(n)));
};

const NO_BANK = 'none';
const NO_ACCOUNT = 'none';

export function CardsPage() {
  const { activeId } = useWorkspace();
  const navigate = useNavigate();
  const cards = useLiveCards(activeId) ?? [];
  const accounts = useLiveAccounts(activeId) ?? [];
  const used = useCardsUsed(activeId);
  const institutions = useLiveInstitutions(activeId) ?? [];
  const instById = new Map(institutions.map((i) => [i.id, i]));
  const accById = new Map(accounts.map((a) => [a.key, a]));
  const { hidden } = usePrivacy();
  const { syncNow } = useSync();
  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState<LocalCreditCard | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [institutionId, setInstitutionId] = useState<string>(NO_BANK);
  const [creditLimit, setCreditLimit] = useState('');
  const [statementClosingDay, setStatementClosingDay] = useState('');
  const [paymentDueDay, setPaymentDueDay] = useState('');
  const [lateInterestRate, setLateInterestRate] = useState('');
  const [paymentAccountId, setPaymentAccountId] = useState<string>(NO_ACCOUNT);

  const openNew = () => {
    setEditing(null);
    setName('');
    setInstitutionId(NO_BANK);
    setCreditLimit('');
    setStatementClosingDay('');
    setPaymentDueDay('');
    setLateInterestRate('');
    setPaymentAccountId(NO_ACCOUNT);
    setOpened(true);
  };
  const openEdit = (c: LocalCreditCard) => {
    setEditing(c);
    setName(c.name);
    setInstitutionId(c.institutionId ?? NO_BANK);
    setCreditLimit(c.creditLimit ?? '');
    setStatementClosingDay(c.statementClosingDay != null ? String(c.statementClosingDay) : '');
    setPaymentDueDay(c.paymentDueDay != null ? String(c.paymentDueDay) : '');
    setLateInterestRate(c.lateInterestRate ?? '');
    setPaymentAccountId(c.paymentAccountId ?? NO_ACCOUNT);
    setOpened(true);
  };

  const handleError = (err: unknown) =>
    toast.error(
      err instanceof OfflineError
        ? 'Sem conexão — gerencie cartões quando estiver online'
        : err instanceof ApiError
          ? err.message
          : 'Erro inesperado',
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeId || !name.trim()) return toast.error('Informe o nome');
    setSaving(true);
    try {
      // Em edição, campo vazio vira null (limpa); na criação, omitimos (undefined).
      const clearable = !!editing?.id;
      const empty = clearable ? null : undefined;
      const money = (n: number | undefined) => (n !== undefined ? String(n) : empty);
      const day = (n: number | undefined) => (n !== undefined ? n : empty);
      const bank = institutionId === NO_BANK ? null : institutionId;
      const payAcc = paymentAccountId === NO_ACCOUNT ? null : accById.get(paymentAccountId)?.id ?? null;

      const body = {
        institutionId: bank,
        creditLimit: money(parseNum(creditLimit)),
        statementClosingDay: day(parseDay(statementClosingDay)),
        paymentDueDay: day(parseDay(paymentDueDay)),
        lateInterestRate: money(parseNum(lateInterestRate)),
        paymentAccountId: payAcc,
      };

      if (editing?.id) {
        await cardApi.update(activeId, editing.id, { name: name.trim(), ...body });
      } else {
        await cardApi.create(activeId, { name: name.trim(), ...body });
      }
      setOpened(false);
      await syncNow();
      toast.success('Cartão salvo');
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: LocalCreditCard) => {
    if (!activeId || !c.id) return;
    try {
      await cardApi.remove(activeId, c.id);
      await syncNow();
      toast('Cartão excluído');
    } catch (err) {
      handleError(err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Cartões de crédito</h1>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          Novo cartão
        </Button>
      </div>

      {cards.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nenhum cartão. Crie o primeiro (online).
        </p>
      ) : (
        <div className="space-y-2">
          {cards.map((c) => {
            const inst = c.institutionId ? instById.get(c.institutionId) : null;
            const limitCents = c.creditLimit != null ? toCents(c.creditLimit) : null;
            const availableCents = limitCents != null ? limitCents - (used.get(c.key) ?? 0) : null;
            return (
              <Card key={c.key} className="flex items-center justify-between gap-2 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  {inst ? (
                    <BankLogo name={inst.shortName || inst.name} brandColor={inst.brandColor} size={36} />
                  ) : null}
                  <div className="min-w-0">
                    <p className="font-medium">{c.name}</p>
                    {limitCents != null && (
                      <p className="text-xs text-muted-foreground">
                        Limite {formatMoneyCents(limitCents, hidden)}
                        {c.paymentDueDay != null && ` · vence dia ${c.paymentDueDay}`}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {availableCents != null && (
                    <div className="text-right">
                      <p className="text-[10px] uppercase text-muted-foreground">Disponível</p>
                      <span className="font-bold">{formatMoneyCents(availableCents, hidden)}</span>
                    </div>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Ações">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigate(`/invoices?card=${c.id ?? ''}`)}>
                        <ReceiptText className="h-4 w-4" />
                        Faturas
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openEdit(c)}>
                        <Pencil className="h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => void remove(c)}>
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

      <Dialog open={opened} onOpenChange={(o) => !o && setOpened(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar cartão' : 'Novo cartão'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="card-name">Nome</Label>
              <Input
                id="card-name"
                placeholder="Ex.: Nubank Ultravioleta"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Banco</Label>
              <Select
                value={institutionId}
                onValueChange={(v) => {
                  setInstitutionId(v);
                  const inst = v === NO_BANK ? null : instById.get(v);
                  if (inst && !name.trim()) setName(inst.shortName || inst.name);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o banco (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_BANK}>Sem banco</SelectItem>
                  {institutions.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      <span className="flex items-center gap-2">
                        <BankLogo name={inst.shortName || inst.name} brandColor={inst.brandColor} size={20} />
                        {inst.shortName || inst.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="card-limit">Limite do cartão</Label>
              <CurrencyInput
                id="card-limit"
                placeholder="Ex.: 5000,00"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="card-closing">Fechamento (dia)</Label>
                <Input
                  id="card-closing"
                  inputMode="numeric"
                  placeholder="Ex.: 28"
                  value={statementClosingDay}
                  onChange={(e) => setStatementClosingDay(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="card-due">Vencimento (dia)</Label>
                <Input
                  id="card-due"
                  inputMode="numeric"
                  placeholder="Ex.: 5"
                  value={paymentDueDay}
                  onChange={(e) => setPaymentDueDay(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="card-late">Juros por atraso (% a.m.)</Label>
              <Input
                id="card-late"
                inputMode="decimal"
                placeholder="Ex.: 8,99"
                value={lateInterestRate}
                onChange={(e) => setLateInterestRate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Conta de pagamento da fatura</Label>
              <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a conta (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ACCOUNT}>Definir ao pagar</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.key} value={a.key}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" className="w-full" disabled={saving}>
              Salvar
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
