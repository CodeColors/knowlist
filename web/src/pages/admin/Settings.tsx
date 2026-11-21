import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { useToast } from '../../components/Toast';
import { ErrorBox, Spinner, Toggle } from '../../components/ui';

interface S {
  invitationDays: number;
  passwordMinLength: number;
  maxSetsPerUser: number;
  maxCardsPerUser: number;
  maxImageKb: number;
  maxAudioKb: number;
  externalServices: boolean;
  welcomeMessage: string;
}

const NUMS: { key: keyof S; label: string; min: number; max: number; hint?: string }[] = [
  { key: 'invitationDays', label: 'Durée de validité des invitations (jours)', min: 1, max: 90 },
  { key: 'passwordMinLength', label: 'Longueur minimale des mots de passe', min: 12, max: 128, hint: '12 caractères minimum, mots de passe courants refusés.' },
  { key: 'maxSetsPerUser', label: 'Sets maximum par utilisateur', min: 1, max: 100000 },
  { key: 'maxCardsPerUser', label: 'Cartes maximum par utilisateur', min: 10, max: 1000000 },
  { key: 'maxImageKb', label: 'Taille maximale d’une image envoyée (Ko)', min: 50, max: 20480, hint: 'Les images sont redimensionnées (1200 px) et compressées à l’envoi.' },
  { key: 'maxAudioKb', label: 'Taille maximale d’un fichier audio (Ko)', min: 50, max: 20480 },
];

export default function Settings() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ settings: S }>('/admin/settings');
  const [s, setS] = useState<S | null>(null);
  useEffect(() => {
    if (data) setS(data.settings);
  }, [data]);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!s) return null;

  const save = async () => {
    try {
      const r = await api<{ settings: S }>('/admin/settings', { method: 'PATCH', body: s });
      setS(r.settings);
      toast('Paramètres enregistrés.', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <form
      className="card max-w-2xl space-y-5 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div>
        <label htmlFor="welcome" className="label">
          Message d’accueil (affiché à la première connexion)
        </label>
        <textarea id="welcome" className="input min-h-24" value={s.welcomeMessage} maxLength={500} onChange={(e) => setS({ ...s, welcomeMessage: e.target.value })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {NUMS.map((n) => (
          <div key={n.key}>
            <label htmlFor={`s-${n.key}`} className="label">
              {n.label}
            </label>
            <input
              id={`s-${n.key}`}
              type="number"
              className="input"
              min={n.min}
              max={n.max}
              value={s[n.key] as number}
              onChange={(e) => setS({ ...s, [n.key]: Number(e.target.value) })}
            />
            {n.hint && <p className="mt-1 text-sm text-ink-soft">{n.hint}</p>}
          </div>
        ))}
      </div>
      <Toggle
        id="ext"
        label="Services externes (traduction, définitions, audio)"
        description="Désactivé par défaut : activer ces aides enverrait les mots saisis à des services tiers. (Prévu en V2 ; la lecture audio utilise toujours la synthèse vocale du navigateur.)"
        checked={s.externalServices}
        onChange={(v) => setS({ ...s, externalServices: v })}
      />
      <button type="submit" className="btn-primary">
        Enregistrer
      </button>
    </form>
  );
}
