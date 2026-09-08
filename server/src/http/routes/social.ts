import { Router } from 'express';
import type { LeaderboardRow } from '../../../../shared/protocol.ts';
import { many, one } from '../../db/index.ts';
import {
  findUserByUsername,
  getStatsRow,
  toPublicUser,
  toUserStats,
  topByRating,
  topByStreak,
  type LeaderRow,
} from '../../auth/users.ts';
import { dailyLeaderboard, todayKey } from '../../game/daily.ts';
import { route } from '../middleware.ts';

export const socialRouter = Router();

function toRows(rows: LeaderRow[]): LeaderboardRow[] {
  return rows.map((r, i) => ({
    place: i + 1,
    userId: r.id,
    username: r.username,
    displayName: r.display_name,
    avatar: r.avatar,
    value: r.value,
    detail: r.detail,
  }));
}

socialRouter.get(
  '/leaderboard',
  route((req, res) => {
    const board = String(req.query.board ?? 'rating');
    if (board === 'streak') {
      res.json({ board, rows: toRows(topByStreak()) });
      return;
    }
    if (board === 'daily') {
      const date = typeof req.query.date === 'string' ? req.query.date : todayKey();
      res.json({ board, date, rows: dailyLeaderboard(date) });
      return;
    }
    res.json({ board: 'rating', rows: toRows(topByRating()) });
  }),
);

socialRouter.get(
  '/profile/:username',
  route((req, res) => {
    const user = findUserByUsername(req.params.username);
    if (!user) {
      res.status(404).json({ error: 'not_found', message: 'No player by that name.' });
      return;
    }

    const recent = many<{
      code: string | null;
      mode: string;
      score: number;
      place: number | null;
      rounds_won: number;
      created_at: number;
      rating_after: number | null;
    }>(
      `SELECT m.code, m.mode, mp.score, mp.place, mp.rounds_won, m.created_at, mp.rating_after
         FROM match_players mp
         JOIN matches m ON m.id = mp.match_id
        WHERE mp.user_id = ?
        ORDER BY m.created_at DESC
        LIMIT 10`,
      user.id,
    );

    const dailyHistory = many<{ date: string; guess_count: number; solved: number; drifts: number }>(
      `SELECT date, guess_count, solved, drifts
         FROM daily_runs
        WHERE user_id = ? AND date NOT LIKE 'practice:%'
        ORDER BY date DESC
        LIMIT 30`,
      user.id,
    );

    const rank = one<{ n: number }>(
      'SELECT COUNT(*) + 1 AS n FROM users WHERE guest = 0 AND rating > ?',
      user.rating,
    );

    res.json({
      user: toPublicUser(user),
      stats: toUserStats(getStatsRow(user.id)),
      globalRank: rank?.n ?? null,
      recentMatches: recent,
      dailyHistory,
    });
  }),
);
