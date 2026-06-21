import { useMemo, useState } from 'react';

/**
 * Seleção em massa de itens de uma lista. Guarda os ids/keys marcados e o estado
 * do "modo de seleção". `setMany`/`clear` permitem o atalho "selecionar tudo"
 * (sobre os itens visíveis). `exit` sai do modo e limpa a seleção.
 */
export function useSelection() {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  return useMemo(
    () => ({
      active,
      enter: () => setActive(true),
      selected,
      count: selected.size,
      has: (id: string) => selected.has(id),
      toggle: (id: string) =>
        setSelected((prev) => {
          const next = new Set(prev);
          next.has(id) ? next.delete(id) : next.add(id);
          return next;
        }),
      setMany: (ids: string[]) => setSelected(new Set(ids)),
      clear: () => setSelected(new Set()),
      exit: () => {
        setActive(false);
        setSelected(new Set());
      },
    }),
    [active, selected],
  );
}
