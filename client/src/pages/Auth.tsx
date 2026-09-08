import { useState, type FormEvent } from 'react';
import { BASE } from '../lib/api.ts';
import { errorMessage, useSession } from '../lib/store.tsx';
import { openExternal } from '../lib/discord.ts';
import { Modal, Spinner } from '../components/ui.tsx';

type Tab = 'signup' | 'login';

export function AuthModal({ onClose, initial = 'signup' }: { onClose: () => void; initial?: Tab }) {
  const { signup, login, playAsGuest, config, discord, user } = useSession();
  const [tab, setTab] = useState<Tab>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginId, setLoginId] = useState('');
  const [loginPw, setLoginPw] = useState('');

  const upgrading = user?.guest === true;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function onSignup(e: FormEvent) {
    e.preventDefault();
    void run(() => signup({ username: username.trim(), email: email.trim(), password }));
  }

  function onLogin(e: FormEvent) {
    e.preventDefault();
    void run(() => login({ login: loginId.trim(), password: loginPw }));
  }

  return (
    <Modal
      title={upgrading ? 'Keep your progress' : tab === 'signup' ? 'Create an account' : 'Welcome back'}
      subtitle={
        upgrading
          ? 'You are playing as a guest. Claim the account and every stat, streak and rating you have already earned comes with you.'
          : tab === 'signup'
            ? 'Ratings, streaks and daily history, saved across devices.'
            : 'Sign in to pick up where you left off.'
      }
      onClose={onClose}
    >
      {!upgrading && (
        <div className="tabs">
          <button className={tab === 'signup' ? 'active' : ''} onClick={() => setTab('signup')}>
            Sign up
          </button>
          <button className={tab === 'login' ? 'active' : ''} onClick={() => setTab('login')}>
            Log in
          </button>
        </div>
      )}

      {tab === 'signup' || upgrading ? (
        <form onSubmit={onSignup}>
          <div className="field">
            <label htmlFor="su-user">Username</label>
            <input
              id="su-user"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="driftwalker"
              autoComplete="username"
              required
            />
            <span className="hint">3–20 characters: letters, numbers and underscores.</span>
          </div>
          <div className="field">
            <label htmlFor="su-email">Email</label>
            <input
              id="su-email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="su-pw">Password</label>
            <input
              id="su-pw"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
            <span className="hint">At least 8 characters.</span>
          </div>
          {error && <div className="field error">{error}</div>}
          <button className="btn primary block lg" type="submit" disabled={busy}>
            {busy ? <Spinner /> : upgrading ? 'Claim my account' : 'Create account'}
          </button>
        </form>
      ) : (
        <form onSubmit={onLogin}>
          <div className="field">
            <label htmlFor="li-id">Username or email</label>
            <input
              id="li-id"
              className="input"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="li-pw">Password</label>
            <input
              id="li-pw"
              className="input"
              type="password"
              value={loginPw}
              onChange={(e) => setLoginPw(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error && <div className="field error">{error}</div>}
          <button className="btn primary block lg" type="submit" disabled={busy}>
            {busy ? <Spinner /> : 'Log in'}
          </button>
        </form>
      )}

      {(config?.discordEnabled || !user) && <div className="divider-text">or</div>}

      <div className="stack">
        {config?.discordEnabled && !discord.embedded && (
          <button
            className="btn discord block"
            onClick={() => void openExternal(`${location.origin}${BASE}/api/auth/discord`)}
            type="button"
          >
            <DiscordGlyph /> Continue with Discord
          </button>
        )}
        {!user && (
          <button className="btn block" onClick={() => void run(() => playAsGuest())} disabled={busy} type="button">
            Play as a guest
          </button>
        )}
      </div>
    </Modal>
  );
}

export function DiscordGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.249a18.27 18.27 0 0 0-5.487 0 12.65 12.65 0 0 0-.617-1.25.077.077 0 0 0-.079-.036A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .079.009c.12.099.245.198.372.292a.077.077 0 0 1-.006.127c-.598.35-1.22.645-1.873.891a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.056c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028ZM8.02 15.331c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
    </svg>
  );
}
