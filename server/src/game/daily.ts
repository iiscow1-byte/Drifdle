import type { DailyState, LeaderboardRow, PrivateGuess } from '../../../shared/protocol.ts';
import { many, one, run, type DailyRunRow } from '../db/index.ts';
import { getStatsRow } from '../auth/users.ts';
import { Round } from './engine.ts';
import { uuid } from '../util/ids.ts';

/** Puzzle #1 is the day Driftle opened. */
const EPOCH_DAY = Date.UTC(2026, 0, 1);
const DAY_MS = 86_400_000;

export function todayKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function puzzleNumber(date: string): number {
  const t = Date.parse(`${date}T00:00:00Z`);
  return Math.floor((t - EPOCH_DAY) / DAY_MS) + 1;
}

function yesterdayKey(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
}

/** Practice runs reuse the daily machinery under a namespaced key. */
export function practiceKey(): string {
  return `practice:${uuid().slice(0, 8)}`;
}

function isPractice(key: string): boolean {
  return key.startsWith('practice:');
}

function seedFor(key: string): string {
  return isPractice(key) ? key : `driftle-daily:${key}`;
}

interface StoredState {
  words: { w: string; at: number }[];
  /** Set when the player asked to see the answer. The run is then closed. */
  gaveUp?: boolean;
}

function newRound(key: string, difficulty: 1 | 2 | 3 = 2): Round {
  return new Round({
    seed: seedFor(key),
    difficulty,
    maxDrifts: 3,
    playerCount: 1,
  });
}

/**
 * Rebuild a run from the ordered list of guesses.
 *
 * Replaying is the whole trick here: drift depends on a seeded RNG and on which
 * words are already on the board, so re-running the same guesses through a
 * fresh Round reproduces the exact same puzzle - including every drift - with
 * no need to serialise engine internals.
 */
function replay(key: string, stored: StoredState, playerId: string, name: string): Round {
  const round = newRound(key);
  for (const g of stored.words) {
    round.submit(playerId, name, g.w, g.at);
  }
  return round;
}

export interface RunHandle {
  key: string;
  number: number;
  round: Round;
  row: DailyRunRow;
}

/** True once the player has asked to see the answer. */
export function hasGivenUp(handle: RunHandle): boolean {
  return (JSON.parse(handle.row.state) as { gaveUp?: boolean }).gaveUp === true;
}

export function loadRun(
  userId: string,
  name: string,
  key: string,
  createIfMissing = true,
): RunHandle | null {
  let row = one<DailyRunRow>('SELECT * FROM daily_runs WHERE user_id = ? AND date = ?', userId, key);

  if (!row) {
    if (!createIfMissing) return null;
    const now = Date.now();
    const number = isPractice(key) ? 0 : puzzleNumber(key);
    run(
      `INSERT INTO daily_runs (user_id, date, number, state, solved, guess_count, drifts, started_at)
       VALUES (?, ?, ?, ?, 0, 0, 0, ?)`,
      userId,
      key,
      number,
      JSON.stringify({ words: [] } satisfies StoredState),
      now,
    );
    if (!isPractice(key)) {
      run('UPDATE stats SET daily_played = daily_played + 1 WHERE user_id = ?', userId);
    }
    row = one<DailyRunRow>('SELECT * FROM daily_runs WHERE user_id = ? AND date = ?', userId, key)!;
  }

  const stored = JSON.parse(row.state) as StoredState;
  const round = replay(key, stored, userId, name);
  return { key, number: row.number, round, row };
}

function persist(userId: string, key: string, round: Round, stored: StoredState) {
  run(
    `UPDATE daily_runs
        SET state = ?, solved = ?, guess_count = ?, drifts = ?, solved_at = ?
      WHERE user_id = ? AND date = ?`,
    JSON.stringify(stored),
    round.winnerId ? 1 : 0,
    stored.words.length,
    round.drifts.length,
    round.winnerId ? (round.endedAt ?? Date.now()) : null,
    userId,
    key,
  );
}

export type DailyGuessResult =
  | { ok: false; reason: 'unknown_word' | 'duplicate' | 'too_short' | 'already_solved' }
  | { ok: true; guess: PrivateGuess; solved: boolean; state: DailyState };

export function submitDailyGuess(
  userId: string,
  name: string,
  key: string,
  word: string,
): DailyGuessResult {
  const handle = loadRun(userId, name, key);
  if (!handle) return { ok: false, reason: 'unknown_word' };
  const existing = JSON.parse(handle.row.state) as StoredState;
  if (handle.round.solved || existing.gaveUp) return { ok: false, reason: 'already_solved' };

  const now = Date.now();
  const outcome = handle.round.submit(userId, name, word, now);
  if (!outcome.ok) return { ok: false, reason: outcome.reason };

  const stored = existing;
  stored.words.push({ w: outcome.guess.word, at: now });
  persist(userId, key, handle.round, stored);

  if (outcome.solved && !isPractice(key)) {
    recordDailySolve(userId, key, handle.round);
  }

  return {
    ok: true,
    guess: outcome.private,
    solved: outcome.solved,
    state: projectState(userId, name, handle, outcome.solved),
  };
}

function recordDailySolve(userId: string, key: string, round: Round) {
  const stats = getStatsRow(userId);
  const streak = stats.last_daily === yesterdayKey(key) ? stats.current_streak + 1 : 1;
  run(
    `UPDATE stats SET
        daily_solved = daily_solved + 1,
        current_streak = ?,
        best_streak = MAX(best_streak, ?),
        last_daily = ?,
        rounds_won = rounds_won + 1,
        total_guesses = total_guesses + ?,
        scored_rounds = scored_rounds + 1,
        best_rank = 1,
        drifts_survived = drifts_survived + ?
      WHERE user_id = ?`,
    streak,
    streak,
    key,
    round.guesses.length,
    round.drifts.length,
    userId,
  );
}

export function projectState(
  userId: string,
  name: string,
  handle: RunHandle,
  revealAnswer = false,
): DailyState {
  const { round } = handle;
  const solved = round.winnerId !== null;
  const reveal = revealAnswer || hasGivenUp(handle);
  return {
    date: handle.key,
    number: handle.number,
    solved,
    guesses: round.privateBoardFor(userId),
    epoch: round.epoch,
    driftCharge: round.charge,
    driftCap: round.cap,
    anchored: round.anchored,
    drifts: round.drifts,
    chain: solved || reveal ? round.chainWords() : undefined,
    target: solved || reveal ? round.target : undefined,
    definition: solved || reveal ? round.definition() : undefined,
    chainDetail: solved || reveal ? round.chainDetail() : undefined,
    neighbourhood: solved || reveal ? round.neighbourhood(8) : undefined,
    startedAt: handle.row.started_at,
    solvedAt: round.winnerId ? (round.endedAt ?? null) : null,
    targetLengthKnown: round.knownTargetLength(userId),
  };
}

export function getDailyState(userId: string, name: string, key = todayKey()): DailyState {
  const handle = loadRun(userId, name, key)!;
  return projectState(userId, name, handle);
}

/** Reveal the answer without crediting a solve. */
export function giveUp(userId: string, name: string, key: string): DailyState | null {
  const handle = loadRun(userId, name, key, false);
  if (!handle) return null;

  // Close the run so the revealed answer cannot be played back as a solve.
  const stored = JSON.parse(handle.row.state) as StoredState;
  stored.gaveUp = true;
  persist(userId, key, handle.round, stored);
  handle.row = { ...handle.row, state: JSON.stringify(stored) };

  if (!isPractice(key)) {
    run('UPDATE stats SET current_streak = 0 WHERE user_id = ?', userId);
  }
  return projectState(userId, name, handle, true);
}

export function dailyLeaderboard(date = todayKey(), limit = 25): LeaderboardRow[] {
  const rows = many<{
    user_id: string;
    username: string;
    display_name: string;
    avatar: string | null;
    guess_count: number;
    drifts: number;
    solved_at: number | null;
    started_at: number;
  }>(
    `SELECT d.user_id, u.username, u.display_name, u.avatar, d.guess_count, d.drifts, d.solved_at, d.started_at
       FROM daily_runs d
       JOIN users u ON u.id = d.user_id
      WHERE d.date = ? AND d.solved = 1
      ORDER BY d.guess_count ASC, (d.solved_at - d.started_at) ASC
      LIMIT ?`,
    date,
    limit,
  );

  return rows.map((r, i) => ({
    place: i + 1,
    userId: r.user_id,
    username: r.username,
    displayName: r.display_name,
    avatar: r.avatar,
    value: r.guess_count,
    detail: `${r.drifts} drift${r.drifts === 1 ? '' : 's'} survived`,
  }));
}

/** A spoiler-free share card, in the spirit of the genre. */
export function shareText(state: DailyState): string {
  const head = `Driftle #${state.number}`;
  const bands = state.guesses.map((g) => bandGlyph(g.rank)).join('');
  const drifts = state.drifts.filter((d) => !d.headline.startsWith('ANCHORED')).length;
  const lines = [
    `${head} — ${state.solved ? `${state.guesses.length} guesses` : 'unsolved'}`,
    bands.replace(/(.{10})/g, '$1\n').trim(),
    `${'~'.repeat(Math.max(1, drifts))} ${drifts} drift${drifts === 1 ? '' : 's'}`,
  ];
  return lines.join('\n');
}

function bandGlyph(rank: number): string {
  if (rank === 1) return '🎯';
  if (rank <= 8) return '🟥';
  if (rank <= 40) return '🟧';
  if (rank <= 120) return '🟨';
  if (rank <= 280) return '🟩';
  if (rank <= 520) return '🟦';
  return '⬜';
}
