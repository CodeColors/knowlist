import { Link } from 'react-router';
import { bytes, dateTime } from '../../lib/format';
import { useApi } from '../../lib/hooks';
import { ErrorBox, ProgressBar, Spinner } from '../../components/ui';

interface Dash {
  users: { total: number; active30d: number; loggedIn30d: number; suspended: number };
  sets: number;
  cards: number;
  setsLast30d: number;
  cardsLast30d: number;
  answers30d: number;
  storage: { database: number; uploads: number; backups: number; disk: { total: number; free: number } | null };
  lastBackup: { name: string; createdAt: string; size: number } | null;
  pendingInvitations: number;
}

export default function Dashboard() {
  const { data, error, loading, reload } = useApi<Dash>('/admin/dashboard');
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;
  const backupAgeH = data.lastBackup ? (Date.now() - new Date(data.lastBackup.createdAt).getTime()) / 3600_000 : Infinity;
  const disk = data.storage.disk;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Utilisateurs actifs (30 j)" value={data.users.active30d} sub={`${data.users.total} comptes · ${data.users.suspended} suspendus`} />
        <Tile label="Sets" value={data.sets} sub={`+${data.setsLast30d} en 30 jours`} />
        <Tile label="Cartes" value={data.cards} sub={`+${data.cardsLast30d} en 30 jours`} />
        <Tile label="Réponses (30 j)" value={data.answers30d} sub={`${data.pendingInvitations} invitation(s) en attente`} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 text-xl font-semibold">Espace disque</h2>
          {disk && (
            <>
              <ProgressBar value={disk.total - disk.free} max={disk.total} label="Espace disque utilisé" color={disk.free / disk.total < 0.1 ? 'var(--danger)' : undefined} />
              <p className="mt-1 text-sm text-ink-soft">
                {bytes(disk.free)} libres sur {bytes(disk.total)}
              </p>
            </>
          )}
          <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <div>
              <dt className="text-ink-soft">Base</dt>
              <dd className="font-semibold">{bytes(data.storage.database)}</dd>
            </div>
            <div>
              <dt className="text-ink-soft">Fichiers</dt>
              <dd className="font-semibold">{bytes(data.storage.uploads)}</dd>
            </div>
            <div>
              <dt className="text-ink-soft">Sauvegardes</dt>
              <dd className="font-semibold">{bytes(data.storage.backups)}</dd>
            </div>
          </dl>
        </section>
        <section className="card p-5">
          <h2 className="mb-3 text-xl font-semibold">Dernière sauvegarde</h2>
          {data.lastBackup ? (
            <p className={backupAgeH > 36 ? 'text-warn' : ''}>
              {backupAgeH > 36 ? '⚠ ' : '✓ '}
              {dateTime(data.lastBackup.createdAt)} · {bytes(data.lastBackup.size)}
            </p>
          ) : (
            <p className="text-warn">⚠ Aucune sauvegarde pour l’instant.</p>
          )}
          <Link to="/admin/sauvegardes" className="link mt-3 inline-block">
            Gérer les sauvegardes
          </Link>
        </section>
      </div>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="card p-4">
      <p className="text-sm font-semibold text-ink-soft">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value.toLocaleString('fr-FR')}</p>
      <p className="text-sm text-ink-soft">{sub}</p>
    </div>
  );
}
