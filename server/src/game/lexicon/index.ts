import type { Axis, Band, Compass, Mark } from '../../../../shared/protocol.ts';
import { GROUPS, type RawGroup, type ScalarKey } from './words.ts';

/* ------------------------------------------------------------------ */
/* Building the space                                                  */
/* ------------------------------------------------------------------ */

const SCALAR_KEYS: ScalarKey[] = ['co', 'an', 'sz', 'hu', 'na', 'mo', 'va', 'it', 'te', 'tm'];

const AXIS_OF: Record<ScalarKey, Axis> = {
  co: 'concrete',
  an: 'animate',
  sz: 'size',
  hu: 'human',
  na: 'natural',
  mo: 'motion',
  va: 'valence',
  it: 'intensity',
  te: 'tech',
  tm: 'temporal',
};

/** How the compass phrases each axis. [when target is lower, when higher] */
const AXIS_PHRASES: Record<Axis, [string, string]> = {
  concrete: ['the answer is more abstract', 'the answer is more physical'],
  animate: ['the answer is less alive', 'the answer is more alive'],
  size: ['the answer is smaller', 'the answer is bigger'],
  human: ['the answer is further from people', 'the answer is closer to people'],
  natural: ['the answer is more man-made', 'the answer is more natural'],
  motion: ['the answer is more still', 'the answer moves more'],
  valence: ['the answer is darker', 'the answer is warmer'],
  intensity: ['the answer is calmer', 'the answer is more intense'],
  tech: ['the answer is older than machines', 'the answer is more technological'],
  temporal: ['the answer is more of a thing', 'the answer is more of an event'],
};

export interface LexEntry {
  word: string;
  index: number;
  tier: 1 | 2 | 3;
  group: string;
  tags: string[];
  scalars: Record<ScalarKey, number>;
  vec: Float64Array;
}

const TAG_WEIGHT = 0.72;
const SCALAR_WEIGHT = 0.28;
/** Keeps the scalar sub-vector from collapsing to zero for a mid-valued word. */
const SCALAR_ANCHOR = 0.35;

function parseGroup(g: RawGroup): Omit<LexEntry, 'index' | 'vec'>[] {
  const out: Omit<LexEntry, 'index' | 'vec'>[] = [];
  const scalars = {} as Record<ScalarKey, number>;
  for (const k of SCALAR_KEYS) scalars[k] = g.s[k] ?? 0.5;

  for (const raw of g.words.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon < 0) throw new Error(`lexicon: malformed entry "${line}" in group ${g.key}`);
    let word = line.slice(0, colon).trim();
    let tier: 1 | 2 | 3 = g.tier;
    if (word.endsWith('!')) {
      tier = 1;
      word = word.slice(0, -1);
    } else if (word.endsWith('*')) {
      tier = 3;
      word = word.slice(0, -1);
    }
    if (!/^[a-z]{3,12}$/.test(word)) {
      throw new Error(`lexicon: bad word "${word}" in group ${g.key}`);
    }
    const own = line
      .slice(colon + 1)
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    out.push({
      word,
      tier,
      group: g.key,
      tags: [...new Set([...g.tags, ...own, `group:${g.key}`])],
      scalars: { ...scalars },
    });
  }
  return out;
}

function build(): { entries: LexEntry[]; byWord: Map<string, LexEntry> } {
  const parsed = GROUPS.flatMap(parseGroup);

  const seen = new Set<string>();
  for (const p of parsed) {
    if (seen.has(p.word)) throw new Error(`lexicon: duplicate word "${p.word}"`);
    seen.add(p.word);
  }

  // Document frequency for idf weighting: a tag shared by two words is a much
  // stronger signal than one shared by two hundred.
  const df = new Map<string, number>();
  for (const p of parsed) for (const t of p.tags) df.set(t, (df.get(t) ?? 0) + 1);

  const tagIndex = new Map<string, number>();
  for (const t of [...df.keys()].sort()) tagIndex.set(t, tagIndex.size);

  const N = parsed.length;
  const T = tagIndex.size;
  const dim = T + SCALAR_KEYS.length + 1;

  const entries: LexEntry[] = parsed.map((p, index) => {
    const vec = new Float64Array(dim);

    // --- tag block ---
    let tagNorm = 0;
    for (const t of p.tags) {
      const idf = Math.log(N / (df.get(t) ?? 1)) + 1;
      const i = tagIndex.get(t)!;
      vec[i] = idf;
      tagNorm += idf * idf;
    }
    tagNorm = Math.sqrt(tagNorm) || 1;
    for (const t of p.tags) vec[tagIndex.get(t)!] *= TAG_WEIGHT / tagNorm;

    // --- scalar block ---
    let sNorm = SCALAR_ANCHOR * SCALAR_ANCHOR;
    const sVals = SCALAR_KEYS.map((k) => p.scalars[k] - 0.5);
    for (const v of sVals) sNorm += v * v;
    sNorm = Math.sqrt(sNorm) || 1;
    SCALAR_KEYS.forEach((_, i) => {
      vec[T + i] = (sVals[i] * SCALAR_WEIGHT) / sNorm;
    });
    vec[T + SCALAR_KEYS.length] = (SCALAR_ANCHOR * SCALAR_WEIGHT) / sNorm;

    // Final L2 pass so cosine(x, x) === 1 and similarities read as real cosines.
    // Every word has identical block norms, so this is a uniform rescale and
    // leaves the ranking untouched.
    let norm = 0;
    for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < dim; i++) vec[i] /= norm;

    return { ...p, index, vec };
  });

  const byWord = new Map(entries.map((e) => [e.word, e]));
  return { entries, byWord };
}

const { entries: LEX, byWord: BY_WORD } = build();

export const LEXICON = LEX;
export const LEXICON_SIZE = LEX.length;

export function lookup(word: string): LexEntry | undefined {
  return BY_WORD.get(word.trim().toLowerCase());
}

export function entryAt(index: number): LexEntry {
  const e = LEX[index];
  if (!e) throw new Error(`lexicon: no entry at ${index}`);
  return e;
}

/* ------------------------------------------------------------------ */
/* Similarity and ranking                                              */
/* ------------------------------------------------------------------ */

function cosine(a: Float64Array, b: Float64Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

export function similarity(aIndex: number, bIndex: number): number {
  return cosine(LEX[aIndex].vec, LEX[bIndex].vec);
}

/** rankOf[wordIndex] = 1-based rank of that word relative to the target. */
const rankCache = new Map<number, Int32Array>();
const orderCache = new Map<number, Int32Array>();

function computeRanks(targetIndex: number) {
  const target = LEX[targetIndex].vec;
  const scored = LEX.map((e) => ({ i: e.index, s: cosine(target, e.vec), w: e.word }));
  scored.sort((a, b) => (b.s - a.s) || a.w.localeCompare(b.w));

  const ranks = new Int32Array(LEX.length);
  const order = new Int32Array(LEX.length);
  scored.forEach((entry, position) => {
    ranks[entry.i] = position + 1;
    order[position] = entry.i;
  });
  rankCache.set(targetIndex, ranks);
  orderCache.set(targetIndex, order);
}

export function rankOf(guessIndex: number, targetIndex: number): number {
  if (!rankCache.has(targetIndex)) computeRanks(targetIndex);
  return rankCache.get(targetIndex)![guessIndex];
}

/** The word indices sorted from nearest to furthest from `targetIndex`. */
export function orderFor(targetIndex: number): Int32Array {
  if (!orderCache.has(targetIndex)) computeRanks(targetIndex);
  return orderCache.get(targetIndex)!;
}

/** The n nearest words, excluding the target itself. Used in the round reveal. */
export function nearestWords(targetIndex: number, n: number): string[] {
  const order = orderFor(targetIndex);
  const out: string[] = [];
  for (let i = 1; i < order.length && out.length < n; i++) out.push(LEX[order[i]].word);
  return out;
}

/* ------------------------------------------------------------------ */
/* Bands                                                               */
/* ------------------------------------------------------------------ */

export const BAND_CUTOFFS: { band: Band; maxRank: number }[] = [
  { band: 'exact', maxRank: 1 },
  { band: 'burning', maxRank: 8 },
  { band: 'hot', maxRank: 40 },
  { band: 'warm', maxRank: 120 },
  { band: 'cool', maxRank: 280 },
  { band: 'cold', maxRank: 520 },
  { band: 'frozen', maxRank: Number.MAX_SAFE_INTEGER },
];

export function bandForRank(rank: number): Band {
  for (const c of BAND_CUTOFFS) if (rank <= c.maxRank) return c.band;
  return 'frozen';
}

/* ------------------------------------------------------------------ */
/* Unlocks: how much spelling your semantic proximity buys you          */
/* ------------------------------------------------------------------ */

export const UNLOCK_RANKS = {
  compass: 300,
  length: 250,
  hits: 120,
  nears: 40,
  initial: 8,
} as const;

/**
 * Wordle-style marks, but gated by how near the guess was semantically.
 * A cold guess tells you nothing about spelling; a burning one tells you a lot.
 */
export function marksFor(guess: string, target: string, rank: number): Mark[] {
  const showHits = rank <= UNLOCK_RANKS.hits;
  const showNears = rank <= UNLOCK_RANKS.nears;
  if (!showHits) return guess.split('').map(() => 'hidden' as Mark);

  const g = guess.split('');
  const t = target.split('');
  const marks: Mark[] = g.map(() => 'miss');
  const used = t.map(() => false);

  for (let i = 0; i < g.length; i++) {
    if (i < t.length && g[i] === t[i]) {
      marks[i] = 'hit';
      used[i] = true;
    }
  }
  if (!showNears) {
    // Only exact-position information is unlocked at this tier.
    return marks.map((m) => (m === 'hit' ? 'hit' : 'hidden'));
  }
  for (let i = 0; i < g.length; i++) {
    if (marks[i] === 'hit') continue;
    const j = t.findIndex((ch, k) => !used[k] && ch === g[i]);
    if (j >= 0) {
      marks[i] = 'near';
      used[j] = true;
    }
  }
  return marks;
}

export function unlocksFor(rank: number) {
  const list: ('length' | 'hits' | 'nears' | 'initial')[] = [];
  if (rank <= UNLOCK_RANKS.length) list.push('length');
  if (rank <= UNLOCK_RANKS.hits) list.push('hits');
  if (rank <= UNLOCK_RANKS.nears) list.push('nears');
  if (rank <= UNLOCK_RANKS.initial) list.push('initial');
  return list;
}

/* ------------------------------------------------------------------ */
/* Compass                                                             */
/* ------------------------------------------------------------------ */

const COMPASS_MIN_DELTA = 0.16;

export function compassFor(guessIndex: number, targetIndex: number, rank: number): Compass | undefined {
  if (rank > UNLOCK_RANKS.compass) return undefined;
  const g = LEX[guessIndex].scalars;
  const t = LEX[targetIndex].scalars;

  let bestKey: ScalarKey | null = null;
  let bestDelta = 0;
  for (const k of SCALAR_KEYS) {
    const d = t[k] - g[k];
    if (Math.abs(d) > Math.abs(bestDelta)) {
      bestDelta = d;
      bestKey = k;
    }
  }
  if (!bestKey || Math.abs(bestDelta) < COMPASS_MIN_DELTA) return undefined;

  const axis = AXIS_OF[bestKey];
  const direction: 1 | -1 = bestDelta > 0 ? 1 : -1;
  return {
    axis,
    direction,
    strength: Math.min(1, Math.abs(bestDelta) / 0.7),
    text: AXIS_PHRASES[axis][direction > 0 ? 1 : 0],
  };
}

/* ------------------------------------------------------------------ */
/* Target selection and drift                                          */
/* ------------------------------------------------------------------ */

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function eligible(difficulty: 1 | 2 | 3): LexEntry[] {
  return LEX.filter((e) => e.tier <= difficulty);
}

export function pickTarget(rng: Rng, difficulty: 1 | 2 | 3): number {
  const pool = eligible(difficulty);
  return pool[Math.floor(rng() * pool.length)].index;
}

/** Drift lands in this rank window around the current target. */
export const DRIFT_WINDOW = { min: 3, max: 16 };

/**
 * Choose where the answer runs to. Close enough that the board's existing
 * information is still worth something, far enough that the leader loses
 * their edge.
 */
export function driftFrom(
  currentIndex: number,
  rng: Rng,
  difficulty: 1 | 2 | 3,
  exclude: Set<number>,
): { index: number; similarity: number } {
  const order = orderFor(currentIndex);
  const candidates: number[] = [];
  for (let pos = DRIFT_WINDOW.min; pos <= DRIFT_WINDOW.max && pos < order.length; pos++) {
    const idx = order[pos];
    if (exclude.has(idx)) continue;
    if (LEX[idx].tier > difficulty) continue;
    candidates.push(idx);
  }
  // Widen the search if the neighbourhood is exhausted.
  if (candidates.length === 0) {
    for (let pos = 1; pos < Math.min(order.length, 80); pos++) {
      const idx = order[pos];
      if (!exclude.has(idx) && LEX[idx].tier <= difficulty) candidates.push(idx);
    }
  }
  if (candidates.length === 0) return { index: currentIndex, similarity: 1 };

  const pick = candidates[Math.floor(rng() * candidates.length)];
  return { index: pick, similarity: similarity(currentIndex, pick) };
}

/* ------------------------------------------------------------------ */
/* Diagnostics                                                         */
/* ------------------------------------------------------------------ */

export function lexiconStats() {
  const tiers = { 1: 0, 2: 0, 3: 0 } as Record<number, number>;
  const groups = new Set<string>();
  const tags = new Set<string>();
  for (const e of LEX) {
    tiers[e.tier]++;
    groups.add(e.group);
    for (const t of e.tags) tags.add(t);
  }
  return { size: LEX.length, tiers, groups: groups.size, tags: tags.size };
}
