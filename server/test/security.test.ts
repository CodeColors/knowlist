import { describe, expect, it } from 'vitest';
import { checkPasswordPolicy, generateTempPassword, hashPassword, verifyPassword } from '../src/lib/password.js';
import { FailureLimiter, lockDelay } from '../src/lib/ratelimit.js';
import { computeStreak, endOfLocalDay, localDateKey } from '../src/lib/time.js';
import { toFtsQuery } from '../src/routes/search.js';

describe('politique de mot de passe', () => {
  const p = { minLength: 12 };
  it('exige 12 caractères minimum, même si le réglage est plus bas', () => {
    expect(checkPasswordPolicy('court', p)).toMatch(/12/);
    expect(checkPasswordPolicy('abcdefghijk', { minLength: 8 })).toMatch(/12/);
  });
  it('refuse les mots de passe courants et leurs variantes', () => {
    expect(checkPasswordPolicy('motdepasse123', p)).toMatch(/courant/);
    expect(checkPasswordPolicy('Password1234', p)).toMatch(/courant/);
    expect(checkPasswordPolicy('aaaaaaaaaaaaaa', p)).toMatch(/courant/);
    expect(checkPasswordPolicy('AZERTY!!2024!', p)).toMatch(/courant/);
  });
  it("refuse un mot de passe contenant l'identifiant", () => {
    expect(checkPasswordPolicy('marie.dupont-2026', p, 'marie.dupont')).toMatch(/identifiant/);
  });
  it('accepte une phrase de passe', () => {
    expect(checkPasswordPolicy('cheval-agrafe-correct', p)).toBeNull();
  });
  it('génère des mots de passe temporaires conformes', () => {
    for (let i = 0; i < 20; i++) expect(checkPasswordPolicy(generateTempPassword(), p)).toBeNull();
  });
  it('hache en Argon2id et vérifie', async () => {
    const h = await hashPassword('cheval-agrafe-correct');
    expect(h.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(h, 'cheval-agrafe-correct')).toBe(true);
    expect(await verifyPassword(h, 'autre-chose-123')).toBe(false);
    expect(await verifyPassword(null, 'x')).toBe(false);
  });
});

describe('limitation des tentatives', () => {
  it('tolère 5 échecs puis impose un délai croissant', () => {
    expect(lockDelay(4)).toBe(0);
    expect(lockDelay(5)).toBe(30_000);
    expect(lockDelay(6)).toBe(60_000);
    expect(lockDelay(50)).toBe(3_600_000);
    const l = new FailureLimiter();
    const t = 1_000_000;
    for (let i = 0; i < 4; i++) l.fail('k', t);
    expect(l.retryAfter('k', t)).toBe(0);
    l.fail('k', t);
    expect(l.retryAfter('k', t)).toBe(30_000);
    expect(l.retryAfter('k', t + 30_000)).toBe(0);
    l.reset('k');
    expect(l.retryAfter('k', t)).toBe(0);
  });
});

describe('dates locales et série', () => {
  it('calcule la fin de journée locale', () => {
    // Paris en hiver : UTC+1 → getTimezoneOffset() = -60
    const end = endOfLocalDay(new Date('2026-01-10T22:30:00Z'), -60);
    expect(end.toISOString()).toBe('2026-01-10T23:00:00.000Z');
    expect(localDateKey(new Date('2026-01-10T23:30:00Z'), -60)).toBe('2026-01-11');
  });
  it('compte les jours consécutifs, sans casser la série si rien encore aujourd’hui', () => {
    const days = new Set(['2026-03-01', '2026-03-02', '2026-03-03']);
    expect(computeStreak(days, '2026-03-03')).toBe(3);
    expect(computeStreak(days, '2026-03-04')).toBe(3);
    expect(computeStreak(days, '2026-03-05')).toBe(0);
  });
});

describe('recherche', () => {
  it('produit une requête FTS5 sûre', () => {
    expect(toFtsQuery('  ')).toBeNull();
    expect(toFtsQuery('mai"son OR')).toBe('"mai"* "son"* "OR"*');
    expect(toFtsQuery("l'été")).toBe('"l"* "été"*');
  });
});
