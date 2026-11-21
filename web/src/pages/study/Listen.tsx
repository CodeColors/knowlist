import { useEffect, useMemo, useRef, useState } from 'react';
import { mediaUrl } from '../../lib/api';
import { shuffle } from '../../lib/study';
import { playCard, speak, ttsSupported } from '../../lib/tts';
import { Icon } from '../../components/Icon';
import { ProgressBar } from '../../components/ui';
import { WrittenQuestion, type ModeProps, type StudyCard } from './shared';

/** Dictée : la synthèse vocale du navigateur lit le texte, on écrit ce qu'on entend. */
export default function Listen({ cards, options, tolerance, record, onFinish }: ModeProps) {
  const plan = useMemo(
    () =>
      cards.map((c) => {
        const useTerm = options.direction === 'term' ? true : options.direction === 'definition' ? false : shuffle([true, false])[0];
        return { card: c, text: useTerm ? c.term : c.definition, lang: useTerm ? c.termLang : c.defLang, hint: useTerm ? c.definition : c.term, audio: useTerm ? c.audio : null };
      }),
    [cards, options.direction],
  );
  const [index, setIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const results = useRef<{ card: StudyCard; ok: boolean }[]>([]);
  const start = useRef(Date.now());
  const shownAt = useRef(Date.now());
  const item = plan[index];
  const supported = ttsSupported() || plan.some((p) => p.audio);

  const play = (slow = false) => {
    if (!item) return;
    if (slow) void speak(item.text, item.lang, { rate: 0.6 });
    else void playCard(item.text, item.lang, mediaUrl(item.audio));
  };

  useEffect(() => {
    if (started) {
      setShowHint(false);
      const t = setTimeout(() => play(), 250);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, started]);

  const handle = (ok: boolean) => {
    record(item.card.id, ok, Date.now() - shownAt.current);
    results.current.push({ card: item.card, ok });
    if (index + 1 >= plan.length) {
      const r = results.current;
      onFinish({ correct: r.filter((x) => x.ok).length, total: r.length, durationMs: Date.now() - start.current, missed: r.filter((x) => !x.ok).map((x) => x.card) });
    } else {
      setIndex(index + 1);
      shownAt.current = Date.now();
    }
  };

  if (!supported)
    return (
      <div className="card mx-auto max-w-xl p-6 text-center">
        <p className="text-lg font-semibold">Ton navigateur ne propose pas de synthèse vocale.</p>
        <p className="mt-2 text-ink-soft">Essaie avec un navigateur récent (Chrome, Edge, Safari, Firefox) ou ajoute des fichiers audio à tes cartes.</p>
      </div>
    );

  if (!started)
    return (
      <div className="card mx-auto max-w-xl p-8 text-center">
        <p className="text-5xl" aria-hidden="true">
          🎧
        </p>
        <h2 className="mt-3 text-2xl font-semibold">Dictée</h2>
        <p className="mt-2 text-ink-soft">Monte le son : chaque mot est lu à voix haute, écris ce que tu entends. Tu peux réécouter autant que tu veux.</p>
        <button
          type="button"
          className="btn-primary mt-6"
          autoFocus
          onClick={() => {
            setStarted(true);
            start.current = Date.now();
            shownAt.current = Date.now();
          }}
        >
          <Icon name="play" size={18} filled /> Commencer
        </button>
      </div>
    );

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center gap-3">
        <ProgressBar value={index} max={plan.length} label={`Dictée ${index + 1} sur ${plan.length}`} />
        <span className="shrink-0 text-sm text-ink-soft">
          {index + 1} / {plan.length}
        </span>
      </div>
      <div key={index} className="pop-in">
        <WrittenQuestion
          prompt={
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" className="btn-primary min-h-14 px-6 text-lg" onClick={() => play()}>
                <Icon name="volume" /> Écouter
              </button>
              <button type="button" className="btn-secondary min-h-14" onClick={() => play(true)}>
                🐢 Lentement
              </button>
            </div>
          }
          hint={
            <div className="mt-3">
              {showHint ? (
                <p className="text-ink-soft">Indice : {item.hint}</p>
              ) : (
                <button type="button" className="text-sm text-ink-soft underline underline-offset-2" onClick={() => setShowHint(true)}>
                  Afficher un indice
                </button>
              )}
            </div>
          }
          answer={item.text}
          answerLang={item.lang}
          tolerance={tolerance}
          onResult={handle}
          label="Écris ce que tu entends"
        />
      </div>
    </div>
  );
}
