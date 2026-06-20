import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  CalendarClock,
  PiggyBank,
  RefreshCw as RecurringIcon,
  CreditCard,
  Receipt,
  TrendingUp,
  LineChart,
  Sparkles,
  Eye,
  EyeOff,
  RefreshCw,
  Cloud,
  CloudOff,
  LogOut,
  Menu as MenuIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/auth/AuthProvider';
import { useWorkspace } from '@/workspace/WorkspaceProvider';
import { useSync } from '@/sync/SyncProvider';
import { usePrivacy } from '@/ui/PrivacyProvider';

const LINKS = [
  { to: '/', label: 'Início', icon: LayoutDashboard },
  { to: '/transactions', label: 'Lançamentos', icon: ArrowLeftRight },
  { to: '/accounts', label: 'Contas', icon: Wallet },
  { to: '/payables', label: 'A pagar/receber', icon: CalendarClock },
  { to: '/budgets', label: 'Orçamentos', icon: PiggyBank },
  { to: '/recurring', label: 'Recorrências', icon: RecurringIcon },
  { to: '/installments', label: 'Parcelamentos', icon: CreditCard },
  { to: '/invoices', label: 'Faturas', icon: Receipt },
  { to: '/investments', label: 'Investimentos', icon: TrendingUp },
  { to: '/forecast', label: 'Previsão', icon: LineChart },
  { to: '/import', label: 'Importar (IA)', icon: Sparkles },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {LINKS.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.to === '/'}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )
          }
        >
          <link.icon className="h-5 w-5" />
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}

function SyncStatus() {
  const { online, syncing, pending, syncNow } = useSync();
  return (
    <div className="flex items-center gap-2">
      {pending > 0 && (
        <Badge variant="warning" className="hidden sm:inline-flex">
          {pending} na fila
        </Badge>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => void syncNow()}
        title={online ? 'Online — sincronizar agora' : 'Offline (mudanças ficam na fila)'}
        aria-label="Sincronizar"
      >
        {syncing ? (
          <RefreshCw className="h-5 w-5 animate-spin" />
        ) : online ? (
          <Cloud className="h-5 w-5 text-success" />
        ) : (
          <CloudOff className="h-5 w-5 text-warning" />
        )}
      </Button>
    </div>
  );
}

export function AppLayout() {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const { workspaces, activeId, setActive } = useWorkspace();
  const { hidden, toggle: togglePrivacy } = usePrivacy();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b bg-background/95 px-4 backdrop-blur">
        <div className="flex items-center gap-2">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menu">
                <MenuIcon className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64">
              <SheetTitle className="mb-4 text-primary">Nossa Grana</SheetTitle>
              <NavLinks onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <span className="hidden text-lg font-extrabold text-primary sm:inline">Nossa Grana</span>
        </div>

        <div className="flex items-center gap-1.5">
          <Select value={activeId ?? undefined} onValueChange={(v) => setActive(v)}>
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue placeholder="Workspace" />
            </SelectTrigger>
            <SelectContent>
              {workspaces.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="icon"
            onClick={togglePrivacy}
            aria-label="Privacidade"
            title={hidden ? 'Mostrar valores' : 'Ocultar valores'}
          >
            {hidden ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </Button>

          <SyncStatus />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Avatar className="h-8 w-8 cursor-pointer">
                <AvatarFallback>{(user?.name ?? user?.email ?? '?').slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="max-w-[200px] truncate font-normal text-muted-foreground">
                {user?.email}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void logout()}>
                <LogOut className="h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl gap-6 px-4 py-6">
        <aside className="hidden w-56 shrink-0 md:block">
          <div className="sticky top-20">
            <NavLinks />
          </div>
        </aside>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
