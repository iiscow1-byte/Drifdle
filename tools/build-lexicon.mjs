#!/usr/bin/env node
/**
 * Build Driftle's lexicon from WordNet.
 *
 * Driftle used to ship a 768-word hand-authored taxonomy. That was legible but
 * obviously not scalable, so the semantic space now comes from WordNet 3.1:
 * ~100k single-word lemmas, a real hypernym tree, and a human-written gloss for
 * every sense. The hypernym tree is what makes proximity explainable ("your
 * guess and the answer are both kinds of carnivore"), and the glosses are what
 * make the hint ladder worth reading.
 *
 * Output: server/src/game/lexicon/data/lexicon.bin (gzipped, ~4MB).
 * Run: npm run build:lexicon
 *
 * WordNet 3.1 (c) Princeton University — see WORDNET-LICENSE in that folder.
 */
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const DICT = require('wordnet-db').path;
const OUT_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../server/src/game/lexicon/data',
);

const POS_FILES = [
  ['noun', 'n'],
  ['verb', 'v'],
  ['adj', 'a'],
  ['adv', 'r'],
];
const POS_CODE = { n: 0, v: 1, a: 2, r: 3 };

/** Only single, plainly-spelled words: no phrases, hyphens, digits or accents. */
const WORD_RE = /^[a-z]{3,14}$/;

/* ------------------------------------------------------------------ */
/* 1. Parse the synset data files                                      */
/* ------------------------------------------------------------------ */

/** key `${pos}${offset}` -> index into the synset arrays */
const synsetKeyToIndex = new Map();
const synsets = []; // { key, pos, lexFile, words[], hyperKeys[], gloss }

function parseData(posName, posLetter) {
  const text = readFileSync(join(DICT, `data.${posName}`), 'utf8');
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('  ')) continue;

    const barAt = line.indexOf('|');
    const head = (barAt >= 0 ? line.slice(0, barAt) : line).trim().split(/\s+/);
    const rawGloss = barAt >= 0 ? line.slice(barAt + 1).trim() : '';

    const offset = head[0];
    const lexFile = Number(head[1]);
    // head[2] is ss_type; adjective satellites ('s') behave as adjectives here.
    const wordCount = parseInt(head[3], 16);

    const words = [];
    let i = 4;
    for (let w = 0; w < wordCount; w++) {
      words.push(head[i].toLowerCase());
      i += 2; // skip lex_id
    }

    const pointerCount = Number(head[i++]);
    const hyperKeys = [];
    for (let p = 0; p < pointerCount; p++) {
      const symbol = head[i];
      const targetOffset = head[i + 1];
      const targetPos = head[i + 2];
      i += 4; // symbol, offset, pos, source/target

      // @ hypernym, @i instance hypernym: the "is a kind of" spine.
      // & similar-to carries adjective clusters, which have no hypernyms.
      if (symbol === '@' || symbol === '@i' || symbol === '&') {
        hyperKeys.push(`${targetPos}${targetOffset}`);
      }
    }

    // Glosses are "definition; \"example\"; \"example\"". Keep the definition.
    let gloss = rawGloss.split('; "')[0].trim();
    if (gloss.length > 180) gloss = `${gloss.slice(0, 177)}...`;

    const key = `${posLetter}${offset}`;
    synsetKeyToIndex.set(key, synsets.length);
    synsets.push({ key, pos: POS_CODE[posLetter], lexFile, words, hyperKeys, gloss });
  }
}

for (const [name, letter] of POS_FILES) parseData(name, letter);
console.log(`synsets:        ${synsets.length.toLocaleString()}`);

/* ------------------------------------------------------------------ */
/* 2. Sense frequencies from the tagged corpus counts                  */
/* ------------------------------------------------------------------ */

/** lemma -> total tag count across all its senses. A real frequency signal. */
const lemmaTagCount = new Map();
/**
 * `lemma|synsetOffset` -> how often that *specific sense* appears in the tagged
 * corpus. This is what stops `thunder` reading as the slang for heroin and
 * `ocean` reading as "a large indefinite quantity": those senses are attested
 * zero times, while the obvious ones are attested constantly.
 */
const senseTagCount = new Map();
{
  const text = readFileSync(join(DICT, 'index.sense'), 'utf8');
  for (const line of text.split('\n')) {
    if (!line) continue;
    const parts = line.split(' ');
    const lemma = parts[0].split('%')[0].toLowerCase();
    const offset = parts[1];
    const tagCount = Number(parts[3] ?? 0);
    senseTagCount.set(`${lemma}|${offset}`, tagCount);
    if (tagCount) lemmaTagCount.set(lemma, (lemmaTagCount.get(lemma) ?? 0) + tagCount);
  }
}
console.log(`tagged lemmas:  ${lemmaTagCount.size.toLocaleString()}`);

/* ------------------------------------------------------------------ */
/* 3. Words, in the sense order the index files give                   */
/* ------------------------------------------------------------------ */

/** word -> ordered list of synset indices (sense 1 first) */
const wordSenses = new Map();
/** word -> corpus tag count per sense, parallel to wordSenses */
const wordSenseTags = new Map();

for (const [posName, posLetter] of POS_FILES) {
  const text = readFileSync(join(DICT, `index.${posName}`), 'utf8');
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('  ')) continue;
    const parts = line.trim().split(/\s+/);
    const lemma = parts[0].toLowerCase();
    if (!WORD_RE.test(lemma)) continue;

    const synsetCount = Number(parts[2]);
    const pointerCount = Number(parts[3]);
    // lemma pos synset_cnt p_cnt [ptrs...] sense_cnt tagsense_cnt offsets...
    const offsets = parts.slice(4 + pointerCount + 2);

    let list = wordSenses.get(lemma);
    let tags = wordSenseTags.get(lemma);
    if (!list) {
      list = [];
      tags = [];
      wordSenses.set(lemma, list);
      wordSenseTags.set(lemma, tags);
    }
    for (let s = 0; s < synsetCount && s < offsets.length; s++) {
      const idx = synsetKeyToIndex.get(`${posLetter}${offsets[s]}`);
      if (idx !== undefined && !list.includes(idx)) {
        list.push(idx);
        tags.push(senseTagCount.get(`${lemma}|${offsets[s]}`) ?? 0);
      }
    }
  }
}

const words = [...wordSenses.keys()].filter((w) => wordSenses.get(w).length > 0).sort();
console.log(`words:          ${words.length.toLocaleString()}`);

/* ------------------------------------------------------------------ */
/* 4. Frequency tiers — which words are fair to use as answers         */
/* ------------------------------------------------------------------ */

/**
 * Tier 1 words are common enough that anyone can be expected to reach them;
 * tier 3 is the long tail. Corpus tag count is the primary signal, with sense
 * count as a tie-breaker (polysemy tracks familiarity closely).
 */
const scored = words.map((w) => {
  const tag = lemmaTagCount.get(w) ?? 0;
  const senses = wordSenses.get(w).length;
  return { w, score: tag * 10 + senses };
});
scored.sort((a, b) => b.score - a.score || a.w.localeCompare(b.w));

const tierOf = new Map();
scored.forEach((entry, rank) => {
  // ~3k / ~12k / rest. Tuned so tier 1 answers are genuinely everyday words.
  tierOf.set(entry.w, rank < 3000 ? 1 : rank < 12000 ? 2 : 3);
});
const tierCounts = { 1: 0, 2: 0, 3: 0 };
for (const t of tierOf.values()) tierCounts[t]++;
console.log(`tiers:          ${JSON.stringify(tierCounts)}`);
console.log(`tier 1 sample:  ${scored.slice(0, 14).map((s) => s.w).join(', ')}`);
console.log(`tier 2 sample:  ${scored.slice(3000, 3012).map((s) => s.w).join(', ')}`);

/* ------------------------------------------------------------------ */
/* 5. Encode                                                           */
/* ------------------------------------------------------------------ */

const wordIndex = new Map(words.map((w, i) => [w, i]));

// word -> synsets (CSR)
const wordSynOffsets = new Uint32Array(words.length + 1);
const wordSynValues = [];
const wordSynTags = [];
words.forEach((w, i) => {
  wordSynOffsets[i] = wordSynValues.length;
  const tags = wordSenseTags.get(w) ?? [];
  wordSenses.get(w).forEach((s, k) => {
    wordSynValues.push(s);
    wordSynTags.push(Math.min(65535, tags[k] ?? 0));
  });
});
wordSynOffsets[words.length] = wordSynValues.length;

// synset -> hypernyms (CSR)
const synHypOffsets = new Uint32Array(synsets.length + 1);
const synHypValues = [];
synsets.forEach((s, i) => {
  synHypOffsets[i] = synHypValues.length;
  for (const key of s.hyperKeys) {
    const idx = synsetKeyToIndex.get(key);
    if (idx !== undefined) synHypValues.push(idx);
  }
});
synHypOffsets[synsets.length] = synHypValues.length;

const synLex = new Uint8Array(synsets.map((s) => s.lexFile));
const synPos = new Uint8Array(synsets.map((s) => s.pos));

// The first word of a synset is its canonical name, used in hint text.
const synHead = new Uint32Array(
  synsets.map((s) => {
    const head = s.words.find((w) => wordIndex.has(w));
    return head === undefined ? 0xffffffff : wordIndex.get(head);
  }),
);

const freq = new Uint32Array(words.map((w) => lemmaTagCount.get(w) ?? 0));
const tiers = new Uint8Array(words.map((w) => tierOf.get(w)));

function packStrings(list) {
  const blob = Buffer.from(list.join('\n'), 'utf8');
  const offsets = new Uint32Array(list.length + 1);
  let at = 0;
  list.forEach((s, i) => {
    offsets[i] = at;
    at += Buffer.byteLength(s, 'utf8') + 1; // +1 for the separator
  });
  offsets[list.length] = blob.length + 1;
  return { blob, offsets };
}

const wordBlob = packStrings(words);
const glossBlob = packStrings(synsets.map((s) => s.gloss));

const chunks = [];
let cursor = 0;
function push(buf) {
  chunks.push(buf);
  cursor += buf.length;
  const pad = (4 - (cursor % 4)) % 4;
  if (pad) {
    chunks.push(Buffer.alloc(pad));
    cursor += pad;
  }
}
function pushU32(...values) {
  const b = Buffer.alloc(values.length * 4);
  values.forEach((v, i) => b.writeUInt32LE(v >>> 0, i * 4));
  push(b);
}
const bytesOf = (typed) => Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);

push(Buffer.from('DRFTLX04', 'ascii'));
pushU32(words.length, synsets.length, wordSynValues.length, synHypValues.length);
pushU32(wordBlob.blob.length, glossBlob.blob.length);

push(wordBlob.blob);
push(bytesOf(wordBlob.offsets));
push(glossBlob.blob);
push(bytesOf(glossBlob.offsets));
push(bytesOf(wordSynOffsets));
push(bytesOf(Uint32Array.from(wordSynValues)));
push(bytesOf(Uint16Array.from(wordSynTags)));
push(bytesOf(synHypOffsets));
push(bytesOf(Uint32Array.from(synHypValues)));
push(bytesOf(synLex));
push(bytesOf(synPos));
push(bytesOf(synHead));
push(bytesOf(freq));
push(bytesOf(tiers));

const raw = Buffer.concat(chunks);
const packed = gzipSync(raw, { level: 9 });

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'lexicon.bin'), packed);

console.log(`\nraw:            ${(raw.length / 1048576).toFixed(2)} MB`);
console.log(`gzipped:        ${(packed.length / 1048576).toFixed(2)} MB`);
console.log(`written to      ${join(OUT_DIR, 'lexicon.bin')}`);
