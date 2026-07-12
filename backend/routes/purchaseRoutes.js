// backend/routes/purchaseRoutes.js
const express = require('express');
const router = express.Router();

const { createPurchase, getAllPurchases, getPurchaseById } = require('../controllers/purchaseController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

// Viewing purchase history: any logged-in user (owner, staff, inventory manager all need this)
router.get('/', requireAuth, getAllPurchases);
router.get('/:id', requireAuth, getPurchaseById);

// Recording a purchase: admin or staff (inventory manager role folded into 'staff' for now)
router.post('/', requireAuth, requireRole('admin', 'staff'), createPurchase);

// Deliberately no PUT/DELETE — once a purchase is recorded and stock is
// updated, edits should go through a separate "stock adjustment" flow
// rather than silently rewriting history. Out of scope for this project.

module.exports = router;
