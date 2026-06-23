import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { TagPicker } from '@/components/TagPicker';
import { installmentApi, workspaceApi } from '@/api/endpoints';
import { ApiError, OfflineError } from '@/api/client';
import { useSync } from '@/sync/SyncProvider';
import { usePrivacy } from '@/ui/PrivacyProvider';
import { deleteTransactionLocal } from '@/sync/mutations';
import { formatMoney } from '@/lib/format';
import type { LocalAccount, LocalCategory, LocalCreditCard, LocalTag } from '@/db/dexie';
import type { TxShare } from '@/api/types';

/** O seletor de origem codifica conta vs cartão ("acc:<id>" | "card:<id>"). */
export const accVal = (id: string) => `acc:${id}`;
export const cardVal = (id: string) => `card:${id}`;

export function ownerRow(ownerName: string): TxShare {
  return { name: ownerName, paid: true, owner: true };
}

/** Pré-preenchimento opcional do form (novo a partir do extrato / edição). */
export interface InstallmentInitial {
  /** Origem já codificada ("acc:<id>" | "card:<id>"). Vazio = primeira disponível. */
  source?: string;
  description?: string;
  totalAmount?: number | string;
  installments?: number | string;
  startInstallment?: number | string;
  firstDueDate?: Date;
  categoryId?: string | null;
  tagIds?: string[];
  shares?: TxShare[];
  shareCount?: number;
}

interface Props {
  opened: boolean;
  onClose: () => void;
  workspaceId: string;
  accounts: LocalAccount[];
  cards: LocalCreditCard[];
  categories: LocalCategory[];
  tags?: LocalTag[];
  ownerName: string;
  /** Pré-preenchimento; ausente = parcelamento novo em branco. */
  initial?: InstallmentInitial | null;
  /** Quando preenchido, o diálogo edita um parcelamento existente. */
  editId?: string | null;
  /** Aviso (edição): há parcela paga fora do prefixo contíguo. */
  paidGap?: boolean;
  /**
   * Keys locais de transações a remover (soft delete) após criar com sucesso —
   * evita duplicar o valor ao converter um lançamento do extrato em parcelamento.
   * Ignorado em edição.
   */
  linkTransactionKeys?: string[];
  /** Título do diálogo (default conforme criar/editar). */
  title?: string;
  /** Chamado após salvar com sucesso (além de fechar e dar toast). */
  onSaved?: () => void;
}

function handleError(err: unknown) {
  toast.error(
    err instanceof OfflineError
      ? 'Sem conexão — parcelamentos precisam do servidor'
      : err instanceof ApiError
        ? err.message
        : 'Erro inesperado',
  );
}

const amountToString = (v: number | string | undefined): string => {
  if (v == null || v === '') return '';
  return typeof v === 'number' ? String(v).replace('.', ',') : v;
};

export function InstallmentFormModal({
  opened,
  onClose,
  workspaceId,
  accounts,
  cards,
  categories,
  tags = [],
  ownerName,
  initial,
  editId,
  paidGap,
  linkTransactionKeys,
  title,
  onSaved,
}: Props) {
  const qc = useQueryClient();
  const { hidden } = usePrivacy();
  const { syncNow } = useSync();

  // Origem: conta ou cartão, codificada em "acc:<id>" / "card:<id>".
  const [source, setSource] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [installments, setInstallments] = useState('2');
  const [startInstallment, setStartInstallment] = useState('1');
  const [firstDueDate, setFirstDueDate] = useState<Date>(() => new Date());

  // Divisão entre pessoas (rateio). shares[0] é sempre o dono.
  const [shares, setShares] = useState<TxShare[]>([ownerRow(ownerName)]);
  const [newName, setNewName] = useState('');
  const [shareCount, setShareCount] = useState(1);

  // Pessoas cadastradas (settings) p/ autocomplete no rateio.
  const [contacts, setContacts] = useState<string[]>([]);

  // Reseta o form ao abrir, aplicando o pré-preenchimento quando houver.
  useEffect(() => {
    if (!opened) return;
    const firstAcc = accounts[0];
    const firstCard = cards[0];
    const defaultSource = firstAcc
      ? accVal(firstAcc.id ?? firstAcc.key)
      : firstCard
        ? cardVal(firstCard.id ?? firstCard.key)
        : '';
    setSource(initial?.source || defaultSource);
    setCategoryId(initial?.categoryId ?? '');
    setTagIds(initial?.tagIds ?? []);
    setDescription(initial?.description ?? '');
    setTotalAmount(amountToString(initial?.totalAmount));
    setInstallments(initial?.installments != null ? String(initial.installments) : '2');
    setStartInstallment(initial?.startInstallment != null ? String(initial.startInstallment) : '1');
    setFirstDueDate(initial?.firstDueDate ?? new Date());
    const planShares = initial?.shares && initial.shares.length > 0 ? initial.shares : [ownerRow(ownerName)];
    setShares(planShares);
    setShareCount(
      initial?.shareCount != null ? Math.max(initial.shareCount, planShares.length) : planShares.length,
    );
    setNewName('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  // Carrega contatos cadastrados ao abrir (autocomplete do rateio).
  useEffect(() => {
    if (!opened || !workspaceId) return;
    let live = true;
    workspaceApi
      .getSettings(workspaceId)
      .then((r) => live && setContacts(r.settings?.sharedContacts ?? []))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [opened, workspaceId]);

  const others = shares.filter((s) => !s.owner);
  const isShared = others.length > 0;
  const peopleCount = Math.max(shareCount, shares.length);

  const save = useMutation({
    mutationFn: async () => {
      // Cadastra nomes novos nas settings (best-effort, p/ autocomplete futuro).
      if (isShared) {
        const known = new Set(contacts.map((c) => c.toLowerCase()));
        const fresh = others.map((s) => s.name).filter((n) => !known.has(n.toLowerCase()));
        if (fresh.length > 0) {
          const merged = Array.from(new Set([...contacts, ...fresh]));
          try {
            await workspaceApi.updateSettings(workspaceId, { sharedContacts: merged });
            setContacts(merged);
          } catch {
            // não bloqueia o salvamento do parcelamento.
          }
        }
      }
      const isCard = source.startsWith('card:');
      const ownerId = source.slice(source.indexOf(':') + 1);
      const body = {
        accountId: isCard ? undefined : ownerId,
        creditCardId: isCard ? ownerId : undefined,
        description: description.trim(),
        totalAmount: Number(totalAmount.replace(',', '.')) || 0,
        installments: Number(installments) || 2,
        startInstallment: Number(startInstallment) || 1,
        firstDueDate: firstDueDate.toISOString(),
        categoryId: categoryId || null,
        shares: isShared ? shares : null,
        shareCount: isShared ? peopleCount : null,
        tagIds,
      };
      return editId
        ? installmentApi.update(workspaceId, editId, body)
        : installmentApi.create(workspaceId, body);
    },
    onSuccess: async () => {
      // Converteu um lançamento do extrato: remove o original p/ não duplicar
      // (o plano já materializa a parcela 1..N). Só na criação.
      if (!editId && linkTransactionKeys?.length) {
        for (const key of linkTransactionKeys) await deleteTransactionLocal(key);
        void syncNow();
      }
      toast.success(editId ? 'Parcelamento atualizado' : 'Parcelamento criado');
      qc.invalidateQueries({ queryKey: ['installments', workspaceId] });
      // Atualiza também o detalhe (parcelas regeradas) caso esteja aberto.
      qc.invalidateQueries({ queryKey: ['installment', workspaceId] });
      onSaved?.();
      onClose();
    },
    onError: handleError,
  });

  const addPerson = (raw: string) => {
    const name = raw.trim();
    if (!name) return;
    if (shares.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      toast.error('Essa pessoa já está no rateio');
      return;
    }
    setShares((prev) => {
      const next = [...prev, { name, paid: false }];
      setShareCount((c) => Math.max(c, next.length));
      return next;
    });
    setNewName('');
  };

  const removePerson = (i: number) => setShares((prev) => prev.filter((_, idx) => idx !== i));

  const togglePaid = (i: number) =>
    setShares((prev) => prev.map((s, idx) => (idx === i ? { ...s, paid: !s.paid } : s)));

  const shareSuggestions = contacts.filter(
    (c) => !shares.some((s) => s.name.toLowerCase() === c.toLowerCase()),
  );
  const perPerson =
    isShared && peopleCount > 0 ? (Number(totalAmount.replace(',', '.')) || 0) / peopleCount : null;

  const expenseCats = categories.filter((c) => c.kind === 'EXPENSE');

  return (
    <Dialog
      open={opened}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title ?? (editId ? 'Editar parcelamento' : 'Novo parcelamento')}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!source) return toast.error('Escolha a conta ou o cartão');
            if (!description.trim()) return toast.error('Informe a descrição');
            if (!totalAmount.trim()) return toast.error('Informe o valor total');
            if (Number(installments) < 2) return toast.error('Mínimo de 2 parcelas');
            if (Number(startInstallment) > Number(installments))
              return toast.error('A parcela atual não pode ser maior que o total');
            save.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="ins-desc">Descrição</Label>
            <Input
              id="ins-desc"
              placeholder="Ex.: Geladeira"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="ins-total">Valor total</Label>
              <CurrencyInput
                id="ins-total"
                placeholder="0,00"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ins-n">Parcelas</Label>
              <Input
                id="ins-n"
                type="number"
                min={2}
                max={360}
                value={installments}
                onChange={(e) => setInstallments(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Conta ou cartão</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a conta ou o cartão" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={`acc-${a.key}`} value={accVal(a.id ?? a.key)}>
                    {a.name}
                  </SelectItem>
                ))}
                {cards.map((c) => (
                  <SelectItem key={`card-${c.key}`} value={cardVal(c.id ?? c.key)}>
                    {c.name} (cartão)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={categoryId || 'none'} onValueChange={(v) => setCategoryId(v === 'none' ? '' : v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem categoria</SelectItem>
                {expenseCats.map((c) => (
                  <SelectItem key={c.key} value={c.id ?? c.key}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tags</Label>
            <TagPicker workspaceId={workspaceId} tags={tags} value={tagIds} onChange={setTagIds} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="ins-start">Parcela atual</Label>
              <Input
                id="ins-start"
                type="number"
                min={1}
                max={Number(installments) || 1}
                value={startInstallment}
                onChange={(e) => setStartInstallment(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                {Number(startInstallment) > 1
                  ? `Vencimento da ${Number(startInstallment)}ª`
                  : '1º vencimento'}
              </Label>
              <DatePicker value={firstDueDate} onChange={(d) => d && setFirstDueDate(d)} />
            </div>
          </div>
          {Number(startInstallment) > 1 && (
            <p className="text-xs text-muted-foreground">
              As parcelas 1 a {Number(startInstallment) - 1} serão registradas como pagas.
            </p>
          )}
          {totalAmount.trim() && Number(installments) >= 2 && (
            <p className="text-xs text-muted-foreground">
              {installments}x de aprox.{' '}
              {formatMoney(
                (Number(totalAmount.replace(',', '.')) || 0) / (Number(installments) || 1),
                hidden,
              )}
            </p>
          )}

          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Dividir com outras pessoas</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Cada parcela será dividida e poderá ter o pagamento marcado por pessoa.
            </p>

            <div className="space-y-2">
              {shares.map((s, i) => (
                <div
                  key={`${s.name}-${i}`}
                  className="flex items-center justify-between gap-2 rounded-md border p-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">{s.name}</span>
                    {s.owner && <span className="text-xs text-muted-foreground">(você)</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                      <Switch checked={s.paid} onCheckedChange={() => togglePaid(i)} />
                      {s.paid ? 'pago' : 'a pagar'}
                    </label>
                    {!s.owner && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => removePerson(i)}
                        aria-label="Remover pessoa"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Input
                list="installment-contacts"
                placeholder="Nome da pessoa"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addPerson(newName);
                  }
                }}
              />
              <datalist id="installment-contacts">
                {shareSuggestions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <Button type="button" variant="outline" onClick={() => addPerson(newName)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {isShared && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="ins-people">Total de pessoas no rateio</Label>
                  <Input
                    id="ins-people"
                    type="number"
                    min={shares.length}
                    className="w-20"
                    value={peopleCount}
                    onChange={(e) =>
                      setShareCount(Math.max(shares.length, Number(e.target.value) || shares.length))
                    }
                  />
                </div>
                {perPerson != null && (
                  <p className="text-xs text-muted-foreground">
                    Cada pessoa paga aprox.{' '}
                    <span className="font-medium text-foreground">{formatMoney(perPerson, hidden)}</span>{' '}
                    do total ({formatMoney(perPerson / (Number(installments) || 1), hidden)} por parcela)
                  </p>
                )}
              </>
            )}
          </div>

          {editId && (
            <p className="text-xs text-muted-foreground">
              As parcelas serão recalculadas com os novos valores e datas.
            </p>
          )}
          {editId && paidGap && (
            <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-400">
              Este parcelamento tem parcelas pagas fora de ordem (uma parcela posterior foi quitada antes
              de anteriores). Ao salvar, apenas as{' '}
              {Number(startInstallment) - 1 > 0 ? `${Number(startInstallment) - 1} primeiras` : '0'}{' '}
              parcelas continuarão marcadas como pagas — confira o campo “Parcela atual”.
            </div>
          )}
          <Button type="submit" className="w-full" disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {editId ? 'Salvar alterações' : 'Criar'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
