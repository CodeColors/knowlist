export interface ParsedCard {
  term: string;
  definition: string;
  example?: string;
  note?: string;
}

export type TermSep = 'tab' | 'comma' | 'semicolon' | 'dash' | 'custom';
export type CardSep = 'newline' | 'semicolon' | 'custom';

export interface ParseOptions {
  termSep: TermSep;
  cardSep: CardSep;
  customTermSep?: string;
  customCardSep?: string;
  /** Ignore la première ligne si elle ressemble à un en-tête (terme,definition…). */
  skipHeader?: boolean;
}

const TERM_SEPS: Record<Exclude<TermSep, 'custom'>, string> = { tab: '\t', comma: ',', semicolon: ';', dash: ' - ' };

/** Découpe une ligne CSV en respectant les guillemets ("a, b",c). */
export function splitQuoted(line: string, sep: string): string[] {
  if (sep.length !== 1) return line.split(sep);
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"' && cur.trim() === '') {
      inQ = true;
      cur = '';
    } else if (ch === sep) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Sépare les enregistrements CSV en tenant compte des retours à la ligne entre guillemets. */
function splitRecords(text: string, quoted: boolean): string[] {
  if (!quoted) return text.split(/\r?\n/);
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') inQ = !inQ;
    if (!inQ && (ch === '\n' || (ch === '\r' && text[i + 1] === '\n'))) {
      if (ch === '\r') i++;
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const HEADER_RE = /^(terme?s?|term|word|mot|front|recto|question)$/i;

export function parseImport(raw: string, opts: ParseOptions): ParsedCard[] {
  const text = raw.replace(/^\ufeff/, '');
  const termSep = opts.termSep === 'custom' ? opts.customTermSep || '\t' : TERM_SEPS[opts.termSep];
  const quoted = termSep === ',' || termSep === ';';
  let records: string[];
  if (opts.cardSep === 'newline') records = splitRecords(text, quoted);
  else if (opts.cardSep === 'semicolon') records = text.split(';');
  else records = text.split(opts.customCardSep || '\n');

  const cards: ParsedCard[] = [];
  records.forEach((rec, idx) => {
    if (!rec.trim()) return;
    const cols = quoted ? splitQuoted(rec, termSep) : rec.split(termSep);
    if (idx === 0 && (opts.skipHeader ?? true) && HEADER_RE.test((cols[0] ?? '').trim())) return;
    const [term = '', definition = '', ...rest] = cols.map((c) => c.trim());
    if (!term && !definition) return;
    const card: ParsedCard = { term, definition };
    if (rest[0]) card.example = rest[0];
    if (rest[1]) card.note = rest[1];
    cards.push(card);
  });
  return cards;
}

/** Devine le séparateur terme/définition le plus probable. */
export function guessTermSep(text: string): TermSep {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  if (!lines.length) return 'tab';
  const share = (re: RegExp) => lines.filter((l) => re.test(l)).length / lines.length;
  if (share(/\t/) >= 0.6) return 'tab';
  if (share(/ - /) >= 0.6) return 'dash';
  if (share(/;/) >= 0.6) return 'semicolon';
  if (share(/,/) >= 0.6) return 'comma';
  return 'tab';
}

/** Fichier JSON exporté par KnowList. */
export function parseKnowlistJson(raw: string) {
  const data = JSON.parse(raw);
  if (data?.format !== 'knowlist-set' || !Array.isArray(data.cards)) throw new Error('Ce fichier JSON ne vient pas de KnowList.');
  return data as {
    title: string;
    description?: string;
    termLang?: string;
    defLang?: string;
    color?: string;
    tags?: string[];
    cards: { term: string; definition: string; example?: string; note?: string; tags?: string[] }[];
  };
}
