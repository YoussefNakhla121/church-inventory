const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireManager = require('../middleware/requireManager');
const {
  createRequest,
  getMyRequests,
  cancelRequest,
  getAllRequests,
  updateRequestStatus,
} = require('../controllers/requestsController');

// POST   /api/requests          — any authenticated user
router.post('/', auth, createRequest);

// GET    /api/requests/mine     — requester: their own requests
// NOTE: 'mine' must come before '/:id' to avoid being matched as an id
router.get('/mine', auth, getMyRequests);

// PATCH  /api/requests/:id/cancel — requester: cancel their own request
router.patch('/:id/cancel', auth, cancelRequest);

// GET    /api/requests          — manager only: all requests
router.get('/', auth, requireManager, getAllRequests);

// PATCH  /api/requests/:id/status — manager only: move status forward
router.patch('/:id/status', auth, requireManager, updateRequestStatus);

module.exports = router;
