import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import type { TxShare } from '@/api/types';
import { workspaceApi } from '@/api/endpoints';
import { bulkSetSharesLocal, setSharesLocal } from '@/sync/mutations';
import { useSync } from '@/sync/SyncProvider';

interface Props {
  opened: boolean;
  onClose: () => void;
  workspaceId: string;
  /** Uma transação (editar rateio) ou várias (marcação em massa). */
  targetKeys: string[];
  /** Rateio atual (modo single). */
  initialShares?: TxShare[] | null;
  /** Valor da transação (modo single) p/ exibir o rateio por pessoa. */
  amount?: number | null;
  /** Pessoas já cadastradas (settings) p/ autocomplete. */
  contacts: string[];
  /** Nome do dono do perfil (entra como pago por padrão). */
  ownerName: string;
  /** Avisa o pai sobre novos nomes cadastrados p/ atualizar o cache local. */
  onContactsAdded?: (names: string[]) => void;
  onSaved?: () => void;
}

function ownerRow(ownerName: string): TxShare {
  return { name: ownerName, paid: true, owner: true };
}

export function ShareTransactionModal({
  opened,
  onClose,
  workspaceId,
  targetKeys,
  initialShares,
  amount,
  contacts,
  ownerName,
  onContactsAdded,
  onSaved,
}: Props) {
  const { syncNow } = useSync();
  const bulk = targetKeys.length > 1;
  const [shares, setShares] = useState<TxShare[]>([ownerRow(ownerName)]);
  const [newName, setNewName] = useState('');
  const [count, setCount] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!opened) return;
    const base =
      initialShares && initialShares.length > 0
        ? // garante exatamente um dono no topo
          [
            initialShares.find((s) => s.owner) ?? ownerRow(ownerName),
            ...initialShares.filter((s) => !s.owner),
          ]
        : [ownerRow(ownerName)];
    setShares(base);
    setCount(Math.max(base.length, initialShares?.length ?? base.length));
    setNewName('');
  }, [opened, initialShares, ownerName]);

  const addPerson = (raw: string) => {
    const name = raw.trim();
    if (!name) return;
    if (shares.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      toast.error('Essa pessoa já está no rateio');
      return;
    }
    setShares((prev) => {
      const next = [...prev, { name, paid: false }];
      setCount((c) => Math.max(c, next.length));
      return next;
    });
    setNewName('');
  };

  const removePerson = (i: number) =>
    setShares((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      setCount((c) => Math.max(next.length, Math.min(c, c)));
      return next;
    });

  const togglePaid = (i: number) =>
    setShares((prev) => prev.map((s, idx) => (idx === i ? { ...s, paid: !s.paid } : s)));

  const peopleCount = Math.max(count, shares.length);
  const perPerson = amount && peopleCount > 0 ? amount / peopleCount : null;

  const suggestions = useMemo(
    () => contacts.filter((c) => !shares.some((s) => s.name.toLowerCase() === c.toLowerCase())),
    [contacts, shares],
  );

  const save = async () => {
    setSaving(true);
    try {
      // Cadastra nomes novos (não-dono e ainda não em contacts) nas settings.
      const known = new Set(contacts.map((c) => c.toLowerCase()));
      const fresh = shares
        .filter((s) => !s.owner)
        .map((s) => s.name)
        .filter((n) => !known.has(n.toLowerCase()));
      if (fresh.length > 0) {
        const merged = Array.from(new Set([...contacts, ...fresh]));
        try {
          await workspaceApi.updateSettings(workspaceId, { sharedContacts: merged });
          onContactsAdded?.(fresh);
        } catch {
          // best-effort: não bloqueia o rateio se o cadastro falhar.
        }
      }

      if (bulk) {
        await bulkSetSharesLocal(targetKeys, shares, peopleCount);
      } else if (targetKeys[0]) {
        await setSharesLocal(targetKeys[0], shares, peopleCount);
      }
      void syncNow();
      toast.success(bulk ? `${targetKeys.length} transações compartilhadas` : 'Compartilhamento salvo');
      onSaved?.();
      onClose();
    } catch {
      toast.error('Erro ao salvar o compartilhamento');
    } finally {
      setSaving(false);
    }
  };

  const unshare = async () => {
    if (!targetKeys[0]) return;
    setSaving(true);
    try {
      await setSharesLocal(targetKeys[0], null);
      void syncNow();
      toast('Compartilhamento removido');
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const paidCount = shares.filter((s) => s.paid).length;

  return (
    <Dialog open={opened} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {bulk ? `Compartilhar ${targetKeys.length} transações` : 'Compartilhar transação'}
          </DialogTitle>
          <DialogDescription>
            Marque com quem a conta foi dividida e quem já pagou. O dono do perfil entra como pago.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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

          <div className="space-y-1.5">
            <Label htmlFor="new-person">Adicionar pessoa</Label>
            <div className="flex gap-2">
              <Input
                id="new-person"
                list="shared-contacts"
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
              <datalist id="shared-contacts">
                {suggestions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <Button type="button" variant="outline" onClick={() => addPerson(newName)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="people-count">Total de pessoas no rateio</Label>
            <Input
              id="people-count"
              type="number"
              min={shares.length}
              className="w-20"
              value={peopleCount}
              onChange={(e) => setCount(Math.max(shares.length, Number(e.target.value) || shares.length))}
            />
          </div>

          {perPerson != null && (
            <p className="text-sm text-muted-foreground">
              Cada pessoa: <span className="font-medium text-foreground">{formatMoney(perPerson)}</span> ·{' '}
              {paidCount}/{shares.length} pagaram
            </p>
          )}

          <div className="flex items-center gap-2">
            {!bulk && initialShares && initialShares.length > 0 && (
              <Button type="button" variant="ghost" className="text-destructive" onClick={() => void unshare()} disabled={saving}>
                <Trash2 className="h-4 w-4" />
                Remover
              </Button>
            )}
            <Button type="button" className={cn('flex-1')} onClick={() => void save()} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar compartilhamento'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
