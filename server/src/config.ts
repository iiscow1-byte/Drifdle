import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

/**
 * Driftle boots with zero configuration.
 *
 * Every variable below has a working default, so `npm start` on a bare machine
 * (or a fresh Railway service with nothing but a repo connected) comes up
 * healthy. Optional integrations - Discord in particular - stay switched off
 * rather than crashing the process, and the rest of the app checks the
 * corresponding `enabled` flag before offering them.
 */

function env(key: string, fallback = ''): string {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
}

const nodeEnv = env('NODE_ENV', 'development');
const isProd = nodeEnv === 'production';

/* ------------------------------------------------------------------ */
/* Platform detection                                                  */
/* ------------------------------------------------------------------ */

const railway = {
  active: Boolean(env('RAILWAY_ENVIRONMENT') || env('RAILWAY_PROJECT_ID') || env('RAILWAY_SERVICE_ID')),
  publicDomain: env('RAILWAY_PUBLIC_DOMAIN'),
  volumePath: env('RAILWAY_VOLUME_MOUNT_PATH'),
  service: env('RAILWAY_SERVICE_NAME', 'driftle'),
  environment: env('RAILWAY_ENVIRONMENT', nodeEnv),
};

/**
 * Where persistent data lives.
 *
 * Railway containers have an ephemeral filesystem, so if a volume is attached
 * we put the database on it automatically. Without a volume the game still
 * runs perfectly - accounts just do not survive a redeploy, and we say so
 * loudly at boot rather than silently losing data.
 */
function resolveDatabasePath(): { path: string; ephemeral: boolean } {
  const explicit = env('DATABASE_PATH');
  if (explicit) {
    return { path: isAbsolute(explicit) ? explicit : resolve(explicit), ephemeral: false };
  }
  if (railway.volumePath) {
    return { path: join(railway.volumePath, 'driftle.db'), ephemeral: false };
  }
  return { path: resolve('data/driftle.db'), ephemeral: railway.active };
}

const database = resolveDatabasePath();

/**
 * The session secret must be stable across restarts or everyone gets logged
 * out on every deploy. If the operator did not set one, we generate it once and
 * keep it beside the database.
 */
function resolveSessionSecret(): { secret: string; generated: boolean } {
  const explicit = env('SESSION_SECRET');
  if (explicit) return { secret: explicit, generated: false };

  const secretFile = join(dirname(database.path), '.session-secret');
  try {
    mkdirSync(dirname(secretFile), { recursive: true });
    if (existsSync(secretFile)) {
      const stored = readFileSync(secretFile, 'utf8').trim();
      if (stored.length >= 32) return { secret: stored, generated: true };
    }
    const fresh = randomBytes(48).toString('hex');
    writeFileSync(secretFile, fresh, { mode: 0o600 });
    return { secret: fresh, generated: true };
  } catch {
    // Read-only filesystem: fall back to a per-process secret. Sessions will
    // not survive a restart, which is survivable but worth warning about.
    return { secret: randomBytes(48).toString('hex'), generated: true };
  }
}

const session = resolveSessionSecret();

function resolvePublicUrl(): string {
  const explicit = env('PUBLIC_URL');
  if (explicit) return explicit.replace(/\/$/, '');
  if (railway.publicDomain) return `https://${railway.publicDomain}`;
  return `http://localhost:${env('PORT', '3000')}`;
}

const publicUrl = resolvePublicUrl();

/** Extra origins allowed to call the API, comma separated. */
function resolveOrigins(): string[] {
  const list = new Set<string>();
  for (const raw of env('CLIENT_ORIGIN').split(',')) {
    const o = raw.trim().replace(/\/$/, '');
    if (o) list.add(o);
  }
  if (!isProd) {
    list.add('http://localhost:5173');
    list.add('http://127.0.0.1:5173');
  }
  list.add(publicUrl);
  return [...list];
}

const discordClientId = env('DISCORD_CLIENT_ID');
const discordClientSecret = env('DISCORD_CLIENT_SECRET');

export const config = {
  nodeEnv,
  isProd,
  port: Number(env('PORT', '3000')),
  host: env('HOST', '0.0.0.0'),

  databasePath: database.path,
  databaseIsEphemeral: database.ephemeral,

  sessionSecret: session.secret,
  sessionSecretGenerated: session.generated,

  publicUrl,
  allowedOrigins: resolveOrigins(),

  railway,

  /** Serve the built client from the API process (single-service deploys). */
  serveClient: env('SERVE_CLIENT', isProd ? 'true' : 'false') === 'true',

  discord: {
    clientId: discordClientId,
    clientSecret: discordClientSecret,
    /** Everything Discord-shaped is gated on this. */
    enabled: Boolean(discordClientId && discordClientSecret),
    redirectPath: '/api/auth/discord/callback',
  },

  session: {
    cookieName: 'driftle_sid',
    ttlMs: 1000 * 60 * 60 * 24 * 30,
  },

  limits: {
    maxPlayersPerRoom: Number(env('MAX_PLAYERS_PER_ROOM', '8')),
    maxRooms: Number(env('MAX_ROOMS', '500')),
    chatPerMinute: 20,
    guessesPerMinute: 40,
  },
} as const;

/** Printed once at boot so the operator can see exactly what is switched on. */
export function describeConfig(): string[] {
  const lines: string[] = [];
  lines.push(`env            ${config.nodeEnv}${railway.active ? ` (railway: ${railway.environment})` : ''}`);
  lines.push(`public url     ${config.publicUrl}`);
  lines.push(`database       ${config.databasePath}`);
  lines.push(`discord        ${config.discord.enabled ? 'enabled' : 'disabled (set DISCORD_CLIENT_ID + DISCORD_CLIENT_SECRET)'}`);
  lines.push(`serve client   ${config.serveClient ? 'yes' : 'no (run vite separately)'}`);
  return lines;
}

export function configWarnings(): string[] {
  const warnings: string[] = [];
  if (config.sessionSecretGenerated && config.isProd) {
    warnings.push(
      'SESSION_SECRET is not set. A secret was generated and stored next to the database; set SESSION_SECRET to keep sessions valid across volume changes.',
    );
  }
  if (config.databaseIsEphemeral) {
    warnings.push(
      'No volume detected on Railway. The database lives on the container filesystem and will be wiped on redeploy — attach a volume and the database moves there automatically.',
    );
  }
  if (!config.discord.enabled) {
    warnings.push(
      'Discord is disabled. Sign-in with Discord, the Activity and Rich Presence are unavailable until DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET are set.',
    );
  }
  return warnings;
}
