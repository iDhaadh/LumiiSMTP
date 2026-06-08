import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth';
import Layout from './components/Layout';
import LoginPage from './pages/Login';
import RegisterPage from './pages/Register';
import OverviewPage from './pages/Overview';
import LogsPage from './pages/Logs';
import DomainsPage from './pages/Domains';
import ApiKeysPage from './pages/ApiKeys';
import WebhooksPage from './pages/Webhooks';
import SuppressionsPage from './pages/Suppressions';
import SmtpUsersPage from './pages/SmtpUsers';
import AdminPage from './pages/Admin';
import SettingsPage from './pages/Settings';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<OverviewPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="domains" element={<DomainsPage />} />
          <Route path="apikeys" element={<ApiKeysPage />} />
          <Route path="webhooks" element={<WebhooksPage />} />
          <Route path="suppressions" element={<SuppressionsPage />} />
          <Route path="smtp-users" element={<SmtpUsersPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
