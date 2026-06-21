import { useCallback, useEffect, useState } from 'react';
import { UserPlus, Check, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { useWorkspace } from '@/workspace/WorkspaceProvider';
import { invitationApi } from '@/api/endpoints';
import type { MyInvitation } from '@/api/types';

/**
 * Banner de convites pendentes recebidos pelo usuário logado (casados por
 * e-mail/telefone). Aparece no topo do app para quem já tem conta — aceitar
 * aqui dispensa abrir o link.
 */
export function InvitationsNotice() {
  const { refresh, setActive } = useWorkspace();
  const [invites, setInvites] = useState<MyInvitation[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { invitations } = await invitationApi.mine();
      setInvites(invitations);
    } catch {
      /* silencioso — é só um aviso */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const accept = async (inv: MyInvitation) => {
    setBusy(inv.id);
    try {
      await invitationApi.accept(inv.token);
      await refresh();
      setActive(inv.workspace.id);
      setInvites((cur) => cur.filter((i) => i.id !== inv.id));
      toast.success(`Você entrou em "${inv.workspace.name}"`);
    } catch {
      toast.error('Não foi possível aceitar o convite');
    } finally {
      setBusy(null);
    }
  };

  const decline = async (inv: MyInvitation) => {
    setBusy(inv.id);
    try {
      await invitationApi.decline(inv.token);
      setInvites((cur) => cur.filter((i) => i.id !== inv.id));
    } catch {
      /* silencioso */
    } finally {
      setBusy(null);
    }
  };

  if (invites.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      {invites.map((inv) => {
        const inviter = [inv.invitedBy.name, inv.invitedBy.surname].filter(Boolean).join(' ');
        return (
          <Card key={inv.id} className="flex flex-wrap items-center gap-3 border-primary/30 bg-primary/5 p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <UserPlus className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                Convite para <strong>{inv.workspace.name}</strong>
              </p>
              <p className="text-xs text-muted-foreground">
                {inviter ? `${inviter} convidou você` : 'Você foi convidado(a)'}
                {inv.displayName ? ` como "${inv.displayName}"` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => void accept(inv)} disabled={busy === inv.id}>
                <Check className="h-4 w-4" />
                Aceitar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void decline(inv)}
                disabled={busy === inv.id}
              >
                <X className="h-4 w-4" />
                Recusar
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
