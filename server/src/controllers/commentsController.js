const supabase = require('../config/supabase');

/**
 * GET /api/requests/:id/comments
 * All authenticated users. Returns comments ordered oldest-first,
 * joined with author gmail and role.
 */
const getComments = async (req, res) => {
  try {
    const { id } = req.params;

    // Verify the request exists
    const { data: request, error: reqError } = await supabase
      .from('requests')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (reqError) return res.status(500).json({ error: reqError.message });
    if (!request) return res.status(404).json({ error: 'Request not found' });

    const { data, error } = await supabase
      .from('request_comments')
      .select(`
        id,
        body,
        created_at,
        author:users!request_comments_author_id_fkey (
          id,
          full_name,
          gmail,
          role
        )
      `)
      .eq('request_id', id)
      .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json(data);
  } catch (err) {
    console.error('getComments error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * POST /api/requests/:id/comments
 * All authenticated users.
 * - Requesters can only comment on their own requests.
 * - Managers can comment on any request.
 * Body: { body }
 */
const postComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { body } = req.body;

    if (!body || body.trim() === '') {
      return res.status(400).json({ error: 'Comment body is required' });
    }

    // Fetch request to verify existence and ownership for requesters
    const { data: request, error: reqError } = await supabase
      .from('requests')
      .select('id, requester_id')
      .eq('id', id)
      .maybeSingle();

    if (reqError) return res.status(500).json({ error: reqError.message });
    if (!request) return res.status(404).json({ error: 'Request not found' });

    // Requesters can only comment on their own requests
    if (req.user.role === 'requester' && request.requester_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only comment on your own requests' });
    }

    const { data, error } = await supabase
      .from('request_comments')
      .insert({
        request_id: id,
        author_id: req.user.id,
        body: body.trim(),
      })
      .select(`
        id,
        body,
        created_at,
        author:users!request_comments_author_id_fkey (
          id,
          full_name,
          gmail,
          role
        )
      `)
      .single();

    if (error) return res.status(500).json({ error: error.message });

    return res.status(201).json(data);
  } catch (err) {
    console.error('postComment error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { getComments, postComment };
