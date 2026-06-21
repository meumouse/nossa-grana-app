import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Rodapé "Carregar mais" das listas paginadas no cliente. Mostra o botão (quando
 * há mais itens) e o contador "X de Y". Esconde-se sozinho em listas pequenas.
 */
export function LoadMore({
  shown,
  total,
  hasMore,
  onLoadMore,
  className,
}: {
  shown: number;
  total: number;
  hasMore: boolean;
  onLoadMore: () => void;
  className?: string;
}) {
  if (total === 0) return null;
  return (
    <div className={`flex flex-col items-center gap-1.5 pt-2 ${className ?? ''}`}>
      {hasMore && (
        <Button variant="outline" size="sm" onClick={onLoadMore}>
          <ChevronDown className="h-4 w-4" />
          Carregar mais
        </Button>
      )}
      <span className="text-xs text-muted-foreground">
        Mostrando {shown} de {total}
      </span>
    </div>
  );
}
