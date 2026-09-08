import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useRoute, useSession } from './lib/store.tsx';
import { Toasts, DriftMark, Avatar, Spinner } from './components/ui.tsx';
import { AuthModal } from './pages/Auth.tsx';
import { Home } from './pages/Home.tsx';
import { Daily } from './pages/Daily.tsx';
import { Play } from './pages/Play.tsx';
import { HowToPlay, Leaderboard, Profile } from './pages/Misc.tsx';
const NAV = [
    { key: 'daily', label: 'Daily' },
    { key: 'play', label: 'Multiplayer', param: 'quick:commons' },
    { key: 'leaderboard', label: 'Leaders' },
    { key: 'how', label: 'How to play' },
];
export function App() {
    const { user, loading, discord } = useSession();
    const [route, navigate] = useRoute();
    const [auth, setAuth] = useState(null);
    // Report the outcome of the browser Discord OAuth round-trip.
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const flag = params.get('discord');
        if (!flag)
            return;
        history.replaceState(null, '', location.pathname + location.hash);
    }, []);
    if (loading) {
        return (_jsx("div", { className: "app", children: _jsx("div", { className: "center-screen", children: _jsxs("div", { className: "stack", style: { alignItems: 'center' }, children: [_jsx(DriftMark, {}), _jsx(Spinner, {}), _jsx("div", { className: "faint", style: { fontSize: 13 }, children: discord.embedded ? 'Connecting to Discord…' : 'Loading Driftle…' })] }) }) }));
    }
    // A hard failure inside the Activity is worth explaining rather than hiding.
    if (discord.embedded && discord.error && !user) {
        return (_jsx("div", { className: "app", children: _jsx("div", { className: "center-screen page narrow", children: _jsxs("div", { className: "card", children: [_jsx("h3", { children: "Discord could not sign you in" }), _jsx("p", { className: "muted", style: { marginTop: 0 }, children: discord.error }), _jsx("p", { className: "faint", style: { fontSize: 12.5 }, children: "Driftle still works in a browser \u2014 open it outside Discord and play there." })] }) }) }));
    }
    const page = (() => {
        switch (route.name) {
            case 'daily':
                return _jsx(Daily, {});
            case 'practice':
                return _jsx(Daily, { practice: true });
            case 'play':
                return _jsx(Play, { param: route.param, navigate: navigate });
            case 'leaderboard':
                return _jsx(Leaderboard, { navigate: navigate });
            case 'profile':
                return _jsx(Profile, { username: route.param });
            case 'how':
                return _jsx(HowToPlay, { navigate: navigate });
            default:
                return _jsx(Home, { navigate: navigate, onRequireAuth: () => setAuth('signup') });
        }
    })();
    return (_jsxs("div", { className: `app${discord.embedded ? ' embedded' : ''}`, children: [_jsxs("header", { className: "topbar", children: [_jsxs("button", { className: "brand", style: { background: 'none', border: 'none', padding: 0 }, onClick: () => navigate('home'), children: [_jsx(DriftMark, {}), "Driftle", _jsx("span", { className: "tag", children: "the answer moves" })] }), _jsx("nav", { className: "nav", children: NAV.map((n) => (_jsx("button", { className: route.name === n.key ? 'active' : '', onClick: () => {
                                if (!user && n.key !== 'how' && n.key !== 'leaderboard') {
                                    setAuth('signup');
                                    return;
                                }
                                navigate(n.key, n.param);
                            }, children: n.label }, n.key))) }), _jsx("div", { className: "grow" }), user ? (_jsxs("div", { className: "row", style: { gap: 8 }, children: [user.guest && (_jsx("button", { className: "btn sm primary", onClick: () => setAuth('signup'), children: "Save progress" })), _jsxs("button", { className: "row", style: { background: 'none', border: 'none', padding: 0, gap: 8 }, onClick: () => navigate('profile', user.username), title: "Your profile", children: [_jsx(Avatar, { src: user.avatar, name: user.displayName }), _jsx("span", { style: { fontWeight: 600, fontSize: 13.5 }, className: "hide-sm", children: user.displayName })] })] })) : (_jsxs("div", { className: "row", style: { gap: 6 }, children: [_jsx("button", { className: "btn sm ghost", onClick: () => setAuth('login'), children: "Log in" }), _jsx("button", { className: "btn sm primary", onClick: () => setAuth('signup'), children: "Sign up" })] }))] }), page, auth && _jsx(AuthModal, { initial: auth, onClose: () => setAuth(null) }), _jsx(Toasts, {})] }));
}
