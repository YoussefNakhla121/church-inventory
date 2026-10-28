const requireRole = (role) => (req, res, next) => {
  if (!req.user || req.user.role !== role) {
    return res.status(403).json({ error: `Access denied: ${role}s only` });
  }
  next();
};

module.exports = requireRole;
