import type { ReactNode } from 'react';
import { Link } from 'react-router';

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <main id="contenu" className="flex min-h-dvh flex-col items-center justify-center px-4 py-10" tabIndex={-1}>
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <img src="/icon.svg" alt="" width={48} height={48} className="rounded-xl shadow-soft" />
          <span className="font-display text-4xl font-semibold">KnowList</span>
        </div>
        <div className="card p-6 sm:p-8">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-ink-soft">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        <p className="mt-6 text-center text-sm text-ink-soft">
          <Link to="/confidentialite" className="underline underline-offset-2 hover:text-ink">
            Confidentialité
          </Link>
        </p>
      </div>
    </main>
  );
}

export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  show,
  onToggle,
  describedBy,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  show: boolean;
  onToggle: () => void;
  describedBy?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        className="input pr-24"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required
        aria-describedby={describedBy}
        autoFocus={autoFocus}
        spellCheck={false}
        autoCapitalize="none"
      />
      <button type="button" onClick={onToggle} className="absolute inset-y-0 right-1 my-auto h-9 rounded-lg px-3 text-sm font-semibold text-ink-soft hover:bg-surface-2" aria-pressed={show}>
        {show ? 'Masquer' : 'Afficher'}
      </button>
    </div>
  );
}

export function passwordHints(pw: string, min: number) {
  return [
    { ok: pw.length >= min, label: `${min} caractères minimum` },
    { ok: /\s|-|_|\./.test(pw) || pw.length >= 16, label: 'Une phrase de passe est idéale (ex. « tulipe-orage-carnet »)' },
  ];
}
