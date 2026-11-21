import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { dateOnly } from '../../lib/format';
import { formatTimer, shuffle } from '../../lib/study';
import { Icon } from '../../components/Icon';
import { type ModeProps, type StudyCard } from './shared';

interface Tile {
  key: string;
  cardId: number;
  text: string;
  lang: string;
  kind: 'term' | 'def';
}

export default function Match({ cards, options, record, onFinish, setId }: ModeProps) {
  const pairs = Math.max(2, Math.min(options.count || 6, 8, cards.length));
  const chosen = useMemo(() => cards.slice(0, pairs), [cards, pairs]);
  const tiles = useMemo<Tile[]>(
    () =>
      shuffle(
        chosen.flatMap((c) => [
          { key: `t${c.id}`, cardId: c.id, text: c.term, lang: c.termLang, kind: 'term' as const },
          { key: `d${c.id}`, cardId: c.id, text: c.definition, lang: c.defLang, kind: 'def' as const },
        ]),
      ),
    [chosen],
  );
  const [started, setStarted] = useState(false);
  const [selected, setSelected] = useState<Tile | null>(null);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [wrong, setWrong] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [announce, setAnnounce] = useState('');
  const mistakes = useRef(new Set<number>());
  const t0 = useRef(0);
  const [best, setBest] = useState<{ timeMs: number; at: string }[] | null>(null);

  useEffect(() => {
    if (setId) api(`/study/match/${setId}`).then((r) => setBest(r.scores)).catch(() => {});
  }, [setId]);

  useEffect(() => {
    if (!started || matched.size === chosen.length) return;
    const t = setInterval(() => setElapsed(Date.now() - t0.current), 100);
    return () => clearInterval(t);
  }, [started, matched.size, chosen.length]);

  const finish = async (finalMs: number) => {
    let scores = best;
    let rank: number | null = null;
    if (setId) {
      try {
        scores = (await api(`/study/match/${setId}`, { body: { timeMs: Math.round(finalMs) } })).scores;
        rank = scores!.findIndex((s) => Math.abs(s.timeMs - Math.round(finalMs)) < 1) + 1 || null;
      } catch {
        /* hors ligne : pas de classement */
      }
    }
    const missed = chosen.filter((c) => mistakes.current.has(c.id));
    onFinish({
      correct: chosen.length - missed.length,
      total: chosen.length,
      durationMs: finalMs,
      missed,
      extra: (
        <div className="card mt-6 p-4 text-left">
          <h3 className="mb-2 font-semibold">
            ⏱️ {formatTimer(finalMs)} {rank === 1 && scores && scores.length > 1 ? '— nouveau record personnel !' : ''}
          </h3>
          {scores && scores.length > 0 && (
            <ol className="space-y-1">
              {scores.map((s, i) => (
                <li key={i} className={`flex justify-between rounded-lg px-2 ${rank === i + 1 ? 'bg-accent-soft font-semibold text-accent' : ''}`}>
                  <span>
                    {i + 1}. {formatTimer(s.timeMs)}
                  </span>
                  <span className="text-sm text-ink-soft">{dateOnly(s.at)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      ),
    });
  };

  const click = (tile: Tile) => {
    if (matched.has(tile.cardId)) return;
    if (!selected) return setSelected(tile);
    if (selected.key === tile.key) return setSelected(null);
    if (selected.kind === tile.kind) return setSelected(tile);
    if (selected.cardId === tile.cardId) {
      const m = new Set(matched).add(tile.cardId);
      setMatched(m);
      setSelected(null);
      setAnnounce(`Paire trouvée. ${chosen.length - m.size} restante${chosen.length - m.size > 1 ? 's' : ''}.`);
      record(tile.cardId, !mistakes.current.has(tile.cardId), 0);
      if (m.size === chosen.length) {
        const total = Date.now() - t0.current;
        setElapsed(total);
        void finish(total);
      }
    } else {
      mistakes.current.add(selected.cardId);
      mistakes.current.add(tile.cardId);
      setWrong([selected.key, tile.key]);
      setAnnounce('Ce n’est pas une paire. Réessaie.');
      setSelected(null);
      setTimeout(() => setWrong([]), 450);
    }
  };

  if (!started)
    return (
      <div className="card mx-auto max-w-xl p-8 text-center">
        <p className="text-5xl" aria-hidden="true">
          ⏱️
        </p>
        <h2 className="mt-3 text-2xl font-semibold">Association</h2>
        <p className="mt-2 text-ink-soft">Relie chaque terme à sa définition le plus vite possible : {pairs} paires.</p>
        {best && best.length > 0 && <p className="mt-2 font-semibold">Ton record : {formatTimer(best[0].timeMs)}</p>}
        <button
          type="button"
          className="btn-primary mt-6"
          autoFocus
          onClick={() => {
            t0.current = Date.now();
            setStarted(true);
          }}
        >
          <Icon name="play" size={18} filled /> Lancer le chrono
        </button>
      </div>
    );

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <p className="font-mono text-2xl font-bold" aria-label={`Temps : ${formatTimer(elapsed)}`}>
          {formatTimer(elapsed)}
        </p>
        <p className="text-ink-soft">
          {matched.size} / {chosen.length} paires
        </p>
      </div>
      <p className="sr-only" aria-live="assertive">
        {announce}
      </p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {tiles.map((t) => {
          const isMatched = matched.has(t.cardId);
          const isSel = selected?.key === t.key;
          return (
            <li key={t.key}>
              <button
                type="button"
                onClick={() => click(t)}
                disabled={isMatched}
                aria-pressed={isSel}
                lang={t.lang}
                className={`card flex min-h-24 w-full items-center justify-center p-3 text-center break-words transition ${
                  isMatched ? 'invisible scale-90 opacity-0' : ''
                } ${isSel ? 'border-accent bg-accent-soft ring-2 ring-accent' : 'hover:border-accent'} ${wrong.includes(t.key) ? 'shake border-danger bg-danger-soft' : ''}`}
              >
                <span className={t.kind === 'term' ? 'font-semibold' : 'text-sm'}>{t.text}</span>
                <span className="sr-only">{t.kind === 'term' ? '(terme)' : '(définition)'}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export type { StudyCard };
