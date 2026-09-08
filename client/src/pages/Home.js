import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { useSession } from '../lib/store.tsx';
import { DIFFICULTY_LABEL, MODE_LABEL } from '../lib/format.ts';
import { DriftMark } from '../components/ui.tsx';
export function Home({ navigate, onRequireAuth, }) {
    const { user, stats, discord } = useSession();
    const [rooms, setRooms] = useState([]);
    const [code, setCode] = useState('');
    useEffect(() => {
        let alive = true;
        const load = () => api
            .rooms()
            .then((r) => alive && setRooms(r.rooms))
            .catch(() => { });
        void load();
        const id = window.setInterval(load, 8000);
        return () => {
            alive = false;
            window.clearInterval(id);
        };
    }, []);
    function go(target, param) {
        if (!user) {
            onRequireAuth();
            return;
        }
        navigate(target, param);
    }
    // Inside a Discord Activity the channel *is* the lobby, so lead with that.
    if (discord.embedded && discord.ready) {
        return (_jsxs("div", { className: "page", children: [_jsxs("div", { className: "hero", style: { paddingTop: 18 }, children: [_jsx(DriftMark, {}), _jsx("h1", { style: { fontSize: 'clamp(28px,6vw,42px)' }, children: "Driftle" }), _jsx("p", { children: "Everyone in this channel shares one board. Guess your way toward a hidden word \u2014 and watch it run when someone gets too close." }), _jsxs("div", { className: "cta", children: [_jsx("button", { className: "btn primary lg", onClick: () => navigate('play', 'activity'), children: "Play with this channel" }), _jsx("button", { className: "btn lg", onClick: () => navigate('daily'), children: "Today\u2019s puzzle" })] })] }), _jsx(QuickModes, { onPick: (m) => navigate('play', `new:${m}`) })] }));
    }
    return (_jsxs("div", { className: "page", children: [_jsxs("section", { className: "hero", children: [_jsx("h1", { children: "The answer moves." }), _jsxs("p", { children: ["Driftle is a word game about closing in on a hidden word \u2014 and about what happens when you close in too fast. Get near enough and the answer ", _jsx("em", { children: "drifts" }), ": it slips to a neighbouring word, and every guess on the board is re-scored around it."] }), _jsxs("div", { className: "cta", children: [_jsx("button", { className: "btn primary lg", onClick: () => go('daily'), children: "Play today\u2019s Driftle" }), _jsx("button", { className: "btn lg", onClick: () => go('play', 'quick:commons'), children: "Find a multiplayer game" }), _jsx("button", { className: "btn ghost lg", onClick: () => navigate('how'), children: "How it works" })] })] }), user && stats && (_jsx("section", { className: "card", style: { marginBottom: 18 }, children: _jsxs("div", { className: "spread", style: { flexWrap: 'wrap' }, children: [_jsxs("div", { children: [_jsx("div", { className: "faint", style: { fontSize: 12 }, children: "Signed in as" }), _jsxs("div", { style: { fontWeight: 700, fontSize: 16 }, children: [user.displayName, user.guest && _jsx("span", { className: "chip", style: { marginLeft: 8 }, children: "guest" })] })] }), _jsxs("div", { className: "row", style: { gap: 20 }, children: [_jsx(Metric, { label: "Rating", value: user.rating }), _jsx(Metric, { label: "Streak", value: stats.currentStreak }), _jsx(Metric, { label: "Rounds won", value: stats.roundsWon })] }), _jsx("button", { className: "btn sm", onClick: () => navigate('profile', user.username), children: "View profile" })] }) })), _jsxs("section", { style: { marginBottom: 20 }, children: [_jsx("h2", { className: "page-head", style: { fontSize: 18, marginBottom: 12 }, children: "Multiplayer modes" }), _jsx(QuickModes, { onPick: (m) => go('play', `quick:${m}`) })] }), _jsxs("section", { className: "game", style: { gridTemplateColumns: 'minmax(0,1fr) 320px' }, children: [_jsxs("div", { className: "card", children: [_jsx("h3", { children: "Open rooms" }), rooms.length === 0 ? (_jsx("div", { className: "faint", style: { fontSize: 13.5, padding: '10px 2px' }, children: "No public rooms right now. Start one \u2014 matchmaking will drop the next player in with you." })) : (_jsxs("table", { className: "table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Code" }), _jsx("th", { children: "Mode" }), _jsx("th", { children: "Lexicon" }), _jsx("th", { className: "num", children: "Players" }), _jsx("th", {})] }) }), _jsx("tbody", { children: rooms.map((r) => (_jsxs("tr", { children: [_jsx("td", { className: "mono", style: { fontWeight: 700 }, children: r.code }), _jsx("td", { children: MODE_LABEL[r.mode] ?? r.mode }), _jsx("td", { className: "muted", children: DIFFICULTY_LABEL[r.difficulty] }), _jsxs("td", { className: "num", children: [r.players, "/", r.max] }), _jsx("td", { style: { textAlign: 'right' }, children: _jsx("button", { className: "btn sm", onClick: () => go('play', `code:${r.code}`), children: "Join" }) })] }, r.code))) })] }))] }), _jsxs("div", { children: [_jsxs("div", { className: "card", children: [_jsx("h3", { children: "Join with a code" }), _jsxs("form", { className: "row", onSubmit: (e) => {
                                            e.preventDefault();
                                            if (code.trim())
                                                go('play', `code:${code.trim().toUpperCase()}`);
                                        }, children: [_jsx("input", { className: "input grow mono", value: code, onChange: (e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')), placeholder: "ABCD", maxLength: 4, style: { letterSpacing: '0.24em', fontWeight: 700 }, "aria-label": "Room code" }), _jsx("button", { className: "btn primary", type: "submit", disabled: code.length < 4, children: "Join" })] })] }), _jsxs("div", { className: "card", children: [_jsx("h3", { children: "Private room" }), _jsx("p", { className: "muted", style: { fontSize: 13, marginTop: 0 }, children: "Make a room only your friends can reach, then share the four-letter code." }), _jsx("button", { className: "btn block", onClick: () => go('play', 'private:commons'), children: "Create private room" })] })] })] })] }));
}
function Metric({ label, value }) {
    return (_jsxs("div", { children: [_jsx("div", { className: "faint", style: { fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }, children: label }), _jsx("div", { className: "mono", style: { fontSize: 18, fontWeight: 700 }, children: value })] }));
}
const MODES = [
    {
        key: 'commons',
        title: 'The Commons',
        icon: '🗺️',
        desc: 'One shared board. Everyone sees every word played — but only a heat band, never the exact rank. Information is a commons, and spending an Echo to read someone’s rank tells the room what you care about.',
        foot: '2–8 players · 3 rounds · 5 min each',
    },
    {
        key: 'blitz',
        title: 'Blitz Drift',
        icon: '⚡',
        desc: 'Short fuse, short cooldowns, two drifts. The meter fills fast and the answer is rarely where you left it. Five quick rounds decide the match.',
        foot: '2–8 players · 5 rounds · 2 min each',
    },
    {
        key: 'relay',
        title: 'Relay',
        icon: '🔗',
        desc: 'Strict turn order, one guess each, 25 seconds on the clock. No cooldowns and nowhere to hide — a bad guess is a wasted turn for your whole side of the table.',
        foot: '2–8 players · 3 rounds · turn-based',
    },
];
function QuickModes({ onPick }) {
    return (_jsx("div", { className: "mode-grid", children: MODES.map((m) => (_jsxs("button", { className: "mode", onClick: () => onPick(m.key), children: [_jsxs("div", { className: "title", children: [_jsx("span", { "aria-hidden": "true", children: m.icon }), m.title] }), _jsx("div", { className: "desc", children: m.desc }), _jsx("div", { className: "foot", children: m.foot })] }, m.key))) }));
}
