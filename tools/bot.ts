/**
 * A bot that plays Driftle the way a person does.
 *
 * With a 75k-word lexicon, random guessing never converges — so the bot opens
 * with broad probes that partition the space (is it alive? man-made? an idea?),
 * then descends through the semantic neighbourhood of its best guess.
 *
 * The interesting part is the stall handling. Pure hill-climbing gets stuck in
 * local minima: a word at rank ~2000 has a 400-word neighbourhood that often
 * does not contain the answer, and the bot then burns its whole budget walking
 * a dead end. So it tracks whether it is still improving and, when it is not,
 * rotates to its next-best anchor and descends from there instead.
 *
 * That makes the simulations a real test of whether the game is winnable by a
 * sensible strategy, rather than a test of brute force.
 */
import { lookup, nearestIndices, entryAt } from '../server/src/game/lexicon/index.ts';

/** Broad, common words that between them touch most of the space. */
export const PROBES = [
  'animal', 'person', 'food', 'plant', 'machine', 'building', 'water', 'money',
  'feeling', 'idea', 'time', 'music', 'body', 'weather', 'colour', 'metal',
  'clothing', 'vehicle', 'tool', 'game', 'war', 'law', 'science', 'book',
  'family', 'city', 'mountain', 'fire', 'light', 'sound', 'movement', 'work',
  'bird', 'fish', 'tree', 'stone', 'cloth', 'drink', 'sleep', 'speech',
  'number', 'shape', 'disease', 'crime', 'party', 'school', 'road', 'star',
];

/** Give up on an anchor after this many guesses with no improvement. */
const STALL_LIMIT = 14;
/** Only descend once we are plausibly in the right region. */
const DESCENT_THRESHOLD = 8000;

export interface BotKnowledge {
  /** word -> rank, as the bot currently understands it. */
  ranks: Map<string, number>;
  probeAt: number;
  /** Anchors already exhausted, so we do not walk back into them. */
  spent: Set<string>;
  bestSeen: number;
  sinceImprovement: number;
}

export function newBot(): BotKnowledge {
  return { ranks: new Map(), probeAt: 0, spent: new Set(), bestSeen: Infinity, sinceImprovement: 0 };
}

/** Anchors worth descending from, best first, skipping exhausted ones. */
function anchors(bot: BotKnowledge): { word: string; rank: number }[] {
  return [...bot.ranks.entries()]
    .filter(([w, r]) => r <= DESCENT_THRESHOLD && !bot.spent.has(w))
    .map(([word, rank]) => ({ word, rank }))
    .sort((a, b) => a.rank - b.rank);
}

/**
 * Choose the next word to play.
 * `played` is the set of words already on the board (nobody may repeat them).
 */
export function chooseWord(
  bot: BotKnowledge,
  played: Set<string>,
  rng: () => number = Math.random,
): string | null {
  const options = anchors(bot);

  if (options.length > 0) {
    // Stalled on the current anchor: retire it and try the next one.
    if (bot.sinceImprovement >= STALL_LIMIT) {
      bot.spent.add(options[0].word);
      bot.sinceImprovement = 0;
      return chooseWord(bot, played, rng);
    }

    const anchor = options[0];
    const near = nearestIndices(lookup(anchor.word)!.index, 400);
    // Nearest first: a random pick among neighbours wastes guesses.
    for (let i = 1; i < near.length; i++) {
      const w = entryAt(near[i]).word;
      if (!played.has(w)) return w;
    }
    // Neighbourhood fully played out.
    bot.spent.add(anchor.word);
    bot.sinceImprovement = 0;
  }

  // Otherwise keep probing the broad categories.
  while (bot.probeAt < PROBES.length) {
    const w = PROBES[bot.probeAt++];
    if (!played.has(w) && lookup(w)) return w;
  }

  // Probes exhausted and still cold: widen from anything we have left.
  for (const anchor of options) {
    const near = nearestIndices(lookup(anchor.word)!.index, 400);
    for (let i = 1; i < near.length; i++) {
      const w = entryAt(near[i]).word;
      if (!played.has(w)) return w;
    }
  }
  return null;
}

export function learn(bot: BotKnowledge, word: string, rank: number) {
  bot.ranks.set(word, rank);
  if (rank < bot.bestSeen) {
    bot.bestSeen = rank;
    bot.sinceImprovement = 0;
  } else {
    bot.sinceImprovement++;
  }
}

/** After a drift every rank the bot holds is stale; replace them wholesale. */
export function relearn(bot: BotKnowledge, fresh: Iterable<[string, number]>) {
  bot.ranks = new Map(fresh);
  bot.spent.clear();
  bot.bestSeen = Math.min(...[...bot.ranks.values()], Infinity);
  bot.sinceImprovement = 0;
}
