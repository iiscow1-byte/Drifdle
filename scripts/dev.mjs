#!/usr/bin/env node
/**
 * Development entrypoint — with a production safety net.
 *
 * Locally this runs the API and the Vite client side by side, exactly as
 * before.
 *
 * The safety net exists because `npm run dev` is an easy thing to leave in a
 * platform's start command by accident, and the resulting failure is opaque:
 * dev tooling lives in devDependencies, which production installs omit, so the
 * container dies on a missing binary and restart-loops forever. Rather than
 * fail unreadably, we notice we are in production, say plainly what is
 * misconfigured, and run the real server instead.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isInstalled, resolveBin, runNode } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const self = import.meta.url;

const inProduction = process.env.NODE_ENV === 'production';
const hasDevTooling = isInstalled('concurrently', self) && isInstalled('vite', self);

if (inProduction || !hasDevTooling) {
  console.warn(
    [
      '',
      '  ⚠  `npm run dev` was invoked, but this looks like a production environment.',
      '',
      '     The dev servers need devDependencies (vite, tsx, concurrently), which',
      '     production installs omit. Running the production server instead so the',
      '     deploy stays up.',
      '',
      '     To silence this, set the start command to `npm start` — or clear it and',
      '     let the Dockerfile decide.',
      '',
    ].join('\n'),
  );
  runNode(join(here, 'start.mjs'), { cwd: root });
} else {
  runNode(resolveBin('concurrently', self), {
    cwd: root,
    args: ['-n', 'server,client', '-c', 'cyan,magenta', 'npm:dev:server', 'npm:dev:client'],
  });
}
