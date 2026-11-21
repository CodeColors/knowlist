import { useState } from 'react';
import { Link } from 'react-router';
import { api, download } from '../lib/api';
import { DEFAULT_TOLERANCE } from '../lib/answer';
import { useAuth } from '../lib/auth';
import { describeDevice, relativeTime } from '../lib/format';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { pendingCount } from '../lib/offline';
import type { User } from '../lib/types';
import { Icon } from '../components/Icon';
import { ConfirmModal, Modal } from '../components/Modal';
import { Onboarding } from '../components/Onboarding';
import { useToast } from '../components/Toast';
import { PageHeader, Toggle } from '../components/ui';
import { ChangePasswordForm } from './ChangePassword';

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-20 p-5 sm:p-6" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="mb-4 text-2xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function Profile() {
  useDocumentTitle('Profil');
  const { user, setUser, updatePrefs, logout } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user!.displayName);
  const [email, setEmail] = useState(user!.email ?? '');
  const [tour, setTour] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePw, setDeletePw] = useState('');
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const sessions = useApi<{ sessions: { id: string; current: boolean; createdAt: string; lastSeenAt: string; ip: string; userAgent: string }[] }>('/me/sessions');
  if (!user) return null;
  const prefs = user.prefs;
  const tol = prefs.writeTolerance ?? DEFAULT_TOLERANCE;
  const pending = pendingCount();

  const saveProfile = async () => {
    try {
      const r = await api<{ user: User }>('/me', { method: 'PATCH', body: { displayName: name, email: email || null } });
      setUser(r.user);
      toast('Profil enregistré.', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const pref = (p: Parameters<typeof updatePrefs>[0]) => updatePrefs(p).catch((e) => toast(e.message, 'error'));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Profil"
        subtitle={`@${user.username}${user.role === 'admin' ? ' · administrateur' : ''}`}
        actions={
          <button type="button" className="btn-secondary" onClick={() => void logout()}>
            <Icon name="logout" size={20} /> Se déconnecter
          </button>
        }
      />

      <Section id="identite" title="Informations">
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void saveProfile();
          }}
        >
          <div>
            <label htmlFor="p-name" className="label">
              Nom affiché
            </label>
            <input id="p-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoComplete="name" />
          </div>
          <div>
            <label htmlFor="p-email" className="label">
              E-mail <span className="font-normal">(facultatif)</span>
            </label>
            <input id="p-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary">
              Enregistrer
            </button>
          </div>
        </form>
      </Section>

      <Section id="preferences" title="Préférences">
        <fieldset className="mb-4">
          <legend className="label">Thème</legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['light', '☀️ Clair'],
                ['dark', '🌙 Sombre'],
                ['auto', '🖥️ Automatique'],
              ] as const
            ).map(([v, l]) => (
              <label key={v} className={`chip min-h-11 cursor-pointer px-4 ${(prefs.theme ?? 'auto') === v ? 'border-accent bg-accent-soft text-accent' : ''}`}>
                <input type="radio" name="theme" className="sr-only" checked={(prefs.theme ?? 'auto') === v} onChange={() => void pref({ theme: v })} />
                {l}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mb-4">
          <label htmlFor="goal" className="label">
            Objectif quotidien (cartes par jour)
          </label>
          <div className="flex items-center gap-3">
            <input
              id="goal"
              type="range"
              min={5}
              max={200}
              step={5}
              value={prefs.dailyGoal ?? 20}
              onChange={(e) => void pref({ dailyGoal: Number(e.target.value) })}
              className="w-full max-w-xs accent-[var(--accent)]"
            />
            <span className="w-12 text-right font-bold tabular-nums">{prefs.dailyGoal ?? 20}</span>
          </div>
        </div>
        <div className="divide-y divide-line">
          <Toggle id="rm" label="Réduire les animations" description="Retournements et célébrations sans mouvement." checked={!!prefs.reduceMotion} onChange={(v) => void pref({ reduceMotion: v })} />
          <Toggle id="dys" label="Police adaptée à la dyslexie" description="Utilise la police OpenDyslexic." checked={!!prefs.dyslexiaFont} onChange={(v) => void pref({ dyslexiaFont: v })} />
        </div>
        <fieldset className="mt-4 border-t border-line pt-4">
          <legend className="label">Tolérance par défaut des réponses écrites</legend>
          <div className="divide-y divide-line">
            <Toggle id="t-case" label="Ignorer les majuscules" checked={tol.case} onChange={(v) => void pref({ writeTolerance: { ...tol, case: v } })} />
            <Toggle id="t-acc" label="Ignorer les accents" checked={tol.accents} onChange={(v) => void pref({ writeTolerance: { ...tol, accents: v } })} />
            <Toggle id="t-typo" label="Accepter les fautes de frappe mineures" checked={tol.typos} onChange={(v) => void pref({ writeTolerance: { ...tol, typos: v } })} />
            <Toggle id="t-punct" label="Ignorer la ponctuation" checked={tol.punctuation} onChange={(v) => void pref({ writeTolerance: { ...tol, punctuation: v } })} />
          </div>
        </fieldset>
        <button type="button" className="btn-ghost mt-4" onClick={() => setTour(true)}>
          <Icon name="sparkle" size={20} /> Revoir la visite guidée
        </button>
      </Section>

      <Section id="securite" title="Sécurité">
        <h3 className="mb-3 text-lg font-semibold">Mot de passe</h3>
        <ChangePasswordForm onDone={() => sessions.reload()} />
        <div className="my-6 border-t border-line" />
        <TotpSection />
        <div className="my-6 border-t border-line" />
        <h3 className="mb-3 text-lg font-semibold">Appareils connectés</h3>
        <ul className="divide-y divide-line">
          {sessions.data?.sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2">
              <div className="flex-1">
                <p className="font-semibold">
                  {describeDevice(s.userAgent)} {s.current && <span className="ml-1 rounded-full bg-ok-soft px-2 text-xs text-ok">cet appareil</span>}
                </p>
                <p className="text-sm text-ink-soft">
                  Actif {relativeTime(s.lastSeenAt)} · {s.ip}
                </p>
              </div>
              {!s.current && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={async () => {
                    await api(`/me/sessions/${s.id}`, { method: 'DELETE' });
                    void sessions.reload();
                    toast('Appareil déconnecté.', 'success');
                  }}
                >
                  Déconnecter
                </button>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section id="donnees" title="Mes données">
        <p className="mb-4 text-ink-soft">
          Tes données t’appartiennent. Tu peux les exporter à tout moment ou supprimer ton compte. Voir la{' '}
          <Link to="/confidentialite" className="link">
            page de confidentialité
          </Link>
          .
        </p>
        {pending > 0 && <p className="mb-3 rounded-xl bg-warn-soft px-3 py-2 text-warn">{pending} réponse(s) hors ligne en attente de synchronisation.</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={() => download('/me/export', 'knowlist-donnees.json').catch((e) => toast(e.message, 'error'))}>
            <Icon name="download" size={20} /> Exporter mes données (JSON)
          </button>
          <button type="button" className="btn-ghost text-danger" onClick={() => setDeleteOpen(true)}>
            <Icon name="trash" size={20} /> Supprimer mon compte
          </button>
        </div>
      </Section>

      {tour && <Onboarding onDone={() => setTour(false)} />}
      <ConfirmModal
        open={deleteOpen}
        title="Supprimer ton compte ?"
        message="Tous tes sets, cartes, images et ta progression seront définitivement supprimés. Pense à exporter tes données avant."
        confirmLabel="Supprimer définitivement"
        danger
        disabled={!deletePw}
        onClose={() => {
          setDeleteOpen(false);
          setDeleteErr(null);
        }}
        onConfirm={async () => {
          try {
            await api('/me', { method: 'DELETE', body: { password: deletePw } });
            window.location.href = '/connexion';
          } catch (e) {
            setDeleteErr((e as Error).message);
          }
        }}
      >
        <label htmlFor="del-pw" className="label">
          Confirme avec ton mot de passe
        </label>
        <input id="del-pw" type="password" className="input" value={deletePw} onChange={(e) => setDeletePw(e.target.value)} autoComplete="current-password" />
        {deleteErr && (
          <p className="text-danger" role="alert">
            {deleteErr}
          </p>
        )}
      </ConfirmModal>
    </div>
  );
}

function TotpSection() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [disableOpen, setDisableOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div>
      <h3 className="mb-1 text-lg font-semibold">Double authentification</h3>
      <p className="mb-3 text-ink-soft">
        {user?.totpEnabled
          ? 'Activée ✓ : un code de ton application d’authentification est demandé à chaque connexion.'
          : `Facultative${user?.role === 'admin' ? ', mais fortement recommandée pour un administrateur' : ''} : ajoute un code temporaire (Aegis, Google Authenticator, 1Password…) en plus du mot de passe.`}
      </p>
      {user?.totpEnabled ? (
        <button type="button" className="btn-secondary" onClick={() => setDisableOpen(true)}>
          Désactiver
        </button>
      ) : (
        <button
          type="button"
          className="btn-secondary"
          onClick={async () => {
            setErr(null);
            try {
              setSetup(await api('/auth/totp/setup', { body: {} }));
            } catch (e) {
              toast((e as Error).message, 'error');
            }
          }}
        >
          <Icon name="shield" size={20} /> Activer
        </button>
      )}
      <Modal open={!!setup} onClose={() => setSetup(null)} title="Activer la double authentification">
        {setup && (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const r = await api<{ user: User }>('/auth/totp/enable', { body: { code } });
                setUser(r.user);
                setSetup(null);
                setCode('');
                toast('Double authentification activée.', 'success');
              } catch (e2) {
                setErr((e2 as Error).message);
              }
            }}
          >
            <p>1. Scanne ce QR code avec ton application d’authentification :</p>
            <img src={setup.qr} alt="QR code de configuration" width={220} height={220} className="mx-auto rounded-xl bg-white p-2" />
            <p className="text-sm text-ink-soft">
              Ou saisis la clé manuellement : <code className="rounded bg-surface-2 px-1 break-all">{setup.secret}</code>
            </p>
            <div>
              <label htmlFor="totp-code" className="label">
                2. Saisis le code à 6 chiffres affiché
              </label>
              <input
                id="totp-code"
                className="input w-40 text-center font-mono text-xl tracking-widest"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </div>
            {err && (
              <p className="text-danger" role="alert">
                {err}
              </p>
            )}
            <button type="submit" className="btn-primary" disabled={code.length !== 6}>
              Vérifier et activer
            </button>
          </form>
        )}
      </Modal>
      <ConfirmModal
        open={disableOpen}
        title="Désactiver la double authentification ?"
        message="Ton compte ne sera plus protégé que par ton mot de passe."
        confirmLabel="Désactiver"
        danger
        disabled={!pw}
        onClose={() => setDisableOpen(false)}
        onConfirm={async () => {
          try {
            const r = await api<{ user: User }>('/auth/totp/disable', { body: { password: pw } });
            setUser(r.user);
            setDisableOpen(false);
            setPw('');
          } catch (e) {
            toast((e as Error).message, 'error');
          }
        }}
      >
        <label htmlFor="totp-pw" className="label">
          Mot de passe
        </label>
        <input id="totp-pw" type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
      </ConfirmModal>
    </div>
  );
}
