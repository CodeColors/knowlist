import { describe, expect, it } from 'vitest';
import { allowedTypos, checkAnswer, editDistance, expectedVariants, normalize } from './answer';

const ALL = { accents: true, case: true, typos: true, punctuation: true };
const STRICT = { accents: false, case: false, typos: false, punctuation: false };

describe('correction des réponses', () => {
  it('accepte la réponse exacte', () => {
    expect(checkAnswer('maison', 'maison')).toEqual({ correct: true, approximate: false, expected: 'maison' });
  });

  it('refuse une réponse vide ou fausse', () => {
    expect(checkAnswer('', 'maison').correct).toBe(false);
    expect(checkAnswer('   ', 'maison').correct).toBe(false);
    expect(checkAnswer('voiture', 'maison').correct).toBe(false);
  });

  it('tolère la casse et les accents selon le réglage', () => {
    expect(checkAnswer('Été', 'été', ALL).correct).toBe(true);
    expect(checkAnswer('ete', 'été', ALL)).toMatchObject({ correct: true, approximate: true });
    expect(checkAnswer('ete', 'été', { ...ALL, accents: false, typos: false }).correct).toBe(false);
    expect(checkAnswer('MAISON', 'maison', { ...ALL, case: false, typos: false }).correct).toBe(false);
  });

  it('tolère les fautes mineures proportionnellement à la longueur', () => {
    expect(checkAnswer('maisno', 'maison', ALL).correct).toBe(true); // inversion
    expect(checkAnswer('mason', 'maison', ALL).correct).toBe(true);
    expect(checkAnswer('chat', 'chut', ALL).correct).toBe(true);
    expect(checkAnswer('cat', 'car', ALL).correct).toBe(false); // trop court pour une faute
    expect(checkAnswer('réfrigérateur', 'refrigirateru', ALL).correct).toBe(true);
    expect(checkAnswer('mason', 'maison', { ...ALL, typos: false }).correct).toBe(false);
    expect(allowedTypos(3)).toBe(0);
    expect(allowedTypos(5)).toBe(1);
    expect(allowedTypos(12)).toBe(2);
  });

  it('ignore la ponctuation et les espaces superflus', () => {
    expect(checkAnswer("  l'été   ", "l’été", ALL).correct).toBe(true);
    expect(checkAnswer('bonjour', 'Bonjour !', ALL).correct).toBe(true);
    expect(checkAnswer('bonjour', 'Bonjour !', STRICT).correct).toBe(false);
  });

  it('accepte les alternatives et les parties facultatives', () => {
    expect(expectedVariants('sol / étage')).toEqual(expect.arrayContaining(['sol', 'étage']));
    expect(checkAnswer('étage', 'sol / étage', STRICT).correct).toBe(true);
    expect(checkAnswer('run', '(to) run', STRICT).correct).toBe(true);
    expect(checkAnswer('to run', '(to) run', STRICT).correct).toBe(true);
    expect(checkAnswer('vouloir', 'vouloir ; aimer', STRICT).correct).toBe(true);
  });

  it('normalise de façon prévisible', () => {
    expect(normalize('  Çà   et LÀ ! ', ALL)).toBe('ca et la');
    expect(editDistance('abc', 'abc')).toBe(0);
    expect(editDistance('abc', 'acb')).toBe(1);
    expect(editDistance('', 'abc')).toBe(3);
  });
});
