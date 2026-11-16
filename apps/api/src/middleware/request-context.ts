import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

export const requestContext: RequestHandler = (_req, res, next) => {
  // Always generate locally: never trust arbitrary caller IDs or log sensitive URLs/bodies.
  res.locals.requestId = randomUUID();
  res.setHeader('X-Request-ID', res.locals.requestId);
  res.setHeader('Cache-Control', 'no-store');
  next();
};
