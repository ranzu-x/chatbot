/**
 * Role-based access control middleware.
 * Usage: roleMiddleware("ADMIN") or roleMiddleware("ADMIN", "AGENCY")
 */
export const roleMiddleware = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: requires one of [${allowedRoles.join(", ")}] role`,
      });
    }
    next();
  };
};