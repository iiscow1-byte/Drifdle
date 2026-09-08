import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// ~100ms on a modern CPU. Stored in the hash string so params can move later.
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEYLEN, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join(
    '$',
  );
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scryptAsync(password, salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: PARAMS.maxmem,
  });
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export interface PasswordProblem {
  field: 'password' | 'username' | 'email';
  message: string;
}

export function validatePassword(password: string): PasswordProblem | null {
  if (typeof password !== 'string' || password.length < 8) {
    return { field: 'password', message: 'Password must be at least 8 characters.' };
  }
  if (password.length > 200) {
    return { field: 'password', message: 'Password is too long.' };
  }
  return null;
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const RESERVED = new Set(['admin', 'system', 'driftle', 'moderator', 'null', 'undefined', 'guest']);

export function validateUsername(username: string): PasswordProblem | null {
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    return {
      field: 'username',
      message: 'Usernames are 3-20 characters: letters, numbers and underscores.',
    };
  }
  if (RESERVED.has(username.toLowerCase())) {
    return { field: 'username', message: 'That username is reserved.' };
  }
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(email: string): PasswordProblem | null {
  if (typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 254) {
    return { field: 'email', message: 'Enter a valid email address.' };
  }
  return null;
}
