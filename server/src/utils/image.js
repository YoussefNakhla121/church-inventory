const sharp = require('sharp');

const MAX_IMAGE_SIZE_BYTES = 1 * 1024 * 1024;
const MAX_COMPRESSED_SIZE_BYTES = 0.3 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 800;

const validateImage = (buffer, mimetype) => {
  if (!mimetype || !mimetype.startsWith('image/')) {
    throw new Error('Only image files are allowed');
  }

  if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
    throw new Error('Image exceeds the 1 MB file size limit');
  }
};

/**
 * Matches the manager form's browser-image-compression settings:
 * maxSizeMB: 0.3 and maxWidthOrHeight: 800.
 */
const compressImage = async (buffer, mimetype) => {
  validateImage(buffer, mimetype);

  const image = sharp(buffer).resize({
    width: MAX_IMAGE_DIMENSION,
    height: MAX_IMAGE_DIMENSION,
    fit: 'inside',
    withoutEnlargement: true,
  });

  let quality = 80;
  let compressed;
  const format = mimetype === 'image/png' ? 'png'
    : mimetype === 'image/webp' ? 'webp'
      : mimetype === 'image/avif' ? 'avif'
        : 'jpeg';

  do {
    const formatOptions = format === 'png'
      ? { compressionLevel: 9, quality }
      : { quality };
    compressed = await image.clone().toFormat(format, formatOptions).toBuffer();
    quality -= 10;
  } while (compressed.length > MAX_COMPRESSED_SIZE_BYTES && quality >= 40);

  if (compressed.length > MAX_COMPRESSED_SIZE_BYTES) {
    throw new Error('Unable to compress image below the 300 KB limit');
  }

  return {
    buffer: compressed,
    mimetype,
  };
};

module.exports = {
  MAX_IMAGE_SIZE_BYTES,
  MAX_COMPRESSED_SIZE_BYTES,
  MAX_IMAGE_DIMENSION,
  validateImage,
  compressImage,
};
