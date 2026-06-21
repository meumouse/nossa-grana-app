import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/ui/ThemeProvider';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const GSI_SRC = 'https://accounts.google.com/gsi/client';

// Tipagem mínima do Google Identity Services (window.google.accounts.id).
interface GoogleCredentialResponse {
  credential: string;
}
interface GoogleIdApi {
  initialize: (config: {
    client_id: string;
    callback: (res: GoogleCredentialResponse) => void;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      type?: 'standard' | 'icon';
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      text?: 'signin_with' | 'signup_with' | 'continue_with';
      shape?: 'rectangular' | 'pill';
      width?: number;
      locale?: string;
    },
  ) => void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } };
  }
}

// Carrega o script do GIS uma única vez e compartilha a promise entre instâncias.
let scriptPromise: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Falha ao carregar o Google'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** Habilitado somente quando o Client ID do Google está configurado no build. */
export const googleSignInEnabled = Boolean(CLIENT_ID);

interface Props {
  onCredential: (credential: string) => void;
  text?: 'signin_with' | 'signup_with' | 'continue_with';
}

/**
 * Renderiza o botão oficial do Google Identity Services. Ao concluir, entrega o
 * ID token (`credential`) via `onCredential` — o chamador troca por nossa sessão.
 * Não renderiza nada se o Client ID não estiver configurado.
 */
export function GoogleSignInButton({ onCredential, text = 'continue_with' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { resolved } = useTheme();
  const [failed, setFailed] = useState(false);
  // Mantém o callback atual sem reinicializar o GIS a cada render.
  const cbRef = useRef(onCredential);
  cbRef.current = onCredential;

  useEffect(() => {
    if (!CLIENT_ID || !ref.current) return;
    let cancelled = false;

    loadGsi()
      .then(() => {
        if (cancelled || !ref.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (res) => cbRef.current(res.credential),
        });
        ref.current.innerHTML = '';
        window.google.accounts.id.renderButton(ref.current, {
          type: 'standard',
          theme: resolved === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          text,
          shape: 'rectangular',
          width: ref.current.clientWidth || 320,
          locale: 'pt-BR',
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [resolved, text]);

  if (!CLIENT_ID) return null;
  if (failed) {
    return (
      <p className="text-center text-xs text-muted-foreground">
        Não foi possível carregar o Google. Verifique sua conexão.
      </p>
    );
  }
  // `flex justify-center` centraliza o iframe do botão (que tem largura fixa).
  return <div ref={ref} className="flex w-full justify-center" />;
}
