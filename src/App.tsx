import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
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
import AIPlaceholder from './pages/AIPlaceholder';

function Protected({ children, admin }: { children: JSX.Element; admin?: boolean }) {
  const { user, loading, isAdmin } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="grid min-h-screen place-items-center"><Spinner /></div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (admin && !isAdmin) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Overview /></Protected>} />
      <Route path="/workspaces" element={<Protected><Workspaces /></Protected>} />
      <Route path="/workspaces/:slug" element={<Protected><WorkspaceDetail /></Protected>} />
      <Route path="/dispositions" element={<Protected><Dispositions /></Protected>} />
      <Route path="/calls" element={<Protected><CallHistory /></Protected>} />
      <Route path="/calls/:callId" element={<Protected><CallDetail /></Protected>} />
      <Route path="/compare" element={<Protected><Compare /></Protected>} />
      <Route path="/agents" element={<Protected><Agents /></Protected>} />
      <Route path="/suggestions" element={<Protected><AIPlaceholder title="AI Suggestions" blurb="LLM-generated campaign optimization suggestions across your workspaces." /></Protected>} />
      <Route path="/prompt-studio" element={<Protected><AIPlaceholder title="Prompt Studio" blurb="Generate and refine outbound agent prompts, scripts, and follow-up flows." /></Protected>} />
      <Route path="/reports" element={<Protected><AIPlaceholder title="Reports" blurb="Executive-summary reports with AI-written insights." /></Protected>} />
      <Route path="/users" element={<Protected admin><UsersAdmin /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
