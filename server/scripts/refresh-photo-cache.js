const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const supabase = require('../src/config/supabase');
const { PHOTO_CACHE_CONTROL } = require('../src/utils/storage');

const BUCKET = 'item-photos';
const APPLY = process.argv.includes('--apply');
const PAGE_SIZE = 1000;

const listObjects = async (prefix = '') => {
  const objects = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });

    if (error) {
      throw new Error(`Could not list ${prefix || 'bucket root'}: ${error.message}`);
    }

    const entries = data || [];
    for (const entry of entries) {
      const objectPath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.id) {
        objects.push({ ...entry, path: objectPath });
      } else {
        objects.push(...await listObjects(objectPath));
      }
    }

    if (entries.length < PAGE_SIZE) break;
  }

  return objects;
};

const refreshObject = async (object) => {
  const contentType = object.metadata?.mimetype || object.metadata?.contentType || 'application/octet-stream';

  if (!APPLY) {
    console.log(`Would refresh ${object.path} (${contentType})`);
    return;
  }

  const { data: downloaded, error: downloadError } = await supabase.storage
    .from(BUCKET)
    .download(object.path);

  if (downloadError) {
    throw new Error(`Could not download ${object.path}: ${downloadError.message}`);
  }

  const buffer = Buffer.from(await downloaded.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(object.path, buffer, {
      contentType,
      cacheControl: PHOTO_CACHE_CONTROL,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Could not refresh ${object.path}: ${uploadError.message}`);
  }

  console.log(`Refreshed ${object.path} (${contentType})`);
};

const main = async () => {
  const objects = await listObjects();
  console.log(`${APPLY ? 'Refreshing' : 'Would refresh'} ${objects.length} object(s) in ${BUCKET}.`);

  for (const object of objects) {
    await refreshObject(object);
  }

  if (!APPLY) {
    console.log('Dry run only. Re-run with --apply to update cache headers.');
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
