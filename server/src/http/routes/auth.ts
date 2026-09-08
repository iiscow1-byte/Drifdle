import { Router } from 'express';
import { config } from '../../config.ts';
import {
  hashPassword,
  validateEmail,
  validatePassword,
  validateUsername,
  verifyPassword,
} from '../../auth/passwords.ts';
import {
  claimGuest,
  createGuest,
  createUser,
  findUserByEmail,
  findUserById,
  findUserByLogin,
  findUserByUsername,
  getStatsRow,
  toPublicUser,
  toUserStats,
  updateProfile,
} from '../../auth/users.ts';
import {
  authorizeUrl,
  DISCORD_SCOPES,
  exchangeCode,
  fetchDiscordUser,
  linkDiscordAccount,
  unlinkDiscord,
} from '../../auth/discord.ts';
import {
  clearSessionCookie,
  createSession,
  destroyAllSessions,
  destroySession,
  readToken,
  setSessionCookie,
} from '../../auth/sessions.ts';
import { rateLimit, requireUser, route } from '../middleware.ts';
import { token as randomToken } from '../../util/ids.ts';

export const authRouter = Router();

const signupLimit = rateLimit({ windowMs: 60_000, max: 8 });
const loginLimit = rateLimit({ windowMs: 60_000, max: 15 });

function sessionPayload(userId: string, res: import('express').Response) {
  const raw = createSession(userId);
  setSessionCookie(res, raw);
  return raw;
}

/** Everything the client needs about the signed-in user in one shape. */
function meBody(userRow: import('../../db/index.ts').UserRow, token?: string) {
  return {
    user: toPublicUser(userRow),
    stats: toUserStats(getStatsRow(userRow.id)),
    token,
  };
}

authRouter.get(
  '/me',
  route((req, res) => {
    if (!req.user) {
      res.json({ user: null, stats: null });
      return;
    }
    res.json(meBody(req.user));
  }),
);

/**
 * Play-now accounts. A guest is a real row with real stats, so nothing is lost
 * when they later claim the account.
 */
authRouter.post(
  '/guest',
  signupLimit,
  route((req, res) => {
    if (req.user) {
      res.json(meBody(req.user, readToken(req)));
      return;
    }
    const name = typeof req.body?.name === 'string' ? req.body.name.slice(0, 20) : undefined;
    const user = createGuest(name);
    const token = sessionPayload(user.id, res);
    res.status(201).json(meBody(user, token));
  }),
);

authRouter.post(
  '/signup',
  signupLimit,
  route(async (req, res) => {
    const { username, email, password } = req.body ?? {};

    for (const problem of [validateUsername(username), validateEmail(email), validatePassword(password)]) {
      if (problem) {
        res.status(400).json({ error: 'invalid', field: problem.field, message: problem.message });
        return;
      }
    }
    if (findUserByUsername(username)) {
      res.status(409).json({ error: 'taken', field: 'username', message: 'That username is taken.' });
      return;
    }
    if (findUserByEmail(email)) {
      res.status(409).json({ error: 'taken', field: 'email', message: 'That email is already registered.' });
      return;
    }

    const passwordHash = await hashPassword(password);

    // A guest signing up keeps their history instead of starting over.
    if (req.user?.guest === 1) {
      const upgraded = claimGuest(req.user.id, { username, email, passwordHash });
      if (upgraded) {
        res.status(201).json(meBody(upgraded, readToken(req)));
        return;
      }
    }

    const user = createUser({ username, email, passwordHash, displayName: username });
    const token = sessionPayload(user.id, res);
    res.status(201).json(meBody(user, token));
  }),
);

authRouter.post(
  '/login',
  loginLimit,
  route(async (req, res) => {
    const { login, password } = req.body ?? {};
    if (typeof login !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'invalid', message: 'Enter your username and password.' });
      return;
    }
    const user = findUserByLogin(login.trim());
    // Always run a hash comparison so a missing user and a wrong password take
    // roughly the same amount of time.
    const stored = user?.password_hash ?? 'scrypt$16384$8$1$AAAA$AAAA';
    const ok = await verifyPassword(password, stored);
    if (!user || !user.password_hash || !ok) {
      res.status(401).json({ error: 'bad_credentials', message: 'Incorrect username or password.' });
      return;
    }
    const token = sessionPayload(user.id, res);
    res.json(meBody(user, token));
  }),
);

authRouter.post(
  '/logout',
  route((req, res) => {
    destroySession(readToken(req));
    clearSessionCookie(res);
    res.json({ ok: true });
  }),
);

authRouter.post(
  '/logout-all',
  requireUser,
  route((req, res) => {
    destroyAllSessions(req.user!.id);
    clearSessionCookie(res);
    res.json({ ok: true });
  }),
);

authRouter.patch(
  '/me',
  requireUser,
  route((req, res) => {
    const { displayName } = req.body ?? {};
    if (displayName !== undefined) {
      const trimmed = String(displayName).trim();
      if (trimmed.length < 2 || trimmed.length > 24) {
        res.status(400).json({ error: 'invalid', message: 'Display names are 2-24 characters.' });
        return;
      }
      updateProfile(req.user!.id, { displayName: trimmed });
    }
    res.json(meBody(findUserById(req.user!.id)!));
  }),
);

/* ------------------------------------------------------------------ */
/* Discord                                                             */
/* ------------------------------------------------------------------ */

const oauthStates = new Map<string, { at: number; attachTo?: string }>();

function pruneStates() {
  const cutoff = Date.now() - 10 * 60_000;
  for (const [k, v] of oauthStates) if (v.at < cutoff) oauthStates.delete(k);
}

authRouter.get('/discord', (req, res) => {
  if (!config.discord.enabled) {
    res.status(503).json({
      error: 'discord_disabled',
      message: 'Discord sign-in is not configured on this server.',
    });
    return;
  }
  pruneStates();
  const state = randomToken(16);
  oauthStates.set(state, { at: Date.now(), attachTo: req.user?.id });
  res.redirect(authorizeUrl(state));
});

authRouter.get(
  '/discord/callback',
  route(async (req, res) => {
    if (!config.discord.enabled) {
      res.status(503).send('Discord sign-in is not configured on this server.');
      return;
    }
    const { code, state } = req.query as { code?: string; error?: string; state?: string };
    const pending = state ? oauthStates.get(state) : undefined;
    if (state) oauthStates.delete(state);

    if (!code || !pending) {
      res.redirect(`${config.publicUrl}/?discord=failed`);
      return;
    }

    try {
      const tokens = await exchangeCode(code, `${config.publicUrl}${config.discord.redirectPath}`);
      const discordUser = await fetchDiscordUser(tokens.access_token);
      const { user } = linkDiscordAccount(discordUser, tokens, pending.attachTo ?? req.user?.id);
      sessionPayload(user.id, res);
      res.redirect(`${config.publicUrl}/?discord=linked`);
    } catch (err) {
      console.error('[discord] oauth callback failed', err);
      res.redirect(`${config.publicUrl}/?discord=failed`);
    }
  }),
);

/**
 * The Activity flow. The embedded SDK has already shown the consent screen and
 * handed the client an authorization code; we exchange it and hand back an
 * access token for `discordSdk.commands.authenticate`, plus our own session.
 */
authRouter.post(
  '/discord/activity',
  rateLimit({ windowMs: 60_000, max: 30 }),
  route(async (req, res) => {
    if (!config.discord.enabled) {
      res.status(503).json({
        error: 'discord_disabled',
        message: 'This server has no Discord credentials configured.',
      });
      return;
    }
    const { code } = req.body ?? {};
    if (typeof code !== 'string' || !code) {
      res.status(400).json({ error: 'invalid', message: 'Missing authorization code.' });
      return;
    }

    const tokens = await exchangeCode(code);
    const discordUser = await fetchDiscordUser(tokens.access_token);
    const { user } = linkDiscordAccount(discordUser, tokens, req.user?.id);
    const sessionToken = sessionPayload(user.id, res);

    res.json({
      access_token: tokens.access_token,
      ...meBody(user, sessionToken),
    });
  }),
);

authRouter.delete(
  '/discord',
  requireUser,
  route((req, res) => {
    unlinkDiscord(req.user!.id);
    res.json({ ok: true });
  }),
);

authRouter.get('/discord/status', (_req, res) => {
  res.json({
    enabled: config.discord.enabled,
    clientId: config.discord.clientId || null,
    scopes: DISCORD_SCOPES,
  });
});
