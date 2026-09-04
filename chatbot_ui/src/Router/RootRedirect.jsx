import { Navigate } from 'react-router';
import { useAuth } from '../Provider/AuthContext';

const ROLE_HOME = {
  ADMIN:  '/admin',
  AGENCY: '/agency',
  AGENT:  '/inbox',
};

export default function RootRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="loading-spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  // If user has an active JWT session, redirect to role-based dashboard
  if (user) {
    const home = ROLE_HOME[user.role] || '/agency';
    return <Navigate to={home} replace />;
  }

  // If user is logged out or unauthenticated, redirect to /login
  return <Navigate to="/login" replace />;
}
