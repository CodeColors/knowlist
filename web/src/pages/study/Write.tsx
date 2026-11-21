import { useMemo, useRef, useState } from 'react';
import { sideFor } from '../../lib/study';
import { ProgressBar } from '../../components/ui';
import { speakCard, WrittenQuestion, type ModeProps, type StudyCard } from './shared';

export default function Write({ cards, options, tolerance, record, onFinish }: ModeProps) {
  const sides = useMemo(() => cards.map((c) => sideFor(c, options.direction, c)), [cards, options.direction]);
  const [index, setIndex] = useState(0);
  const results = useRef<{ card: StudyCard; ok: boolean }[]>([]);
  const start = useRef(Date.now());
  const shownAt = useRef(Date.now());
  const card = cards[index];
  const side = sides[index];

  const handle = (ok: boolean) => {
    record(card.id, ok, Date.now() - shownAt.current);
    results.current.push({ card, ok });
    if (index + 1 >= cards.length) {
      const r = results.current;
      onFinish({ correct: r.filter((x) => x.ok).length, total: r.length, durationMs: Date.now() - start.current, missed: r.filter((x) => !x.ok).map((x) => x.card) });
    } else {
      setIndex(index + 1);
      shownAt.current = Date.now();
    }
  };

  if (!card) return null;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center gap-3">
        <ProgressBar value={index} max={cards.length} label={`Question ${index + 1} sur ${cards.length}`} />
        <span className="shrink-0 text-sm text-ink-soft">
          {index + 1} / {cards.length}
        </span>
      </div>
      <div key={index} className="pop-in">
        <WrittenQuestion
          prompt={side.prompt}
          promptLang={side.promptLang}
          answer={side.answer}
          answerLang={side.answerLang}
          tolerance={tolerance}
          onResult={handle}
          image={side.showsTerm ? null : card.image}
          speakPrompt={() => void speakCard(card, side.showsTerm)}
          label={side.showsTerm ? 'Écris la définition' : 'Écris le terme'}
        />
      </div>
    </div>
  );
}
