#!/usr/bin/env node
/**
 * Development entrypoint — with a production safety net.
 *
 * Locally this is just `concurrently` running the API and the Vite client, and
 * behaves exactly as it always has.
 *
 * The safety net exists because `npm run dev` is a very easy thing to leave in
 * a platform's start command by accident, and the resulting failure is opaque:
 * dev tooling lives in devDependencies, which production installs omit, so the
 * container dies on `vite: not found` and restart-loops forever. Rather than
 * fail in a way nobody can read, we notice we are in production, say plainly
 * what is misconfigured, and run the real server instead.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));

function hasDevTooling() {
  try {
    require.resolve('concurrently');
    require.resolve('vite');
    return true;
  } catch {
    return false;
  }
}

const inProduction = process.env.NODE_ENV === 'production';

if (inProduction || !hasDevTooling()) {
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

  const child = spawn(process.execPath, [join(root, 'scripts', 'start.mjs')], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => child.kill(signal));
  }
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
} else {
  const child = spawn(
    'npm',
    ['exec', '--', 'concurrently', '-n', 'server,client', '-c', 'cyan,magenta', 'npm:dev:server', 'npm:dev:client'],
    {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === 'win32',
    },
  );
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => child.kill(signal));
  }
  child.on('exit', (code) => process.exit(code ?? 0));
}
