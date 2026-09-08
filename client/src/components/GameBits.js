import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { Avatar, BandDot } from './ui.tsx';
import { formatClock, formatDuration } from '../lib/format.ts';
/* ------------------------------------------------------------------ */
/* Drift meter                                                         */
/* ------------------------------------------------------------------ */
export function DriftMeter({ charge, cap, anchored, drifts, maxDrifts, }) {
    const pct = cap > 0 ? Math.min(100, (charge / cap) * 100) : 0;
    const critical = pct > 72 && !anchored;
    return (_jsxs("div", { className: `drift${critical ? ' critical' : ''}${anchored ? ' anchored' : ''}`, children: [_jsxs("div", { className: "drift-head", children: [_jsx("span", { className: "title", children: anchored ? 'Anchored' : 'Drift charge' }), _jsx("span", { className: "value", children: anchored ? 'locked' : `${Math.round(charge)}/${cap}` })] }), _jsx("div", { className: "drift-track", children: _jsx("div", { className: "drift-fill", style: { width: anchored ? '100%' : `${pct}%` } }) }), _jsx("div", { className: "drift-note", children: anchored
                    ? 'The answer can no longer move. Close it out.'
                    : critical
                        ? 'One more near miss and it runs.'
                        : `${drifts}/${maxDrifts} drifts used — near guesses charge the meter.` })] }));
}
export function DriftFlash({ event }) {
    const anchored = event.headline.startsWith('ANCHORED');
    return (_jsx("div", { className: "drift-flash", children: _jsxs("div", { className: "inner", children: [_jsx("h2", { children: anchored ? 'Anchored' : 'Drift' }), _jsx("p", { children: event.headline }), !anchored && (_jsx("p", { className: "faint", style: { marginTop: 6, fontSize: 12.5 }, children: "Every guess on the board has been re-scored." }))] }) }));
}
/* ------------------------------------------------------------------ */
/* Guess input                                                         */
/* ------------------------------------------------------------------ */
export function GuessInput({ onGuess, disabled, cooldownUntil, baseCooldownMs, placeholder = 'Type a word…', }) {
    const [value, setValue] = useState('');
    const [remaining, setRemaining] = useState(0);
    const input = useRef(null);
    useEffect(() => {
        if (!cooldownUntil) {
            setRemaining(0);
            return;
        }
        const tick = () => setRemaining(Math.max(0, cooldownUntil - Date.now()));
        tick();
        const id = window.setInterval(tick, 60);
        return () => window.clearInterval(id);
    }, [cooldownUntil]);
    const cooling = remaining > 0;
    const blocked = disabled || cooling;
    function submit(e) {
        e.preventDefault();
        const word = value.trim().toLowerCase();
        if (!word || blocked)
            return;
        onGuess(word);
        setValue('');
        input.current?.focus();
    }
    const scale = cooling && baseCooldownMs ? Math.min(1, remaining / baseCooldownMs) : 0;
    return (_jsxs(_Fragment, { children: [_jsxs("form", { className: "guess-form", onSubmit: submit, children: [_jsx("input", { ref: input, className: "input grow", value: value, onChange: (e) => setValue(e.target.value.replace(/[^a-zA-Z]/g, '')), placeholder: cooling ? `Cooling down… ${(remaining / 1000).toFixed(1)}s` : placeholder, disabled: disabled, autoComplete: "off", autoCapitalize: "off", autoCorrect: "off", spellCheck: false, maxLength: 14, "aria-label": "Your guess" }), _jsx("button", { className: "btn primary", type: "submit", disabled: blocked || !value.trim(), children: "Guess" })] }), cooling && (_jsx("div", { className: "cooldown-bar", style: { transform: `scaleX(${scale})` }, "aria-hidden": "true" }))] }));
}
/* ------------------------------------------------------------------ */
/* Players                                                             */
/* ------------------------------------------------------------------ */
export function PlayerList({ players, myId, turnPlayerId, showScore = true, }) {
    return (_jsx("div", { className: "players", children: players.map((p) => (_jsxs("div", { className: [
                'player',
                p.id === myId ? 'you' : '',
                p.connected ? '' : 'offline',
                turnPlayerId === p.id ? 'turn' : '',
            ]
                .filter(Boolean)
                .join(' '), children: [_jsx(Avatar, { src: p.avatar, name: p.name, size: "sm" }), _jsxs("div", { style: { minWidth: 0 }, children: [_jsxs("div", { className: "name", children: [_jsx("span", { children: p.name }), p.host && _jsx("span", { className: "crown", title: "Host", children: "\u265B" }), p.ready && _jsx("span", { style: { color: 'var(--ok)', fontSize: 11 }, children: "ready" })] }), _jsxs("div", { className: "meta", children: [p.bestBand ? (_jsxs(_Fragment, { children: [_jsx(BandDot, { band: p.bestBand }), p.id === myId && p.bestRank !== null ? `rank ${p.bestRank}` : p.bestBand] })) : (_jsx("span", { className: "faint", children: "no guesses" })), _jsxs("span", { className: "faint", children: ["\u00B7 ", p.guesses] }), p.echoes > 0 && (_jsx("span", { className: "echoes", title: `${p.echoes} Echo tokens`, children: Array.from({ length: Math.min(p.echoes, 5) }).map((_, i) => (_jsx("span", { className: "echo-pip" }, i))) }))] })] }), showScore && _jsx("div", { className: "score", children: p.score })] }, p.id))) }));
}
/* ------------------------------------------------------------------ */
/* Chat                                                                */
/* ------------------------------------------------------------------ */
const EMOTES = [
    { key: 'hot', label: '🔥 burning' },
    { key: 'cold', label: '🧊 freezing' },
    { key: 'nice', label: '👏 nice' },
    { key: 'oof', label: '💀 oof' },
    { key: 'drift', label: '🌀 drift it' },
    { key: 'gg', label: '🤝 gg' },
];
const EMOTE_TEXT = {
    hot: 'is burning up 🔥',
    cold: 'says ice cold 🧊',
    nice: 'says nice one 👏',
    oof: 'says oof 💀',
    drift: 'wants a drift 🌀',
    gg: 'says gg 🤝',
};
export function Chat({ lines, onSend, onEmote, }) {
    const [value, setValue] = useState('');
    const log = useRef(null);
    useEffect(() => {
        log.current?.scrollTo({ top: log.current.scrollHeight });
    }, [lines.length]);
    return (_jsxs("div", { className: "chat", children: [_jsxs("div", { className: "chat-log", ref: log, children: [lines.length === 0 && _jsx("div", { className: "faint", style: { fontSize: 12.5 }, children: "Quiet in here." }), lines.map((l) => (_jsx("div", { className: `chat-line ${l.kind}`, children: l.kind === 'system' ? (l.text) : l.kind === 'emote' ? (_jsxs(_Fragment, { children: [_jsx("span", { className: "who", children: l.name }), " ", EMOTE_TEXT[l.text] ?? l.text] })) : (_jsxs(_Fragment, { children: [_jsx("span", { className: "who", children: l.name }), " ", l.text] })) }, l.id)))] }), _jsx("div", { className: "emote-bar", children: EMOTES.map((e) => (_jsx("button", { onClick: () => onEmote(e.key), type: "button", children: e.label }, e.key))) }), _jsxs("form", { className: "row", onSubmit: (e) => {
                    e.preventDefault();
                    const text = value.trim();
                    if (!text)
                        return;
                    onSend(text);
                    setValue('');
                }, children: [_jsx("input", { className: "input grow", value: value, onChange: (e) => setValue(e.target.value), placeholder: "Say something\u2026", maxLength: 240, "aria-label": "Chat message" }), _jsx("button", { className: "btn sm", type: "submit", disabled: !value.trim(), children: "Send" })] })] }));
}
/* ------------------------------------------------------------------ */
/* Round summary                                                       */
/* ------------------------------------------------------------------ */
export function SummaryPanel({ summary }) {
    const chain = summary.chain ?? [];
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "summary-target", children: [_jsx("div", { className: "label", children: "The answer was" }), _jsx("div", { className: "word", children: summary.target })] }), chain.length > 1 && (_jsxs(_Fragment, { children: [_jsx("div", { className: "label faint", style: { textAlign: 'center', fontSize: 11, letterSpacing: '0.1em' }, children: "IT STARTED SOMEWHERE ELSE" }), _jsx("div", { className: "chain", children: chain.map((w, i) => (_jsxs("span", { children: [i > 0 && _jsx("span", { className: "sep", children: "\u2192 " }), _jsx("span", { className: `link${i === chain.length - 1 ? ' final' : ''}`, children: w })] }, `${w}-${i}`))) })] })), _jsxs("div", { className: "row", style: { justifyContent: 'center', marginTop: 16, gap: 18 }, children: [_jsxs("div", { className: "stat", children: [_jsx("div", { className: "k faint", style: { fontSize: 10, letterSpacing: '0.08em' }, children: "WINNER" }), _jsx("div", { style: { fontWeight: 700 }, children: summary.winnerName ?? 'Nobody' })] }), _jsxs("div", { className: "stat", children: [_jsx("div", { className: "k faint", style: { fontSize: 10, letterSpacing: '0.08em' }, children: "DRIFTS" }), _jsx("div", { style: { fontWeight: 700 }, className: "mono", children: summary.drifts })] }), _jsxs("div", { className: "stat", children: [_jsx("div", { className: "k faint", style: { fontSize: 10, letterSpacing: '0.08em' }, children: "TIME" }), _jsx("div", { style: { fontWeight: 700 }, className: "mono", children: formatDuration(summary.durationMs) })] })] }), summary.awards.length > 0 && (_jsx("div", { className: "awards", style: { marginTop: 18 }, children: summary.awards.map((a, i) => (_jsxs("div", { className: "award", children: [_jsxs("div", { children: [_jsx("div", { className: "label", children: a.label }), _jsxs("div", { className: "detail", children: [a.playerName, " \u2014 ", a.detail] })] }), _jsxs("div", { className: "pts", children: ["+", a.points] })] }, `${a.label}-${i}`))) }))] }));
}
export function Countdown({ endsAt, label }) {
    const [remaining, setRemaining] = useState(endsAt - Date.now());
    useEffect(() => {
        const id = window.setInterval(() => setRemaining(endsAt - Date.now()), 100);
        return () => window.clearInterval(id);
    }, [endsAt]);
    return (_jsxs("span", { className: "mono", children: [label, " ", formatClock(remaining)] }));
}
