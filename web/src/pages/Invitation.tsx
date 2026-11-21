import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useDocumentTitle } from '../lib/hooks';
import type { User } from '../lib/types';
import { Spinner } from '../components/ui';
import { AuthShell, PasswordInput, passwordHints } from './AuthShell';

export default function Invitation() {
  useDocumentTitle('Invitation');
  const { token = '' } = useParams();
  const { setSession, user } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState<{ username: string; displayName: string; passwordMinLength: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/auth/invitation/${encodeURIComponent(token)}`)
      .then(setInfo)
      .catch((e: ApiError) => setLoadError(e.message));
  }, [token]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pw !== pw2) return setError('Les deux mots de passe ne correspondent pas.');
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ user: User; csrf: string }>(`/auth/invitation/${encodeURIComponent(token)}`, { body: { password: pw } });
      setSession(r.user, r.csrf);
      navigate('/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (user)
    return (
      <AuthShell title="Tu es déjà connecté">
        <a href="/" className="btn-primary w-full">
          Aller à l’accueil
        </a>
      </AuthShell>
    );
  if (loadError)
    return (
      <AuthShell title="Lien indisponible" subtitle={loadError}>
        <p className="text-ink-soft">Demande un nouveau lien à l’administrateur de KnowList.</p>
      </AuthShell>
    );
  if (!info) return <Spinner />;
  const min = info.passwordMinLength;
  return (
    <AuthShell title={`Bienvenue, ${info.displayName} !`} subtitle="Choisis ton mot de passe pour activer ton compte.">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <span className="label">Ton identifiant</span>
          <p className="rounded-xl bg-surface-2 px-3 py-2 font-mono">{info.username}</p>
        </div>
        <input type="text" autoComplete="username" value={info.username} readOnly hidden />
        <div>
          <label htmlFor="pw" className="label">
            Nouveau mot de passe
          </label>
          <PasswordInput id="pw" value={pw} onChange={setPw} autoComplete="new-password" show={show} onToggle={() => setShow(!show)} describedBy="pw-hints" autoFocus />
          <ul id="pw-hints" className="mt-2 space-y-1 text-sm">
            {passwordHints(pw, min).map((h) => (
              <li key={h.label} className={h.ok ? 'text-ok' : 'text-ink-soft'}>
                {h.ok ? '✓' : '•'} {h.label}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <label htmlFor="pw2" className="label">
            Confirme le mot de passe
          </label>
          <PasswordInput id="pw2" value={pw2} onChange={setPw2} autoComplete="new-password" show={show} onToggle={() => setShow(!show)} />
        </div>
        {error && (
          <p className="rounded-xl bg-danger-soft px-4 py-3 text-danger" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary w-full" disabled={busy || pw.length < min}>
          {busy ? 'Activation…' : 'Activer mon compte'}
        </button>
      </form>
    </AuthShell>
  );
}
