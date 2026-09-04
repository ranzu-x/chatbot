import { Navigate } from 'react-router';
import { useAuth } from '../Provider/AuthContext';

const ROLE_HOME = {
  ADMIN:  '/admin',
  AGENCY: '/agency',
  AGENT:  '/inbox',
};

export default function PublicRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="loading-spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  // If already authenticated, redirect to their role home page
  if (user) {
    const home = ROLE_HOME[user.role] || '/agency';
    return <Navigate to={home} replace />;
  }

  return children;
}
