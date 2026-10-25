const supabase = require('../config/supabase');

const PHOTO_CACHE_CONTROL = '31536000'; // 1 year, filenames are unique UUIDs

/**
 * Uploads a file buffer to Supabase Storage.
 *
 * @param {Buffer} buffer     - The file buffer from multer memory storage
 * @param {string} filename   - Desired filename/path inside the bucket
 * @param {string} mimetype   - MIME type of the file (e.g. 'image/jpeg')
 * @param {string} [bucket]   - Target bucket name (default: 'item-photos')
 * @returns {Promise<string>} - The stored filename/path of the uploaded file
 */
const uploadToStorage = async (buffer, filename, mimetype, bucket = 'item-photos') => {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(filename, buffer, {
      contentType: mimetype,
      cacheControl: PHOTO_CACHE_CONTROL,
      upsert: true, // overwrite on re-upload (e.g. item photo update)
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  return data.path;
};

const photoUrl = (value, bucket = 'item-photos') => {
  if (!value) return null;
  if (value.startsWith('http')) return value;
  return supabase.storage.from(bucket).getPublicUrl(value).data.publicUrl;
};

const withPhotoUrl = (item) => {
  if (item === null || item === undefined) return item;
  return { ...item, photo_url: photoUrl(item.photo_url) };
};

const removeFromStorage = async (value, bucket = 'item-photos') => {
  let filePath = value;

  if (value && value.startsWith('http')) {
    const bucketPath = `/storage/v1/object/public/${bucket}/`;
    const urlPath = new URL(value).pathname;
    const bucketPathIndex = urlPath.indexOf(bucketPath);

    if (bucketPathIndex === -1) {
      throw new Error(`Photo URL does not belong to the ${bucket} bucket`);
    }

    filePath = decodeURIComponent(urlPath.slice(bucketPathIndex + bucketPath.length));
  }

  if (!filePath) return;

  const { error } = await supabase.storage.from(bucket).remove([filePath]);
  if (error) {
    throw new Error(`Storage removal failed: ${error.message}`);
  }
};

module.exports = {
  PHOTO_CACHE_CONTROL,
  uploadToStorage,
  photoUrl,
  withPhotoUrl,
  removeFromStorage,
};
