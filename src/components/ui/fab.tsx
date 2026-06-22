import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Botão de ação flutuante (FAB) — círculo primário fixo no canto inferior-direito,
 * acima da barra de navegação (respeitando a safe-area). Só aparece no mobile
 * (md:hidden); em telas maiores a ação fica no cabeçalho da página.
 */
export function Fab({
  onClick,
  label,
  icon,
  className,
}: {
  onClick: () => void;
  label: string;
  icon: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'fixed right-4 bottom-[calc(4rem+env(safe-area-inset-bottom)+1rem)] z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 md:hidden',
        className,
      )}
    >
      {icon}
    </button>
  );
}
