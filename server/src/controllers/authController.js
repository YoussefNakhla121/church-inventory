const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');
const { ADMIN_EXTRA_GRADE_GROUPS, getGradeGroupNames } = require('../utils/gradeGroups');

const SALT_ROUNDS = 10;
const JWT_EXPIRES_IN = '7d';

const createUser = async (req, res, role) => {
  try {
    const { full_name, gmail, password, phone, gradegroup } = req.body;
    const trimmedFullName = full_name?.trim();
    let storedGradegroup = gradegroup;

    // ── Validate required fields ──────────────────────────────────────────────
    if (!trimmedFullName || !gmail || !password || !phone || !gradegroup) {
      return res.status(400).json({ error: 'full_name, gmail, password, phone, and grade_group are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'password must be at least 6 characters' });
    }

    if (role === 'admin') {
      const trimmedGradegroup = typeof gradegroup === 'string' ? gradegroup.trim() : '';
      const allowedGradeGroups = [
        ...(await getGradeGroupNames()),
        ...ADMIN_EXTRA_GRADE_GROUPS,
      ];

      if (!allowedGradeGroups.includes(trimmedGradegroup)) {
        return res.status(400).json({ error: 'gradegroup must be one of the available grade groups' });
      }
      storedGradegroup = trimmedGradegroup;
    }

    // ── Check for existing gmail ────────────────────────────────────────────────
    const { data: existing, error: lookupError } = await supabase
      .from('users')
      .select('id')
      .eq('gmail', gmail)
      .maybeSingle();

    if (lookupError) {
      return res.status(500).json({ error: lookupError.message });
    }

    if (existing) {
      return res.status(400).json({ error: 'Gmail already taken' });
    }

    // ── Hash password & insert user ───────────────────────────────────────────
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({ full_name: trimmedFullName, gmail, password_hash, phone, role, gradegroup: storedGradegroup })
      .select('id, full_name, gmail, role, gradegroup')
      .single();

    if (insertError) {
      return res.status(500).json({ error: insertError.message });
    }

    // ── Issue JWT ─────────────────────────────────────────────────────────────
    const token = jwt.sign(
      { id: newUser.id, gmail: newUser.gmail, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.status(201).json({ token, user: newUser });
  } catch (err) {
    console.error('register error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * POST /api/auth/register
 * Body: { full_name, gmail, password, phone, grade_group }
 */
const register = (req, res) => createUser(req, res, 'requester');

/**
 * POST /api/auth/register-manager
 * Body: { full_name, gmail, password, phone, grade_group }
 */
const registerManager = (req, res) => createUser(req, res, 'manager');

/**
 * POST /api/auth/register-admin
 * Body: { full_name, gmail, password, phone, gradegroup }
 */
const registerAdmin = (req, res) => createUser(req, res, 'admin');

/**
 * POST /api/auth/login
 * Body: { gmail, password }
 */
const login = async (req, res) => {
  try {
    const { gmail, password } = req.body;

    // ── Validate required fields ──────────────────────────────────────────────
    if (!gmail || !password) {
      return res.status(400).json({ error: 'gmail and password are required' });
    }

    // ── Fetch user by gmail ─────────────────────────────────────────────────────
    const { data: user, error } = await supabase
      .from('users')
      .select('id, full_name, gmail, password_hash, role, phone, gradegroup')
      .eq('gmail', gmail)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid gmail or password' });
    }

    // ── Compare password ──────────────────────────────────────────────────────
    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      return res.status(401).json({ error: 'Invalid gmail or password' });
    }

    // ── Issue JWT ─────────────────────────────────────────────────────────────
    const token = jwt.sign(
      { id: user.id, gmail: user.gmail, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.status(200).json({
      token,
      user: { id: user.id, full_name: user.full_name, gmail: user.gmail, role: user.role, phone: user.phone, gradegroup: user.gradegroup },
    });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * PUT /api/auth/profile
 * Body: { full_name, gmail, phone, gradegroup }
 * Headers: Authorization: Bearer <token>
 */
const updateProfile = async (req, res) => {
  try {
    const { full_name, gmail, phone, gradegroup } = req.body;
    const trimmedFullName = full_name?.trim();
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // ── Validate required fields ──────────────────────────────────────────────
    if (!trimmedFullName || !gmail || !phone || !gradegroup) {
      return res.status(400).json({ error: 'full_name, gmail, phone, and gradegroup are required' });
    }

    // ── Check if new gmail is taken by another user ─────────────────────────
    const { data: currentUser, error: fetchError } = await supabase
      .from('users')
      .select('gmail, role')
      .eq('id', userId)
      .single();

    if (fetchError) {
      return res.status(500).json({ error: fetchError.message });
    }

    let storedGradegroup = gradegroup;
    if (currentUser.role === 'admin') {
      storedGradegroup = typeof gradegroup === 'string' ? gradegroup.trim() : '';
      const allowedGradeGroups = [
        ...(await getGradeGroupNames()),
        ...ADMIN_EXTRA_GRADE_GROUPS,
      ];

      if (!allowedGradeGroups.includes(storedGradegroup)) {
        return res.status(400).json({ error: 'gradegroup must be one of the available grade groups' });
      }
    }

    // If gmail changed, check it's not taken
    if (currentUser.gmail !== gmail) {
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('gmail', gmail)
        .maybeSingle();

      if (existing) {
        return res.status(400).json({ error: 'Gmail already taken' });
      }
    }

    // ── Update user profile ───────────────────────────────────────────────────
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update({ full_name: trimmedFullName, gmail, phone, gradegroup: storedGradegroup })
      .eq('id', userId)
      .select('id, full_name, gmail, role, phone, gradegroup')
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    return res.status(200).json({ user: updatedUser });
  } catch (err) {
    console.error('updateProfile error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { register, registerManager, registerAdmin, login, updateProfile, createUser };
