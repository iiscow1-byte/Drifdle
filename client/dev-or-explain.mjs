// `vite` only exists when devDependencies are installed. If it is missing we
// are almost certainly in a production container that was pointed at this
// workspace by mistake, so explain that rather than dying on a missing binary.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
try {
  require.resolve('vite');
} catch {
  console.error(`
  vite is not installed, so the client dev server cannot start.

  This is normal in production: devDependencies are omitted there. It means
  something is running @driftle/client's "dev" script in a deployed container.

  Driftle deploys as ONE service from the repository root:
    build:  npm run build
    start:  npm start

  Fix your deploy settings:
    - Root Directory:  the repository root, not "client"
    - Start Command:   npm start   (or leave empty to use the Dockerfile)
`);
  process.exit(1);
}

const child = spawn('npm', ['exec', '--', 'vite', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
child.on('exit', (code) => process.exit(code ?? 0));
