import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.ts';
import { attachUser, cookies, cors, frameHeaders, route } from './middleware.ts';
import { authRouter } from './routes/auth.ts';
import { gameRouter } from './routes/game.ts';
import { socialRouter } from './routes/social.ts';
import { lexiconStats } from '../game/lexicon/index.ts';
import type { Hub } from '../ws/hub.ts';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Find the built client. The path differs between `tsx` (source tree) and a
 * compiled build, and again between a monorepo checkout and a Docker image, so
 * we probe the handful of places it can legitimately be.
 */
function findClientDist(): string | null {
  const candidates = [
    process.env.CLIENT_DIST,
    resolve(process.cwd(), 'client/dist'),
    resolve(process.cwd(), '../client/dist'),
    resolve(here, '../../../client/dist'),
    resolve(here, '../../../../client/dist'),
    resolve(here, '../../../../../client/dist'),
  ].filter((p): p is string => Boolean(p));

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'index.html'))) return candidate;
  }
  return null;
}

export function createApp(hub: Hub) {
  const app = express();

  // Railway (and most PaaS) terminate TLS upstream.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(express.json({ limit: '32kb' }));
  app.use(cookies);
  app.use(attachUser);
  app.use(cors);
  app.use(frameHeaders);

  /* ---------------- meta ---------------- */

  // Railway's healthcheck hits this; it must never depend on optional config.
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      uptime: Math.round(process.uptime()),
      ...hub.stats,
      lexicon: lexiconStats().size,
    });
  });

  /** Runtime configuration the client is allowed to know about. */
  app.get('/api/config', (_req, res) => {
    res.json({
      discordEnabled: config.discord.enabled,
      discordClientId: config.discord.clientId || null,
      maxPlayersPerRoom: config.limits.maxPlayersPerRoom,
      publicUrl: config.publicUrl,
    });
  });

  app.get(
    '/api/rooms',
    route((_req, res) => {
      res.json({ rooms: hub.listPublicRooms() });
    }),
  );

  /* ---------------- api ---------------- */

  app.use('/api/auth', authRouter);
  app.use('/api/game', gameRouter);
  app.use('/api', socialRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found', message: 'No such endpoint.' });
  });

  /* ---------------- client ---------------- */

  if (config.serveClient) {
    const dist = findClientDist();
    if (dist) {
      app.use(
        express.static(dist, {
          index: false,
          setHeaders(res, path) {
            // Vite fingerprints its assets, so they can be cached hard.
            if (path.includes(`${'assets'}`)) {
              res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            }
          },
        }),
      );
      app.get('*', (_req, res) => {
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(join(dist, 'index.html'));
      });
      console.log(`[http] serving client from ${dist}`);
    } else {
      console.warn(
        '[http] SERVE_CLIENT is on but no client build was found. Run `npm run build` first.',
      );
      app.get('*', (_req, res) => {
        res
          .status(503)
          .type('text/plain')
          .send('Driftle client has not been built yet. Run: npm run build');
      });
    }
  }

  /* ---------------- errors ---------------- */

  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error('[http]', err);
      if (res.headersSent) return;
      res.status(500).json({ error: 'server_error', message: 'Something went wrong.' });
    },
  );

  return app;
}
