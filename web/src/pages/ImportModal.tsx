import { useMemo, useState } from 'react';
import { guessTermSep, parseImport, parseKnowlistJson, type CardSep, type ParsedCard, type TermSep } from '../lib/importParse';
import { Modal } from '../components/Modal';

export function ImportModal({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (cards: ParsedCard[], meta?: { title?: string; description?: string; termLang?: string; defLang?: string; color?: string; tags?: string[] }) => void;
}) {
  const [text, setText] = useState('');
  const [termSep, setTermSep] = useState<TermSep>('tab');
  const [cardSep, setCardSep] = useState<CardSep>('newline');
  const [customTerm, setCustomTerm] = useState('');
  const [customCard, setCustomCard] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cards = useMemo(
    () => (text.trim() ? parseImport(text, { termSep, cardSep, customTermSep: customTerm, customCardSep: customCard.replace(/\\n/g, '\n') }) : []),
    [text, termSep, cardSep, customTerm, customCard],
  );

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const content = await file.text();
    if (file.name.toLowerCase().endsWith('.json')) {
      try {
        const data = parseKnowlistJson(content);
        onImport(data.cards, data);
        setText('');
      } catch (e) {
        setError((e as Error).message);
      }
      return;
    }
    if (file.name.toLowerCase().endsWith('.csv')) setTermSep(content.split('\n')[0].includes(';') && !content.split('\n')[0].includes(',') ? 'semicolon' : 'comma');
    else if (file.name.toLowerCase().endsWith('.tsv')) setTermSep('tab');
    else setTermSep(guessTermSep(content));
    setCardSep('newline');
    setText(content);
  };

  const radio = (name: string, value: string, current: string, set: (v: any) => void, label: string) => (
    <label className={`chip cursor-pointer ${current === value ? 'border-accent bg-accent-soft text-accent' : ''}`}>
      <input type="radio" name={name} value={value} checked={current === value} onChange={() => set(value)} className="sr-only" />
      {label}
    </label>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Importer des cartes"
      size="lg"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!cards.length}
            onClick={() => {
              onImport(cards);
              setText('');
            }}
          >
            Ajouter {cards.length} carte{cards.length > 1 ? 's' : ''}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-ink-soft">
          Colle une liste depuis Quizlet (« Exporter »), un tableur ou un document, ou choisis un fichier CSV, TSV, TXT ou JSON (export KnowList).
        </p>
        <label className="btn-secondary cursor-pointer">
          Choisir un fichier…
          <input type="file" accept=".csv,.tsv,.txt,.json,text/csv,text/plain,application/json" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        <div>
          <label htmlFor="import-text" className="label">
            Texte à importer
          </label>
          <textarea
            id="import-text"
            className="input min-h-40 font-mono text-sm"
            placeholder={'dog\tchien\ncat\tchat'}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (!text && e.target.value) setTermSep(guessTermSep(e.target.value));
            }}
          />
        </div>
        <fieldset>
          <legend className="label">Entre le terme et la définition</legend>
          <div className="flex flex-wrap gap-2">
            {radio('ts', 'tab', termSep, setTermSep, 'Tabulation')}
            {radio('ts', 'comma', termSep, setTermSep, 'Virgule')}
            {radio('ts', 'semicolon', termSep, setTermSep, 'Point-virgule')}
            {radio('ts', 'dash', termSep, setTermSep, 'Tiret « - »')}
            {radio('ts', 'custom', termSep, setTermSep, 'Personnalisé')}
            {termSep === 'custom' && <input aria-label="Séparateur terme/définition personnalisé" className="input w-24" value={customTerm} onChange={(e) => setCustomTerm(e.target.value)} placeholder="=" />}
          </div>
        </fieldset>
        <fieldset>
          <legend className="label">Entre les cartes</legend>
          <div className="flex flex-wrap gap-2">
            {radio('cs', 'newline', cardSep, setCardSep, 'Nouvelle ligne')}
            {radio('cs', 'semicolon', cardSep, setCardSep, 'Point-virgule')}
            {radio('cs', 'custom', cardSep, setCardSep, 'Personnalisé')}
            {cardSep === 'custom' && <input aria-label="Séparateur de cartes personnalisé" className="input w-24" value={customCard} onChange={(e) => setCustomCard(e.target.value)} placeholder="|" />}
          </div>
        </fieldset>
        {error && (
          <p className="rounded-xl bg-danger-soft px-4 py-3 text-danger" role="alert">
            {error}
          </p>
        )}
        <div>
          <h3 className="label">Aperçu ({cards.length})</h3>
          {cards.length === 0 ? (
            <p className="text-sm text-ink-soft">Rien à importer pour l’instant.</p>
          ) : (
            <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-xl border border-line">
              {cards.slice(0, 50).map((c, i) => (
                <li key={i} className="grid grid-cols-2 gap-3 px-3 py-2 text-sm">
                  <span className="font-semibold break-words">{c.term || <em className="text-danger">terme manquant</em>}</span>
                  <span className="break-words">{c.definition || <em className="text-danger">définition manquante</em>}</span>
                </li>
              ))}
              {cards.length > 50 && <li className="px-3 py-2 text-sm text-ink-soft">… et {cards.length - 50} autres</li>}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
