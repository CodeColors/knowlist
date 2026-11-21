import { useState } from 'react';
import { api } from '../../lib/api';
import { dateOnly, dateTime } from '../../lib/format';
import { useApi } from '../../lib/hooks';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { ErrorBox, Spinner } from '../../components/ui';

interface Inv {
  id: number;
  username: string;
  displayName: string;
  email: string | null;
  role: string;
  createdAt: string;
  createdBy: string | null;
  expiresAt: string;
  accountExpiresAt: string | null;
  usedAt: string | null;
  status: 'pending' | 'used' | 'expired' | 'revoked';
}

const STATUS = {
  pending: { label: 'Envoyée', cls: 'bg-accent-soft text-accent' },
  used: { label: 'Utilisée', cls: 'bg-ok-soft text-ok' },
  expired: { label: 'Expirée', cls: 'bg-warn-soft text-warn' },
  revoked: { label: 'Révoquée', cls: 'bg-surface-2 text-ink-soft' },
};

export default function Invitations() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ invitations: Inv[] }>('/admin/invitations');
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<{ link: string; expiresAt: string; username: string } | null>(null);
  const [form, setForm] = useState({ displayName: '', username: '', email: '', role: 'user', accountExpiresAt: '', days: '' });
  const [err, setErr] = useState<string | null>(null);

  const create = async () => {
    setErr(null);
    try {
      const r = await api('/admin/invitations', {
        body: {
          displayName: form.displayName,
          username: form.username || undefined,
          email: form.email || null,
          role: form.role,
          accountExpiresAt: form.accountExpiresAt || null,
          days: form.days ? Number(form.days) : undefined,
        },
      });
      setOpen(false);
      setLink(r);
      setForm({ displayName: '', username: '', email: '', role: 'user', accountExpiresAt: '', days: '' });
      void reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-ink-soft">Un lien à usage unique permet à la personne de choisir elle-même son mot de passe.</p>
        <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
          <Icon name="link" size={20} /> Générer une invitation
        </button>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-left">
          <thead>
            <tr className="border-b border-line text-sm text-ink-soft">
              <th className="px-4 py-2 font-semibold">Personne</th>
              <th className="px-4 py-2 font-semibold">Statut</th>
              <th className="px-4 py-2 font-semibold">Créée</th>
              <th className="px-4 py-2 font-semibold">Validité</th>
              <th className="px-4 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data?.invitations.map((i) => (
              <tr key={i.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-3">
                  <p className="font-semibold">{i.displayName}</p>
                  <p className="text-sm text-ink-soft">
                    @{i.username}
                    {i.role === 'admin' && ' · admin'}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-sm font-semibold ${STATUS[i.status].cls}`}>{STATUS[i.status].label}</span>
                </td>
                <td className="px-4 py-3 text-sm">
                  {dateTime(i.createdAt)}
                  {i.createdBy && <span className="block text-ink-soft">par {i.createdBy}</span>}
                </td>
                <td className="px-4 py-3 text-sm">{i.status === 'used' ? `utilisée le ${dateOnly(i.usedAt)}` : `jusqu’au ${dateOnly(i.expiresAt)}`}</td>
                <td className="px-4 py-3 text-right">
                  {i.status === 'pending' && (
                    <button
                      type="button"
                      className="btn-ghost text-danger"
                      onClick={async () => {
                        await api(`/admin/invitations/${i.id}`, { method: 'DELETE' });
                        toast('Invitation révoquée.', 'success');
                        void reload();
                      }}
                    >
                      Révoquer
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {data?.invitations.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-ink-soft">
                  Aucune invitation pour l’instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nouvelle invitation"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Annuler
            </button>
            <button type="button" className="btn-primary" onClick={create} disabled={!form.displayName.trim()}>
              Générer le lien
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="inv-name" className="label">
              Nom
            </label>
            <input id="inv-name" className="input" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} autoFocus />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="inv-user" className="label">
                Identifiant <span className="font-normal">(généré si vide)</span>
              </label>
              <input id="inv-user" className="input font-mono" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoCapitalize="none" />
            </div>
            <div>
              <label htmlFor="inv-email" className="label">
                E-mail <span className="font-normal">(facultatif)</span>
              </label>
              <input id="inv-email" type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label htmlFor="inv-role" className="label">
                Rôle
              </label>
              <select id="inv-role" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="user">Utilisateur</option>
                <option value="admin">Administrateur</option>
              </select>
            </div>
            <div>
              <label htmlFor="inv-days" className="label">
                Validité du lien (jours)
              </label>
              <input id="inv-days" type="number" min={1} max={90} placeholder="réglage par défaut" className="input" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="inv-exp" className="label">
                Expiration du compte <span className="font-normal">(facultatif, ex. fin de trimestre)</span>
              </label>
              <input id="inv-exp" type="date" className="input" value={form.accountExpiresAt} onChange={(e) => setForm({ ...form, accountExpiresAt: e.target.value })} />
            </div>
          </div>
          {err && (
            <p className="text-danger" role="alert">
              {err}
            </p>
          )}
        </div>
      </Modal>

      <Modal open={!!link} onClose={() => setLink(null)} title="Lien d’invitation">
        {link && (
          <div className="space-y-3">
            <p>
              Envoie ce lien à la personne. Il est valable jusqu’au <strong>{dateTime(link.expiresAt)}</strong> et ne fonctionne qu’une seule fois. Il ne sera plus affiché.
            </p>
            <input className="input font-mono text-sm" readOnly value={link.link} onFocus={(e) => e.target.select()} aria-label="Lien d’invitation" />
            <button type="button" className="btn-primary" onClick={() => navigator.clipboard.writeText(link.link).then(() => toast('Lien copié.', 'success'))}>
              <Icon name="copy" size={20} /> Copier le lien
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
