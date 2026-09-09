# Driftle

**A multiplayer word game where the answer moves.**

**This is the result of asking claude to "do whatever you want"**

Wordle tells you about letters. Contexto tells you about meaning. Globle tells you
which way to go. Driftle does all three — and then does something none of them do:
when you get close, **the answer runs away.**

---

## The game

There is a hidden word somewhere in a 768-word semantic space.

**1 · Guess toward a meaning.** Every word you play comes back with a **rank**.
Rank 1 is the answer; rank 768 is as far away as the lexicon goes. Rank measures
meaning, not spelling — `wolf` sits near `fox` and `lynx`, and nowhere near `wolves`.

**2 · Proximity buys you letters.** This is where Driftle stops being Contexto.
The closer you get *semantically*, the more of the answer's *spelling* you unlock:

| Your rank | What you unlock |
|---|---|
| ≤ 300 | the **compass** — which axis you are most wrong about ("the answer is more abstract", "the answer is bigger") |
| ≤ 250 | the answer's **length** |
| ≤ 120 | letters you have in the **right position** (green) |
| ≤ 40 | letters that are **in the word at all** (yellow) |
| ≤ 8 | the opening letter |

So a cold guess is pure semantics and a burning one is nearly a Wordle row. The
two games are the same game, joined at proximity.

**3 · Get too close and it drifts.** Every near miss charges the **drift meter**.
When it fills, the answer *moves* to a neighbouring word — and every guess on the
board is re-scored around the new one. Your rank 3 can become a rank 140 without
you touching the keyboard.

Two consequences make this more than a gimmick:

- **No lead is safe**, so a comeback is always live right up to the final guess.
- **Drift can only land on words nobody has played.** Guessing *around* the answer
  fences it in. Fence it completely and it **anchors** — permanently frozen, and
  now anybody can take it. Board coverage becomes a resource you spend and deny.

---

## Multiplayer

Everyone plays onto **one shared board**. You see every word your opponents try —
but only its **heat band**, never the number. Every guess you make is therefore a
gift to the room, and the real skill is deciding when to spend information and
when to sit on it.

Three levers make that interesting:

- **Echo tokens** buy an opponent's exact rank. But an Echo is *public*: the room
  sees who spent it and on what, which broadcasts exactly which word you think
  matters. You get one back after every drift.
- **Cooldowns shrink as you heat up.** A player at rank 5 guesses roughly four
  times as often as a player at rank 500. Closing in earns you tempo — which is
  usually what makes someone else panic and charge the drift meter.
- **Drift is a weapon.** Trailing badly? Hammer near-misses and blow up the
  leader's board on purpose.

### Modes

| Mode | Shape |
|---|---|
| **The Commons** | 2–8 players, 3 rounds, 5 minutes each. The default. |
| **Blitz Drift** | Short fuse, 2.5s cooldowns, 2 drifts, 5 quick rounds. |
| **Relay** | Strict turn order, one guess each, 25 seconds on the clock. A bad guess wastes your whole side of the table's turn. |

Plus a **daily puzzle** (same word for everyone, streaks, spoiler-free share card)
and unlimited **practice runs**.

Matches are Elo-rated, with a multiplayer rating that scores each player against
every other and averages the result.

---

## Running it

Requires **Node 24+**. That is a hard requirement, not a preference: the database
is the built-in `node:sqlite` module, unflagged only from Node 23.4. The payoff is
that there is no native module to compile and no database server to run.

```bash
npm install
npm run dev
```

That starts the API on `:3000` and the Vite client on `:5173`. Open
<http://localhost:5173>. **No configuration is needed** — there is no `.env` to
write, no database to create, no keys to obtain. Sign up, or hit *Play as a guest*.

Production:

```bash
npm run build
npm start        # serves the API and the built client from one process on :3000
```

### Checks

```bash
npm test              # typecheck + lexicon sanity + a simulated 3-bot round
npm run check:lexicon # print semantic neighbourhoods — the game is only as good as these
npm run test:e2e      # full websocket match against a running server
```

`check:lexicon` is the one to look at if the game ever *feels* wrong. It prints
what the engine thinks is near what:

```
wolf       -> lynx, bear, fox, cougar, hyena, cheetah, panther, jaguar
ocean      -> sea, stream, rapids, pond, tide, river, lake, wave
grief      -> shame, dread, envy, loneliness, anger, jealousy, sadness, fear
computer   -> robot, algorithm, cursor, pixel, database, signal, screen, software
```

---

## Deploying to Railway

The repo is Railway-ready with nothing to configure.

1. **New Project → Deploy from GitHub repo**, and pick this repo.
2. Railway reads `railway.json`, builds the `Dockerfile` (pinned to Node 24), and
   health-checks `/api/health`.
3. Click **Generate Domain**. That is the whole deployment.

The app detects the platform and configures itself:

| What | How it is resolved |
|---|---|
| `PORT` | read from Railway's injected variable |
| Public URL | derived from `RAILWAY_PUBLIC_DOMAIN` |
| Database location | moved onto `RAILWAY_VOLUME_MOUNT_PATH` automatically when a volume is attached |
| Session secret | generated once and stored beside the database if unset |
| Client hosting | the API process serves the built client, so it is one service |

**Attach a volume** (Railway → your service → *Data* → *Add Volume*) to keep
accounts between deploys. Without one the game runs perfectly but the database
lives on the container filesystem and is wiped on redeploy — the server says so
loudly at boot rather than losing data quietly:

```
! No volume detected on Railway. The database lives on the container
  filesystem and will be wiped on redeploy — attach a volume and the
  database moves there automatically.
```

Nothing else is required. Every variable in `.env.example` is optional; each one
you skip disables exactly one optional feature and leaves the rest working.

---

## Discord integration

Both halves are optional and independently degradable. With no Discord
credentials the server logs one warning at boot and the game plays normally in a
browser.

Set two variables to switch it on:

```
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
```

### 1 · Sign in with Discord

Adds a *Continue with Discord* button. In the
[Developer Portal](https://discord.com/developers/applications) → **OAuth2**, add
this redirect URL:

```
https://<your-domain>/api/auth/discord/callback
```

A guest who signs in through Discord keeps everything they already played — the
guest row is upgraded in place rather than replaced.

### 2 · The Activity (and Rich Presence)

Driftle runs as an embedded Activity inside a Discord voice channel, and this is
where the shared-board design pays off: **the voice channel is the lobby.**
Everyone who launches the Activity lands in the same room automatically, with no
code to type, because the room is keyed on the Discord `instanceId`.

In the Developer Portal:

1. **Activities → Settings → enable Activities.**
2. **Activities → URL Mappings**, add a root mapping:

   | Prefix | Target |
   |---|---|
   | `/` | `your-domain.up.railway.app` |

3. **OAuth2 → Scopes**, make sure `identify`, `guilds.members.read` and
   `rpc.activities.write` are permitted.
4. **Rich Presence → Art Assets**: upload an image named `driftle`. This is the
   only genuinely cosmetic step — if you skip it the presence card still shows,
   just without artwork.

Then launch it from the rocket icon in any voice channel.

**Rich Presence** updates live as you play, driven by the server so every client
agrees on what it says:

```
Driftle
The Commons — round 2/3
Best rank 14 (hot)
3 of 8 · 04:12 left
```

A few implementation notes, since Activities have sharp edges:

- Requests from inside the iframe are routed through Discord's proxy at
  `/.proxy`, which the client detects from the `frame_id` query parameter and
  prefixes automatically.
- Third-party cookies are unreliable in the iframe, so authentication also
  carries a bearer token; the websocket accepts either.
- The token exchange happens server-side — the client secret never reaches the
  browser.
- If any step fails (denied scope, missing credentials, Discord unreachable), the
  Activity explains what went wrong and tells the player they can keep playing in
  a browser, rather than showing a dead screen.

---

## How it is built

```
shared/protocol.ts     one wire contract, imported by both sides
server/
  game/lexicon/        the semantic space (words.ts is hand-authored data)
  game/engine.ts       pure round logic: scoring, drift, rescoring, awards
  game/room.ts         the multiplayer state machine
  game/daily.ts        daily + practice, persisted by replaying guesses
  ws/hub.ts            websocket transport, rooms, matchmaking
  http/                REST: auth, daily, profiles, leaderboards
  db/                  node:sqlite, schema inlined and idempotent
client/                React + Vite
```

Two decisions worth explaining:

**The semantic space is authored, not trained.** Instead of shipping an embedding
matrix, `words.ts` describes 768 words as a taxonomy: shared group tags, two to
five tags of their own, and ten scalar axes (concrete, animate, size, human,
natural, motion, valence, intensity, tech, temporal). Tags are idf-weighted, so a
rare tag like `venom` pulls far harder than a common one like `animal`.

The point is *legibility*. Every neighbourhood can be explained, which is what
makes drift readable rather than arbitrary — when the answer moves, players can
feel which way it went. It is also what lets the compass name a real axis instead
of gesturing vaguely. The whole space is a 40KB file you can read and edit.

**Daily runs persist as a list of guesses, not as engine state.** Drift depends on
a seeded RNG *and* on which words are already on the board, so replaying the same
guesses through a fresh `Round` reproduces the puzzle exactly — every drift
included — with no serialisation format to keep in sync as the engine changes.

---

## Troubleshooting a deploy

### `sh: vite: not found` (exit code 127), looping in `/app/client`

The platform is running the **client's dev server** instead of the built app.
`vite` is a devDependency, so it does not exist in a production install — the
missing binary is a symptom, not the cause.

Driftle is an npm workspace monorepo that deploys as **one service from the
repository root**. The client is a static bundle the API process serves; it is
not a service of its own. Check, in order:

1. **Railway → your service → Settings → Deploy → Custom Start Command.**
   It must be `npm start`, or empty so the Dockerfile's `CMD` is used. If it
   says `npm run dev`, that is the bug — `dev` runs Vite, which only exists in
   development.
2. **Settings → Source → Root Directory.** It must be the repository root, not
   `client`. Rooted at `client`, a builder finds no `start` script and falls
   back to `dev`.
3. **Settings → Build → Builder.** `railway.json` asks for `DOCKERFILE`. A
   dashboard override wins over the file.

Guards are in place so this fails loudly rather than looping: running the client
as a service now prints what to change instead of a missing-binary error, and
`npm start` builds the app itself if the platform skipped the build step.

### Accounts disappear after a deploy

No volume is attached, so the SQLite file lives on the container filesystem.
Railway → your service → **Data → Add Volume**. The database moves onto it
automatically at the next boot; nothing to configure.

### `SESSION_SECRET is not set` warning in production

Harmless by default — a secret is generated and stored next to the database, so
sessions survive restarts. Set `SESSION_SECRET` explicitly if you ever rebuild
or move the volume, since a new secret signs everyone out.
