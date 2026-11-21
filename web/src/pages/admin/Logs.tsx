import { useState } from 'react';
import { api } from '../../lib/api';
import { dateTime, describeDevice, relativeTime } from '../../lib/format';
import { useApi, useDebounced } from '../../lib/hooks';
import { useToast } from '../../components/Toast';
import { ErrorBox, Spinner } from '../../components/ui';

interface Sess {
  id: string;
  current: boolean;
  userId: number;
  username: string;
  displayName: string;
  createdAt: string;
  lastSeenAt: string;
  ip: string;
  userAgent: string;
}

export function Sessions() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ sessions: Sess[] }>('/admin/sessions');
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const byUser = new Map<string, Sess[]>();
  data?.sessions.forEach((s) => byUser.set(s.displayName, [...(byUser.get(s.displayName) ?? []), s]));
  return (
    <div className="space-y-4">
      <p className="text-ink-soft">Appareils connectés. Les sessions expirent après 30 jours d’inactivité.</p>
      {[...byUser.entries()].map(([name, list]) => (
        <section key={name} className="card p-4">
          <h2 className="mb-2 font-semibold">
            {name} <span className="font-normal text-ink-soft">@{list[0].username}</span>
          </h2>
          <ul className="divide-y divide-line">
            {list.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-2">
                <div className="flex-1">
                  <p>
                    {describeDevice(s.userAgent)} {s.current && <span className="ml-1 rounded-full bg-ok-soft px-2 text-xs text-ok">toi</span>}
                  </p>
                  <p className="text-sm text-ink-soft">
                    {s.ip} · actif {relativeTime(s.lastSeenAt)} · ouverte le {dateTime(s.createdAt)}
                  </p>
                </div>
                {!s.current && (
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={async () => {
                      await api(`/admin/sessions/${s.id}`, { method: 'DELETE' });
                      toast('Session fermée.', 'success');
                      void reload();
                    }}
                  >
                    Déconnecter
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

const ACTION_LABELS: Record<string, string> = {
  'login.success': 'Connexion',
  'login.failure': 'Échec de connexion',
  'login.locked': 'Connexion bloquée (trop de tentatives)',
  logout: 'Déconnexion',
  'password.change': 'Changement de mot de passe',
  'password.reset': 'Réinitialisation du mot de passe',
  'user.create': 'Création de compte',
  'user.update': 'Modification de compte',
  'user.suspend': 'Suspension de compte',
  'user.reactivate': 'Réactivation de compte',
  'user.delete': 'Suppression de compte',
  'user.self_delete': 'Suppression de son compte',
  'session.revoke': 'Déconnexion forcée',
  'invitation.create': 'Invitation créée',
  'invitation.accept': 'Invitation acceptée',
  'invitation.revoke': 'Invitation révoquée',
  'totp.enable': '2FA activée',
  'totp.disable': '2FA désactivée',
  'settings.update': 'Paramètres modifiés',
  'backup.create': 'Sauvegarde créée',
  'backup.restore': 'Sauvegarde restaurée',
  'data.export': 'Export de données',
};

interface Entry {
  id: number;
  createdAt: string;
  action: string;
  actor: string | null;
  target: string | null;
  ip: string | null;
  details: unknown;
}

export function Audit() {
  const [action, setAction] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q, 300);
  const { data, error, loading, reload } = useApi<{ entries: Entry[]; hasMore: boolean }>('/admin/audit', { action, q: dq, page });
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <label htmlFor="a-action" className="sr-only">
          Type d’événement
        </label>
        <select
          id="a-action"
          className="input max-w-xs"
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tous les événements</option>
          <option value="login">Connexions</option>
          <option value="login.failure">Échecs de connexion</option>
          <option value="user">Comptes</option>
          <option value="invitation">Invitations</option>
          <option value="password">Mots de passe</option>
          <option value="backup">Sauvegardes</option>
        </select>
        <label htmlFor="a-q" className="sr-only">
          Filtrer par utilisateur ou IP
        </label>
        <input
          id="a-q"
          type="search"
          className="input max-w-xs"
          placeholder="Utilisateur ou IP…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <p className="mb-2 text-sm text-ink-soft">Conservation : 90 jours.</p>
      {loading && !data && <Spinner />}
      <ErrorBox error={error} onRetry={reload} />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-ink-soft">
              <th className="px-4 py-2 font-semibold">Date</th>
              <th className="px-4 py-2 font-semibold">Événement</th>
              <th className="px-4 py-2 font-semibold">Par</th>
              <th className="px-4 py-2 font-semibold">Cible</th>
              <th className="px-4 py-2 font-semibold">IP</th>
            </tr>
          </thead>
          <tbody>
            {data?.entries.map((e) => (
              <tr key={e.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-2 whitespace-nowrap">{dateTime(e.createdAt)}</td>
                <td className={`px-4 py-2 ${e.action.includes('failure') || e.action.includes('locked') ? 'text-danger' : ''}`}>{ACTION_LABELS[e.action] ?? e.action}</td>
                <td className="px-4 py-2">{e.actor ?? '—'}</td>
                <td className="px-4 py-2">{e.target ?? '—'}</td>
                <td className="px-4 py-2 font-mono">{e.ip ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex justify-between">
        <button type="button" className="btn-secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>
          ← Plus récents
        </button>
        <button type="button" className="btn-secondary" disabled={!data?.hasMore} onClick={() => setPage(page + 1)}>
          Plus anciens →
        </button>
      </div>
    </div>
  );
}
