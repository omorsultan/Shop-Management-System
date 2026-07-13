// backend/controllers/inventoryController.js
const { pool } = require('../config/db');

// GET /api/inventory?search=&category_id=
// Current stock levels for every product, with a computed status flag.
async function getInventory(req, res) {
  const { search, category_id } = req.query;

  try {
    let sql = `
      SELECT
        p.product_id, p.name, c.name AS category_name,
        p.stock_quantity, p.low_stock_threshold,
        CASE WHEN p.stock_quantity <= p.low_stock_threshold THEN 'LOW' ELSE 'OK' END AS stock_status
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.category_id
    `;
    const conditions = [];
    const params = [];

    if (search) {
      conditions.push(`p.name LIKE ?`);
      params.push(`%${search}%`);
    }
    if (category_id) {
      conditions.push(`p.category_id = ?`);
      params.push(category_id);
    }
    if (conditions.length > 0) {
      sql += ` WHERE ` + conditions.join(' AND ');
    }
    sql += ` ORDER BY p.name ASC`;

    const [rows] = await pool.query(sql, params);
    res.json({ inventory: rows });
  } catch (err) {
    console.error('getInventory error:', err);
    res.status(500).json({ error: 'Server error fetching inventory.' });
  }
}

// GET /api/inventory/low-stock
// Products at or below their own low_stock_threshold — the "low stock alert" feature.
async function getLowStockAlerts(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT
         p.product_id, p.name, c.name AS category_name,
         p.stock_quantity, p.low_stock_threshold
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.category_id
       WHERE p.stock_quantity <= p.low_stock_threshold
       ORDER BY p.stock_quantity ASC`
    );
    res.json({ low_stock_products: rows, count: rows.length });
  } catch (err) {
    console.error('getLowStockAlerts error:', err);
    res.status(500).json({ error: 'Server error fetching low stock alerts.' });
  }
}

// GET /api/inventory/:productId/history
// Full audit trail of stock changes for one product (from purchases, sales, adjustments).
async function getStockHistory(req, res) {
  const { productId } = req.params;

  try {
    const [productRows] = await pool.query(
      `SELECT product_id, name FROM products WHERE product_id = ?`, [productId]
    );
    if (productRows.length === 0) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const [historyRows] = await pool.query(
      `SELECT history_id, change_type, quantity_change, reference_id, resulting_stock, created_at
       FROM stock_history
       WHERE product_id = ?
       ORDER BY created_at DESC`,
      [productId]
    );

    res.json({ product: productRows[0], history: historyRows });
  } catch (err) {
    console.error('getStockHistory error:', err);
    res.status(500).json({ error: 'Server error fetching stock history.' });
  }
}

module.exports = { getInventory, getLowStockAlerts, getStockHistory };
