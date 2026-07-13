// backend/routes/inventoryRoutes.js
const express = require('express');
const router = express.Router();

const { getInventory, getLowStockAlerts, getStockHistory } = require('../controllers/inventoryController');
const { requireAuth } = require('../middleware/authMiddleware');

// Any logged-in user can view inventory — staff and the inventory manager need this day to day.
router.get('/', requireAuth, getInventory);
router.get('/low-stock', requireAuth, getLowStockAlerts);
router.get('/:productId/history', requireAuth, getStockHistory);

module.exports = router;
