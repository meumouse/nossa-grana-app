import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { WorkspaceProvider } from './workspace/WorkspaceProvider';
import { SyncProvider } from './sync/SyncProvider';
import { PrivacyProvider } from './ui/PrivacyProvider';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { AccountsPage } from './pages/AccountsPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { PayablesPage } from './pages/PayablesPage';
import { BudgetsPage } from './pages/BudgetsPage';
import { RecurringPage } from './pages/RecurringPage';
import { InstallmentsPage } from './pages/InstallmentsPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { InvestmentsPage } from './pages/InvestmentsPage';
import { ForecastPage } from './pages/ForecastPage';
import { ImportPage } from './pages/ImportPage';
import { SettingsPage } from './pages/SettingsPage';

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
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AuthedShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/payables" element={<PayablesPage />} />
        <Route path="/budgets" element={<BudgetsPage />} />
        <Route path="/recurring" element={<RecurringPage />} />
        <Route path="/installments" element={<InstallmentsPage />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/investments" element={<InvestmentsPage />} />
        <Route path="/forecast" element={<ForecastPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
