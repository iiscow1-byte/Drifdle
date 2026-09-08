import { BASE, getToken } from './api.ts';
/**
 * A small reconnecting websocket.
 *
 * Reconnects matter more here than in most games: a dropped socket in the
 * middle of a round would otherwise cost a player their seat, so the server
 * keeps them for a grace period and this class quietly re-joins.
 */
export class GameSocket {
    ws = null;
    listeners = new Set();
    statusListeners = new Set();
    retry = 0;
    retryTimer = null;
    closedByUs = false;
    queue = [];
    pingTimer = null;
    /** Replayed after a reconnect so the player lands back in their room. */
    rejoin = null;
    status = 'idle';
    /** serverNow - Date.now() at handshake, used to align countdowns. */
    clockSkew = 0;
    latency = 0;
    connect() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }
        this.closedByUs = false;
        this.setStatus('connecting');
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const token = getToken();
        const url = `${proto}//${location.host}${BASE}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`;
        const ws = new WebSocket(url);
        this.ws = ws;
        ws.onopen = () => {
            this.retry = 0;
            this.setStatus('open');
            if (this.rejoin)
                this.send(this.rejoin);
            for (const msg of this.queue.splice(0))
                this.send(msg);
            this.startPing();
        };
        ws.onmessage = (event) => {
            let msg;
            try {
                msg = JSON.parse(event.data);
            }
            catch {
                return;
            }
            if (msg.t === 'welcome')
                this.clockSkew = msg.serverNow - Date.now();
            if (msg.t === 'pong') {
                this.latency = Date.now() - msg.at;
                this.clockSkew = msg.serverNow - (msg.at + this.latency / 2);
            }
            for (const l of this.listeners)
                l(msg);
        };
        ws.onclose = () => {
            this.stopPing();
            this.ws = null;
            this.setStatus('closed');
            if (!this.closedByUs)
                this.scheduleReconnect();
        };
        ws.onerror = () => {
            /* onclose always follows, and handles the retry */
        };
    }
    scheduleReconnect() {
        if (this.retryTimer !== null)
            return;
        // 0.5s, 1s, 2s, 4s, capped at 10s, with jitter so a server restart does not
        // bring every client back in the same millisecond.
        const delay = Math.min(10_000, 500 * 2 ** this.retry) * (0.75 + Math.random() * 0.5);
        this.retry += 1;
        this.retryTimer = window.setTimeout(() => {
            this.retryTimer = null;
            this.connect();
        }, delay);
    }
    startPing() {
        this.stopPing();
        this.pingTimer = window.setInterval(() => this.send({ t: 'ping', at: Date.now() }), 15_000);
    }
    stopPing() {
        if (this.pingTimer !== null)
            window.clearInterval(this.pingTimer);
        this.pingTimer = null;
    }
    setStatus(status) {
        this.status = status;
        for (const l of this.statusListeners)
            l(status);
    }
    send(msg) {
        if (msg.t === 'join')
            this.rejoin = msg;
        if (msg.t === 'leave')
            this.rejoin = null;
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
        else if (msg.t !== 'ping') {
            this.queue.push(msg);
            this.connect();
        }
    }
    on(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    onStatus(listener) {
        this.statusListeners.add(listener);
        return () => this.statusListeners.delete(listener);
    }
    /** Server time, corrected for clock skew. */
    now() {
        return Date.now() + this.clockSkew;
    }
    close() {
        this.closedByUs = true;
        this.rejoin = null;
        this.stopPing();
        if (this.retryTimer !== null)
            window.clearTimeout(this.retryTimer);
        this.retryTimer = null;
        this.ws?.close();
        this.ws = null;
        this.setStatus('idle');
    }
}
export const socket = new GameSocket();
