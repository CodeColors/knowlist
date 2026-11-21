import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useDocumentTitle } from '../lib/hooks';
import type { User } from '../lib/types';
import { useToast } from '../components/Toast';
import { AuthShell, PasswordInput, passwordHints } from './AuthShell';

export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const { setUser, app } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const min = app?.passwordMinLength ?? 12;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pw !== pw2) return setError('Les deux mots de passe ne correspondent pas.');
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ user: User }>('/auth/password', { body: { currentPassword: current, newPassword: pw } });
      setUser(r.user);
      toast('Mot de passe mis à jour. Tes autres appareils ont été déconnectés.', 'success');
      setCurrent('');
      setPw('');
      setPw2('');
      onDone?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="cur" className="label">
          Mot de passe actuel
        </label>
        <PasswordInput id="cur" value={current} onChange={setCurrent} autoComplete="current-password" show={show} onToggle={() => setShow(!show)} />
      </div>
      <div>
        <label htmlFor="npw" className="label">
          Nouveau mot de passe
        </label>
        <PasswordInput id="npw" value={pw} onChange={setPw} autoComplete="new-password" show={show} onToggle={() => setShow(!show)} describedBy="npw-hints" />
        <ul id="npw-hints" className="mt-2 space-y-1 text-sm">
          {passwordHints(pw, min).map((h) => (
            <li key={h.label} className={h.ok ? 'text-ok' : 'text-ink-soft'}>
              {h.ok ? '✓' : '•'} {h.label}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <label htmlFor="npw2" className="label">
          Confirme le nouveau mot de passe
        </label>
        <PasswordInput id="npw2" value={pw2} onChange={setPw2} autoComplete="new-password" show={show} onToggle={() => setShow(!show)} />
      </div>
      {error && (
        <p className="rounded-xl bg-danger-soft px-4 py-3 text-danger" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn-primary w-full sm:w-auto" disabled={busy || !current || pw.length < min}>
        {busy ? 'Enregistrement…' : 'Changer le mot de passe'}
      </button>
    </form>
  );
}

export default function ChangePassword({ forced }: { forced?: boolean }) {
  useDocumentTitle('Nouveau mot de passe');
  const { logout } = useAuth();
  return (
    <AuthShell
      title="Choisis ton mot de passe"
      subtitle={forced ? 'Tu t’es connecté avec un mot de passe temporaire : remplace-le par un mot de passe personnel.' : undefined}
    >
      <ChangePasswordForm />
      <button type="button" className="btn-ghost mt-4 w-full" onClick={() => void logout()}>
        Se déconnecter
      </button>
    </AuthShell>
  );
}
