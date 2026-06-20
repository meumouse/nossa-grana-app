import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { workspaceApi } from '../api/endpoints';
import { session } from '../api/tokens';
import { useAuth } from '../auth/AuthProvider';
import type { Workspace } from '../api/types';

interface WorkspaceContextValue {
  workspaces: Workspace[];
  active: Workspace | null;
  activeId: string | null;
  loading: boolean;
  setActive: (id: string) => void;
  refresh: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(() => session.workspaceId);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { workspaces: list } = await workspaceApi.list();
      setWorkspaces(list);
      setActiveId((current) => {
        const valid = current && list.some((w) => w.id === current) ? current : list[0]?.id ?? null;
        if (valid) session.setWorkspace(valid);
        return valid;
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'authed') void refresh();
    else {
      setWorkspaces([]);
      setActiveId(null);
      setLoading(false);
    }
  }, [status, refresh]);

  const setActive = useCallback((id: string) => {
    session.setWorkspace(id);
    setActiveId(id);
  }, []);

  const active = useMemo(() => workspaces.find((w) => w.id === activeId) ?? null, [workspaces, activeId]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({ workspaces, active, activeId, loading, setActive, refresh }),
    [workspaces, active, activeId, loading, setActive, refresh],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace deve estar dentro de <WorkspaceProvider>');
  return ctx;
}
