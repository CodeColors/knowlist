import { useEffect, useMemo, useRef, useState } from 'react';
import { api, mediaUrl } from '../../lib/api';
import { useHotkeys, useSwipe } from '../../lib/hooks';
import { sideFor } from '../../lib/study';
import { Icon } from '../../components/Icon';
import { ProgressBar } from '../../components/ui';
import { speakCard, type ModeProps, type StudyCard } from './shared';

export default function Flashcards({ cards, options, record, onFinish }: ModeProps) {
  const sides = useMemo(() => cards.map((c) => sideFor(c, options.direction, c)), [cards, options.direction]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState<{ card: StudyCard; known: boolean }[]>([]);
  const [starred, setStarred] = useState<Record<number, boolean>>(() => Object.fromEntries(cards.map((c) => [c.id, c.starred])));
  const [anim, setAnim] = useState<'left' | 'right' | null>(null);
  const shownAt = useRef(Date.now());
  const start = useRef(Date.now());
  const card = cards[index];
  const side = sides[index];

  useEffect(() => {
    shownAt.current = Date.now();
    setFlipped(false);
  }, [index]);

  // Préchargement de l'image de la carte suivante (affichage instantané).
  useEffect(() => {
    const next = cards[index + 1];
    if (next?.image) new Image().src = mediaUrl(next.image)!;
  }, [index, cards]);

  const answer = (known: boolean) => {
    if (!card || anim) return;
    record(card.id, known, Date.now() - shownAt.current);
    const nextResults = [...results, { card, known }];
    setResults(nextResults);
    setAnim(known ? 'right' : 'left');
    setTimeout(() => {
      setAnim(null);
      if (index + 1 >= cards.length) {
        const correct = nextResults.filter((r) => r.known).length;
        onFinish({ correct, total: nextResults.length, durationMs: Date.now() - start.current, missed: nextResults.filter((r) => !r.known).map((r) => r.card) });
      } else setIndex(index + 1);
    }, 180);
  };

  const toggleStar = async () => {
    if (!card) return;
    const v = !starred[card.id];
    setStarred((s) => ({ ...s, [card.id]: v }));
    const setId = card.setId;
    if (setId) await api(`/sets/${setId}/cards/${card.id}/star`, { method: 'PUT', body: { starred: v } }).catch(() => {});
  };

  const back = () => {
    if (index === 0) return;
    setResults(results.slice(0, -1));
    setIndex(index - 1);
  };

  useHotkeys(
    {
      Space: (e) => {
        e.preventDefault();
        setFlipped((f) => !f);
      },
      Enter: (e) => {
        if ((e.target as HTMLElement).tagName === 'BUTTON') return;
        e.preventDefault();
        setFlipped((f) => !f);
      },
      ArrowRight: () => answer(true),
      ArrowLeft: () => answer(false),
      ArrowUp: (e) => (e.preventDefault(), setFlipped((f) => !f)),
      ArrowDown: (e) => (e.preventDefault(), setFlipped((f) => !f)),
      a: () => card && void speakCard(card, flipped ? !side.showsTerm : side.showsTerm),
      s: () => void toggleStar(),
      Backspace: back,
    },
    [index, flipped, results, anim, starred],
  );

  const swipe = useSwipe(
    () => answer(false),
    () => answer(true),
  );

  if (!card) return null;
  const faceText = (front: boolean) => (front ? side.prompt : side.answer);
  const faceLang = (front: boolean) => (front ? side.promptLang : side.answerLang);
  const showsTermOn = (front: boolean) => (front ? side.showsTerm : !side.showsTerm);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center gap-3">
        <ProgressBar value={index} max={cards.length} label={`Carte ${index + 1} sur ${cards.length}`} />
        <span className="shrink-0 text-sm text-ink-soft">
          {index + 1} / {cards.length}
        </span>
      </div>

      <div
        className={`flip h-[min(48dvh,420px)] touch-pan-y transition-transform duration-200 ${anim === 'left' ? '-translate-x-8 opacity-0' : anim === 'right' ? 'translate-x-8 opacity-0' : ''}`}
        {...swipe}
      >
        <div className={`flip-inner ${flipped ? 'is-flipped' : ''}`}>
          {[true, false].map((front) => (
            <button
              key={String(front)}
              type="button"
              onClick={() => setFlipped(!flipped)}
              aria-hidden={front === flipped}
              tabIndex={front === flipped ? -1 : 0}
              aria-label={`${front ? 'Recto' : 'Verso'} : ${faceText(front)}. Appuie pour retourner la carte.`}
              className={`flip-face ${front ? 'flip-front' : 'flip-back'} card flex flex-col items-center justify-center gap-3 p-6 text-center shadow-lift`}
              style={{ borderTop: `6px solid ${front ? 'var(--line)' : 'var(--sage)'}` }}
            >
              <span className="absolute top-3 left-4 text-xs font-semibold tracking-wide text-ink-soft uppercase">
                {showsTermOn(front) ? 'Terme' : 'Définition'}
              </span>
              {!showsTermOn(front) && card.image && <img src={mediaUrl(card.image)} alt="" className="max-h-36 rounded-xl" />}
              <span className="max-h-full overflow-y-auto text-[clamp(1.5rem,5vw,2.5rem)] leading-snug font-semibold break-words whitespace-pre-line" lang={faceLang(front)}>
                {faceText(front)}
              </span>
              {!front && card.example && <span className="text-ink-soft italic">« {card.example} »</span>}
              {!front && card.note && <span className="text-sm text-ink-soft">{card.note}</span>}
              {front && <span className="absolute bottom-3 text-sm text-ink-soft">Touche ou Espace pour retourner</span>}
            </button>
          ))}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {flipped ? `Réponse : ${side.answer}` : `Question : ${side.prompt}`}
      </p>

      <div className="mt-4 flex items-center justify-center gap-2">
        <button type="button" className="btn-icon" onClick={back} disabled={index === 0} aria-label="Carte précédente">
          <Icon name="arrowLeft" />
        </button>
        <button type="button" className="btn-icon" onClick={() => void speakCard(card, flipped ? !side.showsTerm : side.showsTerm)} aria-label="Écouter (A)">
          <Icon name="volume" />
        </button>
        <button type="button" className={`btn-icon ${starred[card.id] ? 'text-accent' : ''}`} onClick={() => void toggleStar()} aria-pressed={!!starred[card.id]} aria-label="Étoile (S)">
          <Icon name="star" filled={!!starred[card.id]} />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button type="button" className="btn min-h-14 border-2 border-danger/40 bg-danger-soft text-danger hover:border-danger" onClick={() => answer(false)}>
          <Icon name="x" /> Je ne savais pas <kbd className="hidden text-xs opacity-70 sm:inline">←</kbd>
        </button>
        <button type="button" className="btn min-h-14 border-2 border-ok/40 bg-ok-soft text-ok hover:border-ok" onClick={() => answer(true)}>
          <Icon name="check" /> Je savais <kbd className="hidden text-xs opacity-70 sm:inline">→</kbd>
        </button>
      </div>
      <p className="mt-3 text-center text-sm text-ink-soft">Sur mobile : balaie vers la droite si tu savais, vers la gauche sinon.</p>
    </div>
  );
}
