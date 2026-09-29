import { ApiError } from '../utils/ApiError.js';
import { isProd } from '../config/env.js';
import { logger } from '../config/logger.js';

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  let status = err.statusCode ?? 500;
  let code = err.code ?? 'INTERNAL';
  let message = err.message ?? 'Internal server error';
  let details = err.details;

  if (err?.name === 'ZodError') {
    status = 400;
    code = 'VALIDATION';
    message = 'Validation failed';
    details = err.issues?.map((i) => ({ path: i.path.join('.'), message: i.message }));
  } else if (err?.name === 'ValidationError') {
    status = 400;
    code = 'VALIDATION';
  } else if (err?.code === 11000) {
    status = 409;
    code = 'DUPLICATE';
    message = 'Duplicate key';
    details = err.keyValue;
  }

  if (status >= 500) logger.error({ err }, 'Unhandled error');

  const body = { success: false, error: { code, message } };
  if (details) body.error.details = details;
  if (!isProd && status >= 500) body.error.stack = err.stack;
  res.status(status).json(body);
}

export { ApiError };
