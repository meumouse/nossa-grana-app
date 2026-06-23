import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { WorkspaceProvider } from './workspace/WorkspaceProvider';
import { SyncProvider } from './sync/SyncProvider';
import { PrivacyProvider } from './ui/PrivacyProvider';
import { ThemeProvider } from './ui/ThemeProvider';
import { Toaster } from './components/ui/sonner';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { DashboardPage } from './pages/DashboardPage';
import { AccountsPage } from './pages/AccountsPage';
import { CardsPage } from './pages/CardsPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { DocumentosPage } from './pages/DocumentosPage';
import { PayablesPage } from './pages/PayablesPage';
import { BudgetsPage } from './pages/BudgetsPage';
import { RecurringPage } from './pages/RecurringPage';
import { InstallmentsPage } from './pages/InstallmentsPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { InvestmentsPage } from './pages/InvestmentsPage';
import { ForecastPage } from './pages/ForecastPage';
import { SettingsPage } from './pages/SettingsPage';
import { ProfilePage } from './pages/ProfilePage';
import { MembersPage } from './pages/MembersPage';
import { InviteAcceptPage } from './pages/InviteAcceptPage';

function FullLoader() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

function AuthedShell() {
  return (
    <WorkspaceProvider>
      <SyncProvider>
        <PrivacyProvider>
          <AppLayout />
        </PrivacyProvider>
      </SyncProvider>
    </WorkspaceProvider>
  );
}

function AppRoutes() {
  const { status } = useAuth();
  if (status === 'loading') return <FullLoader />;

  if (status !== 'authed') {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/invite" element={<InviteAcceptPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      {/* Verificação de e-mail funciona logado (usuário clicou no link do e-mail). */}
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route element={<AuthedShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/cards" element={<CardsPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/documents" element={<DocumentosPage />} />
        <Route path="/payables" element={<PayablesPage />} />
        <Route path="/budgets" element={<BudgetsPage />} />
        <Route path="/recurring" element={<RecurringPage />} />
        <Route path="/installments" element={<InstallmentsPage />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/investments" element={<InvestmentsPage />} />
        <Route path="/forecast" element={<ForecastPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/members" element={<MembersPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/invite" element={<InviteAcceptPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
      <Toaster position="top-right" richColors />
    </ThemeProvider>
  );
}
