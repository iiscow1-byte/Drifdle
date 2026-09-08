import { useEffect, type ReactNode } from 'react';
import type { Band } from '@shared/protocol.ts';
import { BAND_LABEL, bandClass, initials } from '../lib/format.ts';
import { useToasts } from '../lib/store.tsx';

export function Avatar({
  src,
  name,
  size = 'md',
}: {
  src?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const cls = `avatar${size === 'lg' ? ' lg' : size === 'sm' ? ' sm' : ''}`;
  if (src) return <img className={cls} src={src} alt="" loading="lazy" />;
  return (
    <div className={`${cls} fallback`} aria-hidden="true">
      {initials(name)}
    </div>
  );
}

export function BandDot({ band }: { band: Band | null | undefined }) {
  return <span className={`band-dot ${bandClass(band)}`} title={BAND_LABEL[band ?? 'frozen']} />;
}

export function BandLabel({ band }: { band: Band | null | undefined }) {
  return <span className={`band-label ${bandClass(band)}`}>{BAND_LABEL[band ?? 'frozen']}</span>;
}

export function Spinner() {
  return <span className="spinner" role="status" aria-label="Loading" />;
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide,
}: {
  title: string;
  subtitle?: string;
  onClose?: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {subtitle && <p className="sub">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useToasts();
  if (!toasts.length) return null;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function StatTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stat-tile">
      <div className="k">{label}</div>
      <div className="v">{value}</div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="board empty">{children}</div>;
}

export function DriftMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 64 64" width="24" height="24" aria-hidden="true">
      <defs>
        <linearGradient id="dm" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f97316" />
          <stop offset="0.55" stopColor="#ef4444" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <circle cx="26" cy="32" r="19" fill="none" stroke="#1e2637" strokeWidth="3" />
      <circle cx="28" cy="32" r="12.5" fill="none" stroke="#334155" strokeWidth="3" />
      <circle cx="30" cy="32" r="6.5" fill="none" stroke="url(#dm)" strokeWidth="3.5" />
      <path d="M44 32h11" stroke="url(#dm)" strokeWidth="4" strokeLinecap="round" />
      <path
        d="M49 26.5 55.5 32 49 37.5"
        fill="none"
        stroke="url(#dm)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
