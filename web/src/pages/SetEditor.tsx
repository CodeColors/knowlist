import { forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type TextareaHTMLAttributes } from 'react';
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router';
import { api, mediaUrl, uploadMedia } from '../lib/api';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { LANGS } from '../lib/tts';
import type { Folder, SetDetail } from '../lib/types';
import { Icon } from '../components/Icon';
import { ConfirmModal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { ErrorBox, SET_COLORS, Spinner } from '../components/ui';
import { ImportModal } from './ImportModal';

interface Row {
  key: string;
  id?: number;
  term: string;
  definition: string;
  example: string;
  note: string;
  image: string | null;
  audio: string | null;
  tags: string[];
}

interface Meta {
  title: string;
  description: string;
  termLang: string;
  defLang: string;
  color: string;
  folderId: number | null;
  tags: string[];
}

let keySeq = 0;
const newKey = () => `r${++keySeq}`;
const emptyRow = (): Row => ({ key: newKey(), term: '', definition: '', example: '', note: '', image: null, audio: null, tags: [] });
const DEFAULT_META: Meta = { title: '', description: '', termLang: 'fr', defLang: 'fr', color: SET_COLORS[0], folderId: null, tags: [] };

/** Historique annuler / rétablir, avec regroupement des frappes successives dans un même champ. */
function useHistory(initial: Row[]) {
  const [state, setState] = useState({ past: [] as Row[][], present: initial, future: [] as Row[][] });
  const lastKey = useRef<{ key: string; at: number } | null>(null);
  const commit = useCallback((next: Row[] | ((r: Row[]) => Row[]), coalesce?: string) => {
    setState((s) => {
      const value = typeof next === 'function' ? next(s.present) : next;
      const now = Date.now();
      const merge = coalesce && lastKey.current?.key === coalesce && now - lastKey.current.at < 1500;
      lastKey.current = coalesce ? { key: coalesce, at: now } : null;
      if (merge) return { ...s, present: value, future: [] };
      return { past: [...s.past.slice(-199), s.present], present: value, future: [] };
    });
  }, []);
  const undo = useCallback(() => {
    lastKey.current = null;
    setState((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s));
  }, []);
  const redo = useCallback(() => {
    lastKey.current = null;
    setState((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s));
  }, []);
  const reset = useCallback((rows: Row[]) => setState({ past: [], present: rows, future: [] }), []);
  return { rows: state.present, commit, undo, redo, reset, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}

const AutoTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function AutoTextarea(props, ref) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [props.value]);
  return (
    <textarea
      {...props}
      rows={1}
      ref={(el) => {
        inner.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      }}
      className={`input resize-none overflow-hidden ${props.className ?? ''}`}
    />
  );
});

export default function SetEditor() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const toast = useToast();
  const existing = useApi<SetDetail>(isNew ? null : `/sets/${id}`);
  const folders = useApi<{ folders: Folder[] }>('/folders');
  const [meta, setMeta] = useState<Meta>(DEFAULT_META);
  const [savedSnapshot, setSavedSnapshot] = useState<string>('');
  const history = useHistory([emptyRow(), emptyRow(), emptyRow()]);
  const { rows, commit, undo, redo, reset } = history;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(params.get('importer') === '1');
  const [tagInput, setTagInput] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  const pendingFocus = useRef<string | null>(null);
  const [initialized, setInitialized] = useState(isNew);
  useDocumentTitle(isNew ? 'Nouveau set' : `Modifier · ${meta.title || 'set'}`);

  const snapshotOf = useCallback(
    (m: Meta, r: Row[]) => JSON.stringify([m, r.filter((x) => x.term.trim() || x.definition.trim()).map(({ key: _k, ...rest }) => rest)]),
    [],
  );

  useEffect(() => {
    if (isNew) setSavedSnapshot(snapshotOf(DEFAULT_META, rows));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!existing.data || initialized) return;
    const s = existing.data.set;
    if (s.permission === 'read') {
      navigate(`/sets/${s.id}`, { replace: true });
      return;
    }
    const m: Meta = { title: s.title, description: s.description, termLang: s.termLang, defLang: s.defLang, color: s.color, folderId: s.folderId, tags: s.tags };
    const r: Row[] = existing.data.cards.map((c) => ({
      key: newKey(),
      id: c.id,
      term: c.term,
      definition: c.definition,
      example: c.example,
      note: c.note,
      image: c.image,
      audio: c.audio,
      tags: c.tags,
    }));
    if (r.length === 0) r.push(emptyRow(), emptyRow());
    setMeta(m);
    reset(r);
    setSavedSnapshot(snapshotOf(m, r));
    setInitialized(true);
  }, [existing.data, initialized, navigate, reset, snapshotOf]);

  const dirty = initialized && snapshotOf(meta, rows) !== savedSnapshot;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !saving && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  useEffect(() => {
    if (pendingFocus.current) {
      refs.current.get(pendingFocus.current)?.focus();
      pendingFocus.current = null;
    }
  });

  const update = (key: string, field: keyof Row, value: unknown) => commit((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)), `${key}:${field}`);
  const addRow = (afterIndex?: number, focus = true) => {
    const row = emptyRow();
    commit((rs) => {
      const i = afterIndex === undefined ? rs.length : afterIndex + 1;
      return [...rs.slice(0, i), row, ...rs.slice(i)];
    });
    if (focus) pendingFocus.current = `${row.key}:term`;
  };
  const removeRow = (key: string) => commit((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : [emptyRow()]));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length || from === to) return;
    commit((rs) => {
      const copy = [...rs];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      return copy;
    });
  };

  const save = async () => {
    setError(null);
    if (!meta.title.trim()) {
      setError('Donne un titre à ton set.');
      document.getElementById('set-title')?.focus();
      return;
    }
    const cards = rows
      .filter((r) => r.term.trim() || r.definition.trim())
      .map((r) => ({ id: r.id, term: r.term.trim(), definition: r.definition.trim(), example: r.example.trim(), note: r.note.trim(), image: r.image, audio: r.audio, tags: r.tags }));
    const incomplete = cards.findIndex((c) => !c.term || !c.definition);
    if (incomplete >= 0) {
      setError(`La carte n° ${incomplete + 1} n’a pas de ${cards[incomplete].term ? 'définition' : 'terme'}.`);
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const r = await api<{ id: number }>('/sets', { body: { ...meta, cards } });
        setSavedSnapshot(snapshotOf(meta, rows));
        toast('Set créé ! Prêt à étudier.', 'success');
        navigate(`/sets/${r.id}`, { replace: true });
      } else {
        const isOwner = existing.data?.set.permission === 'owner';
        const { folderId, ...rest } = meta;
        await api(`/sets/${id}`, { method: 'PATCH', body: isOwner ? meta : rest });
        const r = await api<{ cards: { id: number }[] }>(`/sets/${id}/cards`, { method: 'PUT', body: { cards } });
        void folderId;
        const filled = rows.filter((x) => x.term.trim() || x.definition.trim());
        const withIds = filled.map((x, i) => ({ ...x, id: r.cards[i]?.id }));
        reset(withIds.length ? withIds : [emptyRow()]);
        setSavedSnapshot(snapshotOf(meta, withIds));
        toast('Modifications enregistrées.', 'success');
        navigate(`/sets/${id}`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Raccourcis globaux de l'éditeur : annuler, rétablir, enregistrer.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        redo();
      } else if (k === 's') {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const onFieldKey = (e: ReactKeyboardEvent<HTMLTextAreaElement>, index: number, field: 'term' | 'definition') => {
    const row = rows[index];
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const to = e.key === 'ArrowUp' ? index - 1 : index + 1;
      move(index, to);
      pendingFocus.current = `${row.key}:${field}`;
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (field === 'term') refs.current.get(`${row.key}:definition`)?.focus();
      else if (index === rows.length - 1) addRow(index);
      else refs.current.get(`${rows[index + 1].key}:term`)?.focus();
    }
  };

  const onImport = (cards: { term: string; definition: string; example?: string; note?: string }[], newMeta?: Partial<Meta>) => {
    commit((rs) => [
      ...rs.filter((r) => r.term.trim() || r.definition.trim()),
      ...cards.map((c) => ({ ...emptyRow(), term: c.term, definition: c.definition, example: c.example ?? '', note: c.note ?? '' })),
    ]);
    if (newMeta) setMeta((m) => ({ ...m, ...Object.fromEntries(Object.entries(newMeta).filter(([, v]) => v !== undefined && v !== '')), title: m.title || newMeta.title || '' }));
    setImportOpen(false);
    toast(`${cards.length} carte${cards.length > 1 ? 's' : ''} ajoutée${cards.length > 1 ? 's' : ''}.`, 'success');
  };

  const filledCount = useMemo(() => rows.filter((r) => r.term.trim() || r.definition.trim()).length, [rows]);

  if (!isNew && existing.loading && !initialized) return <Spinner />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={existing.reload} />;

  const isOwner = isNew || existing.data?.set.permission === 'owner';

  return (
    <div className="pb-24">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link to={isNew ? '/sets' : `/sets/${id}`} className="inline-flex min-h-11 items-center gap-1 text-ink-soft hover:text-ink">
          ← {isNew ? 'Mes sets' : 'Retour au set'}
        </Link>
        <h1 className="sr-only">{isNew ? 'Nouveau set' : 'Modifier le set'}</h1>
      </div>

      <section className="card mb-6 space-y-4 p-5" aria-label="Informations du set">
        <div>
          <label htmlFor="set-title" className="label">
            Titre
          </label>
          <input
            id="set-title"
            className="input font-display text-2xl"
            placeholder="Ex. Anglais — les animaux"
            value={meta.title}
            onChange={(e) => setMeta({ ...meta, title: e.target.value })}
            maxLength={200}
            autoFocus={isNew && !importOpen}
          />
        </div>
        <div>
          <label htmlFor="set-desc" className="label">
            Description <span className="font-normal">(facultatif)</span>
          </label>
          <AutoTextarea id="set-desc" value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} maxLength={2000} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="term-lang" className="label">
              Langue des termes
            </label>
            <select id="term-lang" className="input" value={meta.termLang} onChange={(e) => setMeta({ ...meta, termLang: e.target.value })}>
              {LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="def-lang" className="label">
              Langue des définitions
            </label>
            <select id="def-lang" className="input" value={meta.defLang} onChange={(e) => setMeta({ ...meta, defLang: e.target.value })}>
              {LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          {isOwner && (
            <div>
              <label htmlFor="folder" className="label">
                Dossier
              </label>
              <select id="folder" className="input" value={meta.folderId ?? ''} onChange={(e) => setMeta({ ...meta, folderId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Aucun</option>
                {folders.data?.folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <fieldset>
            <legend className="label">Couleur</legend>
            <div className="flex flex-wrap gap-1.5">
              {SET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setMeta({ ...meta, color: c })}
                  aria-label={`Couleur ${c}`}
                  aria-pressed={meta.color === c}
                  className={`size-9 rounded-full border-2 transition ${meta.color === c ? 'scale-110 border-ink' : 'border-transparent'}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </fieldset>
        </div>
        <div>
          <label htmlFor="set-tags" className="label">
            Tags
          </label>
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-surface p-1.5">
            {meta.tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pr-1 pl-3 text-sm">
                #{t}
                <button type="button" className="rounded-full p-1 hover:bg-line" onClick={() => setMeta({ ...meta, tags: meta.tags.filter((x) => x !== t) })} aria-label={`Retirer le tag ${t}`}>
                  <Icon name="close" size={14} />
                </button>
              </span>
            ))}
            <input
              id="set-tags"
              className="min-h-9 min-w-32 flex-1 bg-transparent px-2 focus:outline-none"
              placeholder={meta.tags.length ? '' : 'langue, cours… (Entrée pour ajouter)'}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
                  e.preventDefault();
                  const t = tagInput.trim().replace(/^#/, '').slice(0, 32);
                  if (!meta.tags.includes(t) && meta.tags.length < 20) setMeta({ ...meta, tags: [...meta.tags, t] });
                  setTagInput('');
                } else if (e.key === 'Backspace' && !tagInput && meta.tags.length) setMeta({ ...meta, tags: meta.tags.slice(0, -1) });
              }}
            />
          </div>
        </div>
      </section>

      <div className="sticky top-16 z-20 -mx-4 mb-3 flex flex-wrap items-center gap-2 border-b border-line bg-bg/95 px-4 py-2 backdrop-blur">
        <h2 className="mr-auto text-xl font-semibold">
          Cartes <span className="text-base font-normal text-ink-soft">({filledCount})</span>
        </h2>
        <button type="button" className="btn-icon" onClick={undo} disabled={!history.canUndo} aria-label="Annuler (Ctrl+Z)">
          <Icon name="undo" />
        </button>
        <button type="button" className="btn-icon" onClick={redo} disabled={!history.canRedo} aria-label="Rétablir (Ctrl+Y)">
          <Icon name="redo" />
        </button>
        <button type="button" className="btn-secondary" onClick={() => setImportOpen(true)}>
          <Icon name="upload" size={20} /> Importer
        </button>
      </div>
      <p className="mb-3 text-sm text-ink-soft">
        <kbd className="rounded border border-line px-1">Entrée</kbd> pour passer au champ suivant et créer une carte,{' '}
        <kbd className="rounded border border-line px-1">Maj+Entrée</kbd> pour un retour à la ligne, <kbd className="rounded border border-line px-1">Alt+↑/↓</kbd> pour déplacer.
      </p>

      <ol className="space-y-3" aria-label="Liste des cartes">
        {rows.map((row, index) => {
          const isOpen = expanded.has(row.key);
          return (
            <li
              key={row.key}
              className={`card row-auto p-3 transition ${overIndex === index && dragIndex !== null ? 'ring-2 ring-accent' : ''} ${dragIndex === index ? 'opacity-50' : ''}`}
              onDragOver={(e) => {
                if (dragIndex === null) return;
                e.preventDefault();
                setOverIndex(index);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) move(dragIndex, index);
                setDragIndex(null);
                setOverIndex(null);
              }}
            >
              <div className="flex items-start gap-2">
                <div className="flex flex-col items-center pt-1">
                  <span className="w-8 text-center text-sm font-semibold text-ink-soft" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span
                    draggable
                    onDragStart={(e) => {
                      setDragIndex(index);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => {
                      setDragIndex(null);
                      setOverIndex(null);
                    }}
                    className="hidden cursor-grab rounded p-1 text-ink-soft hover:bg-surface-2 active:cursor-grabbing sm:block"
                    title="Glisser pour déplacer"
                    aria-hidden="true"
                  >
                    <Icon name="grip" size={20} />
                  </span>
                </div>
                <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-2">
                  <div>
                    <label htmlFor={`${row.key}-term`} className="sr-only">
                      Terme de la carte {index + 1}
                    </label>
                    <AutoTextarea
                      id={`${row.key}-term`}
                      ref={(el) => {
                        if (el) refs.current.set(`${row.key}:term`, el);
                        else refs.current.delete(`${row.key}:term`);
                      }}
                      placeholder="Terme"
                      value={row.term}
                      lang={meta.termLang}
                      onChange={(e) => update(row.key, 'term', e.target.value)}
                      onKeyDown={(e) => onFieldKey(e, index, 'term')}
                      maxLength={2000}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${row.key}-def`} className="sr-only">
                      Définition de la carte {index + 1}
                    </label>
                    <AutoTextarea
                      id={`${row.key}-def`}
                      ref={(el) => {
                        if (el) refs.current.set(`${row.key}:definition`, el);
                        else refs.current.delete(`${row.key}:definition`);
                      }}
                      placeholder="Définition"
                      value={row.definition}
                      lang={meta.defLang}
                      onChange={(e) => update(row.key, 'definition', e.target.value)}
                      onKeyDown={(e) => onFieldKey(e, index, 'definition')}
                      maxLength={4000}
                    />
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row">
                  <button
                    type="button"
                    className={`btn-icon ${row.example || row.note || row.image || row.audio ? 'text-accent' : ''}`}
                    aria-expanded={isOpen}
                    aria-label={`Options de la carte ${index + 1} (exemple, note, image, audio)`}
                    onClick={() =>
                      setExpanded((s) => {
                        const n = new Set(s);
                        if (n.has(row.key)) n.delete(row.key);
                        else n.add(row.key);
                        return n;
                      })
                    }
                  >
                    <Icon name="chevronDown" className={`transition ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <button type="button" className="btn-icon hover:text-danger" onClick={() => removeRow(row.key)} aria-label={`Supprimer la carte ${index + 1}`}>
                    <Icon name="trash" size={20} />
                  </button>
                </div>
              </div>
              {isOpen && <RowOptions row={row} index={index} onChange={(field, v) => update(row.key, field, v)} onMove={(dir) => move(index, index + dir)} />}
            </li>
          );
        })}
      </ol>

      <button type="button" className="btn-secondary mt-3 w-full border-dashed" onClick={() => addRow()}>
        <Icon name="plus" size={20} /> Ajouter une carte
      </button>

      <div className="no-print fixed inset-x-0 bottom-16 z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:bottom-0">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          {error ? (
            <p className="flex-1 text-danger" role="alert">
              {error}
            </p>
          ) : (
            <p className="flex-1 text-sm text-ink-soft" aria-live="polite">
              {dirty ? 'Modifications non enregistrées' : 'Tout est enregistré'}
            </p>
          )}
          <button type="button" className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Enregistrement…' : isNew ? 'Créer le set' : 'Enregistrer'}
          </button>
        </div>
      </div>

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImport={onImport} />
      <ConfirmModal
        open={blocker.state === 'blocked'}
        title="Quitter sans enregistrer ?"
        message="Tes dernières modifications seront perdues."
        confirmLabel="Quitter quand même"
        danger
        onConfirm={() => blocker.proceed?.()}
        onClose={() => blocker.reset?.()}
      />
    </div>
  );
}

function RowOptions({ row, index, onChange, onMove }: { row: Row; index: number; onChange: (f: keyof Row, v: unknown) => void; onMove: (dir: number) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<'image' | 'audio' | null>(null);
  const upload = async (file: File | undefined, kind: 'image' | 'audio') => {
    if (!file) return;
    setBusy(kind);
    try {
      const r = await uploadMedia(file);
      onChange(kind, r.id);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="mt-3 grid gap-3 border-t border-line pt-3 md:grid-cols-2">
      <div>
        <label htmlFor={`${row.key}-ex`} className="label">
          Exemple de phrase
        </label>
        <AutoTextarea id={`${row.key}-ex`} value={row.example} onChange={(e) => onChange('example', e.target.value)} maxLength={2000} />
      </div>
      <div>
        <label htmlFor={`${row.key}-note`} className="label">
          Note
        </label>
        <AutoTextarea id={`${row.key}-note`} value={row.note} onChange={(e) => onChange('note', e.target.value)} maxLength={2000} />
      </div>
      <div>
        <span className="label">Image</span>
        {row.image ? (
          <div className="flex items-center gap-2">
            <img src={mediaUrl(row.image)} alt="" className="h-20 rounded-lg object-cover" />
            <button type="button" className="btn-ghost" onClick={() => onChange('image', null)}>
              Retirer
            </button>
          </div>
        ) : (
          <label className="btn-secondary cursor-pointer">
            <Icon name="image" size={20} /> {busy === 'image' ? 'Envoi…' : 'Ajouter une image'}
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => upload(e.target.files?.[0], 'image')} />
          </label>
        )}
      </div>
      <div>
        <span className="label">Audio (sinon : synthèse vocale)</span>
        {row.audio ? (
          <div className="flex items-center gap-2">
            <audio src={mediaUrl(row.audio)} controls className="h-11 max-w-full" />
            <button type="button" className="btn-ghost" onClick={() => onChange('audio', null)}>
              Retirer
            </button>
          </div>
        ) : (
          <label className="btn-secondary cursor-pointer">
            <Icon name="mic" size={20} /> {busy === 'audio' ? 'Envoi…' : 'Ajouter un audio'}
            <input type="file" accept="audio/*" className="sr-only" onChange={(e) => upload(e.target.files?.[0], 'audio')} />
          </label>
        )}
      </div>
      <div className="md:col-span-2">
        <label htmlFor={`${row.key}-tags`} className="label">
          Tags de la carte <span className="font-normal">(séparés par des virgules)</span>
        </label>
        <input
          id={`${row.key}-tags`}
          className="input"
          defaultValue={row.tags.join(', ')}
          placeholder="verbe, irrégulier…"
          onBlur={(e) =>
            onChange(
              'tags',
              [...new Set(e.target.value.split(',').map((t) => t.trim().replace(/^#/, '').slice(0, 32)).filter(Boolean))].slice(0, 20),
            )
          }
        />
      </div>
      <div className="flex gap-2 md:col-span-2">
        <button type="button" className="btn-ghost" onClick={() => onMove(-1)} disabled={index === 0}>
          ↑ Monter
        </button>
        <button type="button" className="btn-ghost" onClick={() => onMove(1)}>
          ↓ Descendre
        </button>
      </div>
    </div>
  );
}
