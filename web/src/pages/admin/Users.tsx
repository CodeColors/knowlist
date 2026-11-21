import { useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { dateOnly, relativeTime } from '../../lib/format';
import { useApi } from '../../lib/hooks';
import { Icon } from '../../components/Icon';
import { ConfirmModal, Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { ErrorBox, Spinner } from '../../components/ui';
import { useAuth } from '../../lib/auth';

export interface AdminUser {
  id: number;
  username: string;
  displayName: string;
  email: string | null;
  role: 'admin' | 'user';
  status: 'active' | 'suspended' | 'expired';
  suspended: boolean;
  expiresAt: string | null;
  mustChangePassword: boolean;
  totpEnabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  setCount: number;
  sessionCount: number;
}

const STATUS: Record<AdminUser['status'], { label: string; cls: string }> = {
  active: { label: 'Actif', cls: 'bg-ok-soft text-ok' },
  suspended: { label: 'Suspendu', cls: 'bg-danger-soft text-danger' },
  expired: { label: 'Expiré', cls: 'bg-warn-soft text-warn' },
};

export function CredentialsBox({ username, password, loginUrl }: { username: string; password: string; loginUrl?: string }) {
  const toast = useToast();
  const text = `KnowList${loginUrl ? ` — ${loginUrl}` : ''}\nIdentifiant : ${username}\nMot de passe temporaire : ${password}\n(à changer à la première connexion)`;
  return (
    <div className="space-y-3">
      <p>Transmets ces identifiants en main propre ou par un canal sûr. Le mot de passe ne sera plus affiché.</p>
      <pre className="rounded-xl bg-surface-2 p-3 font-mono text-sm whitespace-pre-wrap">{text}</pre>
      <button type="button" className="btn-secondary" onClick={() => navigator.clipboard.writeText(text).then(() => toast('Copié.', 'success'))}>
        <Icon name="copy" size={20} /> Copier
      </button>
    </div>
  );
}

export default function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ users: AdminUser[] }>('/admin/users');
  const [filter, setFilter] = useState<'all' | AdminUser['status']>('all');
  const [q, setQ] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [edit, setEdit] = useState<AdminUser | null>(null);
  const [creds, setCreds] = useState<{ username: string; password: string; loginUrl?: string } | null>(null);
  const [toDelete, setToDelete] = useState<AdminUser | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [resetFor, setResetFor] = useState<AdminUser | null>(null);

  const list = useMemo(() => {
    let l = data?.users ?? [];
    if (filter !== 'all') l = l.filter((u) => u.status === filter);
    if (q.trim()) {
      const n = q.trim().toLowerCase();
      l = l.filter((u) => `${u.displayName} ${u.username} ${u.email ?? ''}`.toLowerCase().includes(n));
    }
    return l;
  }, [data, filter, q]);

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast(msg, 'success');
      void reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label htmlFor="u-search" className="sr-only">
          Rechercher un compte
        </label>
        <input id="u-search" type="search" className="input max-w-xs" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
        {(['all', 'active', 'suspended', 'expired'] as const).map((s) => (
          <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)} className={`chip ${filter === s ? 'border-accent bg-accent-soft text-accent' : ''}`}>
            {s === 'all' ? `Tous (${data?.users.length ?? 0})` : `${STATUS[s].label}s (${data?.users.filter((u) => u.status === s).length ?? 0})`}
          </button>
        ))}
        <button type="button" className="btn-primary ml-auto" onClick={() => setCreateOpen(true)}>
          <Icon name="plus" size={20} /> Créer un accès
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-left">
          <thead>
            <tr className="border-b border-line text-sm text-ink-soft">
              <th className="px-4 py-2 font-semibold">Compte</th>
              <th className="px-4 py-2 font-semibold">Statut</th>
              <th className="px-4 py-2 font-semibold">Dernière connexion</th>
              <th className="px-4 py-2 font-semibold">Sets</th>
              <th className="px-4 py-2 font-semibold">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-3">
                  <p className="font-semibold">
                    {u.displayName} {u.role === 'admin' && <span className="ml-1 rounded-full bg-accent-soft px-2 text-xs text-accent">admin</span>}
                  </p>
                  <p className="text-sm text-ink-soft">
                    @{u.username}
                    {u.email && ` · ${u.email}`}
                    {u.totpEnabled && ' · 2FA'}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-sm font-semibold ${STATUS[u.status].cls}`}>{STATUS[u.status].label}</span>
                  {u.expiresAt && <p className="mt-1 text-xs text-ink-soft">expire le {dateOnly(u.expiresAt)}</p>}
                  {u.mustChangePassword && <p className="mt-1 text-xs text-ink-soft">mot de passe temporaire</p>}
                </td>
                <td className="px-4 py-3 text-sm">
                  {relativeTime(u.lastLoginAt)}
                  <span className="block text-ink-soft">{u.sessionCount} session(s)</span>
                </td>
                <td className="px-4 py-3 tabular-nums">{u.setCount}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button type="button" className="btn-ghost" onClick={() => setEdit(u)}>
                      Modifier
                    </button>
                    <details className="relative">
                      <summary className="btn-icon list-none [&::-webkit-details-marker]:hidden" aria-label={`Actions pour ${u.displayName}`}>
                        <Icon name="more" />
                      </summary>
                      <div className="absolute right-0 z-20 mt-1 w-60 rounded-xl border border-line bg-surface p-1 shadow-lift">
                        {u.id !== me?.id && (
                          <Item onClick={() => act(() => api(`/admin/users/${u.id}`, { method: 'PATCH', body: { suspended: !u.suspended } }), u.suspended ? 'Compte réactivé.' : 'Compte suspendu.')}>
                            {u.suspended ? 'Réactiver' : 'Suspendre'}
                          </Item>
                        )}
                        <Item onClick={() => setResetFor(u)}>Réinitialiser le mot de passe</Item>
                        <Item onClick={() => act(() => api(`/admin/users/${u.id}/logout`, { body: {} }), 'Sessions fermées.')}>Forcer la déconnexion</Item>
                        {u.totpEnabled && <Item onClick={() => act(() => api(`/admin/users/${u.id}/disable-totp`, { body: {} }), '2FA désactivée.')}>Désactiver la 2FA</Item>}
                        {u.id !== me?.id && (
                          <Item danger onClick={() => setToDelete(u)}>
                            Supprimer…
                          </Item>
                        )}
                      </div>
                    </details>
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-ink-soft">
                  Aucun compte ne correspond.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <UserForm
        open={createOpen || !!edit}
        user={edit}
        onClose={() => {
          setCreateOpen(false);
          setEdit(null);
        }}
        onCreated={(c) => {
          setCreateOpen(false);
          setCreds(c);
          void reload();
        }}
        onSaved={() => {
          setEdit(null);
          void reload();
          toast('Compte mis à jour.', 'success');
        }}
      />
      <Modal open={!!creds} onClose={() => setCreds(null)} title="Accès créé">
        {creds && <CredentialsBox {...creds} />}
      </Modal>
      <ConfirmModal
        open={!!resetFor}
        title="Réinitialiser le mot de passe ?"
        message={`Un nouveau mot de passe temporaire sera généré pour ${resetFor?.displayName}, et toutes ses sessions seront fermées.`}
        confirmLabel="Réinitialiser"
        onClose={() => setResetFor(null)}
        onConfirm={async () => {
          const u = resetFor!;
          try {
            const r = await api<{ tempPassword: string }>(`/admin/users/${u.id}/reset-password`, { body: {} });
            setResetFor(null);
            setCreds({ username: u.username, password: r.tempPassword, loginUrl: `${location.origin}/connexion` });
            void reload();
          } catch (e) {
            toast((e as Error).message, 'error');
          }
        }}
      />
      <ConfirmModal
        open={!!toDelete}
        title="Supprimer ce compte ?"
        message={`Le compte de ${toDelete?.displayName}, ses ${toDelete?.setCount} sets et toute sa progression seront définitivement supprimés.`}
        confirmLabel="Supprimer définitivement"
        danger
        disabled={confirmText.toLowerCase() !== toDelete?.username.toLowerCase()}
        onClose={() => {
          setToDelete(null);
          setConfirmText('');
        }}
        onConfirm={() =>
          act(async () => {
            await api(`/admin/users/${toDelete!.id}`, { method: 'DELETE', body: { confirm: confirmText } });
            setToDelete(null);
            setConfirmText('');
          }, 'Compte supprimé.')
        }
      >
        <label htmlFor="del-confirm" className="label">
          Saisis l’identifiant <strong className="font-mono">{toDelete?.username}</strong> pour confirmer
        </label>
        <input id="del-confirm" className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
      </ConfirmModal>
    </div>
  );
}

function Item({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      className={`flex min-h-11 w-full items-center rounded-lg px-3 text-left hover:bg-surface-2 ${danger ? 'text-danger' : ''}`}
      onClick={(e) => {
        (e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open');
        onClick();
      }}
    >
      {children}
    </button>
  );
}

function UserForm({
  open,
  user,
  onClose,
  onCreated,
  onSaved,
}: {
  open: boolean;
  user: AdminUser | null;
  onClose: () => void;
  onCreated: (c: { username: string; password: string; loginUrl: string }) => void;
  onSaved: () => void;
}) {
  const key = `${open}-${user?.id ?? 'new'}`;
  return <UserFormInner key={key} open={open} user={user} onClose={onClose} onCreated={onCreated} onSaved={onSaved} />;
}

function UserFormInner({ open, user, onClose, onCreated, onSaved }: Parameters<typeof UserForm>[0]) {
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState<'user' | 'admin'>(user?.role ?? 'user');
  const [expiresAt, setExpiresAt] = useState(user?.expiresAt?.slice(0, 10) ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const suggest = async (name: string) => {
    if (user || username || !name.trim()) return;
    const r = await api<{ username: string }>('/admin/username-suggestion', { query: { name } }).catch(() => null);
    if (r) setUsername(r.username);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (user) {
        await api(`/admin/users/${user.id}`, { method: 'PATCH', body: { displayName, email: email || null, role, expiresAt: expiresAt || null } });
        onSaved();
      } else {
        const r = await api<{ user: { username: string }; tempPassword: string; loginUrl: string }>('/admin/users', {
          body: { displayName, username: username || undefined, email: email || null, role, expiresAt: expiresAt || null },
        });
        onCreated({ username: r.user.username, password: r.tempPassword, loginUrl: r.loginUrl });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={user ? `Modifier ${user.displayName}` : 'Créer un accès (identifiants générés)'}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="btn-primary" onClick={submit} disabled={busy || !displayName.trim()}>
            {user ? 'Enregistrer' : 'Créer et générer le mot de passe'}
          </button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div>
          <label htmlFor="uf-name" className="label">
            Nom
          </label>
          <input id="uf-name" className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} onBlur={(e) => void suggest(e.target.value)} required autoFocus />
        </div>
        {!user && (
          <div>
            <label htmlFor="uf-user" className="label">
              Identifiant <span className="font-normal">(généré si vide)</span>
            </label>
            <input id="uf-user" className="input font-mono" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" spellCheck={false} />
          </div>
        )}
        <div>
          <label htmlFor="uf-email" className="label">
            E-mail <span className="font-normal">(facultatif)</span>
          </label>
          <input id="uf-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="uf-role" className="label">
              Rôle
            </label>
            <select id="uf-role" className="input" value={role} onChange={(e) => setRole(e.target.value as 'user' | 'admin')}>
              <option value="user">Utilisateur</option>
              <option value="admin">Administrateur</option>
            </select>
          </div>
          <div>
            <label htmlFor="uf-exp" className="label">
              Expiration de l’accès <span className="font-normal">(facultatif)</span>
            </label>
            <input id="uf-exp" type="date" className="input" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
        </div>
        {error && (
          <p className="text-danger" role="alert">
            {error}
          </p>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
