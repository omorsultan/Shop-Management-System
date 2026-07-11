// backend/config/db.js
// Central MySQL connection pool. All raw SQL queries go through this.
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Quick self-test you can call from server.js at startup
async function testConnection() {
  try {
    const [rows] = await pool.query('SELECT 1 + 1 AS result');
    console.log('✅ MySQL connected. Test query result:', rows[0].result);
  } catch (err) {
    console.error('❌ MySQL connection failed:', err.message);
  }
}

module.exports = { pool, testConnection };
