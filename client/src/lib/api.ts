import type {
  DailyState,
  LeaderboardRow,
  PrivateGuess,
  PublicUser,
  UserStats,
} from '@shared/protocol.ts';

/**
 * Inside a Discord Activity the app is served from `<app-id>.discordsays.com`
 * and every request has to travel through Discord's proxy, which is mounted at
 * `/.proxy`. Everywhere else the API is same-origin.
 */
export const IS_EMBEDDED = new URLSearchParams(location.search).has('frame_id');
export const BASE = IS_EMBEDDED ? '/.proxy' : '';

/** Discord's iframe blocks third-party cookies, so we also carry a bearer token. */
let bearer: string | null = null;

const TOKEN_KEY = 'driftle.token';

try {
  bearer = localStorage.getItem(TOKEN_KEY);
} catch {
  bearer = null;
}

export function setToken(token: string | null) {
  bearer = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: the cookie still covers the normal web case */
  }
}

export function getToken(): string | null {
  return bearer;
}

export class ApiError extends Error {
  status: number;
  code: string;
  field?: string;

  constructor(status: number, body: { error?: string; message?: string; field?: string }) {
    super(body.message ?? 'Request failed.');
    this.status = status;
    this.code = body.error ?? 'error';
    this.field = body.field;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (bearer) headers.set('Authorization', `Bearer ${bearer}`);

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : {};

  if (!res.ok) throw new ApiError(res.status, body as { error?: string; message?: string });
  return body as T;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
const patch = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
const del = <T>(path: string) => request<T>(path, { method: 'DELETE' });

/* ------------------------------------------------------------------ */

export interface MeResponse {
  user: PublicUser | null;
  stats: UserStats | null;
  token?: string;
}

export interface ServerConfig {
  discordEnabled: boolean;
  discordClientId: string | null;
  maxPlayersPerRoom: number;
  publicUrl: string;
}

export interface RoomListing {
  code: string;
  mode: string;
  players: number;
  max: number;
  phase: string;
  difficulty: number;
}

export interface ProfileResponse {
  user: PublicUser;
  stats: UserStats;
  globalRank: number | null;
  recentMatches: {
    code: string | null;
    mode: string;
    score: number;
    place: number | null;
    rounds_won: number;
    created_at: number;
    rating_after: number | null;
  }[];
  dailyHistory: { date: string; guess_count: number; solved: number; drifts: number }[];
}

export interface RulesResponse {
  lexiconSize: number;
  lexicon: { size: number; tiers: Record<string, number>; groups: number; tags: number };
  bands: { band: string; maxRank: number | null }[];
  unlocks: Record<string, number>;
}

export const api = {
  config: () => get<ServerConfig>('/api/config'),
  rules: () => get<RulesResponse>('/api/game/rules'),
  rooms: () => get<{ rooms: RoomListing[] }>('/api/rooms'),

  me: () => get<MeResponse>('/api/auth/me'),
  guest: (name?: string) => post<MeResponse>('/api/auth/guest', { name }),
  signup: (body: { username: string; email: string; password: string }) =>
    post<MeResponse>('/api/auth/signup', body),
  login: (body: { login: string; password: string }) => post<MeResponse>('/api/auth/login', body),
  logout: () => post<{ ok: true }>('/api/auth/logout'),
  updateMe: (body: { displayName?: string }) => patch<MeResponse>('/api/auth/me', body),
  unlinkDiscord: () => del<{ ok: true }>('/api/auth/discord'),
  discordActivity: (code: string) =>
    post<MeResponse & { access_token: string }>('/api/auth/discord/activity', { code }),

  daily: () => get<DailyState>('/api/game/daily'),
  dailyGuess: (word: string) =>
    post<{ guess: PrivateGuess; solved: boolean; state: DailyState }>('/api/game/daily/guess', { word }),
  dailyGiveUp: () => post<DailyState>('/api/game/daily/give-up'),
  dailyShare: () => get<{ text: string }>('/api/game/daily/share'),

  practiceNew: () => post<DailyState>('/api/game/practice'),
  practice: (key: string) => get<DailyState>(`/api/game/practice/${key}`),
  practiceGuess: (key: string, word: string) =>
    post<{ guess: PrivateGuess; solved: boolean; state: DailyState }>(
      `/api/game/practice/${key}/guess`,
      { word },
    ),
  practiceGiveUp: (key: string) => post<DailyState>(`/api/game/practice/${key}/give-up`),

  leaderboard: (board: 'rating' | 'streak' | 'daily') =>
    get<{ board: string; rows: LeaderboardRow[]; date?: string }>(`/api/leaderboard?board=${board}`),
  profile: (username: string) => get<ProfileResponse>(`/api/profile/${encodeURIComponent(username)}`),
};
