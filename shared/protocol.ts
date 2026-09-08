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

/* ------------------------------------------------------------------ */
/* Core game vocabulary                                                */
/* ------------------------------------------------------------------ */

/** Coarse proximity bucket. Opponents only ever see this, never your rank. */
export type Band =
  | 'exact'
  | 'burning'
  | 'hot'
  | 'warm'
  | 'cool'
  | 'cold'
  | 'frozen';

export const BAND_ORDER: Band[] = [
  'frozen',
  'cold',
  'cool',
  'warm',
  'hot',
  'burning',
  'exact',
];

/** Letter feedback for one character of a guess. */
export type Mark = 'hit' | 'near' | 'miss' | 'hidden';

/**
 * The axes the compass can point along. Each is derived from WordNet's
 * lexicographer files, so "the answer is more abstract" is a claim the engine
 * can actually justify rather than a hand-tuned guess.
 */
export type Axis =
  | 'concrete'
  | 'animate'
  | 'human'
  | 'natural'
  | 'motion'
  | 'temporal'
  | 'tech'
  | 'specificity';

export interface Compass {
  axis: Axis;
  /** Positive => the target is *more* of this axis than your guess. */
  direction: 1 | -1;
  /** 0..1 magnitude, used for the arrow's weight in the UI. */
  strength: number;
  /** Pre-rendered phrasing, e.g. "the answer is more abstract". */
  text: string;
}

/** What everybody in the room can see about a guess. */
export interface PublicGuess {
  id: string;
  playerId: string;
  playerName: string;
  word: string;
  band: Band;
  /** Only present for your own guesses, or after an Echo reveal. */
  rank?: number;
  /** Drift epoch this guess was last scored against. */
  epoch: number;
  at: number;
  /** True once someone burned an Echo token on it. */
  revealed: boolean;
}

/**
 * What the engine can tell you about a guess beyond its rank.
 *
 * These are the "why" behind the number, and they unlock progressively as you
 * close in — see UNLOCK_FRACTIONS on the server.
 */
export interface GuessInsight {
  /**
   * The sense of YOUR OWN word the engine scored. Always present, because
   * knowing the engine read "bank" as a riverbank is the difference between a
   * fair puzzle and a frustrating one.
   */
  sense?: string;
  /** Part of speech of that sense, e.g. "noun". */
  pos?: string;
  /**
   * The most specific concept your guess and the answer share, e.g.
   * "both are kinds of carnivore". The single most useful hint in the game.
   */
  link?: string;
  /** The answer's broad category, e.g. "animals". */
  domain?: string;
  /** The answer's definition, with its own words blanked out. */
  definition?: string;
}

/** The extra detail only the guesser gets. */
export interface PrivateGuess extends PublicGuess {
  rank: number;
  /** Letter marks, one per character of `word`. `hidden` until unlocked. */
  marks: Mark[];
  /** Target length, revealed once you have been near enough. */
  targetLength?: number;
  compass?: Compass;
  insight: GuessInsight;
  /** Which unlock tiers this guess earned. */
  unlocks: Unlock[];
}

export type Unlock =
  | 'compass'
  | 'link'
  | 'domain'
  | 'length'
  | 'definition'
  | 'hits'
  | 'nears'
  | 'initial';

export interface Player {
  id: string;
  name: string;
  avatar?: string | null;
  /** Discord user id when the player arrived through an Activity. */
  discordId?: string | null;
  guest: boolean;
  connected: boolean;
  ready: boolean;
  host: boolean;
  echoes: number;
  score: number;
  roundsWon: number;
  /** Best (lowest) rank this player has reached in the current round. */
  bestRank: number | null;
  bestBand: Band | null;
  guesses: number;
  cooldownUntil: number;
  rating: number;
  title?: string | null;
}

export type Phase = 'lobby' | 'countdown' | 'playing' | 'roundEnd' | 'matchEnd';

export type GameMode = 'commons' | 'blitz' | 'relay' | 'solo' | 'daily';

export interface RoomSettings {
  mode: GameMode;
  rounds: number;
  /** Seconds. 0 = untimed. */
  roundSeconds: number;
  /** Max drifts before the target ANCHORS and can no longer move. */
  maxDrifts: number;
  /** Base cooldown between guesses, in ms. */
  baseCooldownMs: number;
  startingEchoes: number;
  /** Lexicon difficulty tier cap: 1 common .. 3 obscure. */
  difficulty: 1 | 2 | 3;
  /** How twitchy the answer is: 1 steady, 2 normal, 3 hair-trigger. */
  driftSensitivity: 1 | 2 | 3;
  /** If false, opponents' guessed words are hidden entirely (no commons). */
  sharedBoard: boolean;
  private: boolean;
}

export const DEFAULT_SETTINGS: RoomSettings = {
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

export interface DriftEvent {
  epoch: number;
  at: number;
  /** Who tipped the meter over. */
  causedBy: string | null;
  causedByName: string | null;
  /** How far the target moved, as a 0..1 similarity to where it was. */
  similarity: number;
  /** Flavour text rendered by the server so every client agrees. */
  headline: string;
}

/** A word plus what it means, for the end-of-round reveal. */
export interface Revealed {
  word: string;
  definition: string;
  domain: string;
}

export interface RoundSummary {
  round: number;
  target: string;
  /** The answer's definition, revealed when the round ends. */
  definition?: string;
  /** The drift chain with definitions, so players learn the space. */
  chainDetail?: Revealed[];
  /** The answer's nearest neighbours, revealed when the round ends. */
  neighbourhood?: string[];
  winnerId: string | null;
  winnerName: string | null;
  drifts: number;
  durationMs: number;
  /** The full drift chain, revealed only at round end. */
  chain: string[];
  awards: Award[];
}

export interface Award {
  playerId: string;
  playerName: string;
  label: string;
  detail: string;
  points: number;
}

export interface RoomState {
  code: string;
  phase: Phase;
  settings: RoomSettings;
  players: Player[];
  round: number;
  /** Server clock at send time - clients use this to de-skew timers. */
  now: number;
  /** ms epoch when the current phase ends, or null when untimed. */
  phaseEndsAt: number | null;
  driftCharge: number;
  driftCap: number;
  drifts: DriftEvent[];
  epoch: number;
  anchored: boolean;
  board: PublicGuess[];
  /** Populated only once the round is over. */
  summary: RoundSummary | null;
  hostId: string | null;
  /** Set when this room is bound to a Discord Activity instance. */
  discordInstanceId?: string | null;
  targetLengthKnown?: number | null;
  /** Relay mode only: whose turn it is. */
  turnPlayerId?: string | null;
  /** Relay mode only: when the current turn is forfeited. */
  turnEndsAt?: number | null;
}

/* ------------------------------------------------------------------ */
/* Client -> Server                                                    */
/* ------------------------------------------------------------------ */

export type ClientMessage =
  | { t: 'join'; code?: string; discordInstanceId?: string; settings?: Partial<RoomSettings> }
  | { t: 'leave' }
  | { t: 'ready'; value: boolean }
  | { t: 'start' }
  | { t: 'settings'; patch: Partial<RoomSettings> }
  | { t: 'guess'; word: string; nonce?: string }
  | { t: 'echo'; guessId: string }
  | { t: 'chat'; text: string }
  | { t: 'emote'; key: string }
  | { t: 'rematch' }
  | { t: 'kick'; playerId: string }
  | { t: 'ping'; at: number };

/* ------------------------------------------------------------------ */
/* Server -> Client                                                    */
/* ------------------------------------------------------------------ */

export interface ChatLine {
  id: string;
  playerId: string | null;
  name: string;
  text: string;
  at: number;
  kind: 'chat' | 'system' | 'emote';
}

export type ServerMessage =
  | { t: 'welcome'; you: Player; protocol: number; serverNow: number }
  | { t: 'room'; state: RoomState }
  | {
      t: 'patch';
      players?: Player[];
      phase?: Phase;
      phaseEndsAt?: number | null;
      driftCharge?: number;
      driftCap?: number;
      now?: number;
      turnPlayerId?: string | null;
      turnEndsAt?: number | null;
    }
  | { t: 'guess'; guess: PublicGuess }
  | { t: 'you'; guess: PrivateGuess; nonce?: string }
  | { t: 'rescore'; epoch: number; board: PublicGuess[]; yours: PrivateGuess[] }
  | { t: 'drift'; event: DriftEvent; charge: number; cap: number; anchored: boolean }
  | { t: 'roundEnd'; summary: RoundSummary; players: Player[]; nextAt: number | null }
  | { t: 'matchEnd'; summary: RoundSummary | null; players: Player[]; standings: Standing[] }
  | { t: 'countdown'; startsAt: number; round: number }
  | { t: 'echo'; guessId: string; rank: number; band: Band; by: string; echoesLeft: number }
  | { t: 'chat'; line: ChatLine }
  | { t: 'cooldown'; until: number }
  | {
      t: 'presence';
      details: string;
      state: string;
      partySize?: number;
      partyMax?: number;
      endsAt?: number | null;
    }
  | { t: 'error'; code: ErrorCode; message: string }
  | { t: 'pong'; at: number; serverNow: number };

export interface Standing {
  playerId: string;
  name: string;
  score: number;
  roundsWon: number;
  ratingBefore: number;
  ratingAfter: number;
  place: number;
}

export type ErrorCode =
  | 'unknown_word'
  | 'too_short'
  | 'duplicate'
  | 'cooldown'
  | 'not_playing'
  | 'not_host'
  | 'room_full'
  | 'no_room'
  | 'no_echoes'
  | 'already_revealed'
  | 'rate_limited'
  | 'bad_message'
  | 'unauthorized';

/* ------------------------------------------------------------------ */
/* REST payloads                                                       */
/* ------------------------------------------------------------------ */

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  rating: number;
  guest: boolean;
  discordLinked: boolean;
  createdAt: number;
  title: string | null;
}

export interface UserStats {
  gamesPlayed: number;
  roundsWon: number;
  matchesWon: number;
  bestRank: number | null;
  averageGuesses: number | null;
  fastestWinMs: number | null;
  driftsSurvived: number;
  currentStreak: number;
  bestStreak: number;
  dailyPlayed: number;
  dailySolved: number;
  echoesSpent: number;
}

export interface DailyState {
  date: string;
  number: number;
  solved: boolean;
  guesses: PrivateGuess[];
  epoch: number;
  driftCharge: number;
  driftCap: number;
  anchored: boolean;
  drifts: DriftEvent[];
  chain?: string[];
  target?: string;
  /** Present once the answer is revealed. */
  definition?: string;
  chainDetail?: Revealed[];
  neighbourhood?: string[];
  startedAt: number;
  solvedAt?: number | null;
  targetLengthKnown: number | null;
}

export interface LeaderboardRow {
  place: number;
  userId: string;
  /** Stable handle — profile routes look up by this, not by displayName. */
  username: string;
  displayName: string;
  avatar: string | null;
  value: number;
  detail?: string;
}
