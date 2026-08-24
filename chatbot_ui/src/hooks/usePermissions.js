// hooks/usePermissions.js
import { useAuth } from '../Provider/AuthContexProvider';

export const usePermissions = () => {
  const { user } = useAuth();
  
  // Check if user can perform action on resource
  const can = (resource, action) => {
    if (!user?.permissions) return false;
    return user.permissions[resource]?.includes(action);
  };
  
  // Check multiple permissions at once
  const canAll = (permissions) => {
    return permissions.every(perm => can(perm.resource, perm.action));
  };
  
  // Check if user can do any of the given permissions
  const canAny = (permissions) => {
    return permissions.some(perm => can(perm.resource, perm.action));
  };
  
  // Check if user can do any action on resource
  const canAccess = (resource) => {
    if (!user?.permissions) return false;
    return !!user.permissions[resource]?.length;
  };
  
  // Get all actions user can perform on a resource
  const getAllowedActions = (resource) => {
    if (!user?.permissions) return [];
    return user.permissions[resource] || [];
  };
  
  // Check if user has specific role
  const hasRole = (role) => {
    return user?.roles?.includes(role);
  };
  
  // Check if user has any of the given roles
  const hasAnyRole = (roles) => {
    if (!user?.roles) return false;
    return user.roles.some(role => roles.includes(role));
  };

  // Check if user has all of the given roles
  const hasAllRoles = (roles) => {
    if (!user?.roles) return false;
    return roles.every(role => user.roles.includes(role));
  };

  return {
    // Permission checks
    can,
    canAll,
    canAny,
    canAccess,
    getAllowedActions,
    
    // Role checks
    hasRole,
    hasAnyRole,
    hasAllRoles,
    
    // Common shortcuts
    isDoctor: hasRole('doctor'),
    isNurse: hasRole('nurse'),
    isReceptionist: hasRole('receptionist'),
    isHospitalAdmin: hasRole('hospital_admin'),
    
    // User info
    user,
    userRoles: user?.roles || [],
    userPermissions: user?.permissions || {},
  };
};