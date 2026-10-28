#!/usr/bin/env node

const path = require('path');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const supabase = require('../src/config/supabase');
const { calculateTotalPrice } = require('../src/utils/pricing');

const VALID_STATUSES = ['approved', 'prepared', 'completed', 'cancelled'];

const printUsage = () => {
  console.error(
    [
      'Usage:',
      '  node scripts/create-past-request.js <requester-gmail> <item-id[:quantity]> [item-id[:quantity] ...] [options]',
      '',
      'Options:',
      '  --days-ago=<number>       Request start time in the past (default: 7)',
      '  --duration-hours=<number> Reservation duration (default: 2)',
      '  --status=<status>         approved, prepared, completed, or cancelled (default: completed)',
      '  --notes=<text>            Optional request notes',
      '',
      'Example:',
      '  node scripts/create-past-request.js member@example.com  uuid-1:2 uuid-2 --days-ago=30',
    ].join('\n')
  );
};

const parseOptions = (argumentsList) => {
  const positional = [];
  const options = {};

  for (const argument of argumentsList) {
    if (!argument.startsWith('--')) {
      positional.push(argument);
      continue;
    }

    const separatorIndex = argument.indexOf('=');
    if (separatorIndex === -1) {
      throw new Error(`Option "${argument}" must use the --name=value format.`);
    }

    const name = argument.slice(2, separatorIndex);
    const value = argument.slice(separatorIndex + 1);
    if (!value) throw new Error(`Option "${argument}" cannot have an empty value.`);
    options[name] = value;
  }

  return { positional, options };
};

const parsePositiveNumber = (value, optionName) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${optionName} must be a positive number.`);
  }
  return number;
};

const parseItemSpec = (specification) => {
  const [itemId, quantityText] = specification.split(':');
  const quantity = quantityText === undefined ? 1 : Number(quantityText);

  if (!itemId || !Number.isInteger(quantity) || quantity < 1) {
    throw new Error(`Invalid item specification "${specification}". Use item-id[:quantity].`);
  }

  return { item_id: itemId, quantity_requested: quantity };
};

const removeCreatedRequest = async (requestId) => {
  const { error: itemsError } = await supabase
    .from('request_items')
    .delete()
    .eq('request_id', requestId);

  if (itemsError) {
    throw new Error(`Could not clean up request items: ${itemsError.message}`);
  }

  const { error: requestError } = await supabase.from('requests').delete().eq('id', requestId);
  if (requestError) {
    throw new Error(`Could not clean up request: ${requestError.message}`);
  }
};

const main = async () => {
  const { positional, options } = parseOptions(process.argv.slice(2));
  const [requesterGmail, ...itemSpecifications] = positional;

  if (!requesterGmail || itemSpecifications.length === 0) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const unknownOptions = Object.keys(options).filter(
    (option) => !['days-ago', 'duration-hours', 'status', 'notes'].includes(option)
  );
  if (unknownOptions.length) {
    throw new Error(`Unknown option(s): ${unknownOptions.map((option) => `--${option}`).join(', ')}`);
  }

  const daysAgo = parsePositiveNumber(options['days-ago'] || '7', '--days-ago');
  const durationHours = parsePositiveNumber(
    options['duration-hours'] || '2',
    '--duration-hours'
  );
  const status = options.status || 'completed';
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`--status must be one of: ${VALID_STATUSES.join(', ')}.`);
  }

  const requestedItems = itemSpecifications.map(parseItemSpec);
  const quantitiesByItemId = new Map();
  for (const requestedItem of requestedItems) {
    quantitiesByItemId.set(
      requestedItem.item_id,
      (quantitiesByItemId.get(requestedItem.item_id) || 0) + requestedItem.quantity_requested
    );
  }
  const items = [...quantitiesByItemId].map(([item_id, quantity_requested]) => ({
    item_id,
    quantity_requested,
  }));

  const normalizedGmail = requesterGmail.trim().toLowerCase();
  const { data: requester, error: requesterError } = await supabase
    .from('users')
    .select('id, full_name, gmail, gradegroup')
    .eq('gmail', normalizedGmail)
    .maybeSingle();

  if (requesterError) throw new Error(`Could not find requester: ${requesterError.message}`);
  if (!requester) throw new Error(`No user found with Gmail "${normalizedGmail}".`);

  const itemIds = items.map((item) => item.item_id);
  const { data: itemRows, error: itemsError } = await supabase
    .from('items')
    .select('id, name, price')
    .in('id', itemIds);

  if (itemsError) throw new Error(`Could not find items: ${itemsError.message}`);

  const itemMap = new Map((itemRows || []).map((item) => [item.id, item]));
  const missingItemIds = itemIds.filter((itemId) => !itemMap.has(itemId));
  if (missingItemIds.length) {
    throw new Error(`No item found for ID(s): ${missingItemIds.join(', ')}`);
  }

  const start = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  if (end >= new Date()) {
    throw new Error('The request end time must be in the past; increase --days-ago.');
  }
  const priceMap = Object.fromEntries(itemRows.map((item) => [item.id, item.price ?? 0]));
  const totalPrice = calculateTotalPrice(items, priceMap, start, end);
  const requestId = uuidv4();

  const { data: request, error: requestError } = await supabase
    .from('requests')
    .insert({
      id: requestId,
      requester_id: requester.id,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      notes: options.notes || 'Historical request created by seed script.',
      status,
      gradegroup: requester.gradegroup,
      total_price: totalPrice,
      created_at: start.toISOString(),
    })
    .select('id, requester_id, start_time, end_time, status, gradegroup, total_price, created_at')
    .single();

  if (requestError) throw new Error(`Could not create request: ${requestError.message}`);

  const { data: requestItems, error: requestItemsError } = await supabase
    .from('request_items')
    .insert(items.map((item) => ({ request_id: requestId, ...item })))
    .select('id, request_id, item_id, quantity_requested');

  if (requestItemsError) {
    await removeCreatedRequest(requestId);
    throw new Error(`Could not create request items: ${requestItemsError.message}`);
  }

  console.log('Historical request created successfully:');
  console.log({ request, request_items: requestItems });
  console.log(
    `Items: ${items.map((item) => `${itemMap.get(item.item_id).name} x${item.quantity_requested}`).join(', ')}`
  );
};

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
