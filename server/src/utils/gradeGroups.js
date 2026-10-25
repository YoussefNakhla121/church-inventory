const supabase = require('../config/supabase');
const { cacheGet, cacheSet } = require('../config/redis');
const { KEYS, TTL } = require('./cacheKeys');

const ADMIN_EXTRA_GRADE_GROUPS = ['ابتدائي'];

const getGradeGroupNames = async () => {
  const cached = await cacheGet(KEYS.GRADEGROUPS);
  if (cached !== null) return cached;

  const { data, error } = await supabase
    .from('gradegroup')
    .select('name')
    .not('name', 'is', null)
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);

  const values = (data || [])
    .map((item) => item.name)
    .filter((name) => typeof name === 'string' && name.trim().length > 0)
    .map((name) => name.trim());

  await cacheSet(KEYS.GRADEGROUPS, values, TTL.GRADEGROUPS);
  return values;
};

module.exports = { ADMIN_EXTRA_GRADE_GROUPS, getGradeGroupNames };
