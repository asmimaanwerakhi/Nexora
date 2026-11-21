const multer = require('multer');
const AppError = require('../utils/AppError');

const allowedTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
  'application/pdf',
]);

const uploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 4 },
  fileFilter(_req, file, callback) {
    const mimeType = file.mimetype.split(';', 1)[0].trim().toLowerCase();
    if (!allowedTypes.has(mimeType)) {
      callback(
        new AppError(400, 'UNSUPPORTED_MEDIA_TYPE', 'Use an image, video, audio, or PDF file'),
      );
      return;
    }
    file.mimetype = mimeType;
    callback(null, true);
  },
});

const uploadMessageFile = (req, res, next) => {
  uploader.single('file')(req, res, (error) => {
    if (error?.code === 'LIMIT_FILE_SIZE') {
      next(new AppError(413, 'FILE_TOO_LARGE', 'Files must be 50 MB or smaller'));
      return;
    }
    if (error?.code === 'LIMIT_UNEXPECTED_FILE') {
      next(new AppError(400, 'INVALID_UPLOAD', 'Upload one file using the file field'));
      return;
    }
    if (error) {
      next(error);
      return;
    }
    next();
  });
};

const hasSignature = (file) => {
  const buffer = file.buffer;
  const startsWith = (...bytes) => bytes.every((byte, index) => buffer[index] === byte);
  switch (file.mimetype) {
    case 'image/jpeg':
      return startsWith(0xff, 0xd8, 0xff);
    case 'image/png':
      return (
        buffer.length >= 8 &&
        buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      );
    case 'image/webp':
      return (
        buffer.length >= 12 &&
        buffer.toString('ascii', 0, 4) === 'RIFF' &&
        buffer.toString('ascii', 8, 12) === 'WEBP'
      );
    case 'image/gif':
      return ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6));
    case 'video/mp4':
    case 'video/quicktime':
    case 'audio/mp4':
      return buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp';
    case 'video/webm':
    case 'audio/webm':
      return startsWith(0x1a, 0x45, 0xdf, 0xa3);
    case 'audio/mpeg':
      return (
        buffer.toString('ascii', 0, 3) === 'ID3' ||
        (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
      );
    case 'audio/wav':
      return (
        buffer.length >= 12 &&
        buffer.toString('ascii', 0, 4) === 'RIFF' &&
        buffer.toString('ascii', 8, 12) === 'WAVE'
      );
    case 'audio/ogg':
      return buffer.toString('ascii', 0, 4) === 'OggS';
    case 'application/pdf':
      return buffer.toString('ascii', 0, 5) === '%PDF-';
    default:
      return false;
  }
};

const validateMessageFile = (req, _res, next) => {
  if (!req.file) {
    next(new AppError(400, 'FILE_REQUIRED', 'Choose a file to send'));
    return;
  }
  if (req.file.mimetype.startsWith('image/') && req.file.size > 10 * 1024 * 1024) {
    next(new AppError(413, 'FILE_TOO_LARGE', 'Images must be 10 MB or smaller'));
    return;
  }
  if (!hasSignature(req.file)) {
    next(new AppError(400, 'INVALID_MEDIA_FILE', 'The file content does not match its media type'));
    return;
  }
  next();
};

module.exports = { uploadMessageFile, validateMessageFile };
