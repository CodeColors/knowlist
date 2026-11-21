import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { tzOffset } from '../../lib/api';
import { useApi, useDocumentTitle } from '../../lib/hooks';
import { DEFAULT_OPTIONS } from '../../lib/study';
import { Icon } from '../../components/Icon';
import { EmptyState, ErrorBox, Spinner } from '../../components/ui';
import Flashcards from './Flashcards';
import { ResultScreen, useAnswerRecorder, useTolerance, type SessionResult, type StudyCard } from './shared';

interface DueCard extends StudyCard {
  setTitle: string;
  color: string;
  dueAt: string;
}

/** File « à réviser aujourd'hui » (répétition espacée), tous sets confondus ou pour un set. */
export default function Review() {
  useDocumentTitle('Révisions du jour');
  const [params] = useSearchParams();
  const setId = params.get('set');
  const [round, setRound] = useState(0);
  const { data, error, loading, reload } = useApi<{ cards: DueCard[] }>('/study/due', { tz: tzOffset(), setId: setId ?? undefined, round });
  const [result, setResult] = useState<SessionResult | null>(null);
  const [tolerance] = useTolerance();
  const { record, flush } = useAnswerRecorder('review');
  const cards = useMemo(() => (data?.cards ?? []).map((c) => ({ ...c, tags: [], progress: null })) as StudyCard[], [data]);

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Link to={setId ? `/sets/${setId}` : '/'} className="btn-icon" aria-label="Quitter">
          <Icon name="close" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold">Révisions du jour</h1>
          <p className="text-sm text-ink-soft">Répétition espacée : chaque carte revient au bon moment.</p>
        </div>
      </div>
      {result ? (
        <ResultScreen
          result={result}
          title="Révisions terminées"
          backTo="/"
          onRestart={() => {
            setResult(null);
            setRound((r) => r + 1);
          }}
        />
      ) : cards.length === 0 ? (
        <EmptyState emoji="🌤️" title="Tout est à jour !" action={<Link to="/sets" className="btn-primary">Étudier un set</Link>}>
          Aucune carte n’est à revoir aujourd’hui. Les cartes que tu étudies entrent automatiquement dans ta file de révision.
        </EmptyState>
      ) : (
        <>
          <p className="mb-3 text-center text-sm text-ink-soft">
            {cards.length} carte{cards.length > 1 ? 's' : ''} · {[...new Set(data!.cards.map((c) => c.setTitle))].join(', ')}
          </p>
          <Flashcards
            key={round}
            cards={cards}
            allCards={cards}
            options={{ ...DEFAULT_OPTIONS, shuffle: false }}
            tolerance={tolerance}
            record={record}
            onFinish={(r) => {
              flush();
              setResult(r);
            }}
          />
        </>
      )}
    </div>
  );
}
