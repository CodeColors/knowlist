import { useMemo, useRef, useState } from 'react';
import { checkAnswer } from '../../lib/answer';
import { distractors, shuffle, sideFor, type Side } from '../../lib/study';
import { type ModeProps, type StudyCard } from './shared';

type Q =
  | { kind: 'tf'; card: StudyCard; side: Side; shown: string; isTrue: boolean }
  | { kind: 'mcq'; card: StudyCard; side: Side; choices: string[]; correct: number }
  | { kind: 'written'; card: StudyCard; side: Side }
  | { kind: 'match'; cards: StudyCard[]; terms: string[]; defs: string[] };

function buildTest(cards: StudyCard[], all: StudyCard[], dir: ModeProps['options']['direction']): Q[] {
  const pool = [...cards];
  const qs: Q[] = [];
  const distinct = new Set(all.map((c) => c.definition.trim())).size;
  // Un bloc d'association si assez de cartes.
  const matchSize = pool.length >= 8 ? 5 : pool.length >= 5 ? 4 : 0;
  const matchCards = matchSize ? pool.splice(pool.length - matchSize, matchSize) : [];
  const kinds: ('tf' | 'mcq' | 'written')[] = ['written', 'mcq', 'tf'];
  pool.forEach((card, i) => {
    const side = sideFor(card, dir, card);
    let kind = kinds[i % 3];
    if (kind !== 'written' && distinct < 2) kind = 'written';
    if (kind === 'tf') {
      const isTrue = Math.random() < 0.5;
      const wrong = distractors(all, card, side.showsTerm ? 'definition' : 'term', 1)[0];
      qs.push({ kind, card, side, isTrue: isTrue || !wrong, shown: isTrue || !wrong ? side.answer : wrong });
    } else if (kind === 'mcq') {
      const choices = shuffle([side.answer, ...distractors(all, card, side.showsTerm ? 'definition' : 'term', 3)]);
      qs.push({ kind, card, side, choices, correct: choices.indexOf(side.answer) });
    } else qs.push({ kind, card, side });
  });
  const ordered = shuffle(qs);
  if (matchCards.length) ordered.push({ kind: 'match', cards: matchCards, terms: matchCards.map((c) => c.term), defs: shuffle(matchCards.map((c) => c.definition)) });
  return ordered;
}

export default function Test({ cards, allCards, options, tolerance, record, onFinish }: ModeProps) {
  const count = options.count || Math.min(20, cards.length);
  const questions = useMemo(() => buildTest(cards.slice(0, count), allCards, options.direction), [cards, allCards, options.direction, count]);
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const [graded, setGraded] = useState<null | { perQuestion: boolean[][]; score: number; total: number }>(null);
  const start = useRef(Date.now());
  const set = (i: number, v: any) => setAnswers((a) => ({ ...a, [i]: v }));

  const unanswered = questions.filter((q, i) => (q.kind === 'match' ? Object.keys(answers[i] ?? {}).length < q.cards.length : answers[i] === undefined || answers[i] === '')).length;

  const grade = () => {
    const per: boolean[][] = [];
    const elapsed = Date.now() - start.current;
    const perCardMs = elapsed / Math.max(1, cards.length);
    const missed: StudyCard[] = [];
    questions.forEach((q, i) => {
      const a = answers[i];
      let res: boolean[];
      if (q.kind === 'tf') res = [a === q.isTrue];
      else if (q.kind === 'mcq') res = [a === q.correct];
      else if (q.kind === 'written') res = [checkAnswer(a ?? '', q.side.answer, tolerance).correct];
      else res = q.cards.map((c, k) => (a ?? {})[k] === c.definition);
      per.push(res);
      const cs = q.kind === 'match' ? q.cards : [q.card];
      cs.forEach((c, k) => {
        record(c.id, res[k], perCardMs);
        if (!res[k]) missed.push(c);
      });
    });
    const flat = per.flat();
    setGraded({ perQuestion: per, score: flat.filter(Boolean).length, total: flat.length });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return { flat, missed, elapsed };
  };

  if (!questions.length) return null;

  return (
    <div className="mx-auto max-w-2xl">
      {graded && (
        <div className="card mb-6 p-5 text-center" role="status">
          <p className="text-4xl font-bold text-accent">{Math.round((graded.score / graded.total) * 100)} %</p>
          <p className="text-ink-soft">
            {graded.score} bonne{graded.score > 1 ? 's' : ''} réponse{graded.score > 1 ? 's' : ''} sur {graded.total}. Les corrections sont indiquées ci-dessous.
          </p>
          <button
            type="button"
            className="btn-primary mt-3"
            onClick={() => {
              const missed: StudyCard[] = [];
              questions.forEach((q, i) => {
                const cs = q.kind === 'match' ? q.cards : [q.card];
                cs.forEach((c, k) => {
                  if (!graded.perQuestion[i][k]) missed.push(c);
                });
              });
              onFinish({ correct: graded.score, total: graded.total, durationMs: Date.now() - start.current, missed });
            }}
          >
            Voir le bilan
          </button>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!graded) grade();
        }}
        className="space-y-5"
      >
        {questions.map((q, i) => {
          const ok = graded?.perQuestion[i];
          const status = ok ? (ok.every(Boolean) ? 'border-ok' : 'border-danger') : '';
          return (
            <fieldset key={i} className={`card border-2 p-5 ${status}`} disabled={!!graded}>
              <legend className="sr-only">Question {i + 1}</legend>
              <p className="mb-2 text-sm font-semibold text-ink-soft">
                {i + 1}. {q.kind === 'tf' ? 'Vrai ou faux ?' : q.kind === 'mcq' ? 'Choix multiple' : q.kind === 'written' ? 'Réponse écrite' : 'Associe chaque terme à sa définition'}
              </p>
              {q.kind !== 'match' && (
                <p className="mb-3 text-xl font-semibold break-words whitespace-pre-line" lang={q.side.promptLang}>
                  {q.side.prompt}
                </p>
              )}
              {q.kind === 'tf' && (
                <>
                  <p className="mb-3 rounded-xl bg-surface-2 p-3 break-words whitespace-pre-line" lang={q.side.answerLang}>
                    {q.shown}
                  </p>
                  <div className="flex gap-2">
                    {[true, false].map((v) => (
                      <label key={String(v)} className={`chip min-h-11 cursor-pointer px-5 ${answers[i] === v ? 'border-accent bg-accent-soft text-accent' : ''}`}>
                        <input type="radio" name={`q${i}`} className="sr-only" checked={answers[i] === v} onChange={() => set(i, v)} />
                        {v ? 'Vrai' : 'Faux'}
                      </label>
                    ))}
                  </div>
                </>
              )}
              {q.kind === 'mcq' && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {q.choices.map((c, k) => (
                    <label
                      key={k}
                      className={`card flex min-h-12 cursor-pointer items-center gap-2 p-3 ${answers[i] === k ? 'border-accent bg-accent-soft' : ''} ${graded && k === q.correct ? 'border-ok bg-ok-soft' : ''}`}
                    >
                      <input type="radio" name={`q${i}`} checked={answers[i] === k} onChange={() => set(i, k)} className="accent-[var(--accent)]" />
                      <span className="break-words whitespace-pre-line" lang={q.side.answerLang}>
                        {c}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {q.kind === 'written' && (
                <>
                  <label htmlFor={`q${i}-input`} className="sr-only">
                    Ta réponse
                  </label>
                  <input id={`q${i}-input`} className="input" value={answers[i] ?? ''} onChange={(e) => set(i, e.target.value)} autoComplete="off" spellCheck={false} lang={q.side.answerLang} />
                </>
              )}
              {q.kind === 'match' && (
                <ul className="space-y-2">
                  {q.terms.map((t, k) => (
                    <li key={k} className="grid items-center gap-2 sm:grid-cols-2">
                      <label htmlFor={`q${i}-${k}`} className="font-semibold" lang={q.cards[k].termLang}>
                        {t}
                      </label>
                      <select
                        id={`q${i}-${k}`}
                        className={`input ${graded ? (graded.perQuestion[i][k] ? 'border-ok' : 'border-danger') : ''}`}
                        value={(answers[i] ?? {})[k] ?? ''}
                        onChange={(e) => set(i, { ...(answers[i] ?? {}), [k]: e.target.value })}
                      >
                        <option value="">Choisir…</option>
                        {q.defs.map((d) => (
                          <option key={d} value={d}>
                            {d.length > 80 ? `${d.slice(0, 80)}…` : d}
                          </option>
                        ))}
                      </select>
                      {graded && !graded.perQuestion[i][k] && <p className="text-sm text-danger sm:col-span-2">Bonne réponse : {q.cards[k].definition}</p>}
                    </li>
                  ))}
                </ul>
              )}
              {graded && q.kind !== 'match' && !ok?.[0] && (
                <p className="mt-3 text-danger">
                  {q.kind === 'tf' ? `C’était ${q.isTrue ? 'vrai' : 'faux'}. ` : ''}Bonne réponse : <strong lang={q.side.answerLang}>{q.side.answer}</strong>
                </p>
              )}
              {graded && ok?.every(Boolean) && <p className="mt-3 font-semibold text-ok">✓ Correct</p>}
            </fieldset>
          );
        })}
        {!graded && (
          <div className="sticky bottom-20 z-10 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-lift backdrop-blur md:bottom-4">
            <span className="text-sm text-ink-soft">{unanswered ? `${unanswered} question${unanswered > 1 ? 's' : ''} sans réponse` : 'Tout est rempli !'}</span>
            <button type="submit" className="btn-primary">
              Corriger
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
