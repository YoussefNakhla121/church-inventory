const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getComments, postComment } = require('../controllers/commentsController');

// GET  /api/requests/:id/comments — all authenticated users
router.get('/:id/comments', auth, getComments);

// POST /api/requests/:id/comments — all authenticated users (ownership checked in controller)
router.post('/:id/comments', auth, postComment);

module.exports = router;
