import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { authApi } from '@/api/endpoints';
import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';

type Status = 'verifying' | 'success' | 'error';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { status: authStatus, updateUser } = useAuth();
  const [status, setStatus] = useState<Status>('verifying');
  const [message, setMessage] = useState('');
  // StrictMode monta duas vezes em dev; o token é uso único, então só uma chamada.
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (!token) {
      setStatus('error');
      setMessage('Link de verificação inválido.');
      return;
    }
    authApi
      .verifyEmail(token)
      .then(async () => {
        // O backend marcou `emailVerified`, mas o `user` em cache (localStorage)
        // ainda está defasado. Se estiver logado, re-busca o /me e atualiza o
        // estado de auth — senão o perfil seguiria mostrando "Não verificado".
        if (authStatus === 'authed') {
          await authApi
            .me()
            .then(({ user }) => updateUser(user))
            .catch(() => undefined);
        }
        setStatus('success');
      })
      .catch((err) => {
        setStatus('error');
        setMessage(
          err instanceof ApiError ? err.message : 'Não foi possível verificar seu e-mail.',
        );
      });
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl text-primary">Verificação de e-mail</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          {status === 'verifying' && (
            <>
              <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Verificando seu e-mail…</p>
            </>
          )}
          {status === 'success' && (
            <>
              <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
              <p className="text-sm text-muted-foreground">
                E-mail verificado com sucesso! Sua conta está totalmente ativa.
              </p>
              <Button asChild className="w-full">
                <Link to="/">Ir para o app</Link>
              </Button>
            </>
          )}
          {status === 'error' && (
            <>
              <XCircle className="mx-auto h-12 w-12 text-destructive" />
              <p className="text-sm text-muted-foreground">{message}</p>
              <Button asChild variant="outline" className="w-full">
                <Link to="/">Voltar ao app</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
