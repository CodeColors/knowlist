/**
 * Répétition espacée, variante de SM-2.
 *
 * qualité (0-5) : 0-2 = échec, 3 = difficile, 4 = correct, 5 = facile.
 * - Échec : la carte repart en apprentissage (révisée 10 minutes plus tard), facilité -0,2.
 * - Réussite : intervalle 1 j, puis 6 j, puis intervalle × facilité.
 */
export interface SrsState {
  intervalDays: number;
  ease: number;
  repetitions: number;
  lapses: number;
  dueAt: Date;
}

export const MIN_EASE = 1.3;
export const DEFAULT_EASE = 2.5;
export const RELEARN_MINUTES = 10;
export const MAX_INTERVAL_DAYS = 365 * 3;
/** Une carte est « maîtrisée » quand son intervalle atteint 21 jours. */
export const MASTERED_INTERVAL = 21;

export function newState(now: Date): SrsState {
  return { intervalDays: 0, ease: DEFAULT_EASE, repetitions: 0, lapses: 0, dueAt: now };
}

export function review(prev: SrsState, quality: number, now: Date): SrsState {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  if (q < 3) {
    return {
      intervalDays: 0,
      ease: Math.max(MIN_EASE, round2(prev.ease - 0.2)),
      repetitions: 0,
      lapses: prev.lapses + (prev.repetitions > 0 ? 1 : 0),
      dueAt: new Date(now.getTime() + RELEARN_MINUTES * 60_000),
    };
  }
  const repetitions = prev.repetitions + 1;
  let interval: number;
  if (repetitions === 1) interval = 1;
  else if (repetitions === 2) interval = 6;
  else interval = Math.round(Math.max(prev.intervalDays, 1) * prev.ease);
  if (q === 3) interval = Math.max(1, Math.round(interval * 0.8));
  interval = Math.min(MAX_INTERVAL_DAYS, interval);
  const ease = Math.max(MIN_EASE, round2(prev.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))));
  return {
    intervalDays: interval,
    ease,
    repetitions,
    lapses: prev.lapses,
    dueAt: new Date(now.getTime() + interval * 86400_000),
  };
}

/** Convertit un résultat binaire d'un mode d'étude en qualité SM-2. */
export function qualityFromResult(correct: boolean, durationMs?: number): number {
  if (!correct) return 1;
  if (durationMs !== undefined && durationMs > 0 && durationMs < 4000) return 5;
  return 4;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
