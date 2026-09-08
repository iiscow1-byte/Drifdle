import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { BASE } from '../lib/api.ts';
import { errorMessage, useSession } from '../lib/store.tsx';
import { openExternal } from '../lib/discord.ts';
import { Modal, Spinner } from '../components/ui.tsx';
export function AuthModal({ onClose, initial = 'signup' }) {
    const { signup, login, playAsGuest, config, discord, user } = useSession();
    const [tab, setTab] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loginId, setLoginId] = useState('');
    const [loginPw, setLoginPw] = useState('');
    const upgrading = user?.guest === true;
    async function run(fn) {
        setBusy(true);
        setError(null);
        try {
            await fn();
            onClose();
        }
        catch (err) {
            setError(errorMessage(err));
        }
        finally {
            setBusy(false);
        }
    }
    function onSignup(e) {
        e.preventDefault();
        void run(() => signup({ username: username.trim(), email: email.trim(), password }));
    }
    function onLogin(e) {
        e.preventDefault();
        void run(() => login({ login: loginId.trim(), password: loginPw }));
    }
    return (_jsxs(Modal, { title: upgrading ? 'Keep your progress' : tab === 'signup' ? 'Create an account' : 'Welcome back', subtitle: upgrading
            ? 'You are playing as a guest. Claim the account and every stat, streak and rating you have already earned comes with you.'
            : tab === 'signup'
                ? 'Ratings, streaks and daily history, saved across devices.'
                : 'Sign in to pick up where you left off.', onClose: onClose, children: [!upgrading && (_jsxs("div", { className: "tabs", children: [_jsx("button", { className: tab === 'signup' ? 'active' : '', onClick: () => setTab('signup'), children: "Sign up" }), _jsx("button", { className: tab === 'login' ? 'active' : '', onClick: () => setTab('login'), children: "Log in" })] })), tab === 'signup' || upgrading ? (_jsxs("form", { onSubmit: onSignup, children: [_jsxs("div", { className: "field", children: [_jsx("label", { htmlFor: "su-user", children: "Username" }), _jsx("input", { id: "su-user", className: "input", value: username, onChange: (e) => setUsername(e.target.value), placeholder: "driftwalker", autoComplete: "username", required: true }), _jsx("span", { className: "hint", children: "3\u201320 characters: letters, numbers and underscores." })] }), _jsxs("div", { className: "field", children: [_jsx("label", { htmlFor: "su-email", children: "Email" }), _jsx("input", { id: "su-email", className: "input", type: "email", value: email, onChange: (e) => setEmail(e.target.value), placeholder: "you@example.com", autoComplete: "email", required: true })] }), _jsxs("div", { className: "field", children: [_jsx("label", { htmlFor: "su-pw", children: "Password" }), _jsx("input", { id: "su-pw", className: "input", type: "password", value: password, onChange: (e) => setPassword(e.target.value), autoComplete: "new-password", minLength: 8, required: true }), _jsx("span", { className: "hint", children: "At least 8 characters." })] }), error && _jsx("div", { className: "field error", children: error }), _jsx("button", { className: "btn primary block lg", type: "submit", disabled: busy, children: busy ? _jsx(Spinner, {}) : upgrading ? 'Claim my account' : 'Create account' })] })) : (_jsxs("form", { onSubmit: onLogin, children: [_jsxs("div", { className: "field", children: [_jsx("label", { htmlFor: "li-id", children: "Username or email" }), _jsx("input", { id: "li-id", className: "input", value: loginId, onChange: (e) => setLoginId(e.target.value), autoComplete: "username", required: true })] }), _jsxs("div", { className: "field", children: [_jsx("label", { htmlFor: "li-pw", children: "Password" }), _jsx("input", { id: "li-pw", className: "input", type: "password", value: loginPw, onChange: (e) => setLoginPw(e.target.value), autoComplete: "current-password", required: true })] }), error && _jsx("div", { className: "field error", children: error }), _jsx("button", { className: "btn primary block lg", type: "submit", disabled: busy, children: busy ? _jsx(Spinner, {}) : 'Log in' })] })), (config?.discordEnabled || !user) && _jsx("div", { className: "divider-text", children: "or" }), _jsxs("div", { className: "stack", children: [config?.discordEnabled && !discord.embedded && (_jsxs("button", { className: "btn discord block", onClick: () => void openExternal(`${location.origin}${BASE}/api/auth/discord`), type: "button", children: [_jsx(DiscordGlyph, {}), " Continue with Discord"] })), !user && (_jsx("button", { className: "btn block", onClick: () => void run(() => playAsGuest()), disabled: busy, type: "button", children: "Play as a guest" }))] })] }));
}
export function DiscordGlyph() {
    return (_jsx("svg", { width: "17", height: "17", viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": "true", children: _jsx("path", { d: "M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.249a18.27 18.27 0 0 0-5.487 0 12.65 12.65 0 0 0-.617-1.25.077.077 0 0 0-.079-.036A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .079.009c.12.099.245.198.372.292a.077.077 0 0 1-.006.127c-.598.35-1.22.645-1.873.891a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.056c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028ZM8.02 15.331c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" }) }));
}
