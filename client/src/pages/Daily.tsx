import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DailyState, PrivateGuess } from '@shared/protocol.ts';
import { api } from '../lib/api.ts';
import { errorMessage, toast, useSession } from '../lib/store.tsx';
import { GuessRow } from '../components/Board.tsx';
import { DriftFlash, DriftMeter, GuessInput } from '../components/GameBits.tsx';
import { Modal, Spinner } from '../components/ui.tsx';

type Mode = { kind: 'daily' } | { kind: 'practice'; key: string };

export function Daily({ practice }: { practice?: boolean }) {
  const { user } = useSession();
  const [mode, setMode] = useState<Mode>({ kind: 'daily' });
  const [state, setState] = useState<DailyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [flash, setFlash] = useState<DailyState['drifts'][number] | null>(null);
  const [rescored, setRescored] = useState(false);
  const [lexiconSize, setLexiconSize] = useState(75352);

  useEffect(() => {
    api.rules().then((r) => setLexiconSize(r.lexiconSize)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = practice ? await api.practiceNew() : await api.daily();
      setState(s);
      setMode(practice ? { kind: 'practice', key: s.date.replace('practice:', '') } : { kind: 'daily' });
      if (s.solved) setShowResult(true);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [practice]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const guess = useCallback(
    async (word: string) => {
      if (!state || busy) return;
      setBusy(true);
      const driftsBefore = state.drifts.length;
      try {
        const res =
          mode.kind === 'practice'
            ? await api.practiceGuess(mode.key, word)
            : await api.dailyGuess(word);

        setState(res.state);

        if (res.state.drifts.length > driftsBefore) {
          const event = res.state.drifts[res.state.drifts.length - 1];
          setFlash(event);
          setRescored(true);
          window.setTimeout(() => setFlash(null), 2200);
          window.setTimeout(() => setRescored(false), 900);
        }
        if (res.solved) window.setTimeout(() => setShowResult(true), 700);
      } catch (err) {
        toast(errorMessage(err), 'error');
      } finally {
        setBusy(false);
      }
    },
    [state, busy, mode],
  );

  const giveUp = useCallback(async () => {
    if (!state) return;
    try {
      const s = mode.kind === 'practice' ? await api.practiceGiveUp(mode.key) : await api.dailyGiveUp();
      setState(s);
      setShowResult(true);
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }, [state, mode]);

  const startPractice = useCallback(async () => {
    setLoading(true);
    try {
      const s = await api.practiceNew();
      setState(s);
      setMode({ kind: 'practice', key: s.date.replace('practice:', '') });
      setShowResult(false);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  const sorted = useMemo(() => {
    if (!state) return [];
    return [...state.guesses].sort((a, b) => a.rank - b.rank);
  }, [state]);

  const best = sorted[0]?.rank ?? null;
  const newest = state?.guesses.reduce((m, g) => Math.max(m, g.at), 0) ?? 0;

  if (!user) {
    return (
      <div className="page narrow center-screen">
        <div>
          <h1 style={{ fontSize: 22 }}>Sign in to play</h1>
          <p className="muted">The daily puzzle tracks your streak, so it needs an account — a guest account is fine.</p>
        </div>
      </div>
    );
  }

  if (loading || !state) {
    return (
      <div className="page center-screen">
        <Spinner />
      </div>
    );
  }

  const isPractice = mode.kind === 'practice';
  const done = state.solved || Boolean(state.target);

  return (
    <div className="page">
      {flash && <DriftFlash event={flash} />}

      <div className="page-head spread" style={{ flexWrap: 'wrap' }}>
        <div>
          <h1>{isPractice ? 'Practice run' : `Driftle #${state.number}`}</h1>
          <p>
            {isPractice
              ? 'A throwaway puzzle. Nothing here touches your streak.'
              : 'One puzzle a day, the same for everybody. Your streak is on the line.'}
          </p>
        </div>
        <div className="row">
          {!done && (
            <button className="btn sm" onClick={() => void giveUp()}>
              Give up
            </button>
          )}
          <button className="btn sm" onClick={() => void startPractice()}>
            New practice run
          </button>
        </div>
      </div>

      <div className="status-strip">
        <div className="stat">
          <div className="k">Guesses</div>
          <div className="v">{state.guesses.length}</div>
        </div>
        <div className="divider" />
        <div className="stat">
          <div className="k">Best rank</div>
          <div className="v">{best ?? '—'}</div>
        </div>
        <div className="divider" />
        <div className="stat">
          <div className="k">Word length</div>
          <div className="v">{state.targetLengthKnown ?? '?'}</div>
        </div>
        <div className="divider" />
        <div className="stat">
          <div className="k">Epoch</div>
          <div className="v">{state.epoch}</div>
        </div>
        <div className="grow" />
        <div style={{ minWidth: 190 }}>
          <DriftMeter
            charge={state.driftCharge}
            cap={state.driftCap}
            anchored={state.anchored}
            drifts={state.drifts.filter((d) => !d.headline.startsWith('ANCHORED')).length}
            maxDrifts={3}
          />
        </div>
      </div>

      <div className="game" style={{ gridTemplateColumns: 'minmax(0,1fr) 300px' }}>
        <div>
          {!done && (
            <GuessInput
              onGuess={(w) => void guess(w)}
              disabled={busy}
              placeholder={
                state.guesses.length === 0 ? 'Start broad — try “ocean” or “memory”…' : 'Type a word…'
              }
            />
          )}

          {done && (
            <div className="card" style={{ marginBottom: 12, textAlign: 'center' }}>
              <div className="faint" style={{ fontSize: 11, letterSpacing: '0.1em', fontWeight: 800 }}>
                {state.solved ? 'SOLVED' : 'THE ANSWER WAS'}
              </div>
              <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: 'var(--band-exact)' }}>
                {state.target}
              </div>
              {state.definition && <div className="reveal-definition">{state.definition}</div>}
              <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setShowResult(true)}>
                See the summary
              </button>
            </div>
          )}

          {sorted.length === 0 ? (
            <div className="board empty">
              <div>
                <div style={{ fontSize: 15, marginBottom: 4 }}>Nothing on the board yet.</div>
                <div className="faint">
                  You are searching a map of meaning, not spelling a word. Open somewhere broad.
                </div>
              </div>
            </div>
          ) : (
            <div className="board">
              {sorted.map((g: PrivateGuess) => (
                <GuessRow
                  key={g.id}
                  guess={g}
                  detail={g}
                  isMine
                  lexiconSize={lexiconSize}
                  fresh={g.at === newest}
                  rescored={rescored}
                />
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="card">
            <h3>Reading the board</h3>
            <ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 13.2, lineHeight: 1.65 }}>
              <li>
                <b>Rank</b> is how close your word is in meaning — 1 is the answer, {lexiconSize.toLocaleString()} is
                as far as the lexicon goes.
              </li>
              <li>
                Every guess shows <b>which sense</b> of your word was scored, so a cold answer is never a mystery.
              </li>
              <li>
                Get near and the engine names the <b>concept you share</b> with the answer — the single most
                useful hint here. Nearer still and you unlock its category, length, definition and letters.
              </li>
            </ul>
          </div>

          <div className="card">
            <h3>Drift</h3>
            <p className="muted" style={{ margin: 0, fontSize: 13.2, lineHeight: 1.65 }}>
              Every near miss charges the meter. When it fills, the answer moves to a neighbouring word and
              your whole board is re-scored — so a rank 4 can become a rank 90 without you playing a thing.
              Words already on the board can never be drift destinations, so guessing around the answer
              slowly fences it in. Corner it completely and it <b>anchors</b> for good.
            </p>
          </div>

          {state.drifts.length > 0 && (
            <div className="card">
              <h3>Drift log</h3>
              <div className="stack" style={{ gap: 7 }}>
                {state.drifts.map((d, i) => (
                  <div key={i} className="muted" style={{ fontSize: 12.5 }}>
                    <b className="mono">#{i + 1}</b> {d.headline}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showResult && state.target && (
        <ResultModal state={state} onClose={() => setShowResult(false)} isPractice={isPractice} onPractice={() => void startPractice()} />
      )}
    </div>
  );
}

function ResultModal({
  state,
  onClose,
  isPractice,
  onPractice,
}: {
  state: DailyState;
  onClose: () => void;
  isPractice: boolean;
  onPractice: () => void;
}) {
  const [share, setShare] = useState<string | null>(null);

  useEffect(() => {
    if (isPractice) return;
    api.dailyShare().then((r) => setShare(r.text)).catch(() => {});
  }, [isPractice]);

  const chain = state.chain ?? [];

  return (
    <Modal
      title={state.solved ? 'Caught it.' : 'It got away.'}
      subtitle={
        state.solved
          ? `Solved in ${state.guesses.length} guesses across ${state.epoch} drift${state.epoch === 1 ? '' : 's'}.`
          : 'The answer is revealed below. Your streak resets, but the practice runs are unlimited.'
      }
      onClose={onClose}
    >
      <div className="summary-target">
        <div className="label">The answer was</div>
        <div className="word">{state.target}</div>
        {state.definition && <div className="reveal-definition">{state.definition}</div>}
      </div>

      {state.neighbourhood && state.neighbourhood.length > 0 && (
        <>
          <div className="faint" style={{ textAlign: 'center', fontSize: 11, letterSpacing: '0.1em', fontWeight: 800 }}>
            WHAT LIVED NEXT TO IT
          </div>
          <div className="neighbourhood">
            {state.neighbourhood.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
        </>
      )}

      {chain.length > 1 && (
        <>
          <div className="faint" style={{ textAlign: 'center', fontSize: 11, letterSpacing: '0.1em', fontWeight: 800 }}>
            IT STARTED SOMEWHERE ELSE
          </div>
          <div className="chain">
            {chain.map((w, i) => (
              <span key={`${w}-${i}`}>
                {i > 0 && <span className="sep">→ </span>}
                <span className={`link${i === chain.length - 1 ? ' final' : ''}`}>{w}</span>
              </span>
            ))}
          </div>
        </>
      )}

      {share && (
        <>
          <div className="divider-text">share</div>
          <pre
            className="mono"
            style={{
              background: '#0d1017',
              border: '1px solid var(--line)',
              borderRadius: 8,
              padding: 12,
              fontSize: 13,
              margin: 0,
              whiteSpace: 'pre-wrap',
            }}
          >
            {share}
          </pre>
          <button
            className="btn block"
            style={{ marginTop: 10 }}
            onClick={() => {
              navigator.clipboard
                .writeText(share)
                .then(() => toast('Copied — no spoilers in it.', 'good'))
                .catch(() => toast('Could not access the clipboard.', 'error'));
            }}
          >
            Copy result
          </button>
        </>
      )}

      <button className="btn primary block" style={{ marginTop: 10 }} onClick={onPractice}>
        Play a practice run
      </button>
    </Modal>
  );
}
