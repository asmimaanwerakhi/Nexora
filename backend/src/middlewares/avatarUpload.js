const multer = require('multer');
const AppError = require('../utils/AppError');

const createImageUpload = () =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter(_req, file, callback) {
      const supportedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!supportedTypes.includes(file.mimetype)) {
        callback(new AppError(400, 'UNSUPPORTED_IMAGE_TYPE', 'Use a JPEG, PNG, or WebP image'));
        return;
      }
      callback(null, true);
    },
  });

const uploadAvatar = createImageUpload();
const uploadCoverPhoto = createImageUpload();

const validateImageSignature = (fieldName, label) => (req, _res, next) => {
  const file = req.file;
  if (!file) {
    next(
      new AppError(400, `${fieldName.toUpperCase()}_REQUIRED`, `Choose an image for your ${label}`),
    );
    return;
  }

  const buffer = file.buffer;
  const isPng =
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg =
    buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isWebp =
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP';

  if (!isPng && !isJpeg && !isWebp) {
    next(new AppError(400, 'INVALID_IMAGE', 'The uploaded file is not a valid supported image'));
    return;
  }

  next();
};

const validateAvatarSignature = validateImageSignature('avatar', 'avatar');
const validateCoverPhotoSignature = validateImageSignature('cover_photo', 'cover photo');

module.exports = {
  uploadAvatar,
  uploadCoverPhoto,
  validateAvatarSignature,
  validateCoverPhotoSignature,
};
