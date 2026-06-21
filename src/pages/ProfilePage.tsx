import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Loader2,
  UserRound,
  Camera,
  Trash2,
  Mail,
  Phone,
  ShieldCheck,
  AlertTriangle,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/auth/AuthProvider';
import { authApi } from '@/api/endpoints';
import { ApiError, OfflineError } from '@/api/client';
import type { ProfileUpdateInput } from '@/api/types';
import { PRESET_AVATARS, initialsFrom } from '@/lib/avatars';
import { ACCEPTED_AVATAR_TYPES, fileToAvatarDataUrl } from '@/lib/image';

function handleError(err: unknown) {
  toast.error(
    err instanceof OfflineError
      ? 'Sem conexão — o perfil precisa do servidor'
      : err instanceof ApiError
        ? err.message
        : 'Erro inesperado',
  );
}

export function ProfilePage() {
  const { user, updateUser } = useAuth();

  // --- Dados pessoais ---
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Processamento local da foto enviada (resize p/ data URI) antes de salvar.
  const [processing, setProcessing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Hidrata o formulário quando o usuário chega/muda.
  useEffect(() => {
    if (!user) return;
    setName(user.name ?? '');
    setSurname(user.surname ?? '');
    setEmail(user.email);
    setPhone(user.phone ?? '');
  }, [user]);

  const save = useMutation({
    mutationFn: (body: ProfileUpdateInput) => authApi.updateProfile(body),
    onSuccess: ({ user: updated }) => updateUser(updated),
    onError: handleError,
  });

  const resend = useMutation({
    mutationFn: () => authApi.resendVerification(),
    onSuccess: (res) => toast.success(res.message),
    onError: handleError,
  });

  if (!user) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const initials = initialsFrom(user.name, user.surname, user.email);
  const busy = save.isPending || processing;

  const applyAvatar = (avatarUrl: string, message: string) =>
    save.mutate({ avatarUrl }, { onSuccess: () => toast.success(message) });

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite reenviar o mesmo arquivo depois
    if (!file) return;
    setProcessing(true);
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      applyAvatar(dataUrl, 'Foto de perfil atualizada');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao processar a imagem');
    } finally {
      setProcessing(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error('Informe um e-mail.');
      return;
    }
    const emailChanged = email.trim().toLowerCase() !== user.email;
    const body: ProfileUpdateInput = { name, surname, phone };
    if (emailChanged) body.email = email.trim();
    save.mutate(body, {
      onSuccess: () =>
        toast.success(
          emailChanged
            ? 'Perfil salvo. Enviamos um link de verificação para o novo e-mail.'
            : 'Perfil salvo',
        ),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Meu perfil</h1>
        <p className="text-sm text-muted-foreground">
          Seus dados pessoais e foto. Valem para todos os perfis financeiros desta conta.
        </p>
      </div>

      {/* --- Foto de perfil --- */}
      <Card className="max-w-2xl p-6">
        <div className="mb-4 flex items-center gap-2">
          <Camera className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Foto de perfil</h2>
        </div>

        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <Avatar className="h-24 w-24 text-3xl">
                {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="Foto de perfil" /> : null}
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              {busy && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPTED_AVATAR_TYPES.join(',')}
                className="hidden"
                onChange={onPickFile}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInput.current?.click()}
                disabled={busy}
              >
                <Camera className="h-4 w-4" />
                Enviar foto
              </Button>
              {user.avatarUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => applyAvatar('', 'Avatar removido')}
                  disabled={busy}
                  aria-label="Remover avatar"
                  title="Remover avatar"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="flex-1">
            <Label className="mb-2 block">Ou escolha um avatar</Label>
            <div className="flex flex-wrap gap-3">
              {PRESET_AVATARS.map((src) => {
                const selected = user.avatarUrl === src;
                return (
                  <button
                    key={src}
                    type="button"
                    onClick={() => applyAvatar(src, 'Avatar atualizado')}
                    disabled={busy}
                    aria-label={`Selecionar avatar ${src}`}
                    aria-pressed={selected}
                    className={cn(
                      'relative h-14 w-14 overflow-hidden rounded-full ring-2 ring-transparent transition hover:scale-105 focus-visible:outline-none focus-visible:ring-ring disabled:opacity-50',
                      selected && 'ring-primary',
                    )}
                  >
                    <img src={src} alt="" className="h-full w-full object-cover" />
                    {selected && (
                      <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              A foto enviada é reduzida automaticamente e guardada com segurança no seu perfil.
            </p>
          </div>
        </div>
      </Card>

      {/* --- Dados pessoais --- */}
      <Card className="max-w-2xl p-6">
        <div className="mb-4 flex items-center gap-2">
          <UserRound className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Dados pessoais</h2>
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                maxLength={120}
                autoComplete="given-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="surname">Sobrenome</Label>
              <Input
                id="surname"
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
                placeholder="Seu sobrenome"
                maxLength={120}
                autoComplete="family-name"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              E-mail
              {user.emailVerified ? (
                <Badge variant="success" className="gap-1">
                  <ShieldCheck className="h-3 w-3" /> Verificado
                </Badge>
              ) : (
                <Badge variant="warning" className="gap-1">
                  <AlertTriangle className="h-3 w-3" /> Não verificado
                </Badge>
              )}
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@exemplo.com"
              autoComplete="email"
            />
            {!user.emailVerified && (
              <p className="text-xs text-muted-foreground">
                Confirme seu e-mail para proteger a conta.{' '}
                <button
                  type="button"
                  onClick={() => resend.mutate()}
                  disabled={resend.isPending}
                  className="font-medium text-primary underline-offset-2 hover:underline disabled:opacity-50"
                >
                  Reenviar verificação
                </button>
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Ao trocar o e-mail, enviaremos um novo link de verificação para o endereço informado.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Telefone
            </Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 98888-7777"
              maxLength={30}
              autoComplete="tel"
            />
            <p className="text-xs text-muted-foreground">
              Usado para contato e para futura recuperação de senha por SMS.
            </p>
          </div>

          <Button type="submit" disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar alterações
          </Button>
        </form>
      </Card>
    </div>
  );
}
