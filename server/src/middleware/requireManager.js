/**
 * Role-check middleware. Must be used AFTER the auth middleware.
 * Rejects requests from non-manager users with 403 Forbidden.
 */
const requireManager = (req, res, next) => {
  if (!req.user || req.user.role !== 'manager') {
    return res.status(403).json({ error: 'Access denied: managers only' });
  }
  next();
};

module.exports = requireManager;
