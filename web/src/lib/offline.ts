import { api, ApiError } from './api';

export interface AnswerRecord {
  cardId: number;
  correct: boolean;
  mode: string;
  durationMs?: number;
  quality?: number;
  at?: string;
}

/**
 * File locale des réponses d'étude.
 * Chaque réponse y est écrite immédiatement, puis envoyée par lots. Si le réseau manque
 * (ou si la page se ferme avant l'envoi), elle sera synchronisée plus tard : rien n'est perdu.
 */
const KEY = 'kl-pending-answers';

function readQueue(): AnswerRecord[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

function writeQueue(q: AnswerRecord[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(q.slice(-5000)));
  } catch {
    /* stockage plein ou indisponible */
  }
}

export const pendingCount = () => readQueue().length;

export function enqueueAnswers(answers: AnswerRecord[]) {
  if (!answers.length) return;
  writeQueue([...readQueue(), ...answers.map((a) => ({ ...a, at: a.at ?? new Date().toISOString() }))]);
}

let flushing: Promise<number> | null = null;

/** Envoie la file ; les éléments sont retirés avant l'envoi et remis en cas d'échec réseau. */
export function flushQueue(): Promise<number> {
  if (flushing) return flushing;
  const run = async () => {
    let sent = 0;
    for (;;) {
      const q = readQueue();
      if (!q.length) break;
      const batch = q.slice(0, 400);
      writeQueue(q.slice(400));
      try {
        await api('/study/answers', { body: { answers: batch } });
        sent += batch.length;
      } catch (e) {
        // Erreur réseau : on remet le lot en tête de file. Données refusées (400) : on abandonne le lot.
        if (e instanceof ApiError && (e.status === 0 || e.status >= 500 || e.status === 401 || e.status === 403 || e.status === 429)) writeQueue([...batch, ...readQueue()]);
        break;
      }
    }
    return sent;
  };
  // Le verrou est libéré après l'affectation (même si run() se termine immédiatement).
  const p = run().finally(() => {
    if (flushing === p) flushing = null;
  });
  flushing = p;
  return p;
}

/** Utilisé hors des sessions (ex. envoi ponctuel) : met en file puis tente l'envoi. */
export async function submitAnswers(answers: AnswerRecord[]): Promise<void> {
  enqueueAnswers(answers);
  await flushQueue();
}

export function clearQueue() {
  writeQueue([]);
}
