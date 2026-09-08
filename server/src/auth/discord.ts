import { config } from '../config.ts';
import { one, run, type DiscordRow, type UserRow } from '../db/index.ts';
import { createUser, findUserById, updateProfile } from './users.ts';

const API = 'https://discord.com/api/v10';

export interface DiscordTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
  avatar: string | null;
  email?: string | null;
}

export const DISCORD_SCOPES = ['identify', 'guilds.members.read'];

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.discord.clientId,
    redirect_uri: `${config.publicUrl}${config.discord.redirectPath}`,
    response_type: 'code',
    scope: DISCORD_SCOPES.join(' '),
    state,
    prompt: 'consent',
  });
  return `https://discord.com/oauth2/authorize?${params}`;
}

/**
 * `redirectUri` is required for the browser OAuth flow and must be omitted for
 * the Activity flow, where Discord itself brokered the authorization.
 */
export async function exchangeCode(code: string, redirectUri?: string): Promise<DiscordTokens> {
  const body = new URLSearchParams({
    client_id: config.discord.clientId,
    client_secret: config.discord.clientSecret,
    grant_type: 'authorization_code',
    code,
  });
  if (redirectUri) body.set('redirect_uri', redirectUri);

  const res = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`discord token exchange failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as DiscordTokens;
}

export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const res = await fetch(`${API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`discord /users/@me failed (${res.status})`);
  return (await res.json()) as DiscordUser;
}

export function avatarUrl(u: DiscordUser): string | null {
  if (!u.avatar) return null;
  const ext = u.avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${ext}?size=128`;
}

function uniqueUsername(base: string): string {
  const cleaned = base.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 18) || 'drifter';
  let candidate = cleaned;
  let n = 0;
  while (one('SELECT 1 AS x FROM users WHERE username = ? COLLATE NOCASE', candidate)) {
    n += 1;
    candidate = `${cleaned.slice(0, 15)}${n}`;
  }
  return candidate;
}

export interface LinkResult {
  user: UserRow;
  created: boolean;
}

/**
 * Resolve a Discord identity to a Driftle account.
 *
 * If `attachTo` is supplied (someone signed in linking their account, or a
 * guest arriving through an Activity), the Discord identity is attached to that
 * account rather than creating a second one.
 */
export function linkDiscordAccount(
  du: DiscordUser,
  tokens: DiscordTokens | null,
  attachTo?: string,
): LinkResult {
  const existing = one<DiscordRow>('SELECT * FROM discord_accounts WHERE discord_id = ?', du.id);
  const displayName = du.global_name || du.username;
  const avatar = avatarUrl(du);
  const now = Date.now();

  let user: UserRow;
  let created = false;

  if (existing) {
    user = findUserById(existing.user_id)!;
  } else if (attachTo) {
    const target = findUserById(attachTo);
    if (!target) throw new Error('cannot attach discord account to a missing user');
    user = target;
    // A guest who signs in through Discord becomes a real account.
    if (user.guest === 1) {
      run(
        'UPDATE users SET guest = 0, username = ?, display_name = ? WHERE id = ?',
        uniqueUsername(du.username),
        displayName,
        user.id,
      );
      user = findUserById(user.id)!;
      created = true;
    }
  } else {
    user = createUser({
      username: uniqueUsername(du.username),
      displayName,
      avatar,
      guest: false,
    });
    created = true;
  }

  run(
    `INSERT INTO discord_accounts
       (discord_id, user_id, username, global_name, avatar, access_token, refresh_token, expires_at, linked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(discord_id) DO UPDATE SET
       user_id = excluded.user_id,
       username = excluded.username,
       global_name = excluded.global_name,
       avatar = excluded.avatar,
       access_token = excluded.access_token,
       refresh_token = excluded.refresh_token,
       expires_at = excluded.expires_at`,
    du.id,
    user.id,
    du.username,
    du.global_name ?? null,
    du.avatar,
    tokens?.access_token ?? null,
    tokens?.refresh_token ?? null,
    tokens ? now + tokens.expires_in * 1000 : null,
    now,
  );

  // Keep the avatar fresh, but never stomp a display name the player chose.
  if (avatar && avatar !== user.avatar) updateProfile(user.id, { avatar });

  return { user: findUserById(user.id)!, created };
}

export function discordIdFor(userId: string): string | null {
  const row = one<{ discord_id: string }>(
    'SELECT discord_id FROM discord_accounts WHERE user_id = ?',
    userId,
  );
  return row?.discord_id ?? null;
}

export function unlinkDiscord(userId: string) {
  run('DELETE FROM discord_accounts WHERE user_id = ?', userId);
}
