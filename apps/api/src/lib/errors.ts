import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
export class HttpError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Please check your input', details: error.flatten() } }); return; }
  if (error?.code === 11000) { res.status(409).json({ error: { code: 'CONFLICT', message: 'A record already exists' } }); return; }
  const status = error instanceof HttpError ? error.status : error?.type === 'entity.parse.failed' ? 400 : error?.type === 'entity.too.large' ? 413 : 500;
  if (status === 500) console.error('Request failed:', error instanceof Error ? error.name : 'Unknown error');
  res.status(status).json({ error: { code: error instanceof HttpError ? error.code : 'REQUEST_FAILED', message: error instanceof HttpError ? error.message : status === 500 ? 'An unexpected error occurred' : 'Invalid request body' } });
};
