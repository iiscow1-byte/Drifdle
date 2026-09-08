import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
import { BAND_LABEL, bandClass, heatFraction } from '../lib/format.ts';
function Marks({ word, marks }) {
    return (_jsx("div", { className: "marks", "aria-label": "Letter feedback", children: word.split('').map((ch, i) => {
            const mark = marks[i] ?? 'hidden';
            return (_jsx("span", { className: `mark ${mark}`, children: mark === 'hidden' ? '·' : ch }, i));
        }) }));
}
export function GuessRow({ guess, isMine, detail, lexiconSize, canEcho, onEcho, fresh, rescored, }) {
    const known = detail ?? (guess.rank !== undefined ? guess : null);
    const fill = known?.rank !== undefined ? heatFraction(known.rank, lexiconSize) * 100 : 0;
    return (_jsxs("div", { className: [
            'guess',
            bandClass(guess.band),
            isMine ? 'mine' : '',
            fresh ? 'fresh' : '',
            rescored ? 'rescored' : '',
        ]
            .filter(Boolean)
            .join(' '), style: { '--fill': `${fill}%` }, children: [_jsxs("div", { className: "word", children: [_jsx("span", { children: guess.word }), !isMine && _jsx("span", { className: "who", children: guess.playerName })] }), _jsx("div", { className: "rank", children: known?.rank !== undefined ? (_jsxs(_Fragment, { children: [known.rank, guess.revealed && !isMine && _jsx("span", { className: "faint", children: " \u1D07" })] })) : canEcho && onEcho ? (_jsx("button", { className: "echo-btn", onClick: onEcho, title: "Spend an Echo token to reveal this exact rank", children: "Echo" })) : (_jsx("span", { className: "hidden-rank", children: BAND_LABEL[guess.band] })) }), detail && (detail.marks.some((m) => m !== 'hidden') || detail.compass) && (_jsxs("div", { className: "guess-detail", children: [detail.marks.some((m) => m !== 'hidden') && (_jsx(Marks, { word: detail.word, marks: detail.marks })), detail.compass && (_jsxs("span", { className: "compass", children: [_jsx("span", { className: "arrow", children: detail.compass.direction > 0 ? '↑' : '↓' }), detail.compass.text] })), detail.targetLength && (_jsxs("span", { className: "chip", children: [detail.targetLength, " letters"] }))] }))] }));
}
/**
 * The shared board. Sorted by heat, not by time: the point of the Commons is
 * that you can read the room's collective progress at a glance.
 */
export function Board({ board, mine, myId, lexiconSize, echoes, onEcho, rescored, sortBy = 'heat', }) {
    const scroller = useRef(null);
    const lastCount = useRef(board.length);
    useEffect(() => {
        if (sortBy === 'time' && board.length > lastCount.current) {
            scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
        }
        lastCount.current = board.length;
    }, [board.length, sortBy]);
    if (!board.length) {
        return (_jsx("div", { className: "board empty", children: _jsxs("div", { children: [_jsx("div", { style: { fontSize: 15, marginBottom: 4 }, children: "Nothing on the board yet." }), _jsx("div", { className: "faint", children: "Open with something broad \u2014 you are mapping a space, not spelling a word." })] }) }));
    }
    const ordered = [...board].sort((a, b) => {
        if (sortBy === 'time')
            return a.at - b.at;
        const ra = mine[a.id]?.rank ?? a.rank;
        const rb = mine[b.id]?.rank ?? b.rank;
        // Guesses with a known rank sort by it; unknown ones fall back to band.
        if (ra !== undefined && rb !== undefined)
            return ra - rb;
        if (ra !== undefined)
            return -1;
        if (rb !== undefined)
            return 1;
        return b.at - a.at;
    });
    const newest = board.reduce((max, g) => Math.max(max, g.at), 0);
    return (_jsx("div", { className: "board", ref: scroller, children: ordered.map((g) => (_jsx(GuessRow, { guess: g, isMine: g.playerId === myId, detail: mine[g.id], lexiconSize: lexiconSize, canEcho: Boolean(echoes && echoes > 0 && g.playerId !== myId && !g.revealed), onEcho: onEcho ? () => onEcho(g.id) : undefined, fresh: g.at === newest, rescored: rescored?.has(g.id) }, g.id))) }));
}
