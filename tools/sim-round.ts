/**
 * Simulate a Commons round with three bots that play like people: broad probes
 * first, then semantic descent. Verifies drift, rescoring, anchoring, win
 * detection, scoring and the hint ladder against the full 75k lexicon.
 *
 * Run: npm run test:sim [seed]
 */
import { Round } from '../server/src/game/engine.ts';
import { entryAt, mulberry32, lookup } from '../server/src/game/lexicon/index.ts';
import { chooseWord, learn, newBot, relearn, type BotKnowledge } from './bot.ts';

const seed = process.argv[2] ?? '7';
const rng = mulberry32(Number(seed) || 7);

const round = new Round({
  seed: `sim:${seed}`,
  difficulty: 2,
  maxDrifts: 3,
  playerCount: 3,
  sensitivity: 2,
});

const bots: { id: string; name: string; brain: BotKnowledge }[] = [
  { id: 'a', name: 'Ada', brain: newBot() },
  { id: 'b', name: 'Bo', brain: newBot() },
  { id: 'c', name: 'Cy', brain: newBot() },
];

console.log(`hidden target: ${round.target}  (${round.domain()})`);
console.log(`               ${round.definition()}`);
console.log(`drift cap ${round.cap}\n`);

const played = new Set<string>();
let turn = 0;
let lastEpoch = 0;
const startedAt = Date.now();

while (!round.solved && turn < 900) {
  const bot = bots[turn % bots.length];
  turn++;

  const word = chooseWord(bot.brain, played, rng);
  if (!word) break;
  played.add(word);

  const out = round.submit(bot.id, bot.name, word, startedAt + turn * 1000);
  if (!out.ok) continue;
  learn(bot.brain, word, out.guess.rank);

  const notable = out.solved || out.drift || out.guess.rank <= 400;
  if (notable) {
    const ins = out.private.insight;
    const extras = [
      ins.link ? `link:${ins.link}` : '',
      ins.domain ? `domain:${ins.domain}` : '',
      out.private.compass ? `"${out.private.compass.text}"` : '',
    ]
      .filter(Boolean)
      .join('  ');
    console.log(
      `${String(turn).padStart(3)} ${bot.name.padEnd(4)} ${word.padEnd(14)}` +
        ` rank ${String(out.guess.rank).padStart(6)} ${out.guess.band.padEnd(8)}` +
        ` charge ${round.charge}/${round.cap}${out.solved ? '  <<< SOLVED' : ''}`,
    );
    if (extras) console.log(`      ${extras}`);
  }

  if (out.drift) {
    console.log(`      >>> ${out.drift.headline}`);
    console.log(
      `      >>> now "${round.target}" (${round.domain()}), epoch ${round.epoch}, anchored=${round.anchored}`,
    );
    if (round.epoch !== lastEpoch) {
      lastEpoch = round.epoch;
      // Everyone's knowledge is stale after a drift.
      for (const b of bots) {
        relearn(
          b.brain,
          round.guesses.filter((g) => g.playerId === b.id).map((g) => [g.word, g.rank] as [string, number]),
        );
      }
    }
  }
}

console.log('\n--- result ---');
console.log('winner       ', round.winnerName ?? '(nobody)');
console.log('target       ', round.target);
console.log('definition   ', round.definition());
console.log('chain        ', round.chainWords().join(' -> '));
console.log('drifts       ', round.drifts.length, '| anchored:', round.anchored);
console.log('total guesses', round.guesses.length);
console.log('neighbourhood', round.neighbourhood(8).join(', '));

console.log('\nscores:');
for (const b of bots) {
  console.log(
    `  ${b.name.padEnd(4)} ${String(round.scoreFor(b.id, 300)).padStart(5)} pts` +
      `  best rank ${round.bestRankFor(b.id)}  guesses ${round.guessCountFor(b.id)}`,
  );
}
console.log('\nawards:');
for (const a of round.awards()) {
  console.log(`  ${a.label.padEnd(13)} ${a.playerName} — ${a.detail} (+${a.points})`);
}

if (!round.winnerId) {
  console.error('\nFAILED: nobody solved the round — the game may not be winnable.');
  process.exit(1);
}
console.log('\nOK: solvable by ordinary play.');
