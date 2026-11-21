import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

const { enqueueAnswers, flushQueue, pendingCount } = await import('./offline');

function mockFetch(status: number | 'offline') {
  const fn = vi.fn(async () => {
    if (status === 'offline') throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify(status === 200 ? { accepted: 1 } : { error: 'x', message: 'x' }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('file des réponses hors ligne', () => {
  beforeEach(() => store.clear());

  it('reste utilisable après un vidage sur file vide (pas de verrou bloqué)', async () => {
    const f = mockFetch(200);
    expect(await flushQueue()).toBe(0);
    enqueueAnswers([{ cardId: 1, correct: true, mode: 'write' }]);
    expect(await flushQueue()).toBe(1);
    expect(f).toHaveBeenCalledTimes(1);
    expect(pendingCount()).toBe(0);
  });

  it('conserve les réponses sans réseau puis les envoie au retour', async () => {
    mockFetch('offline');
    enqueueAnswers([
      { cardId: 1, correct: true, mode: 'learn' },
      { cardId: 2, correct: false, mode: 'learn' },
    ]);
    expect(await flushQueue()).toBe(0);
    expect(pendingCount()).toBe(2);
    mockFetch(200);
    expect(await flushQueue()).toBe(2);
    expect(pendingCount()).toBe(0);
  });

  it('garde le lot si la session ou le jeton est refusé, l’abandonne si les données sont invalides', async () => {
    enqueueAnswers([{ cardId: 1, correct: true, mode: 'test' }]);
    mockFetch(403);
    await flushQueue();
    expect(pendingCount()).toBe(1);
    mockFetch(400);
    await flushQueue();
    expect(pendingCount()).toBe(0);
  });
});
