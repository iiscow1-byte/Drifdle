#!/usr/bin/env node
/**
 * Production entrypoint.
 *
 * This exists because a misconfigured deploy is the single most likely way to
 * break Driftle, and the failure modes are all cryptic ("vite: not found").
 * So `npm start` is deliberately forgiving: it finds the compiled server,
 * builds it first if a platform skipped the build step, and if it genuinely
 * cannot run, it says exactly what is wrong and what to do about it.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NPM, runNode } from './lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(root, 'server', 'dist', 'server', 'src', 'index.js');
const serverSource = join(root, 'server', 'src', 'index.ts');
const clientIndex = join(root, 'client', 'dist', 'index.html');

function fail(lines) {
  console.error(`\n  Driftle could not start.\n`);
  for (const line of lines) console.error(`  ${line}`);
  console.error('');
  process.exit(1);
}

if (!existsSync(entry)) {
  if (!existsSync(serverSource)) {
    fail([
      'No compiled server at server/dist, and no sources to build from.',
      '',
      'This usually means the deploy is rooted at the wrong directory.',
      'Driftle is an npm workspace monorepo: the service root must be the',
      'repository root, not client/ or server/.',
    ]);
  }

  // A platform ran the start command without running the build. Recover.
  console.log('[start] No build found — building now (this should have happened at build time).');
  const build = spawnSync(NPM, ['run', 'build'], { cwd: root, stdio: 'inherit' });
  if (build.status !== 0 || !existsSync(entry)) {
    fail([
      'The build failed, so there is nothing to run.',
      '',
      'Most likely cause: dependencies were installed with --omit=dev, so the',
      'TypeScript compiler and Vite are unavailable. Run `npm run build`',
      'during the build phase, with devDependencies installed.',
    ]);
  }
}

if (process.env.SERVE_CLIENT !== 'false' && !existsSync(clientIndex)) {
  console.warn(
    '[start] No client build at client/dist — the API will run but will serve a placeholder page.',
  );
}

// Signals are forwarded by runNode so a platform's graceful stop reaches the server.
runNode(entry, { cwd: root, nodeArgs: ['--disable-warning=ExperimentalWarning'] });
