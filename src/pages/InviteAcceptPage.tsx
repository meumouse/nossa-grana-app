import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Users, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/auth/AuthProvider';
import { useWorkspace } from '@/workspace/WorkspaceProvider';
import { invitationApi } from '@/api/endpoints';
import { ApiError } from '@/api/client';

/** Token guardado quando o convidado abre o link deslogado — retomado após login. */
export const PENDING_INVITE_KEY = 'ng_pending_invite';

/**
 * Tela de aceite de convite (`/invite?token=...`). Disponível logado e deslogado:
 *  - Deslogado: guarda o token e oferece entrar/criar conta (retoma depois).
 *  - Logado: aceita (posse do link basta) ou recusa.
 */
export function InviteAcceptPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { status } = useAuth();
  const authed = status === 'authed';

  // Token da URL ou, ao retomar após login, do storage.
  const token = params.get('token') ?? localStorage.getItem(PENDING_INVITE_KEY) ?? '';
  const [busy, setBusy] = useState(false);

  // Deslogado: persiste o token p/ retomar após autenticar.
  useEffect(() => {
    if (!authed && token) localStorage.setItem(PENDING_INVITE_KEY, token);
  }, [authed, token]);

  if (!token) {
    return (
      <Shell>
        <CardTitle>Convite inválido</CardTitle>
        <CardDescription>O link do convite está incompleto ou expirou.</CardDescription>
        <Button className="mt-4 w-full" onClick={() => navigate('/')}>
          Ir para o início
        </Button>
      </Shell>
    );
  }

  if (!authed) {
    const next = `/invite?token=${encodeURIComponent(token)}`;
    return (
      <Shell>
        <CardTitle>Você recebeu um convite</CardTitle>
        <CardDescription>
          Entre ou crie sua conta no Nossa Grana para participar do perfil financeiro.
        </CardDescription>
        <div className="mt-4 space-y-2">
          <Button className="w-full" asChild>
            <Link to={`/login?next=${encodeURIComponent(next)}`}>Entrar</Link>
          </Button>
          <Button variant="outline" className="w-full" asChild>
            <Link to={`/register?next=${encodeURIComponent(next)}`}>Criar conta</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  return <AuthedAccept token={token} busy={busy} setBusy={setBusy} onDone={() => navigate('/')} />;
}

function AuthedAccept({
  token,
  busy,
  setBusy,
  onDone,
}: {
  token: string;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onDone: () => void;
}) {
  const { refresh, setActive } = useWorkspace();

  const finish = () => {
    localStorage.removeItem(PENDING_INVITE_KEY);
    onDone();
  };

  const accept = async () => {
    setBusy(true);
    try {
      const { workspaceId } = await invitationApi.accept(token);
      await refresh();
      setActive(workspaceId);
      toast.success('Você entrou no perfil!');
      finish();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível aceitar o convite');
      if (err instanceof ApiError) localStorage.removeItem(PENDING_INVITE_KEY);
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    setBusy(true);
    try {
      await invitationApi.decline(token);
      toast('Convite recusado');
    } catch {
      /* silencioso — recusar é melhor-esforço */
    } finally {
      setBusy(false);
      finish();
    }
  };

  return (
    <Shell>
      <CardTitle>Aceitar convite</CardTitle>
      <CardDescription>
        Você foi convidado(a) para um perfil financeiro compartilhado. Deseja entrar?
      </CardDescription>
      <div className="mt-4 space-y-2">
        <Button className="w-full" onClick={() => void accept()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Aceitar e entrar
        </Button>
        <Button variant="outline" className="w-full" onClick={() => void decline()} disabled={busy}>
          <X className="h-4 w-4" />
          Recusar
        </Button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Users className="h-6 w-6" />
          </span>
          {children}
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
