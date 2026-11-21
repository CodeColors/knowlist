import { describe, expect, it } from 'vitest';
import { guessTermSep, parseImport, parseKnowlistJson, splitQuoted } from './importParse';

describe('import', () => {
  it('lit un copier-coller Quizlet (tabulation + retour à la ligne)', () => {
    const cards = parseImport('dog\tchien\ncat\tchat\n\nbird\toiseau', { termSep: 'tab', cardSep: 'newline' });
    expect(cards).toEqual([
      { term: 'dog', definition: 'chien' },
      { term: 'cat', definition: 'chat' },
      { term: 'bird', definition: 'oiseau' },
    ]);
  });

  it('lit un CSV avec guillemets, en-tête et colonnes supplémentaires', () => {
    const csv = '\ufeffterme,definition,exemple\n"hello, you",bonjour,"He said ""hi"""\nyes,oui\n"multi\nligne",x';
    expect(parseImport(csv, { termSep: 'comma', cardSep: 'newline' })).toEqual([
      { term: 'hello, you', definition: 'bonjour', example: 'He said "hi"' },
      { term: 'yes', definition: 'oui' },
      { term: 'multi\nligne', definition: 'x' },
    ]);
  });

  it('accepte des séparateurs personnalisés', () => {
    const cards = parseImport('un=one|deux=two|', { termSep: 'custom', customTermSep: '=', cardSep: 'custom', customCardSep: '|' });
    expect(cards).toEqual([
      { term: 'un', definition: 'one' },
      { term: 'deux', definition: 'two' },
    ]);
  });

  it('devine le séparateur', () => {
    expect(guessTermSep('a\tb\nc\td')).toBe('tab');
    expect(guessTermSep('a - b\nc - d')).toBe('dash');
    expect(guessTermSep('a,b\nc,d')).toBe('comma');
  });

  it('découpe une ligne en respectant les guillemets', () => {
    expect(splitQuoted('"a;b";c', ';')).toEqual(['a;b', 'c']);
  });

  it('valide un export JSON KnowList', () => {
    expect(parseKnowlistJson('{"format":"knowlist-set","title":"T","cards":[]}').title).toBe('T');
    expect(() => parseKnowlistJson('{"cards":[]}')).toThrow();
  });
});
