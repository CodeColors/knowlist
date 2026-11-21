import { Link } from 'react-router';
import { tzOffset } from '../lib/api';
import { useAuth } from '../lib/auth';
import { relativeTime } from '../lib/format';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { Icon } from '../components/Icon';
import { EmptyState, ErrorBox, ProgressBar, ProgressRing, Spinner } from '../components/ui';

interface HomeData {
  dueCount: number;
  streak: number;
  todayCount: number;
  dailyGoal: number;
  recentSets: { id: number; title: string; color: string; cardCount: number; masteredCount: number; lastStudiedAt: string | null }[];
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Bonne nuit';
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

export default function Home() {
  useDocumentTitle('Accueil');
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi<HomeData>('/home', { tz: tzOffset() });

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;
  const goalDone = data.todayCount >= data.dailyGoal;

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-semibold md:text-4xl">
          {greeting()}, {user?.displayName.split(' ')[0]} <span aria-hidden="true">🌿</span>
        </h1>
        <p className="mt-1 text-ink-soft">
          {goalDone
            ? 'Objectif du jour atteint, bravo ! Tout ce que tu fais en plus est du bonus.'
            : data.todayCount > 0
              ? 'Belle lancée, continue à ton rythme.'
              : 'Quelques minutes suffisent pour avancer aujourd’hui.'}
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3" aria-label="Ta journée">
        <div className="card flex flex-col justify-between gap-4 p-5 md:col-span-1">
          <div>
            <h2 className="text-lg font-semibold">À réviser aujourd’hui</h2>
            <p className="mt-1 text-4xl font-bold text-accent">{data.dueCount}</p>
            <p className="text-ink-soft">{data.dueCount === 0 ? 'Rien d’urgent : tout est à jour.' : data.dueCount === 1 ? 'carte prête pour toi' : 'cartes prêtes pour toi'}</p>
          </div>
          {data.dueCount > 0 ? (
            <Link to="/revision" className="btn-primary">
              <Icon name="play" size={18} filled /> Réviser maintenant
            </Link>
          ) : (
            <Link to="/sets" className="btn-secondary">
              Étudier un set
            </Link>
          )}
        </div>
        <div className="card flex items-center gap-5 p-5">
          <ProgressRing value={data.todayCount} max={data.dailyGoal} label={`Objectif du jour : ${data.todayCount} sur ${data.dailyGoal} cartes`}>
            <span className="text-xl font-bold">{data.todayCount}</span>
            <span className="text-xs text-ink-soft">/ {data.dailyGoal}</span>
          </ProgressRing>
          <div>
            <h2 className="text-lg font-semibold">Objectif du jour</h2>
            <p className="text-ink-soft">
              {goalDone ? 'Atteint ✓' : `Encore ${data.dailyGoal - data.todayCount} carte${data.dailyGoal - data.todayCount > 1 ? 's' : ''}`}
            </p>
            <Link to="/profil#preferences" className="text-sm text-ink-soft underline underline-offset-2 hover:text-ink">
              Ajuster
            </Link>
          </div>
        </div>
        <div className="card flex items-center gap-4 p-5">
          <div className={`flex size-16 items-center justify-center rounded-2xl ${data.streak > 0 ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-ink-soft'}`}>
            <Icon name="flame" size={34} filled={data.streak > 0} />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Série en cours</h2>
            <p className="text-2xl font-bold">
              {data.streak} jour{data.streak > 1 ? 's' : ''}
            </p>
            <p className="text-sm text-ink-soft">{data.streak === 0 ? 'Une carte aujourd’hui pour démarrer.' : 'Chaque jour compte, sans pression.'}</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="recent-title">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="recent-title" className="text-2xl font-semibold">
            Derniers sets
          </h2>
          {data.recentSets.length > 0 && (
            <Link to="/sets" className="link">
              Tout voir
            </Link>
          )}
        </div>
        {data.recentSets.length === 0 ? (
          <EmptyState
            emoji="📒"
            title="Crée ton premier set"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link to="/sets/nouveau" className="btn-primary">
                  <Icon name="plus" size={20} /> Créer un set
                </Link>
                <Link to="/sets/nouveau?importer=1" className="btn-secondary">
                  <Icon name="upload" size={20} /> Importer une liste
                </Link>
              </div>
            }
          >
            Ajoute quelques mots et leur traduction, puis lance une session : tu seras en train de réviser en moins de trois minutes.
          </EmptyState>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.recentSets.map((s) => (
              <li key={s.id}>
                <Link to={`/sets/${s.id}`} className="card group flex h-full flex-col gap-3 p-5 transition hover:-translate-y-0.5 hover:shadow-lift">
                  <div className="h-1.5 w-12 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                  <h3 className="text-xl font-semibold break-words">{s.title}</h3>
                  <p className="text-sm text-ink-soft">
                    {s.cardCount} carte{s.cardCount > 1 ? 's' : ''} · étudié {relativeTime(s.lastStudiedAt)}
                  </p>
                  <div className="mt-auto">
                    <ProgressBar value={s.masteredCount} max={s.cardCount} label={`${s.masteredCount} cartes maîtrisées sur ${s.cardCount}`} color={s.color} />
                    <p className="mt-1 text-xs text-ink-soft">{s.masteredCount} maîtrisée{s.masteredCount > 1 ? 's' : ''}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
