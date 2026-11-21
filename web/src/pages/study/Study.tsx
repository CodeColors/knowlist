import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useApi, useDocumentTitle } from '../../lib/hooks';
import { loadOptions, MODE_INFO, saveOptions, selectCards, type StudyOptions } from '../../lib/study';
import type { SetDetail, StudyMode } from '../../lib/types';
import { Icon } from '../../components/Icon';
import { ErrorBox, Spinner } from '../../components/ui';
import { OptionsModal, ResultScreen, useAnswerRecorder, useTolerance, type ModeProps, type SessionResult, type StudyCard } from './shared';

const MODES: Record<string, React.LazyExoticComponent<(p: ModeProps) => React.ReactNode>> = {
  flashcards: lazy(() => import('./Flashcards')),
  learn: lazy(() => import('./Learn')),
  test: lazy(() => import('./Test')),
  match: lazy(() => import('./Match')),
  write: lazy(() => import('./Write')),
  listen: lazy(() => import('./Listen')),
};

export default function Study() {
  const { id, mode = 'flashcards' } = useParams();
  const { data, error, loading, reload } = useApi<SetDetail>(`/sets/${id}`);
  const info = MODE_INFO[mode as keyof typeof MODE_INFO];
  useDocumentTitle(`${info?.label ?? 'Étude'} · ${data?.set.title ?? ''}`);
  const [options, setOptionsState] = useState<StudyOptions>(() => loadOptions(mode));
  const [tolerance, setTolerance] = useTolerance();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [session, setSession] = useState(0);
  const [override, setOverride] = useState<StudyCard[] | null>(null);
  const { record, flush } = useAnswerRecorder(mode as StudyMode);

  const allCards: StudyCard[] = useMemo(
    () => (data ? data.cards.map((c) => ({ ...c, termLang: data.set.termLang, defLang: data.set.defLang, setId: data.set.id })) : []),
    [data],
  );
  const cards = useMemo(() => override ?? (selectCards(allCards, options) as StudyCard[]), [allCards, options, override, session]); // eslint-disable-line react-hooks/exhaustive-deps

  const setOptions = (o: StudyOptions) => {
    setOptionsState(o);
    saveOptions(mode, o);
    setOverride(null);
    setResult(null);
    setSession((s) => s + 1);
  };

  if (!info) return <ErrorBox error={{ message: 'Mode d’étude inconnu.' }} />;
  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;
  const Mode = MODES[mode];
  const counts = {
    all: allCards.length,
    starred: allCards.filter((c) => c.starred).length,
    difficult: allCards.filter((c) => c.progress?.difficult).length,
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Link to={`/sets/${id}`} className="btn-icon" aria-label="Quitter la session">
          <Icon name="close" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">
            <span aria-hidden="true">{info.emoji}</span> {info.label}
          </h1>
          <p className="truncate text-sm text-ink-soft">{data.set.title}</p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => setOptionsOpen(true)}>
          <Icon name="settings" size={20} /> <span className="hidden sm:inline">Options</span>
        </button>
      </div>

      {cards.length === 0 ? (
        <div className="card mx-auto max-w-lg p-8 text-center">
          <p className="text-lg font-semibold">Aucune carte à étudier avec ces options.</p>
          <p className="mt-2 text-ink-soft">
            {options.filter === 'starred' ? 'Marque des cartes d’une étoile, ou choisis « Toutes ».' : options.filter === 'difficult' ? 'Aucune carte difficile pour l’instant, bravo !' : 'Ajoute des cartes à ce set.'}
          </p>
          <button type="button" className="btn-primary mt-4" onClick={() => setOptions({ ...options, filter: 'all' })}>
            Étudier toutes les cartes
          </button>
        </div>
      ) : mode === 'match' && cards.length < 2 ? (
        <p className="card p-6 text-center">Il faut au moins deux cartes pour jouer à l’association.</p>
      ) : result ? (
        <ResultScreen
          result={result}
          backTo={`/sets/${id}`}
          onRestart={() => {
            setOverride(null);
            setResult(null);
            setSession((s) => s + 1);
          }}
          onRetryMissed={
            mode !== 'match' && mode !== 'test'
              ? () => {
                  setOverride(result.missed);
                  setResult(null);
                  setSession((s) => s + 1);
                }
              : undefined
          }
        />
      ) : (
        <Suspense fallback={<Spinner />}>
          <Mode
            key={session}
            cards={cards}
            allCards={allCards}
            options={options}
            tolerance={tolerance}
            setId={data.set.id}
            record={record}
            onFinish={(r) => {
              flush();
              setResult(r);
            }}
          />
        </Suspense>
      )}

      <OptionsModal
        open={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        options={options}
        onChange={setOptions}
        tolerance={tolerance}
        onTolerance={setTolerance}
        mode={mode}
        counts={counts}
      />
    </div>
  );
}
