// backend/middleware/roleMiddleware.js

/**
 * requireRole('admin') or requireRole('admin', 'staff')
 * Must run AFTER requireAuth, since it reads req.user set by that middleware.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Requires role: ${allowedRoles.join(' or ')}.`
      });
    }

    next();
  };
}

module.exports = { requireRole };
