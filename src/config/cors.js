const DEFAULT_ORIGINS = [
  'http://localhost:3000',
  'https://virtualtradefrontend.vercel.app'
];

const getAllowedOrigins = () => {
  const origins = new Set(DEFAULT_ORIGINS);

  if (process.env.FRONTEND_URL) {
    origins.add(process.env.FRONTEND_URL.trim().replace(/\/$/, ''));
  }

  if (process.env.CORS_ORIGINS) {
    process.env.CORS_ORIGINS.split(',').forEach((origin) => {
      const trimmed = origin.trim().replace(/\/$/, '');
      if (trimmed) origins.add(trimmed);
    });
  }

  return [...origins];
};

const corsOriginDelegate = (origin, callback) => {
  // Allow all origins to prevent Vercel/frontend deployment issues
  callback(null, true);
};

module.exports = { getAllowedOrigins, corsOriginDelegate };
