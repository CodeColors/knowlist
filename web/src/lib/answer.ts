import type { Tolerance } from './types';

export const DEFAULT_TOLERANCE: Tolerance = { accents: true, case: true, typos: true, punctuation: true };

export interface CheckResult {
  correct: boolean;
  /** Réponse correcte, mais acceptée grâce à une tolérance (faute de frappe, accent…). */
  approximate: boolean;
  /** Variante attendue la plus proche. */
  expected: string;
}

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
}

export function normalize(s: string, tol: Tolerance): string {
  let out = s.normalize('NFC').replace(/[’‘`´]/g, "'").replace(/\s+/g, ' ').trim();
  if (tol.case) out = out.toLocaleLowerCase('fr');
  if (tol.accents) out = stripAccents(out);
  if (tol.punctuation) out = out.replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  return out;
}

/**
 * Variantes acceptées pour une réponse attendue :
 *  - alternatives séparées par « / » ou « ; » (« sol / étage »),
 *  - parties entre parenthèses facultatives (« (to) run » → « run » ou « to run »).
 */
export function expectedVariants(expected: string): string[] {
  const parts = expected
    .split(/\s*[/;]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  const out = new Set<string>();
  for (const p of parts.length ? parts : [expected.trim()]) {
    out.add(p.replace(/[()]/g, '').replace(/\s+/g, ' ').trim());
    const without = p.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
    if (without) out.add(without);
  }
  // La réponse complète reste toujours acceptée.
  out.add(expected.replace(/\s+/g, ' ').trim());
  return [...out].filter(Boolean);
}

/** Distance de Damerau-Levenshtein (transpositions adjacentes comptées comme une seule faute). */
export function editDistance(a: string, b: string): number {
  const A = [...a];
  const B = [...b];
  const d: number[][] = Array.from({ length: A.length + 1 }, (_, i) => [i, ...Array(B.length).fill(0)]);
  for (let j = 1; j <= B.length; j++) d[0][j] = j;
  for (let i = 1; i <= A.length; i++) {
    for (let j = 1; j <= B.length; j++) {
      const cost = A[i - 1] === B[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && A[i - 1] === B[j - 2] && A[i - 2] === B[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[A.length][B.length];
}

/** Nombre de fautes mineures tolérées selon la longueur de la réponse. */
export function allowedTypos(length: number): number {
  if (length <= 3) return 0;
  if (length <= 7) return 1;
  return 2;
}

export function checkAnswer(given: string, expected: string, tol: Tolerance = DEFAULT_TOLERANCE): CheckResult {
  const strict: Tolerance = { accents: false, case: false, typos: false, punctuation: false };
  const variants = expectedVariants(expected);
  const g = normalize(given, tol);
  if (!g) return { correct: false, approximate: false, expected: variants[0] ?? expected };
  for (const v of variants) {
    if (normalize(given, strict) === normalize(v, strict)) return { correct: true, approximate: false, expected: v };
  }
  for (const v of variants) {
    if (g === normalize(v, tol)) return { correct: true, approximate: true, expected: v };
  }
  if (tol.typos) {
    for (const v of variants) {
      const nv = normalize(v, tol);
      if (editDistance(g, nv) <= allowedTypos([...nv].length)) return { correct: true, approximate: true, expected: v };
    }
  }
  return { correct: false, approximate: false, expected: variants[0] ?? expected };
}
