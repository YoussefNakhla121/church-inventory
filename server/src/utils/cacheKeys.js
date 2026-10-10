const { cacheDel, cacheIncr } = require('../config/redis');

const KEYS = {
  GRADEGROUPS: 'gradegroups',
  ITEMS_ACTIVE: 'items:active',
  AVAIL_VERSION: 'avail:version',
};

const TTL = {
  GRADEGROUPS: 6 * 60 * 60, // 6 hours
  ITEMS_ACTIVE: 10 * 60,    // 10 minutes
  AVAILABILITY: 45,         // 45 seconds
};

const invalidateItems = () => cacheDel(KEYS.ITEMS_ACTIVE);

// Availability keys include a version number. Bumping it makes every old
// availability entry unreachable at once; they then expire on their own.
const invalidateAvailability = () => cacheIncr(KEYS.AVAIL_VERSION);

module.exports = { KEYS, TTL, invalidateItems, invalidateAvailability };