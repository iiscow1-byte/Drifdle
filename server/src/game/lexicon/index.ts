import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Axis, Band, Compass, GuessInsight, Mark, Revealed } from '../../../../shared/protocol.ts';
import { AXES, AXIS_PHRASES, domainAt } from './domains.ts';

/**
 * Driftle's semantic space, built from WordNet 3.1.
 *
 * A word is represented by the set of synsets it belongs to plus every
 * hypernym above them — so `wolf` carries {wolf, canine, carnivore, placental,
 * mammal, ... entity}. Those features are idf-weighted, which means sharing
 * `carnivore` counts enormously and sharing `entity` counts for nothing.
 *
 * The payoff over a bag of embeddings is that proximity is *explainable*: the
 * most specific feature two words share is a real English concept, so the game
 * can tell you "both are kinds of carnivore" instead of "0.71 similar".
 */

/* ------------------------------------------------------------------ */
/* Load                                                                */
/* ------------------------------------------------------------------ */

const here = dirname(fileURLToPath(import.meta.url));

function readPack(): Buffer {
  // The .bin sits beside the source in dev and beside the compiled output after
  // a build, because tsc does not copy assets.
  const candidates = [
    join(here, 'data', 'lexicon.bin'),
    join(here, '../../../../server/src/game/lexicon/data/lexicon.bin'),
    join(process.cwd(), 'server/src/game/lexicon/data/lexicon.bin'),
  ];
  for (const path of candidates) {
    try {
      return readFileSync(path);
    } catch {
      /* try the next one */
    }
  }
  throw new Error(
    'lexicon.bin not found. Generate it with `npm run build:lexicon` (needs the wordnet-db devDependency).',
  );
}

interface Pack {
  words: string[];
  glosses: string[];
  wordSynOffsets: Uint32Array;
  wordSynValues: Uint32Array;
  /** Corpus frequency of each sense, parallel to wordSynValues. */
  wordSynTags: Uint16Array;
  synHypOffsets: Uint32Array;
  synHypValues: Uint32Array;
  synLex: Uint8Array;
  synPos: Uint8Array;
  /** 1 when every word in the synset is capitalised, i.e. a proper noun. */
  synProper: Uint8Array;
  synHead: Uint32Array;
  freq: Uint32Array;
  tiers: Uint8Array;
}

function decode(): Pack {
  const raw = gunzipSync(readPack());
  // Copy into a fresh ArrayBuffer so typed-array views are guaranteed aligned.
  const ab = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(ab);
  bytes.set(raw);
  const view = new DataView(ab);

  let at = 0;
  const magic = Buffer.from(bytes.subarray(0, 8)).toString('ascii');
  if (magic !== 'DRFTLX05') throw new Error(`lexicon.bin has unexpected magic "${magic}"`);
  at = 8;

  const u32 = () => {
    const v = view.getUint32(at, true);
    at += 4;
    return v;
  };
  const align = () => {
    at += (4 - (at % 4)) % 4;
  };

  const wordCount = u32();
  const synsetCount = u32();
  const wordSynLen = u32();
  const synHypLen = u32();
  const wordBlobLen = u32();
  const glossBlobLen = u32();

  const takeStrings = (blobLen: number, count: number): string[] => {
    const text = Buffer.from(bytes.subarray(at, at + blobLen)).toString('utf8');
    at += blobLen;
    align();
    at += (count + 1) * 4; // offsets table, unused: split is faster
    align();
    return text.split('\n');
  };

  const words = takeStrings(wordBlobLen, wordCount);
  const glosses = takeStrings(glossBlobLen, synsetCount);

  const takeU32 = (len: number) => {
    const arr = new Uint32Array(ab, at, len);
    at += len * 4;
    return arr;
  };
  const takeU8 = (len: number) => {
    const arr = new Uint8Array(ab, at, len);
    at += len;
    align();
    return arr;
  };
  const takeU16 = (len: number) => {
    const arr = new Uint16Array(ab, at, len);
    at += len * 2;
    align();
    return arr;
  };

  const wordSynOffsets = takeU32(wordCount + 1);
  const wordSynValues = takeU32(wordSynLen);
  const wordSynTags = takeU16(wordSynLen);
  const synHypOffsets = takeU32(synsetCount + 1);
  const synHypValues = takeU32(synHypLen);
  const synLex = takeU8(synsetCount);
  const synPos = takeU8(synsetCount);
  const synProper = takeU8(synsetCount);
  const synHead = takeU32(synsetCount);
  const freq = takeU32(wordCount);
  const tiers = takeU8(wordCount);

  if (words.length !== wordCount) {
    throw new Error(`lexicon.bin word count mismatch: ${words.length} vs ${wordCount}`);
  }
  return {
    words,
    glosses,
    wordSynOffsets,
    wordSynValues,
    wordSynTags,
    synHypOffsets,
    synHypValues,
    synLex,
    synPos,
    synProper,
    synHead,
    freq,
    tiers,
  };
}

const pack = decode();

export const LEXICON_SIZE = pack.words.length;
const SYNSET_COUNT = pack.glosses.length;
const POS_NAME = ['noun', 'verb', 'adjective', 'adverb'];

const wordIndex = new Map<string, number>();
pack.words.forEach((w, i) => wordIndex.set(w, i));

export interface LexEntry {
  word: string;
  index: number;
  tier: 1 | 2 | 3;
}

/** Lightweight accessor; the heavy data stays in typed arrays. */
export function entryAt(index: number): LexEntry {
  const word = pack.words[index];
  if (word === undefined) throw new Error(`lexicon: no entry at ${index}`);
  return { word, index, tier: pack.tiers[index] as 1 | 2 | 3 };
}

export function lookup(word: string): LexEntry | undefined {
  const i = wordIndex.get(word.trim().toLowerCase());
  return i === undefined ? undefined : entryAt(i);
}

/** Iterating 75k entry objects is wasteful; most callers want the words. */
export const LEXICON = {
  get length() {
    return LEXICON_SIZE;
  },
  at: entryAt,
  words: pack.words,
};

/* ------------------------------------------------------------------ */
/* Hypernym closures                                                   */
/* ------------------------------------------------------------------ */

/** Ancestors of each synset (including itself), with distance from it. */
const closureCache = new Map<number, { ids: Int32Array; dist: Uint8Array }>();

function closureOf(synset: number): { ids: Int32Array; dist: Uint8Array } {
  const cached = closureCache.get(synset);
  if (cached) return cached;

  const ids: number[] = [];
  const dist: number[] = [];
  const seen = new Set<number>();
  let frontier = [synset];
  let depth = 0;

  while (frontier.length && depth < 24) {
    const next: number[] = [];
    for (const s of frontier) {
      if (seen.has(s)) continue;
      seen.add(s);
      ids.push(s);
      dist.push(depth);
      for (let k = pack.synHypOffsets[s]; k < pack.synHypOffsets[s + 1]; k++) {
        const parent = pack.synHypValues[k];
        if (!seen.has(parent)) next.push(parent);
      }
    }
    frontier = next;
    depth++;
  }

  const result = { ids: Int32Array.from(ids), dist: Uint8Array.from(dist) };
  closureCache.set(synset, result);
  return result;
}

/** How deep a synset sits in the hierarchy — the specificity axis. */
const synDepth = new Uint8Array(SYNSET_COUNT);
{
  for (let s = 0; s < SYNSET_COUNT; s++) {
    const c = closureOf(s);
    synDepth[s] = Math.min(255, c.ids.length === 0 ? 0 : Math.max(...c.dist));
  }
}

/* ------------------------------------------------------------------ */
/* Feature vectors                                                     */
/* ------------------------------------------------------------------ */

/**
 * How much each sense of a word counts toward its meaning.
 *
 * Sense *order* alone is too gentle a signal: `thunder` has a slang sense
 * meaning heroin, and ordering it fifth still let it drag the word toward
 * narcotics. WordNet's tagged-corpus counts are far sharper — a sense nobody
 * has ever been recorded using drops to the floor value, where it stays
 * reachable without steering the word.
 */
const UNATTESTED_FLOOR = 0.07;
const senseScratch = new Float64Array(128);

function senseWeightsFor(word: number): Float64Array {
  const start = pack.wordSynOffsets[word];
  const n = Math.min(pack.wordSynOffsets[word + 1] - start, senseScratch.length);

  let maxTag = 0;
  for (let i = 0; i < n; i++) maxTag = Math.max(maxTag, pack.wordSynTags[start + i]);

  for (let i = 0; i < n; i++) {
    senseScratch[i] =
      maxTag > 0
        ? UNATTESTED_FLOOR + (1 - UNATTESTED_FLOOR) * (pack.wordSynTags[start + i] / maxTag)
        : // No corpus evidence at all: fall back to WordNet's own sense order.
          1 / (1 + 0.9 * i);
  }
  return senseScratch.subarray(0, n);
}
/** Distant ancestors are weaker evidence than immediate ones. */
const DEPTH_DECAY = 0.82;

const featureOffsets = new Uint32Array(LEXICON_SIZE + 1);
let featureIds: Int32Array;
let featureWeights: Float32Array;

/** Inverted index: feature -> the words carrying it, for fast scoring. */
const postingOffsets = new Uint32Array(SYNSET_COUNT + 1);
let postingWords: Int32Array;
let postingWeights: Float32Array;

function buildVectors() {
  const df = new Uint32Array(SYNSET_COUNT);

  // Pass 1: collect raw (feature, weight) pairs and document frequencies.
  const ids: number[] = [];
  const weights: number[] = [];
  const acc = new Map<number, number>();

  for (let w = 0; w < LEXICON_SIZE; w++) {
    acc.clear();
    const start = pack.wordSynOffsets[w];
    const senseW = senseWeightsFor(w);
    const end = start + senseW.length;
    for (let s = start; s < end; s++) {
      const sw = senseW[s - start];
      const c = closureOf(pack.wordSynValues[s]);
      for (let k = 0; k < c.ids.length; k++) {
        const f = c.ids[k];
        const contribution = sw * Math.pow(DEPTH_DECAY, c.dist[k]);
        const prev = acc.get(f);
        if (prev === undefined || contribution > prev) acc.set(f, contribution);
      }
    }
    featureOffsets[w] = ids.length;
    for (const [f, weight] of acc) {
      ids.push(f);
      weights.push(weight);
      df[f]++;
    }
  }
  featureOffsets[LEXICON_SIZE] = ids.length;

  featureIds = Int32Array.from(ids);
  featureWeights = Float32Array.from(weights);

  // Pass 2: apply idf and L2-normalise, so a dot product is a cosine.
  const idf = new Float32Array(SYNSET_COUNT);
  for (let f = 0; f < SYNSET_COUNT; f++) {
    idf[f] = df[f] === 0 ? 0 : Math.log(LEXICON_SIZE / df[f]) + 1;
  }
  for (let w = 0; w < LEXICON_SIZE; w++) {
    let norm = 0;
    for (let k = featureOffsets[w]; k < featureOffsets[w + 1]; k++) {
      const v = featureWeights[k] * idf[featureIds[k]];
      featureWeights[k] = v;
      norm += v * v;
    }
    norm = Math.sqrt(norm) || 1;
    for (let k = featureOffsets[w]; k < featureOffsets[w + 1]; k++) featureWeights[k] /= norm;
  }

  // Pass 3: invert, by counting sort.
  const counts = new Uint32Array(SYNSET_COUNT + 1);
  for (let k = 0; k < featureIds.length; k++) counts[featureIds[k]]++;
  let running = 0;
  for (let f = 0; f < SYNSET_COUNT; f++) {
    postingOffsets[f] = running;
    running += counts[f];
  }
  postingOffsets[SYNSET_COUNT] = running;

  postingWords = new Int32Array(running);
  postingWeights = new Float32Array(running);
  const fill = postingOffsets.slice();
  for (let w = 0; w < LEXICON_SIZE; w++) {
    for (let k = featureOffsets[w]; k < featureOffsets[w + 1]; k++) {
      const f = featureIds[k];
      const at = fill[f]++;
      postingWords[at] = w;
      postingWeights[at] = featureWeights[k];
    }
  }
}

const buildStart = Date.now();
buildVectors();
const buildMs = Date.now() - buildStart;

/* ------------------------------------------------------------------ */
/* Scoring and ranking                                                 */
/* ------------------------------------------------------------------ */

/** Skip features so common they carry almost no signal but cost a lot to walk. */
const POSTING_SKIP = 24_000;

const scratch = new Float32Array(LEXICON_SIZE);

function scoreAgainst(target: number, out: Float32Array) {
  out.fill(0);
  for (let k = featureOffsets[target]; k < featureOffsets[target + 1]; k++) {
    const f = featureIds[k];
    const start = postingOffsets[f];
    const end = postingOffsets[f + 1];
    if (end - start > POSTING_SKIP) continue;
    const wf = featureWeights[k];
    for (let p = start; p < end; p++) out[postingWords[p]] += wf * postingWeights[p];
  }
}

export function similarity(a: number, b: number): number {
  // Sparse dot product over the smaller feature list.
  let i = featureOffsets[a];
  const iEnd = featureOffsets[a + 1];
  const map = new Map<number, number>();
  for (; i < iEnd; i++) map.set(featureIds[i], featureWeights[i]);
  let dot = 0;
  for (let k = featureOffsets[b]; k < featureOffsets[b + 1]; k++) {
    const other = map.get(featureIds[k]);
    if (other !== undefined) dot += other * featureWeights[k];
  }
  return dot;
}

interface RankTable {
  /** 1-based rank of every word relative to the target. */
  ranks: Int32Array;
  /** The nearest words, target first. Capped — the tail is never needed. */
  nearest: Int32Array;
}

const NEAREST_CAP = 512;
const RANK_CACHE_LIMIT = 24;
const rankCache = new Map<number, RankTable>();

function computeRanks(target: number): RankTable {
  scoreAgainst(target, scratch);

  const order = new Int32Array(LEXICON_SIZE);
  for (let i = 0; i < LEXICON_SIZE; i++) order[i] = i;

  // Sort by score desc, then alphabetically so ties are stable across runs.
  const scores = scratch;
  const sorted = Array.from(order).sort((a, b) => {
    const d = scores[b] - scores[a];
    if (d !== 0) return d;
    return pack.words[a] < pack.words[b] ? -1 : 1;
  });

  const ranks = new Int32Array(LEXICON_SIZE);
  for (let i = 0; i < sorted.length; i++) ranks[sorted[i]] = i + 1;

  const nearest = Int32Array.from(sorted.slice(0, NEAREST_CAP));
  return { ranks, nearest };
}

function tableFor(target: number): RankTable {
  const hit = rankCache.get(target);
  if (hit) {
    // Refresh recency.
    rankCache.delete(target);
    rankCache.set(target, hit);
    return hit;
  }
  const table = computeRanks(target);
  rankCache.set(target, table);
  if (rankCache.size > RANK_CACHE_LIMIT) {
    const oldest = rankCache.keys().next().value;
    if (oldest !== undefined) rankCache.delete(oldest);
  }
  return table;
}

export function rankOf(guessIndex: number, targetIndex: number): number {
  return tableFor(targetIndex).ranks[guessIndex];
}

/** The k nearest words to a target, nearest first (the target itself is [0]). */
export function nearestIndices(targetIndex: number, k: number): Int32Array {
  const nearest = tableFor(targetIndex).nearest;
  return k >= nearest.length ? nearest : nearest.subarray(0, k);
}

export function nearestWords(targetIndex: number, n: number): string[] {
  const near = nearestIndices(targetIndex, n + 1);
  const out: string[] = [];
  for (let i = 1; i < near.length && out.length < n; i++) out.push(pack.words[near[i]]);
  return out;
}

/* ------------------------------------------------------------------ */
/* Bands and unlocks, as fractions so they scale with the lexicon       */
/* ------------------------------------------------------------------ */

const scaled = (fraction: number) => Math.max(1, Math.round(LEXICON_SIZE * fraction));

export const BAND_CUTOFFS: { band: Band; maxRank: number }[] = [
  { band: 'exact', maxRank: 1 },
  { band: 'burning', maxRank: scaled(0.0004) },
  { band: 'hot', maxRank: scaled(0.0027) },
  { band: 'warm', maxRank: scaled(0.013) },
  { band: 'cool', maxRank: scaled(0.066) },
  { band: 'cold', maxRank: scaled(0.33) },
  { band: 'frozen', maxRank: Number.MAX_SAFE_INTEGER },
];


export function bandForRank(rank: number): Band {
  for (const c of BAND_CUTOFFS) if (rank <= c.maxRank) return c.band;
  return 'frozen';
}

export const UNLOCK_RANKS = {
  compass: scaled(0.4),
  link: scaled(0.08),
  domain: scaled(0.04),
  length: scaled(0.025),
  definition: scaled(0.01),
  hits: scaled(0.008),
  nears: scaled(0.0025),
  initial: scaled(0.0004),
} as const;

export function unlocksFor(rank: number) {
  const list: (keyof typeof UNLOCK_RANKS)[] = [];
  for (const key of Object.keys(UNLOCK_RANKS) as (keyof typeof UNLOCK_RANKS)[]) {
    if (rank <= UNLOCK_RANKS[key]) list.push(key);
  }
  return list;
}

/* ------------------------------------------------------------------ */
/* Letter feedback                                                     */
/* ------------------------------------------------------------------ */

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
  if (!showNears) return marks.map((m) => (m === 'hit' ? 'hit' : 'hidden'));

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

/* ------------------------------------------------------------------ */
/* Meaning: definitions, domains, shared concepts                      */
/* ------------------------------------------------------------------ */

/**
 * The sense a player most likely means, by corpus frequency.
 *
 * Using the first sense in the file would mean reading "add" as the attention
 * disorder (nouns are parsed before verbs) — so every definition, domain and
 * part of speech the game shows is anchored on the dominant sense instead.
 */
const dominantSense = new Int32Array(LEXICON_SIZE).fill(-1);
{
  for (let w = 0; w < LEXICON_SIZE; w++) {
    const start = pack.wordSynOffsets[w];
    const weights = senseWeightsFor(w);
    let bestWeight = -1;
    for (let i = 0; i < weights.length; i++) {
      if (weights[i] > bestWeight) {
        bestWeight = weights[i];
        dominantSense[w] = pack.wordSynValues[start + i];
      }
    }
  }
}

function primarySynset(word: number): number | null {
  const s = dominantSense[word];
  return s < 0 ? null : s;
}

export function definitionOf(word: number): string {
  const s = primarySynset(word);
  return s === null ? '' : pack.glosses[s];
}

export function posOf(word: number): string {
  const s = primarySynset(word);
  return s === null ? '' : POS_NAME[pack.synPos[s]] ?? '';
}

export function domainOf(word: number): string {
  const s = primarySynset(word);
  return s === null ? '' : domainAt(pack.synLex[s]).label;
}

export function revealedOf(word: number): Revealed {
  return { word: pack.words[word], definition: definitionOf(word), domain: domainOf(word) };
}

const synsetName = (s: number): string | null => {
  const head = pack.synHead[s];
  return head === 0xffffffff ? null : pack.words[head];
};

/**
 * The most specific concept two words share.
 *
 * "Most specific" means the shared ancestor with the highest idf — the one
 * fewest other words have. That is what turns a rank into an explanation.
 */
export function sharedConcept(a: number, b: number): string | null {
  const mine = new Map<number, number>();
  for (let k = featureOffsets[a]; k < featureOffsets[a + 1]; k++) {
    mine.set(featureIds[k], featureWeights[k]);
  }

  const shared: { feature: number; score: number }[] = [];
  for (let k = featureOffsets[b]; k < featureOffsets[b + 1]; k++) {
    const f = featureIds[k];
    const other = mine.get(f);
    if (other === undefined) continue;
    // Both sides weight it highly => specific, and central to both meanings.
    shared.push({ feature: f, score: Math.min(other, featureWeights[k]) });
  }
  shared.sort((x, y) => y.score - x.score);

  // Walk down the candidates rather than giving up on the first: the strongest
  // shared synset is often one WordNet only names with a phrase.
  for (const { feature } of shared.slice(0, 12)) {
    // A shared top-level concept ("entity") is technically true and useless.
    if (postingOffsets[feature + 1] - postingOffsets[feature] > LEXICON_SIZE * 0.12) continue;
    const name = synsetName(feature);
    if (!name) continue;
    if (name === pack.words[a] || name === pack.words[b]) continue;
    return name;
  }
  return null;
}

/** Blank out the answer's own words so the definition hints without spoiling. */
export function redactedDefinition(target: number): string {
  const definition = definitionOf(target);
  if (!definition) return '';
  const word = pack.words[target];
  const stem = word.length > 4 ? word.slice(0, Math.max(4, word.length - 2)) : word;
  return definition.replace(new RegExp(`\\b${stem}[a-z]*\\b`, 'gi'), '▮▮▮');
}

/* ------------------------------------------------------------------ */
/* Compass                                                             */
/* ------------------------------------------------------------------ */

/** Axis values per word, averaged over its senses' domains. */
const axisValues = new Float32Array(LEXICON_SIZE * AXES.length);
{
  for (let w = 0; w < LEXICON_SIZE; w++) {
    const start = pack.wordSynOffsets[w];
    const senseWeights = Float64Array.from(senseWeightsFor(w));
    const end = start + senseWeights.length;
    let totalWeight = 0;
    const sums = new Float64Array(AXES.length);

    for (let s = start; s < end; s++) {
      const synset = pack.wordSynValues[s];
      const weight = senseWeights[s - start];
      const domain = domainAt(pack.synLex[synset]);
      totalWeight += weight;
      AXES.forEach((axis, i) => {
        const v =
          axis === 'specificity'
            ? Math.min(1, synDepth[synset] / 12)
            : (domain.axes[axis] ?? 0.5);
        sums[i] += v * weight;
      });
    }
    const base = w * AXES.length;
    for (let i = 0; i < AXES.length; i++) {
      axisValues[base + i] = totalWeight > 0 ? sums[i] / totalWeight : 0.5;
    }
  }
}

const COMPASS_MIN_DELTA = 0.17;

export function compassFor(
  guessIndex: number,
  targetIndex: number,
  rank: number,
): Compass | undefined {
  if (rank > UNLOCK_RANKS.compass) return undefined;

  const g = guessIndex * AXES.length;
  const t = targetIndex * AXES.length;
  let bestAxis: Axis | null = null;
  let bestDelta = 0;

  for (let i = 0; i < AXES.length; i++) {
    const delta = axisValues[t + i] - axisValues[g + i];
    if (Math.abs(delta) > Math.abs(bestDelta)) {
      bestDelta = delta;
      bestAxis = AXES[i];
    }
  }
  if (!bestAxis || Math.abs(bestDelta) < COMPASS_MIN_DELTA) return undefined;

  const direction: 1 | -1 = bestDelta > 0 ? 1 : -1;
  return {
    axis: bestAxis,
    direction,
    strength: Math.min(1, Math.abs(bestDelta) / 0.6),
    text: AXIS_PHRASES[bestAxis][direction > 0 ? 1 : 0],
  };
}

/** Everything the guesser learns beyond the bare rank. */
export function insightFor(guessIndex: number, targetIndex: number, rank: number): GuessInsight {
  const insight: GuessInsight = {
    sense: definitionOf(guessIndex) || undefined,
    pos: posOf(guessIndex) || undefined,
  };
  if (rank <= UNLOCK_RANKS.link) insight.link = sharedConcept(guessIndex, targetIndex) ?? undefined;
  if (rank <= UNLOCK_RANKS.domain) insight.domain = domainOf(targetIndex) || undefined;
  if (rank <= UNLOCK_RANKS.definition) insight.definition = redactedDefinition(targetIndex) || undefined;
  return insight;
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

/**
 * Whether a word makes a fair answer.
 *
 * Every word in the lexicon can be *guessed*, but only nouns and verbs make
 * good targets. WordNet gives adjectives only loose "similar to" clusters and
 * adverbs almost nothing, so words like `false` or `upstairs` sit in a part of
 * the space with no gradient — there is no "getting warmer" to follow, and
 * simulated play confirmed they are effectively unsolvable. Requiring the
 * dominant sense to be a noun or verb sitting at least three levels down the
 * hierarchy keeps answers in the well-connected core.
 */
const answerable = new Uint8Array(LEXICON_SIZE);
{
  for (let w = 0; w < LEXICON_SIZE; w++) {
    const dominant = dominantSense[w];
    if (dominant < 0) continue;
    const pos = pack.synPos[dominant];
    // Nouns and verbs only, deep enough to have a gradient, and not a name.
    if ((pos === 0 || pos === 1) && synDepth[dominant] >= 3 && !pack.synProper[dominant]) {
      answerable[w] = 1;
    }
  }
}

/** Words eligible to be answers, by difficulty. Indexed once at boot. */
const byTier: number[][] = [[], [], [], []];
for (let w = 0; w < LEXICON_SIZE; w++) {
  if (answerable[w]) byTier[pack.tiers[w]].push(w);
}

function answerPool(difficulty: 1 | 2 | 3): number[] {
  const pool: number[] = [];
  for (let t = 1; t <= difficulty; t++) pool.push(...byTier[t]);
  return pool;
}
const poolCache = new Map<number, number[]>();
function pooledAnswers(difficulty: 1 | 2 | 3): number[] {
  let p = poolCache.get(difficulty);
  if (!p) {
    p = answerPool(difficulty);
    poolCache.set(difficulty, p);
  }
  return p;
}

export function pickTarget(rng: Rng, difficulty: 1 | 2 | 3): number {
  const pool = pooledAnswers(difficulty);
  return pool[Math.floor(rng() * pool.length)];
}

/**
 * Drift lands in this rank window. Wide enough that the answer genuinely moves
 * rather than swapping to a synonym, close enough that the board's existing
 * information is still worth something.
 */
export const DRIFT_WINDOW = { min: 4, max: 60 };

export function driftFrom(
  currentIndex: number,
  rng: Rng,
  difficulty: 1 | 2 | 3,
  exclude: Set<number>,
): { index: number; similarity: number } {
  const near = nearestIndices(currentIndex, DRIFT_WINDOW.max + 1);
  const candidates: number[] = [];

  for (let pos = DRIFT_WINDOW.min; pos < near.length; pos++) {
    const idx = near[pos];
    if (exclude.has(idx)) continue;
    if (pack.tiers[idx] > difficulty || !answerable[idx]) continue;
    candidates.push(idx);
  }
  if (candidates.length === 0) {
    // Neighbourhood exhausted: accept any unused near word regardless of tier.
    for (let pos = 1; pos < near.length; pos++) {
      if (!exclude.has(near[pos]) && answerable[near[pos]]) candidates.push(near[pos]);
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
  return {
    size: LEXICON_SIZE,
    synsets: SYNSET_COUNT,
    answerable: byTier[1].length + byTier[2].length + byTier[3].length,
    tiers: { 1: byTier[1].length, 2: byTier[2].length, 3: byTier[3].length } as Record<number, number>,
    features: featureIds.length,
    buildMs,
  };
}
