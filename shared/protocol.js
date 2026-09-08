/**
 * Driftle wire protocol - shared by server and client.
 *
 * The game in one paragraph: a hidden target word sits somewhere in a semantic
 * space. Guessing tells you how near you are (a rank, like Contexto), and the
 * nearer you are the more of the target's *spelling* you unlock (like Wordle).
 * But every near-miss charges the DRIFT meter, and when it fills the target
 * moves to a neighbouring word and every guess on the board is re-scored.
 * In multiplayer the board is shared, so information is a commons - and drift
 * is a weapon.
 */
export const PROTOCOL_VERSION = 3;
export const BAND_ORDER = [
    'frozen',
    'cold',
    'cool',
    'warm',
    'hot',
    'burning',
    'exact',
];
export const DEFAULT_SETTINGS = {
    mode: 'commons',
    rounds: 3,
    roundSeconds: 300,
    maxDrifts: 3,
    baseCooldownMs: 6000,
    startingEchoes: 3,
    difficulty: 2,
    driftSensitivity: 2,
    sharedBoard: true,
    private: false,
};
