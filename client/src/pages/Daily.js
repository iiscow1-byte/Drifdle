import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.ts';
import { errorMessage, toast, useSession } from '../lib/store.tsx';
import { GuessRow } from '../components/Board.tsx';
import { DriftFlash, DriftMeter, GuessInput } from '../components/GameBits.tsx';
import { Modal, Spinner } from '../components/ui.tsx';
export function Daily({ practice }) {
    const { user } = useSession();
    const [mode, setMode] = useState({ kind: 'daily' });
    const [state, setState] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [showResult, setShowResult] = useState(false);
    const [flash, setFlash] = useState(null);
    const [rescored, setRescored] = useState(false);
    const [lexiconSize, setLexiconSize] = useState(768);
    useEffect(() => {
        api.rules().then((r) => setLexiconSize(r.lexiconSize)).catch(() => { });
    }, []);
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const s = practice ? await api.practiceNew() : await api.daily();
            setState(s);
            setMode(practice ? { kind: 'practice', key: s.date.replace('practice:', '') } : { kind: 'daily' });
            if (s.solved)
                setShowResult(true);
        }
        catch (err) {
            toast(errorMessage(err), 'error');
        }
        finally {
            setLoading(false);
        }
    }, [practice]);
    useEffect(() => {
        if (user)
            void load();
    }, [user, load]);
    const guess = useCallback(async (word) => {
        if (!state || busy)
            return;
        setBusy(true);
        const driftsBefore = state.drifts.length;
        try {
            const res = mode.kind === 'practice'
                ? await api.practiceGuess(mode.key, word)
                : await api.dailyGuess(word);
            setState(res.state);
            if (res.state.drifts.length > driftsBefore) {
                const event = res.state.drifts[res.state.drifts.length - 1];
                setFlash(event);
                setRescored(true);
                window.setTimeout(() => setFlash(null), 2200);
                window.setTimeout(() => setRescored(false), 900);
            }
            if (res.solved)
                window.setTimeout(() => setShowResult(true), 700);
        }
        catch (err) {
            toast(errorMessage(err), 'error');
        }
        finally {
            setBusy(false);
        }
    }, [state, busy, mode]);
    const giveUp = useCallback(async () => {
        if (!state)
            return;
        try {
            const s = mode.kind === 'practice' ? await api.practiceGiveUp(mode.key) : await api.dailyGiveUp();
            setState(s);
            setShowResult(true);
        }
        catch (err) {
            toast(errorMessage(err), 'error');
        }
    }, [state, mode]);
    const startPractice = useCallback(async () => {
        setLoading(true);
        try {
            const s = await api.practiceNew();
            setState(s);
            setMode({ kind: 'practice', key: s.date.replace('practice:', '') });
            setShowResult(false);
        }
        catch (err) {
            toast(errorMessage(err), 'error');
        }
        finally {
            setLoading(false);
        }
    }, []);
    const sorted = useMemo(() => {
        if (!state)
            return [];
        return [...state.guesses].sort((a, b) => a.rank - b.rank);
    }, [state]);
    const best = sorted[0]?.rank ?? null;
    const newest = state?.guesses.reduce((m, g) => Math.max(m, g.at), 0) ?? 0;
    if (!user) {
        return (_jsx("div", { className: "page narrow center-screen", children: _jsxs("div", { children: [_jsx("h1", { style: { fontSize: 22 }, children: "Sign in to play" }), _jsx("p", { className: "muted", children: "The daily puzzle tracks your streak, so it needs an account \u2014 a guest account is fine." })] }) }));
    }
    if (loading || !state) {
        return (_jsx("div", { className: "page center-screen", children: _jsx(Spinner, {}) }));
    }
    const isPractice = mode.kind === 'practice';
    const done = state.solved || Boolean(state.target);
    return (_jsxs("div", { className: "page", children: [flash && _jsx(DriftFlash, { event: flash }), _jsxs("div", { className: "page-head spread", style: { flexWrap: 'wrap' }, children: [_jsxs("div", { children: [_jsx("h1", { children: isPractice ? 'Practice run' : `Driftle #${state.number}` }), _jsx("p", { children: isPractice
                                    ? 'A throwaway puzzle. Nothing here touches your streak.'
                                    : 'One puzzle a day, the same for everybody. Your streak is on the line.' })] }), _jsxs("div", { className: "row", children: [!done && (_jsx("button", { className: "btn sm", onClick: () => void giveUp(), children: "Give up" })), _jsx("button", { className: "btn sm", onClick: () => void startPractice(), children: "New practice run" })] })] }), _jsxs("div", { className: "status-strip", children: [_jsxs("div", { className: "stat", children: [_jsx("div", { className: "k", children: "Guesses" }), _jsx("div", { className: "v", children: state.guesses.length })] }), _jsx("div", { className: "divider" }), _jsxs("div", { className: "stat", children: [_jsx("div", { className: "k", children: "Best rank" }), _jsx("div", { className: "v", children: best ?? '—' })] }), _jsx("div", { className: "divider" }), _jsxs("div", { className: "stat", children: [_jsx("div", { className: "k", children: "Word length" }), _jsx("div", { className: "v", children: state.targetLengthKnown ?? '?' })] }), _jsx("div", { className: "divider" }), _jsxs("div", { className: "stat", children: [_jsx("div", { className: "k", children: "Epoch" }), _jsx("div", { className: "v", children: state.epoch })] }), _jsx("div", { className: "grow" }), _jsx("div", { style: { minWidth: 190 }, children: _jsx(DriftMeter, { charge: state.driftCharge, cap: state.driftCap, anchored: state.anchored, drifts: state.drifts.filter((d) => !d.headline.startsWith('ANCHORED')).length, maxDrifts: 3 }) })] }), _jsxs("div", { className: "game", style: { gridTemplateColumns: 'minmax(0,1fr) 300px' }, children: [_jsxs("div", { children: [!done && (_jsx(GuessInput, { onGuess: (w) => void guess(w), disabled: busy, placeholder: state.guesses.length === 0 ? 'Start broad — try “ocean” or “memory”…' : 'Type a word…' })), done && (_jsxs("div", { className: "card", style: { marginBottom: 12, textAlign: 'center' }, children: [_jsx("div", { className: "faint", style: { fontSize: 11, letterSpacing: '0.1em', fontWeight: 800 }, children: state.solved ? 'SOLVED' : 'THE ANSWER WAS' }), _jsx("div", { className: "mono", style: { fontSize: 28, fontWeight: 700, color: 'var(--band-exact)' }, children: state.target }), _jsx("button", { className: "btn sm", style: { marginTop: 10 }, onClick: () => setShowResult(true), children: "See the summary" })] })), sorted.length === 0 ? (_jsx("div", { className: "board empty", children: _jsxs("div", { children: [_jsx("div", { style: { fontSize: 15, marginBottom: 4 }, children: "Nothing on the board yet." }), _jsx("div", { className: "faint", children: "You are searching a map of meaning, not spelling a word. Open somewhere broad." })] }) })) : (_jsx("div", { className: "board", children: sorted.map((g) => (_jsx(GuessRow, { guess: g, detail: g, isMine: true, lexiconSize: lexiconSize, fresh: g.at === newest, rescored: rescored }, g.id))) }))] }), _jsxs("div", { children: [_jsxs("div", { className: "card", children: [_jsx("h3", { children: "Reading the board" }), _jsxs("ul", { className: "muted", style: { margin: 0, paddingLeft: 18, fontSize: 13.2, lineHeight: 1.65 }, children: [_jsxs("li", { children: [_jsx("b", { children: "Rank" }), " is how close your word is in meaning \u2014 1 is the answer, 768 is as far as it gets."] }), _jsxs("li", { children: ["Under rank 250 the answer\u2019s ", _jsx("b", { children: "length" }), " appears. Under 120 you start seeing ", _jsx("b", { children: "letters" }), " in the right place, and under 40, letters that are simply in the word."] }), _jsxs("li", { children: ["The ", _jsx("b", { children: "compass" }), " points along the axis you are furthest off \u2014 bigger, older, more abstract."] })] })] }), _jsxs("div", { className: "card", children: [_jsx("h3", { children: "Drift" }), _jsxs("p", { className: "muted", style: { margin: 0, fontSize: 13.2, lineHeight: 1.65 }, children: ["Every near miss charges the meter. When it fills, the answer moves to a neighbouring word and your whole board is re-scored \u2014 so a rank 4 can become a rank 90 without you playing a thing. Words already on the board can never be drift destinations, so guessing around the answer slowly fences it in. Corner it completely and it ", _jsx("b", { children: "anchors" }), " for good."] })] }), state.drifts.length > 0 && (_jsxs("div", { className: "card", children: [_jsx("h3", { children: "Drift log" }), _jsx("div", { className: "stack", style: { gap: 7 }, children: state.drifts.map((d, i) => (_jsxs("div", { className: "muted", style: { fontSize: 12.5 }, children: [_jsxs("b", { className: "mono", children: ["#", i + 1] }), " ", d.headline] }, i))) })] }))] })] }), showResult && state.target && (_jsx(ResultModal, { state: state, onClose: () => setShowResult(false), isPractice: isPractice, onPractice: () => void startPractice() }))] }));
}
function ResultModal({ state, onClose, isPractice, onPractice, }) {
    const [share, setShare] = useState(null);
    useEffect(() => {
        if (isPractice)
            return;
        api.dailyShare().then((r) => setShare(r.text)).catch(() => { });
    }, [isPractice]);
    const chain = state.chain ?? [];
    return (_jsxs(Modal, { title: state.solved ? 'Caught it.' : 'It got away.', subtitle: state.solved
            ? `Solved in ${state.guesses.length} guesses across ${state.epoch} drift${state.epoch === 1 ? '' : 's'}.`
            : 'The answer is revealed below. Your streak resets, but the practice runs are unlimited.', onClose: onClose, children: [_jsxs("div", { className: "summary-target", children: [_jsx("div", { className: "label", children: "The answer was" }), _jsx("div", { className: "word", children: state.target })] }), chain.length > 1 && (_jsxs(_Fragment, { children: [_jsx("div", { className: "faint", style: { textAlign: 'center', fontSize: 11, letterSpacing: '0.1em', fontWeight: 800 }, children: "IT STARTED SOMEWHERE ELSE" }), _jsx("div", { className: "chain", children: chain.map((w, i) => (_jsxs("span", { children: [i > 0 && _jsx("span", { className: "sep", children: "\u2192 " }), _jsx("span", { className: `link${i === chain.length - 1 ? ' final' : ''}`, children: w })] }, `${w}-${i}`))) })] })), share && (_jsxs(_Fragment, { children: [_jsx("div", { className: "divider-text", children: "share" }), _jsx("pre", { className: "mono", style: {
                            background: '#0d1017',
                            border: '1px solid var(--line)',
                            borderRadius: 8,
                            padding: 12,
                            fontSize: 13,
                            margin: 0,
                            whiteSpace: 'pre-wrap',
                        }, children: share }), _jsx("button", { className: "btn block", style: { marginTop: 10 }, onClick: () => {
                            navigator.clipboard
                                .writeText(share)
                                .then(() => toast('Copied — no spoilers in it.', 'good'))
                                .catch(() => toast('Could not access the clipboard.', 'error'));
                        }, children: "Copy result" })] })), _jsx("button", { className: "btn primary block", style: { marginTop: 10 }, onClick: onPractice, children: "Play a practice run" })] }));
}
