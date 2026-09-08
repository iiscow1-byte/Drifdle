#!/usr/bin/env node
/**
 * tsc compiles .ts and ignores everything else, so the lexicon binary has to be
 * copied next to the compiled output by hand. Without this the server builds
 * fine and then dies at boot with "lexicon.bin not found".
 */
import { cpSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const assets = [['server/src/game/lexicon/data', 'server/dist/server/src/game/lexicon/data']];

let copied = 0;
for (const [from, to] of assets) {
  const src = join(root, from);
  if (!existsSync(src)) {
    console.error(
      `[assets] missing ${from}. Generate the lexicon with \`npm run build:lexicon\` before building.`,
    );
    process.exit(1);
  }
  cpSync(src, join(root, to), { recursive: true });
  copied += statSync(join(src, 'lexicon.bin')).size;
}

console.log(`[assets] copied ${(copied / 1048576).toFixed(2)} MB alongside the compiled server`);
