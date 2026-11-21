import { describe, expect, it } from 'vitest';
import { MIN_EASE, newState, qualityFromResult, review, RELEARN_MINUTES } from '../src/lib/srs.js';

const t0 = new Date('2026-01-01T10:00:00Z');
const days = (s: { dueAt: Date }, from: Date) => (s.dueAt.getTime() - from.getTime()) / 86400_000;

describe('SM-2', () => {
  it('suit la progression 1 j, 6 j, puis intervalle × facilité', () => {
    let s = newState(t0);
    s = review(s, 4, t0);
    expect(s.intervalDays).toBe(1);
    expect(days(s, t0)).toBe(1);
    s = review(s, 4, t0);
    expect(s.intervalDays).toBe(6);
    s = review(s, 4, t0);
    expect(s.intervalDays).toBe(Math.round(6 * 2.5));
    expect(s.repetitions).toBe(3);
  });

  it('ajuste la facilité selon la qualité', () => {
    const s = newState(t0);
    expect(review(s, 5, t0).ease).toBeCloseTo(2.6);
    expect(review(s, 4, t0).ease).toBeCloseTo(2.5);
    expect(review(s, 3, t0).ease).toBeCloseTo(2.36);
  });

  it('remet la carte en apprentissage après un échec', () => {
    let s = newState(t0);
    s = review(s, 4, t0);
    s = review(s, 4, t0);
    const failed = review(s, 1, t0);
    expect(failed.repetitions).toBe(0);
    expect(failed.intervalDays).toBe(0);
    expect(failed.lapses).toBe(1);
    expect(failed.ease).toBeCloseTo(s.ease - 0.2);
    expect(failed.dueAt.getTime() - t0.getTime()).toBe(RELEARN_MINUTES * 60_000);
  });

  it('ne compte pas un échec sur une carte jamais apprise comme un oubli', () => {
    expect(review(newState(t0), 0, t0).lapses).toBe(0);
  });

  it('ne descend jamais sous la facilité minimale', () => {
    let s = newState(t0);
    for (let i = 0; i < 20; i++) s = review(s, 0, t0);
    expect(s.ease).toBe(MIN_EASE);
  });

  it('borne les qualités hors plage', () => {
    expect(review(newState(t0), 99, t0).ease).toBeCloseTo(2.6);
    expect(review(newState(t0), -3, t0).repetitions).toBe(0);
  });

  it('convertit un résultat binaire en qualité', () => {
    expect(qualityFromResult(false)).toBe(1);
    expect(qualityFromResult(true)).toBe(4);
    expect(qualityFromResult(true, 2000)).toBe(5);
    expect(qualityFromResult(true, 9000)).toBe(4);
  });
});
