const express = require('express');
const router = express.Router();
const { register, registerManager, registerAdmin, login, updateProfile } = require('../controllers/authController');
const auth = require('../middleware/auth');
const requireManager = require('../middleware/requireManager');

// POST /api/auth/register
router.post('/register', register);

// POST /api/auth/register-manager
router.post('/register-manager', auth, requireManager, registerManager);

// POST /api/auth/register-admin
router.post('/register-admin', auth, requireManager, registerAdmin);

// POST /api/auth/login
router.post('/login', login);

// PUT /api/auth/profile
router.put('/profile', auth, updateProfile);

module.exports = router;
