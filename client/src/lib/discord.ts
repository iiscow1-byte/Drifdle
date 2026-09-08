import { DiscordSDK, type Types } from '@discord/embedded-app-sdk';
import { api, IS_EMBEDDED, setToken } from './api.ts';
import type { PublicUser } from '@shared/protocol.ts';

/**
 * Discord integration.
 *
 * Two separate things live here:
 *
 *  1. The **Activity** — when Driftle is launched inside a Discord voice
 *     channel, the embedded SDK gives us an `instanceId`. We use it as the room
 *     key, so everyone who launches the Activity in that channel lands in the
 *     same game with no code to type.
 *
 *  2. **Rich Presence** — `commands.setActivity` writes the "Playing Driftle"
 *     card on the player's profile, which we keep in step with the round.
 *
 * Every call degrades quietly: if Discord is unreachable, unconfigured, or the
 * player denied a scope, the game carries on as an ordinary web app.
 */

const SCOPES: Types.OAuthScopes[] = ['identify', 'guilds.members.read', 'rpc.activities.write'];

export interface DiscordContext {
  embedded: boolean;
  ready: boolean;
  instanceId: string | null;
  channelId: string | null;
  guildId: string | null;
  user: PublicUser | null;
  error: string | null;
}

export const IDLE_CONTEXT: DiscordContext = {
  embedded: IS_EMBEDDED,
  ready: false,
  instanceId: null,
  channelId: null,
  guildId: null,
  user: null,
  error: null,
};

let sdk: DiscordSDK | null = null;
let setupPromise: Promise<DiscordContext> | null = null;

/** Guard so a failed setActivity does not spam the console every round. */
let presenceBroken = false;
let lastPresenceKey = '';

export function getSdk(): DiscordSDK | null {
  return sdk;
}

/**
 * Boot the Activity. Safe to call unconditionally: outside Discord it
 * immediately reports `embedded: false` and does nothing else.
 */
export async function setupDiscord(): Promise<DiscordContext> {
  if (setupPromise) return setupPromise;

  setupPromise = (async (): Promise<DiscordContext> => {
    if (!IS_EMBEDDED) return { ...IDLE_CONTEXT, embedded: false };

    let clientId: string | null = null;
    try {
      clientId = (await api.config()).discordClientId;
    } catch {
      return { ...IDLE_CONTEXT, error: 'Could not reach the Driftle server.' };
    }
    if (!clientId) {
      return {
        ...IDLE_CONTEXT,
        error: 'This server has no Discord credentials configured, so the Activity cannot sign you in.',
      };
    }

    try {
      sdk = new DiscordSDK(clientId);
      await sdk.ready();

      const { code } = await sdk.commands.authorize({
        client_id: clientId,
        response_type: 'code',
        state: '',
        prompt: 'none',
        scope: SCOPES,
      });

      // The server holds the client secret, so the exchange happens there. It
      // hands back both a Discord access token and a Driftle session.
      const result = await api.discordActivity(code);
      if (result.token) setToken(result.token);

      await sdk.commands.authenticate({ access_token: result.access_token });

      return {
        embedded: true,
        ready: true,
        instanceId: sdk.instanceId,
        channelId: sdk.channelId,
        guildId: sdk.guildId,
        user: result.user,
        error: null,
      };
    } catch (err) {
      console.error('[discord] activity setup failed', err);
      return {
        ...IDLE_CONTEXT,
        error: err instanceof Error ? err.message : 'Discord authorization failed.',
      };
    }
  })();

  return setupPromise;
}

export interface PresenceInput {
  details: string;
  state: string;
  partySize?: number;
  partyMax?: number;
  /** ms epoch when the current phase ends, shown as a countdown by Discord. */
  endsAt?: number | null;
  /** ms epoch the session started, shown as elapsed time. */
  startedAt?: number | null;
}

/**
 * Push the current game state onto the player's Discord profile.
 * Deduplicated, because Discord rate-limits presence updates.
 */
export async function setPresence(input: PresenceInput): Promise<void> {
  if (!sdk || presenceBroken) return;

  const key = JSON.stringify(input);
  if (key === lastPresenceKey) return;
  lastPresenceKey = key;

  const timestamps: { start?: number; end?: number } = {};
  if (input.endsAt) timestamps.end = Math.round(input.endsAt);
  else if (input.startedAt) timestamps.start = Math.round(input.startedAt);

  try {
    await sdk.commands.setActivity({
      activity: {
        type: 0,
        details: input.details.slice(0, 128),
        state: input.state.slice(0, 128),
        timestamps: Object.keys(timestamps).length ? timestamps : undefined,
        party:
          input.partySize && input.partyMax
            ? { id: sdk.instanceId, size: [input.partySize, input.partyMax] }
            : undefined,
        assets: {
          large_image: 'driftle',
          large_text: 'Driftle — the answer moves',
        },
        instance: true,
      },
    } as Parameters<DiscordSDK['commands']['setActivity']>[0]);
  } catch (err) {
    // Usually a missing rpc.activities.write scope or a missing uploaded asset.
    // Not worth interrupting play over, so we log once and stop trying.
    console.warn('[discord] rich presence unavailable', err);
    presenceBroken = true;
  }
}

/** Who else is in this Activity instance right now. */
export async function connectedParticipants(): Promise<{ id: string; username: string }[]> {
  if (!sdk) return [];
  try {
    const res = await sdk.commands.getInstanceConnectedParticipants();
    return res.participants.map((p) => ({ id: p.id, username: p.global_name ?? p.username }));
  } catch {
    return [];
  }
}

/** Open a link from inside the iframe, where `window.open` is blocked. */
export async function openExternal(url: string) {
  if (sdk) {
    try {
      await sdk.commands.openExternalLink({ url });
      return;
    } catch {
      /* fall through to a normal navigation */
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
