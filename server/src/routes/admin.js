const express = require('express');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const {
  getSummary,
  getRequests,
  requestPayment,
  getPayments,
} = require('../controllers/adminController');

const router = express.Router();
const adminOnly = [auth, requireRole('admin')];

router.get('/summary', ...adminOnly, getSummary);
router.get('/requests', ...adminOnly, getRequests);
router.post('/payments', ...adminOnly, requestPayment);
router.get('/payments', ...adminOnly, getPayments);

module.exports = router;
