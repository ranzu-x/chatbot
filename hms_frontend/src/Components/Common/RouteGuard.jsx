// components/RouteGuard.jsx
import { usePermissions } from '../../hooks/usePermissions';
import { Navigate } from 'react-router';

const RouteGuard = ({ 
  children, 
  requiredRole, 
  requiredPermission,
  fallbackPath = '/unauthorized',
}) => {
  const { hasRole, can, user } = usePermissions();

  // Check if user is authenticated
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Check role-based access
  if (requiredRole && !hasRole(requiredRole)) {
    return <Navigate to={fallbackPath} replace />;
  }

  // Check permission-based access - FIXED THIS PART
  if (requiredPermission && !can(requiredPermission.resource, requiredPermission.action)) {
    return <Navigate to={fallbackPath} replace />;
  }

  return children;
};

export default RouteGuard;