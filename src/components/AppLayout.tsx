import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
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
  Settings,
  Users,
  UserRound,
  Eye,
  EyeOff,
  RefreshCw,
  Cloud,
  CloudOff,
  LogOut,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { initialsFrom } from '@/lib/avatars';
import { useAuth } from '@/auth/AuthProvider';
import { useWorkspace } from '@/workspace/WorkspaceProvider';
import { useSync } from '@/sync/SyncProvider';
import { usePrivacy } from '@/ui/PrivacyProvider';
import { useTheme } from '@/ui/ThemeProvider';
import type { ThemeMode } from '@/ui/ThemeProvider';
import { InvitationsNotice } from '@/components/InvitationsNotice';
import { BottomNav } from '@/components/BottomNav';
import { PENDING_INVITE_KEY } from '@/pages/InviteAcceptPage';

// Ordem de ciclagem do botão de tema no header.
const THEME_CYCLE: ThemeMode[] = ['light', 'dark', 'system'];
const THEME_LABEL: Record<ThemeMode, string> = {
  light: 'Tema claro',
  dark: 'Tema escuro',
  system: 'Tema do sistema',
};

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next = THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length]!;
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(next)}
      aria-label="Alternar tema"
      title={`${THEME_LABEL[theme]} — clique para ${THEME_LABEL[next].toLowerCase()}`}
    >
      <Icon className="h-5 w-5" />
    </Button>
  );
}

/** Linha de tema com rótulo — usada dentro do menu lateral (sheet) no mobile,
 * onde o botão de tema do header fica oculto. */
function ThemeRow() {
  const { theme, setTheme } = useTheme();
  const next = THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length]!;
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="flex w-full items-center gap-3 rounded-lg border bg-background/40 px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
    >
      <Icon className="h-[18px] w-[18px]" />
      {THEME_LABEL[theme]}
    </button>
  );
}

export const LINKS = [
  { to: '/', label: 'Início', icon: LayoutDashboard },
  { to: '/transactions', label: 'Extrato', icon: ArrowLeftRight },
  { to: '/accounts', label: 'Contas', icon: Wallet },
  { to: '/cards', label: 'Cartões', icon: CreditCard },
  { to: '/payables', label: 'A pagar/receber', icon: CalendarClock },
  { to: '/budgets', label: 'Orçamentos', icon: PiggyBank },
  { to: '/recurring', label: 'Recorrências', icon: RecurringIcon },
  { to: '/installments', label: 'Parcelamentos', icon: CreditCard },
  { to: '/invoices', label: 'Faturas', icon: Receipt },
  { to: '/investments', label: 'Investimentos', icon: TrendingUp },
  { to: '/forecast', label: 'Previsão', icon: LineChart },
  { to: '/members', label: 'Família', icon: Users },
  { to: '/profile', label: 'Perfil', icon: UserRound },
  { to: '/settings', label: 'Configurações', icon: Settings },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <Wallet className="h-5 w-5" />
      </span>
      <div className="leading-tight">
        <p className="text-sm font-extrabold tracking-tight">Nossa Grana</p>
        <p className="text-[11px] text-muted-foreground">Finanças</p>
      </div>
    </div>
  );
}

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
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )
          }
        >
          <link.icon className="h-[18px] w-[18px]" />
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}

function ProfileBlock({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const initials = initialsFrom(user?.name ?? null, user?.surname ?? null, user?.email ?? '');
  const fullName = [user?.name, user?.surname].filter(Boolean).join(' ');
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-background/40 p-2.5">
      <NavLink
        to="/profile"
        onClick={onNavigate}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md transition-opacity hover:opacity-80"
        title="Editar perfil"
      >
        <Avatar className="h-9 w-9">
          {user?.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{fullName || 'Você'}</p>
          <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
        </div>
      </NavLink>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => void logout()} title="Sair" aria-label="Sair">
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}

function SidebarContent({ onNavigate, mobile }: { onNavigate?: () => void; mobile?: boolean }) {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="px-2 pt-1">
        <Brand />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        <p className="px-3 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Menu
        </p>
        <NavLinks onNavigate={onNavigate} />
      </div>
      <div className="space-y-2 px-2 pb-1">
        {/* O botão de tema do header some no mobile; aqui no sheet ele reaparece. */}
        {mobile && <ThemeRow />}
        <ProfileBlock onNavigate={onNavigate} />
      </div>
    </div>
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

/**
 * Retoma um convite aberto deslogado: o token ficou em localStorage; assim que o
 * usuário autentica, levamos ele à tela de aceite (uma vez).
 */
function PendingInviteRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    const token = localStorage.getItem(PENDING_INVITE_KEY);
    if (token && location.pathname !== '/invite') {
      navigate(`/invite?token=${encodeURIComponent(token)}`, { replace: true });
    }
  }, [navigate, location.pathname]);
  return null;
}

export function AppLayout() {
  const [open, setOpen] = useState(false);
  const { workspaces, activeId, setActive } = useWorkspace();
  const { hidden, toggle: togglePrivacy } = usePrivacy();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar fixa (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-card/40 p-3 md:flex">
        <SidebarContent />
      </aside>

      {/* Menu completo (sheet) — controlado: abre pelo "Mais" da barra inferior. */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 p-3">
          <SheetTitle className="sr-only">Navegação</SheetTitle>
          <SidebarContent mobile onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Coluna principal */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-2 border-b bg-background/85 px-4 pt-safe-t backdrop-blur md:px-6">
          <span className="md:hidden">
            <Brand />
          </span>

          <div className="flex items-center gap-1.5">
            <Select value={activeId ?? undefined} onValueChange={(v) => setActive(v)}>
              <SelectTrigger className="h-9 w-[128px] sm:w-[160px]">
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

            {/* Tema fica no header só a partir de sm; no mobile vai p/ o sheet. */}
            <span className="hidden sm:inline-flex">
              <ThemeToggle />
            </span>

            <SyncStatus />
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 pb-[calc(4rem+env(safe-area-inset-bottom)+1rem)] md:p-6 md:pb-6">
          <PendingInviteRedirect />
          <InvitationsNotice />
          <Outlet />
        </main>

        <BottomNav onMore={() => setOpen(true)} />
      </div>
    </div>
  );
}
