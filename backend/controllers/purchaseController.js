// backend/controllers/purchaseController.js
const { pool } = require('../config/db');

/**
 * POST /api/purchases
 * Body: {
 *   supplier_id: number,
 *   items: [ { product_id: number, quantity: number, unit_cost: number }, ... ]
 * }
 *
 * This is the core "database transaction" demonstration for the project:
 * insert purchase header -> insert each line item -> increment product stock
 * -> log each stock change -> update the header's total_amount, all inside
 * ONE transaction. If anything fails partway through, everything rolls back
 * so stock and totals never end up inconsistent.
 */
async function createPurchase(req, res) {
  const { supplier_id, items } = req.body;

  if (!supplier_id) {
    return res.status(400).json({ error: 'supplier_id is required.' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one item is required.' });
  }
  for (const item of items) {
    if (!item.product_id || !item.quantity || item.quantity <= 0 || item.unit_cost === undefined || item.unit_cost < 0) {
      return res.status(400).json({
        error: 'Each item requires a valid product_id, quantity > 0, and unit_cost >= 0.'
      });
    }
  }

  // A transaction needs a single dedicated connection, not the shared pool directly.
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Verify supplier exists (fail fast with a clean error instead of an FK error)
    const [supplierRows] = await connection.query(
      `SELECT supplier_id FROM suppliers WHERE supplier_id = ?`, [supplier_id]
    );
    if (supplierRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Supplier not found.' });
    }

    // 2. Insert purchase header with a placeholder total (updated at the end)
    const [purchaseResult] = await connection.query(
      `INSERT INTO purchases (supplier_id, user_id, total_amount) VALUES (?, ?, 0)`,
      [supplier_id, req.user.user_id]
    );
    const purchase_id = purchaseResult.insertId;

    let total_amount = 0;
    const insertedItems = [];

    // 3. Process each line item
    for (const item of items) {
      const { product_id, quantity, unit_cost } = item;

      // Lock the product row (FOR UPDATE) so concurrent purchases/sales on the
      // same product can't race each other while we read + update its stock.
      const [productRows] = await connection.query(
        `SELECT product_id, stock_quantity FROM products WHERE product_id = ? FOR UPDATE`,
        [product_id]
      );
      if (productRows.length === 0) {
        await connection.rollback();
        return res.status(400).json({ error: `Product ID ${product_id} not found.` });
      }

      const subtotal = quantity * unit_cost;
      total_amount += subtotal;

      await connection.query(
        `INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_cost, subtotal)
         VALUES (?, ?, ?, ?, ?)`,
        [purchase_id, product_id, quantity, unit_cost, subtotal]
      );

      // Stock goes UP on a purchase
      const newStock = productRows[0].stock_quantity + quantity;
      await connection.query(
        `UPDATE products SET stock_quantity = ? WHERE product_id = ?`,
        [newStock, product_id]
      );

      // Audit trail: exactly why/when this product's stock changed
      await connection.query(
        `INSERT INTO stock_history (product_id, change_type, quantity_change, reference_id, resulting_stock)
         VALUES (?, 'purchase', ?, ?, ?)`,
        [product_id, quantity, purchase_id, newStock]
      );

      insertedItems.push({ product_id, quantity, unit_cost, subtotal, new_stock: newStock });
    }

    // 4. Now that we know the real total, update the purchase header
    await connection.query(
      `UPDATE purchases SET total_amount = ? WHERE purchase_id = ?`,
      [total_amount, purchase_id]
    );

    await connection.commit();

    res.status(201).json({
      message: 'Purchase recorded successfully.',
      purchase: { purchase_id, supplier_id, total_amount, items: insertedItems }
    });
  } catch (err) {
    await connection.rollback();
    console.error('createPurchase error:', err);

    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ error: 'Invalid product or supplier reference.' });
    }
    res.status(500).json({ error: 'Server error recording purchase. All changes were rolled back.' });
  } finally {
    connection.release(); // always return the connection to the pool
  }
}

// GET /api/purchases?supplier_id=&from=&to=
async function getAllPurchases(req, res) {
  const { supplier_id, from, to } = req.query;

  try {
    let sql = `
      SELECT
        p.purchase_id, p.total_amount, p.purchase_date,
        s.supplier_id, s.name AS supplier_name,
        u.user_id, u.full_name AS recorded_by
      FROM purchases p
      INNER JOIN suppliers s ON p.supplier_id = s.supplier_id
      INNER JOIN users u ON p.user_id = u.user_id
    `;
    const conditions = [];
    const params = [];

    if (supplier_id) {
      conditions.push(`p.supplier_id = ?`);
      params.push(supplier_id);
    }
    if (from) {
      conditions.push(`p.purchase_date >= ?`);
      params.push(from);
    }
    if (to) {
      conditions.push(`p.purchase_date <= ?`);
      params.push(to);
    }
    if (conditions.length > 0) {
      sql += ` WHERE ` + conditions.join(' AND ');
    }
    sql += ` ORDER BY p.purchase_date DESC`;

    const [rows] = await pool.query(sql, params);
    res.json({ purchases: rows });
  } catch (err) {
    console.error('getAllPurchases error:', err);
    res.status(500).json({ error: 'Server error fetching purchases.' });
  }
}

// GET /api/purchases/:id  — header + line items joined with product names
async function getPurchaseById(req, res) {
  const { id } = req.params;

  try {
    const [headerRows] = await pool.query(
      `SELECT
         p.purchase_id, p.total_amount, p.purchase_date,
         s.supplier_id, s.name AS supplier_name,
         u.user_id, u.full_name AS recorded_by
       FROM purchases p
       INNER JOIN suppliers s ON p.supplier_id = s.supplier_id
       INNER JOIN users u ON p.user_id = u.user_id
       WHERE p.purchase_id = ?`,
      [id]
    );

    if (headerRows.length === 0) {
      return res.status(404).json({ error: 'Purchase not found.' });
    }

    const [itemRows] = await pool.query(
      `SELECT
         pi.purchase_item_id, pi.product_id, pr.name AS product_name,
         pi.quantity, pi.unit_cost, pi.subtotal
       FROM purchase_items pi
       INNER JOIN products pr ON pi.product_id = pr.product_id
       WHERE pi.purchase_id = ?`,
      [id]
    );

    res.json({ purchase: { ...headerRows[0], items: itemRows } });
  } catch (err) {
    console.error('getPurchaseById error:', err);
    res.status(500).json({ error: 'Server error fetching purchase.' });
  }
}

module.exports = { createPurchase, getAllPurchases, getPurchaseById };
