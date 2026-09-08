import { useEffect, useRef, useState } from 'react';
import type { GameMode, RoomSettings } from '@shared/protocol.ts';
import { api } from '../lib/api.ts';
import { useSession, useTicker, toast } from '../lib/store.tsx';
import { useRoom } from '../lib/useRoom.ts';
import { Board } from '../components/Board.tsx';
import {
  Chat,
  Countdown,
  DriftFlash,
  DriftMeter,
  GuessInput,
  PlayerList,
  SummaryPanel,
} from '../components/GameBits.tsx';
import { Modal, Spinner } from '../components/ui.tsx';
import { DIFFICULTY_LABEL, MODE_LABEL, formatClock } from '../lib/format.ts';

/**
 * `param` encodes how we got here:
 *   activity          — bind to the Discord Activity instance
 *   quick:<mode>      — matchmake into any open room of that mode
 *   new:<mode>        — always create a fresh room
 *   private:<mode>    — create a room nobody can matchmake into
 *   code:<CODE>       — join a specific room
 */
export function Play({ param, navigate }: { param?: string; navigate: (n: string, p?: string) => void }) {
  const { user, discord } = useSession();
  const [view, actions] = useRoom();
  const [lexiconSize, setLexiconSize] = useState(75352);
  const [showSummary, setShowSummary] = useState(false);
  const joined = useRef<string | null>(null);

  useEffect(() => {
    api.rules().then((r) => setLexiconSize(r.lexiconSize)).catch(() => {});
  }, []);

  // Join exactly once per target, and re-join if the target changes.
  useEffect(() => {
    if (!user || !param || joined.current === param) return;
    joined.current = param;

    const [kind, rest] = param.includes(':') ? param.split(/:(.*)/s) : [param, ''];

    if (kind === 'activity') {
      if (!discord.instanceId) return; // wait for the SDK handshake
      actions.join({ discordInstanceId: discord.instanceId, settings: { mode: 'commons' } });
    } else if (kind === 'code') {
      actions.join({ code: rest });
    } else if (kind === 'quick') {
      actions.join({ settings: { mode: rest as GameMode } });
    } else if (kind === 'new') {
      actions.join({ settings: { mode: rest as GameMode, private: false } });
    } else if (kind === 'private') {
      actions.join({ settings: { mode: rest as GameMode, private: true } });
    }
    // `actions` is recreated per render but its callbacks are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, param, discord.instanceId]);

  useEffect(() => {
    return () => {
      joined.current = null;
    };
  }, []);

  const state = view.state;
  const me = state?.players.find((p) => p.id === user?.id) ?? null;
  const isHost = state?.hostId === user?.id;

  useEffect(() => {
    if (state?.phase === 'roundEnd' || state?.phase === 'matchEnd') setShowSummary(true);
    if (state?.phase === 'playing' || state?.phase === 'countdown') setShowSummary(false);
  }, [state?.phase]);

  if (!user) {
    return (
      <div className="page center-screen">
        <div>
          <h1 style={{ fontSize: 22 }}>Sign in to play</h1>
          <p className="muted">Multiplayer needs an identity — guest accounts work fine.</p>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="page center-screen">
        <div className="stack" style={{ alignItems: 'center' }}>
          <Spinner />
          <div className="muted">
            {view.status === 'open' ? 'Finding you a room…' : 'Connecting…'}
          </div>
          <button className="btn ghost sm" onClick={() => navigate('home')}>
            Back
          </button>
        </div>
      </div>
    );
  }

  const playing = state.phase === 'playing';
  const myTurn = state.settings.mode !== 'relay' || state.turnPlayerId === user.id;

  return (
    <div className="page wide">
      {view.drift && <DriftFlash event={view.drift} />}

      <RoomHeader
        state={state}
        onLeave={() => {
          actions.leave();
          navigate('home');
        }}
        status={view.status}
      />

      <div className="game">
        <div className="rail-left">
          <div className="card">
            <h3>Players ({state.players.length})</h3>
            <PlayerList players={state.players} myId={user.id} turnPlayerId={state.turnPlayerId} />
          </div>

          {playing && (
            <div className="card">
              <DriftMeter
                charge={state.driftCharge}
                cap={state.driftCap}
                anchored={state.anchored}
                drifts={state.drifts.filter((d) => !d.headline.startsWith('ANCHORED')).length}
                maxDrifts={state.settings.maxDrifts}
              />
            </div>
          )}

          {state.phase === 'lobby' && (
            <LobbyPanel
              state={state}
              isHost={!!isHost}
              ready={me?.ready ?? false}
              onReady={actions.ready}
              onStart={actions.start}
              onSettings={actions.settings}
            />
          )}
        </div>

        <div>
          {state.phase === 'countdown' && view.countdownAt && (
            <div className="card" style={{ textAlign: 'center', marginBottom: 12 }}>
              <div className="faint" style={{ fontSize: 11, letterSpacing: '0.1em', fontWeight: 800 }}>
                ROUND {state.round} OF {state.settings.rounds}
              </div>
              <div className="mono" style={{ fontSize: 36, fontWeight: 700 }}>
                <Countdown endsAt={view.countdownAt} />
              </div>
            </div>
          )}

          {playing && (
            <>
              <GuessInput
                onGuess={actions.guess}
                disabled={!myTurn}
                cooldownUntil={view.cooldownUntil}
                baseCooldownMs={state.settings.baseCooldownMs}
                placeholder={
                  myTurn ? 'Type a word…' : `Waiting for ${nameOf(state, state.turnPlayerId)}…`
                }
              />
              {state.settings.mode === 'relay' && state.turnEndsAt && myTurn && (
                <div className="muted" style={{ fontSize: 12.5, marginTop: -4, marginBottom: 10 }}>
                  Your turn — <TurnClock endsAt={state.turnEndsAt} />
                </div>
              )}
            </>
          )}

          {state.phase === 'lobby' && (
            <div className="card" style={{ marginBottom: 12 }}>
              <h3>Waiting room</h3>
              <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
                Share code <b className="mono" style={{ letterSpacing: '0.2em' }}>{state.code}</b> with
                whoever you want in. Two ready players starts the match, or the host can start early.
              </p>
            </div>
          )}

          <Board
            board={view.board}
            mine={view.mine}
            myId={user.id}
            lexiconSize={lexiconSize}
            echoes={me?.echoes ?? 0}
            onEcho={actions.echo}
            rescored={view.rescored}
          />
        </div>

        <div>
          <div className="card">
            <h3>Room chat</h3>
            <Chat lines={view.chat} onSend={actions.chat} onEmote={actions.emote} />
          </div>

          {playing && (
            <div className="card">
              <h3>Echo tokens · {me?.echoes ?? 0}</h3>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Opponents’ guesses show only a heat band. Spend an Echo on one to publish its exact rank —
                to the whole room, with your name on it. You get one back after every drift.
              </p>
            </div>
          )}
        </div>
      </div>

      {showSummary && view.summary && (
        <Modal
          title={
            state.phase === 'matchEnd'
              ? 'Match over'
              : view.summary.winnerId === user.id
                ? 'You caught it'
                : `Round ${view.summary.round}`
          }
          subtitle={
            state.phase === 'matchEnd'
              ? undefined
              : state.phaseEndsAt
                ? 'Next round starting shortly…'
                : undefined
          }
          onClose={() => setShowSummary(false)}
          wide
        >
          <SummaryPanel summary={view.summary} />

          {view.standings && (
            <>
              <div className="divider-text">final standings</div>
              <table className="table">
                <thead>
                  <tr>
                    <th />
                    <th>Player</th>
                    <th className="num">Rounds</th>
                    <th className="num">Score</th>
                    <th className="num">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {view.standings.map((s) => {
                    const delta = s.ratingAfter - s.ratingBefore;
                    return (
                      <tr key={s.playerId} className={s.playerId === user.id ? 'me' : ''}>
                        <td className="place">{s.place}</td>
                        <td>{s.name}</td>
                        <td className="num">{s.roundsWon}</td>
                        <td className="num">{s.score}</td>
                        <td className="num" style={{ color: delta > 0 ? 'var(--ok)' : delta < 0 ? 'var(--danger)' : undefined }}>
                          {s.ratingAfter}
                          {delta !== 0 && <span style={{ fontSize: 11 }}> {delta > 0 ? '+' : ''}{delta}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {isHost && (
                <button
                  className="btn primary block"
                  style={{ marginTop: 14 }}
                  onClick={() => {
                    actions.rematch();
                    setShowSummary(false);
                  }}
                >
                  Back to the lobby
                </button>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

function nameOf(state: { players: { id: string; name: string }[] }, id?: string | null): string {
  return state.players.find((p) => p.id === id)?.name ?? 'someone';
}

function TurnClock({ endsAt }: { endsAt: number }) {
  const now = useTicker(true, 200);
  return <span className="mono">{formatClock(endsAt - now)} left</span>;
}

function RoomHeader({
  state,
  onLeave,
  status,
}: {
  state: import('@shared/protocol.ts').RoomState;
  onLeave: () => void;
  status: string;
}) {
  const now = useTicker(Boolean(state.phaseEndsAt), 250);
  const [copied, setCopied] = useState(false);

  return (
    <div className="status-strip">
      <div className="stat">
        <div className="k">Room</div>
        <button
          className="v mono"
          style={{ background: 'none', border: 'none', padding: 0, letterSpacing: '0.18em', textAlign: 'left' }}
          title="Copy room code"
          onClick={() => {
            navigator.clipboard
              .writeText(state.code)
              .then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1400);
              })
              .catch(() => toast('Could not access the clipboard.', 'error'));
          }}
        >
          {copied ? 'copied' : state.code}
        </button>
      </div>
      <div className="divider" />
      <div className="stat">
        <div className="k">Mode</div>
        <div className="v" style={{ fontFamily: 'var(--font)', fontSize: 13.5 }}>
          {MODE_LABEL[state.settings.mode]}
        </div>
      </div>
      <div className="divider" />
      <div className="stat">
        <div className="k">Round</div>
        <div className="v">
          {state.round || '—'}/{state.settings.rounds}
        </div>
      </div>
      {state.phaseEndsAt && state.phase === 'playing' && (
        <>
          <div className="divider" />
          <div className="stat">
            <div className="k">Time</div>
            <div className="v">{formatClock(state.phaseEndsAt - now)}</div>
          </div>
        </>
      )}
      <div className="divider" />
      <div className="stat">
        <div className="k">Lexicon</div>
        <div className="v" style={{ fontFamily: 'var(--font)', fontSize: 13.5 }}>
          {DIFFICULTY_LABEL[state.settings.difficulty]}
        </div>
      </div>

      <div className="grow" />

      <span className={`conn ${status === 'open' ? '' : status === 'connecting' ? 'connecting' : 'down'}`}>
        <span className="led" />
        {status === 'open' ? 'live' : status === 'connecting' ? 'reconnecting' : 'offline'}
      </span>
      <button className="btn sm ghost" onClick={onLeave}>
        Leave
      </button>
    </div>
  );
}

function LobbyPanel({
  state,
  isHost,
  ready,
  onReady,
  onStart,
  onSettings,
}: {
  state: import('@shared/protocol.ts').RoomState;
  isHost: boolean;
  ready: boolean;
  onReady: (v: boolean) => void;
  onStart: () => void;
  onSettings: (patch: Partial<RoomSettings>) => void;
}) {
  const enoughPlayers = state.players.filter((p) => p.connected).length >= 2;

  return (
    <div className="card">
      <h3>Setup</h3>

      {isHost ? (
        <div className="stack">
          <Setting label="Mode">
            <select
              className="input"
              value={state.settings.mode}
              onChange={(e) => onSettings({ mode: e.target.value as GameMode })}
            >
              <option value="commons">The Commons</option>
              <option value="blitz">Blitz Drift</option>
              <option value="relay">Relay</option>
            </select>
          </Setting>

          <Setting label="Lexicon depth">
            <select
              className="input"
              value={state.settings.difficulty}
              onChange={(e) => onSettings({ difficulty: Number(e.target.value) as 1 | 2 | 3 })}
            >
              <option value={1}>Common words only</option>
              <option value={2}>Standard</option>
              <option value={3}>Deep — includes obscure words</option>
            </select>
          </Setting>

          <Setting label={`Rounds — ${state.settings.rounds}`}>
            <input
              type="range"
              min={1}
              max={9}
              value={state.settings.rounds}
              onChange={(e) => onSettings({ rounds: Number(e.target.value) })}
              style={{ width: '100%' }}
            />
          </Setting>

          <Setting label="Drift sensitivity">
            <select
              className="input"
              value={state.settings.driftSensitivity}
              onChange={(e) => onSettings({ driftSensitivity: Number(e.target.value) as 1 | 2 | 3 })}
            >
              <option value={1}>Steady — the answer mostly holds still</option>
              <option value={2}>Normal</option>
              <option value={3}>Hair-trigger — it bolts at the first pressure</option>
            </select>
          </Setting>

          <Setting label={`Max drifts — ${state.settings.maxDrifts}`}>
            <input
              type="range"
              min={0}
              max={6}
              value={state.settings.maxDrifts}
              onChange={(e) => onSettings({ maxDrifts: Number(e.target.value) })}
              style={{ width: '100%' }}
            />
          </Setting>

          <label className="row" style={{ fontSize: 13.5, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={state.settings.sharedBoard}
              onChange={(e) => onSettings({ sharedBoard: e.target.checked })}
            />
            Shared board — everyone sees every word played
          </label>

          <label className="row" style={{ fontSize: 13.5, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={state.settings.private}
              onChange={(e) => onSettings({ private: e.target.checked })}
            />
            Private — hide from matchmaking
          </label>

          <button className="btn primary block" onClick={onStart}>
            {enoughPlayers ? 'Start match' : 'Start anyway (solo)'}
          </button>
        </div>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 0, fontSize: 13.5 }}>
            {MODE_LABEL[state.settings.mode]} · {state.settings.rounds} rounds ·{' '}
            {DIFFICULTY_LABEL[state.settings.difficulty]} lexicon
          </p>
          <button className={`btn block ${ready ? '' : 'primary'}`} onClick={() => onReady(!ready)}>
            {ready ? 'Not ready' : "I'm ready"}
          </button>
        </>
      )}
    </div>
  );
}

function Setting({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field" style={{ marginBottom: 0 }}>
      <label>{label}</label>
      {children}
    </div>
  );
}
