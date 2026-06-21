import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { toast } from '@/components/ui/sonner';
import type { LocalAccount, LocalCreditCard, LocalCategory, LocalTransaction } from '@/db/dexie';
import { createTransactionLocal, updateTransactionLocal } from '@/sync/mutations';
import { useSync } from '@/sync/SyncProvider';

interface Props {
  opened: boolean;
  onClose: () => void;
  workspaceId: string;
  accounts: LocalAccount[];
  cards?: LocalCreditCard[];
  categories: LocalCategory[];
  editing?: LocalTransaction | null;
}

// Valor do seletor de origem codifica conta vs cartão ("acc:<key>" | "card:<key>").
const accVal = (key: string) => `acc:${key}`;
const cardVal = (key: string) => `card:${key}`;

function dateToInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type Kind = 'INCOME' | 'EXPENSE';

export function TransactionFormModal({
  opened,
  onClose,
  workspaceId,
  accounts,
  cards = [],
  categories,
  editing,
}: Props) {
  const { syncNow } = useSync();
  const [type, setType] = useState<Kind>('EXPENSE');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  // Origem: conta ou cartão, codificada em "acc:<key>" / "card:<key>".
  const [source, setSource] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState<Date>(new Date());
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!opened) return;
    if (editing) {
      setType(editing.type === 'INCOME' ? 'INCOME' : 'EXPENSE');
      setAmount(String(editing.amount));
      setDescription(editing.description);
      setSource(
        editing.creditCardId
          ? cardVal(editing.creditCardId)
          : editing.accountId
            ? accVal(editing.accountId)
            : '',
      );
      setCategoryId(editing.categoryId ?? '');
      setDate(new Date(editing.date));
      setPending(editing.status === 'PENDING');
    } else {
      setType('EXPENSE');
      setAmount('');
      setDescription('');
      setSource(accounts[0] ? accVal(accounts[0].key) : cards[0] ? cardVal(cards[0].key) : '');
      setCategoryId('');
      setDate(new Date());
      setPending(false);
    }
  }, [opened, editing, accounts, cards]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount.replace(',', '.'));
    if (!(value > 0)) return toast.error('Informe um valor maior que zero');
    if (!description.trim()) return toast.error('Descreva o lançamento');
    if (!source) return toast.error('Escolha a conta ou o cartão');

    const isCard = source.startsWith('card:');
    const ownerKey = source.slice(source.indexOf(':') + 1);
    const payload = {
      accountId: isCard ? null : ownerKey,
      creditCardId: isCard ? ownerKey : null,
      type,
      status: pending ? ('PENDING' as const) : ('COMPLETED' as const),
      amount: value,
      description: description.trim(),
      categoryId: categoryId || null,
      date: dateToInput(date),
      dueDate: pending ? dateToInput(date) : null,
    };
    try {
      if (editing) await updateTransactionLocal(editing.key, payload);
      else await createTransactionLocal(workspaceId, payload);
      onClose();
      void syncNow();
      toast.success(editing ? 'Lançamento atualizado' : 'Lançamento salvo');
    } catch {
      toast.error('Erro ao salvar o lançamento');
    }
  };

  const catOptions = categories.filter((c) => c.kind === type);

  return (
    <Dialog open={opened} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar lançamento' : 'Novo lançamento'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Tabs value={type} onValueChange={(v) => setType(v as Kind)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="EXPENSE">Despesa</TabsTrigger>
              <TabsTrigger value="INCOME">Receita</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="space-y-1.5">
            <Label htmlFor="amount">Valor</Label>
            <CurrencyInput
              id="amount"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desc">Descrição</Label>
            <Input id="desc" placeholder="Ex.: Mercado" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Conta ou cartão</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a conta ou o cartão" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={`acc-${a.key}`} value={accVal(a.key)}>
                    {a.name}
                  </SelectItem>
                ))}
                {cards.map((c) => (
                  <SelectItem key={`card-${c.key}`} value={cardVal(c.key)}>
                    {c.name} (cartão)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Sem categoria" />
              </SelectTrigger>
              <SelectContent>
                {catOptions.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Data</Label>
            <DatePicker value={date} onChange={setDate} />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor="pending" className="cursor-pointer">
              É conta a pagar/receber (pendente)
            </Label>
            <Switch id="pending" checked={pending} onCheckedChange={setPending} />
          </div>

          <Button type="submit" className="w-full">
            {editing ? 'Salvar' : 'Adicionar'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
