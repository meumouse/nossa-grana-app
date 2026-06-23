import type { ReactNode } from 'react';
import { CheckSquare, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Barra de ação fixa no rodapé para o modo de seleção em massa. Mostra a
 * contagem, o total líquido selecionado, alterna "Selecionar tudo"/"Limpar"
 * (sobre os itens visíveis) e recebe as ações em lote como `children`
 * (ex.: Excluir, Compartilhar).
 */
export function SelectionBar({
  count,
  total,
  hidden = false,
  allSelected,
  onToggleAll,
  onCancel,
  children,
}: {
  count: number;
  total?: number;
  hidden?: boolean;
  allSelected: boolean;
  onToggleAll: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 border-t bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:bottom-0">
      <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex flex-col leading-tight">
            <span className="text-sm text-muted-foreground">{count} selecionado(s)</span>
            {total !== undefined && count > 0 && (
              <span
                className={cn(
                  'text-sm font-bold tabular-nums',
                  total > 0 ? 'text-success' : total < 0 ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {total > 0 ? '+' : ''}
                {formatMoney(total, hidden)}
              </span>
            )}
          </div>
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
