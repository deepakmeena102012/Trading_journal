const { ZodError } = require('zod');
const mongoose = require('mongoose');

class HttpError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.status = status;
    if (errors) this.errors = errors;
  }
}

/** Wraps an async route handler so rejected promises reach the error middleware. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function zodToFieldErrors(err) {
  const errors = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    const errors = zodToFieldErrors(err);
    return res.status(400).json({ message: Object.values(errors)[0] || 'Invalid input', errors });
  }
  if (err.name === 'CalcValidationError') {
    return res.status(400).json({ message: err.message, errors: err.errors });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    const errors = {};
    for (const [k, v] of Object.entries(err.errors)) errors[k] = v.message;
    return res.status(400).json({ message: Object.values(errors)[0] || 'Invalid data', errors });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ message: `Invalid value for ${err.path}` });
  }
  if (err.code === 11000) {
    return res.status(409).json({ message: 'A record with these details already exists' });
  }
  if (err.name === 'MulterError') {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Image is too large (max 4 MB)' : err.message;
    return res.status(400).json({ message });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Request body is too large' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Malformed JSON body' });
  }

  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    message: status >= 500 ? 'Something went wrong on the server' : err.message,
    ...(err.errors ? { errors: err.errors } : {}),
  });
}

module.exports = { HttpError, asyncHandler, notFound, errorHandler };
