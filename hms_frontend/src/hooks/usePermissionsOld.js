// hooks/usePermissions.js
import { useAuth } from '../Provider/AuthContexProvider';

// Permission constants - define all possible permissions
export const Permissions = {
  // Appointment permissions
  APPOINTMENT_VIEW: 'appointment:view',
  APPOINTMENT_CREATE: 'appointment:create',
  APPOINTMENT_EDIT: 'appointment:edit',
  APPOINTMENT_DELETE: 'appointment:delete',
  
  // Prescription permissions
  PRESCRIPTION_VIEW: 'prescription:view',
  PRESCRIPTION_CREATE: 'prescription:create',
  PRESCRIPTION_EDIT: 'prescription:edit',
  
  // Patient permissions
  PATIENT_VIEW: 'patient:view',
  PATIENT_CREATE: 'patient:create',
  PATIENT_EDIT: 'patient:edit',
  
  // Billing permissions
  BILLING_VIEW: 'billing:view',
  BILLING_CREATE: 'billing:create',
  BILLING_EDIT: 'billing:edit',
  
  // Lab permissions
  LAB_REPORT_VIEW: 'lab:view',
  LAB_REPORT_CREATE: 'lab:create',
  LAB_REPORT_EDIT: 'lab:edit',
  
  // Admin permissions
  USER_MANAGEMENT: 'user:manage',
  SYSTEM_SETTINGS: 'system:settings',
};

export const usePermissions = () => {
  const { user } = useAuth();
  
  // Check if user has specific permission
  const hasPermission = (permission) => {
    return user?.permissions?.includes(permission);
  };
  
  // Check if user has any of the given permissions
  const hasAnyPermission = (permissions) => {
    return permissions.some(permission => hasPermission(permission));
  };
  
  // Check if user has all of the given permissions
  const hasAllPermissions = (permissions) => {
    return permissions.every(permission => hasPermission(permission));
  };
  
  // Check user role
  const hasRole = (role) => {
    return user?.roles?.includes(role);
  };
  
  // Check if user has any of the given roles
  const hasAnyRole = (roles) => {
    return roles.includes(user?.role);
  };
  
  // Combined check - most commonly used
  const can = (permission, role = null) => {
    const hasPerm = permission ? hasPermission(permission) : true;
    const hasRoleCheck = role ? hasRole(role) : true;
    return hasPerm && hasRoleCheck;
  };

  return {
    // Permission checks
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    
    // Role checks
    hasRole,
    hasAnyRole,
    
    // Combined checks
    can,
    
    // Common role shortcuts
    isDoctor: hasRole('doctor'),
    isNurse: hasRole('nurse'),
    isAdmin: hasRole('admin'),
    isReceptionist: hasRole('receptionist'),
    isLabTechnician: hasRole('lab_technician'),
    
    // User info
    user,
    userRole: user?.role,
    userPermissions: user?.permissions || [],
  };
};