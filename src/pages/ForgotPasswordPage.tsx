import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';
import { authApi } from '@/api/endpoints';
import { ApiError } from '@/api/client';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+$/.test(email)) {
      toast.error('Informe um e-mail válido');
      return;
    }
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
      // A resposta é genérica de propósito (não revela se a conta existe).
      setSent(true);
    } catch (err) {
      toast.error('Não foi possível enviar o e-mail', {
        description: err instanceof ApiError ? err.message : 'Verifique sua conexão',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl text-primary">Recuperar senha</CardTitle>
          <CardDescription>
            {sent
              ? 'Confira sua caixa de entrada'
              : 'Enviaremos um link para você criar uma nova senha'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4 text-center">
              <MailCheck className="mx-auto h-12 w-12 text-primary" />
              <p className="text-sm text-muted-foreground">
                Se houver uma conta associada a <span className="font-medium">{email}</span>,
                você receberá um e-mail com o link de redefinição em instantes. O link expira em
                30 minutos.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link to="/login">Voltar ao login</Link>
              </Button>
            </div>
          ) : (
            <>
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="voce@exemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Enviar link
                </Button>
              </form>
              <p className="mt-4 text-center text-sm text-muted-foreground">
                Lembrou a senha?{' '}
                <Link to="/login" className="font-medium text-primary hover:underline">
                  Entrar
                </Link>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
