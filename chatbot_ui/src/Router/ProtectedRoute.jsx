import { Navigate } from 'react-router';
import { useAuth } from '../Provider/AuthContext';

const ROLE_HOME = {
  ADMIN:  '/admin',
  AGENCY: '/agency',
  AGENT:  '/inbox',
};

export default function ProtectedRoute({ roles, children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="loading-spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    const home = ROLE_HOME[user.role] || '/login';
    return <Navigate to={home} replace />;
  }

  return children;
}
