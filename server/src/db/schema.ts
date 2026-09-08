/**
 * Database schema, inlined as a string so deployments never have to ship or
 * locate a .sql file next to the compiled output.
 *
 * Everything here is idempotent (IF NOT EXISTS), so it doubles as the migration
 * step: it runs on every boot.
 */

export const SCHEMA = `PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT NOT NULL,
  email         TEXT UNIQUE COLLATE NOCASE,
  password_hash TEXT,
  avatar        TEXT,
  title         TEXT,
  rating        INTEGER NOT NULL DEFAULT 1000,
  guest         INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  last_seen     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_rating ON users(rating DESC);

CREATE TABLE IF NOT EXISTS discord_accounts (
  discord_id    TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username      TEXT,
  global_name   TEXT,
  avatar        TEXT,
  access_token  TEXT,
  refresh_token TEXT,
  expires_at    INTEGER,
  linked_at     INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_discord_user ON discord_accounts(user_id);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  agent      TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS stats (
  user_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  games_played     INTEGER NOT NULL DEFAULT 0,
  rounds_won       INTEGER NOT NULL DEFAULT 0,
  matches_won      INTEGER NOT NULL DEFAULT 0,
  best_rank        INTEGER,
  total_guesses    INTEGER NOT NULL DEFAULT 0,
  scored_rounds    INTEGER NOT NULL DEFAULT 0,
  fastest_win_ms   INTEGER,
  drifts_survived  INTEGER NOT NULL DEFAULT 0,
  current_streak   INTEGER NOT NULL DEFAULT 0,
  best_streak      INTEGER NOT NULL DEFAULT 0,
  daily_played     INTEGER NOT NULL DEFAULT 0,
  daily_solved     INTEGER NOT NULL DEFAULT 0,
  echoes_spent     INTEGER NOT NULL DEFAULT 0,
  last_daily       TEXT
);

CREATE TABLE IF NOT EXISTS matches (
  id         TEXT PRIMARY KEY,
  code       TEXT,
  mode       TEXT NOT NULL,
  rounds     INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  ended_at   INTEGER,
  discord_instance TEXT
);

CREATE TABLE IF NOT EXISTS match_players (
  match_id      TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score         INTEGER NOT NULL DEFAULT 0,
  rounds_won    INTEGER NOT NULL DEFAULT 0,
  place         INTEGER,
  rating_before INTEGER,
  rating_after  INTEGER,
  PRIMARY KEY (match_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_match_players_user ON match_players(user_id);

CREATE TABLE IF NOT EXISTS round_log (
  id           TEXT PRIMARY KEY,
  match_id     TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  idx          INTEGER NOT NULL,
  target       TEXT NOT NULL,
  chain        TEXT NOT NULL,
  winner_id    TEXT,
  drifts       INTEGER NOT NULL DEFAULT 0,
  duration_ms  INTEGER NOT NULL DEFAULT 0,
  guess_count  INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_runs (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  number      INTEGER NOT NULL,
  state       TEXT NOT NULL,
  solved      INTEGER NOT NULL DEFAULT 0,
  guess_count INTEGER NOT NULL DEFAULT 0,
  drifts      INTEGER NOT NULL DEFAULT 0,
  started_at  INTEGER NOT NULL,
  solved_at   INTEGER,
  PRIMARY KEY (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_leaderboard
  ON daily_runs(date, solved DESC, guess_count ASC, solved_at ASC);
`;
