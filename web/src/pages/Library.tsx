import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../lib/api';
import { relativeTime } from '../lib/format';
import { useApi, useDebounced, useDocumentTitle } from '../lib/hooks';
import type { Folder, SetSummary } from '../lib/types';
import { Icon } from '../components/Icon';
import { ConfirmModal, Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { EmptyState, ErrorBox, PageHeader, ProgressBar, Spinner } from '../components/ui';

type Scope = 'all' | 'mine' | 'shared';

export default function Library() {
  useDocumentTitle('Mes sets');
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const sets = useApi<{ sets: SetSummary[] }>('/sets');
  const folders = useApi<{ folders: Folder[] }>('/folders');
  const [q, setQ] = useState(params.get('q') ?? '');
  const dq = useDebounced(q.trim(), 200);
  const [cardHits, setCardHits] = useState<{ id: number; term: string; definition: string; setId: number; setTitle: string; color: string }[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const scope = (params.get('vue') as Scope) || 'all';
  const folderId = params.get('dossier') ? Number(params.get('dossier')) : null;
  const tag = params.get('tag');
  const [folderModal, setFolderModal] = useState<{ id?: number; name: string } | null>(null);
  const [deleteFolder, setDeleteFolder] = useState<Folder | null>(null);

  useEffect(() => {
    if (params.get('recherche')) searchRef.current?.focus();
  }, [params]);

  useEffect(() => {
    if (dq.length < 2) return setCardHits([]);
    const ctrl = new AbortController();
    api('/search', { query: { q: dq }, signal: ctrl.signal })
      .then((r) => setCardHits(r.cards))
      .catch(() => {});
    return () => ctrl.abort();
  }, [dq]);

  const setParam = (k: string, v: string | null) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    p.delete('recherche');
    setParams(p, { replace: true });
  };

  const allTags = useMemo(() => [...new Set((sets.data?.sets ?? []).flatMap((s) => s.tags))].sort(), [sets.data]);

  const filtered = useMemo(() => {
    let list = sets.data?.sets ?? [];
    if (scope === 'mine') list = list.filter((s) => s.permission === 'owner');
    if (scope === 'shared') list = list.filter((s) => s.permission !== 'owner');
    if (folderId) list = list.filter((s) => s.folderId === folderId);
    if (tag) list = list.filter((s) => s.tags.includes(tag));
    if (q.trim()) {
      const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
      const n = norm(q.trim());
      list = list.filter((s) => norm(`${s.title} ${s.description} ${s.tags.join(' ')}`).includes(n));
    }
    return list;
  }, [sets.data, scope, folderId, tag, q]);

  const saveFolder = async () => {
    if (!folderModal?.name.trim()) return;
    try {
      if (folderModal.id) await api(`/folders/${folderModal.id}`, { method: 'PATCH', body: { name: folderModal.name } });
      else await api('/folders', { body: { name: folderModal.name } });
      setFolderModal(null);
      void folders.reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const removeFolder = async () => {
    if (!deleteFolder) return;
    await api(`/folders/${deleteFolder.id}`, { method: 'DELETE' });
    setDeleteFolder(null);
    if (folderId === deleteFolder.id) setParam('dossier', null);
    void folders.reload();
    void sets.reload();
    toast('Dossier supprimé. Ses sets sont toujours là.', 'success');
  };

  const currentFolder = folders.data?.folders.find((f) => f.id === folderId);

  return (
    <div>
      <PageHeader
        title="Mes sets"
        subtitle={sets.data ? `${sets.data.sets.length} set${sets.data.sets.length > 1 ? 's' : ''}` : undefined}
        actions={
          <>
            <Link to="/sets/nouveau?importer=1" className="btn-secondary">
              <Icon name="upload" size={20} /> Importer
            </Link>
            <Link to="/sets/nouveau" className="btn-primary">
              <Icon name="plus" size={20} /> Nouveau set
            </Link>
          </>
        }
      />

      <div className="mb-4">
        <label htmlFor="lib-search" className="sr-only">
          Rechercher dans les sets et les cartes
        </label>
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-soft" />
          <input
            id="lib-search"
            ref={searchRef}
            type="search"
            className="input pl-11"
            placeholder="Rechercher un set, un mot, une définition…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2" role="group" aria-label="Filtres">
        {(['all', 'mine', 'shared'] as Scope[]).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={scope === s}
            onClick={() => setParam('vue', s === 'all' ? null : s)}
            className={`chip ${scope === s ? 'border-accent bg-accent-soft text-accent' : ''}`}
          >
            {s === 'all' ? 'Tous' : s === 'mine' ? 'Créés par moi' : 'Partagés avec moi'}
          </button>
        ))}
        <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />
        {folders.data?.folders.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={folderId === f.id}
            onClick={() => setParam('dossier', folderId === f.id ? null : String(f.id))}
            className={`chip ${folderId === f.id ? 'border-sage bg-sage-soft text-sage-ink' : ''}`}
          >
            <Icon name="folder" size={16} /> {f.name} <span className="text-xs">({f.setCount})</span>
          </button>
        ))}
        <button type="button" className="chip border-dashed" onClick={() => setFolderModal({ name: '' })}>
          <Icon name="plus" size={16} /> Dossier
        </button>
        {allTags.map((t) => (
          <button key={t} type="button" aria-pressed={tag === t} onClick={() => setParam('tag', tag === t ? null : t)} className={`chip ${tag === t ? 'border-ink bg-surface-2 text-ink' : ''}`}>
            #{t}
          </button>
        ))}
      </div>

      {currentFolder && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-ink-soft">
          <span>
            Dossier <strong className="text-ink">{currentFolder.name}</strong>
          </span>
          <button type="button" className="link text-sm" onClick={() => setFolderModal({ id: currentFolder.id, name: currentFolder.name })}>
            Renommer
          </button>
          <button type="button" className="link text-sm" onClick={() => setDeleteFolder(currentFolder)}>
            Supprimer
          </button>
        </div>
      )}

      {sets.loading && !sets.data && <Spinner />}
      <ErrorBox error={sets.error} onRetry={sets.reload} />

      {sets.data && sets.data.sets.length === 0 && (
        <EmptyState
          emoji="📒"
          title="Crée ton premier set"
          action={
            <Link to="/sets/nouveau" className="btn-primary">
              <Icon name="plus" size={20} /> Créer un set
            </Link>
          }
        >
          Un set regroupe des cartes « terme – définition ». Tu peux aussi coller une liste depuis Quizlet ou un tableur.
        </EmptyState>
      )}

      {sets.data && sets.data.sets.length > 0 && filtered.length === 0 && (
        <p className="card p-6 text-center text-ink-soft">Aucun set ne correspond. Essaie un autre filtre ou un autre mot.</p>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((s) => (
          <li key={s.id}>
            <Link to={`/sets/${s.id}`} className="card flex h-full flex-col gap-2 p-5 transition hover:-translate-y-0.5 hover:shadow-lift">
              <div className="flex items-center justify-between gap-2">
                <div className="h-1.5 w-12 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                {(s.dueCount ?? 0) > 0 && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent">{s.dueCount} à revoir</span>}
              </div>
              <h2 className="text-xl font-semibold break-words">{s.title}</h2>
              {s.description && <p className="line-clamp-2 text-sm text-ink-soft">{s.description}</p>}
              <p className="text-sm text-ink-soft">
                {s.cardCount} carte{s.cardCount > 1 ? 's' : ''}
                {s.permission !== 'owner' && ` · de ${s.ownerName}`}
                {s.lastStudiedAt && ` · étudié ${relativeTime(s.lastStudiedAt)}`}
              </p>
              {s.tags.length > 0 && (
                <p className="flex flex-wrap gap-1">
                  {s.tags.map((t) => (
                    <span key={t} className="rounded-full bg-surface-2 px-2 text-xs text-ink-soft">
                      #{t}
                    </span>
                  ))}
                </p>
              )}
              <div className="mt-auto pt-2">
                <ProgressBar value={s.masteredCount ?? 0} max={s.cardCount} label={`${s.masteredCount ?? 0} cartes maîtrisées sur ${s.cardCount}`} color={s.color} />
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {cardHits.length > 0 && (
        <section className="mt-8" aria-labelledby="hits-title">
          <h2 id="hits-title" className="mb-3 text-xl font-semibold">
            Cartes correspondantes
          </h2>
          <ul className="card divide-y divide-line">
            {cardHits.map((c) => (
              <li key={c.id}>
                <Link to={`/sets/${c.setId}#carte-${c.id}`} className="flex flex-col gap-0.5 px-4 py-3 hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-4">
                  <span className="font-semibold sm:w-1/3">{c.term}</span>
                  <span className="text-ink-soft sm:flex-1">{c.definition}</span>
                  <span className="flex items-center gap-1 text-xs text-ink-soft">
                    <span className="size-2 rounded-full" style={{ background: c.color }} aria-hidden="true" />
                    {c.setTitle}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal
        open={!!folderModal}
        onClose={() => setFolderModal(null)}
        title={folderModal?.id ? 'Renommer le dossier' : 'Nouveau dossier'}
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setFolderModal(null)}>
              Annuler
            </button>
            <button type="button" className="btn-primary" onClick={saveFolder} disabled={!folderModal?.name.trim()}>
              Enregistrer
            </button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void saveFolder();
          }}
        >
          <label htmlFor="folder-name" className="label">
            Nom du dossier
          </label>
          <input id="folder-name" className="input" autoFocus value={folderModal?.name ?? ''} onChange={(e) => setFolderModal((f) => f && { ...f, name: e.target.value })} maxLength={80} />
        </form>
      </Modal>
      <ConfirmModal
        open={!!deleteFolder}
        title="Supprimer le dossier ?"
        message={`Le dossier « ${deleteFolder?.name} » sera supprimé. Les sets qu’il contient ne sont pas supprimés.`}
        confirmLabel="Supprimer le dossier"
        danger
        onConfirm={removeFolder}
        onClose={() => setDeleteFolder(null)}
      />
    </div>
  );
}
