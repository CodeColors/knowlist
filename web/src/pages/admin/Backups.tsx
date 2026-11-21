import { useState } from 'react';
import { api, download } from '../../lib/api';
import { bytes, dateTime } from '../../lib/format';
import { useApi } from '../../lib/hooks';
import { Icon } from '../../components/Icon';
import { ConfirmModal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { ErrorBox, Spinner } from '../../components/ui';

interface B {
  name: string;
  size: number;
  createdAt: string;
}

export default function Backups() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ backups: B[]; schedule: { hourUtc: number; retentionDays: number } }>('/admin/backups');
  const [busy, setBusy] = useState(false);
  const [restore, setRestore] = useState<B | null>(null);
  const [confirm, setConfirm] = useState('');
  const [step, setStep] = useState(1);

  const create = async () => {
    setBusy(true);
    try {
      await api('/admin/backups', { body: {} });
      toast('Sauvegarde créée.', 'success');
      void reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    setBusy(true);
    try {
      await api('/admin/backups/upload', { method: 'POST', body: fd });
      toast('Archive importée : tu peux maintenant la restaurer.', 'success');
      void reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <p>
          Sauvegarde automatique chaque nuit à {data?.schedule.hourUtc} h UTC (base de données + images et sons), conservée {data?.schedule.retentionDays} jours sur le serveur.
          Pense à la copie chiffrée hors du VPS (voir la documentation d’exploitation).
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={create} disabled={busy}>
            <Icon name="download" size={20} /> {busy ? 'En cours…' : 'Sauvegarder maintenant'}
          </button>
          <label className="btn-secondary cursor-pointer">
            <Icon name="upload" size={20} /> Importer une archive
            <input type="file" accept=".tar.gz,.gz,application/gzip" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />
          </label>
        </div>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[560px] text-left">
          <thead>
            <tr className="border-b border-line text-sm text-ink-soft">
              <th className="px-4 py-2 font-semibold">Date</th>
              <th className="px-4 py-2 font-semibold">Archive</th>
              <th className="px-4 py-2 font-semibold">Taille</th>
              <th className="px-4 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data?.backups.map((b) => (
              <tr key={b.name} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-2">{dateTime(b.createdAt)}</td>
                <td className="px-4 py-2 font-mono text-sm">{b.name}</td>
                <td className="px-4 py-2">{bytes(b.size)}</td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-1">
                    <button type="button" className="btn-ghost" onClick={() => download(`/admin/backups/${b.name}`, b.name).catch((e) => toast(e.message, 'error'))}>
                      Télécharger
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        setRestore(b);
                        setStep(1);
                        setConfirm('');
                      }}
                    >
                      Restaurer…
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {data?.backups.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-ink-soft">
                  Aucune sauvegarde pour l’instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={!!restore}
        title={step === 1 ? 'Restauration guidée · 1/2' : 'Restauration guidée · 2/2'}
        message={
          step === 1 ? (
            <div className="space-y-2">
              <p>
                Tu vas remplacer <strong>toutes les données actuelles</strong> par celles du <strong>{restore && dateTime(restore.createdAt)}</strong>.
              </p>
              <ul className="list-disc pl-5 text-ink-soft">
                <li>Une sauvegarde de sécurité de l’état actuel est créée automatiquement juste avant.</li>
                <li>Tout ce qui a été fait depuis cette date sera perdu (sets, cartes, progression, comptes).</li>
                <li>Les personnes connectées devront peut-être se reconnecter, toi y compris.</li>
              </ul>
            </div>
          ) : (
            <p>Pour confirmer, saisis RESTAURER en majuscules.</p>
          )
        }
        confirmLabel={step === 1 ? 'Continuer' : 'Restaurer maintenant'}
        danger={step === 2}
        busy={busy}
        disabled={step === 2 && confirm !== 'RESTAURER'}
        onClose={() => setRestore(null)}
        onConfirm={async () => {
          if (step === 1) return setStep(2);
          setBusy(true);
          try {
            const r = await api<{ safetyBackup?: string }>(`/admin/backups/${restore!.name}/restore`, { body: { confirm } });
            toast(`Restauration terminée. Sauvegarde de sécurité : ${r.safetyBackup ?? '—'}`, 'success');
            setTimeout(() => window.location.assign('/admin/sauvegardes'), 1500);
          } catch (e) {
            toast((e as Error).message, 'error');
          } finally {
            setBusy(false);
            setRestore(null);
          }
        }}
      >
        {step === 2 && (
          <>
            <label htmlFor="restore-confirm" className="sr-only">
              Confirmation
            </label>
            <input id="restore-confirm" className="input font-mono" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          </>
        )}
      </ConfirmModal>
    </div>
  );
}
