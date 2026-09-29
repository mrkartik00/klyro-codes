import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { AppShell } from '../components/layout/AppShell.jsx';
import { Spinner } from '../components/ui/index.jsx';

import Login from '../pages/Login.jsx';
import Dashboard from '../pages/Dashboard.jsx';
import Leads from '../pages/Leads.jsx';
import LeadDetail from '../pages/LeadDetail.jsx';
import Targets from '../pages/Targets.jsx';
import Campaigns from '../pages/Campaigns.jsx';
import CampaignDetail from '../pages/CampaignDetail.jsx';
import Templates from '../pages/Templates.jsx';
import Mailboxes from '../pages/Mailboxes.jsx';
import Approvals from '../pages/Approvals.jsx';
import Deals from '../pages/Deals.jsx';
import Quotations from '../pages/Quotations.jsx';
import Portfolio from '../pages/Portfolio.jsx';
import Settings from '../pages/Settings.jsx';
import AuditLog from '../pages/AuditLog.jsx';
import TwoFactor from '../pages/TwoFactor.jsx';
import NotFound from '../pages/NotFound.jsx';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-background">
        <Spinner />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <Protected>
            <AppShell />
          </Protected>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/leads/:id" element={<LeadDetail />} />
        <Route path="/targets" element={<Targets />} />
        <Route path="/campaigns" element={<Campaigns />} />
        <Route path="/campaigns/:id" element={<CampaignDetail />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="/mailboxes" element={<Mailboxes />} />
        <Route path="/approvals" element={<Approvals />} />
        <Route path="/deals" element={<Deals />} />
        <Route path="/quotations" element={<Quotations />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/audit" element={<AuditLog />} />
        <Route path="/2fa" element={<TwoFactor />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
