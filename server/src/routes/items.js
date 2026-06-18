const multer = require('multer');
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireManager = require('../middleware/requireManager');
const {
  getItems,
  getItemAvailability,
  getItemConditionHistory,
  createItem,
  updateItem,
  deactivateItem,
  reactivateItem,
} = require('../controllers/itemsController');

// Multer memory storage — file never touches the disk on the Express server
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1 * 1024 * 1024 }, // 1 MB safety cap
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'), false);
    }
    cb(null, true);
  },
});

// ── Public-ish routes (still require login) ───────────────────────────────────
router.get('/', auth, getItems);
router.get('/:id/availability', auth, getItemAvailability);

// ── Manager-only routes ───────────────────────────────────────────────────────
router.get('/:id/condition-history', auth, requireManager, getItemConditionHistory);
router.post('/', auth, requireManager, upload.single('photo'), createItem);
router.patch('/:id', auth, requireManager, upload.single('photo'), updateItem);
router.patch('/:id/deactivate', auth, requireManager, deactivateItem);
router.patch('/:id/reactivate', auth, requireManager, reactivateItem);

module.exports = router;
