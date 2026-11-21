import type { ReactNode } from 'react';
import { Link } from 'react-router';

export function Spinner({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-ink-soft" role="status">
      <span className="size-5 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: { message: string } | null; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <div className="rounded-xl bg-danger-soft px-4 py-3 text-danger" role="alert">
      <p>{error.message}</p>
      {onRetry && (
        <button type="button" className="link mt-1" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </div>
  );
}

export function EmptyState({ emoji, title, children, action }: { emoji: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 text-5xl" aria-hidden="true">
        {emoji}
      </div>
      <h2 className="text-2xl font-semibold">{title}</h2>
      {children && <div className="mt-2 max-w-md text-ink-soft">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <header className="mb-6">
      {back && (
        <Link to={back.to} className="mb-2 inline-flex min-h-11 items-center gap-1 text-ink-soft hover:text-ink">
          <span aria-hidden="true">←</span> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold break-words md:text-4xl">{title}</h1>
          {subtitle && <div className="mt-1 text-ink-soft">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function ProgressBar({ value, max, label, color }: { value: number; max: number; label: string; color?: string }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div
      className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <div className="h-full rounded-full bg-sage transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function ProgressRing({ value, max, size = 88, children, label }: { value: number; max: number; size?: number; children?: ReactNode; label: string }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const pct = max ? Math.min(1, value / max) : 0;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--surface-2)" strokeWidth={8} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={pct >= 1 ? 'var(--sage)' : 'var(--accent)'}
          strokeWidth={8}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: 'stroke-dashoffset .6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-sm text-ink-soft">{hint}</p>}
      {error && (
        <p className="mt-1 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; id: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div>
        <label htmlFor={id} className="font-semibold">
          {label}
        </label>
        {description && <p className="text-sm text-ink-soft">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-1 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${checked ? 'bg-accent' : 'bg-line'}`}
      >
        <span className={`inline-block size-5 rounded-full bg-surface shadow transition ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
        <span className="sr-only">{checked ? 'activé' : 'désactivé'}</span>
      </button>
    </div>
  );
}

export function ColorDot({ color, size = 12 }: { color: string; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ background: color, width: size, height: size }} aria-hidden="true" />;
}

export const SET_COLORS = ['#c8603f', '#7f9a72', '#d49a3a', '#4f7a8c', '#8a6bb0', '#c0587e', '#5b8f8a', '#8c6d4f'];
