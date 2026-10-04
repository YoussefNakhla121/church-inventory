const supabase = require('../config/supabase');

/**
 * Uploads a file buffer to Supabase Storage.
 *
 * @param {Buffer} buffer     - The file buffer from multer memory storage
 * @param {string} filename   - Desired filename/path inside the bucket
 * @param {string} mimetype   - MIME type of the file (e.g. 'image/jpeg')
 * @param {string} [bucket]   - Target bucket name (default: 'item-photos')
 * @returns {Promise<string>} - The public URL of the uploaded file
 */
const uploadToStorage = async (buffer, filename, mimetype, bucket = 'item-photos') => {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(filename, buffer, {
      contentType: mimetype,
      upsert: true, // overwrite on re-upload (e.g. item photo update)
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data: publicData } = supabase.storage
    .from(bucket)
    .getPublicUrl(data.path);

  return publicData.publicUrl;
};

const removeFromStorage = async (publicUrl, bucket = 'item-photos') => {
  const bucketPath = `/storage/v1/object/public/${bucket}/`;
  const urlPath = new URL(publicUrl).pathname;
  const bucketPathIndex = urlPath.indexOf(bucketPath);

  if (bucketPathIndex === -1) {
    throw new Error(`Photo URL does not belong to the ${bucket} bucket`);
  }

  const filePath = decodeURIComponent(urlPath.slice(bucketPathIndex + bucketPath.length));
  if (!filePath) return;

  const { error } = await supabase.storage.from(bucket).remove([filePath]);
  if (error) {
    throw new Error(`Storage removal failed: ${error.message}`);
  }
};

module.exports = { uploadToStorage, removeFromStorage };
