import { useEffect, useMemo, useState } from 'react';

/** Tamanho de página padrão das listas paginadas no cliente. */
export const DEFAULT_PAGE_SIZE = 20;

export interface PagedList<T> {
  /** Itens da página atual (do início até o limite revelado). */
  visible: T[];
  /** Há itens além dos já revelados. */
  hasMore: boolean;
  /** Revela mais uma página. */
  loadMore: () => void;
  /** Quantidade revelada. */
  shown: number;
  /** Total de itens (após filtros). */
  total: number;
}

/**
 * Paginação "carregar mais" no cliente, sobre uma lista já carregada/filtrada.
 * Revela `pageSize` itens por vez. Volta para a 1ª página sempre que `resetKey`
 * muda (ex.: filtros/busca) — assim a lista não fica "presa" numa página antiga.
 */
export function usePagedList<T>(
  items: T[],
  opts: { pageSize?: number; resetKey?: unknown } = {},
): PagedList<T> {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const [count, setCount] = useState(pageSize);

  useEffect(() => {
    setCount(pageSize);
  }, [opts.resetKey, pageSize]);

  const visible = useMemo(() => items.slice(0, count), [items, count]);
  return {
    visible,
    hasMore: items.length > count,
    loadMore: () => setCount((c) => c + pageSize),
    shown: visible.length,
    total: items.length,
  };
}
