export const BAND_LABEL = {
    exact: 'Exact',
    burning: 'Burning',
    hot: 'Hot',
    warm: 'Warm',
    cool: 'Cool',
    cold: 'Cold',
    frozen: 'Frozen',
};
/** Rough rank ceilings, mirroring the server's cutoffs. */
export const BAND_MAX = {
    exact: 1,
    burning: 8,
    hot: 40,
    warm: 120,
    cool: 280,
    cold: 520,
    frozen: 768,
};
/**
 * How full a guess row's heat bar is. Log-scaled, because the difference
 * between rank 3 and rank 30 matters far more than 600 versus 700.
 */
export function heatFraction(rank, lexiconSize = 768) {
    const clamped = Math.max(1, Math.min(lexiconSize, rank));
    const t = Math.log(clamped) / Math.log(lexiconSize);
    return Math.max(0.02, 1 - t);
}
export function bandClass(band) {
    return `band-${band ?? 'frozen'}`;
}
export function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms < 0)
        return '—';
    const total = Math.round(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}
export function formatClock(msRemaining) {
    const total = Math.max(0, Math.ceil(msRemaining / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}
export function formatDate(ts) {
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
export function relativeTime(ts) {
    const diff = Date.now() - ts;
    const mins = Math.round(diff / 60000);
    if (mins < 1)
        return 'just now';
    if (mins < 60)
        return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24)
        return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 30)
        return `${days}d ago`;
    return formatDate(ts);
}
export const MODE_LABEL = {
    commons: 'The Commons',
    blitz: 'Blitz Drift',
    relay: 'Relay',
    solo: 'Solo',
    daily: 'Daily',
};
export const DIFFICULTY_LABEL = {
    1: 'Common',
    2: 'Standard',
    3: 'Deep',
};
export function initials(name) {
    return name.trim().slice(0, 2).toUpperCase();
}
export function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
