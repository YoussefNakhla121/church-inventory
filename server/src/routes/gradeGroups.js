const express = require('express');
const router = express.Router();
const { cacheGet } = require('../config/redis');
const { KEYS } = require('../utils/cacheKeys');
const { getGradeGroupNames } = require('../utils/gradeGroups');

router.get('/', async (req, res) => {
  try {
    const cached = await cacheGet(KEYS.GRADEGROUPS);
    if (cached !== null) {
      res.set('X-Cache', 'HIT');
      return res.status(200).json(cached);
    }

    const values = await getGradeGroupNames();
    res.set('X-Cache', 'MISS');
    return res.status(200).json(values);
  } catch (err) {
    console.error('gradeGroups fetch error:', err);
    return res.status(500).json({ error: 'Failed to load grade groups' });
  }
});

module.exports = router;