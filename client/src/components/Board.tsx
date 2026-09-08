import { useEffect, useRef } from 'react';
import type { Mark, PrivateGuess, PublicGuess } from '@shared/protocol.ts';
import { BAND_LABEL, bandClass, heatFraction } from '../lib/format.ts';

function Marks({ word, marks }: { word: string; marks: Mark[] }) {
  return (
    <div className="marks" aria-label="Letter feedback">
      {word.split('').map((ch, i) => {
        const mark = marks[i] ?? 'hidden';
        return (
          <span key={i} className={`mark ${mark}`}>
            {mark === 'hidden' ? '·' : ch}
          </span>
        );
      })}
    </div>
  );
}

export function GuessRow({
  guess,
  isMine,
  detail,
  lexiconSize,
  canEcho,
  onEcho,
  fresh,
  rescored,
}: {
  guess: PublicGuess;
  isMine: boolean;
  detail?: PrivateGuess;
  lexiconSize: number;
  canEcho?: boolean;
  onEcho?: () => void;
  fresh?: boolean;
  rescored?: boolean;
}) {
  const known = detail ?? (guess.rank !== undefined ? guess : null);
  const fill = known?.rank !== undefined ? heatFraction(known.rank, lexiconSize) * 100 : 0;

  return (
    <div
      className={[
        'guess',
        bandClass(guess.band),
        isMine ? 'mine' : '',
        fresh ? 'fresh' : '',
        rescored ? 'rescored' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--fill': `${fill}%` } as React.CSSProperties}
    >
      <div className="word">
        <span>{guess.word}</span>
        {!isMine && <span className="who">{guess.playerName}</span>}
      </div>

      <div className="rank">
        {known?.rank !== undefined ? (
          <>
            {known.rank}
            {guess.revealed && !isMine && <span className="faint"> ᴇ</span>}
          </>
        ) : canEcho && onEcho ? (
          <button
            className="echo-btn"
            onClick={onEcho}
            title="Spend an Echo token to reveal this exact rank"
          >
            Echo
          </button>
        ) : (
          <span className="hidden-rank">{BAND_LABEL[guess.band]}</span>
        )}
      </div>

      {detail && (detail.marks.some((m) => m !== 'hidden') || detail.compass) && (
        <div className="guess-detail">
          {detail.marks.some((m) => m !== 'hidden') && (
            <Marks word={detail.word} marks={detail.marks} />
          )}
          {detail.compass && (
            <span className="compass">
              <span className="arrow">{detail.compass.direction > 0 ? '↑' : '↓'}</span>
              {detail.compass.text}
            </span>
          )}
          {detail.targetLength && (
            <span className="chip">{detail.targetLength} letters</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The shared board. Sorted by heat, not by time: the point of the Commons is
 * that you can read the room's collective progress at a glance.
 */
export function Board({
  board,
  mine,
  myId,
  lexiconSize,
  echoes,
  onEcho,
  rescored,
  sortBy = 'heat',
}: {
  board: PublicGuess[];
  mine: Record<string, PrivateGuess>;
  myId: string | null;
  lexiconSize: number;
  echoes?: number;
  onEcho?: (id: string) => void;
  rescored?: Set<string>;
  sortBy?: 'heat' | 'time';
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const lastCount = useRef(board.length);

  useEffect(() => {
    if (sortBy === 'time' && board.length > lastCount.current) {
      scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
    }
    lastCount.current = board.length;
  }, [board.length, sortBy]);

  if (!board.length) {
    return (
      <div className="board empty">
        <div>
          <div style={{ fontSize: 15, marginBottom: 4 }}>Nothing on the board yet.</div>
          <div className="faint">Open with something broad — you are mapping a space, not spelling a word.</div>
        </div>
      </div>
    );
  }

  const ordered = [...board].sort((a, b) => {
    if (sortBy === 'time') return a.at - b.at;
    const ra = mine[a.id]?.rank ?? a.rank;
    const rb = mine[b.id]?.rank ?? b.rank;
    // Guesses with a known rank sort by it; unknown ones fall back to band.
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return b.at - a.at;
  });

  const newest = board.reduce((max, g) => Math.max(max, g.at), 0);

  return (
    <div className="board" ref={scroller}>
      {ordered.map((g) => (
        <GuessRow
          key={g.id}
          guess={g}
          isMine={g.playerId === myId}
          detail={mine[g.id]}
          lexiconSize={lexiconSize}
          canEcho={Boolean(echoes && echoes > 0 && g.playerId !== myId && !g.revealed)}
          onEcho={onEcho ? () => onEcho(g.id) : undefined}
          fresh={g.at === newest}
          rescored={rescored?.has(g.id)}
        />
      ))}
    </div>
  );
}
