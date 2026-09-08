import type { PublicUser, UserStats } from '../../../shared/protocol.ts';
import { many, one, run, type StatsRow, type UserRow } from '../db/index.ts';
import { uuid } from '../util/ids.ts';

const ADJECTIVES = [
  'Drifting', 'Amber', 'Quiet', 'Restless', 'Distant', 'Copper', 'Hollow', 'Bright',
  'Vagrant', 'Tidal', 'Ember', 'Nimble', 'Solemn', 'Feral', 'Lucid', 'Wayward',
];
const NOUNS = [
  'Fox', 'Comet', 'Harbour', 'Lantern', 'Cipher', 'Moth', 'Compass', 'Thistle',
  'Wolf', 'Beacon', 'Marsh', 'Quartz', 'Falcon', 'Orbit', 'Reed', 'Anchor',
];

export function suggestGuestName(): string {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${a}${n}${Math.floor(Math.random() * 90 + 10)}`;
}

export function findUserById(id: string): UserRow | undefined {
  return one<UserRow>('SELECT * FROM users WHERE id = ?', id);
}

export function findUserByUsername(username: string): UserRow | undefined {
  return one<UserRow>('SELECT * FROM users WHERE username = ? COLLATE NOCASE', username);
}

export function findUserByEmail(email: string): UserRow | undefined {
  return one<UserRow>('SELECT * FROM users WHERE email = ? COLLATE NOCASE', email);
}

export function findUserByLogin(login: string): UserRow | undefined {
  return login.includes('@') ? findUserByEmail(login) : findUserByUsername(login);
}

export interface CreateUserInput {
  username: string;
  displayName?: string;
  email?: string | null;
  passwordHash?: string | null;
  avatar?: string | null;
  guest?: boolean;
}

export function createUser(input: CreateUserInput): UserRow {
  const now = Date.now();
  const id = uuid();
  run(
    `INSERT INTO users (id, username, display_name, email, password_hash, avatar, rating, guest, created_at, last_seen)
     VALUES (?, ?, ?, ?, ?, ?, 1000, ?, ?, ?)`,
    id,
    input.username,
    input.displayName ?? input.username,
    input.email ?? null,
    input.passwordHash ?? null,
    input.avatar ?? null,
    input.guest ? 1 : 0,
    now,
    now,
  );
  run('INSERT OR IGNORE INTO stats (user_id) VALUES (?)', id);
  return findUserById(id)!;
}

/** Guests can play immediately and claim their account later. */
export function createGuest(name?: string): UserRow {
  let username = name?.trim() || suggestGuestName();
  let attempt = 0;
  while (findUserByUsername(username)) {
    attempt++;
    username = `${suggestGuestName()}${attempt}`;
    if (attempt > 10) username = `guest_${uuid().slice(0, 8)}`;
  }
  return createUser({ username, guest: true });
}

export function touchUser(id: string) {
  run('UPDATE users SET last_seen = ? WHERE id = ?', Date.now(), id);
}

export function updateProfile(
  id: string,
  patch: { displayName?: string; avatar?: string | null; title?: string | null },
) {
  const sets: string[] = [];
  const args: unknown[] = [];
  if (patch.displayName !== undefined) {
    sets.push('display_name = ?');
    args.push(patch.displayName);
  }
  if (patch.avatar !== undefined) {
    sets.push('avatar = ?');
    args.push(patch.avatar);
  }
  if (patch.title !== undefined) {
    sets.push('title = ?');
    args.push(patch.title);
  }
  if (!sets.length) return;
  args.push(id);
  run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, ...args);
}

/**
 * Turn a guest row into a real account in place, so everything they have
 * already played stays attached to them.
 */
export function claimGuest(
  id: string,
  input: { username: string; email: string; passwordHash: string },
) {
  run(
    `UPDATE users
        SET username = ?, display_name = ?, email = ?, password_hash = ?, guest = 0
      WHERE id = ? AND guest = 1`,
    input.username,
    input.username,
    input.email,
    input.passwordHash,
    id,
  );
  return findUserById(id);
}

export function isDiscordLinked(userId: string): boolean {
  return !!one('SELECT 1 AS x FROM discord_accounts WHERE user_id = ?', userId);
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatar: row.avatar,
    rating: row.rating,
    guest: row.guest === 1,
    discordLinked: isDiscordLinked(row.id),
    createdAt: row.created_at,
    title: row.title,
  };
}

/* ------------------------------------------------------------------ */
/* Stats                                                               */
/* ------------------------------------------------------------------ */

export function getStatsRow(userId: string): StatsRow {
  run('INSERT OR IGNORE INTO stats (user_id) VALUES (?)', userId);
  return one<StatsRow>('SELECT * FROM stats WHERE user_id = ?', userId)!;
}

export function toUserStats(row: StatsRow): UserStats {
  return {
    gamesPlayed: row.games_played,
    roundsWon: row.rounds_won,
    matchesWon: row.matches_won,
    bestRank: row.best_rank,
    averageGuesses: row.scored_rounds > 0 ? row.total_guesses / row.scored_rounds : null,
    fastestWinMs: row.fastest_win_ms,
    driftsSurvived: row.drifts_survived,
    currentStreak: row.current_streak,
    bestStreak: row.best_streak,
    dailyPlayed: row.daily_played,
    dailySolved: row.daily_solved,
    echoesSpent: row.echoes_spent,
  };
}

export interface RoundStatDelta {
  won: boolean;
  guesses: number;
  bestRank: number | null;
  drifts: number;
  winMs?: number | null;
  echoesSpent?: number;
}

export function recordRound(userId: string, d: RoundStatDelta) {
  const s = getStatsRow(userId);
  const bestRank =
    d.bestRank === null ? s.best_rank : s.best_rank === null ? d.bestRank : Math.min(s.best_rank, d.bestRank);
  const fastest =
    d.won && d.winMs != null
      ? s.fastest_win_ms === null
        ? d.winMs
        : Math.min(s.fastest_win_ms, d.winMs)
      : s.fastest_win_ms;

  run(
    `UPDATE stats SET
        rounds_won = rounds_won + ?,
        total_guesses = total_guesses + ?,
        scored_rounds = scored_rounds + 1,
        best_rank = ?,
        fastest_win_ms = ?,
        drifts_survived = drifts_survived + ?,
        echoes_spent = echoes_spent + ?
      WHERE user_id = ?`,
    d.won ? 1 : 0,
    d.guesses,
    bestRank,
    fastest,
    d.drifts,
    d.echoesSpent ?? 0,
    userId,
  );
}

export function recordMatch(userId: string, won: boolean) {
  run(
    `UPDATE stats SET games_played = games_played + 1, matches_won = matches_won + ?
      WHERE user_id = ?`,
    won ? 1 : 0,
    userId,
  );
}

export function setRating(userId: string, rating: number) {
  run('UPDATE users SET rating = ? WHERE id = ?', Math.round(rating), userId);
}

export interface LeaderRow {
  id: string;
  username: string;
  display_name: string;
  avatar: string | null;
  value: number;
  detail?: string;
}

export function topByRating(limit = 25): LeaderRow[] {
  return many<LeaderRow>(
    `SELECT u.id, u.username, u.display_name, u.avatar, u.rating AS value
       FROM users u
      WHERE u.guest = 0
      ORDER BY u.rating DESC, u.created_at ASC
      LIMIT ?`,
    limit,
  );
}

export function topByStreak(limit = 25): LeaderRow[] {
  return many<LeaderRow>(
    `SELECT u.id, u.username, u.display_name, u.avatar, s.best_streak AS value
       FROM stats s JOIN users u ON u.id = s.user_id
      WHERE s.best_streak > 0 AND u.guest = 0
      ORDER BY s.best_streak DESC
      LIMIT ?`,
    limit,
  );
}
