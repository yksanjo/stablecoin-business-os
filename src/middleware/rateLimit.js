// Rate limiting. Three tiers:
//   - signup:    tighter, to prevent automated business creation
//   - public:    moderate, for the unauthenticated Solana utility routes
//   - authed:    looser, for routes behind an API key
//
// Limits scale by trust: if you have an API key, the key is the
// identifier; otherwise we fall back to IP.

import rateLimit from 'express-rate-limit';

const oneMinute = 60 * 1000;

export const signupLimiter = rateLimit({
  windowMs: 15 * oneMinute,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many signup attempts, try again in 15 minutes' },
});

export const publicLimiter = rateLimit({
  windowMs: oneMinute,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down' },
});

export const authedLimiter = rateLimit({
  windowMs: oneMinute,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    req.header('X-API-Key') || req.ip,
  message: { error: 'Rate limit exceeded for this API key' },
});
