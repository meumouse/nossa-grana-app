import { useState } from 'react';
import { Plus, MoreVertical, Pencil, Trash2 } from 'lucide-react';
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
import { useLiveAccounts, useBalances, useLiveInstitutions } from '@/hooks/useLiveData';
import { usePrivacy } from '@/ui/PrivacyProvider';
import { useSync } from '@/sync/SyncProvider';
import { accountApi } from '@/api/endpoints';
import { ApiError, OfflineError } from '@/api/client';
import { formatMoneyCents } from '@/lib/format';
import type { LocalAccount } from '@/db/dexie';
import type { AccountType } from '@/api/types';

const TYPE_LABELS: Record<AccountType, string> = {
  CHECKING: 'Conta corrente',
  SAVINGS: 'Poupança',
  CASH: 'Dinheiro',
  CREDIT_CARD: 'Cartão de crédito',
  DEBIT_CARD: 'Cartão de débito',
  MEAL_VOUCHER: 'Vale (VR/VA)',
  INVESTMENT: 'Investimentos',
  LOAN: 'Financiamento',
  OTHER: 'Outro',
};

const isCard = (t: AccountType) => t === 'CREDIT_CARD';
const isBankAccount = (t: AccountType) => t === 'CHECKING' || t === 'SAVINGS';

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

export function AccountsPage() {
  const { activeId } = useWorkspace();
  const accounts = useLiveAccounts(activeId) ?? [];
  const balances = useBalances(activeId);
  const institutions = useLiveInstitutions(activeId) ?? [];
  const instById = new Map(institutions.map((i) => [i.id, i]));
  const { hidden } = usePrivacy();
  const { syncNow } = useSync();
  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState<LocalAccount | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('CHECKING');
  const [institutionId, setInstitutionId] = useState<string>(NO_BANK);
  const [openingBalance, setOpeningBalance] = useState('0');
  // Cartão de crédito
  const [creditLimit, setCreditLimit] = useState('');
  const [statementClosingDay, setStatementClosingDay] = useState('');
  const [paymentDueDay, setPaymentDueDay] = useState('');
  const [lateInterestRate, setLateInterestRate] = useState('');
  // Conta bancária (dados + LIS / cheque especial)
  const [agency, setAgency] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountDigit, setAccountDigit] = useState('');
  const [overdraftLimit, setOverdraftLimit] = useState('');
  const [overdraftInterestRate, setOverdraftInterestRate] = useState('');

  const resetExtras = () => {
    setCreditLimit('');
    setStatementClosingDay('');
    setPaymentDueDay('');
    setLateInterestRate('');
    setAgency('');
    setAccountNumber('');
    setAccountDigit('');
    setOverdraftLimit('');
    setOverdraftInterestRate('');
  };

  const openNew = () => {
    setEditing(null);
    setName('');
    setType('CHECKING');
    setInstitutionId(NO_BANK);
    setOpeningBalance('0');
    resetExtras();
    setOpened(true);
  };
  const openEdit = (a: LocalAccount) => {
    setEditing(a);
    setName(a.name);
    setType(a.type);
    setInstitutionId(a.institutionId ?? NO_BANK);
    setOpeningBalance(String(a.openingBalance));
    setCreditLimit(a.creditLimit ?? '');
    setStatementClosingDay(a.statementClosingDay != null ? String(a.statementClosingDay) : '');
    setPaymentDueDay(a.paymentDueDay != null ? String(a.paymentDueDay) : '');
    setLateInterestRate(a.lateInterestRate ?? '');
    setAgency(a.agency ?? '');
    setAccountNumber(a.accountNumber ?? '');
    setAccountDigit(a.accountDigit ?? '');
    setOverdraftLimit(a.overdraftLimit ?? '');
    setOverdraftInterestRate(a.overdraftInterestRate ?? '');
    setOpened(true);
  };

  const handleError = (err: unknown) =>
    toast.error(
      err instanceof OfflineError
        ? 'Sem conexão — gerencie contas quando estiver online'
        : err instanceof ApiError
          ? err.message
          : 'Erro inesperado',
    );

  // Campos específicos do tipo selecionado. Em edição, enviamos `null` para
  // limpar valores que ficaram em branco; na criação, omitimos os vazios.
  const typeSpecific = (): Partial<
    Pick<
      LocalAccount,
      | 'creditLimit'
      | 'statementClosingDay'
      | 'paymentDueDay'
      | 'lateInterestRate'
      | 'agency'
      | 'accountNumber'
      | 'accountDigit'
      | 'overdraftLimit'
      | 'overdraftInterestRate'
    >
  > => {
    const clearable = !!editing?.id;
    // Em edição, campo vazio vira null (limpa); na criação, omitimos (undefined).
    const empty = clearable ? null : undefined;
    const money = (n: number | undefined) => (n !== undefined ? String(n) : empty);
    const day = (n: number | undefined) => (n !== undefined ? n : empty);
    const text = (v: string) => (v.trim() === '' ? empty : v.trim());

    if (isCard(type)) {
      return {
        creditLimit: money(parseNum(creditLimit)),
        statementClosingDay: day(parseDay(statementClosingDay)),
        paymentDueDay: day(parseDay(paymentDueDay)),
        lateInterestRate: money(parseNum(lateInterestRate)),
      };
    }
    if (isBankAccount(type)) {
      return {
        agency: text(agency),
        accountNumber: text(accountNumber),
        accountDigit: text(accountDigit),
        overdraftLimit: money(parseNum(overdraftLimit)),
        overdraftInterestRate: money(parseNum(overdraftInterestRate)),
      };
    }
    return {};
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeId || !name.trim()) return toast.error('Informe o nome');
    setSaving(true);
    try {
      const opening = String(Number(openingBalance.replace(',', '.')) || 0);
      const bank = institutionId === NO_BANK ? null : institutionId;
      const extras = typeSpecific();
      if (editing?.id) {
        await accountApi.update(activeId, editing.id, {
          name: name.trim(),
          institutionId: bank,
          openingBalance: opening,
          ...extras,
        });
      } else {
        await accountApi.create(activeId, {
          name: name.trim(),
          type,
          institutionId: bank,
          openingBalance: opening,
          ...extras,
        });
      }
      setOpened(false);
      await syncNow();
      toast.success('Conta salva');
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a: LocalAccount) => {
    if (!activeId || !a.id) return;
    try {
      await accountApi.remove(activeId, a.id);
      await syncNow();
      toast('Conta excluída');
    } catch (err) {
      handleError(err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Contas</h1>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          Nova conta
        </Button>
      </div>

      {accounts.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma conta. Crie a primeira (online).</p>
      ) : (
        <div className="space-y-2">
          {accounts.map((a) => (
            <Card key={a.key} className="flex items-center justify-between gap-2 p-3">
              <div className="flex min-w-0 items-center gap-3">
                {(() => {
                  const inst = a.institutionId ? instById.get(a.institutionId) : null;
                  return inst ? (
                    <BankLogo name={inst.shortName || inst.name} brandColor={inst.brandColor} size={36} />
                  ) : null;
                })()}
                <div className="min-w-0">
                <p className="font-medium">{a.name}</p>
                <p className="text-xs text-muted-foreground">{TYPE_LABELS[a.type]}</p>
                {isCard(a.type) && a.creditLimit != null && (
                  <p className="text-xs text-muted-foreground">
                    Limite {formatMoneyCents(Math.round(Number(a.creditLimit) * 100), hidden)}
                    {a.paymentDueDay != null && ` · vence dia ${a.paymentDueDay}`}
                  </p>
                )}
                {isBankAccount(a.type) && (a.agency || a.accountNumber) && (
                  <p className="text-xs text-muted-foreground">
                    {a.agency && `Ag. ${a.agency}`}
                    {a.agency && a.accountNumber && ' · '}
                    {a.accountNumber && `Conta ${a.accountNumber}${a.accountDigit ? `-${a.accountDigit}` : ''}`}
                  </p>
                )}
                {isBankAccount(a.type) && a.overdraftLimit != null && Number(a.overdraftLimit) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    LIS {formatMoneyCents(Math.round(Number(a.overdraftLimit) * 100), hidden)}
                  </p>
                )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className="font-bold">{formatMoneyCents(balances.get(a.key) ?? 0, hidden)}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Ações">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEdit(a)}>
                      <Pencil className="h-4 w-4" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => void remove(a)}>
                      <Trash2 className="h-4 w-4" />
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={opened} onOpenChange={(o) => !o && setOpened(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar conta' : 'Nova conta'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="acc-name">Nome</Label>
              <Input id="acc-name" placeholder="Ex.: Nubank" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as AccountType)} disabled={!!editing}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Banco</Label>
              <Select
                value={institutionId}
                onValueChange={(v) => {
                  setInstitutionId(v);
                  // Pré-preenche o nome com o banco quando ainda está vazio.
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
              <Label htmlFor="acc-balance">Saldo inicial</Label>
              <CurrencyInput
                id="acc-balance"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
              />
            </div>

            {isCard(type) && (
              <div className="space-y-4 rounded-md border border-border/60 p-3">
                <p className="text-sm font-medium">Cartão de crédito</p>
                <div className="space-y-1.5">
                  <Label htmlFor="acc-limit">Limite do cartão</Label>
                  <CurrencyInput
                    id="acc-limit"
                    placeholder="Ex.: 5000,00"
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="acc-closing">Fechamento (dia)</Label>
                    <Input
                      id="acc-closing"
                      inputMode="numeric"
                      placeholder="Ex.: 28"
                      value={statementClosingDay}
                      onChange={(e) => setStatementClosingDay(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="acc-due">Vencimento (dia)</Label>
                    <Input
                      id="acc-due"
                      inputMode="numeric"
                      placeholder="Ex.: 5"
                      value={paymentDueDay}
                      onChange={(e) => setPaymentDueDay(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="acc-late">Juros por atraso (% a.m.)</Label>
                  <Input
                    id="acc-late"
                    inputMode="decimal"
                    placeholder="Ex.: 8,99"
                    value={lateInterestRate}
                    onChange={(e) => setLateInterestRate(e.target.value)}
                  />
                </div>
              </div>
            )}

            {isBankAccount(type) && (
              <div className="space-y-4 rounded-md border border-border/60 p-3">
                <p className="text-sm font-medium">Dados bancários</p>
                <div className="space-y-1.5">
                  <Label htmlFor="acc-agency">Agência</Label>
                  <Input
                    id="acc-agency"
                    inputMode="numeric"
                    placeholder="Ex.: 0001"
                    value={agency}
                    onChange={(e) => setAgency(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="acc-number">Conta</Label>
                    <Input
                      id="acc-number"
                      inputMode="numeric"
                      placeholder="Ex.: 12345"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                    />
                  </div>
                  <div className="w-20 space-y-1.5">
                    <Label htmlFor="acc-digit">Dígito</Label>
                    <Input
                      id="acc-digit"
                      inputMode="numeric"
                      placeholder="Ex.: 6"
                      value={accountDigit}
                      onChange={(e) => setAccountDigit(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="acc-lis">LIS (limite da conta)</Label>
                  <CurrencyInput
                    id="acc-lis"
                    placeholder="Ex.: 2000,00"
                    value={overdraftLimit}
                    onChange={(e) => setOverdraftLimit(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="acc-lis-rate">Taxa de juros (% a.m.)</Label>
                  <Input
                    id="acc-lis-rate"
                    inputMode="decimal"
                    placeholder="Ex.: 8,00"
                    value={overdraftInterestRate}
                    onChange={(e) => setOverdraftInterestRate(e.target.value)}
                  />
                </div>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={saving}>
              Salvar
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
