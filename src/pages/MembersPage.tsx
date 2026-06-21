import { useCallback, useEffect, useState } from 'react';
import {
  UserPlus,
  MoreVertical,
  Pencil,
  Trash2,
  Mail,
  Phone,
  Link2,
  X,
  MessageCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PhoneInput } from '@/components/ui/phone-input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/sonner';
import { initialsFrom } from '@/lib/avatars';
import { useWorkspace } from '@/workspace/WorkspaceProvider';
import { useAuth } from '@/auth/AuthProvider';
import { memberApi, invitationApi, type CreateInvitationInput } from '@/api/endpoints';
import { ApiError, OfflineError } from '@/api/client';
import type { Invitation, Member, MemberRole } from '@/api/types';

const ROLE_LABEL: Record<MemberRole, string> = {
  OWNER: 'Dono',
  ADMIN: 'Administrador',
  MEMBER: 'Membro',
  VIEWER: 'Visualizador',
};
const ROLE_HINT: Record<MemberRole, string> = {
  OWNER: 'Controle total do perfil',
  ADMIN: 'Gerencia membros e configurações',
  MEMBER: 'Cria e edita lançamentos',
  VIEWER: 'Apenas visualiza',
};
// Papéis que um ADMIN pode atribuir num convite (OWNER só por transferência).
const ASSIGNABLE: MemberRole[] = ['ADMIN', 'MEMBER', 'VIEWER'];

const roleBadgeVariant = (r: MemberRole) =>
  r === 'OWNER' ? 'success' : r === 'ADMIN' ? 'default' : r === 'VIEWER' ? 'outline' : 'secondary';

function handleError(err: unknown) {
  toast.error(
    err instanceof OfflineError
      ? 'Sem conexão — gerencie membros quando estiver online'
      : err instanceof ApiError
        ? err.message
        : 'Erro inesperado',
  );
}

export function MembersPage() {
  const { activeId, active } = useWorkspace();
  const { user } = useAuth();
  const canManage = active?.role === 'OWNER' || active?.role === 'ADMIN';

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!activeId) return;
    setLoading(true);
    try {
      const [m, inv] = await Promise.all([
        memberApi.list(activeId),
        canManage ? invitationApi.list(activeId) : Promise.resolve({ invitations: [] }),
      ]);
      setMembers(m.members);
      setInvitations(inv.invitations);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  }, [activeId, canManage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ---- Convite ----
  const [inviteOpen, setInviteOpen] = useState(false);
  const [channel, setChannel] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneValid, setPhoneValid] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<MemberRole>('MEMBER');
  const [saving, setSaving] = useState(false);

  const openInvite = () => {
    setChannel('email');
    setEmail('');
    setPhone('');
    setPhoneValid(true);
    setDisplayName('');
    setRole('MEMBER');
    setInviteOpen(true);
  };

  const submitInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeId) return;
    const body: CreateInvitationInput = { role, displayName: displayName.trim() || undefined };
    if (channel === 'email') {
      if (!email.trim()) return toast.error('Informe o e-mail');
      body.email = email.trim();
    } else {
      if (!phone.trim() || !phoneValid) return toast.error('Informe um telefone válido');
      body.phone = phone.trim();
    }
    setSaving(true);
    try {
      const { invitation } = await invitationApi.create(activeId, body);
      setInviteOpen(false);
      await refresh();
      // Sem e-mail configurado, o link é o caminho principal — já oferece compartilhar.
      await shareInvite(invitation);
      toast.success('Convite criado');
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  };

  // ---- Compartilhar / copiar link ----
  const shareInvite = async (inv: Invitation) => {
    const msg = `Você foi convidado(a) para o Nossa Grana. Aceite por aqui: ${inv.acceptUrl}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Convite — Nossa Grana', text: msg, url: inv.acceptUrl });
        return;
      } catch {
        /* usuário cancelou — segue para fallback de cópia */
      }
    }
    try {
      await navigator.clipboard.writeText(inv.acceptUrl);
      toast.success('Link copiado');
    } catch {
      toast.error('Não foi possível copiar o link');
    }
  };

  const whatsappUrl = (inv: Invitation) => {
    const text = encodeURIComponent(
      `Você foi convidado(a) para o Nossa Grana. Aceite por aqui: ${inv.acceptUrl}`,
    );
    // Se o convite tem telefone, abre direto a conversa; senão, escolhe o contato.
    const digits = inv.phone?.replace(/\D/g, '');
    return digits ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`;
  };

  // ---- Ações sobre membros ----
  const [editing, setEditing] = useState<Member | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<MemberRole>('MEMBER');

  const openEdit = (m: Member) => {
    setEditing(m);
    setEditName(m.displayName ?? '');
    setEditRole(m.role);
    setEditOpen(true);
  };
  const [editOpen, setEditOpen] = useState(false);

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeId || !editing) return;
    setSaving(true);
    try {
      await memberApi.update(activeId, editing.id, {
        role: editRole,
        displayName: editName.trim() || null,
      });
      setEditOpen(false);
      await refresh();
      toast.success('Membro atualizado');
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  };

  const removeMember = async (m: Member) => {
    if (!activeId) return;
    try {
      await memberApi.remove(activeId, m.id);
      await refresh();
      toast('Membro removido');
    } catch (err) {
      handleError(err);
    }
  };

  const revokeInvite = async (inv: Invitation) => {
    if (!activeId) return;
    try {
      await invitationApi.revoke(activeId, inv.id);
      await refresh();
      toast('Convite revogado');
    } catch (err) {
      handleError(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Família</h1>
          <p className="text-sm text-muted-foreground">Quem participa deste perfil financeiro</p>
        </div>
        {canManage && (
          <Button onClick={openInvite}>
            <UserPlus className="h-4 w-4" />
            Convidar
          </Button>
        )}
      </div>

      {/* Membros */}
      <div className="space-y-2">
        {loading && members.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : (
          members.map((m) => {
            const isSelf = m.user.id === user?.id;
            const lastOwner =
              m.role === 'OWNER' && members.filter((x) => x.role === 'OWNER').length <= 1;
            return (
              <Card key={m.id} className="flex items-center justify-between gap-3 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="h-10 w-10">
                    {m.user.avatarUrl ? <AvatarImage src={m.user.avatarUrl} alt="" /> : null}
                    <AvatarFallback>{initialsFrom(m.user.name, null, m.user.email)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {m.displayName || m.user.name || m.user.email}
                      {isSelf && <span className="ml-1 text-xs text-muted-foreground">(você)</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{m.user.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={roleBadgeVariant(m.role)}>{ROLE_LABEL[m.role]}</Badge>
                  {canManage && !lastOwner && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Ações">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(m)}>
                          <Pencil className="h-4 w-4" />
                          Editar papel/apelido
                        </DropdownMenuItem>
                        {!isSelf && (
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => void removeMember(m)}
                          >
                            <Trash2 className="h-4 w-4" />
                            Remover
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Convites pendentes */}
      {canManage && invitations.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Convites pendentes</h2>
          {invitations.map((inv) => (
            <Card key={inv.id} className="flex items-center justify-between gap-3 p-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  {inv.email ? <Mail className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium">{inv.email || inv.phone}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {inv.displayName ? `${inv.displayName} · ` : ''}
                    {ROLE_LABEL[inv.role]} · aguardando
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  asChild
                  title="Enviar pelo WhatsApp"
                  aria-label="Enviar pelo WhatsApp"
                >
                  <a href={whatsappUrl(inv)} target="_blank" rel="noreferrer">
                    <MessageCircle className="h-4 w-4" />
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void shareInvite(inv)}
                  title="Copiar/compartilhar link"
                  aria-label="Copiar link"
                >
                  <Link2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void revokeInvite(inv)}
                  title="Revogar convite"
                  aria-label="Revogar"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal: convidar */}
      <Dialog open={inviteOpen} onOpenChange={(o) => !o && setInviteOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convidar para o perfil</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitInvite} className="space-y-4">
            <Tabs value={channel} onValueChange={(v) => setChannel(v as 'email' | 'phone')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="email">
                  <Mail className="h-4 w-4" />
                  E-mail
                </TabsTrigger>
                <TabsTrigger value="phone">
                  <Phone className="h-4 w-4" />
                  Telefone
                </TabsTrigger>
              </TabsList>
              <TabsContent value="email" className="pt-3">
                <div className="space-y-1.5">
                  <Label htmlFor="inv-email">E-mail do convidado</Label>
                  <Input
                    id="inv-email"
                    type="email"
                    placeholder="exemplo@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enviamos um e-mail com o convite (se configurado) e você também recebe um link
                    para compartilhar.
                  </p>
                </div>
              </TabsContent>
              <TabsContent value="phone" className="pt-3">
                <div className="space-y-1.5">
                  <Label htmlFor="inv-phone">Telefone do convidado</Label>
                  <PhoneInput
                    id="inv-phone"
                    onChange={setPhone}
                    onValidityChange={setPhoneValid}
                    placeholder="(11) 98888-7777"
                  />
                  <p className="text-xs text-muted-foreground">
                    Geramos um link para você enviar por WhatsApp ou copiar.
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            <div className="space-y-1.5">
              <Label htmlFor="inv-nick">Apelido no perfil (opcional)</Label>
              <Input
                id="inv-nick"
                placeholder='Ex.: "Mãe", "Pai"'
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Papel</Label>
              <Select value={role} onValueChange={(v) => setRole(v as MemberRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE.map((r) => (
                    <SelectItem key={r} value={r}>
                      <span className="flex flex-col items-start">
                        <span>{ROLE_LABEL[r]}</span>
                        <span className="text-xs text-muted-foreground">{ROLE_HINT[r]}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" className="w-full" disabled={saving}>
              Enviar convite
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: editar membro */}
      <Dialog open={editOpen} onOpenChange={(o) => !o && setEditOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar membro</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitEdit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-nick">Apelido no perfil</Label>
              <Input
                id="edit-nick"
                placeholder='Ex.: "Mãe", "Pai"'
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Papel</Label>
              <Select
                value={editRole}
                onValueChange={(v) => setEditRole(v as MemberRole)}
                // Só o OWNER pode mexer no papel OWNER.
                disabled={editing?.role === 'OWNER' && active?.role !== 'OWNER'}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(active?.role === 'OWNER'
                    ? (['OWNER', ...ASSIGNABLE] as MemberRole[])
                    : ASSIGNABLE
                  ).map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABEL[r]}
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
