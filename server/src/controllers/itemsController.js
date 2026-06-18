const supabase = require('../config/supabase');
const { uploadToStorage } = require('../utils/storage');
const { v4: uuidv4 } = require('uuid');

/**
 * GET /api/items
 * Returns active items. Managers can pass ?include_inactive=true to get all items.
 */
const getItems = async (req, res) => {
  try {
    const includeInactive = req.query.include_inactive === 'true' && req.user?.role === 'manager';

    let query = supabase
      .from('items')
      .select('*')
      .order('created_at', { ascending: false });

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json(data);
  } catch (err) {
    console.error('getItems error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/items/:id/availability?start=...&end=...
 * Returns available quantity for an item in the given time window,
 * by subtracting approved/prepared reservations from total_quantity.
 */
const getItemAvailability = async (req, res) => {
  try {
    const { id } = req.params;
    const { start, end } = req.query;

    if (!start || !end) {
      return res.status(400).json({ error: 'Query params "start" and "end" are required' });
    }

    const startTime = new Date(start);
    const endTime = new Date(end);

    if (isNaN(startTime) || isNaN(endTime)) {
      return res.status(400).json({ error: 'Invalid date format for "start" or "end"' });
    }

    if (endTime <= startTime) {
      return res.status(400).json({ error: '"end" must be after "start"' });
    }

    // Fetch the item
    const { data: item, error: itemError } = await supabase
      .from('items')
      .select('id, name, total_quantity, is_active')
      .eq('id', id)
      .maybeSingle();

    if (itemError) return res.status(500).json({ error: itemError.message });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    // Sum quantities already reserved in overlapping approved/prepared requests
    const { data: reservedRows, error: reservedError } = await supabase
      .from('request_items')
      .select(`
        quantity_requested,
        requests!inner (
          status,
          start_time,
          end_time
        )
      `)
      .eq('item_id', id)
      .in('requests.status', ['approved', 'prepared'])
      .lt('requests.start_time', endTime.toISOString())
      .gt('requests.end_time', startTime.toISOString());

    if (reservedError) return res.status(500).json({ error: reservedError.message });

    const totalReserved = (reservedRows || []).reduce(
      (sum, row) => sum + row.quantity_requested,
      0
    );

    const available = Math.max(0, item.total_quantity - totalReserved);

    return res.status(200).json({
      item_id: item.id,
      item_name: item.name,
      total_quantity: item.total_quantity,
      reserved_in_window: totalReserved,
      available_in_window: available,
    });
  } catch (err) {
    console.error('getItemAvailability error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/items/:id/condition-history
 * Manager only. Returns all condition reports for an item,
 * joined with request and reporter info.
 */
const getItemConditionHistory = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: item, error: itemError } = await supabase
      .from('items')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (itemError) return res.status(500).json({ error: itemError.message });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const { data, error } = await supabase
      .from('item_condition_reports')
      .select(`
        id,
        condition,
        notes,
        reported_at,
        requests (
          id,
          start_time,
          end_time
        ),
        reporter:users!item_condition_reports_reported_by_fkey (
          id,
          username
        )
      `)
      .eq('item_id', id)
      .order('reported_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json(data);
  } catch (err) {
    console.error('getItemConditionHistory error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * POST /api/items
 * Manager only. Creates a new item.
 * Accepts an optional multipart 'photo' file.
 */
const createItem = async (req, res) => {
  try {
    const { name, description, total_quantity, category, price } = req.body;

    if (!name || !total_quantity) {
      return res.status(400).json({ error: 'name and total_quantity are required' });
    }

    const qty = parseInt(total_quantity, 10);
    if (isNaN(qty) || qty < 1) {
      return res.status(400).json({ error: 'total_quantity must be an integer >= 1' });
    }

    const priceValue = price !== undefined && price !== null && price !== ''
      ? parseFloat(price)
      : 0;

    if (isNaN(priceValue) || priceValue < 0) {
      return res.status(400).json({ error: 'price must be a number equal to or greater than 0' });
    }

    let photo_url = null;

    if (req.file) {
      const ext = req.file.originalname.split('.').pop();
      const filename = `${uuidv4()}.${ext}`;
      photo_url = await uploadToStorage(req.file.buffer, filename, req.file.mimetype);
    }

    const { data, error } = await supabase
      .from('items')
      .insert({
        name,
        description: description || null,
        total_quantity: qty,
        category: category || null,
        price: priceValue,
        photo_url,
        is_active: true,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    return res.status(201).json(data);
  } catch (err) {
    console.error('createItem error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

/**
 * PATCH /api/items/:id
 * Manager only. Updates any item fields.
 * Accepts an optional new 'photo' file.
 */
const updateItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, total_quantity, category, price } = req.body;

    // Verify item exists
    const { data: existing, error: lookupError } = await supabase
      .from('items')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (lookupError) return res.status(500).json({ error: lookupError.message });
    if (!existing) return res.status(404).json({ error: 'Item not found' });

    const updates = {};

    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (category !== undefined) updates.category = category;

    if (total_quantity !== undefined) {
      const qty = parseInt(total_quantity, 10);
      if (isNaN(qty) || qty < 1) {
        return res.status(400).json({ error: 'total_quantity must be an integer >= 1' });
      }
      updates.total_quantity = qty;
    }

    if (price !== undefined) {
      const priceValue = price === '' ? 0 : parseFloat(price);
      if (isNaN(priceValue) || priceValue < 0) {
        return res.status(400).json({ error: 'price must be a number equal to or greater than 0' });
      }
      updates.price = priceValue;
    }

    if (req.file) {
      const ext = req.file.originalname.split('.').pop();
      const filename = `${uuidv4()}.${ext}`;
      updates.photo_url = await uploadToStorage(req.file.buffer, filename, req.file.mimetype);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields provided to update' });
    }

    const { data, error } = await supabase
      .from('items')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json(data);
  } catch (err) {
    console.error('updateItem error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

/**
 * PATCH /api/items/:id/deactivate
 * Manager only. Soft-deletes an item (is_active = false).
 */
const deactivateItem = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: existing, error: lookupError } = await supabase
      .from('items')
      .select('id, is_active')
      .eq('id', id)
      .maybeSingle();

    if (lookupError) return res.status(500).json({ error: lookupError.message });
    if (!existing) return res.status(404).json({ error: 'Item not found' });
    if (!existing.is_active) {
      return res.status(400).json({ error: 'Item is already inactive' });
    }

    const { data, error } = await supabase
      .from('items')
      .update({ is_active: false })
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json(data);
  } catch (err) {
    console.error('deactivateItem error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * PATCH /api/items/:id/reactivate
 * Manager only. Restores a deactivated item (is_active = true).
 */
const reactivateItem = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: existing, error: lookupError } = await supabase
      .from('items')
      .select('id, is_active')
      .eq('id', id)
      .maybeSingle();

    if (lookupError) return res.status(500).json({ error: lookupError.message });
    if (!existing) return res.status(404).json({ error: 'Item not found' });
    if (existing.is_active) {
      return res.status(400).json({ error: 'Item is already active' });
    }

    const { data, error } = await supabase
      .from('items')
      .update({ is_active: true })
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json(data);
  } catch (err) {
    console.error('reactivateItem error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  getItems,
  getItemAvailability,
  getItemConditionHistory,
  createItem,
  updateItem,
  deactivateItem,
  reactivateItem,
};
