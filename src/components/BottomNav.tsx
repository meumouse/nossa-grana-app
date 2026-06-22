import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ArrowLeftRight, Wallet, CreditCard, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Barra de navegação inferior — só no mobile (md:hidden). Expõe os destinos mais
 * usados ao alcance do polegar e um botão "Mais" que reabre o menu completo (o
 * mesmo Sheet controlado pelo AppLayout). Respeita a safe-area do rodapé.
 */
const PRIMARY = [
  { to: '/', label: 'Início', icon: LayoutDashboard },
  { to: '/transactions', label: 'Extrato', icon: ArrowLeftRight },
  { to: '/accounts', label: 'Contas', icon: Wallet },
  { to: '/cards', label: 'Cartões', icon: CreditCard },
] as const;

const itemClass =
  'flex flex-1 flex-col items-center justify-center gap-0.5 rounded-md py-1.5 text-[10px] font-medium leading-none transition-colors';

export function BottomNav({ onMore }: { onMore: () => void }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-safe-b backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
      aria-label="Navegação principal"
    >
      <div className="flex h-16 items-stretch gap-0.5 px-1">
        {PRIMARY.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            className={({ isActive }) =>
              cn(itemClass, isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground')
            }
          >
            <link.icon className="h-5 w-5" />
            {link.label}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={onMore}
          className={cn(itemClass, 'text-muted-foreground hover:text-foreground')}
          aria-label="Mais opções"
        >
          <MoreHorizontal className="h-5 w-5" />
          Mais
        </button>
      </div>
    </nav>
  );
}
