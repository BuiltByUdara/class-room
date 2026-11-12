import type { RequestHandler } from 'express';
import { HttpError } from '../lib/errors.js';

// One configured frontend origin; never reflect arbitrary origins with credentials.
export const frontendCors = (allowedOrigin: string): RequestHandler => (req, res, next) => {
  res.vary('Origin');
  const origin = req.get('origin');
  if (origin && origin !== allowedOrigin) throw new HttpError(403, 'INVALID_ORIGIN', 'Request origin could not be verified');
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  if (req.method === 'OPTIONS') {
    const method = req.get('access-control-request-method');
    const headers = (req.get('access-control-request-headers') || '').toLowerCase().split(',').map(v => v.trim()).filter(Boolean);
    if (!origin || !method || !['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(method) || headers.some(v => !['content-type', 'x-requested-with'].includes(v))) {
      throw new HttpError(403, 'INVALID_PREFLIGHT', 'Preflight request is not permitted');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
    res.setHeader('Access-Control-Max-Age', '600');
    res.status(204).end();
    return;
  }
  next();
};
