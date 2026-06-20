import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/dexie';
import { runSync } from './engine';
import { OfflineError } from '../api/client';
import { useWorkspace } from '../workspace/WorkspaceProvider';

interface SyncContextValue {
  online: boolean;
  syncing: boolean;
  lastSync: Date | null;
  pending: number;
  syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);
const INTERVAL = 30_000;

export function SyncProvider({ children }: { children: ReactNode }) {
  const { activeId } = useWorkspace();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const busy = useRef(false);

  const pending = useLiveQuery(async () => {
    if (!activeId) return 0;
    return db.outbox.where('workspaceId').equals(activeId).count();
  }, [activeId]) ?? 0;

  const syncNow = useCallback(async () => {
    if (!activeId || busy.current) return;
    busy.current = true;
    setSyncing(true);
    try {
      await runSync(activeId);
      setLastSync(new Date());
      setOnline(true);
    } catch (err) {
      if (err instanceof OfflineError) setOnline(false);
      // outros erros: silenciosos aqui (o outbox preserva o que falta enviar)
    } finally {
      busy.current = false;
      setSyncing(false);
    }
  }, [activeId]);

  // Sincroniza ao trocar de workspace.
  useEffect(() => {
    if (activeId) void syncNow();
  }, [activeId, syncNow]);

  // Reage a online/offline e a um intervalo de fundo.
  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      void syncNow();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    const id = setInterval(() => {
      if (navigator.onLine) void syncNow();
    }, INTERVAL);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      clearInterval(id);
    };
  }, [syncNow]);

  const value = useMemo<SyncContextValue>(
    () => ({ online, syncing, lastSync, pending, syncNow }),
    [online, syncing, lastSync, pending, syncNow],
  );
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync deve estar dentro de <SyncProvider>');
  return ctx;
}
