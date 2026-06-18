const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireManager = require('../middleware/requireManager');
const {
  submitConditionReports,
  getConditionReports,
} = require('../controllers/conditionReportsController');

// POST /api/requests/:id/condition-reports — manager only
router.post('/:id/condition-reports', auth, requireManager, submitConditionReports);

// GET  /api/requests/:id/condition-reports — manager only
router.get('/:id/condition-reports', auth, requireManager, getConditionReports);

module.exports = router;
