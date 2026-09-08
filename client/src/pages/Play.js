import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.ts';
import { useSession, useTicker, toast } from '../lib/store.tsx';
import { useRoom } from '../lib/useRoom.ts';
import { Board } from '../components/Board.tsx';
import { Chat, Countdown, DriftFlash, DriftMeter, GuessInput, PlayerList, SummaryPanel, } from '../components/GameBits.tsx';
import { Modal, Spinner } from '../components/ui.tsx';
import { DIFFICULTY_LABEL, MODE_LABEL, formatClock } from '../lib/format.ts';
/**
 * `param` encodes how we got here:
 *   activity          — bind to the Discord Activity instance
 *   quick:<mode>      — matchmake into any open room of that mode
 *   new:<mode>        — always create a fresh room
 *   private:<mode>    — create a room nobody can matchmake into
 *   code:<CODE>       — join a specific room
 */
export function Play({ param, navigate }) {
    const { user, discord } = useSession();
    const [view, actions] = useRoom();
    const [lexiconSize, setLexiconSize] = useState(768);
    const [showSummary, setShowSummary] = useState(false);
    const joined = useRef(null);
    useEffect(() => {
        api.rules().then((r) => setLexiconSize(r.lexiconSize)).catch(() => { });
    }, []);
    // Join exactly once per target, and re-join if the target changes.
    useEffect(() => {
        if (!user || !param || joined.current === param)
            return;
        joined.current = param;
        const [kind, rest] = param.includes(':') ? param.split(/:(.*)/s) : [param, ''];
        if (kind === 'activity') {
            if (!discord.instanceId)
                return; // wait for the SDK handshake
            actions.join({ discordInstanceId: discord.instanceId, settings: { mode: 'commons' } });
        }
        else if (kind === 'code') {
            actions.join({ code: rest });
        }
        else if (kind === 'quick') {
            actions.join({ settings: { mode: rest } });
        }
        else if (kind === 'new') {
            actions.join({ settings: { mode: rest, private: false } });
        }
        else if (kind === 'private') {
            actions.join({ settings: { mode: rest, private: true } });
        }
        // `actions` is recreated per render but its callbacks are stable.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, param, discord.instanceId]);
    useEffect(() => {
        return () => {
            joined.current = null;
        };
    }, []);
    const state = view.state;
    const me = state?.players.find((p) => p.id === user?.id) ?? null;
    const isHost = state?.hostId === user?.id;
    useEffect(() => {
        if (state?.phase === 'roundEnd' || state?.phase === 'matchEnd')
            setShowSummary(true);
        if (state?.phase === 'playing' || state?.phase === 'countdown')
            setShowSummary(false);
    }, [state?.phase]);
    if (!user) {
        return (_jsx("div", { className: "page center-screen", children: _jsxs("div", { children: [_jsx("h1", { style: { fontSize: 22 }, children: "Sign in to play" }), _jsx("p", { className: "muted", children: "Multiplayer needs an identity \u2014 guest accounts work fine." })] }) }));
    }
    if (!state) {
        return (_jsx("div", { className: "page center-screen", children: _jsxs("div", { className: "stack", style: { alignItems: 'center' }, children: [_jsx(Spinner, {}), _jsx("div", { className: "muted", children: view.status === 'open' ? 'Finding you a room…' : 'Connecting…' }), _jsx("button", { className: "btn ghost sm", onClick: () => navigate('home'), children: "Back" })] }) }));
    }
    const playing = state.phase === 'playing';
    const myTurn = state.settings.mode !== 'relay' || state.turnPlayerId === user.id;
    return (_jsxs("div", { className: "page wide", children: [view.drift && _jsx(DriftFlash, { event: view.drift }), _jsx(RoomHeader, { state: state, onLeave: () => {
                    actions.leave();
                    navigate('home');
                }, status: view.status }), _jsxs("div", { className: "game", children: [_jsxs("div", { className: "rail-left", children: [_jsxs("div", { className: "card", children: [_jsxs("h3", { children: ["Players (", state.players.length, ")"] }), _jsx(PlayerList, { players: state.players, myId: user.id, turnPlayerId: state.turnPlayerId })] }), playing && (_jsx("div", { className: "card", children: _jsx(DriftMeter, { charge: state.driftCharge, cap: state.driftCap, anchored: state.anchored, drifts: state.drifts.filter((d) => !d.headline.startsWith('ANCHORED')).length, maxDrifts: state.settings.maxDrifts }) })), state.phase === 'lobby' && (_jsx(LobbyPanel, { state: state, isHost: !!isHost, ready: me?.ready ?? false, onReady: actions.ready, onStart: actions.start, onSettings: actions.settings }))] }), _jsxs("div", { children: [state.phase === 'countdown' && view.countdownAt && (_jsxs("div", { className: "card", style: { textAlign: 'center', marginBottom: 12 }, children: [_jsxs("div", { className: "faint", style: { fontSize: 11, letterSpacing: '0.1em', fontWeight: 800 }, children: ["ROUND ", state.round, " OF ", state.settings.rounds] }), _jsx("div", { className: "mono", style: { fontSize: 36, fontWeight: 700 }, children: _jsx(Countdown, { endsAt: view.countdownAt }) })] })), playing && (_jsxs(_Fragment, { children: [_jsx(GuessInput, { onGuess: actions.guess, disabled: !myTurn, cooldownUntil: view.cooldownUntil, baseCooldownMs: state.settings.baseCooldownMs, placeholder: myTurn ? 'Type a word…' : `Waiting for ${nameOf(state, state.turnPlayerId)}…` }), state.settings.mode === 'relay' && state.turnEndsAt && myTurn && (_jsxs("div", { className: "muted", style: { fontSize: 12.5, marginTop: -4, marginBottom: 10 }, children: ["Your turn \u2014 ", _jsx(TurnClock, { endsAt: state.turnEndsAt })] }))] })), state.phase === 'lobby' && (_jsxs("div", { className: "card", style: { marginBottom: 12 }, children: [_jsx("h3", { children: "Waiting room" }), _jsxs("p", { className: "muted", style: { margin: 0, fontSize: 13.5 }, children: ["Share code ", _jsx("b", { className: "mono", style: { letterSpacing: '0.2em' }, children: state.code }), " with whoever you want in. Two ready players starts the match, or the host can start early."] })] })), _jsx(Board, { board: view.board, mine: view.mine, myId: user.id, lexiconSize: lexiconSize, echoes: me?.echoes ?? 0, onEcho: actions.echo, rescored: view.rescored })] }), _jsxs("div", { children: [_jsxs("div", { className: "card", children: [_jsx("h3", { children: "Room chat" }), _jsx(Chat, { lines: view.chat, onSend: actions.chat, onEmote: actions.emote })] }), playing && (_jsxs("div", { className: "card", children: [_jsxs("h3", { children: ["Echo tokens \u00B7 ", me?.echoes ?? 0] }), _jsx("p", { className: "muted", style: { margin: 0, fontSize: 13 }, children: "Opponents\u2019 guesses show only a heat band. Spend an Echo on one to publish its exact rank \u2014 to the whole room, with your name on it. You get one back after every drift." })] }))] })] }), showSummary && view.summary && (_jsxs(Modal, { title: state.phase === 'matchEnd'
                    ? 'Match over'
                    : view.summary.winnerId === user.id
                        ? 'You caught it'
                        : `Round ${view.summary.round}`, subtitle: state.phase === 'matchEnd'
                    ? undefined
                    : state.phaseEndsAt
                        ? 'Next round starting shortly…'
                        : undefined, onClose: () => setShowSummary(false), wide: true, children: [_jsx(SummaryPanel, { summary: view.summary }), view.standings && (_jsxs(_Fragment, { children: [_jsx("div", { className: "divider-text", children: "final standings" }), _jsxs("table", { className: "table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", {}), _jsx("th", { children: "Player" }), _jsx("th", { className: "num", children: "Rounds" }), _jsx("th", { className: "num", children: "Score" }), _jsx("th", { className: "num", children: "Rating" })] }) }), _jsx("tbody", { children: view.standings.map((s) => {
                                            const delta = s.ratingAfter - s.ratingBefore;
                                            return (_jsxs("tr", { className: s.playerId === user.id ? 'me' : '', children: [_jsx("td", { className: "place", children: s.place }), _jsx("td", { children: s.name }), _jsx("td", { className: "num", children: s.roundsWon }), _jsx("td", { className: "num", children: s.score }), _jsxs("td", { className: "num", style: { color: delta > 0 ? 'var(--ok)' : delta < 0 ? 'var(--danger)' : undefined }, children: [s.ratingAfter, delta !== 0 && _jsxs("span", { style: { fontSize: 11 }, children: [" ", delta > 0 ? '+' : '', delta] })] })] }, s.playerId));
                                        }) })] }), isHost && (_jsx("button", { className: "btn primary block", style: { marginTop: 14 }, onClick: () => {
                                    actions.rematch();
                                    setShowSummary(false);
                                }, children: "Back to the lobby" }))] }))] }))] }));
}
function nameOf(state, id) {
    return state.players.find((p) => p.id === id)?.name ?? 'someone';
}
function TurnClock({ endsAt }) {
    const now = useTicker(true, 200);
    return _jsxs("span", { className: "mono", children: [formatClock(endsAt - now), " left"] });
}
function RoomHeader({ state, onLeave, status, }) {
    const now = useTicker(Boolean(state.phaseEndsAt), 250);
    const [copied, setCopied] = useState(false);
    return (_jsxs("div", { className: "status-strip", children: [_jsxs("div", { className: "stat", children: [_jsx("div", { className: "k", children: "Room" }), _jsx("button", { className: "v mono", style: { background: 'none', border: 'none', padding: 0, letterSpacing: '0.18em', textAlign: 'left' }, title: "Copy room code", onClick: () => {
                            navigator.clipboard
                                .writeText(state.code)
                                .then(() => {
                                setCopied(true);
                                window.setTimeout(() => setCopied(false), 1400);
                            })
                                .catch(() => toast('Could not access the clipboard.', 'error'));
                        }, children: copied ? 'copied' : state.code })] }), _jsx("div", { className: "divider" }), _jsxs("div", { className: "stat", children: [_jsx("div", { className: "k", children: "Mode" }), _jsx("div", { className: "v", style: { fontFamily: 'var(--font)', fontSize: 13.5 }, children: MODE_LABEL[state.settings.mode] })] }), _jsx("div", { className: "divider" }), _jsxs("div", { className: "stat", children: [_jsx("div", { className: "k", children: "Round" }), _jsxs("div", { className: "v", children: [state.round || '—', "/", state.settings.rounds] })] }), state.phaseEndsAt && state.phase === 'playing' && (_jsxs(_Fragment, { children: [_jsx("div", { className: "divider" }), _jsxs("div", { className: "stat", children: [_jsx("div", { className: "k", children: "Time" }), _jsx("div", { className: "v", children: formatClock(state.phaseEndsAt - now) })] })] })), _jsx("div", { className: "divider" }), _jsxs("div", { className: "stat", children: [_jsx("div", { className: "k", children: "Lexicon" }), _jsx("div", { className: "v", style: { fontFamily: 'var(--font)', fontSize: 13.5 }, children: DIFFICULTY_LABEL[state.settings.difficulty] })] }), _jsx("div", { className: "grow" }), _jsxs("span", { className: `conn ${status === 'open' ? '' : status === 'connecting' ? 'connecting' : 'down'}`, children: [_jsx("span", { className: "led" }), status === 'open' ? 'live' : status === 'connecting' ? 'reconnecting' : 'offline'] }), _jsx("button", { className: "btn sm ghost", onClick: onLeave, children: "Leave" })] }));
}
function LobbyPanel({ state, isHost, ready, onReady, onStart, onSettings, }) {
    const enoughPlayers = state.players.filter((p) => p.connected).length >= 2;
    return (_jsxs("div", { className: "card", children: [_jsx("h3", { children: "Setup" }), isHost ? (_jsxs("div", { className: "stack", children: [_jsx(Setting, { label: "Mode", children: _jsxs("select", { className: "input", value: state.settings.mode, onChange: (e) => onSettings({ mode: e.target.value }), children: [_jsx("option", { value: "commons", children: "The Commons" }), _jsx("option", { value: "blitz", children: "Blitz Drift" }), _jsx("option", { value: "relay", children: "Relay" })] }) }), _jsx(Setting, { label: "Lexicon depth", children: _jsxs("select", { className: "input", value: state.settings.difficulty, onChange: (e) => onSettings({ difficulty: Number(e.target.value) }), children: [_jsx("option", { value: 1, children: "Common words only" }), _jsx("option", { value: 2, children: "Standard" }), _jsx("option", { value: 3, children: "Deep \u2014 includes obscure words" })] }) }), _jsx(Setting, { label: `Rounds — ${state.settings.rounds}`, children: _jsx("input", { type: "range", min: 1, max: 9, value: state.settings.rounds, onChange: (e) => onSettings({ rounds: Number(e.target.value) }), style: { width: '100%' } }) }), _jsx(Setting, { label: "Drift sensitivity", children: _jsxs("select", { className: "input", value: state.settings.driftSensitivity, onChange: (e) => onSettings({ driftSensitivity: Number(e.target.value) }), children: [_jsx("option", { value: 1, children: "Steady \u2014 the answer mostly holds still" }), _jsx("option", { value: 2, children: "Normal" }), _jsx("option", { value: 3, children: "Hair-trigger \u2014 it bolts at the first pressure" })] }) }), _jsx(Setting, { label: `Max drifts — ${state.settings.maxDrifts}`, children: _jsx("input", { type: "range", min: 0, max: 6, value: state.settings.maxDrifts, onChange: (e) => onSettings({ maxDrifts: Number(e.target.value) }), style: { width: '100%' } }) }), _jsxs("label", { className: "row", style: { fontSize: 13.5, cursor: 'pointer' }, children: [_jsx("input", { type: "checkbox", checked: state.settings.sharedBoard, onChange: (e) => onSettings({ sharedBoard: e.target.checked }) }), "Shared board \u2014 everyone sees every word played"] }), _jsxs("label", { className: "row", style: { fontSize: 13.5, cursor: 'pointer' }, children: [_jsx("input", { type: "checkbox", checked: state.settings.private, onChange: (e) => onSettings({ private: e.target.checked }) }), "Private \u2014 hide from matchmaking"] }), _jsx("button", { className: "btn primary block", onClick: onStart, children: enoughPlayers ? 'Start match' : 'Start anyway (solo)' })] })) : (_jsxs(_Fragment, { children: [_jsxs("p", { className: "muted", style: { marginTop: 0, fontSize: 13.5 }, children: [MODE_LABEL[state.settings.mode], " \u00B7 ", state.settings.rounds, " rounds \u00B7", ' ', DIFFICULTY_LABEL[state.settings.difficulty], " lexicon"] }), _jsx("button", { className: `btn block ${ready ? '' : 'primary'}`, onClick: () => onReady(!ready), children: ready ? 'Not ready' : "I'm ready" })] }))] }));
}
function Setting({ label, children }) {
    return (_jsxs("div", { className: "field", style: { marginBottom: 0 }, children: [_jsx("label", { children: label }), children] }));
}
