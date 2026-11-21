const errorHandler = (error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const statusCode =
    Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode <= 599
      ? error.statusCode
      : error.code === 'LIMIT_FILE_SIZE'
        ? 413
        : error.type === 'entity.parse.failed'
          ? 400
          : 500;
  const code =
    error.type === 'entity.parse.failed'
      ? 'INVALID_JSON'
      : error.code === 'LIMIT_FILE_SIZE'
        ? 'FILE_TOO_LARGE'
        : error.code || (statusCode === 404 ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR');

  if (statusCode >= 500) {
    console.error(error);
  }

  const message =
    statusCode >= 500 && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : error.code === 'LIMIT_FILE_SIZE'
        ? 'Uploaded images must be 5 MB or smaller'
        : error.message || 'Internal server error';

  return res.status(statusCode).json({
    error: {
      code,
      message,
    },
  });
};

module.exports = errorHandler;
