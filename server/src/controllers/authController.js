const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');

const SALT_ROUNDS = 10;
const JWT_EXPIRES_IN = '7d';

/**
 * POST /api/auth/register
 * Body: { username, password, phone, role, grade_group }
 */
const register = async (req, res) => {
  try {
    const { username, password, phone, role, gradegroup } = req.body;

    // ── Validate required fields ──────────────────────────────────────────────
    if (!username || !password || !phone || !role || !gradegroup) {
      return res.status(400).json({ error: 'username, password, phone, role, and grade_group are required' });
    }

    if (!['requester', 'manager'].includes(role)) {
      return res.status(400).json({ error: 'role must be "requester" or "manager"' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'password must be at least 6 characters' });
    }

    // ── Check for existing username ───────────────────────────────────────────
    const { data: existing, error: lookupError } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (lookupError) {
      return res.status(500).json({ error: lookupError.message });
    }

    if (existing) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    // ── Hash password & insert user ───────────────────────────────────────────
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({ username, password_hash, phone, role, gradegroup })
      .select('id, username, role, gradegroup')
      .single();

    if (insertError) {
      return res.status(500).json({ error: insertError.message });
    }

    // ── Issue JWT ─────────────────────────────────────────────────────────────
    const token = jwt.sign(
      { id: newUser.id, username: newUser.username, role: newUser.role },
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
 * POST /api/auth/login
 * Body: { username, password }
 */
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // ── Validate required fields ──────────────────────────────────────────────
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }

    // ── Fetch user by username ────────────────────────────────────────────────
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, password_hash, role, phone, gradegroup')
      .eq('username', username)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // ── Compare password ──────────────────────────────────────────────────────
    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // ── Issue JWT ─────────────────────────────────────────────────────────────
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.status(200).json({
      token,
      user: { id: user.id, username: user.username, role: user.role, phone: user.phone, gradegroup: user.gradegroup },
    });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * PUT /api/auth/profile
 * Body: { username, phone, gradegroup }
 * Headers: Authorization: Bearer <token>
 */
const updateProfile = async (req, res) => {
  try {
    const { username, phone, gradegroup } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // ── Validate required fields ──────────────────────────────────────────────
    if (!username || !phone || !gradegroup) {
      return res.status(400).json({ error: 'username, phone, and gradegroup are required' });
    }

    // ── Check if new username is taken by another user ────────────────────────
    const { data: currentUser, error: fetchError } = await supabase
      .from('users')
      .select('username')
      .eq('id', userId)
      .single();

    if (fetchError) {
      return res.status(500).json({ error: fetchError.message });
    }

    // If username changed, check it's not taken
    if (currentUser.username !== username) {
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('username', username)
        .maybeSingle();

      if (existing) {
        return res.status(400).json({ error: 'Username already taken' });
      }
    }

    // ── Update user profile ───────────────────────────────────────────────────
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update({ username, phone, gradegroup })
      .eq('id', userId)
      .select('id, username, role, phone, gradegroup')
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

module.exports = { register, login, updateProfile };
