import type { Card, StudyMode } from './types';

export type Direction = 'term' | 'definition' | 'mixed';
export type Filter = 'all' | 'starred' | 'difficult';

export interface StudyOptions {
  direction: Direction;
  shuffle: boolean;
  filter: Filter;
  count: number; // 0 = toutes
}

export const DEFAULT_OPTIONS: StudyOptions = { direction: 'term', shuffle: true, filter: 'all', count: 0 };

export const MODE_INFO: Record<Exclude<StudyMode, 'review'>, { label: string; desc: string; emoji: string }> = {
  flashcards: { label: 'Cartes mémoire', desc: 'Retourne les cartes, dis si tu savais.', emoji: '🃏' },
  learn: { label: 'Apprendre', desc: 'QCM puis saisie, les cartes ratées reviennent.', emoji: '🌱' },
  test: { label: 'Test', desc: 'Un contrôle généré automatiquement, noté.', emoji: '📝' },
  match: { label: 'Association', desc: 'Relie termes et définitions, chrono en main.', emoji: '⏱️' },
  write: { label: 'Écriture', desc: 'Écris la réponse, petites fautes tolérées.', emoji: '✍️' },
  listen: { label: 'Écoute', desc: 'Dictée : écoute puis écris ce que tu entends.', emoji: '🎧' },
};

export function loadOptions(mode: string): StudyOptions {
  try {
    return { ...DEFAULT_OPTIONS, ...JSON.parse(localStorage.getItem(`kl-opts-${mode}`) || '{}') };
  } catch {
    return { ...DEFAULT_OPTIONS };
  }
}

export function saveOptions(mode: string, o: StudyOptions) {
  try {
    localStorage.setItem(`kl-opts-${mode}`, JSON.stringify(o));
  } catch {
    /* stockage indisponible */
  }
}

export function shuffle<T>(arr: T[], rnd: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function selectCards(cards: Card[], o: StudyOptions): Card[] {
  let pool = cards.filter((c) => c.term.trim() && c.definition.trim());
  if (o.filter === 'starred') pool = pool.filter((c) => c.starred);
  if (o.filter === 'difficult') pool = pool.filter((c) => c.progress?.difficult || (c.progress && !c.progress.mastered && c.progress.wrong > 0));
  if (o.shuffle) pool = shuffle(pool);
  if (o.count > 0) pool = pool.slice(0, o.count);
  return pool;
}

export interface Side {
  /** Ce qu'on montre. */
  prompt: string;
  promptLang: string;
  /** Ce qu'on attend. */
  answer: string;
  answerLang: string;
  /** true si on montre le terme. */
  showsTerm: boolean;
}

export function sideFor(card: Card, dir: Direction, langs: { termLang: string; defLang: string }, rnd = Math.random): Side {
  const showsTerm = dir === 'term' ? true : dir === 'definition' ? false : rnd() < 0.5;
  return showsTerm
    ? { prompt: card.term, promptLang: langs.termLang, answer: card.definition, answerLang: langs.defLang, showsTerm }
    : { prompt: card.definition, promptLang: langs.defLang, answer: card.term, answerLang: langs.termLang, showsTerm };
}

/** Choisit des distracteurs plausibles pour un QCM (longueurs proches en priorité). */
export function distractors(all: Card[], target: Card, field: 'term' | 'definition', n = 3): string[] {
  const right = target[field].trim();
  const pool = [...new Set(all.filter((c) => c.id !== target.id).map((c) => c[field].trim()))].filter((v) => v && v !== right);
  const scored = shuffle(pool).sort((a, b) => Math.abs(a.length - right.length) - Math.abs(b.length - right.length));
  return shuffle(scored.slice(0, Math.max(n * 2, n))).slice(0, n);
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, '0')}`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

export function formatTimer(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}
