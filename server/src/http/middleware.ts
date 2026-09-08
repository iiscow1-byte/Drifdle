import type { NextFunction, Request, Response } from 'express';
import { parse as parseCookie } from 'cookie';
import { config } from '../config.ts';
import { readToken, userForToken } from '../auth/sessions.ts';
import type { UserRow } from '../db/index.ts';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserRow;
      cookies?: Record<string, string>;
    }
  }
}

export function cookies(req: Request, _res: Response, next: NextFunction) {
  req.cookies = parseCookie(req.headers.cookie ?? '') as Record<string, string>;
  next();
}

export function attachUser(req: Request, _res: Response, next: NextFunction) {
  req.user = userForToken(readToken(req));
  next();
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'unauthorized', message: 'Sign in to continue.' });
    return;
  }
  next();
}

export function cors(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (origin) {
    const allowed =
      config.allowedOrigins.includes(origin) ||
      // Activities are served from a Discord-owned proxy origin.
      /^https:\/\/[a-z0-9-]+\.discordsays\.com$/.test(origin) ||
      /^https:\/\/discord\.com$/.test(origin);
    if (allowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
}

/** Discord embeds the client in an iframe, so framing has to be permitted. */
export function frameHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors 'self' https://discord.com https://*.discord.com https://*.discordsays.com",
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
}

/** Small in-memory limiter for the unauthenticated endpoints. */
export function rateLimit(opts: { windowMs: number; max: number; key?: (req: Request) => string }) {
  const hits = new Map<string, { n: number; resetAt: number }>();

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
  }, 60_000);
  sweep.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = opts.key?.(req) ?? (req.ip ?? 'unknown');
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt < now) {
      hits.set(key, { n: 1, resetAt: now + opts.windowMs });
      next();
      return;
    }
    entry.n += 1;
    if (entry.n > opts.max) {
      res.status(429).json({ error: 'rate_limited', message: 'Too many requests, slow down.' });
      return;
    }
    next();
  };
}

export type AsyncHandler = (req: Request, res: Response) => Promise<unknown> | unknown;

/** Express 4 does not catch rejected promises, so every async route uses this. */
export function route(handler: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}
