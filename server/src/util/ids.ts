import { randomBytes, randomUUID } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1

export function uuid(): string {
  return randomUUID();
}

export function shortId(len = 12): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Human-typable room code. */
export function roomCode(): string {
  return shortId(4);
}

export function token(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
