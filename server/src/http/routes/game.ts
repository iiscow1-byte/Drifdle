import { Router } from 'express';
import {
  dailyLeaderboard,
  getDailyState,
  giveUp,
  loadRun,
  practiceKey,
  projectState,
  shareText,
  submitDailyGuess,
  todayKey,
} from '../../game/daily.ts';
import { lexiconStats, LEXICON_SIZE, UNLOCK_RANKS, BAND_CUTOFFS } from '../../game/lexicon/index.ts';
import { rateLimit, requireUser, route } from '../middleware.ts';

export const gameRouter = Router();

const guessLimit = rateLimit({
  windowMs: 60_000,
  max: 120,
  key: (req) => req.user?.id ?? req.ip ?? 'anon',
});

function nameFor(req: import('express').Request): string {
  return req.user?.display_name ?? 'Player';
}

/** Static facts the client needs to render bands, unlocks and the drift meter. */
gameRouter.get('/rules', (_req, res) => {
  res.json({
    lexiconSize: LEXICON_SIZE,
    lexicon: lexiconStats(),
    bands: BAND_CUTOFFS.map((b) => ({
      band: b.band,
      maxRank: b.maxRank === Number.MAX_SAFE_INTEGER ? null : b.maxRank,
    })),
    unlocks: UNLOCK_RANKS,
  });
});

/* ------------------------------------------------------------------ */
/* Daily                                                               */
/* ------------------------------------------------------------------ */

gameRouter.get(
  '/daily',
  requireUser,
  route((req, res) => {
    res.json(getDailyState(req.user!.id, nameFor(req), todayKey()));
  }),
);

gameRouter.post(
  '/daily/guess',
  requireUser,
  guessLimit,
  route((req, res) => {
    const word = String(req.body?.word ?? '');
    const result = submitDailyGuess(req.user!.id, nameFor(req), todayKey(), word);
    if (!result.ok) {
      res.status(400).json({ error: result.reason, message: guessError(result.reason) });
      return;
    }
    res.json(result);
  }),
);

gameRouter.post(
  '/daily/give-up',
  requireUser,
  route((req, res) => {
    const state = giveUp(req.user!.id, nameFor(req), todayKey());
    if (!state) {
      res.status(404).json({ error: 'not_started', message: 'Start today’s puzzle first.' });
      return;
    }
    res.json(state);
  }),
);

gameRouter.get(
  '/daily/share',
  requireUser,
  route((req, res) => {
    const state = getDailyState(req.user!.id, nameFor(req), todayKey());
    res.json({ text: shareText(state) });
  }),
);

gameRouter.get(
  '/daily/leaderboard',
  route((req, res) => {
    const date = typeof req.query.date === 'string' ? req.query.date : todayKey();
    res.json({ date, rows: dailyLeaderboard(date) });
  }),
);

/* ------------------------------------------------------------------ */
/* Practice — the same engine, a throwaway seed, no streak at stake     */
/* ------------------------------------------------------------------ */

gameRouter.post(
  '/practice',
  requireUser,
  route((req, res) => {
    const key = practiceKey();
    const handle = loadRun(req.user!.id, nameFor(req), key)!;
    res.status(201).json(projectState(req.user!.id, nameFor(req), handle));
  }),
);

gameRouter.get(
  '/practice/:key',
  requireUser,
  route((req, res) => {
    const key = `practice:${req.params.key}`;
    const handle = loadRun(req.user!.id, nameFor(req), key, false);
    if (!handle) {
      res.status(404).json({ error: 'not_found', message: 'No such practice run.' });
      return;
    }
    res.json(projectState(req.user!.id, nameFor(req), handle));
  }),
);

gameRouter.post(
  '/practice/:key/guess',
  requireUser,
  guessLimit,
  route((req, res) => {
    const key = `practice:${req.params.key}`;
    const result = submitDailyGuess(req.user!.id, nameFor(req), key, String(req.body?.word ?? ''));
    if (!result.ok) {
      res.status(400).json({ error: result.reason, message: guessError(result.reason) });
      return;
    }
    res.json(result);
  }),
);

gameRouter.post(
  '/practice/:key/give-up',
  requireUser,
  route((req, res) => {
    const state = giveUp(req.user!.id, nameFor(req), `practice:${req.params.key}`);
    if (!state) {
      res.status(404).json({ error: 'not_found', message: 'No such practice run.' });
      return;
    }
    res.json(state);
  }),
);

function guessError(reason: string): string {
  switch (reason) {
    case 'unknown_word':
      return 'That word is not in the Driftle lexicon.';
    case 'duplicate':
      return 'You have already played that word.';
    case 'too_short':
      return 'Guesses are at least three letters.';
    case 'already_solved':
      return 'This puzzle is already solved.';
    default:
      return 'That guess did not land.';
  }
}
