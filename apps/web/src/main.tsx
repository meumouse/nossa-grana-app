import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import './index.css';
import { App } from './App';
import { Toaster } from './components/ui/sonner';

// Tema: segue a preferência do sistema (classe .dark exigida pelo Tailwind/shadcn).
const applyTheme = (dark: boolean) => document.documentElement.classList.toggle('dark', dark);
const mql = window.matchMedia('(prefers-color-scheme: dark)');
applyTheme(mql.matches);
mql.addEventListener('change', (e) => applyTheme(e.matches));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  </StrictMode>,
);
