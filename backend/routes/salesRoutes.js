// backend/routes/salesRoutes.js
const express = require('express');
const router = express.Router();

const { createSale, getAllSales, getSaleById } = require('../controllers/salesController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

router.get('/', requireAuth, getAllSales);
router.get('/:id', requireAuth, getSaleById);
router.post('/', requireAuth, requireRole('admin', 'staff'), createSale);

// No PUT/DELETE — same reasoning as purchases: sale history should be
// immutable once stock has moved. Refunds/returns would be a separate
// feature (not in the proposal's scope).

module.exports = router;
