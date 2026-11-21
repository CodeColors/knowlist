import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useDocumentTitle } from '../lib/hooks';
import type { User } from '../lib/types';
import { AuthShell, PasswordInput } from './AuthShell';

export default function Login() {
  useDocumentTitle('Connexion');
  const { setSession } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ user: User; csrf: string }>('/auth/login', { body: { username: username.trim(), password, totp: needTotp ? totp : undefined } });
      setSession(r.user, r.csrf);
      const next = params.get('suite');
      navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : '/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'totp_required') {
        setNeedTotp(true);
        setError(null);
      } else setError(err instanceof Error ? err.message : 'Connexion impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Bon retour parmi nous" subtitle="Connecte-toi pour retrouver tes sets.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="username" className="label">
            Identifiant
          </label>
          <input
            id="username"
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            autoFocus
          />
        </div>
        <div>
          <label htmlFor="password" className="label">
            Mot de passe
          </label>
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="current-password" show={show} onToggle={() => setShow(!show)} />
        </div>
        {needTotp && (
          <div className="pop-in">
            <label htmlFor="totp" className="label">
              Code de vérification (application d’authentification)
            </label>
            <input
              id="totp"
              className="input text-center font-mono text-xl tracking-[0.3em]"
              value={totp}
              onChange={(e) => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              autoFocus
              required
            />
          </div>
        )}
        {error && (
          <p className="rounded-xl bg-danger-soft px-4 py-3 text-danger" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary w-full" disabled={busy || !username || !password}>
          {busy ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-soft">
        Pas encore de compte ? KnowList est privé : demande un accès à l’administrateur.
        <br />
        Mot de passe oublié ? L’administrateur peut le réinitialiser.
      </p>
    </AuthShell>
  );
}
