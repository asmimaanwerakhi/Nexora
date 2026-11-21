const getAllowedOrigins = () => {
  const configuredOrigins = process.env.CORS_ORIGINS;

  if (!configuredOrigins && process.env.NODE_ENV === 'production') {
    throw new Error('CORS_ORIGINS is required in production');
  }

  const origins = configuredOrigins || 'http://localhost:5173';

  return origins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

module.exports = { getAllowedOrigins };
