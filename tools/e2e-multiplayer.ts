/**
 * End-to-end multiplayer smoke test against a running server.
 *
 * Signs up two accounts over HTTP, opens two websockets, plays a real match to
 * completion, and asserts the whole loop: join, lobby, countdown, guessing,
 * cooldowns, drift + rescore, Echo tokens, round end, ratings and match end.
 *
 * Run:  node --experimental-strip-types tools/e2e-multiplayer.ts
 */
import { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage, RoomState } from '../shared/protocol.ts';
import { LEXICON, orderFor, lookup, entryAt } from '../server/src/game/lexicon/index.ts';

const BASE = process.env.DRIFTLE_URL ?? 'http://localhost:3000';
const WS_BASE = BASE.replace(/^http/, 'ws');

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function signup(username: string) {
  const res = await fetch(`${BASE}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      email: `${username}@example.test`,
      password: 'driftle-test-pw',
    }),
  });
  if (!res.ok) throw new Error(`signup ${username} failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { token: string; user: { id: string; displayName: string } };
  return body;
}

class Bot {
  ws!: WebSocket;
  id: string;
  name: string;
  token: string;
  state: RoomState | null = null;
  myRanks = new Map<string, number>();
  seen: ServerMessage['t'][] = [];
  cooldownUntil = 0;
  echoesSpent = 0;
  solved = false;

  constructor(id: string, name: string, token: string) {
    this.id = id;
    this.name = name;
    this.token = token;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${WS_BASE}/ws?token=${encodeURIComponent(this.token)}`);
      this.ws.on('open', () => resolve());
      this.ws.on('error', reject);
      this.ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw)) as ServerMessage;
        this.seen.push(msg.t);
        this.handle(msg);
      });
    });
  }

  private handle(msg: ServerMessage) {
    switch (msg.t) {
      case 'room':
        this.state = msg.state;
        break;
      case 'patch':
        if (this.state) {
          this.state = {
            ...this.state,
            players: msg.players ?? this.state.players,
            phase: msg.phase ?? this.state.phase,
            driftCharge: msg.driftCharge ?? this.state.driftCharge,
            driftCap: msg.driftCap ?? this.state.driftCap,
            turnPlayerId: msg.turnPlayerId !== undefined ? msg.turnPlayerId : this.state.turnPlayerId,
          };
        }
        break;
      case 'guess':
        // Opponent guesses arrive as public rows; track them so we can Echo one.
        if (this.state) this.state = { ...this.state, board: [...this.state.board, msg.guess] };
        break;
      case 'you':
        this.myRanks.set(msg.guess.word, msg.guess.rank);
        if (msg.guess.rank === 1) this.solved = true;
        if (this.state) this.state = { ...this.state, board: [...this.state.board, msg.guess] };
        break;
      case 'rescore':
        this.myRanks.clear();
        for (const g of msg.yours) this.myRanks.set(g.word, g.rank);
        if (this.state) this.state = { ...this.state, board: msg.board };
        break;
      case 'echo':
        if (this.state) {
          this.state = {
            ...this.state,
            board: this.state.board.map((g) =>
              g.id === msg.guessId ? { ...g, rank: msg.rank, revealed: true } : g,
            ),
          };
        }
        break;
      case 'cooldown':
        this.cooldownUntil = msg.until;
        break;
      case 'roundEnd':
        if (this.state) this.state = { ...this.state, phase: 'roundEnd', summary: msg.summary };
        break;
      case 'matchEnd':
        if (this.state) this.state = { ...this.state, phase: 'matchEnd' };
        break;
    }
  }

  send(msg: ClientMessage) {
    this.ws.send(JSON.stringify(msg));
  }

  /** Hill-climb from the best word this bot personally knows about. */
  nextWord(played: Set<string>): string {
    let bestWord: string | null = null;
    let bestRank = Infinity;
    for (const [w, r] of this.myRanks) {
      if (r < bestRank) {
        bestRank = r;
        bestWord = w;
      }
    }
    if (bestWord && bestRank <= 300) {
      const order = orderFor(lookup(bestWord)!.index);
      for (let pos = 1; pos < 120; pos++) {
        const w = entryAt(order[pos]).word;
        if (!played.has(w)) return w;
      }
    }
    for (let i = 0; i < 200; i++) {
      const w = LEXICON[Math.floor(Math.random() * LEXICON.length)].word;
      if (!played.has(w)) return w;
    }
    return LEXICON.find((e) => !played.has(e.word))!.word;
  }

  close() {
    this.ws.close();
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(label: string, fn: () => boolean, timeoutMs = 25_000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for: ${label}`);
    await wait(60);
  }
}

async function main() {
  console.log(`\nDriftle end-to-end multiplayer test against ${BASE}\n`);

  const stamp = Date.now().toString(36).slice(-6);
  const [a, b] = await Promise.all([signup(`e2e_a_${stamp}`), signup(`e2e_b_${stamp}`)]);

  const alice = new Bot(a.user.id, a.user.displayName, a.token);
  const bob = new Bot(b.user.id, b.user.displayName, b.token);

  await Promise.all([alice.connect(), bob.connect()]);
  check('both sockets authenticated', alice.seen.includes('welcome') && bob.seen.includes('welcome'));

  // Alice opens a private room; Bob joins it by code.
  alice.send({
    t: 'join',
    settings: {
      mode: 'commons',
      private: true,
      rounds: 1,
      roundSeconds: 90,
      maxDrifts: 3,
      difficulty: 2,
      // Hair-trigger, so the drift + rescore path is exercised on every run
      // rather than only when the bots happen to converge slowly.
      driftSensitivity: 3,
      // The default 6s cooldown is right for humans and far too slow for a
      // test: the bots need enough guesses to actually converge.
      baseCooldownMs: 250,
    },
  });
  await until('alice in a room', () => alice.state !== null);
  const code = alice.state!.code;
  check('room created', /^[A-Z0-9]{4}$/.test(code), `code ${code}`);

  bob.send({ t: 'join', code });
  await until('bob in the room', () => bob.state !== null);
  await until('both players visible', () => (alice.state?.players.length ?? 0) === 2);
  check('two players in room', alice.state!.players.length === 2);
  check('alice is host', alice.state!.hostId === alice.id);

  // Host starts; countdown then play.
  alice.send({ t: 'start' });
  await until('round playing', () => alice.state?.phase === 'playing' && bob.state?.phase === 'playing');
  check('round started', true);
  check(
    'drift meter scaled by sensitivity and player count',
    alice.state!.driftCap > 4 && alice.state!.driftCap < 14,
    `cap ${alice.state!.driftCap}`,
  );

  const played = new Set<string>();
  let echoTried = false;
  const deadline = Date.now() + 80_000;

  while (
    alice.state?.phase === 'playing' &&
    Date.now() < deadline &&
    !alice.solved &&
    !bob.solved
  ) {
    for (const bot of [alice, bob]) {
      if (bot.state?.phase !== 'playing') continue;
      if (Date.now() < bot.cooldownUntil) continue;

      const word = bot.nextWord(played);
      played.add(word);
      bot.send({ t: 'guess', word });
      await wait(90);

      // Once there is something to Echo, Bob buys a rank from Alice.
      if (!echoTried && bot === bob) {
        const target = bob.state?.board.find((g) => g.playerId === alice.id && !g.revealed);
        if (target) {
          echoTried = true;
          bob.send({ t: 'echo', guessId: target.id });
          await wait(160);
          const after = bob.state?.board.find((g) => g.id === target.id);
          check(
            'echo revealed an opponent rank',
            bob.seen.includes('echo') && typeof after?.rank === 'number',
            `"${target.word}" -> rank ${after?.rank}`,
          );
        }
      }
    }
    await wait(60);
  }

  check('somebody solved the round', alice.solved || bob.solved);
  check('a drift or anchor occurred', alice.seen.includes('drift'), `drifts seen: ${alice.seen.filter((t) => t === 'drift').length}`);
  check('board was rescored', alice.seen.includes('rescore'));
  check('cooldowns were issued', alice.seen.includes('cooldown'));

  await until('round ended', () => alice.seen.includes('roundEnd'), 15_000);
  check('roundEnd delivered to both', alice.seen.includes('roundEnd') && bob.seen.includes('roundEnd'));

  await until('match ended', () => alice.seen.includes('matchEnd'), 15_000);
  check('matchEnd delivered to both', alice.seen.includes('matchEnd') && bob.seen.includes('matchEnd'));

  // Ratings should have moved for a two-player match.
  await wait(400);
  const profile = (await (await fetch(`${BASE}/api/profile/${a.user.displayName}`)).json()) as {
    user: { rating: number };
    stats: { roundsWon: number; gamesPlayed: number };
  };
  check('rating updated away from 1000', profile.user.rating !== 1000, `rating ${profile.user.rating}`);
  check('match recorded in stats', profile.stats.gamesPlayed >= 1, `games ${profile.stats.gamesPlayed}`);

  alice.close();
  bob.close();

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nE2E FAILED:', err);
  process.exit(1);
});
