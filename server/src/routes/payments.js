const express = require('express');
const auth = require('../middleware/auth');
const requireManager = require('../middleware/requireManager');
const {
  listPayments,
  getPendingCount,
  getPaymentById,
  decidePayment,
} = require('../controllers/paymentsController');

const router = express.Router();
const managerOnly = [auth, requireManager];

router.get('/', ...managerOnly, listPayments);
router.get('/pending-count', ...managerOnly, getPendingCount);
router.get('/:id', ...managerOnly, getPaymentById);
router.patch('/:id/decision', ...managerOnly, decidePayment);

module.exports = router;
