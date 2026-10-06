#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { uploadToStorage } = require('../src/utils/storage');
const { compressImage } = require('../src/utils/image');
const { insertItem } = require('../src/services/itemService');

const DEFAULT_IMPORT_DIRECTORY = path.join(__dirname, 'items-import');

const MIME_TYPES = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const parseCsv = (contents) => {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < contents.length; index += 1) {
    const character = contents[index];
    const nextCharacter = contents[index + 1];

    if (character === '"' && quoted && nextCharacter === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && nextCharacter === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error('CSV contains an unterminated quoted field');
  if (field || row.length) {
    row.push(field);
    if (row.some((value) => value.trim() !== '')) rows.push(row);
  }

  if (!rows.length) throw new Error('CSV is empty');

  const headers = rows.shift().map((header) => header.trim());
  const requiredHeaders = ['name', 'description', 'total_quantity', 'category', 'price', 'image_file'];
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
  if (missingHeaders.length) {
    throw new Error(`CSV is missing required column(s): ${missingHeaders.join(', ')}`);
  }

  return rows.map((values, rowIndex) => {
    const item = {};
    headers.forEach((header, valueIndex) => {
      item[header] = (values[valueIndex] || '').trim();
    });
    item.csvRow = rowIndex + 2;
    return item;
  });
};

const getImageMimeType = (imagePath) => MIME_TYPES[path.extname(imagePath).toLowerCase()];

const importRow = async (row, imagesDirectory) => {
  if (!row.image_file) throw new Error('image_file is required');

  const imagePath = path.resolve(imagesDirectory, row.image_file);
  const imagesRoot = path.resolve(imagesDirectory);
  if (imagePath !== imagesRoot && !imagePath.startsWith(`${imagesRoot}${path.sep}`)) {
    throw new Error('image_file must point inside the images directory');
  }

  const imageBuffer = await fs.readFile(imagePath).catch(() => {
    throw new Error(`image not found: ${row.image_file}`);
  });
  const mimetype = getImageMimeType(imagePath);
  if (!mimetype) throw new Error(`unsupported image type: ${path.extname(imagePath) || 'unknown'}`);

  const compressed = await compressImage(imageBuffer, mimetype);
  const extension = path.extname(imagePath).slice(1);
  const filename = `${uuidv4()}.${extension}`;
  const photoUrl = await uploadToStorage(compressed.buffer, filename, compressed.mimetype);

  return insertItem({
    name: row.name,
    description: row.description,
    total_quantity: row.total_quantity,
    category: row.category,
    price: row.price,
    photo_url: photoUrl,
  });
};

const main = async () => {
  const importDirectory = path.resolve(process.argv[2] || DEFAULT_IMPORT_DIRECTORY);
  const csvPath = path.join(importDirectory, 'items.csv');
  const imagesDirectory = path.join(importDirectory, 'images');
  const rows = parseCsv(await fs.readFile(csvPath, 'utf8'));
  const failures = [];
  let successful = 0;

  for (const row of rows) {
    try {
      await importRow(row, imagesDirectory);
      successful += 1;
      console.log(`Imported row ${row.csvRow}: ${row.name}`);
    } catch (error) {
      const reason = error.message || 'unknown error';
      failures.push({ name: row.name || `(CSV row ${row.csvRow})`, reason });
      console.error(`Failed row ${row.csvRow} (${row.name || 'unnamed'}): ${reason}`);
    }
  }

  console.log('\nImport completed.');
  console.log(`Successful: ${successful}`);
  console.log(`Failed: ${failures.length}`);
  if (failures.length) {
    console.log('\nFailed items:');
    failures.forEach(({ name, reason }) => console.log(`- ${name} - ${reason}`));
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error(`Import could not start: ${error.message}`);
  process.exitCode = 1;
});
