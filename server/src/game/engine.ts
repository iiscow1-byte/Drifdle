import type {
  Award,
  Band,
  DriftEvent,
  PrivateGuess,
  PublicGuess,
  Revealed,
} from '../../../shared/protocol.ts';
import {
  LEXICON,
  LEXICON_SIZE,
  bandForRank,
  compassFor,
  definitionOf,
  domainOf,
  driftFrom,
  entryAt,
  hashSeed,
  insightFor,
  lookup,
  marksFor,
  mulberry32,
  nearestWords,
  pickTarget,
  rankOf,
  revealedOf,
  similarity,
  unlocksFor,
  UNLOCK_RANKS,
  type Rng,
} from './lexicon/index.ts';
import { shortId } from '../util/ids.ts';

/* ------------------------------------------------------------------ */
/* Drift tuning                                                        */
/* ------------------------------------------------------------------ */

/** Pressure a single guess adds to the drift meter, by how near it landed. */
export function pressureFor(rank: number): number {
  if (rank <= UNLOCK_RANKS.initial) return 4;
  if (rank <= UNLOCK_RANKS.nears) return 2;
  if (rank <= UNLOCK_RANKS.hits) return 1;
  return 0;
}

/**
 * The meter has to hold more the more people are pushing on it, or a six-player
 * room would drift every twenty seconds. It also widens each time it fires, so
 * late rounds settle down instead of thrashing.
 */
export const SENSITIVITY_SCALE: Record<1 | 2 | 3, number> = {
  1: 1.6,  // steady: the answer mostly stays put
  2: 1,    // normal
  3: 0.55, // hair-trigger: it bolts at the first sign of pressure
};

export function driftCapFor(epoch: number, players: number, sensitivity: 1 | 2 | 3 = 2): number {
  const base = (12 + 7 * epoch) * SENSITIVITY_SCALE[sensitivity];
  return Math.max(4, Math.round(base * (1 + 0.45 * Math.max(0, players - 1))));
}

const DRIFT_HEADLINES = [
  'The answer slipped sideways.',
  'Something moved. The board is stale.',
  'DRIFT — the target broke cover.',
  'You got too close. It ran.',
  'The answer will not sit still.',
  'Pressure released. Everything re-scored.',
];

/* ------------------------------------------------------------------ */
/* Round                                                               */
/* ------------------------------------------------------------------ */

export interface EngineGuess {
  id: string;
  playerId: string;
  playerName: string;
  word: string;
  wordIndex: number;
  at: number;
  /** Rank against the *current* target. Mutated by rescoring. */
  rank: number;
  band: Band;
  /** Best (lowest) rank this guess has ever held, for award calculation. */
  bestRankEver: number;
  epoch: number;
  revealed: boolean;
}

export interface RoundOptions {
  seed: string;
  difficulty: 1 | 2 | 3;
  maxDrifts: number;
  /** Used to size the drift meter. */
  playerCount: number;
  /** How readily the meter fills. Defaults to normal. */
  sensitivity?: 1 | 2 | 3;
  /** Pin the first target (daily puzzles do this via the seed anyway). */
  startIndex?: number;
}

export type GuessOutcome =
  | { ok: false; reason: 'unknown_word' | 'duplicate' | 'too_short' }
  | {
      ok: true;
      guess: EngineGuess;
      private: PrivateGuess;
      public: PublicGuess;
      solved: boolean;
      drift: DriftEvent | null;
    };

export class Round {
  readonly options: RoundOptions;
  private rng: Rng;

  targetIndex: number;
  /** Every target this round has had, oldest first. */
  chain: number[];
  epoch = 0;
  charge = 0;
  cap: number;
  anchored = false;
  drifts: DriftEvent[] = [];
  guesses: EngineGuess[] = [];
  startedAt = Date.now();
  endedAt: number | null = null;
  winnerId: string | null = null;
  winnerName: string | null = null;
  /** Word -> guess, so we can reject duplicates cheaply. */
  private byWord = new Map<string, EngineGuess>();
  /** First player to reach each band, for awards. */
  private firstBurning: { playerId: string; name: string; at: number } | null = null;
  private driftsCausedBy = new Map<string, number>();

  constructor(options: RoundOptions) {
    this.options = options;
    this.rng = mulberry32(hashSeed(options.seed));
    this.targetIndex = options.startIndex ?? pickTarget(this.rng, options.difficulty);
    this.chain = [this.targetIndex];
    this.cap = driftCapFor(0, options.playerCount, options.sensitivity ?? 2);
  }

  get target(): string {
    return entryAt(this.targetIndex).word;
  }

  get solved(): boolean {
    return this.winnerId !== null || this.endedAt !== null;
  }

  /** How many people are pushing on the meter; rooms update this as players join. */
  setPlayerCount(n: number) {
    if (n === this.options.playerCount) return;
    (this.options as { playerCount: number }).playerCount = n;
    this.cap = driftCapFor(this.epoch, n, this.options.sensitivity ?? 2);
  }

  hasGuessed(word: string): boolean {
    return this.byWord.has(word);
  }

  /** Words already on the board can never be drift destinations. */
  private blockedTargets(): Set<number> {
    const blocked = new Set<number>(this.chain);
    for (const g of this.guesses) blocked.add(g.wordIndex);
    return blocked;
  }

  submit(playerId: string, playerName: string, rawWord: string, now = Date.now()): GuessOutcome {
    const word = rawWord.trim().toLowerCase();
    if (word.length < 3) return { ok: false, reason: 'too_short' };
    const entry = lookup(word);
    if (!entry) return { ok: false, reason: 'unknown_word' };
    if (this.byWord.has(word)) return { ok: false, reason: 'duplicate' };

    const rank = rankOf(entry.index, this.targetIndex);
    const guess: EngineGuess = {
      id: shortId(10),
      playerId,
      playerName,
      word,
      wordIndex: entry.index,
      at: now,
      rank,
      band: bandForRank(rank),
      bestRankEver: rank,
      epoch: this.epoch,
      revealed: false,
    };
    this.guesses.push(guess);
    this.byWord.set(word, guess);

    if (rank <= UNLOCK_RANKS.initial && !this.firstBurning) {
      this.firstBurning = { playerId, name: playerName, at: now };
    }

    const solved = rank === 1;
    if (solved) {
      this.winnerId = playerId;
      this.winnerName = playerName;
      this.endedAt = now;
    }

    let drift: DriftEvent | null = null;
    if (!solved) {
      this.charge += pressureFor(rank);
      if (this.charge >= this.cap && !this.anchored && this.drifts.length < this.options.maxDrifts) {
        drift = this.applyDrift(playerId, playerName, now);
      }
    }

    return {
      ok: true,
      guess,
      private: this.toPrivate(guess),
      public: this.toPublic(guess),
      solved,
      drift,
    };
  }

  private applyDrift(causedBy: string | null, causedByName: string | null, now: number): DriftEvent {
    const blocked = this.blockedTargets();
    const from = this.targetIndex;
    const next = driftFrom(from, this.rng, this.options.difficulty, blocked);

    if (next.index === from) {
      // Nowhere left to run - the board has the answer surrounded.
      this.anchored = true;
      this.charge = 0;
      const event: DriftEvent = {
        epoch: this.epoch,
        at: now,
        causedBy,
        causedByName,
        similarity: 1,
        headline: 'ANCHORED — the answer is cornered and can no longer move.',
      };
      this.drifts.push(event);
      return event;
    }

    this.targetIndex = next.index;
    this.chain.push(next.index);
    this.epoch += 1;
    this.charge = 0;
    this.cap = driftCapFor(this.epoch, this.options.playerCount, this.options.sensitivity ?? 2);
    if (causedBy) {
      this.driftsCausedBy.set(causedBy, (this.driftsCausedBy.get(causedBy) ?? 0) + 1);
    }

    this.rescore();

    if (this.drifts.length + 1 >= this.options.maxDrifts) this.anchored = true;

    const event: DriftEvent = {
      epoch: this.epoch,
      at: now,
      causedBy,
      causedByName,
      similarity: next.similarity,
      headline: DRIFT_HEADLINES[this.epoch % DRIFT_HEADLINES.length],
    };
    this.drifts.push(event);
    return event;
  }

  /** Re-rank every guess on the board against the new target. */
  private rescore() {
    for (const g of this.guesses) {
      g.rank = rankOf(g.wordIndex, this.targetIndex);
      g.band = bandForRank(g.rank);
      g.epoch = this.epoch;
      if (g.rank < g.bestRankEver) g.bestRankEver = g.rank;
    }
  }

  /** End the round with nobody winning (timeout, everyone left). */
  expire(now = Date.now()) {
    if (this.endedAt === null) this.endedAt = now;
  }

  reveal(guessId: string): EngineGuess | undefined {
    const g = this.guesses.find((x) => x.id === guessId);
    if (g) g.revealed = true;
    return g;
  }

  /* ---------------- projections ---------------- */

  toPublic(g: EngineGuess): PublicGuess {
    return {
      id: g.id,
      playerId: g.playerId,
      playerName: g.playerName,
      word: g.word,
      band: g.band,
      rank: g.revealed ? g.rank : undefined,
      epoch: g.epoch,
      at: g.at,
      revealed: g.revealed,
    };
  }

  toPrivate(g: EngineGuess): PrivateGuess {
    const target = this.target;
    const unlocks = unlocksFor(g.rank);
    return {
      ...this.toPublic(g),
      rank: g.rank,
      marks: marksFor(g.word, target, g.rank),
      targetLength: unlocks.includes('length') ? target.length : undefined,
      compass: compassFor(g.wordIndex, this.targetIndex, g.rank),
      insight: insightFor(g.wordIndex, this.targetIndex, g.rank),
      unlocks,
    };
  }

  /** The answer's own definition, for the end-of-round reveal. */
  definition(): string {
    return definitionOf(this.targetIndex);
  }

  domain(): string {
    return domainOf(this.targetIndex);
  }

  /** Every word the answer has been, with what each one means. */
  chainDetail(): Revealed[] {
    return this.chain.map((i) => revealedOf(i));
  }

  /** The best length hint any of this player's guesses has earned. */
  knownTargetLength(playerId: string): number | null {
    const best = this.bestRankFor(playerId);
    if (best === null || best > UNLOCK_RANKS.length) return null;
    return this.target.length;
  }

  bestRankFor(playerId: string): number | null {
    let best: number | null = null;
    for (const g of this.guesses) {
      if (g.playerId !== playerId) continue;
      if (best === null || g.rank < best) best = g.rank;
    }
    return best;
  }

  guessCountFor(playerId: string): number {
    return this.guesses.reduce((n, g) => (g.playerId === playerId ? n + 1 : n), 0);
  }

  publicBoard(): PublicGuess[] {
    return this.guesses.map((g) => this.toPublic(g));
  }

  privateBoardFor(playerId: string): PrivateGuess[] {
    return this.guesses.filter((g) => g.playerId === playerId).map((g) => this.toPrivate(g));
  }

  chainWords(): string[] {
    return this.chain.map((i) => entryAt(i).word);
  }

  /** Shown in the round reveal so players learn the space. */
  neighbourhood(n = 8): string[] {
    return nearestWords(this.targetIndex, n);
  }

  /* ---------------- scoring ---------------- */

  scoreFor(playerId: string, roundSeconds: number): number {
    const best = this.bestRankFor(playerId);
    const guesses = this.guessCountFor(playerId);
    if (best === null) return 0;

    if (this.winnerId === playerId) {
      const elapsed = (this.endedAt ?? Date.now()) - this.startedAt;
      const limit = roundSeconds > 0 ? roundSeconds * 1000 : 300_000;
      const speed = Math.max(0, 1 - elapsed / limit);
      return Math.round(
        1000 + 400 * speed + 150 * this.drifts.length - Math.min(400, 8 * guesses),
      );
    }

    // Everyone else scores on how close they got, with a bonus for being one of
    // the guesses that made the winner's life easier.
    const proximity = Math.max(0, 1 - best / LEXICON_SIZE);
    let pts = Math.round(340 * Math.pow(proximity, 2.2));
    if (best <= 3) pts += 200;
    else if (best <= UNLOCK_RANKS.initial) pts += 120;
    return pts;
  }

  awards(): Award[] {
    const out: Award[] = [];
    if (this.firstBurning) {
      out.push({
        playerId: this.firstBurning.playerId,
        playerName: this.firstBurning.name,
        label: 'First Blood',
        detail: 'first into the burning band',
        points: 75,
      });
    }

    const counts = new Map<string, { name: string; n: number }>();
    for (const g of this.guesses) {
      const c = counts.get(g.playerId) ?? { name: g.playerName, n: 0 };
      c.n += 1;
      counts.set(g.playerId, c);
    }
    let topGuesser: [string, { name: string; n: number }] | null = null;
    for (const e of counts) if (!topGuesser || e[1].n > topGuesser[1].n) topGuesser = e;
    if (topGuesser && topGuesser[1].n >= 5) {
      out.push({
        playerId: topGuesser[0],
        playerName: topGuesser[1].name,
        label: 'Cartographer',
        detail: `mapped ${topGuesser[1].n} words`,
        points: 50,
      });
    }

    let topDrifter: [string, number] | null = null;
    for (const e of this.driftsCausedBy) if (!topDrifter || e[1] > topDrifter[1]) topDrifter = e;
    if (topDrifter && topDrifter[1] > 0) {
      const name = this.guesses.find((g) => g.playerId === topDrifter![0])?.playerName ?? '?';
      out.push({
        playerId: topDrifter[0],
        playerName: name,
        label: 'Drift Weaver',
        detail: `forced ${topDrifter[1]} drift${topDrifter[1] > 1 ? 's' : ''}`,
        points: 60,
      });
    }

    // Best rank among players who did not win.
    let ghost: { id: string; name: string; rank: number } | null = null;
    for (const g of this.guesses) {
      if (g.playerId === this.winnerId) continue;
      if (!ghost || g.rank < ghost.rank) ghost = { id: g.playerId, name: g.playerName, rank: g.rank };
    }
    if (ghost && ghost.rank <= 5) {
      out.push({
        playerId: ghost.id,
        playerName: ghost.name,
        label: 'So Close',
        detail: `held rank ${ghost.rank} and still lost it`,
        points: 80,
      });
    }

    if (this.winnerId && this.guessCountFor(this.winnerId) <= 6) {
      out.push({
        playerId: this.winnerId,
        playerName: this.winnerName ?? '?',
        label: 'Sniper',
        detail: `solved in ${this.guessCountFor(this.winnerId)} guesses`,
        points: 120,
      });
    }

    return out;
  }
}

/* ------------------------------------------------------------------ */
/* Helpers used by both the room and the daily solo mode               */
/* ------------------------------------------------------------------ */

export function similarityBetween(a: string, b: string): number | null {
  const x = lookup(a);
  const y = lookup(b);
  if (!x || !y) return null;
  return similarity(x.index, y.index);
}

export function isWord(word: string): boolean {
  return !!lookup(word);
}

export { LEXICON, LEXICON_SIZE };
