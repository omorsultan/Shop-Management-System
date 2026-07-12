// backend/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

/**
 * requireAuth — blocks the request unless a valid JWT is present.
 * Attaches decoded payload to req.user = { user_id, username, role }
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization; // expected format: "Bearer <token>"

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided. Access denied.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

/**
 * optionalAuth — attaches req.user if a valid token is present,
 * but does NOT block the request if it's missing/invalid.
 * Used for routes like /register where behavior depends on
 * whether the caller is already logged in (see authController.register).
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      // Invalid token on an optional route — just proceed as unauthenticated
      req.user = null;
    }
  } else {
    req.user = null;
  }

  next();
}

module.exports = { requireAuth, optionalAuth };
