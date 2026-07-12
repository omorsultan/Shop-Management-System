// backend/controllers/authController.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

const SALT_ROUNDS = 10;

/**
 * POST /api/auth/register
 *
 * Bootstrap rule (common pattern for small course projects):
 * - If NO admin exists yet in the system, anyone can register and the
 *   new user is forced to role='admin'. This lets you create your very
 *   first account without manually inserting rows into MySQL.
 * - Once at least one admin exists, this route requires a logged-in
 *   admin (via optionalAuth + this check) to create further users.
 */
async function register(req, res) {
  const { full_name, username, email, password, role } = req.body;

  if (!full_name || !username || !email || !password) {
    return res.status(400).json({ error: 'full_name, username, email, and password are required.' });
  }

  try {
    const [adminRows] = await pool.query(
      `SELECT COUNT(*) AS admin_count FROM users WHERE role = 'admin'`
    );
    const noAdminExists = adminRows[0].admin_count === 0;

    if (!noAdminExists) {
      // Admins already exist — only a logged-in admin may create new users
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({
          error: 'Only an admin can register new users once the first admin exists.'
        });
      }
    }

    // Check username/email uniqueness up front for a clean error message
    const [existing] = await pool.query(
      `SELECT user_id FROM users WHERE username = ? OR email = ?`,
      [username, email]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Username or email already in use.' });
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    // Force role='admin' during bootstrap; otherwise use provided role (default 'staff')
    const finalRole = noAdminExists ? 'admin' : (role === 'admin' ? 'admin' : 'staff');

    const [result] = await pool.query(
      `INSERT INTO users (full_name, username, email, password_hash, role)
       VALUES (?, ?, ?, ?, ?)`,
      [full_name, username, email, password_hash, finalRole]
    );

    return res.status(201).json({
      message: 'User registered successfully.',
      user: {
        user_id: result.insertId,
        full_name,
        username,
        email,
        role: finalRole
      }
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Server error during registration.' });
  }
}

/**
 * POST /api/auth/login
 */
async function login(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required.' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT user_id, full_name, username, email, password_hash, role, is_active
       FROM users
       WHERE username = ? OR email = ?`,
      [username, username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const user = rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'This account has been deactivated.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const tokenPayload = {
      user_id: user.user_id,
      username: user.username,
      role: user.role
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '1d'
    });

    return res.json({
      message: 'Login successful.',
      token,
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server error during login.' });
  }
}

/**
 * GET /api/auth/me  (protected — requires requireAuth)
 * Simple route to confirm the token works and to fetch fresh user info.
 */
async function getMe(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT user_id, full_name, username, email, role, created_at
       FROM users WHERE user_id = ?`,
      [req.user.user_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json({ user: rows[0] });
  } catch (err) {
    console.error('GetMe error:', err);
    return res.status(500).json({ error: 'Server error fetching profile.' });
  }
}

module.exports = { register, login, getMe };
