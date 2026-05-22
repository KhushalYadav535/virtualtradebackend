const { ZodError } = require('zod');

const errorHandler = (err, req, res, next) => {
  console.error('Error:', err.message, err.stack?.split('\n').slice(0, 3).join(' | '));

  if (!err.status && (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.message?.includes('connect'))) {
    return res.status(503).json({ error: 'Database unavailable. Try again shortly.' });
  }

  if (!err.status && !err.code?.startsWith?.('23') && err.message?.includes('Cannot read properties of null')) {
    return res.status(503).json({ error: 'Database not configured on server' });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation error',
      details: err.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
    });
  }

  if (err.code === '23505') {
    return res.status(409).json({ error: 'Duplicate entry' });
  }

  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referenced resource not found' });
  }

  if (err.code === '22001') {
    return res.status(400).json({ error: 'Request data too long for server storage' });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
};

const validate = (schema) => {
  return (req, res, next) => {
    try {
      schema.parse(req.body);
      next();
    } catch (err) {
      next(err);
    }
  };
};

module.exports = { errorHandler, validate };