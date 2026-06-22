import { useState, type ReactNode } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Painel de filtros em sidebar à direita. O gatilho é um botão "Filtros" com a
 * contagem de filtros ativos; o corpo recebe os controles como `children` e o
 * rodapé traz "Limpar" + "Ver resultados". Vale para mobile e desktop.
 *
 * Cada filtro deve vir embrulhado em <FilterField label="…">…</FilterField>.
 */
export function FiltersSheet({
  activeCount,
  onClear,
  children,
  triggerClassName,
}: {
  activeCount: number;
  onClear: () => void;
  children: ReactNode;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className={cn('shrink-0', triggerClassName)}>
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">Filtros</span>
          {activeCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-[85%] flex-col gap-0 p-0 sm:max-w-sm">
        <div className="flex items-center gap-2 border-b p-4">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          <SheetTitle>Filtros</SheetTitle>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">{children}</div>
        <div className="flex items-center gap-2 border-t p-4">
          <Button variant="ghost" className="flex-1" onClick={onClear} disabled={activeCount === 0}>
            <X className="h-4 w-4" />
            Limpar
          </Button>
          <Button className="flex-1" onClick={() => setOpen(false)}>
            Ver resultados
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Rótulo + controle, empilhados verticalmente dentro da sidebar de filtros. */
export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      {children}
    </div>
  );
}
