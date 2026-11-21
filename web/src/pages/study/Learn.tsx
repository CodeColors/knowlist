import { useMemo, useRef, useState } from 'react';
import { distractors, shuffle, sideFor, type Side } from '../../lib/study';
import { ProgressBar } from '../../components/ui';
import { ChoiceQuestion, speakCard, WrittenQuestion, type ModeProps, type StudyCard } from './shared';

interface Item {
  card: StudyCard;
  /** 0 = QCM, 1 = saisie, 2 = acquise */
  stage: number;
  misses: number;
}

const ROUND = 7;

/**
 * Parcours adaptatif : chaque carte passe par un QCM puis une saisie.
 * Une erreur fait revenir la carte deux ou trois questions plus tard (et la ramène au QCM si elle échoue à l'écrit deux fois).
 */
export default function Learn({ cards, allCards, options, tolerance, record, onFinish }: ModeProps) {
  const canChoose = useMemo(() => new Set(allCards.map((c) => c.definition.trim())).size >= 2, [allCards]);
  const [items, setItems] = useState<Item[]>(() => cards.map((card) => ({ card, stage: canChoose ? 0 : 1, misses: 0 })));
  const [queue, setQueue] = useState<number[]>(() => items.slice(0, ROUND).map((_, i) => i));
  const [nextFresh, setNextFresh] = useState(Math.min(ROUND, cards.length));
  const [qid, setQid] = useState(0);
  const start = useRef(Date.now());
  const shownAt = useRef(Date.now());
  const firstTry = useRef(new Map<number, boolean>());

  const currentIdx = queue[0];
  const current = items[currentIdx];
  const side: Side | null = useMemo(() => (current ? sideFor(current.card, options.direction, current.card) : null), [current, options.direction, qid]); // eslint-disable-line react-hooks/exhaustive-deps

  const choices = useMemo(() => {
    if (!current || !side || current.stage !== 0) return null;
    const field = side.showsTerm ? 'definition' : 'term';
    const wrong = distractors(allCards, current.card, field, 3);
    const all = shuffle([side.answer, ...wrong]);
    return { list: all, correct: all.indexOf(side.answer) };
  }, [current, side, allCards]);

  const done = items.filter((i) => i.stage >= 2).length;

  const handle = (correct: boolean) => {
    if (!current) return;
    record(current.card.id, correct, Date.now() - shownAt.current);
    if (!firstTry.current.has(current.card.id)) firstTry.current.set(current.card.id, correct);
    const updated = [...items];
    const it = { ...updated[currentIdx] };
    if (correct) it.stage += 1;
    else {
      it.misses += 1;
      if (it.stage === 1 && it.misses >= 2 && canChoose) it.stage = 0;
    }
    updated[currentIdx] = it;
    let q = queue.slice(1);
    if (it.stage < 2) {
      const pos = correct ? q.length : Math.min(q.length, 2 + Math.floor(Math.random() * 2));
      q = [...q.slice(0, pos), currentIdx, ...q.slice(pos)];
    }
    let fresh = nextFresh;
    while (q.length < ROUND && fresh < updated.length) q.push(fresh++);
    setItems(updated);
    setNextFresh(fresh);
    if (!q.length) {
      const firsts = [...firstTry.current.values()];
      onFinish({
        correct: firsts.filter(Boolean).length,
        total: firsts.length,
        durationMs: Date.now() - start.current,
        missed: updated.filter((i) => i.misses > 0).map((i) => i.card),
        extra: <p className="mt-4 text-ink-soft">Toutes les cartes ont été réussies en QCM puis à l’écrit. 🌱 → 🌳</p>,
      });
      return;
    }
    setQueue(q);
    setQid((n) => n + 1);
    shownAt.current = Date.now();
  };

  if (!current || !side) return null;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center gap-3">
        <ProgressBar value={done} max={items.length} label={`${done} cartes acquises sur ${items.length}`} />
        <span className="shrink-0 text-sm text-ink-soft">
          {done} / {items.length} acquises
        </span>
      </div>
      <p className="mb-2 text-sm font-semibold text-ink-soft">
        {current.stage === 0 ? 'Étape 1 · Reconnaître' : 'Étape 2 · Retrouver de mémoire'}
        {current.misses > 0 && ' · on retente !'}
      </p>
      <div key={qid} className="pop-in">
        {current.stage === 0 && choices ? (
          <ChoiceQuestion
            prompt={side.prompt}
            promptLang={side.promptLang}
            choices={choices.list}
            correctIndex={choices.correct}
            answerLang={side.answerLang}
            onResult={handle}
            image={side.showsTerm ? null : current.card.image}
            speakPrompt={() => void speakCard(current.card, side.showsTerm)}
          />
        ) : (
          <WrittenQuestion
            prompt={side.prompt}
            promptLang={side.promptLang}
            answer={side.answer}
            answerLang={side.answerLang}
            tolerance={tolerance}
            onResult={handle}
            image={side.showsTerm ? null : current.card.image}
            speakPrompt={() => void speakCard(current.card, side.showsTerm)}
          />
        )}
      </div>
    </div>
  );
}
