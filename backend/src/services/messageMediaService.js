const path = require('node:path');
const { Readable } = require('node:stream');
const cloudinary = require('cloudinary').v2;
const AppError = require('../utils/AppError');

const getCloudinary = () => {
  const {
    CLOUDINARY_CLOUD_NAME: cloudName,
    CLOUDINARY_API_KEY: apiKey,
    CLOUDINARY_API_SECRET: apiSecret,
  } = process.env;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new AppError(
      503,
      'MEDIA_STORAGE_NOT_CONFIGURED',
      'Message file storage is not configured',
    );
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
  return cloudinary;
};

const getResourceType = (mimeType) => {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'raw';
};

const uploadMessageMedia = async (file) => {
  const storage = getCloudinary();
  const resourceType = getResourceType(file.mimetype);
  const originalName = path
    .basename(file.originalname || 'file')
    .split('')
    .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
    .join('')
    .slice(0, 255);
  try {
    const uploaded = await new Promise((resolve, reject) => {
      const uploadStream = storage.uploader.upload_stream(
        {
          folder: 'Nexora/messages',
          resource_type: resourceType,
          use_filename: false,
          unique_filename: true,
        },
        (error, result) => (error ? reject(error) : resolve(result)),
      );
      Readable.from([file.buffer]).pipe(uploadStream);
    });
    return {
      url: uploaded.secure_url,
      publicId: uploaded.public_id,
      resourceType,
      mimeType: file.mimetype,
      originalName,
      sizeBytes: file.size,
    };
  } catch (error) {
    throw new AppError(502, 'MEDIA_UPLOAD_FAILED', 'Could not upload the file. Please try again', {
      cause: error,
    });
  }
};

const deleteMessageMedia = async (media) => {
  if (!media?.publicId) return;
  const storage = getCloudinary();
  const result = await storage.uploader.destroy(media.publicId, {
    resource_type: media.resourceType || 'raw',
  });
  if (!['ok', 'not found'].includes(result.result)) {
    throw new Error(`Unexpected Cloudinary deletion status: ${result.result}`);
  }
};

module.exports = { deleteMessageMedia, uploadMessageMedia };
