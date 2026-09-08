import { useEffect, useState } from 'react';
import { api, type RoomListing } from '../lib/api.ts';
import { useSession } from '../lib/store.tsx';
import { DIFFICULTY_LABEL, MODE_LABEL } from '../lib/format.ts';
import { DriftMark } from '../components/ui.tsx';

export function Home({
  navigate,
  onRequireAuth,
}: {
  navigate: (name: string, param?: string) => void;
  onRequireAuth: () => void;
}) {
  const { user, stats, discord } = useSession();
  const [rooms, setRooms] = useState<RoomListing[]>([]);
  const [code, setCode] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .rooms()
        .then((r) => alive && setRooms(r.rooms))
        .catch(() => {});
    void load();
    const id = window.setInterval(load, 8000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  function go(target: string, param?: string) {
    if (!user) {
      onRequireAuth();
      return;
    }
    navigate(target, param);
  }

  // Inside a Discord Activity the channel *is* the lobby, so lead with that.
  if (discord.embedded && discord.ready) {
    return (
      <div className="page">
        <div className="hero" style={{ paddingTop: 18 }}>
          <DriftMark />
          <h1 style={{ fontSize: 'clamp(28px,6vw,42px)' }}>Driftle</h1>
          <p>
            Everyone in this channel shares one board. Guess your way toward a hidden word — and watch
            it run when someone gets too close.
          </p>
          <div className="cta">
            <button className="btn primary lg" onClick={() => navigate('play', 'activity')}>
              Play with this channel
            </button>
            <button className="btn lg" onClick={() => navigate('daily')}>
              Today’s puzzle
            </button>
          </div>
        </div>
        <QuickModes onPick={(m) => navigate('play', `new:${m}`)} />
      </div>
    );
  }

  return (
    <div className="page">
      <section className="hero">
        <h1>The answer moves.</h1>
        <p>
          Driftle is a word game about closing in on a hidden word — and about what happens when you
          close in too fast. Get near enough and the answer <em>drifts</em>: it slips to a neighbouring
          word, and every guess on the board is re-scored around it.
        </p>
        <div className="cta">
          <button className="btn primary lg" onClick={() => go('daily')}>
            Play today’s Driftle
          </button>
          <button className="btn lg" onClick={() => go('play', 'quick:commons')}>
            Find a multiplayer game
          </button>
          <button className="btn ghost lg" onClick={() => navigate('how')}>
            How it works
          </button>
        </div>
      </section>

      {user && stats && (
        <section className="card" style={{ marginBottom: 18 }}>
          <div className="spread" style={{ flexWrap: 'wrap' }}>
            <div>
              <div className="faint" style={{ fontSize: 12 }}>Signed in as</div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>
                {user.displayName}
                {user.guest && <span className="chip" style={{ marginLeft: 8 }}>guest</span>}
              </div>
            </div>
            <div className="row" style={{ gap: 20 }}>
              <Metric label="Rating" value={user.rating} />
              <Metric label="Streak" value={stats.currentStreak} />
              <Metric label="Rounds won" value={stats.roundsWon} />
            </div>
            <button className="btn sm" onClick={() => navigate('profile', user.username)}>
              View profile
            </button>
          </div>
        </section>
      )}

      <section style={{ marginBottom: 20 }}>
        <h2 className="page-head" style={{ fontSize: 18, marginBottom: 12 }}>Multiplayer modes</h2>
        <QuickModes onPick={(m) => go('play', `quick:${m}`)} />
      </section>

      <section className="game" style={{ gridTemplateColumns: 'minmax(0,1fr) 320px' }}>
        <div className="card">
          <h3>Open rooms</h3>
          {rooms.length === 0 ? (
            <div className="faint" style={{ fontSize: 13.5, padding: '10px 2px' }}>
              No public rooms right now. Start one — matchmaking will drop the next player in with you.
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Mode</th>
                  <th>Lexicon</th>
                  <th className="num">Players</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rooms.map((r) => (
                  <tr key={r.code}>
                    <td className="mono" style={{ fontWeight: 700 }}>{r.code}</td>
                    <td>{MODE_LABEL[r.mode] ?? r.mode}</td>
                    <td className="muted">{DIFFICULTY_LABEL[r.difficulty]}</td>
                    <td className="num">
                      {r.players}/{r.max}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn sm" onClick={() => go('play', `code:${r.code}`)}>
                        Join
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div>
          <div className="card">
            <h3>Join with a code</h3>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                if (code.trim()) go('play', `code:${code.trim().toUpperCase()}`);
              }}
            >
              <input
                className="input grow mono"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                placeholder="ABCD"
                maxLength={4}
                style={{ letterSpacing: '0.24em', fontWeight: 700 }}
                aria-label="Room code"
              />
              <button className="btn primary" type="submit" disabled={code.length < 4}>
                Join
              </button>
            </form>
          </div>

          <div className="card">
            <h3>Private room</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
              Make a room only your friends can reach, then share the four-letter code.
            </p>
            <button className="btn block" onClick={() => go('play', 'private:commons')}>
              Create private room
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="faint" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div className="mono" style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

const MODES = [
  {
    key: 'commons',
    title: 'The Commons',
    icon: '🗺️',
    desc: 'One shared board. Everyone sees every word played — but only a heat band, never the exact rank. Information is a commons, and spending an Echo to read someone’s rank tells the room what you care about.',
    foot: '2–8 players · 3 rounds · 5 min each',
  },
  {
    key: 'blitz',
    title: 'Blitz Drift',
    icon: '⚡',
    desc: 'Short fuse, short cooldowns, two drifts. The meter fills fast and the answer is rarely where you left it. Five quick rounds decide the match.',
    foot: '2–8 players · 5 rounds · 2 min each',
  },
  {
    key: 'relay',
    title: 'Relay',
    icon: '🔗',
    desc: 'Strict turn order, one guess each, 25 seconds on the clock. No cooldowns and nowhere to hide — a bad guess is a wasted turn for your whole side of the table.',
    foot: '2–8 players · 3 rounds · turn-based',
  },
];

function QuickModes({ onPick }: { onPick: (mode: string) => void }) {
  return (
    <div className="mode-grid">
      {MODES.map((m) => (
        <button className="mode" key={m.key} onClick={() => onPick(m.key)}>
          <div className="title">
            <span aria-hidden="true">{m.icon}</span>
            {m.title}
          </div>
          <div className="desc">{m.desc}</div>
          <div className="foot">{m.foot}</div>
        </button>
      ))}
    </div>
  );
}
