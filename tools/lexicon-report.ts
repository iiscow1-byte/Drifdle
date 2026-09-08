/**
 * Eyeball the semantic space. Run: npm run check:lexicon
 * If these neighbourhoods look wrong, the game will feel wrong.
 */
import {
  LEXICON_SIZE,
  lexiconStats,
  lookup,
  nearestWords,
  rankOf,
  bandForRank,
  compassFor,
  insightFor,
  definitionOf,
  domainOf,
  sharedConcept,
  driftFrom,
  mulberry32,
  entryAt,
  UNLOCK_RANKS,
  BAND_CUTOFFS,
} from '../server/src/game/lexicon/index.ts';

console.log('lexicon:', lexiconStats());
console.log('bands:  ', BAND_CUTOFFS.map((b) => `${b.band}<=${b.maxRank === Number.MAX_SAFE_INTEGER ? 'inf' : b.maxRank}`).join(' '));
console.log('unlocks:', JSON.stringify(UNLOCK_RANKS));

const probes = ['wolf', 'ocean', 'grief', 'computer', 'bread', 'castle', 'winter', 'gold', 'guitar', 'thunder'];
console.log('\n--- nearest neighbours ---');
for (const p of probes) {
  const e = lookup(p);
  if (!e) { console.log(`${p}: MISSING`); continue; }
  console.log(`${p.padEnd(10)} -> ${nearestWords(e.index, 8).join(', ')}`);
}

console.log('\n--- definitions ---');
for (const p of ['wolf', 'grief', 'guitar']) {
  const e = lookup(p)!;
  console.log(`  ${p.padEnd(9)} (${domainOf(e.index)}) ${definitionOf(e.index)}`);
}

const target = lookup('wolf')!;
console.log(`\n--- probes against target "wolf" (of ${LEXICON_SIZE}) ---`);
for (const g of ['fox', 'dog', 'coyote', 'forest', 'loyalty', 'moon', 'bread', 'algorithm', 'fear']) {
  const e = lookup(g);
  if (!e) { console.log(`  ${g}: not in lexicon`); continue; }
  const r = rankOf(e.index, target.index);
  const c = compassFor(e.index, target.index, r);
  const link = sharedConcept(e.index, target.index);
  console.log(
    `  ${g.padEnd(10)} rank ${String(r).padStart(6)} ${bandForRank(r).padEnd(8)}` +
      ` link=${(link ?? '-').padEnd(14)} ${c ? c.text : ''}`,
  );
}

console.log('\n--- the hint ladder, closing in on "wolf" ---');
for (const g of ['algorithm', 'forest', 'mammal', 'coyote', 'fox']) {
  const e = lookup(g)!;
  const r = rankOf(e.index, target.index);
  const ins = insightFor(e.index, target.index, r);
  console.log(`  ${g} (rank ${r})`);
  if (ins.link) console.log(`     link:       both are kinds of ${ins.link}`);
  if (ins.domain) console.log(`     domain:     the answer is in ${ins.domain}`);
  if (ins.definition) console.log(`     definition: ${ins.definition}`);
}

console.log('\n--- drift chain from "wolf" ---');
const rng = mulberry32(12345);
let cur = target.index;
const used = new Set([cur]);
const chain = [entryAt(cur).word];
for (let i = 0; i < 4; i++) {
  const d = driftFrom(cur, rng, 2, used);
  cur = d.index;
  used.add(cur);
  chain.push(`${entryAt(cur).word} (sim ${d.similarity.toFixed(2)})`);
}
console.log('  ' + chain.join(' -> '));
