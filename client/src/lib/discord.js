import { DiscordSDK } from '@discord/embedded-app-sdk';
import { api, IS_EMBEDDED, setToken } from './api.ts';
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
const SCOPES = ['identify', 'guilds.members.read', 'rpc.activities.write'];
export const IDLE_CONTEXT = {
    embedded: IS_EMBEDDED,
    ready: false,
    instanceId: null,
    channelId: null,
    guildId: null,
    user: null,
    error: null,
};
let sdk = null;
let setupPromise = null;
/** Guard so a failed setActivity does not spam the console every round. */
let presenceBroken = false;
let lastPresenceKey = '';
export function getSdk() {
    return sdk;
}
/**
 * Boot the Activity. Safe to call unconditionally: outside Discord it
 * immediately reports `embedded: false` and does nothing else.
 */
export async function setupDiscord() {
    if (setupPromise)
        return setupPromise;
    setupPromise = (async () => {
        if (!IS_EMBEDDED)
            return { ...IDLE_CONTEXT, embedded: false };
        let clientId = null;
        try {
            clientId = (await api.config()).discordClientId;
        }
        catch {
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
            if (result.token)
                setToken(result.token);
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
        }
        catch (err) {
            console.error('[discord] activity setup failed', err);
            return {
                ...IDLE_CONTEXT,
                error: err instanceof Error ? err.message : 'Discord authorization failed.',
            };
        }
    })();
    return setupPromise;
}
/**
 * Push the current game state onto the player's Discord profile.
 * Deduplicated, because Discord rate-limits presence updates.
 */
export async function setPresence(input) {
    if (!sdk || presenceBroken)
        return;
    const key = JSON.stringify(input);
    if (key === lastPresenceKey)
        return;
    lastPresenceKey = key;
    const timestamps = {};
    if (input.endsAt)
        timestamps.end = Math.round(input.endsAt);
    else if (input.startedAt)
        timestamps.start = Math.round(input.startedAt);
    try {
        await sdk.commands.setActivity({
            activity: {
                type: 0,
                details: input.details.slice(0, 128),
                state: input.state.slice(0, 128),
                timestamps: Object.keys(timestamps).length ? timestamps : undefined,
                party: input.partySize && input.partyMax
                    ? { id: sdk.instanceId, size: [input.partySize, input.partyMax] }
                    : undefined,
                assets: {
                    large_image: 'driftle',
                    large_text: 'Driftle — the answer moves',
                },
                instance: true,
            },
        });
    }
    catch (err) {
        // Usually a missing rpc.activities.write scope or a missing uploaded asset.
        // Not worth interrupting play over, so we log once and stop trying.
        console.warn('[discord] rich presence unavailable', err);
        presenceBroken = true;
    }
}
/** Who else is in this Activity instance right now. */
export async function connectedParticipants() {
    if (!sdk)
        return [];
    try {
        const res = await sdk.commands.getInstanceConnectedParticipants();
        return res.participants.map((p) => ({ id: p.id, username: p.global_name ?? p.username }));
    }
    catch {
        return [];
    }
}
/** Open a link from inside the iframe, where `window.open` is blocked. */
export async function openExternal(url) {
    if (sdk) {
        try {
            await sdk.commands.openExternalLink({ url });
            return;
        }
        catch {
            /* fall through to a normal navigation */
        }
    }
    window.open(url, '_blank', 'noopener,noreferrer');
}
