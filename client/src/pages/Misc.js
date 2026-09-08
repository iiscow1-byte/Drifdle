import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { errorMessage, toast, useSession } from '../lib/store.tsx';
import { Avatar, Spinner, StatTile } from '../components/ui.tsx';
import { MODE_LABEL, formatDuration, ordinal, relativeTime } from '../lib/format.ts';
const BOARDS = [
    { key: 'rating', label: 'Rating', unit: 'elo', blurb: 'Multiplayer Elo, updated after every match.' },
    { key: 'daily', label: "Today's daily", unit: 'guesses', blurb: 'Fewest guesses on today’s puzzle wins.' },
    { key: 'streak', label: 'Best streak', unit: 'days', blurb: 'Longest run of consecutive daily solves.' },
];
export function Leaderboard({ navigate }) {
    const { user } = useSession();
    const [board, setBoard] = useState('rating');
    const [rows, setRows] = useState(null);
    useEffect(() => {
        setRows(null);
        api
            .leaderboard(board)
            .then((r) => setRows(r.rows))
            .catch((err) => {
            toast(errorMessage(err), 'error');
            setRows([]);
        });
    }, [board]);
    const meta = BOARDS.find((b) => b.key === board);
    return (_jsxs("div", { className: "page", children: [_jsxs("div", { className: "page-head", children: [_jsx("h1", { children: "Leaderboards" }), _jsx("p", { children: meta.blurb })] }), _jsx("div", { className: "tabs", style: { maxWidth: 420 }, children: BOARDS.map((b) => (_jsx("button", { className: board === b.key ? 'active' : '', onClick: () => setBoard(b.key), children: b.label }, b.key))) }), _jsx("div", { className: "card", children: rows === null ? (_jsx("div", { style: { padding: 24, display: 'grid', placeItems: 'center' }, children: _jsx(Spinner, {}) })) : rows.length === 0 ? (_jsx("div", { className: "faint", style: { padding: '12px 2px', fontSize: 13.5 }, children: "Nothing here yet \u2014 be the first on the board." })) : (_jsxs("table", { className: "table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", {}), _jsx("th", { children: "Player" }), _jsx("th", { className: "num", children: meta.unit }), _jsx("th", {})] }) }), _jsx("tbody", { children: rows.map((r) => (_jsxs("tr", { className: r.userId === user?.id ? 'me' : '', children: [_jsx("td", { className: "place", children: r.place }), _jsx("td", { children: _jsxs("button", { className: "row", style: { background: 'none', border: 'none', padding: 0, textAlign: 'left' }, onClick: () => navigate('profile', r.displayName), children: [_jsx(Avatar, { src: r.avatar, name: r.displayName, size: "sm" }), _jsx("span", { style: { fontWeight: 600 }, children: r.displayName })] }) }), _jsx("td", { className: "num", style: { fontWeight: 700 }, children: r.value }), _jsx("td", { className: "faint", style: { fontSize: 12.5 }, children: r.detail ?? '' })] }, r.userId))) })] })) })] }));
}
/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */
export function Profile({ username }) {
    const { user, setDisplayName, logout } = useSession();
    const target = username ?? user?.username;
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [name, setName] = useState('');
    useEffect(() => {
        if (!target)
            return;
        setData(null);
        setError(null);
        api
            .profile(target)
            .then((d) => {
            setData(d);
            setName(d.user.displayName);
        })
            .catch((err) => setError(errorMessage(err)));
    }, [target]);
    if (!target) {
        return (_jsx("div", { className: "page center-screen", children: _jsx("p", { className: "muted", children: "Sign in to see your profile." }) }));
    }
    if (error) {
        return (_jsx("div", { className: "page center-screen", children: _jsx("p", { className: "muted", children: error }) }));
    }
    if (!data) {
        return (_jsx("div", { className: "page center-screen", children: _jsx(Spinner, {}) }));
    }
    const isMe = data.user.id === user?.id;
    const s = data.stats;
    return (_jsxs("div", { className: "page", children: [_jsx("div", { className: "card", style: { marginBottom: 16 }, children: _jsxs("div", { className: "row", style: { gap: 16, flexWrap: 'wrap' }, children: [_jsx(Avatar, { src: data.user.avatar, name: data.user.displayName, size: "lg" }), _jsxs("div", { className: "grow", children: [_jsxs("div", { className: "row", style: { gap: 8 }, children: [_jsx("h1", { style: { margin: 0, fontSize: 24, letterSpacing: '-0.02em' }, children: data.user.displayName }), data.user.guest && _jsx("span", { className: "chip", children: "guest" }), data.user.discordLinked && _jsx("span", { className: "chip", children: "discord" })] }), _jsxs("div", { className: "muted", style: { fontSize: 13.5 }, children: ["@", data.user.username, " \u00B7 joined ", relativeTime(data.user.createdAt), data.globalRank && ` · ${ordinal(data.globalRank)} by rating`] })] }), _jsxs("div", { style: { textAlign: 'right' }, children: [_jsx("div", { className: "faint", style: { fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em' }, children: "RATING" }), _jsx("div", { className: "mono", style: { fontSize: 30, fontWeight: 700 }, children: data.user.rating })] })] }) }), _jsxs("div", { className: "stat-grid", style: { marginBottom: 16 }, children: [_jsx(StatTile, { label: "Daily streak", value: s.currentStreak }), _jsx(StatTile, { label: "Best streak", value: s.bestStreak }), _jsx(StatTile, { label: "Dailies solved", value: `${s.dailySolved}/${s.dailyPlayed}` }), _jsx(StatTile, { label: "Rounds won", value: s.roundsWon }), _jsx(StatTile, { label: "Matches won", value: `${s.matchesWon}/${s.gamesPlayed}` }), _jsx(StatTile, { label: "Best rank", value: s.bestRank ?? '—' }), _jsx(StatTile, { label: "Avg guesses", value: s.averageGuesses ? s.averageGuesses.toFixed(1) : '—' }), _jsx(StatTile, { label: "Fastest win", value: s.fastestWinMs ? formatDuration(s.fastestWinMs) : '—' }), _jsx(StatTile, { label: "Drifts survived", value: s.driftsSurvived }), _jsx(StatTile, { label: "Echoes spent", value: s.echoesSpent })] }), _jsxs("div", { className: "game", style: { gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }, children: [_jsxs("div", { className: "card", children: [_jsx("h3", { children: "Recent matches" }), data.recentMatches.length === 0 ? (_jsx("div", { className: "faint", style: { fontSize: 13 }, children: "No multiplayer matches yet." })) : (_jsxs("table", { className: "table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Mode" }), _jsx("th", { className: "num", children: "Place" }), _jsx("th", { className: "num", children: "Score" }), _jsx("th", { className: "num", children: "When" })] }) }), _jsx("tbody", { children: data.recentMatches.map((m, i) => (_jsxs("tr", { children: [_jsx("td", { children: MODE_LABEL[m.mode] ?? m.mode }), _jsx("td", { className: "num", children: m.place ? ordinal(m.place) : '—' }), _jsx("td", { className: "num", children: m.score }), _jsx("td", { className: "num faint", style: { fontSize: 12.5 }, children: relativeTime(m.created_at) })] }, i))) })] }))] }), _jsxs("div", { children: [_jsxs("div", { className: "card", children: [_jsx("h3", { children: "Daily history" }), data.dailyHistory.length === 0 ? (_jsx("div", { className: "faint", style: { fontSize: 13 }, children: "No dailies played yet." })) : (_jsx("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 4 }, children: [...data.dailyHistory].reverse().map((d) => (_jsx("div", { title: `${d.date} — ${d.solved ? `${d.guess_count} guesses, ${d.drifts} drifts` : 'unsolved'}`, style: {
                                                width: 22,
                                                height: 22,
                                                borderRadius: 5,
                                                background: d.solved
                                                    ? `color-mix(in srgb, var(--ok) ${Math.max(18, 90 - d.guess_count * 3)}%, #0d1017)`
                                                    : '#171c29',
                                                border: '1px solid var(--line)',
                                            } }, d.date))) }))] }), isMe && (_jsxs("div", { className: "card", children: [_jsx("h3", { children: "Settings" }), _jsxs("div", { className: "field", children: [_jsx("label", { htmlFor: "dn", children: "Display name" }), _jsxs("div", { className: "row", children: [_jsx("input", { id: "dn", className: "input grow", value: name, onChange: (e) => setName(e.target.value), maxLength: 24 }), _jsx("button", { className: "btn", disabled: name.trim() === data.user.displayName || name.trim().length < 2, onClick: () => void setDisplayName(name.trim()).catch((e) => toast(errorMessage(e), 'error')), children: "Save" })] })] }), _jsx("button", { className: "btn danger block", onClick: () => void logout(), children: "Sign out" })] }))] })] })] }));
}
/* ------------------------------------------------------------------ */
/* How to play                                                         */
/* ------------------------------------------------------------------ */
export function HowToPlay({ navigate }) {
    return (_jsxs("div", { className: "page narrow", children: [_jsxs("div", { className: "page-head", children: [_jsx("h1", { children: "How Driftle works" }), _jsx("p", { children: "Two minutes of reading, then the rest is instinct." })] }), _jsxs("div", { className: "card", children: [_jsx("h3", { children: "1 \u00B7 Guess toward a meaning" }), _jsxs("p", { className: "muted", style: { marginTop: 0 }, children: ["There is a hidden word. Every word you play comes back with a ", _jsx("b", { children: "rank" }), ": 1 means you found it, 768 means you are as far away as the lexicon allows. Rank measures ", _jsx("em", { children: "meaning" }), ", not spelling \u2014", _jsx("span", { className: "mono", children: " wolf" }), " is near ", _jsx("span", { className: "mono", children: "fox" }), ", nowhere near", ' ', _jsx("span", { className: "mono", children: "wolves" }), "-adjacent letters."] })] }), _jsxs("div", { className: "card", children: [_jsx("h3", { children: "2 \u00B7 Proximity buys you letters" }), _jsxs("p", { className: "muted", style: { marginTop: 0 }, children: ["This is where Driftle stops being Contexto. The closer you get in meaning, the more of the answer\u2019s", ' ', _jsx("em", { children: "spelling" }), " you unlock:"] }), _jsxs("ul", { className: "muted", style: { marginTop: 0, paddingLeft: 18, lineHeight: 1.7 }, children: [_jsxs("li", { children: [_jsx("b", { children: "Rank 300" }), " \u2014 the compass appears, pointing along the axis you are most wrong about."] }), _jsxs("li", { children: [_jsx("b", { children: "Rank 250" }), " \u2014 the answer\u2019s length is revealed."] }), _jsxs("li", { children: [_jsx("b", { children: "Rank 120" }), " \u2014 letters you have in the right position light up green."] }), _jsxs("li", { children: [_jsx("b", { children: "Rank 40" }), " \u2014 letters that are in the word at all light up yellow."] })] })] }), _jsxs("div", { className: "card", children: [_jsx("h3", { children: "3 \u00B7 Get too close and it runs" }), _jsxs("p", { className: "muted", style: { marginTop: 0 }, children: ["Every near miss charges the ", _jsx("b", { children: "drift meter" }), ". When it fills, the answer moves to a neighbouring word \u2014 and every guess on the board is re-scored around the new one. Your rank 3 might become a rank 140 without you touching the keyboard."] }), _jsxs("p", { className: "muted", children: ["Two consequences worth internalising. First, a big lead is never safe, so a comeback is always live. Second, the drift can only land on words ", _jsx("em", { children: "nobody has played" }), " \u2014 so guessing around the answer fences it in, and if you fence it completely it ", _jsx("b", { children: "anchors" }), " and can never move again."] })] }), _jsxs("div", { className: "card", children: [_jsx("h3", { children: "4 \u00B7 Multiplayer is about information" }), _jsxs("p", { className: "muted", style: { marginTop: 0 }, children: ["In ", _jsx("b", { children: "The Commons" }), " everyone plays onto one board. You see every word your opponents try, but only its heat band \u2014 never the number. So every guess you make is a gift to the room, and the real skill is deciding when to spend information and when to hoard it."] }), _jsxs("p", { className: "muted", children: [_jsx("b", { children: "Echo tokens" }), " buy you an opponent\u2019s exact rank. But an Echo is public: the room sees who spent it and on what, which tells everyone exactly which word you think matters."] }), _jsxs("p", { className: "muted", children: ["Being hot has one more perk: your ", _jsx("b", { children: "cooldown shrinks" }), " as your rank improves, so a player closing in gets to guess faster than everyone else. That is usually when someone panics and triggers a drift."] })] }), _jsxs("div", { className: "row", style: { marginTop: 16 }, children: [_jsx("button", { className: "btn primary", onClick: () => navigate('daily'), children: "Play today\u2019s puzzle" }), _jsx("button", { className: "btn", onClick: () => navigate('home'), children: "Back" })] })] }));
}
