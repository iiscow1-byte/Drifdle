/**
 * Shared helpers for the entrypoint scripts.
 *
 * Everything here avoids `shell: true`. Spawning through a shell with an
 * argument array is deprecated (DEP0190) because the arguments are concatenated
 * rather than escaped, so we resolve real executables and run them directly.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

/** npm is a .cmd shim on Windows, which spawn needs named explicitly. */
export const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/**
 * Find a package's executable script so it can be run with `node`, bypassing
 * both the shell and npm's own indirection.
 */
export function resolveBin(pkg, fromFile, binName = pkg) {
  const require = createRequire(fromFile);
  const manifestPath = require.resolve(`${pkg}/package.json`);
  const manifest = require(manifestPath);
  const bin = manifest.bin;

  const relative = typeof bin === 'string' ? bin : bin?.[binName] ?? Object.values(bin ?? {})[0];
  if (!relative) throw new Error(`${pkg} declares no executable`);

  return resolve(dirname(manifestPath), relative);
}

export function isInstalled(pkg, fromFile) {
  try {
    createRequire(fromFile).resolve(`${pkg}/package.json`);
    return true;
  } catch {
    return false;
  }
}

/** Run a Node script as a child, forwarding signals and its exit code. */
export function runNode(script, { args = [], cwd, env = process.env, nodeArgs = [] } = {}) {
  return adopt(spawn(process.execPath, [...nodeArgs, script, ...args], { cwd, stdio: 'inherit', env }));
}

export function runNpm(args, { cwd, env = process.env } = {}) {
  return adopt(spawn(NPM, args, { cwd, stdio: 'inherit', env }));
}

/** Forward SIGTERM/SIGINT so a platform's graceful stop reaches the child. */
export function adopt(child) {
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
      if (!child.killed) child.kill(signal);
    });
  }
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
  child.on('error', (err) => {
    console.error(`[driftle] failed to start child process: ${err.message}`);
    process.exit(1);
  });
  return child;
}

export { join };
