const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { cacheGet, cacheSet } = require('../config/redis');
const { KEYS, TTL } = require('../utils/cacheKeys');

router.get('/', async (req, res) => {
  try {
    const cached = await cacheGet(KEYS.GRADEGROUPS);
    if (cached !== null) {
      res.set('X-Cache', 'HIT');
      return res.status(200).json(cached);
    }

    const { data, error } = await supabase
      .from('gradegroup')
      .select('name')
      .not('name', 'is', null)
      .order('name', { ascending: true });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const values = (data || [])
      .map((item) => item.name)
      .filter((name) => typeof name === 'string' && name.trim().length > 0)
      .map((name) => name.trim());

    await cacheSet(KEYS.GRADEGROUPS, values, TTL.GRADEGROUPS);
    res.set('X-Cache', 'MISS');
    return res.status(200).json(values);
  } catch (err) {
    console.error('gradeGroups fetch error:', err);
    return res.status(500).json({ error: 'Failed to load grade groups' });
  }
});

module.exports = router;