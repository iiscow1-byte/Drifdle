import { useEffect, useState } from 'react';
import { api, type RulesResponse } from '../lib/api.ts';

/**
 * The rules page reads its thresholds from the server rather than hardcoding
 * them, so it cannot drift out of date when the lexicon or tuning changes.
 */
export function HowToPlay({ navigate }: { navigate: (n: string, p?: string) => void }) {
  const [rules, setRules] = useState<RulesResponse | null>(null);

  useEffect(() => {
    api.rules().then(setRules).catch(() => {});
  }, []);

  const size = rules?.lexiconSize ?? 75352;
  const unlocks = rules?.unlocks ?? {};
  const n = (v?: number) => (v ?? 0).toLocaleString();
  const commonest = rules?.lexicon?.tiers?.['1'];

  return (
    <div className="page narrow">
      <div className="page-head">
        <h1>How Driftle works</h1>
        <p>Two minutes of reading, then the rest is instinct.</p>
      </div>

      <div className="card">
        <h3>1 · Guess toward a meaning</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          There is a hidden word. Every word you play comes back with a <b>rank</b>: 1 means you found it,{' '}
          {n(size)} means you are as far away as the lexicon allows. Rank measures <em>meaning</em>, not
          spelling — <span className="mono">wolf</span> sits beside <span className="mono">coyote</span> and{' '}
          <span className="mono">jackal</span>, nowhere near words that merely look similar.
        </p>
        <p className="muted">
          Every guess also shows <b>which sense of your word</b> was scored. If you played{' '}
          <span className="mono">bank</span> and the engine read it as the riverbank, you will see that — so a
          cold result is never a mystery.
        </p>
      </div>

      <div className="card">
        <h3>2 · Proximity buys you understanding</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          The closer you get in meaning, the more the engine tells you. Each rung unlocks at a rank:
        </p>
        <ul className="muted" style={{ marginTop: 0, paddingLeft: 18, lineHeight: 1.75 }}>
          <li>
            <b>{n(unlocks.compass)}</b> — the <b>compass</b>, naming the axis you are most wrong about.
          </li>
          <li>
            <b>{n(unlocks.link)}</b> — the <b>concept you share</b> with the answer: “both are kinds of
            carnivore”.
          </li>
          <li>
            <b>{n(unlocks.domain)}</b> — the answer’s <b>category</b>, like animals or feelings.
          </li>
          <li>
            <b>{n(unlocks.length)}</b> — its <b>length</b>.
          </li>
          <li>
            <b>{n(unlocks.definition)}</b> — its <b>definition</b>, with its own words blanked out.
          </li>
          <li>
            <b>{n(unlocks.hits)}</b> — letters you have in the <b>right position</b>.
          </li>
          <li>
            <b>{n(unlocks.nears)}</b> — letters that are <b>in the word</b> at all.
          </li>
        </ul>
        <p className="muted">
          So a cold guess is pure semantics and a burning one is nearly a Wordle row. That ladder is what
          makes a lexicon this large solvable: you close in by meaning, then finish by spelling.
        </p>
      </div>

      <div className="card">
        <h3>3 · Get too close and it runs</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Every near miss charges the <b>drift meter</b>. When it fills, the answer moves to a neighbouring
          word — and every guess on the board is re-scored around the new one. Your rank 3 might become a rank
          900 without you touching the keyboard.
        </p>
        <p className="muted">
          Two consequences worth internalising. First, a big lead is never safe, so a comeback is always live.
          Second, the drift can only land on words <em>nobody has played</em> — so guessing around the answer
          fences it in, and if you fence it completely it <b>anchors</b> and can never move again.
        </p>
      </div>

      <div className="card">
        <h3>4 · Multiplayer is about information</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          In <b>The Commons</b> everyone plays onto one board. You see every word your opponents try, but only
          its heat band — never the number. So every guess you make is a gift to the room, and the real skill
          is deciding when to spend information and when to hoard it.
        </p>
        <p className="muted">
          <b>Echo tokens</b> buy an opponent’s exact rank. But an Echo is public: the room sees who spent it
          and on what, which tells everyone exactly which word you think matters.
        </p>
        <p className="muted">
          Being hot has one more perk: your <b>cooldown shrinks</b> as your rank improves, so a player closing
          in gets to guess faster than everyone else. That is usually when someone panics and triggers a drift.
        </p>
      </div>

      <div className="card">
        <h3>Where the words come from</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          {n(size)} words drawn from Princeton’s WordNet, with its hypernym tree and a human-written
          definition for every sense. That tree is why the game can explain itself: the concept two words
          share is a real English idea, not a similarity score.
          {commonest ? ` Answers come from the ${n(commonest)} most common words at the easiest setting.` : ''}
        </p>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn primary" onClick={() => navigate('daily')}>
          Play today’s puzzle
        </button>
        <button className="btn" onClick={() => navigate('home')}>
          Back
        </button>
      </div>
    </div>
  );
}
