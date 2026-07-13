// backend/controllers/reportController.js
const { pool } = require('../config/db');

// GET /api/reports/sales/daily?date=YYYY-MM-DD  (defaults to today)
async function getDailySalesReport(req, res) {
  const date = req.query.date || new Date().toISOString().slice(0, 10);

  try {
    const [[summary]] = await pool.query(
      `SELECT
         COUNT(*) AS total_invoices,
         COALESCE(SUM(subtotal), 0) AS gross_sales,
         COALESCE(SUM(discount), 0) AS total_discount,
         COALESCE(SUM(total_amount), 0) AS net_revenue
       FROM sales
       WHERE DATE(sale_date) = ?`,
      [date]
    );

    const [invoices] = await pool.query(
      `SELECT s.sale_id, s.total_amount, s.sale_date, c.name AS customer_name, u.full_name AS recorded_by
       FROM sales s
       LEFT JOIN customers c ON s.customer_id = c.customer_id
       INNER JOIN users u ON s.user_id = u.user_id
       WHERE DATE(s.sale_date) = ?
       ORDER BY s.sale_date ASC`,
      [date]
    );

    res.json({ report_date: date, summary, invoices });
  } catch (err) {
    console.error('getDailySalesReport error:', err);
    res.status(500).json({ error: 'Server error generating daily sales report.' });
  }
}

// GET /api/reports/sales/monthly?year=2026&month=7  (defaults to current month)
async function getMonthlySalesReport(req, res) {
  const now = new Date();
  const year = req.query.year || now.getFullYear();
  const month = req.query.month || now.getMonth() + 1;

  try {
    const [[summary]] = await pool.query(
      `SELECT
         COUNT(*) AS total_invoices,
         COALESCE(SUM(total_amount), 0) AS total_revenue,
         COALESCE(AVG(total_amount), 0) AS avg_invoice_value
       FROM sales
       WHERE YEAR(sale_date) = ? AND MONTH(sale_date) = ?`,
      [year, month]
    );

    // Daily breakdown within the month — classic GROUP BY + aggregate report
    const [dailyBreakdown] = await pool.query(
      `SELECT
         DATE(sale_date) AS sale_day,
         COUNT(*) AS invoices,
         SUM(total_amount) AS revenue
       FROM sales
       WHERE YEAR(sale_date) = ? AND MONTH(sale_date) = ?
       GROUP BY DATE(sale_date)
       ORDER BY sale_day ASC`,
      [year, month]
    );

    res.json({ year: Number(year), month: Number(month), summary, daily_breakdown: dailyBreakdown });
  } catch (err) {
    console.error('getMonthlySalesReport error:', err);
    res.status(500).json({ error: 'Server error generating monthly sales report.' });
  }
}

// GET /api/reports/purchases?from=&to=
// Purchase spend grouped by supplier — demonstrates GROUP BY + HAVING together.
async function getPurchaseReport(req, res) {
  const { from, to } = req.query;

  try {
    let sql = `
      SELECT
        s.supplier_id, s.name AS supplier_name,
        COUNT(p.purchase_id) AS total_purchases,
        SUM(p.total_amount) AS total_spent
      FROM purchases p
      INNER JOIN suppliers s ON p.supplier_id = s.supplier_id
    `;
    const conditions = [];
    const params = [];

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

    // HAVING filters on the aggregated result (only suppliers with real spend),
    // which is different from WHERE (which filters rows before aggregation).
    sql += `
      GROUP BY s.supplier_id, s.name
      HAVING SUM(p.total_amount) > 0
      ORDER BY total_spent DESC
    `;

    const [bySupplier] = await pool.query(sql, params);

    const [[overall]] = await pool.query(
      `SELECT COUNT(*) AS total_purchases, COALESCE(SUM(total_amount), 0) AS total_spent
       FROM purchases
       ${from || to ? 'WHERE ' + [from ? 'purchase_date >= ?' : null, to ? 'purchase_date <= ?' : null].filter(Boolean).join(' AND ') : ''}`,
      [from, to].filter(Boolean)
    );

    res.json({ overall, by_supplier: bySupplier });
  } catch (err) {
    console.error('getPurchaseReport error:', err);
    res.status(500).json({ error: 'Server error generating purchase report.' });
  }
}

// GET /api/reports/stock
// Current stock valued at cost price, grouped by category for a category-level summary too.
async function getStockReport(req, res) {
  try {
    const [byProduct] = await pool.query(
      `SELECT
         p.product_id, p.name, c.name AS category_name,
         p.stock_quantity, p.cost_price,
         (p.stock_quantity * p.cost_price) AS stock_value
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.category_id
       ORDER BY stock_value DESC`
    );

    const [byCategory] = await pool.query(
      `SELECT
         c.category_id, c.name AS category_name,
         COUNT(p.product_id) AS product_count,
         SUM(p.stock_quantity) AS total_units,
         SUM(p.stock_quantity * p.cost_price) AS category_stock_value
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.category_id
       GROUP BY c.category_id, c.name
       ORDER BY category_stock_value DESC`
    );

    const [[overall]] = await pool.query(
      `SELECT
         COUNT(*) AS total_products,
         COALESCE(SUM(stock_quantity), 0) AS total_units,
         COALESCE(SUM(stock_quantity * cost_price), 0) AS total_stock_value
       FROM products`
    );

    res.json({ overall, by_category: byCategory, by_product: byProduct });
  } catch (err) {
    console.error('getStockReport error:', err);
    res.status(500).json({ error: 'Server error generating stock report.' });
  }
}

// GET /api/reports/best-selling?limit=10&from=&to=
async function getBestSellingProducts(req, res) {
  const limit = Number(req.query.limit) || 10;
  const { from, to } = req.query;

  try {
    let sql = `
      SELECT
        pr.product_id, pr.name AS product_name,
        SUM(si.quantity) AS total_quantity_sold,
        SUM(si.subtotal) AS total_revenue,
        COUNT(DISTINCT si.sale_id) AS number_of_invoices
      FROM sale_items si
      INNER JOIN products pr ON si.product_id = pr.product_id
      INNER JOIN sales s ON si.sale_id = s.sale_id
    `;
    const conditions = [];
    const params = [];

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

    sql += `
      GROUP BY pr.product_id, pr.name
      HAVING SUM(si.quantity) > 0
      ORDER BY total_quantity_sold DESC
      LIMIT ?
    `;
    params.push(limit);

    const [rows] = await pool.query(sql, params);
    res.json({ best_selling_products: rows });
  } catch (err) {
    console.error('getBestSellingProducts error:', err);
    res.status(500).json({ error: 'Server error generating best-selling products report.' });
  }
}

module.exports = {
  getDailySalesReport,
  getMonthlySalesReport,
  getPurchaseReport,
  getStockReport,
  getBestSellingProducts
};
