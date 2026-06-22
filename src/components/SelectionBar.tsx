import type { ReactNode } from 'react';
import { CheckSquare, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Barra de ação fixa no rodapé para o modo de seleção em massa. Mostra a
 * contagem, alterna "Selecionar tudo"/"Limpar" (sobre os itens visíveis) e
 * recebe as ações em lote como `children` (ex.: Excluir, Compartilhar).
 */
export function SelectionBar({
  count,
  allSelected,
  onToggleAll,
  onCancel,
  children,
}: {
  count: number;
  allSelected: boolean;
  onToggleAll: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 border-t bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:bottom-0">
      <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{count} selecionado(s)</span>
          <Button variant="ghost" size="sm" onClick={onToggleAll}>
            {allSelected ? <Square className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
            {allSelected ? 'Limpar' : 'Selecionar tudo'}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onCancel}>
            <X className="h-4 w-4" />
            Cancelar
          </Button>
          {children}
        </div>
      </div>
    </div>
  );
}
