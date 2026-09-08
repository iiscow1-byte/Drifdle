import { useEffect, useState } from 'react';
import type { LeaderboardRow } from '@shared/protocol.ts';
import { api, type ProfileResponse } from '../lib/api.ts';
import { errorMessage, toast, useSession } from '../lib/store.tsx';
import { Avatar, Spinner, StatTile } from '../components/ui.tsx';
import { MODE_LABEL, formatDuration, ordinal, relativeTime } from '../lib/format.ts';

/* ------------------------------------------------------------------ */
/* Leaderboard                                                         */
/* ------------------------------------------------------------------ */

type BoardKey = 'rating' | 'daily' | 'streak';

const BOARDS: { key: BoardKey; label: string; unit: string; blurb: string }[] = [
  { key: 'rating', label: 'Rating', unit: 'elo', blurb: 'Multiplayer Elo, updated after every match.' },
  { key: 'daily', label: "Today's daily", unit: 'guesses', blurb: 'Fewest guesses on today’s puzzle wins.' },
  { key: 'streak', label: 'Best streak', unit: 'days', blurb: 'Longest run of consecutive daily solves.' },
];

export function Leaderboard({ navigate }: { navigate: (n: string, p?: string) => void }) {
  const { user } = useSession();
  const [board, setBoard] = useState<BoardKey>('rating');
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);

  useEffect(() => {
    setRows(null);
    api
      .leaderboard(board)
      .then((r) => setRows(r.rows))
      .catch((err) => {
        toast(errorMessage(err), 'error');
        setRows([]);
      });
  }, [board]);

  const meta = BOARDS.find((b) => b.key === board)!;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Leaderboards</h1>
        <p>{meta.blurb}</p>
      </div>

      <div className="tabs" style={{ maxWidth: 420 }}>
        {BOARDS.map((b) => (
          <button key={b.key} className={board === b.key ? 'active' : ''} onClick={() => setBoard(b.key)}>
            {b.label}
          </button>
        ))}
      </div>

      <div className="card">
        {rows === null ? (
          <div style={{ padding: 24, display: 'grid', placeItems: 'center' }}>
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <div className="faint" style={{ padding: '12px 2px', fontSize: 13.5 }}>
            Nothing here yet — be the first on the board.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th />
                <th>Player</th>
                <th className="num">{meta.unit}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId} className={r.userId === user?.id ? 'me' : ''}>
                  <td className="place">{r.place}</td>
                  <td>
                    <button
                      className="row"
                      style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left' }}
                      onClick={() => navigate('profile', r.username)}
                    >
                      <Avatar src={r.avatar} name={r.displayName} size="sm" />
                      <span style={{ fontWeight: 600 }}>{r.displayName}</span>
                    </button>
                  </td>
                  <td className="num" style={{ fontWeight: 700 }}>{r.value}</td>
                  <td className="faint" style={{ fontSize: 12.5 }}>{r.detail ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

export function Profile({ username }: { username?: string }) {
  const { user, setDisplayName, logout } = useSession();
  const target = username ?? user?.username;
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');

  useEffect(() => {
    if (!target) return;
    setData(null);
    setError(null);
    api
      .profile(target)
      .then((d) => {
        setData(d);
        setName(d.user.displayName);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [target]);

  if (!target) {
    return (
      <div className="page center-screen">
        <p className="muted">Sign in to see your profile.</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="page center-screen">
        <p className="muted">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="page center-screen">
        <Spinner />
      </div>
    );
  }

  const isMe = data.user.id === user?.id;
  const s = data.stats;

  return (
    <div className="page">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
          <Avatar src={data.user.avatar} name={data.user.displayName} size="lg" />
          <div className="grow">
            <div className="row" style={{ gap: 8 }}>
              <h1 style={{ margin: 0, fontSize: 24, letterSpacing: '-0.02em' }}>{data.user.displayName}</h1>
              {data.user.guest && <span className="chip">guest</span>}
              {data.user.discordLinked && <span className="chip">discord</span>}
            </div>
            <div className="muted" style={{ fontSize: 13.5 }}>
              @{data.user.username} · joined {relativeTime(data.user.createdAt)}
              {data.globalRank && ` · ${ordinal(data.globalRank)} by rating`}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="faint" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em' }}>
              RATING
            </div>
            <div className="mono" style={{ fontSize: 30, fontWeight: 700 }}>{data.user.rating}</div>
          </div>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <StatTile label="Daily streak" value={s.currentStreak} />
        <StatTile label="Best streak" value={s.bestStreak} />
        <StatTile label="Dailies solved" value={`${s.dailySolved}/${s.dailyPlayed}`} />
        <StatTile label="Rounds won" value={s.roundsWon} />
        <StatTile label="Matches won" value={`${s.matchesWon}/${s.gamesPlayed}`} />
        <StatTile label="Best rank" value={s.bestRank ?? '—'} />
        <StatTile label="Avg guesses" value={s.averageGuesses ? s.averageGuesses.toFixed(1) : '—'} />
        <StatTile label="Fastest win" value={s.fastestWinMs ? formatDuration(s.fastestWinMs) : '—'} />
        <StatTile label="Drifts survived" value={s.driftsSurvived} />
        <StatTile label="Echoes spent" value={s.echoesSpent} />
      </div>

      <div className="game" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
        <div className="card">
          <h3>Recent matches</h3>
          {data.recentMatches.length === 0 ? (
            <div className="faint" style={{ fontSize: 13 }}>No multiplayer matches yet.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Mode</th>
                  <th className="num">Place</th>
                  <th className="num">Score</th>
                  <th className="num">When</th>
                </tr>
              </thead>
              <tbody>
                {data.recentMatches.map((m, i) => (
                  <tr key={i}>
                    <td>{MODE_LABEL[m.mode] ?? m.mode}</td>
                    <td className="num">{m.place ? ordinal(m.place) : '—'}</td>
                    <td className="num">{m.score}</td>
                    <td className="num faint" style={{ fontSize: 12.5 }}>{relativeTime(m.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div>
          <div className="card">
            <h3>Daily history</h3>
            {data.dailyHistory.length === 0 ? (
              <div className="faint" style={{ fontSize: 13 }}>No dailies played yet.</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {[...data.dailyHistory].reverse().map((d) => (
                  <div
                    key={d.date}
                    title={`${d.date} — ${d.solved ? `${d.guess_count} guesses, ${d.drifts} drifts` : 'unsolved'}`}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 5,
                      background: d.solved
                        ? `color-mix(in srgb, var(--ok) ${Math.max(18, 90 - d.guess_count * 3)}%, #0d1017)`
                        : '#171c29',
                      border: '1px solid var(--line)',
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {isMe && (
            <div className="card">
              <h3>Settings</h3>
              <div className="field">
                <label htmlFor="dn">Display name</label>
                <div className="row">
                  <input
                    id="dn"
                    className="input grow"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={24}
                  />
                  <button
                    className="btn"
                    disabled={name.trim() === data.user.displayName || name.trim().length < 2}
                    onClick={() => void setDisplayName(name.trim()).catch((e) => toast(errorMessage(e), 'error'))}
                  >
                    Save
                  </button>
                </div>
              </div>
              <button className="btn danger block" onClick={() => void logout()}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
