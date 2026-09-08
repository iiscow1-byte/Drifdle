import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { config } from '../config.ts';
import { one, run, type UserRow } from '../db/index.ts';
import { findUserById, touchUser } from './users.ts';
import { token as randomToken } from '../util/ids.ts';

/**
 * Sessions are opaque random tokens. Only their SHA-256 is stored, so a leaked
 * database does not hand out live sessions.
 */

function fingerprint(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function createSession(userId: string, agent?: string): string {
  const raw = randomToken(32);
  const now = Date.now();
  run(
    'INSERT INTO sessions (id, user_id, created_at, expires_at, agent) VALUES (?, ?, ?, ?, ?)',
    fingerprint(raw),
    userId,
    now,
    now + config.session.ttlMs,
    agent?.slice(0, 200) ?? null,
  );
  return raw;
}

export function userForToken(raw: string | undefined | null): UserRow | undefined {
  if (!raw) return undefined;
  const row = one<{ user_id: string; expires_at: number }>(
    'SELECT user_id, expires_at FROM sessions WHERE id = ?',
    fingerprint(raw),
  );
  if (!row) return undefined;
  if (row.expires_at < Date.now()) {
    run('DELETE FROM sessions WHERE id = ?', fingerprint(raw));
    return undefined;
  }
  const user = findUserById(row.user_id);
  if (user) touchUser(user.id);
  return user;
}

export function destroySession(raw: string | undefined | null) {
  if (!raw) return;
  run('DELETE FROM sessions WHERE id = ?', fingerprint(raw));
}

export function destroyAllSessions(userId: string) {
  run('DELETE FROM sessions WHERE user_id = ?', userId);
}

/* ------------------------------------------------------------------ */
/* Express glue                                                        */
/* ------------------------------------------------------------------ */

export function setSessionCookie(res: Response, raw: string) {
  res.cookie(config.session.cookieName, raw, {
    httpOnly: true,
    // Discord Activities run the client inside a cross-origin iframe, so the
    // cookie has to be SameSite=None; that in turn requires Secure.
    sameSite: config.isProd ? 'none' : 'lax',
    secure: config.isProd,
    maxAge: config.session.ttlMs,
    path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(config.session.cookieName, { path: '/' });
}

export function readToken(req: Request): string | undefined {
  const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[
    config.session.cookieName
  ];
  if (cookie) return cookie;
  // Activities and the websocket handshake use a bearer token instead, because
  // third-party cookies are unreliable inside the Discord iframe.
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return undefined;
}
