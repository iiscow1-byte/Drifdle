import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from './socket.ts';
import { setPresence } from './discord.ts';
import { toast } from './store.tsx';
const EMPTY = {
    status: 'idle',
    state: null,
    mine: {},
    board: [],
    chat: [],
    drift: null,
    summary: null,
    standings: null,
    cooldownUntil: 0,
    rescored: new Set(),
    countdownAt: null,
};
export function useRoom() {
    const [view, setView] = useState(EMPTY);
    const driftTimer = useRef(null);
    useEffect(() => {
        const offStatus = socket.onStatus((status) => setView((v) => ({ ...v, status })));
        const off = socket.on((msg) => {
            switch (msg.t) {
                case 'room':
                    setView((v) => ({
                        ...v,
                        state: msg.state,
                        board: msg.state.board,
                        summary: msg.state.summary,
                        standings: msg.state.phase === 'matchEnd' ? v.standings : null,
                        countdownAt: msg.state.phase === 'countdown' ? msg.state.phaseEndsAt : null,
                    }));
                    break;
                case 'patch':
                    setView((v) => {
                        if (!v.state)
                            return v;
                        const state = {
                            ...v.state,
                            players: msg.players ?? v.state.players,
                            phase: msg.phase ?? v.state.phase,
                            phaseEndsAt: msg.phaseEndsAt !== undefined ? msg.phaseEndsAt : v.state.phaseEndsAt,
                            driftCharge: msg.driftCharge ?? v.state.driftCharge,
                            driftCap: msg.driftCap ?? v.state.driftCap,
                            turnPlayerId: msg.turnPlayerId !== undefined ? msg.turnPlayerId : v.state.turnPlayerId,
                            turnEndsAt: msg.turnEndsAt !== undefined ? msg.turnEndsAt : v.state.turnEndsAt,
                        };
                        return { ...v, state };
                    });
                    break;
                case 'guess':
                    setView((v) => ({ ...v, board: [...v.board, msg.guess] }));
                    break;
                case 'you':
                    setView((v) => {
                        // Our own guess arrives twice conceptually: once as the private
                        // detail, and (for others) as a public row. Merge them here.
                        const board = v.board.some((g) => g.id === msg.guess.id)
                            ? v.board.map((g) => (g.id === msg.guess.id ? msg.guess : g))
                            : [...v.board, msg.guess];
                        return { ...v, board, mine: { ...v.mine, [msg.guess.id]: msg.guess } };
                    });
                    break;
                case 'rescore':
                    setView((v) => {
                        const mine = {};
                        for (const g of msg.yours)
                            mine[g.id] = g;
                        return {
                            ...v,
                            board: msg.board.map((g) => mine[g.id] ?? g),
                            mine,
                            rescored: new Set(msg.board.map((g) => g.id)),
                            state: v.state ? { ...v.state, epoch: msg.epoch } : v.state,
                        };
                    });
                    window.setTimeout(() => setView((v) => ({ ...v, rescored: new Set() })), 900);
                    break;
                case 'drift':
                    setView((v) => ({
                        ...v,
                        drift: msg.event,
                        state: v.state
                            ? {
                                ...v.state,
                                driftCharge: msg.charge,
                                driftCap: msg.cap,
                                anchored: msg.anchored,
                                drifts: [...v.state.drifts, msg.event],
                                epoch: msg.event.epoch,
                            }
                            : v.state,
                    }));
                    if (driftTimer.current)
                        window.clearTimeout(driftTimer.current);
                    driftTimer.current = window.setTimeout(() => setView((v) => ({ ...v, drift: null })), 2200);
                    break;
                case 'countdown':
                    setView((v) => ({
                        ...v,
                        countdownAt: msg.startsAt,
                        summary: null,
                        standings: null,
                        mine: {},
                        board: [],
                        rescored: new Set(),
                    }));
                    break;
                case 'roundEnd':
                    setView((v) => ({
                        ...v,
                        summary: msg.summary,
                        state: v.state
                            ? { ...v.state, phase: 'roundEnd', players: msg.players, phaseEndsAt: msg.nextAt }
                            : v.state,
                    }));
                    break;
                case 'matchEnd':
                    setView((v) => ({
                        ...v,
                        standings: msg.standings,
                        summary: msg.summary ?? v.summary,
                        state: v.state
                            ? { ...v.state, phase: 'matchEnd', players: msg.players, phaseEndsAt: null }
                            : v.state,
                    }));
                    break;
                case 'echo':
                    setView((v) => ({
                        ...v,
                        board: v.board.map((g) => g.id === msg.guessId ? { ...g, rank: msg.rank, band: msg.band, revealed: true } : g),
                    }));
                    break;
                case 'chat':
                    setView((v) => ({ ...v, chat: [...v.chat.slice(-80), msg.line] }));
                    break;
                case 'cooldown':
                    setView((v) => ({ ...v, cooldownUntil: msg.until }));
                    break;
                case 'presence':
                    void setPresence({
                        details: msg.details,
                        state: msg.state,
                        partySize: msg.partySize,
                        partyMax: msg.partyMax,
                        endsAt: msg.endsAt,
                    });
                    break;
                case 'error':
                    toast(msg.message, 'error');
                    break;
            }
        });
        return () => {
            off();
            offStatus();
            if (driftTimer.current)
                window.clearTimeout(driftTimer.current);
        };
    }, []);
    const actions = {
        join: useCallback((opts) => socket.send({ t: 'join', ...opts }), []),
        leave: useCallback(() => {
            socket.send({ t: 'leave' });
            setView(EMPTY);
        }, []),
        guess: useCallback((word) => socket.send({ t: 'guess', word }), []),
        echo: useCallback((guessId) => socket.send({ t: 'echo', guessId }), []),
        ready: useCallback((value) => socket.send({ t: 'ready', value }), []),
        start: useCallback(() => socket.send({ t: 'start' }), []),
        settings: useCallback((patch) => socket.send({ t: 'settings', patch }), []),
        chat: useCallback((text) => socket.send({ t: 'chat', text }), []),
        emote: useCallback((key) => socket.send({ t: 'emote', key }), []),
        rematch: useCallback(() => socket.send({ t: 'rematch' }), []),
    };
    return [view, actions];
}
