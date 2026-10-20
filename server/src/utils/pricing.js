function calculateTotalPrice(items, priceMap, start, end) {
  const durationMs = end - start;
  const numDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24));
  const isMultiDay = numDays > 1;

  let totalPrice = 0;
  for (const item of items) {
    const unitPrice = priceMap[item.item_id] ?? 0;
    const qty = item.quantity_requested;

    if (isMultiDay) {
      totalPrice += unitPrice * 2 * numDays * qty;
    } else {
      totalPrice += unitPrice * qty;
    }
  }

  return Math.round(totalPrice * 100) / 100;
}

module.exports = { calculateTotalPrice };
