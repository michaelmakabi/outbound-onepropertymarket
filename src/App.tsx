import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { WorkspaceProvider } from './lib/workspace';
import { Spinner } from './components/ui';
import Layout from './components/Layout';
import Login from './pages/Login';
import Overview from './pages/Overview';
import Workspaces from './pages/Workspaces';
import WorkspaceDetail from './pages/WorkspaceDetail';
import Dispositions from './pages/Dispositions';
import CallHistory from './pages/CallHistory';
import CallDetail from './pages/CallDetail';
import Compare from './pages/Compare';
import Agents from './pages/Agents';
import UsersAdmin from './pages/UsersAdmin';
import UsageAnalytics from './pages/UsageAnalytics';
import Contacts from './pages/Contacts';
import ContactDetail from './pages/ContactDetail';
import Suggestions from './pages/Suggestions';
import PromptStudio from './pages/PromptStudio';
import Reports from './pages/Reports';
import LeadDetail from './pages/LeadDetail';
import Pipelines from './pages/Pipelines';
import SellerContacts from './pages/SellerContacts';
import TestAI from './pages/TestAI';
import Billing from './pages/Billing';
import Integrations from './pages/Integrations';
import Tenants from './pages/Tenants';
import CustomerDetail from './pages/CustomerDetail';
import Account from './pages/Account';
import Register from './pages/Register';
import RegisterComplete from './pages/RegisterComplete';
import Onboarding from './pages/Onboarding';

// admin: admin/super_admin only. op: operator tooling — hidden from customers (role=user).
function Protected({ children, admin, op }: { children: JSX.Element; admin?: boolean; op?: boolean }) {
  const { user, loading, isAdmin } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="grid min-h-screen place-items-center"><Spinner /></div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (admin && !isAdmin) return <Navigate to="/" replace />;
  if (op && user.role === 'user') return <Navigate to="/" replace />;
  return <WorkspaceProvider><Layout>{children}</Layout></WorkspaceProvider>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/register/complete" element={<RegisterComplete />} />
      <Route path="/" element={<Protected><Overview /></Protected>} />
      <Route path="/workspaces" element={<Protected op><Workspaces /></Protected>} />
      <Route path="/workspaces/:slug" element={<Protected op><WorkspaceDetail /></Protected>} />
      <Route path="/dispositions" element={<Protected><Dispositions /></Protected>} />
      <Route path="/calls" element={<Protected><CallHistory /></Protected>} />
      <Route path="/calls/:callId" element={<Protected><CallDetail /></Protected>} />
      <Route path="/contacts" element={<Protected><Contacts /></Protected>} />
      <Route path="/contacts/:number" element={<Protected><ContactDetail /></Protected>} />
      <Route path="/leads" element={<Protected><SellerContacts /></Protected>} />
      <Route path="/leads/:id" element={<Protected><LeadDetail /></Protected>} />
      <Route path="/seller-contacts" element={<Protected><SellerContacts /></Protected>} />
      <Route path="/pipelines" element={<Protected><Pipelines /></Protected>} />
      <Route path="/compare" element={<Protected op><Compare /></Protected>} />
      <Route path="/agents" element={<Protected op><Agents /></Protected>} />
      <Route path="/test-ai" element={<Protected><TestAI /></Protected>} />
      <Route path="/suggestions" element={<Protected op><Suggestions /></Protected>} />
      <Route path="/prompt-studio" element={<Protected op><PromptStudio /></Protected>} />
      <Route path="/reports" element={<Protected op><Reports /></Protected>} />
      <Route path="/account" element={<Protected><Account /></Protected>} />
      <Route path="/billing" element={<Protected admin><Billing /></Protected>} />
      <Route path="/integrations" element={<Protected admin><Integrations /></Protected>} />
      <Route path="/tenants" element={<Protected admin><Tenants /></Protected>} />
      <Route path="/tenants/:slug" element={<Protected admin><CustomerDetail /></Protected>} />
      <Route path="/onboarding" element={<Protected admin><Onboarding /></Protected>} />
      <Route path="/usage" element={<Protected admin><UsageAnalytics /></Protected>} />
      <Route path="/users" element={<Protected admin><UsersAdmin /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
