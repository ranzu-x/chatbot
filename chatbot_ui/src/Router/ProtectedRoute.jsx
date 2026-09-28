import { Navigate } from 'react-router';
import { useAuth } from '../Provider/AuthContext';

const ROLE_HOME = {
  ADMIN:    '/admin',
  RESELLER: '/agency',
  USER:     '/agency',
};

// `accountTypes`: the workspace types allowed besides the Super Admin (e.g. only a
// RESELLER owner — End User owners share the RESELLER role in code).
// `requires`: a flag on the signed-in user (from /auth/me) that must be true, e.g.
// 'canManageDeveloperApps' (chatbot_api/middleware/developerAppsAccess.js).
export default function ProtectedRoute({ roles, accountTypes, requires, children }) {
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

  if ((roles && !roles.includes(user.role)) || (accountTypes && user.role !== 'ADMIN' && !accountTypes.includes(user.accountType)) || (requires && !user[requires])) {
    const home = ROLE_HOME[user.role] || '/login';
    return <Navigate to={home} replace />;
  }

  return children;
}
