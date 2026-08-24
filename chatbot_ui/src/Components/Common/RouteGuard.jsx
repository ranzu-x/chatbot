// components/RouteGuard.jsx
import { usePermissions } from '../../hooks/usePermissions';
import { Navigate } from 'react-router';

const RouteGuard = ({ 
  children, 
  requiredRole, // Can be string or array of strings
  requiredPermission, // Can be object or array of objects
  fallbackPath = '/unauthorized',
}) => {
  const { hasRole, hasAnyRole, can, user } = usePermissions();

  // Check if user is authenticated
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Check role-based access (supports single role or array of roles)
  if (requiredRole) {
    if (Array.isArray(requiredRole)) {
      // Multiple roles - user needs at least one
      if (!hasAnyRole(requiredRole)) {
        return <Navigate to={fallbackPath} replace />;
      }
    } else {
      // Single role
      if (!hasRole(requiredRole)) {
        return <Navigate to={fallbackPath} replace />;
      }
    }
  }

  // Check permission-based access (supports single permission or array of permissions)
  if (requiredPermission) {
    if (Array.isArray(requiredPermission)) {
      // Multiple permissions - user needs all permissions
      const hasAllPermissions = requiredPermission.every(perm => 
        can(perm.resource, perm.action)
      );
      if (!hasAllPermissions) {
        return <Navigate to={fallbackPath} replace />;
      }
    } else {
      // Single permission
      if (!can(requiredPermission.resource, requiredPermission.action)) {
        return <Navigate to={fallbackPath} replace />;
      }
    }
  }

  return children;
};

export default RouteGuard;