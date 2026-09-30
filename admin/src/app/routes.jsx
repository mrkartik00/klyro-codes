import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { AppShell } from '../components/layout/AppShell.jsx';
import { Spinner } from '../components/ui/index.jsx';

import Login from '../pages/Login.jsx';
const Dashboard = lazy(() => import('../pages/Dashboard.jsx'));
const Leads = lazy(() => import('../pages/Leads.jsx'));
const Schedules = lazy(() => import('../pages/Schedules.jsx'));
const Clip = lazy(() => import('../pages/Clip.jsx'));
const ApiKeys = lazy(() => import('../pages/ApiKeys.jsx'));
const LeadDetail = lazy(() => import('../pages/LeadDetail.jsx'));
const Targets = lazy(() => import('../pages/Targets.jsx'));
const Campaigns = lazy(() => import('../pages/Campaigns.jsx'));
const CampaignDetail = lazy(() => import('../pages/CampaignDetail.jsx'));
const Templates = lazy(() => import('../pages/Templates.jsx'));
const Mailboxes = lazy(() => import('../pages/Mailboxes.jsx'));
const Approvals = lazy(() => import('../pages/Approvals.jsx'));
const Deals = lazy(() => import('../pages/Deals.jsx'));
const Quotations = lazy(() => import('../pages/Quotations.jsx'));
const Portfolio = lazy(() => import('../pages/Portfolio.jsx'));
const Settings = lazy(() => import('../pages/Settings.jsx'));
const AuditLog = lazy(() => import('../pages/AuditLog.jsx'));
const TwoFactor = lazy(() => import('../pages/TwoFactor.jsx'));
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

// Each page is its own chunk, loaded on first visit (smaller first load).
const PageFallback = () => (
  <div className="flex justify-center py-16">
    <Spinner />
  </div>
);
function Page({ children }) {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>;
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
        <Route path="/" element={<Page><Dashboard /></Page>} />
        <Route path="/leads" element={<Page><Leads /></Page>} />
        <Route path="/leads/:id" element={<Page><LeadDetail /></Page>} />
        <Route path="/targets" element={<Page><Targets /></Page>} />
        <Route path="/schedules" element={<Page><Schedules /></Page>} />
        <Route path="/clip" element={<Page><Clip /></Page>} />
        <Route path="/keys" element={<Page><ApiKeys /></Page>} />
        <Route path="/campaigns" element={<Page><Campaigns /></Page>} />
        <Route path="/campaigns/:id" element={<Page><CampaignDetail /></Page>} />
        <Route path="/templates" element={<Page><Templates /></Page>} />
        <Route path="/mailboxes" element={<Page><Mailboxes /></Page>} />
        <Route path="/approvals" element={<Page><Approvals /></Page>} />
        <Route path="/deals" element={<Page><Deals /></Page>} />
        <Route path="/quotations" element={<Page><Quotations /></Page>} />
        <Route path="/portfolio" element={<Page><Portfolio /></Page>} />
        <Route path="/settings" element={<Page><Settings /></Page>} />
        <Route path="/audit" element={<Page><AuditLog /></Page>} />
        <Route path="/2fa" element={<Page><TwoFactor /></Page>} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
