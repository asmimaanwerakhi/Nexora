const { Readable } = require('node:stream');
const cloudinary = require('cloudinary').v2;
const AppError = require('../utils/AppError');
const { setAvatar, setCoverPhoto } = require('./authService');

const uploadProfileImage = async (userId, file, options) => {
  const {
    CLOUDINARY_CLOUD_NAME: cloudName,
    CLOUDINARY_API_KEY: apiKey,
    CLOUDINARY_API_SECRET: apiSecret,
  } = process.env;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new AppError(503, options.storageErrorCode, options.storageErrorMessage);
  }

  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
  const uploaded = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder,
        resource_type: 'image',
        transformation: options.transformation,
      },
      (error, result) => {
        if (error) {
          reject(
            new AppError(502, options.uploadErrorCode, options.uploadErrorMessage, {
              cause: error,
            }),
          );
          return;
        }
        resolve(result);
      },
    );
    Readable.from([file.buffer]).pipe(uploadStream);
  });

  const { user, previousPublicId } = await options.save(
    userId,
    uploaded.secure_url,
    uploaded.public_id,
  );

  if (previousPublicId) {
    try {
      const cleanup = await cloudinary.uploader.destroy(previousPublicId, {
        resource_type: 'image',
      });
      if (cleanup.result !== 'ok' && cleanup.result !== 'not found') {
        console.warn(
          `Cloudinary returned an unexpected ${options.label} cleanup status`,
          cleanup.result,
        );
      }
    } catch (error) {
      console.warn(`Could not remove the previous ${options.label} from Cloudinary`, error);
    }
  }

  return user;
};

const uploadAvatar = (userId, file) =>
  uploadProfileImage(userId, file, {
    folder: 'Nexora/avatars',
    transformation: [{ width: 512, height: 512, crop: 'limit' }],
    label: 'avatar',
    storageErrorCode: 'AVATAR_STORAGE_NOT_CONFIGURED',
    storageErrorMessage: 'Avatar storage is not configured',
    uploadErrorCode: 'AVATAR_UPLOAD_FAILED',
    uploadErrorMessage: 'Could not upload the image. Please try again',
    save: setAvatar,
  });

const uploadCoverPhoto = (userId, file) =>
  uploadProfileImage(userId, file, {
    folder: 'Nexora/covers',
    transformation: [{ width: 1600, height: 600, crop: 'fill', gravity: 'auto' }],
    label: 'cover photo',
    storageErrorCode: 'COVER_PHOTO_STORAGE_NOT_CONFIGURED',
    storageErrorMessage: 'Cover photo storage is not configured',
    uploadErrorCode: 'COVER_PHOTO_UPLOAD_FAILED',
    uploadErrorMessage: 'Could not upload the cover photo. Please try again',
    save: setCoverPhoto,
  });

module.exports = { uploadAvatar, uploadCoverPhoto };
