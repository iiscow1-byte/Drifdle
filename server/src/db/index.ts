import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../config.ts';
import { SCHEMA } from './schema.ts';

mkdirSync(dirname(config.databasePath), { recursive: true });

export const db = new DatabaseSync(config.databasePath);

// Idempotent, so this is both the initial create and the per-boot migration.
db.exec(SCHEMA);

/* ------------------------------------------------------------------ */
/* Thin typed helpers                                                  */
/* ------------------------------------------------------------------ */

export function one<T>(sql: string, ...params: unknown[]): T | undefined {
  const row = db.prepare(sql).get(...(params as never[]));
  return row === undefined ? undefined : ({ ...(row as object) } as T);
}

export function many<T>(sql: string, ...params: unknown[]): T[] {
  return db
    .prepare(sql)
    .all(...(params as never[]))
    .map((r) => ({ ...(r as object) }) as T);
}

export function run(sql: string, ...params: unknown[]) {
  return db.prepare(sql).run(...(params as never[]));
}

/** node:sqlite has no transaction helper, so here is a small one. */
export function transaction<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* the outer error is the interesting one */
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Row shapes                                                          */
/* ------------------------------------------------------------------ */

export interface UserRow {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  password_hash: string | null;
  avatar: string | null;
  title: string | null;
  rating: number;
  guest: number;
  created_at: number;
  last_seen: number;
}

export interface StatsRow {
  user_id: string;
  games_played: number;
  rounds_won: number;
  matches_won: number;
  best_rank: number | null;
  total_guesses: number;
  scored_rounds: number;
  fastest_win_ms: number | null;
  drifts_survived: number;
  current_streak: number;
  best_streak: number;
  daily_played: number;
  daily_solved: number;
  echoes_spent: number;
  last_daily: string | null;
}

export interface DiscordRow {
  discord_id: string;
  user_id: string;
  username: string | null;
  global_name: string | null;
  avatar: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
  linked_at: number;
}

export interface DailyRunRow {
  user_id: string;
  date: string;
  number: number;
  state: string;
  solved: number;
  guess_count: number;
  drifts: number;
  started_at: number;
  solved_at: number | null;
}

/** Prune expired sessions on boot and hourly thereafter. */
export function startHousekeeping() {
  const sweep = () => {
    run('DELETE FROM sessions WHERE expires_at < ?', Date.now());
    // Guests who never came back and left nothing behind.
    run(
      `DELETE FROM users
        WHERE guest = 1
          AND last_seen < ?
          AND id NOT IN (SELECT user_id FROM match_players)
          AND id NOT IN (SELECT user_id FROM daily_runs)`,
      Date.now() - 1000 * 60 * 60 * 24 * 14,
    );
  };
  sweep();
  const timer = setInterval(sweep, 1000 * 60 * 60);
  timer.unref();
}
