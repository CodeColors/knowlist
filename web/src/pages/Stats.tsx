import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { tzOffset } from '../lib/api';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { formatDuration, MODE_INFO } from '../lib/study';
import { Icon } from '../components/Icon';
import { ErrorBox, PageHeader, ProgressRing, Spinner } from '../components/ui';

interface StatsData {
  totalCards: number;
  studiedCards: number;
  masteredCards: number;
  timeSpentMs: number;
  answers: number;
  successRate: number | null;
  streak: number;
  todayCount: number;
  dailyGoal: number;
  calendar: { date: string; count: number }[];
  perMode: { mode: string; answers: number; correct: number }[];
  hardest: { id: number; term: string; definition: string; setId: number; setTitle: string; wrong: number; correct: number; lapses: number }[];
}

const WEEKS = 26;
const DAY_LABELS = ['L', '', 'M', '', 'V', '', 'D'];

function level(count: number, max: number) {
  if (!count) return 0;
  const r = count / Math.max(max, 1);
  return r > 0.75 ? 4 : r > 0.5 ? 3 : r > 0.25 ? 2 : 1;
}

function localKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Stats() {
  useDocumentTitle('Progrès');
  const { data, error, loading, reload } = useApi<StatsData>('/stats', { tz: tzOffset() });
  const [showTable, setShowTable] = useState(false);

  const grid = useMemo(() => {
    if (!data) return null;
    const map = new Map(data.calendar.map((c) => [c.date, c.count]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dow = (today.getDay() + 6) % 7; // lundi = 0
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - dow - (WEEKS - 1) * 7);
    const weeks: { date: string; count: number; future: boolean; label: string }[][] = [];
    for (let w = 0; w < WEEKS; w++) {
      const col = [];
      for (let d = 0; d < 7; d++) {
        const day = new Date(startDate);
        day.setDate(startDate.getDate() + w * 7 + d);
        const key = localKey(day);
        col.push({
          date: key,
          count: map.get(key) ?? 0,
          future: day > today,
          label: day.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
        });
      }
      weeks.push(col);
    }
    const max = Math.max(1, ...data.calendar.map((c) => c.count));
    const activeDays = data.calendar.filter((c) => c.count > 0).length;
    return { weeks, max, activeDays };
  }, [data]);

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  if (!data || !grid) return null;

  const maxMode = Math.max(1, ...data.perMode.map((m) => m.answers));
  const modeLabel = (m: string) => (m === 'review' ? 'Révisions du jour' : MODE_INFO[m as keyof typeof MODE_INFO]?.label ?? m);
  const recent = [...data.calendar].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);

  return (
    <div className="space-y-8">
      <PageHeader title="Tes progrès" subtitle="Chaque petite séance compte. Voici le chemin parcouru." />

      <section aria-label="Chiffres clés" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Cartes maîtrisées" value={data.masteredCards.toLocaleString('fr-FR')} sub={`sur ${data.totalCards.toLocaleString('fr-FR')} cartes`} />
        <Tile label="Taux de réussite" value={data.successRate === null ? '—' : `${Math.round(data.successRate * 100)} %`} sub={`${data.answers.toLocaleString('fr-FR')} réponses`} />
        <Tile label="Temps passé" value={formatDuration(data.timeSpentMs)} sub="à étudier" />
        <Tile label="Série en cours" value={`${data.streak} j`} sub={`${grid.activeDays} jour${grid.activeDays > 1 ? 's' : ''} actif${grid.activeDays > 1 ? 's' : ''} cette année`} />
      </section>

      <section className="card p-5" aria-labelledby="goal-title">
        <div className="flex items-center gap-5">
          <ProgressRing value={data.todayCount} max={data.dailyGoal} label={`Aujourd’hui : ${data.todayCount} cartes sur un objectif de ${data.dailyGoal}`}>
            <span className="text-xl font-bold">{data.todayCount}</span>
            <span className="text-xs text-ink-soft">/ {data.dailyGoal}</span>
          </ProgressRing>
          <div>
            <h2 id="goal-title" className="text-xl font-semibold">
              Objectif du jour
            </h2>
            <p className="text-ink-soft">
              {data.todayCount >= data.dailyGoal ? 'Atteint, bravo ! 🎉' : 'Tu avances à ton rythme, sans pression.'}{' '}
              <Link to="/profil#preferences" className="underline underline-offset-2">
                Modifier l’objectif
              </Link>
            </p>
          </div>
        </div>
      </section>

      <section className="card p-5" aria-labelledby="cal-title">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="cal-title" className="text-xl font-semibold">
            Calendrier d’activité
          </h2>
          <button type="button" className="text-sm text-ink-soft underline underline-offset-2 hover:text-ink" onClick={() => setShowTable(!showTable)} aria-expanded={showTable}>
            {showTable ? 'Voir le calendrier' : 'Voir en tableau'}
          </button>
        </div>
        {showTable ? (
          <table className="w-full text-left">
            <caption className="sr-only">Cartes étudiées par jour (30 derniers jours actifs)</caption>
            <thead>
              <tr className="border-b border-line text-sm text-ink-soft">
                <th className="py-1 font-semibold">Jour</th>
                <th className="py-1 text-right font-semibold">Cartes étudiées</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr>
                  <td colSpan={2} className="py-2 text-ink-soft">
                    Aucune activité pour l’instant.
                  </td>
                </tr>
              )}
              {recent.map((r) => (
                <tr key={r.date} className="border-b border-line/60">
                  <td className="py-1">{new Date(`${r.date}T12:00:00`).toLocaleDateString('fr-FR', { dateStyle: 'full' })}</td>
                  <td className="py-1 text-right tabular-nums">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <>
            <div className="overflow-x-auto pb-1">
              <div className="flex gap-[3px]" role="img" aria-label={`Activité des ${WEEKS} dernières semaines : ${grid.activeDays} jours actifs. Utilise « Voir en tableau » pour le détail.`}>
                <div className="mr-1 flex flex-col gap-[3px] text-[10px] leading-[14px] text-ink-soft" aria-hidden="true">
                  {DAY_LABELS.map((l, i) => (
                    <span key={i} className="h-[14px]">
                      {l}
                    </span>
                  ))}
                </div>
                {grid.weeks.map((week, w) => (
                  <div key={w} className="flex flex-col gap-[3px]">
                    {week.map((d) => (
                      <span
                        key={d.date}
                        title={d.future ? undefined : `${d.label} : ${d.count} carte${d.count > 1 ? 's' : ''}`}
                        className="size-[14px] rounded-[3px] transition hover:ring-2 hover:ring-ink/40"
                        style={{ background: d.future ? 'transparent' : `var(--heat-${level(d.count, grid.max)})` }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-ink-soft" aria-hidden="true">
              Moins
              {[0, 1, 2, 3, 4].map((l) => (
                <span key={l} className="size-[12px] rounded-[3px]" style={{ background: `var(--heat-${l})` }} />
              ))}
              Plus
            </div>
          </>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5" aria-labelledby="modes-title">
          <h2 id="modes-title" className="mb-1 text-xl font-semibold">
            Réponses par mode
          </h2>
          <p className="mb-4 text-sm text-ink-soft">Nombre de réponses et taux de réussite</p>
          {data.perMode.length === 0 ? (
            <p className="text-ink-soft">Lance ta première session pour voir apparaître tes statistiques.</p>
          ) : (
            <ul className="space-y-3">
              {[...data.perMode]
                .sort((a, b) => b.answers - a.answers)
                .map((m) => (
                  <li key={m.mode} title={`${modeLabel(m.mode)} : ${m.answers} réponses, ${Math.round((m.correct / m.answers) * 100)} % de réussite`}>
                    <div className="mb-1 flex justify-between gap-2 text-sm">
                      <span className="font-semibold">{modeLabel(m.mode)}</span>
                      <span className="text-ink-soft tabular-nums">
                        {m.answers.toLocaleString('fr-FR')} · {Math.round((m.correct / m.answers) * 100)} %
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-r-[4px] bg-surface-2" aria-hidden="true">
                      <div className="h-full rounded-r-[4px] bg-sage" style={{ width: `${(m.answers / maxMode) * 100}%` }} />
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </section>

        <section className="card p-5" aria-labelledby="hard-title">
          <h2 id="hard-title" className="mb-1 text-xl font-semibold">
            Cartes les plus difficiles
          </h2>
          <p className="mb-4 text-sm text-ink-soft">Celles qui méritent un peu plus d’attention</p>
          {data.hardest.length === 0 ? (
            <p className="text-ink-soft">Aucune pour l’instant. 👏</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-ink-soft">
                  <th className="py-1 font-semibold">Carte</th>
                  <th className="py-1 text-right font-semibold">Réussite</th>
                </tr>
              </thead>
              <tbody>
                {data.hardest.map((h) => (
                  <tr key={h.id} className="border-b border-line/60 align-top">
                    <td className="py-2 pr-2">
                      <Link to={`/sets/${h.setId}#carte-${h.id}`} className="font-semibold hover:underline">
                        {h.term}
                      </Link>
                      <span className="block text-ink-soft">
                        {h.definition} · <em>{h.setTitle}</em>
                      </span>
                    </td>
                    <td className="py-2 text-right whitespace-nowrap tabular-nums">
                      {h.correct}/{h.correct + h.wrong}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {data.hardest.length > 0 && (
            <Link to="/revision" className="btn-secondary mt-4">
              <Icon name="play" size={16} filled /> Réviser maintenant
            </Link>
          )}
        </section>
      </div>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card p-4">
      <p className="text-sm font-semibold text-ink-soft">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
      <p className="text-sm text-ink-soft">{sub}</p>
    </div>
  );
}
