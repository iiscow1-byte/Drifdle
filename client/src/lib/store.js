import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, } from 'react';
import { ApiError, api, setToken } from './api.ts';
import { setupDiscord, IDLE_CONTEXT } from './discord.ts';
import { socket } from './socket.ts';
let toastId = 0;
const toastListeners = new Set();
export function toast(text, kind = 'info') {
    const t = { id: ++toastId, text, kind };
    for (const l of toastListeners)
        l(t);
}
export function useToasts() {
    const [items, setItems] = useState([]);
    useEffect(() => {
        const listener = (t) => {
            setItems((prev) => [...prev.slice(-3), t]);
            window.setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), 4200);
        };
        toastListeners.add(listener);
        return () => {
            toastListeners.delete(listener);
        };
    }, []);
    return items;
}
const SessionContext = createContext(null);
export function SessionProvider({ children }) {
    const [user, setUser] = useState(null);
    const [stats, setStats] = useState(null);
    const [config, setConfig] = useState(null);
    const [discord, setDiscord] = useState(IDLE_CONTEXT);
    const [loading, setLoading] = useState(true);
    const booted = useRef(false);
    const apply = useCallback((res) => {
        setUser(res.user);
        setStats(res.stats);
        if (res.token)
            setToken(res.token);
    }, []);
    const refresh = useCallback(async () => {
        try {
            apply(await api.me());
        }
        catch {
            setUser(null);
            setStats(null);
        }
    }, [apply]);
    useEffect(() => {
        if (booted.current)
            return;
        booted.current = true;
        void (async () => {
            try {
                setConfig(await api.config());
            }
            catch {
                /* the server may still be waking up; the UI copes with a null config */
            }
            // Inside Discord, the Activity handshake *is* the sign-in.
            const ctx = await setupDiscord();
            setDiscord(ctx);
            if (ctx.embedded && ctx.user) {
                setUser(ctx.user);
                try {
                    const me = await api.me();
                    apply(me);
                }
                catch {
                    /* keep the identity the Activity handshake already gave us */
                }
            }
            else {
                await refresh();
            }
            setLoading(false);
        })();
    }, [apply, refresh]);
    // Once we know who we are, open the realtime connection.
    useEffect(() => {
        if (user)
            socket.connect();
        else
            socket.close();
    }, [user]);
    const signup = useCallback(async (body) => {
        apply(await api.signup(body));
        toast('Account created. Your guest history came with you.', 'good');
    }, [apply]);
    const login = useCallback(async (body) => {
        apply(await api.login(body));
        toast('Welcome back.', 'good');
    }, [apply]);
    const playAsGuest = useCallback(async (name) => {
        apply(await api.guest(name));
    }, [apply]);
    const logout = useCallback(async () => {
        try {
            await api.logout();
        }
        finally {
            setToken(null);
            setUser(null);
            setStats(null);
            socket.close();
        }
    }, []);
    const setDisplayName = useCallback(async (name) => {
        apply(await api.updateMe({ displayName: name }));
        toast('Display name updated.', 'good');
    }, [apply]);
    const value = useMemo(() => ({ user, stats, config, discord, loading, signup, login, playAsGuest, logout, refresh, setDisplayName }), [user, stats, config, discord, loading, signup, login, playAsGuest, logout, refresh, setDisplayName]);
    return _jsx(SessionContext.Provider, { value: value, children: children });
}
export function useSession() {
    const ctx = useContext(SessionContext);
    if (!ctx)
        throw new Error('useSession must be used inside a SessionProvider');
    return ctx;
}
export function errorMessage(err) {
    if (err instanceof ApiError)
        return err.message;
    if (err instanceof Error)
        return err.message;
    return 'Something went wrong.';
}
function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [name, param] = raw.split('/');
    return { name: name || 'home', param: param ? decodeURIComponent(param) : undefined };
}
export function useRoute() {
    const [route, setRoute] = useState(parseHash);
    useEffect(() => {
        const onChange = () => setRoute(parseHash());
        window.addEventListener('hashchange', onChange);
        return () => window.removeEventListener('hashchange', onChange);
    }, []);
    const navigate = useCallback((name, param) => {
        location.hash = param ? `#/${name}/${encodeURIComponent(param)}` : `#/${name}`;
    }, []);
    return [route, navigate];
}
/** A ticking clock, for countdowns. Only re-renders while `active`. */
export function useTicker(active, intervalMs = 250) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!active)
            return;
        const id = window.setInterval(() => setNow(Date.now()), intervalMs);
        return () => window.clearInterval(id);
    }, [active, intervalMs]);
    return now;
}
