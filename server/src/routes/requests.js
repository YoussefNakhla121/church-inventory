const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireManager = require('../middleware/requireManager');
const {
  createRequest,
  getMyRequests,
  cancelRequest,
  getAllRequests,
  getRequestById,
  updateRequestStatus,
} = require('../controllers/requestsController');

// POST   /api/requests          — any authenticated user
router.post('/', auth, createRequest);

// GET    /api/requests/mine     — requester: their own requests
// NOTE: 'mine' and the list route must come before '/:id' to avoid being matched as ids
router.get('/mine', auth, getMyRequests);

// PATCH  /api/requests/:id/cancel — requester: cancel their own request
router.patch('/:id/cancel', auth, cancelRequest);

// GET    /api/requests          — manager only: all requests
router.get('/', auth, requireManager, getAllRequests);

// GET    /api/requests/:id     — manager: any request; requester: their own request
router.get('/:id', auth, getRequestById);

// PATCH  /api/requests/:id/status — manager only: move status forward
router.patch('/:id/status', auth, requireManager, updateRequestStatus);

module.exports = router;
