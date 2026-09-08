import { useEffect, useState } from 'react';
import { useRoute, useSession } from './lib/store.tsx';
import { Toasts, DriftMark, Avatar, Spinner } from './components/ui.tsx';
import { AuthModal } from './pages/Auth.tsx';
import { Home } from './pages/Home.tsx';
import { Daily } from './pages/Daily.tsx';
import { Play } from './pages/Play.tsx';
import { HowToPlay, Leaderboard, Profile } from './pages/Misc.tsx';

const NAV = [
  { key: 'daily', label: 'Daily' },
  { key: 'play', label: 'Multiplayer', param: 'quick:commons' },
  { key: 'leaderboard', label: 'Leaders' },
  { key: 'how', label: 'How to play' },
];

export function App() {
  const { user, loading, discord } = useSession();
  const [route, navigate] = useRoute();
  const [auth, setAuth] = useState<null | 'signup' | 'login'>(null);

  // Report the outcome of the browser Discord OAuth round-trip.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const flag = params.get('discord');
    if (!flag) return;
    history.replaceState(null, '', location.pathname + location.hash);
  }, []);

  if (loading) {
    return (
      <div className="app">
        <div className="center-screen">
          <div className="stack" style={{ alignItems: 'center' }}>
            <DriftMark />
            <Spinner />
            <div className="faint" style={{ fontSize: 13 }}>
              {discord.embedded ? 'Connecting to Discord…' : 'Loading Driftle…'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // A hard failure inside the Activity is worth explaining rather than hiding.
  if (discord.embedded && discord.error && !user) {
    return (
      <div className="app">
        <div className="center-screen page narrow">
          <div className="card">
            <h3>Discord could not sign you in</h3>
            <p className="muted" style={{ marginTop: 0 }}>{discord.error}</p>
            <p className="faint" style={{ fontSize: 12.5 }}>
              Driftle still works in a browser — open it outside Discord and play there.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const page = (() => {
    switch (route.name) {
      case 'daily':
        return <Daily />;
      case 'practice':
        return <Daily practice />;
      case 'play':
        return <Play param={route.param} navigate={navigate} />;
      case 'leaderboard':
        return <Leaderboard navigate={navigate} />;
      case 'profile':
        return <Profile username={route.param} />;
      case 'how':
        return <HowToPlay navigate={navigate} />;
      default:
        return <Home navigate={navigate} onRequireAuth={() => setAuth('signup')} />;
    }
  })();

  return (
    <div className={`app${discord.embedded ? ' embedded' : ''}`}>
      <header className="topbar">
        <button
          className="brand"
          style={{ background: 'none', border: 'none', padding: 0 }}
          onClick={() => navigate('home')}
        >
          <DriftMark />
          Driftle
          <span className="tag">the answer moves</span>
        </button>

        <nav className="nav">
          {NAV.map((n) => (
            <button
              key={n.key}
              className={route.name === n.key ? 'active' : ''}
              onClick={() => {
                if (!user && n.key !== 'how' && n.key !== 'leaderboard') {
                  setAuth('signup');
                  return;
                }
                navigate(n.key, n.param);
              }}
            >
              {n.label}
            </button>
          ))}
        </nav>

        <div className="grow" />

        {user ? (
          <div className="row" style={{ gap: 8 }}>
            {user.guest && (
              <button className="btn sm primary" onClick={() => setAuth('signup')}>
                Save progress
              </button>
            )}
            <button
              className="row"
              style={{ background: 'none', border: 'none', padding: 0, gap: 8 }}
              onClick={() => navigate('profile', user.username)}
              title="Your profile"
            >
              <Avatar src={user.avatar} name={user.displayName} />
              <span style={{ fontWeight: 600, fontSize: 13.5 }} className="hide-sm">
                {user.displayName}
              </span>
            </button>
          </div>
        ) : (
          <div className="row" style={{ gap: 6 }}>
            <button className="btn sm ghost" onClick={() => setAuth('login')}>
              Log in
            </button>
            <button className="btn sm primary" onClick={() => setAuth('signup')}>
              Sign up
            </button>
          </div>
        )}
      </header>

      {page}

      {auth && <AuthModal initial={auth} onClose={() => setAuth(null)} />}
      <Toasts />
    </div>
  );
}
