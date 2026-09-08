import type { Server as HttpServer, IncomingMessage } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { parse as parseCookie } from 'cookie';
import type { ClientMessage, ErrorCode, ServerMessage, RoomSettings } from '../../../shared/protocol.ts';
import { PROTOCOL_VERSION } from '../../../shared/protocol.ts';
import { config } from '../config.ts';
import { Room, type JoinInfo, type RoomTransport } from '../game/room.ts';
import { userForToken } from '../auth/sessions.ts';
import { discordIdFor } from '../auth/discord.ts';
import { roomCode } from '../util/ids.ts';
import type { UserRow } from '../db/index.ts';

interface Conn {
  socket: WebSocket;
  userId: string;
  user: UserRow;
  roomCode: string | null;
  alive: boolean;
}

export class Hub {
  private wss: WebSocketServer;
  private rooms = new Map<string, Room>();
  private byDiscordInstance = new Map<string, string>();
  /** A user may have several tabs open; all of them mirror the same seat. */
  private connsByUser = new Map<string, Set<Conn>>();
  private conns = new Set<Conn>();

  constructor(server: HttpServer) {
    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname !== '/ws') return;

      const user = this.authenticate(req, url);
      if (!user) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => this.accept(ws, user));
    });

    const heartbeat = setInterval(() => {
      for (const conn of this.conns) {
        if (!conn.alive) {
          conn.socket.terminate();
          continue;
        }
        conn.alive = false;
        try {
          conn.socket.ping();
        } catch {
          /* the close handler will clean up */
        }
      }
    }, 30_000);
    heartbeat.unref();
  }

  private authenticate(req: IncomingMessage, url: URL): UserRow | undefined {
    const fromQuery = url.searchParams.get('token');
    if (fromQuery) {
      const u = userForToken(fromQuery);
      if (u) return u;
    }
    const cookies = parseCookie(req.headers.cookie ?? '');
    return userForToken(cookies[config.session.cookieName]);
  }

  private accept(socket: WebSocket, user: UserRow) {
    const conn: Conn = { socket, user, userId: user.id, roomCode: null, alive: true };
    this.conns.add(conn);
    let set = this.connsByUser.get(user.id);
    if (!set) {
      set = new Set();
      this.connsByUser.set(user.id, set);
    }
    set.add(conn);

    socket.on('pong', () => {
      conn.alive = true;
    });

    socket.on('message', (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(raw)) as ClientMessage;
      } catch {
        this.toConn(conn, { t: 'error', code: 'bad_message', message: 'Malformed message.' });
        return;
      }
      try {
        this.handle(conn, msg);
      } catch (err) {
        console.error('[ws] handler failed', err);
        this.toConn(conn, { t: 'error', code: 'bad_message', message: 'Something went wrong.' });
      }
    });

    socket.on('close', () => this.dropConn(conn));
    socket.on('error', () => this.dropConn(conn));

    this.toConn(conn, {
      t: 'welcome',
      protocol: PROTOCOL_VERSION,
      serverNow: Date.now(),
      you: {
        id: user.id,
        name: user.display_name,
        avatar: user.avatar,
        discordId: discordIdFor(user.id),
        guest: user.guest === 1,
        connected: true,
        ready: false,
        host: false,
        echoes: 0,
        score: 0,
        roundsWon: 0,
        bestRank: null,
        bestBand: null,
        guesses: 0,
        cooldownUntil: 0,
        rating: user.rating,
        title: user.title,
      },
    });
  }

  private dropConn(conn: Conn) {
    if (!this.conns.has(conn)) return;
    this.conns.delete(conn);
    const set = this.connsByUser.get(conn.userId);
    set?.delete(conn);

    // Only report the player as gone once their last tab closes.
    if (set && set.size === 0) {
      this.connsByUser.delete(conn.userId);
      if (conn.roomCode) this.rooms.get(conn.roomCode)?.disconnect(conn.userId);
    }
  }

  /* ---------------- transport ---------------- */

  private send(playerId: string, msg: ServerMessage) {
    const set = this.connsByUser.get(playerId);
    if (!set) return;
    const payload = JSON.stringify(msg);
    for (const c of set) {
      if (c.socket.readyState === WebSocket.OPEN) c.socket.send(payload);
    }
  }

  /** Scopes a room's transport calls to that room's own members. */
  private transportFor(room: Room): RoomTransport {
    return {
      send: (playerId, msg) => {
        if (room.has(playerId)) this.send(playerId, msg);
      },
      broadcast: (msg, except) => {
        for (const p of room.playerList()) {
          if (except && p.id === except) continue;
          this.send(p.id, msg);
        }
      },
      onEmpty: (r) => this.destroyRoom(r),
    };
  }

  private toConn(conn: Conn, msg: ServerMessage) {
    if (conn.socket.readyState === WebSocket.OPEN) conn.socket.send(JSON.stringify(msg));
  }

  private destroyRoom(room: Room) {
    room.dispose();
    this.rooms.delete(room.code);
    if (room.discordInstanceId) this.byDiscordInstance.delete(room.discordInstanceId);
  }

  /* ---------------- rooms ---------------- */

  private createRoom(opts: {
    code?: string;
    settings?: Partial<RoomSettings>;
    discordInstanceId?: string | null;
  }): Room {
    let code = opts.code ?? roomCode();
    while (this.rooms.has(code)) code = roomCode();

    const room = new Room({
      code,
      settings: opts.settings,
      discordInstanceId: opts.discordInstanceId ?? null,
    });
    room.attachTransport(this.transportFor(room));

    this.rooms.set(code, room);
    if (opts.discordInstanceId) this.byDiscordInstance.set(opts.discordInstanceId, code);
    return room;
  }

  /** Public rooms in the lobby with room to spare, newest first. */
  private findOpenRoom(mode: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.settings.private) continue;
      if (room.discordInstanceId) continue;
      if (room.phase !== 'lobby') continue;
      if (room.settings.mode !== mode) continue;
      if (room.size >= config.limits.maxPlayersPerRoom) continue;
      return room;
    }
    return undefined;
  }

  listPublicRooms() {
    const out: {
      code: string;
      mode: string;
      players: number;
      max: number;
      phase: string;
      difficulty: number;
    }[] = [];
    for (const room of this.rooms.values()) {
      if (room.settings.private || room.discordInstanceId) continue;
      out.push({
        code: room.code,
        mode: room.settings.mode,
        players: room.size,
        max: config.limits.maxPlayersPerRoom,
        phase: room.phase,
        difficulty: room.settings.difficulty,
      });
    }
    return out.sort((a, b) => b.players - a.players);
  }

  get stats() {
    return {
      rooms: this.rooms.size,
      connections: this.conns.size,
      players: this.connsByUser.size,
    };
  }

  /* ---------------- message routing ---------------- */

  private handle(conn: Conn, msg: ClientMessage) {
    const room = conn.roomCode ? this.rooms.get(conn.roomCode) : null;

    switch (msg.t) {
      case 'join':
        this.handleJoin(conn, msg);
        return;

      case 'ping':
        this.toConn(conn, { t: 'pong', at: msg.at, serverNow: Date.now() });
        return;

      case 'leave':
        if (room) {
          room.leave(conn.userId);
          conn.roomCode = null;
        }
        return;
    }

    if (!room) {
      this.toConn(conn, { t: 'error', code: 'no_room', message: 'You are not in a room.' });
      return;
    }

    switch (msg.t) {
      case 'ready':
        room.setReady(conn.userId, !!msg.value);
        break;

      case 'start': {
        const r = room.start(conn.userId);
        if (!r.ok) this.fail(conn, r.reason ?? 'not_host', 'Only the host can start.');
        break;
      }

      case 'settings': {
        const r = room.updateSettings(conn.userId, msg.patch ?? {});
        if (!r.ok) this.fail(conn, r.reason, 'Settings can only be changed by the host in the lobby.');
        break;
      }

      case 'guess': {
        const r = room.guess(conn.userId, String(msg.word ?? ''), msg.nonce);
        if (!r.ok) this.fail(conn, r.reason ?? 'bad_message', guessErrorText(r.reason));
        break;
      }

      case 'echo': {
        const r = room.echo(conn.userId, String(msg.guessId ?? ''));
        if (!r.ok) this.fail(conn, r.reason ?? 'bad_message', echoErrorText(r.reason));
        break;
      }

      case 'chat':
        room.chatMessage(conn.userId, String(msg.text ?? ''));
        break;

      case 'emote':
        room.emote(conn.userId, String(msg.key ?? ''));
        break;

      case 'rematch':
        room.rematch(conn.userId);
        break;

      default:
        this.fail(conn, 'bad_message', 'Unknown message.');
    }
  }

  private handleJoin(conn: Conn, msg: Extract<ClientMessage, { t: 'join' }>) {
    // Leave whatever we were in first.
    if (conn.roomCode) {
      this.rooms.get(conn.roomCode)?.leave(conn.userId);
      conn.roomCode = null;
    }

    let room: Room | undefined;

    if (msg.discordInstanceId) {
      // Everyone in the same Discord voice channel lands in the same room,
      // with no code to type.
      const existing = this.byDiscordInstance.get(msg.discordInstanceId);
      room = existing ? this.rooms.get(existing) : undefined;
      if (!room) {
        room = this.createRoom({
          settings: { ...msg.settings, private: true },
          discordInstanceId: msg.discordInstanceId,
        });
      }
    } else if (msg.code) {
      room = this.rooms.get(msg.code.toUpperCase().trim());
      if (!room) {
        this.fail(conn, 'no_room', 'No room with that code.');
        return;
      }
    } else {
      const mode = msg.settings?.mode ?? 'commons';
      room = this.findOpenRoom(mode);
      if (!room) {
        if (this.rooms.size >= config.limits.maxRooms) {
          this.fail(conn, 'room_full', 'The server is at capacity, try again shortly.');
          return;
        }
        room = this.createRoom({ settings: msg.settings });
      }
    }

    const info: JoinInfo = {
      userId: conn.userId,
      name: conn.user.display_name,
      avatar: conn.user.avatar,
      guest: conn.user.guest === 1,
      rating: conn.user.rating,
      title: conn.user.title,
      discordId: discordIdFor(conn.userId),
    };

    const result = room.join(info);
    if (!result.ok) {
      this.fail(conn, result.reason, 'That room is full.');
      return;
    }

    conn.roomCode = room.code;
    // Other tabs from the same user follow along.
    for (const c of this.connsByUser.get(conn.userId) ?? []) c.roomCode = room.code;
    room.sendSnapshot(conn.userId);
  }

  private fail(conn: Conn, code: ErrorCode, message: string) {
    this.toConn(conn, { t: 'error', code, message });
  }
}

function guessErrorText(reason?: string): string {
  switch (reason) {
    case 'unknown_word':
      return 'That word is not in the Driftle lexicon.';
    case 'duplicate':
      return 'Someone has already played that word.';
    case 'too_short':
      return 'Guesses are at least three letters.';
    case 'cooldown':
      return 'Still cooling down.';
    case 'rate_limited':
      return 'Slow down a moment.';
    case 'not_playing':
      return 'Not your turn.';
    default:
      return 'That guess did not land.';
  }
}

function echoErrorText(reason?: string): string {
  switch (reason) {
    case 'no_echoes':
      return 'You are out of Echo tokens.';
    case 'already_revealed':
      return 'That rank is already public.';
    default:
      return 'You cannot Echo that guess.';
  }
}
