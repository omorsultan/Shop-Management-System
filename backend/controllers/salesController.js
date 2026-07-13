// backend/controllers/salesController.js
const { pool } = require('../config/db');

/**
 * POST /api/sales
 * Body: {
 *   customer_id: number | null,   // optional — walk-in customers allowed
 *   discount: number,             // optional, default 0, invoice-level discount
 *   items: [ { product_id: number, quantity: number }, ... ]
 * }
 *
 * unit_price is always taken from the product's CURRENT selling_price at the
 * time of sale (not trusted from the client) — this prevents staff from
 * submitting arbitrary prices from the frontend.
 *
 * Same transaction pattern as Purchases, but stock moves DOWN instead of up,
 * and we must verify enough stock exists before committing (no overselling).
 */
async function createSale(req, res) {
  const { customer_id, discount, items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one item is required.' });
  }
  for (const item of items) {
    if (!item.product_id || !item.quantity || item.quantity <= 0) {
      return res.status(400).json({ error: 'Each item requires a valid product_id and quantity > 0.' });
    }
  }

  const discountAmount = discount ? Number(discount) : 0;
  if (discountAmount < 0) {
    return res.status(400).json({ error: 'discount cannot be negative.' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Verify customer exists if one was provided (nullable — walk-ins are fine)
    if (customer_id) {
      const [customerRows] = await connection.query(
        `SELECT customer_id FROM customers WHERE customer_id = ?`, [customer_id]
      );
      if (customerRows.length === 0) {
        await connection.rollback();
        return res.status(400).json({ error: 'Customer not found.' });
      }
    }

    // Insert sale header with placeholder amounts (filled in once totals are known)
    const [saleResult] = await connection.query(
      `INSERT INTO sales (customer_id, user_id, subtotal, discount, total_amount)
       VALUES (?, ?, 0, 0, 0)`,
      [customer_id || null, req.user.user_id]
    );
    const sale_id = saleResult.insertId;

    let subtotal = 0;
    const insertedItems = [];

    for (const item of items) {
      const { product_id, quantity } = item;

      // Lock the row so a concurrent sale/purchase on the same product can't race us
      const [productRows] = await connection.query(
        `SELECT product_id, name, stock_quantity, selling_price FROM products WHERE product_id = ? FOR UPDATE`,
        [product_id]
      );
      if (productRows.length === 0) {
        await connection.rollback();
        return res.status(400).json({ error: `Product ID ${product_id} not found.` });
      }

      const product = productRows[0];

      // The core "no overselling" check
      if (product.stock_quantity < quantity) {
        await connection.rollback();
        return res.status(409).json({
          error: `Insufficient stock for "${product.name}". Available: ${product.stock_quantity}, requested: ${quantity}.`
        });
      }

      const unit_price = product.selling_price;
      const itemSubtotal = quantity * unit_price;
      subtotal += itemSubtotal;

      await connection.query(
        `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal)
         VALUES (?, ?, ?, ?, ?)`,
        [sale_id, product_id, quantity, unit_price, itemSubtotal]
      );

      // Stock goes DOWN on a sale
      const newStock = product.stock_quantity - quantity;
      await connection.query(
        `UPDATE products SET stock_quantity = ? WHERE product_id = ?`,
        [newStock, product_id]
      );

      await connection.query(
        `INSERT INTO stock_history (product_id, change_type, quantity_change, reference_id, resulting_stock)
         VALUES (?, 'sale', ?, ?, ?)`,
        [product_id, -quantity, sale_id, newStock]
      );

      insertedItems.push({ product_id, product_name: product.name, quantity, unit_price, subtotal: itemSubtotal, new_stock: newStock });
    }

    if (discountAmount > subtotal) {
      await connection.rollback();
      return res.status(400).json({ error: 'discount cannot exceed the subtotal.' });
    }

    const total_amount = subtotal - discountAmount;

    await connection.query(
      `UPDATE sales SET subtotal = ?, discount = ?, total_amount = ? WHERE sale_id = ?`,
      [subtotal, discountAmount, total_amount, sale_id]
    );

    await connection.commit();

    res.status(201).json({
      message: 'Sale recorded successfully.',
      sale: { sale_id, customer_id: customer_id || null, subtotal, discount: discountAmount, total_amount, items: insertedItems }
    });
  } catch (err) {
    await connection.rollback();
    console.error('createSale error:', err);

    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ error: 'Invalid product or customer reference.' });
    }
    res.status(500).json({ error: 'Server error recording sale. All changes were rolled back.' });
  } finally {
    connection.release();
  }
}

// GET /api/sales?customer_id=&from=&to=
async function getAllSales(req, res) {
  const { customer_id, from, to } = req.query;

  try {
    let sql = `
      SELECT
        s.sale_id, s.subtotal, s.discount, s.total_amount, s.sale_date,
        s.customer_id, c.name AS customer_name,
        u.user_id, u.full_name AS recorded_by
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.customer_id
      INNER JOIN users u ON s.user_id = u.user_id
    `;
    const conditions = [];
    const params = [];

    if (customer_id) {
      conditions.push(`s.customer_id = ?`);
      params.push(customer_id);
    }
    if (from) {
      conditions.push(`s.sale_date >= ?`);
      params.push(from);
    }
    if (to) {
      conditions.push(`s.sale_date <= ?`);
      params.push(to);
    }
    if (conditions.length > 0) {
      sql += ` WHERE ` + conditions.join(' AND ');
    }
    sql += ` ORDER BY s.sale_date DESC`;

    const [rows] = await pool.query(sql, params);
    res.json({ sales: rows });
  } catch (err) {
    console.error('getAllSales error:', err);
    res.status(500).json({ error: 'Server error fetching sales.' });
  }
}

// GET /api/sales/:id — header + line items joined with product names (invoice view)
async function getSaleById(req, res) {
  const { id } = req.params;

  try {
    const [headerRows] = await pool.query(
      `SELECT
         s.sale_id, s.subtotal, s.discount, s.total_amount, s.sale_date,
         s.customer_id, c.name AS customer_name,
         u.user_id, u.full_name AS recorded_by
       FROM sales s
       LEFT JOIN customers c ON s.customer_id = c.customer_id
       INNER JOIN users u ON s.user_id = u.user_id
       WHERE s.sale_id = ?`,
      [id]
    );

    if (headerRows.length === 0) {
      return res.status(404).json({ error: 'Sale not found.' });
    }

    const [itemRows] = await pool.query(
      `SELECT
         si.sale_item_id, si.product_id, pr.name AS product_name,
         si.quantity, si.unit_price, si.subtotal
       FROM sale_items si
       INNER JOIN products pr ON si.product_id = pr.product_id
       WHERE si.sale_id = ?`,
      [id]
    );

    res.json({ sale: { ...headerRows[0], items: itemRows } });
  } catch (err) {
    console.error('getSaleById error:', err);
    res.status(500).json({ error: 'Server error fetching sale.' });
  }
}

module.exports = { createSale, getAllSales, getSaleById };
