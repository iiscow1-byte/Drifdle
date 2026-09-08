import { createServer } from 'node:http';
import { config, configWarnings, describeConfig } from './config.ts';
import { startHousekeeping } from './db/index.ts';
import { createApp } from './http/app.ts';
import { Hub } from './ws/hub.ts';
import { lexiconStats } from './game/lexicon/index.ts';
import { puzzleNumber, todayKey } from './game/daily.ts';

const banner = String.raw`
  ___  ___ ___ ___ _____ _    ___
 |   \| _ \_ _| __|_   _| |  | __|   the answer moves
 | |) |   /| || _|  | | | |__| _|
 |___/|_|_\___|_|   |_| |____|___|
`;

function main() {
  console.log(banner);
  for (const line of describeConfig()) console.log(`  ${line}`);
  const lex = lexiconStats();
  console.log(`  lexicon        ${lex.size} words, ${lex.groups} groups, ${lex.tags} tags`);
  console.log(`  today          Driftle #${puzzleNumber(todayKey())} (${todayKey()})`);

  for (const warning of configWarnings()) console.warn(`\n  ! ${warning}`);
  console.log('');

  startHousekeeping();

  const server = createServer();
  const hub = new Hub(server);
  const app = createApp(hub);
  server.on('request', app);

  server.listen(config.port, config.host, () => {
    console.log(`[driftle] listening on http://${config.host}:${config.port}`);
    if (!config.serveClient) {
      console.log('[driftle] client dev server: npm run dev:client');
    }
  });

  const shutdown = (signal: string) => {
    console.log(`\n[driftle] ${signal} received, shutting down.`);
    server.close(() => process.exit(0));
    // Do not hang forever on lingering websockets.
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (err) => console.error('[driftle] unhandled rejection', err));
  process.on('uncaughtException', (err) => console.error('[driftle] uncaught exception', err));
}

main();
