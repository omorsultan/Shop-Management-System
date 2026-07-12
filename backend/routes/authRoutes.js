// backend/routes/authRoutes.js
const express = require('express');
const router = express.Router();

const { register, login, getMe } = require('../controllers/authController');
const { requireAuth, optionalAuth } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

// Public-ish: allowed without a token ONLY to bootstrap the first admin.
// After that, authController.register enforces admin-only via optionalAuth.
router.post('/register', optionalAuth, register);

router.post('/login', login);

// Protected: must be logged in
router.get('/me', requireAuth, getMe);

// Example of a fully role-restricted route (for testing Postman + role middleware)
router.get('/admin-only-test', requireAuth, requireRole('admin'), (req, res) => {
  res.json({ message: `Welcome, admin ${req.user.username}. This route is admin-only.` });
});

module.exports = router;
