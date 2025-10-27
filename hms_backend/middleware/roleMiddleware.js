// middleware/roleMiddleware.js
export const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const userRoles = req.user.roles || [];
    const hasRequiredRole = roles.some(role => userRoles.includes(role));
    
    if (!hasRequiredRole) {
      return res.status(403).json({ 
        message: 'Access denied. Insufficient permissions.' 
      });
    }
    
    next();
  };
};

export const requirePermission = (resource, action) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const userPermissions = req.user.permissions || {};
    const canAccess = userPermissions[resource]?.includes(action);
    
    if (!canAccess) {
      return res.status(403).json({ 
        message: `Access denied. Cannot ${action} ${resource}.` 
      });
    }
    
    next();
  };
};