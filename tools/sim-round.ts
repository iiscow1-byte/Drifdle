/**
 * Simulate a Commons round with three bots that play like real people:
 * each bot walks toward the answer by guessing near its best-known word.
 * Verifies drift, rescoring, anchoring, win detection and scoring.
 *
 * Run: node --experimental-strip-types tools/sim-round.ts
 */
import { Round } from '../server/src/game/engine.ts';
import { LEXICON, orderFor, entryAt, mulberry32 } from '../server/src/game/lexicon/index.ts';

const rng = mulberry32(Number(process.argv[2] ?? 7));

const round = new Round({
  seed: `sim:${process.argv[2] ?? 7}`,
  difficulty: 2,
  maxDrifts: 3,
  playerCount: 3,
});

const bots = [
  { id: 'a', name: 'Ada' },
  { id: 'b', name: 'Bo' },
  { id: 'c', name: 'Cy' },
];

console.log(`hidden target: ${round.target}  (drift cap ${round.cap})`);

/** A bot's move: explore randomly until warm, then hill-climb from its best. */
function chooseWord(botId: string): string {
  const mine = round.guesses.filter((g) => g.playerId === botId);
  const best = mine.reduce<null | (typeof mine)[number]>(
    (acc, g) => (acc === null || g.rank < acc.rank ? g : acc),
    null,
  );

  if (!best || best.rank > 300) {
    for (let i = 0; i < 50; i++) {
      const w = LEXICON[Math.floor(rng() * LEXICON.length)].word;
      if (!round.hasGuessed(w)) return w;
    }
  } else {
    // Neighbours of my best guess: the same move a human makes.
    const order = orderFor(best.wordIndex);
    for (let pos = 1; pos < 60; pos++) {
      const w = entryAt(order[pos]).word;
      if (!round.hasGuessed(w)) return w;
    }
  }
  return LEXICON.find((e) => !round.hasGuessed(e.word))!.word;
}

let turn = 0;
let lastEpoch = 0;
const startedAt = Date.now();

while (!round.solved && turn < 400) {
  const bot = bots[turn % bots.length];
  turn++;
  const word = chooseWord(bot.id);
  const out = round.submit(bot.id, bot.name, word, startedAt + turn * 1000);
  if (!out.ok) continue;

  const flag = out.solved ? '  <<< SOLVED' : '';
  console.log(
    `${String(turn).padStart(3)} ${bot.name.padEnd(4)} ${word.padEnd(12)} rank ${String(out.guess.rank).padStart(4)} ${out.guess.band.padEnd(8)} charge ${round.charge}/${round.cap}${flag}`,
  );

  if (out.drift) {
    console.log(`      >>> ${out.drift.headline}`);
    console.log(
      `      >>> target moved (similarity ${out.drift.similarity.toFixed(3)}), now "${round.target}", epoch ${round.epoch}, anchored=${round.anchored}`,
    );
    if (round.epoch !== lastEpoch) {
      const sample = round.guesses.slice(-4).map((g) => `${g.word}:${g.rank}`);
      console.log(`      >>> rescored tail: ${sample.join(' ')}`);
      lastEpoch = round.epoch;
    }
  }
}

console.log('\n--- result ---');
console.log('winner       ', round.winnerName ?? '(nobody)');
console.log('target       ', round.target);
console.log('chain        ', round.chainWords().join(' -> '));
console.log('drifts       ', round.drifts.length, '| anchored:', round.anchored);
console.log('total guesses', round.guesses.length);
console.log('neighbourhood', round.neighbourhood(6).join(', '));
console.log('\nscores:');
for (const b of bots) {
  console.log(
    `  ${b.name.padEnd(4)} ${String(round.scoreFor(b.id, 300)).padStart(5)} pts  best rank ${round.bestRankFor(b.id)}  guesses ${round.guessCountFor(b.id)}`,
  );
}
console.log('\nawards:');
for (const a of round.awards()) console.log(`  ${a.label.padEnd(13)} ${a.playerName} — ${a.detail} (+${a.points})`);
