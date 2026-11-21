import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { checkAnswer, DEFAULT_TOLERANCE, type CheckResult } from '../../lib/answer';
import { useAuth } from '../../lib/auth';
import { enqueueAnswers, flushQueue } from '../../lib/offline';
import { formatDuration, type StudyOptions } from '../../lib/study';
import { playCard } from '../../lib/tts';
import { mediaUrl } from '../../lib/api';
import type { Card, StudyMode, Tolerance } from '../../lib/types';
import { Celebration } from '../../components/Celebration';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { Toggle } from '../../components/ui';

export interface StudyCard extends Card {
  termLang: string;
  defLang: string;
  setId?: number;
  setTitle?: string;
}

export interface ModeProps {
  cards: StudyCard[];
  allCards: StudyCard[];
  options: StudyOptions;
  tolerance: Tolerance;
  setId?: number;
  record: (cardId: number, correct: boolean, durationMs: number) => void;
  onFinish: (r: SessionResult) => void;
}

export interface SessionResult {
  correct: number;
  total: number;
  durationMs: number;
  missed: StudyCard[];
  extra?: ReactNode;
}

/** Enregistrement des réponses : file locale immédiate, envoi groupé (5 réponses ou 1,5 s). */
export function useAnswerRecorder(mode: StudyMode) {
  const count = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    count.current = 0;
    void flushQueue();
  }, []);
  const record = useCallback(
    (cardId: number, correct: boolean, durationMs: number) => {
      enqueueAnswers([{ cardId, correct, mode, durationMs: Math.round(Math.min(durationMs, 600_000)), at: new Date().toISOString() }]);
      if (++count.current >= 5) flush();
      else {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(flush, 1500);
      }
    },
    [mode, flush],
  );
  useEffect(() => () => flush(), [flush]);
  return { record, flush };
}

export function useTolerance(): [Tolerance, (t: Tolerance) => void] {
  const { user, updatePrefs } = useAuth();
  const t = user?.prefs.writeTolerance ?? DEFAULT_TOLERANCE;
  return [t, (n) => void updatePrefs({ writeTolerance: n })];
}

export function ResultScreen({ result, onRestart, onRetryMissed, backTo, title }: { result: SessionResult; onRestart: () => void; onRetryMissed?: () => void; backTo: string; title?: string }) {
  const pct = result.total ? Math.round((result.correct / result.total) * 100) : 0;
  const message =
    pct === 100 ? 'Sans faute, impressionnant !' : pct >= 80 ? 'Très beau travail !' : pct >= 50 ? 'Bien joué, tu progresses.' : 'Chaque révision compte : les cartes ratées reviendront bientôt.';
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  return (
    <div className="pop-in mx-auto max-w-xl text-center">
      <Celebration fire={pct >= 50} />
      <p className="text-6xl" aria-hidden="true">
        {pct === 100 ? '🏆' : pct >= 80 ? '🌟' : pct >= 50 ? '🌿' : '🌱'}
      </p>
      <h2 ref={headingRef} tabIndex={-1} className="mt-3 text-3xl font-semibold">
        {title ?? 'Session terminée'}
      </h2>
      <p className="mt-2 text-lg text-ink-soft">{message}</p>
      <div className="card mt-6 grid grid-cols-3 divide-x divide-line p-4">
        <div>
          <p className="text-3xl font-bold text-accent">{pct} %</p>
          <p className="text-sm text-ink-soft">réussite</p>
        </div>
        <div>
          <p className="text-3xl font-bold">
            {result.correct}/{result.total}
          </p>
          <p className="text-sm text-ink-soft">bonnes réponses</p>
        </div>
        <div>
          <p className="text-3xl font-bold">{formatDuration(result.durationMs)}</p>
          <p className="text-sm text-ink-soft">durée</p>
        </div>
      </div>
      {result.extra}
      {result.missed.length > 0 && (
        <div className="card mt-6 p-4 text-left">
          <h3 className="mb-2 font-semibold">À retravailler</h3>
          <ul className="divide-y divide-line">
            {result.missed.map((c) => (
              <li key={c.id} className="grid grid-cols-2 gap-3 py-2">
                <span className="font-semibold" lang={c.termLang}>
                  {c.term}
                </span>
                <span lang={c.defLang}>{c.definition}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {onRetryMissed && result.missed.length > 0 && (
          <button type="button" className="btn-primary" onClick={onRetryMissed}>
            Revoir les {result.missed.length} carte{result.missed.length > 1 ? 's' : ''} ratée{result.missed.length > 1 ? 's' : ''}
          </button>
        )}
        <button type="button" className={onRetryMissed && result.missed.length ? 'btn-secondary' : 'btn-primary'} onClick={onRestart}>
          Recommencer
        </button>
        <Link to={backTo} className="btn-ghost">
          Retour
        </Link>
      </div>
    </div>
  );
}

/** Champ de réponse écrite avec vérification tolérante et « J'avais bon ». */
export function WrittenQuestion({
  prompt,
  promptLang,
  answer,
  answerLang,
  tolerance,
  onResult,
  hint,
  image,
  speakPrompt,
  label = 'Ta réponse',
}: {
  prompt: ReactNode;
  promptLang?: string;
  answer: string;
  answerLang: string;
  tolerance: Tolerance;
  onResult: (correct: boolean) => void;
  hint?: ReactNode;
  image?: string | null;
  speakPrompt?: () => void;
  label?: string;
}) {
  const [value, setValue] = useState('');
  const [result, setResult] = useState<CheckResult | null>(null);
  const [overridden, setOverridden] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    if (result) nextRef.current?.focus();
  }, [result]);

  const submit = () => {
    if (result) return;
    setResult(checkAnswer(value, answer, tolerance));
  };
  const next = () => {
    if (!result) return;
    onResult(result.correct || overridden);
  };

  return (
    <div className="space-y-4">
      <div className="card p-6 text-center">
        {image && <img src={mediaUrl(image)} alt="" className="mx-auto mb-3 max-h-40 rounded-xl" />}
        <div className="text-2xl font-semibold break-words whitespace-pre-line" lang={promptLang}>
          {prompt}
        </div>
        {speakPrompt && (
          <button type="button" className="btn-ghost mt-2" onClick={speakPrompt}>
            <Icon name="volume" size={20} /> Écouter
          </button>
        )}
        {hint}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (result) next();
          else submit();
        }}
      >
        <label htmlFor="answer-input" className="label">
          {label}
        </label>
        <div className="flex gap-2">
          <input
            id="answer-input"
            ref={inputRef}
            className={`input text-lg ${result ? (result.correct ? 'border-ok' : 'border-danger') : ''}`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            readOnly={!!result}
            lang={answerLang}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="done"
          />
          {!result && (
            <button type="submit" className="btn-primary">
              Valider
            </button>
          )}
        </div>
        {!result && (
          <button type="button" className="mt-2 text-sm text-ink-soft underline underline-offset-2 hover:text-ink" onClick={() => setResult(checkAnswer('', answer, tolerance))}>
            Je ne sais pas
          </button>
        )}
      </form>
      <div aria-live="assertive">
        {result && (
          <div className={`pop-in rounded-2xl p-4 ${result.correct || overridden ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger'}`}>
            <p className="text-lg font-semibold">
              {result.correct ? (result.approximate ? 'Correct, à un détail près !' : 'Bonne réponse !') : overridden ? 'D’accord, on la compte juste.' : 'Pas tout à fait…'}
            </p>
            {(!result.correct || result.approximate) && (
              <p className="mt-1 text-ink">
                Réponse attendue : <strong lang={answerLang}>{answer}</strong>
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button ref={nextRef} type="button" className="btn-primary" onClick={next}>
                Continuer <span className="text-sm opacity-80">(Entrée)</span>
              </button>
              {!result.correct && !overridden && value.trim() && (
                <button type="button" className="btn-secondary" onClick={() => setOverridden(true)}>
                  J’avais bon
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Question à choix multiple (touches 1-4). */
export function ChoiceQuestion({
  prompt,
  promptLang,
  choices,
  correctIndex,
  answerLang,
  onResult,
  image,
  speakPrompt,
}: {
  prompt: ReactNode;
  promptLang?: string;
  choices: string[];
  correctIndex: number;
  answerLang?: string;
  onResult: (correct: boolean) => void;
  image?: string | null;
  speakPrompt?: () => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const pick = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    if (i === correctIndex) setTimeout(() => onResult(true), 700);
  };
  useEffect(() => {
    if (picked !== null && picked !== correctIndex) nextRef.current?.focus();
  }, [picked, correctIndex]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const n = Number(e.key);
      if (n >= 1 && n <= choices.length) pick(n - 1);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
  return (
    <div className="space-y-4">
      <div className="card p-6 text-center">
        {image && <img src={mediaUrl(image)} alt="" className="mx-auto mb-3 max-h-40 rounded-xl" />}
        <div className="text-2xl font-semibold break-words whitespace-pre-line" lang={promptLang}>
          {prompt}
        </div>
        {speakPrompt && (
          <button type="button" className="btn-ghost mt-2" onClick={speakPrompt}>
            <Icon name="volume" size={20} /> Écouter
          </button>
        )}
      </div>
      <p className="label" id="choices-label">
        Choisis la bonne réponse
      </p>
      <ul className="grid gap-2 sm:grid-cols-2" aria-labelledby="choices-label">
        {choices.map((c, i) => {
          const state = picked === null ? '' : i === correctIndex ? 'border-ok bg-ok-soft text-ok' : i === picked ? 'border-danger bg-danger-soft text-danger shake' : 'opacity-60';
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => pick(i)}
                disabled={picked !== null}
                lang={answerLang}
                className={`card flex min-h-14 w-full items-center gap-3 p-4 text-left transition hover:border-accent disabled:cursor-default ${state}`}
              >
                <kbd className="hidden size-7 shrink-0 items-center justify-center rounded-md border border-line text-sm text-ink-soft sm:inline-flex">{i + 1}</kbd>
                <span className="break-words whitespace-pre-line">{c}</span>
                {picked !== null && i === correctIndex && <span className="sr-only">(bonne réponse)</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <div aria-live="assertive">
        {picked !== null && picked === correctIndex && <p className="font-semibold text-ok">Bonne réponse !</p>}
        {picked !== null && picked !== correctIndex && (
          <div className="pop-in rounded-2xl bg-danger-soft p-4 text-danger">
            <p className="font-semibold">Ce n’est pas ça. La bonne réponse est surlignée.</p>
            <button ref={nextRef} type="button" className="btn-primary mt-3" onClick={() => onResult(false)}>
              Continuer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function speakCard(card: StudyCard, showsTerm: boolean) {
  return playCard(showsTerm ? card.term : card.definition, showsTerm ? card.termLang : card.defLang, showsTerm ? mediaUrl(card.audio) : undefined);
}

export function OptionsModal({
  open,
  onClose,
  options,
  onChange,
  tolerance,
  onTolerance,
  mode,
  counts,
}: {
  open: boolean;
  onClose: () => void;
  options: StudyOptions;
  onChange: (o: StudyOptions) => void;
  tolerance: Tolerance;
  onTolerance: (t: Tolerance) => void;
  mode: string;
  counts: { all: number; starred: number; difficult: number };
}) {
  const showTol = ['learn', 'write', 'listen', 'test'].includes(mode);
  return (
    <Modal open={open} onClose={onClose} title="Options d’étude" footer={<button type="button" className="btn-primary" onClick={onClose}>Appliquer</button>}>
      <div className="space-y-5">
        <fieldset>
          <legend className="label">{mode === 'listen' ? 'Ce que tu entends' : 'Ce qui est affiché'}</legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['term', mode === 'listen' ? 'Le terme' : 'Terme → définition'],
                ['definition', mode === 'listen' ? 'La définition' : 'Définition → terme'],
                ['mixed', 'Mélangé'],
              ] as const
            ).map(([v, l]) => (
              <label key={v} className={`chip cursor-pointer ${options.direction === v ? 'border-accent bg-accent-soft text-accent' : ''}`}>
                <input type="radio" name="dir" className="sr-only" checked={options.direction === v} onChange={() => onChange({ ...options, direction: v })} />
                {l}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="label">Cartes</legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['all', `Toutes (${counts.all})`],
                ['starred', `Étoilées (${counts.starred})`],
                ['difficult', `Difficiles (${counts.difficult})`],
              ] as const
            ).map(([v, l]) => (
              <label key={v} className={`chip cursor-pointer ${options.filter === v ? 'border-accent bg-accent-soft text-accent' : ''}`}>
                <input type="radio" name="filter" className="sr-only" checked={options.filter === v} onChange={() => onChange({ ...options, filter: v })} />
                {l}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="opt-count" className="label">
            Nombre de {mode === 'match' ? 'paires' : 'questions'} {mode !== 'match' && '(0 = toutes)'}
          </label>
          <input
            id="opt-count"
            type="number"
            min={0}
            max={500}
            className="input w-32"
            value={options.count}
            onChange={(e) => onChange({ ...options, count: Math.max(0, Math.min(500, Number(e.target.value) || 0)) })}
          />
        </div>
        <Toggle id="opt-shuffle" label="Mélanger les cartes" checked={options.shuffle} onChange={(v) => onChange({ ...options, shuffle: v })} />
        {showTol && (
          <fieldset className="border-t border-line pt-3">
            <legend className="label">Tolérance des réponses écrites</legend>
            <Toggle id="tol-case" label="Ignorer les majuscules" checked={tolerance.case} onChange={(v) => onTolerance({ ...tolerance, case: v })} />
            <Toggle id="tol-acc" label="Ignorer les accents" checked={tolerance.accents} onChange={(v) => onTolerance({ ...tolerance, accents: v })} />
            <Toggle id="tol-typo" label="Accepter les fautes de frappe mineures" checked={tolerance.typos} onChange={(v) => onTolerance({ ...tolerance, typos: v })} />
            <Toggle id="tol-punct" label="Ignorer la ponctuation" checked={tolerance.punctuation} onChange={(v) => onTolerance({ ...tolerance, punctuation: v })} />
          </fieldset>
        )}
      </div>
    </Modal>
  );
}
