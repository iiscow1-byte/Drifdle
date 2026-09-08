#!/usr/bin/env node
/**
 * Entry point for the client workspace's `dev` and `start` scripts.
 *
 * Lives in scripts/ rather than client/ on purpose: the Docker runtime stage
 * copies scripts/ wholesale, so this file is always present in a deployed
 * image. Helper files sitting beside client/package.json are not, which is how
 * an earlier version of this guard turned into MODULE_NOT_FOUND.
 *
 * Behaviour:
 *   - Locally, with devDependencies installed, `dev` runs Vite as usual.
 *   - In production, or whenever Vite is absent, there is no dev server to run.
 *     Instead of restart-looping, we explain what is misconfigured and hand off
 *     to the production entrypoint so the deploy serves the game.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isInstalled, resolveBin, runNode } from './lib.mjs';

const mode = process.argv[2] === 'start' ? 'start' : 'dev';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const clientDir = join(root, 'client');
const clientManifest = join(clientDir, 'package.json');

const inProduction = process.env.NODE_ENV === 'production';
const canRunVite = isInstalled('vite', clientManifest);

if (mode === 'dev' && canRunVite && !inProduction) {
  runNode(resolveBin('vite', clientManifest), {
    cwd: clientDir,
    args: process.argv.slice(3),
  });
} else {
  console.warn(
    [
      '',
      '  ⚠  The Driftle client workspace was started as if it were a service.',
      '',
      '     The client is a static bundle that the API process serves — it is not',
      '     a service of its own' +
        (canRunVite ? '.' : ', and vite is not installed here.'),
      '',
      '     Starting the real Driftle server instead so the deploy stays up.',
      '',
      '     To fix this properly, in your platform settings:',
      '       Start Command:   npm start   (or clear it to use the Dockerfile)',
      '       Root Directory:  the repository root, not "client"',
      '',
    ].join('\n'),
  );

  const entry = join(here, 'start.mjs');
  if (!existsSync(entry)) {
    console.error(
      `  Could not find the production entrypoint at ${entry}. ` +
        'Run `npm start` from the repository root.',
    );
    process.exit(1);
  }
  runNode(entry, { cwd: root });
}
