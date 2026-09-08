/**
 * Inside a Discord Activity the app is served from `<app-id>.discordsays.com`
 * and every request has to travel through Discord's proxy, which is mounted at
 * `/.proxy`. Everywhere else the API is same-origin.
 */
export const IS_EMBEDDED = new URLSearchParams(location.search).has('frame_id');
export const BASE = IS_EMBEDDED ? '/.proxy' : '';
/** Discord's iframe blocks third-party cookies, so we also carry a bearer token. */
let bearer = null;
const TOKEN_KEY = 'driftle.token';
try {
    bearer = localStorage.getItem(TOKEN_KEY);
}
catch {
    bearer = null;
}
export function setToken(token) {
    bearer = token;
    try {
        if (token)
            localStorage.setItem(TOKEN_KEY, token);
        else
            localStorage.removeItem(TOKEN_KEY);
    }
    catch {
        /* private mode: the cookie still covers the normal web case */
    }
}
export function getToken() {
    return bearer;
}
export class ApiError extends Error {
    status;
    code;
    field;
    constructor(status, body) {
        super(body.message ?? 'Request failed.');
        this.status = status;
        this.code = body.error ?? 'error';
        this.field = body.field;
    }
}
async function request(path, init = {}) {
    const headers = new Headers(init.headers);
    if (init.body)
        headers.set('Content-Type', 'application/json');
    if (bearer)
        headers.set('Authorization', `Bearer ${bearer}`);
    const res = await fetch(`${BASE}${path}`, {
        ...init,
        headers,
        credentials: 'include',
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : {};
    if (!res.ok)
        throw new ApiError(res.status, body);
    return body;
}
const get = (path) => request(path);
const post = (path, body) => request(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
const patch = (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) });
const del = (path) => request(path, { method: 'DELETE' });
export const api = {
    config: () => get('/api/config'),
    rules: () => get('/api/game/rules'),
    rooms: () => get('/api/rooms'),
    me: () => get('/api/auth/me'),
    guest: (name) => post('/api/auth/guest', { name }),
    signup: (body) => post('/api/auth/signup', body),
    login: (body) => post('/api/auth/login', body),
    logout: () => post('/api/auth/logout'),
    updateMe: (body) => patch('/api/auth/me', body),
    unlinkDiscord: () => del('/api/auth/discord'),
    discordActivity: (code) => post('/api/auth/discord/activity', { code }),
    daily: () => get('/api/game/daily'),
    dailyGuess: (word) => post('/api/game/daily/guess', { word }),
    dailyGiveUp: () => post('/api/game/daily/give-up'),
    dailyShare: () => get('/api/game/daily/share'),
    practiceNew: () => post('/api/game/practice'),
    practice: (key) => get(`/api/game/practice/${key}`),
    practiceGuess: (key, word) => post(`/api/game/practice/${key}/guess`, { word }),
    practiceGiveUp: (key) => post(`/api/game/practice/${key}/give-up`),
    leaderboard: (board) => get(`/api/leaderboard?board=${board}`),
    profile: (username) => get(`/api/profile/${encodeURIComponent(username)}`),
};
