/**
 * Eyeball the semantic space. Run: npm run lexicon:check
 * If these neighbourhoods look wrong, the game will feel wrong.
 */
import {
  LEXICON,
  lexiconStats,
  lookup,
  nearestWords,
  rankOf,
  bandForRank,
  compassFor,
  driftFrom,
  mulberry32,
} from '../server/src/game/lexicon/index.ts';

const stats = lexiconStats();
console.log('lexicon:', stats);

const probes = ['wolf', 'ocean', 'grief', 'computer', 'bread', 'castle', 'time', 'gold', 'dragon', 'rain'];
console.log('\n--- nearest neighbours ---');
for (const p of probes) {
  const e = lookup(p);
  if (!e) {
    console.log(`${p}: MISSING`);
    continue;
  }
  console.log(`${p.padEnd(10)} -> ${nearestWords(e.index, 8).join(', ')}`);
}

console.log('\n--- sample probe ranks against target "wolf" ---');
const target = lookup('wolf')!;
for (const g of ['fox', 'dog', 'forest', 'loyalty', 'moon', 'bread', 'algorithm', 'fear']) {
  const e = lookup(g)!;
  const r = rankOf(e.index, target.index);
  const c = compassFor(e.index, target.index, r);
  console.log(`  ${g.padEnd(10)} rank ${String(r).padStart(4)}  ${bandForRank(r).padEnd(8)} ${c ? c.text : ''}`);
}

console.log('\n--- drift chain from "wolf" ---');
const rng = mulberry32(12345);
let cur = target.index;
const used = new Set([cur]);
const chain = [LEXICON[cur].word];
for (let i = 0; i < 4; i++) {
  const d = driftFrom(cur, rng, 3, used);
  cur = d.index;
  used.add(cur);
  chain.push(`${LEXICON[cur].word} (sim ${d.similarity.toFixed(2)})`);
}
console.log('  ' + chain.join(' -> '));

console.log('\n--- rank distribution sanity (target "ocean") ---');
const oc = lookup('ocean')!;
const buckets = new Map<string, number>();
for (const e of LEXICON) {
  const b = bandForRank(rankOf(e.index, oc.index));
  buckets.set(b, (buckets.get(b) ?? 0) + 1);
}
console.log('  ', Object.fromEntries(buckets));
