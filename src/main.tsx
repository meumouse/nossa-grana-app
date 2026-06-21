import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import './index.css';
import { App } from './App';
import { Toaster } from './components/ui/sonner';
import { applyTheme, getStoredTheme } from './ui/ThemeProvider';

// Aplica o tema salvo (claro/escuro/sistema) antes da 1ª renderização, evitando
// o flash de tema errado. O ThemeProvider assume a partir daí.
applyTheme(getStoredTheme());

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
