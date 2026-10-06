const supabase = require('../config/supabase');

const validateItemInput = ({ name, total_quantity, price }) => {
  if (!name || !total_quantity) {
    const error = new Error('name and total_quantity are required');
    error.statusCode = 400;
    throw error;
  }

  const qty = parseInt(total_quantity, 10);
  if (isNaN(qty) || qty < 1) {
    const error = new Error('total_quantity must be an integer >= 1');
    error.statusCode = 400;
    throw error;
  }

  const priceValue = price !== undefined && price !== null && price !== ''
    ? parseFloat(price)
    : 0;

  if (isNaN(priceValue) || priceValue < 0) {
    const error = new Error('price must be a number equal to or greater than 0');
    error.statusCode = 400;
    throw error;
  }

  return { qty, priceValue };
};

const insertItem = async ({ name, description, total_quantity, category, price, photo_url }) => {
  const { qty, priceValue } = validateItemInput({ name, total_quantity, price });
  const { data, error } = await supabase
    .from('items')
    .insert({
      name,
      description: description || null,
      total_quantity: qty,
      category: category || null,
      price: priceValue,
      photo_url: photo_url || null,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

module.exports = { validateItemInput, insertItem };
