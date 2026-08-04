import crypto from 'node:crypto';
import pino from 'pino';
import pinoHttp from 'pino-http';

// Base logger for startup/background messages (outside any HTTP request).
export const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// Per-request logger middleware — generates/propagates an x-request-id,
// attaches a child logger to req.log, and logs one structured summary line
// per request/response. Route handlers use req.log instead of console.*.
export const requestLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const existing = req.headers['x-request-id'];
    const id = typeof existing === 'string' && existing ? existing : crypto.randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },
});
