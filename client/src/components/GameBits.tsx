import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ChatLine, DriftEvent, Player, RoundSummary } from '@shared/protocol.ts';
import { Avatar, BandDot } from './ui.tsx';
import { formatClock, formatDuration } from '../lib/format.ts';

/* ------------------------------------------------------------------ */
/* Drift meter                                                         */
/* ------------------------------------------------------------------ */

export function DriftMeter({
  charge,
  cap,
  anchored,
  drifts,
  maxDrifts,
}: {
  charge: number;
  cap: number;
  anchored: boolean;
  drifts: number;
  maxDrifts: number;
}) {
  const pct = cap > 0 ? Math.min(100, (charge / cap) * 100) : 0;
  const critical = pct > 72 && !anchored;

  return (
    <div className={`drift${critical ? ' critical' : ''}${anchored ? ' anchored' : ''}`}>
      <div className="drift-head">
        <span className="title">{anchored ? 'Anchored' : 'Drift charge'}</span>
        <span className="value">
          {anchored ? 'locked' : `${Math.round(charge)}/${cap}`}
        </span>
      </div>
      <div className="drift-track">
        <div className="drift-fill" style={{ width: anchored ? '100%' : `${pct}%` }} />
      </div>
      <div className="drift-note">
        {anchored
          ? 'The answer can no longer move. Close it out.'
          : critical
            ? 'One more near miss and it runs.'
            : `${drifts}/${maxDrifts} drifts used — near guesses charge the meter.`}
      </div>
    </div>
  );
}

export function DriftFlash({ event }: { event: DriftEvent }) {
  const anchored = event.headline.startsWith('ANCHORED');
  return (
    <div className="drift-flash">
      <div className="inner">
        <h2>{anchored ? 'Anchored' : 'Drift'}</h2>
        <p>{event.headline}</p>
        {!anchored && (
          <p className="faint" style={{ marginTop: 6, fontSize: 12.5 }}>
            Every guess on the board has been re-scored.
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Guess input                                                         */
/* ------------------------------------------------------------------ */

export function GuessInput({
  onGuess,
  disabled,
  cooldownUntil,
  baseCooldownMs,
  placeholder = 'Type a word…',
}: {
  onGuess: (word: string) => void;
  disabled?: boolean;
  cooldownUntil?: number;
  baseCooldownMs?: number;
  placeholder?: string;
}) {
  const [value, setValue] = useState('');
  const [remaining, setRemaining] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!cooldownUntil) {
      setRemaining(0);
      return;
    }
    const tick = () => setRemaining(Math.max(0, cooldownUntil - Date.now()));
    tick();
    const id = window.setInterval(tick, 60);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  const cooling = remaining > 0;
  const blocked = disabled || cooling;

  function submit(e: FormEvent) {
    e.preventDefault();
    const word = value.trim().toLowerCase();
    if (!word || blocked) return;
    onGuess(word);
    setValue('');
    input.current?.focus();
  }

  const scale = cooling && baseCooldownMs ? Math.min(1, remaining / baseCooldownMs) : 0;

  return (
    <>
      <form className="guess-form" onSubmit={submit}>
        <input
          ref={input}
          className="input grow"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^a-zA-Z]/g, ''))}
          placeholder={cooling ? `Cooling down… ${(remaining / 1000).toFixed(1)}s` : placeholder}
          disabled={disabled}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={14}
          aria-label="Your guess"
        />
        <button className="btn primary" type="submit" disabled={blocked || !value.trim()}>
          Guess
        </button>
      </form>
      {cooling && (
        <div className="cooldown-bar" style={{ transform: `scaleX(${scale})` }} aria-hidden="true" />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Players                                                             */
/* ------------------------------------------------------------------ */

export function PlayerList({
  players,
  myId,
  turnPlayerId,
  showScore = true,
}: {
  players: Player[];
  myId: string | null;
  turnPlayerId?: string | null;
  showScore?: boolean;
}) {
  return (
    <div className="players">
      {players.map((p) => (
        <div
          key={p.id}
          className={[
            'player',
            p.id === myId ? 'you' : '',
            p.connected ? '' : 'offline',
            turnPlayerId === p.id ? 'turn' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <Avatar src={p.avatar} name={p.name} size="sm" />
          <div style={{ minWidth: 0 }}>
            <div className="name">
              <span>{p.name}</span>
              {p.host && <span className="crown" title="Host">♛</span>}
              {p.ready && <span style={{ color: 'var(--ok)', fontSize: 11 }}>ready</span>}
            </div>
            <div className="meta">
              {p.bestBand ? (
                <>
                  <BandDot band={p.bestBand} />
                  {p.id === myId && p.bestRank !== null ? `rank ${p.bestRank}` : p.bestBand}
                </>
              ) : (
                <span className="faint">no guesses</span>
              )}
              <span className="faint">· {p.guesses}</span>
              {p.echoes > 0 && (
                <span className="echoes" title={`${p.echoes} Echo tokens`}>
                  {Array.from({ length: Math.min(p.echoes, 5) }).map((_, i) => (
                    <span key={i} className="echo-pip" />
                  ))}
                </span>
              )}
            </div>
          </div>
          {showScore && <div className="score">{p.score}</div>}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chat                                                                */
/* ------------------------------------------------------------------ */

const EMOTES = [
  { key: 'hot', label: '🔥 burning' },
  { key: 'cold', label: '🧊 freezing' },
  { key: 'nice', label: '👏 nice' },
  { key: 'oof', label: '💀 oof' },
  { key: 'drift', label: '🌀 drift it' },
  { key: 'gg', label: '🤝 gg' },
];

const EMOTE_TEXT: Record<string, string> = {
  hot: 'is burning up 🔥',
  cold: 'says ice cold 🧊',
  nice: 'says nice one 👏',
  oof: 'says oof 💀',
  drift: 'wants a drift 🌀',
  gg: 'says gg 🤝',
};

export function Chat({
  lines,
  onSend,
  onEmote,
}: {
  lines: ChatLine[];
  onSend: (text: string) => void;
  onEmote: (key: string) => void;
}) {
  const [value, setValue] = useState('');
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [lines.length]);

  return (
    <div className="chat">
      <div className="chat-log" ref={log}>
        {lines.length === 0 && <div className="faint" style={{ fontSize: 12.5 }}>Quiet in here.</div>}
        {lines.map((l) => (
          <div key={l.id} className={`chat-line ${l.kind}`}>
            {l.kind === 'system' ? (
              l.text
            ) : l.kind === 'emote' ? (
              <>
                <span className="who">{l.name}</span> {EMOTE_TEXT[l.text] ?? l.text}
              </>
            ) : (
              <>
                <span className="who">{l.name}</span> {l.text}
              </>
            )}
          </div>
        ))}
      </div>

      <div className="emote-bar">
        {EMOTES.map((e) => (
          <button key={e.key} onClick={() => onEmote(e.key)} type="button">
            {e.label}
          </button>
        ))}
      </div>

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          const text = value.trim();
          if (!text) return;
          onSend(text);
          setValue('');
        }}
      >
        <input
          className="input grow"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Say something…"
          maxLength={240}
          aria-label="Chat message"
        />
        <button className="btn sm" type="submit" disabled={!value.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Round summary                                                       */
/* ------------------------------------------------------------------ */

export function SummaryPanel({ summary }: { summary: RoundSummary }) {
  const chain = summary.chain ?? [];
  return (
    <>
      <div className="summary-target">
        <div className="label">The answer was</div>
        <div className="word">{summary.target}</div>
        {summary.definition && <div className="reveal-definition">{summary.definition}</div>}
      </div>

      {summary.neighbourhood && summary.neighbourhood.length > 0 && (
        <>
          <div className="faint" style={{ textAlign: 'center', fontSize: 11, letterSpacing: '0.1em', fontWeight: 800 }}>
            WHAT LIVED NEXT TO IT
          </div>
          <div className="neighbourhood">
            {summary.neighbourhood.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
        </>
      )}

      {chain.length > 1 && (
        <>
          <div className="label faint" style={{ textAlign: 'center', fontSize: 11, letterSpacing: '0.1em' }}>
            IT STARTED SOMEWHERE ELSE
          </div>
          <div className="chain">
            {chain.map((w, i) => {
              const detail = summary.chainDetail?.[i];
              return (
                <span key={`${w}-${i}`}>
                  {i > 0 && <span className="sep">→ </span>}
                  <span
                    className={`link${i === chain.length - 1 ? ' final' : ''}`}
                    title={detail?.definition}
                  >
                    {w}
                    {detail?.definition && <span className="def">{detail.definition}</span>}
                  </span>
                </span>
              );
            })}
          </div>
        </>
      )}

      <div className="row" style={{ justifyContent: 'center', marginTop: 16, gap: 18 }}>
        <div className="stat">
          <div className="k faint" style={{ fontSize: 10, letterSpacing: '0.08em' }}>WINNER</div>
          <div style={{ fontWeight: 700 }}>{summary.winnerName ?? 'Nobody'}</div>
        </div>
        <div className="stat">
          <div className="k faint" style={{ fontSize: 10, letterSpacing: '0.08em' }}>DRIFTS</div>
          <div style={{ fontWeight: 700 }} className="mono">{summary.drifts}</div>
        </div>
        <div className="stat">
          <div className="k faint" style={{ fontSize: 10, letterSpacing: '0.08em' }}>TIME</div>
          <div style={{ fontWeight: 700 }} className="mono">{formatDuration(summary.durationMs)}</div>
        </div>
      </div>

      {summary.awards.length > 0 && (
        <div className="awards" style={{ marginTop: 18 }}>
          {summary.awards.map((a, i) => (
            <div className="award" key={`${a.label}-${i}`}>
              <div>
                <div className="label">{a.label}</div>
                <div className="detail">
                  {a.playerName} — {a.detail}
                </div>
              </div>
              <div className="pts">+{a.points}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function Countdown({ endsAt, label }: { endsAt: number; label?: string }) {
  const [remaining, setRemaining] = useState(endsAt - Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setRemaining(endsAt - Date.now()), 100);
    return () => window.clearInterval(id);
  }, [endsAt]);
  return (
    <span className="mono">
      {label} {formatClock(remaining)}
    </span>
  );
}
