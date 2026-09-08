import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { PublicUser, UserStats } from '@shared/protocol.ts';
import { ApiError, api, setToken, type ServerConfig } from './api.ts';
import { setupDiscord, type DiscordContext, IDLE_CONTEXT } from './discord.ts';
import { socket } from './socket.ts';

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'good';
}

let toastId = 0;
const toastListeners = new Set<(t: Toast) => void>();

export function toast(text: string, kind: Toast['kind'] = 'info') {
  const t = { id: ++toastId, text, kind };
  for (const l of toastListeners) l(t);
}

export function useToasts(): Toast[] {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    const listener = (t: Toast) => {
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

/* ------------------------------------------------------------------ */
/* Session                                                             */
/* ------------------------------------------------------------------ */

interface SessionValue {
  user: PublicUser | null;
  stats: UserStats | null;
  config: ServerConfig | null;
  discord: DiscordContext;
  loading: boolean;
  signup: (body: { username: string; email: string; password: string }) => Promise<void>;
  login: (body: { login: string; password: string }) => Promise<void>;
  playAsGuest: (name?: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setDisplayName: (name: string) => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [discord, setDiscord] = useState<DiscordContext>(IDLE_CONTEXT);
  const [loading, setLoading] = useState(true);
  const booted = useRef(false);

  const apply = useCallback((res: { user: PublicUser | null; stats: UserStats | null; token?: string }) => {
    setUser(res.user);
    setStats(res.stats);
    if (res.token) setToken(res.token);
  }, []);

  const refresh = useCallback(async () => {
    try {
      apply(await api.me());
    } catch {
      setUser(null);
      setStats(null);
    }
  }, [apply]);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;

    void (async () => {
      try {
        setConfig(await api.config());
      } catch {
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
        } catch {
          /* keep the identity the Activity handshake already gave us */
        }
      } else {
        await refresh();
      }

      setLoading(false);
    })();
  }, [apply, refresh]);

  // Once we know who we are, open the realtime connection.
  useEffect(() => {
    if (user) socket.connect();
    else socket.close();
  }, [user]);

  const signup = useCallback(
    async (body: { username: string; email: string; password: string }) => {
      apply(await api.signup(body));
      toast('Account created. Your guest history came with you.', 'good');
    },
    [apply],
  );

  const login = useCallback(
    async (body: { login: string; password: string }) => {
      apply(await api.login(body));
      toast('Welcome back.', 'good');
    },
    [apply],
  );

  const playAsGuest = useCallback(
    async (name?: string) => {
      apply(await api.guest(name));
    },
    [apply],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setToken(null);
      setUser(null);
      setStats(null);
      socket.close();
    }
  }, []);

  const setDisplayName = useCallback(
    async (name: string) => {
      apply(await api.updateMe({ displayName: name }));
      toast('Display name updated.', 'good');
    },
    [apply],
  );

  const value = useMemo<SessionValue>(
    () => ({ user, stats, config, discord, loading, signup, login, playAsGuest, logout, refresh, setDisplayName }),
    [user, stats, config, discord, loading, signup, login, playAsGuest, logout, refresh, setDisplayName],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside a SessionProvider');
  return ctx;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}

/* ------------------------------------------------------------------ */
/* Hash routing — history APIs are unreliable inside the Discord iframe */
/* ------------------------------------------------------------------ */

export interface Route {
  name: string;
  param?: string;
}

function parseHash(): Route {
  const raw = location.hash.replace(/^#\/?/, '');
  const [name, param] = raw.split('/');
  return { name: name || 'home', param: param ? decodeURIComponent(param) : undefined };
}

export function useRoute(): [Route, (name: string, param?: string) => void] {
  const [route, setRoute] = useState<Route>(parseHash);

  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((name: string, param?: string) => {
    location.hash = param ? `#/${name}/${encodeURIComponent(param)}` : `#/${name}`;
  }, []);

  return [route, navigate];
}

/** A ticking clock, for countdowns. Only re-renders while `active`. */
export function useTicker(active: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);
  return now;
}
