import type {
  ChatLine,
  ErrorCode,
  GameMode,
  Player,
  Phase,
  RoomSettings,
  RoomState,
  RoundSummary,
  ServerMessage,
  Standing,
} from '../../../shared/protocol.ts';
import { DEFAULT_SETTINGS } from '../../../shared/protocol.ts';
import { config } from '../config.ts';
import { Round, driftCapFor } from './engine.ts';
import { LEXICON_SIZE, UNLOCK_RANKS, bandForRank } from './lexicon/index.ts';
import { shortId, uuid } from '../util/ids.ts';
import { recordMatch, recordRound, setRating } from '../auth/users.ts';
import { run } from '../db/index.ts';

export interface RoomTransport {
  send(playerId: string, msg: ServerMessage): void;
  broadcast(msg: ServerMessage, exceptPlayerId?: string): void;
  /** Called when the room has been empty long enough to reclaim. */
  onEmpty(room: Room): void;
}

export interface JoinInfo {
  userId: string;
  name: string;
  avatar: string | null;
  guest: boolean;
  rating: number;
  title: string | null;
  discordId: string | null;
}

interface RoomPlayer extends Player {
  /** Wall clock of the last guess, for the relay idle timer. */
  lastActionAt: number;
  echoesSpent: number;
  joinedAt: number;
  /** Simple token buckets. */
  guessTokens: number;
  chatTokens: number;
  lastRefill: number;
}

export const MODE_PRESETS: Record<GameMode, Partial<RoomSettings>> = {
  commons: { roundSeconds: 300, baseCooldownMs: 6000, maxDrifts: 3, startingEchoes: 3, rounds: 3 },
  blitz: { roundSeconds: 120, baseCooldownMs: 2500, maxDrifts: 2, startingEchoes: 2, rounds: 5 },
  relay: { roundSeconds: 360, baseCooldownMs: 0, maxDrifts: 3, startingEchoes: 4, rounds: 3 },
  solo: { roundSeconds: 0, baseCooldownMs: 0, maxDrifts: 3, startingEchoes: 5, rounds: 1 },
  daily: { roundSeconds: 0, baseCooldownMs: 0, maxDrifts: 3, startingEchoes: 5, rounds: 1 },
};

/** Used between construction and `attachTransport`, and in unit tests. */
const SILENT_TRANSPORT: RoomTransport = {
  send: () => {},
  broadcast: () => {},
  onEmpty: () => {},
};

const COUNTDOWN_MS = 4000;
const INTERMISSION_MS = 9000;
const RELAY_TURN_MS = 25_000;
const EMPTY_GRACE_MS = 60_000;
const MAX_CHAT = 60;

/** Cooldown shrinks as you close in: being hot buys you tempo. */
export function cooldownFor(rank: number, base: number): number {
  if (base <= 0) return 0;
  let ms = base;
  if (rank <= UNLOCK_RANKS.initial) ms = base * 0.25;
  else if (rank <= UNLOCK_RANKS.nears) ms = base * 0.45;
  else if (rank <= UNLOCK_RANKS.hits) ms = base * 0.7;
  return Math.max(750, Math.round(ms));
}

export class Room {
  readonly code: string;
  readonly createdAt = Date.now();
  settings: RoomSettings;
  discordInstanceId: string | null;
  phase: Phase = 'lobby';
  round: Round | null = null;
  roundIndex = 0;
  phaseEndsAt: number | null = null;
  turnPlayerId: string | null = null;
  turnEndsAt: number | null = null;
  chat: ChatLine[] = [];
  matchId: string | null = null;
  lastSummary: RoundSummary | null = null;

  private players = new Map<string, RoomPlayer>();
  private order: string[] = [];
  private timer: NodeJS.Timeout | null = null;
  private emptyTimer: NodeJS.Timeout | null = null;
  private transport: RoomTransport;

  constructor(opts: {
    code: string;
    settings?: Partial<RoomSettings>;
    discordInstanceId?: string | null;
    transport?: RoomTransport;
  }) {
    this.code = opts.code;
    this.discordInstanceId = opts.discordInstanceId ?? null;
    this.settings = { ...DEFAULT_SETTINGS, ...MODE_PRESETS.commons, ...opts.settings };
    this.transport = opts.transport ?? SILENT_TRANSPORT;
  }

  /**
   * The transport needs a reference to the room it serves, so it is attached
   * immediately after construction rather than passed in.
   */
  attachTransport(transport: RoomTransport) {
    this.transport = transport;
  }

  /* ---------------- membership ---------------- */

  get size(): number {
    return this.players.size;
  }

  get connectedCount(): number {
    let n = 0;
    for (const p of this.players.values()) if (p.connected) n++;
    return n;
  }

  get hostId(): string | null {
    for (const id of this.order) {
      const p = this.players.get(id);
      if (p?.connected) return p.id;
    }
    return this.order[0] ?? null;
  }

  has(playerId: string): boolean {
    return this.players.has(playerId);
  }

  playerList(): Player[] {
    return this.order
      .map((id) => this.players.get(id))
      .filter((p): p is RoomPlayer => !!p)
      .map((p) => this.projectPlayer(p));
  }

  private projectPlayer(p: RoomPlayer): Player {
    const best = this.round?.bestRankFor(p.id) ?? null;
    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      discordId: p.discordId,
      guest: p.guest,
      connected: p.connected,
      ready: p.ready,
      host: this.hostId === p.id,
      echoes: p.echoes,
      score: p.score,
      roundsWon: p.roundsWon,
      bestRank: best,
      bestBand: best === null ? null : bandForRank(best),
      guesses: this.round?.guessCountFor(p.id) ?? 0,
      cooldownUntil: p.cooldownUntil,
      rating: p.rating,
      title: p.title,
    };
  }

  join(info: JoinInfo): { ok: true } | { ok: false; reason: ErrorCode } {
    const existing = this.players.get(info.userId);
    if (existing) {
      existing.connected = true;
      existing.name = info.name;
      existing.avatar = info.avatar;
      existing.rating = info.rating;
      this.cancelEmptyTimer();
      this.pushSystem(`${info.name} reconnected.`);
      this.syncPlayers();
      return { ok: true };
    }
    if (this.players.size >= config.limits.maxPlayersPerRoom) {
      return { ok: false, reason: 'room_full' };
    }

    const now = Date.now();
    const player: RoomPlayer = {
      id: info.userId,
      name: info.name,
      avatar: info.avatar,
      discordId: info.discordId,
      guest: info.guest,
      connected: true,
      ready: false,
      host: false,
      echoes: this.settings.startingEchoes,
      score: 0,
      roundsWon: 0,
      bestRank: null,
      bestBand: null,
      guesses: 0,
      cooldownUntil: 0,
      rating: info.rating,
      title: info.title,
      lastActionAt: now,
      echoesSpent: 0,
      joinedAt: now,
      guessTokens: config.limits.guessesPerMinute,
      chatTokens: config.limits.chatPerMinute,
      lastRefill: now,
    };
    this.players.set(player.id, player);
    this.order.push(player.id);
    this.cancelEmptyTimer();
    this.round?.setPlayerCount(this.connectedCount);
    this.pushSystem(`${info.name} joined.`);
    this.syncPlayers();
    return { ok: true };
  }

  disconnect(playerId: string) {
    const p = this.players.get(playerId);
    if (!p) return;
    p.connected = false;
    p.ready = false;
    this.pushSystem(`${p.name} disconnected.`);
    // In the lobby there is nothing to preserve, so drop them entirely.
    if (this.phase === 'lobby') this.removePlayer(playerId);
    else this.syncPlayers();

    if (this.phase === 'playing' && this.settings.mode === 'relay' && this.turnPlayerId === playerId) {
      this.advanceTurn();
    }
    if (this.connectedCount === 0) this.scheduleEmpty();
    else this.round?.setPlayerCount(this.connectedCount);
  }

  leave(playerId: string) {
    const p = this.players.get(playerId);
    if (!p) return;
    this.pushSystem(`${p.name} left.`);
    this.removePlayer(playerId);
    if (this.connectedCount === 0) this.scheduleEmpty();
  }

  private removePlayer(playerId: string) {
    this.players.delete(playerId);
    this.order = this.order.filter((id) => id !== playerId);
    this.round?.setPlayerCount(this.connectedCount);
    this.syncPlayers();
  }

  private scheduleEmpty() {
    this.cancelEmptyTimer();
    this.emptyTimer = setTimeout(() => {
      if (this.connectedCount === 0) this.transport.onEmpty(this);
    }, EMPTY_GRACE_MS);
  }

  private cancelEmptyTimer() {
    if (this.emptyTimer) clearTimeout(this.emptyTimer);
    this.emptyTimer = null;
  }

  /* ---------------- lobby ---------------- */

  setReady(playerId: string, value: boolean) {
    const p = this.players.get(playerId);
    if (!p || this.phase !== 'lobby') return;
    p.ready = value;
    this.syncPlayers();
    this.maybeAutoStart();
  }

  updateSettings(playerId: string, patch: Partial<RoomSettings>) {
    if (this.hostId !== playerId) return { ok: false, reason: 'not_host' as const };
    if (this.phase !== 'lobby') return { ok: false, reason: 'not_playing' as const };

    const next: RoomSettings = { ...this.settings };
    if (patch.mode && MODE_PRESETS[patch.mode]) {
      Object.assign(next, MODE_PRESETS[patch.mode], { mode: patch.mode });
    }
    if (patch.rounds !== undefined) next.rounds = clamp(patch.rounds, 1, 9);
    if (patch.roundSeconds !== undefined) next.roundSeconds = clamp(patch.roundSeconds, 0, 1200);
    if (patch.maxDrifts !== undefined) next.maxDrifts = clamp(patch.maxDrifts, 0, 6);
    if (patch.baseCooldownMs !== undefined) next.baseCooldownMs = clamp(patch.baseCooldownMs, 0, 20000);
    if (patch.startingEchoes !== undefined) next.startingEchoes = clamp(patch.startingEchoes, 0, 10);
    if (patch.difficulty !== undefined) next.difficulty = clamp(patch.difficulty, 1, 3) as 1 | 2 | 3;
    if (patch.driftSensitivity !== undefined)
      next.driftSensitivity = clamp(patch.driftSensitivity, 1, 3) as 1 | 2 | 3;
    if (patch.sharedBoard !== undefined) next.sharedBoard = !!patch.sharedBoard;
    if (patch.private !== undefined) next.private = !!patch.private;

    this.settings = next;
    for (const p of this.players.values()) p.echoes = next.startingEchoes;
    this.broadcastState();
    return { ok: true as const };
  }

  private maybeAutoStart() {
    if (this.phase !== 'lobby') return;
    const connected = [...this.players.values()].filter((p) => p.connected);
    if (connected.length < 2) return;
    if (!connected.every((p) => p.ready)) return;
    this.beginCountdown();
  }

  start(playerId: string): { ok: boolean; reason?: ErrorCode } {
    if (this.hostId !== playerId) return { ok: false, reason: 'not_host' };
    if (this.phase !== 'lobby' && this.phase !== 'matchEnd') return { ok: false, reason: 'not_playing' };
    this.beginCountdown();
    return { ok: true };
  }

  private beginCountdown() {
    this.clearTimer();
    this.phase = 'countdown';
    this.roundIndex = this.roundIndex === 0 || this.lastSummary === null ? 1 : this.roundIndex + 1;
    if (this.roundIndex === 1) this.beginMatch();
    this.phaseEndsAt = Date.now() + COUNTDOWN_MS;
    this.transport.broadcast({ t: 'countdown', startsAt: this.phaseEndsAt, round: this.roundIndex });
    this.broadcastState();
    this.timer = setTimeout(() => this.beginRound(), COUNTDOWN_MS);
  }

  private beginMatch() {
    this.matchId = uuid();
    for (const p of this.players.values()) {
      p.score = 0;
      p.roundsWon = 0;
      p.echoesSpent = 0;
    }
    run(
      `INSERT INTO matches (id, code, mode, rounds, created_at, discord_instance)
       VALUES (?, ?, ?, ?, ?, ?)`,
      this.matchId,
      this.code,
      this.settings.mode,
      this.settings.rounds,
      Date.now(),
      this.discordInstanceId,
    );
  }

  /* ---------------- play ---------------- */

  private beginRound() {
    this.clearTimer();
    this.phase = 'playing';
    this.lastSummary = null;
    this.round = new Round({
      seed: `${this.code}:${this.matchId}:${this.roundIndex}:${shortId(6)}`,
      difficulty: this.settings.difficulty,
      maxDrifts: this.settings.maxDrifts,
      playerCount: Math.max(1, this.connectedCount),
      sensitivity: this.settings.driftSensitivity,
    });
    for (const p of this.players.values()) {
      p.echoes = this.settings.startingEchoes;
      p.cooldownUntil = 0;
      p.ready = false;
      p.lastActionAt = Date.now();
    }
    this.phaseEndsAt =
      this.settings.roundSeconds > 0 ? Date.now() + this.settings.roundSeconds * 1000 : null;

    if (this.settings.mode === 'relay') {
      this.turnPlayerId = this.order.find((id) => this.players.get(id)?.connected) ?? null;
      this.turnEndsAt = Date.now() + RELAY_TURN_MS;
      this.scheduleTurnTimeout();
    } else {
      this.turnPlayerId = null;
      this.turnEndsAt = null;
    }

    this.broadcastState();
    this.broadcastPresence();

    if (this.phaseEndsAt) {
      const ms = this.phaseEndsAt - Date.now();
      this.timer = setTimeout(() => this.endRound(null), ms);
    }
  }

  guess(playerId: string, word: string, nonce?: string): { ok: boolean; reason?: ErrorCode } {
    const p = this.players.get(playerId);
    if (!p) return { ok: false, reason: 'no_room' };
    if (this.phase !== 'playing' || !this.round) return { ok: false, reason: 'not_playing' };
    if (!this.spend(p, 'guess')) return { ok: false, reason: 'rate_limited' };

    const now = Date.now();
    if (this.settings.mode === 'relay') {
      if (this.turnPlayerId !== playerId) return { ok: false, reason: 'not_playing' };
    } else if (p.cooldownUntil > now) {
      return { ok: false, reason: 'cooldown' };
    }

    const result = this.round.submit(playerId, p.name, word, now);
    if (!result.ok) return { ok: false, reason: result.reason };

    p.lastActionAt = now;
    if (this.settings.mode !== 'relay') {
      p.cooldownUntil = now + cooldownFor(result.guess.rank, this.settings.baseCooldownMs);
      this.transport.send(playerId, { t: 'cooldown', until: p.cooldownUntil });
    }

    // The guesser sees everything; the room sees the word and a heat band.
    this.transport.send(playerId, { t: 'you', guess: result.private, nonce });
    if (this.settings.sharedBoard) {
      this.transport.broadcast({ t: 'guess', guess: result.public }, playerId);
    }

    if (result.solved) {
      this.endRound(playerId);
      return { ok: true };
    }

    if (result.drift) {
      // Everything on the board is now scored against a different word.
      this.transport.broadcast({
        t: 'drift',
        event: result.drift,
        charge: this.round.charge,
        cap: this.round.cap,
        anchored: this.round.anchored,
      });
      this.pushDriftLine(result.drift.headline);
      this.broadcastRescore();
    } else {
      this.transport.broadcast({
        t: 'patch',
        driftCharge: this.round.charge,
        driftCap: this.round.cap,
        players: this.playerList(),
        now: Date.now(),
      });
    }

    if (this.settings.mode === 'relay') this.advanceTurn();
    this.broadcastPresenceFor(playerId);
    return { ok: true };
  }

  private broadcastRescore() {
    if (!this.round) return;
    const board = this.round.publicBoard();
    for (const p of this.players.values()) {
      if (!p.connected) continue;
      this.transport.send(p.id, {
        t: 'rescore',
        epoch: this.round.epoch,
        board: this.settings.sharedBoard ? board : board.filter((g) => g.playerId === p.id),
        yours: this.round.privateBoardFor(p.id),
      });
    }
    this.syncPlayers();
  }

  echo(playerId: string, guessId: string): { ok: boolean; reason?: ErrorCode } {
    const p = this.players.get(playerId);
    if (!p || !this.round || this.phase !== 'playing') return { ok: false, reason: 'not_playing' };
    if (p.echoes <= 0) return { ok: false, reason: 'no_echoes' };

    const target = this.round.guesses.find((g) => g.id === guessId);
    if (!target) return { ok: false, reason: 'bad_message' };
    if (target.playerId === playerId) return { ok: false, reason: 'bad_message' };
    if (target.revealed) return { ok: false, reason: 'already_revealed' };

    p.echoes -= 1;
    p.echoesSpent += 1;
    this.round.reveal(guessId);

    // An Echo is public: everyone learns the rank, and everyone learns who paid
    // for it. Spending one tells the room you care about that word.
    this.transport.broadcast({
      t: 'echo',
      guessId,
      rank: target.rank,
      band: target.band,
      by: p.name,
      echoesLeft: p.echoes,
    });
    this.pushSystem(`${p.name} spent an Echo on "${target.word}" — rank ${target.rank}.`);
    this.syncPlayers();
    return { ok: true };
  }

  /* ---------------- relay turns ---------------- */

  private scheduleTurnTimeout() {
    this.clearTurnTimer();
    if (this.settings.mode !== 'relay' || this.phase !== 'playing') return;
    const ms = Math.max(0, (this.turnEndsAt ?? 0) - Date.now());
    this.turnTimer = setTimeout(() => {
      const skipped = this.players.get(this.turnPlayerId ?? '');
      if (skipped) this.pushSystem(`${skipped.name} ran out of time.`);
      this.advanceTurn();
    }, ms);
  }

  private turnTimer: NodeJS.Timeout | null = null;

  private clearTurnTimer() {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
  }

  private advanceTurn() {
    if (this.settings.mode !== 'relay' || this.phase !== 'playing') return;
    const eligible = this.order.filter((id) => this.players.get(id)?.connected);
    if (eligible.length === 0) {
      this.turnPlayerId = null;
      this.turnEndsAt = null;
      return;
    }
    const at = this.turnPlayerId ? eligible.indexOf(this.turnPlayerId) : -1;
    this.turnPlayerId = eligible[(at + 1) % eligible.length];
    this.turnEndsAt = Date.now() + RELAY_TURN_MS;
    this.scheduleTurnTimeout();
    this.transport.broadcast({
      t: 'patch',
      turnPlayerId: this.turnPlayerId,
      turnEndsAt: this.turnEndsAt,
      players: this.playerList(),
      driftCharge: this.round?.charge,
      driftCap: this.round?.cap,
      now: Date.now(),
    });
  }

  /* ---------------- round / match end ---------------- */

  private endRound(winnerId: string | null) {
    if (!this.round || this.phase !== 'playing') return;
    this.clearTimer();
    this.clearTurnTimer();
    this.round.expire();
    this.phase = 'roundEnd';

    const round = this.round;
    const awards = round.awards();

    for (const p of this.players.values()) {
      const base = round.scoreFor(p.id, this.settings.roundSeconds);
      const bonus = awards.filter((a) => a.playerId === p.id).reduce((n, a) => n + a.points, 0);
      p.score += base + bonus;
      if (p.id === winnerId) p.roundsWon += 1;

      // Guests have real stats rows too, so their history survives if they
      // later claim the account.
      recordRound(p.id, {
        won: p.id === winnerId,
        guesses: round.guessCountFor(p.id),
        bestRank: round.bestRankFor(p.id),
        drifts: round.drifts.length,
        winMs: p.id === winnerId ? (round.endedAt ?? Date.now()) - round.startedAt : null,
        echoesSpent: p.echoesSpent,
      });
    }

    const summary: RoundSummary = {
      round: this.roundIndex,
      target: round.target,
      definition: round.definition(),
      chainDetail: round.chainDetail(),
      neighbourhood: round.neighbourhood(8),
      winnerId,
      winnerName: winnerId ? (this.players.get(winnerId)?.name ?? null) : null,
      drifts: round.drifts.length,
      durationMs: (round.endedAt ?? Date.now()) - round.startedAt,
      chain: round.chainWords(),
      awards,
    };
    this.lastSummary = summary;

    run(
      `INSERT INTO round_log (id, match_id, idx, target, chain, winner_id, drifts, duration_ms, guess_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      uuid(),
      this.matchId ?? 'unknown',
      this.roundIndex,
      summary.target,
      JSON.stringify(summary.chain),
      winnerId,
      summary.drifts,
      summary.durationMs,
      round.guesses.length,
      Date.now(),
    );

    const isLast = this.roundIndex >= this.settings.rounds;
    this.phaseEndsAt = isLast ? null : Date.now() + INTERMISSION_MS;

    this.transport.broadcast({
      t: 'roundEnd',
      summary,
      players: this.playerList(),
      nextAt: this.phaseEndsAt,
    });
    this.broadcastPresence();

    if (isLast) {
      this.timer = setTimeout(() => this.endMatch(), 1500);
    } else {
      this.timer = setTimeout(() => this.beginCountdown(), INTERMISSION_MS);
    }
  }

  private endMatch() {
    this.clearTimer();
    this.phase = 'matchEnd';
    this.phaseEndsAt = null;
    this.turnPlayerId = null;

    const ranked = [...this.players.values()].sort(
      (a, b) => b.score - a.score || b.roundsWon - a.roundsWon,
    );
    const standings: Standing[] = ranked.map((p, i) => ({
      playerId: p.id,
      name: p.name,
      score: p.score,
      roundsWon: p.roundsWon,
      ratingBefore: p.rating,
      ratingAfter: p.rating,
      place: i + 1,
    }));

    // Ties share a place.
    for (let i = 1; i < standings.length; i++) {
      if (standings[i].score === standings[i - 1].score) standings[i].place = standings[i - 1].place;
    }

    if (ranked.length >= 2) {
      const updated = applyRatings(standings);
      updated.forEach((rating, i) => {
        standings[i].ratingAfter = rating;
        const p = this.players.get(standings[i].playerId);
        if (p && !p.guest) {
          p.rating = rating;
          setRating(p.id, rating);
        }
      });
    }

    for (const s of standings) {
      const p = this.players.get(s.playerId);
      if (!p) continue;
      recordMatch(p.id, s.place === 1);
      if (this.matchId) {
        run(
          `INSERT OR REPLACE INTO match_players
             (match_id, user_id, score, rounds_won, place, rating_before, rating_after)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          this.matchId,
          p.id,
          s.score,
          s.roundsWon,
          s.place,
          s.ratingBefore,
          s.ratingAfter,
        );
      }
    }
    if (this.matchId) run('UPDATE matches SET ended_at = ? WHERE id = ?', Date.now(), this.matchId);

    this.transport.broadcast({
      t: 'matchEnd',
      summary: this.lastSummary,
      players: this.playerList(),
      standings,
    });
    this.broadcastPresence();

    // Reset for a rematch.
    this.roundIndex = 0;
    this.round = null;
    this.matchId = null;
    for (const p of this.players.values()) p.ready = false;
  }

  rematch(playerId: string) {
    if (this.phase !== 'matchEnd') return;
    if (this.hostId !== playerId) return;
    this.phase = 'lobby';
    this.lastSummary = null;
    for (const p of this.players.values()) {
      p.score = 0;
      p.roundsWon = 0;
      p.ready = false;
    }
    this.broadcastState();
  }

  /* ---------------- chat ---------------- */

  chatMessage(playerId: string, text: string) {
    const p = this.players.get(playerId);
    if (!p) return;
    if (!this.spend(p, 'chat')) return;
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, 240);
    if (!clean) return;

    // Saying the answer out loud would be a cheap way to hand someone the win,
    // so the room only sees it as a redaction.
    const target = this.round?.target;
    const body =
      target && this.phase === 'playing'
        ? clean.replace(new RegExp(`\\b${target}\\b`, 'gi'), '[redacted]')
        : clean;

    const line: ChatLine = {
      id: shortId(8),
      playerId: p.id,
      name: p.name,
      text: body,
      at: Date.now(),
      kind: 'chat',
    };
    this.pushChat(line);
  }

  emote(playerId: string, key: string) {
    const p = this.players.get(playerId);
    if (!p || !this.spend(p, 'chat')) return;
    const allowed = ['hot', 'cold', 'nice', 'oof', 'drift', 'gg'];
    if (!allowed.includes(key)) return;
    this.pushChat({
      id: shortId(8),
      playerId: p.id,
      name: p.name,
      text: key,
      at: Date.now(),
      kind: 'emote',
    });
  }

  private pushSystem(text: string) {
    this.pushChat({ id: shortId(8), playerId: null, name: 'system', text, at: Date.now(), kind: 'system' });
  }

  private pushDriftLine(text: string) {
    this.pushSystem(text);
  }

  private pushChat(line: ChatLine) {
    this.chat.push(line);
    if (this.chat.length > MAX_CHAT) this.chat = this.chat.slice(-MAX_CHAT);
    this.transport.broadcast({ t: 'chat', line });
  }

  /* ---------------- presence ---------------- */

  broadcastPresence() {
    for (const p of this.players.values()) if (p.connected) this.broadcastPresenceFor(p.id);
  }

  broadcastPresenceFor(playerId: string) {
    const p = this.players.get(playerId);
    if (!p) return;
    const max = config.limits.maxPlayersPerRoom;
    const modeName = { commons: 'The Commons', blitz: 'Blitz Drift', relay: 'Relay', solo: 'Solo', daily: 'Daily' }[
      this.settings.mode
    ];

    let details: string;
    let state: string;
    if (this.phase === 'lobby' || this.phase === 'countdown') {
      details = `${modeName} — lobby`;
      state = `Room ${this.code} • ${this.connectedCount}/${max}`;
    } else if (this.phase === 'playing' && this.round) {
      const best = this.round.bestRankFor(playerId);
      details = `${modeName} — round ${this.roundIndex}/${this.settings.rounds}`;
      state = best === null ? 'Searching…' : `Best rank ${best} (${bandForRank(best)})`;
    } else {
      details = `${modeName} — results`;
      state = `${p.score} pts • ${p.roundsWon} round${p.roundsWon === 1 ? '' : 's'} won`;
    }

    this.transport.send(playerId, {
      t: 'presence',
      details,
      state,
      partySize: this.connectedCount,
      partyMax: max,
      endsAt: this.phaseEndsAt,
    });
  }

  /* ---------------- state ---------------- */

  stateFor(playerId: string): RoomState {
    const board = this.round ? this.round.publicBoard() : [];
    return {
      code: this.code,
      phase: this.phase,
      settings: this.settings,
      players: this.playerList(),
      round: this.roundIndex,
      now: Date.now(),
      phaseEndsAt: this.phaseEndsAt,
      driftCharge: this.round?.charge ?? 0,
      driftCap:
        this.round?.cap ??
        driftCapFor(0, Math.max(1, this.connectedCount), this.settings.driftSensitivity),
      drifts: this.round?.drifts ?? [],
      epoch: this.round?.epoch ?? 0,
      anchored: this.round?.anchored ?? false,
      board: this.settings.sharedBoard ? board : board.filter((g) => g.playerId === playerId),
      summary: this.phase === 'roundEnd' || this.phase === 'matchEnd' ? this.lastSummary : null,
      hostId: this.hostId,
      discordInstanceId: this.discordInstanceId,
      targetLengthKnown: this.round?.knownTargetLength(playerId) ?? null,
      turnPlayerId: this.turnPlayerId,
      turnEndsAt: this.turnEndsAt,
    };
  }

  /** A full snapshot plus the player's own private guesses. */
  sendSnapshot(playerId: string) {
    this.transport.send(playerId, { t: 'room', state: this.stateFor(playerId) });
    if (this.round) {
      this.transport.send(playerId, {
        t: 'rescore',
        epoch: this.round.epoch,
        board: this.stateFor(playerId).board,
        yours: this.round.privateBoardFor(playerId),
      });
    }
    for (const line of this.chat.slice(-20)) {
      this.transport.send(playerId, { t: 'chat', line });
    }
    this.broadcastPresenceFor(playerId);
  }

  private broadcastState() {
    for (const p of this.players.values()) {
      if (p.connected) this.transport.send(p.id, { t: 'room', state: this.stateFor(p.id) });
    }
  }

  private syncPlayers() {
    this.transport.broadcast({ t: 'patch', players: this.playerList(), now: Date.now() });
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  dispose() {
    this.clearTimer();
    this.clearTurnTimer();
    this.cancelEmptyTimer();
  }

  /* ---------------- rate limiting ---------------- */

  private spend(p: RoomPlayer, kind: 'guess' | 'chat'): boolean {
    const now = Date.now();
    const elapsed = now - p.lastRefill;
    if (elapsed > 0) {
      p.guessTokens = Math.min(
        config.limits.guessesPerMinute,
        p.guessTokens + (elapsed / 60000) * config.limits.guessesPerMinute,
      );
      p.chatTokens = Math.min(
        config.limits.chatPerMinute,
        p.chatTokens + (elapsed / 60000) * config.limits.chatPerMinute,
      );
      p.lastRefill = now;
    }
    if (kind === 'guess') {
      if (p.guessTokens < 1) return false;
      p.guessTokens -= 1;
      return true;
    }
    if (p.chatTokens < 1) return false;
    p.chatTokens -= 1;
    return true;
  }
}

/* ------------------------------------------------------------------ */
/* Rating                                                              */
/* ------------------------------------------------------------------ */

const K = 32;

/** Multiplayer Elo: score each player against every other, then average. */
export function applyRatings(standings: Standing[]): number[] {
  const n = standings.length;
  return standings.map((self, i) => {
    let delta = 0;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const other = standings[j];
      const expected = 1 / (1 + Math.pow(10, (other.ratingBefore - self.ratingBefore) / 400));
      const actual = self.place < other.place ? 1 : self.place === other.place ? 0.5 : 0;
      delta += actual - expected;
    }
    return Math.max(100, Math.round(self.ratingBefore + (K / (n - 1)) * delta));
  });
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

export { LEXICON_SIZE };
