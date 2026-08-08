// Replays the cached response for a repeated Idempotency-Key instead of
// re-running the handler — protects against double-payment/double-credit
// from a client retry after a dropped response. In-memory, so it only holds
// across a single server process; that's the right tradeoff for a
// single-instance deployment and avoids requiring a Redis dependency the
// team hasn't provisioned yet.
const cache = new Map();
const TTL_MS = 10 * 60 * 1000;

function purgeExpired() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}

export function idempotent(req, res, next) {
  const key = req.headers['idempotency-key'];
  if (!key || typeof key !== 'string') return next();

  purgeExpired();

  const cached = cache.get(key);
  if (cached) {
    return res.status(cached.status).json(cached.body);
  }

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    // Only cache success: a failed attempt (insufficient stock, a validation
    // error, etc.) made no side effect worth protecting against duplication,
    // and caching it would just block a legitimate retry after the underlying
    // problem is fixed until the TTL expires.
    if (res.statusCode >= 200 && res.statusCode < 300) {
      cache.set(key, { status: res.statusCode, body, expiresAt: Date.now() + TTL_MS });
    }
    return originalJson(body);
  };

  next();
}
