// backend/routes/reportRoutes.js
const express = require('express');
const router = express.Router();

const {
  getDailySalesReport, getMonthlySalesReport, getPurchaseReport,
  getStockReport, getBestSellingProducts
} = require('../controllers/reportController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

// Reports are owner-level info (per the proposal's stakeholder table: "Shop Owner —
// View reports"), so these are admin-only, unlike inventory which staff also need.
router.get('/sales/daily', requireAuth, requireRole('admin'), getDailySalesReport);
router.get('/sales/monthly', requireAuth, requireRole('admin'), getMonthlySalesReport);
router.get('/purchases', requireAuth, requireRole('admin'), getPurchaseReport);
router.get('/stock', requireAuth, requireRole('admin'), getStockReport);
router.get('/best-selling', requireAuth, requireRole('admin'), getBestSellingProducts);

module.exports = router;
