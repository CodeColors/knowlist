import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { api, download, mediaUrl } from '../lib/api';
import { dateTime } from '../lib/format';
import { useApi, useDocumentTitle } from '../lib/hooks';
import { MODE_INFO } from '../lib/study';
import { langLabel, playCard } from '../lib/tts';
import type { Card, SetDetail } from '../lib/types';
import { Icon } from '../components/Icon';
import { ConfirmModal, Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { ErrorBox, ProgressBar, Spinner } from '../components/ui';

export default function SetView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { data, setData, error, loading, reload } = useApi<SetDetail>(`/sets/${id}`);
  useDocumentTitle(data?.set.title ?? 'Set');
  const [shareOpen, setShareOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [filter, setFilter] = useState<'all' | 'starred' | 'difficult'>('all');

  const cards = useMemo(() => {
    const list = data?.cards ?? [];
    if (filter === 'starred') return list.filter((c) => c.starred);
    if (filter === 'difficult') return list.filter((c) => c.progress?.difficult);
    return list;
  }, [data, filter]);

  const virtualizer = useWindowVirtualizer({ count: cards.length, estimateSize: () => 84, overscan: 8 });

  useEffect(() => {
    const m = /#carte-(\d+)/.exec(location.hash);
    if (!m || !data) return;
    const idx = cards.findIndex((c) => c.id === Number(m[1]));
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: 'center' });
  }, [location.hash, data, cards, virtualizer]);

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;
  const { set } = data;
  const canEdit = set.permission !== 'read';
  const isOwner = set.permission === 'owner';
  const mastered = data.cards.filter((c) => c.progress?.mastered).length;
  const starredCount = data.cards.filter((c) => c.starred).length;
  const difficultCount = data.cards.filter((c) => c.progress?.difficult).length;
  const dueCount = data.cards.filter((c) => c.progress && new Date(c.progress.dueAt) <= new Date()).length;

  const toggleStar = async (card: Card) => {
    const starred = !card.starred;
    setData((d) => d && { ...d, cards: d.cards.map((c) => (c.id === card.id ? { ...c, starred } : c)) });
    try {
      await api(`/sets/${set.id}/cards/${card.id}/star`, { method: 'PUT', body: { starred } });
    } catch (e) {
      toast((e as Error).message, 'error');
      void reload();
    }
  };

  const duplicate = async () => {
    try {
      const r = await api<{ id: number }>(`/sets/${set.id}/duplicate`, { body: {} });
      toast(isOwner ? 'Set dupliqué.' : 'Copie ajoutée à tes sets.', 'success');
      navigate(`/sets/${r.id}`);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const remove = async () => {
    await api(`/sets/${set.id}`, { method: 'DELETE' });
    toast('Set supprimé.', 'success');
    navigate('/sets');
  };

  return (
    <div>
      <Link to="/sets" className="mb-2 inline-flex min-h-11 items-center gap-1 text-ink-soft hover:text-ink">
        ← Mes sets
      </Link>
      <header className="card mb-6 overflow-hidden">
        <div className="h-2" style={{ background: set.color }} aria-hidden="true" />
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-3xl font-semibold break-words md:text-4xl">{set.title}</h1>
              <p className="mt-1 text-ink-soft">
                {set.cardCount} carte{set.cardCount > 1 ? 's' : ''} · {langLabel(set.termLang)} → {langLabel(set.defLang)}
                {!isOwner && ` · par ${set.ownerName}`}
                {set.permission === 'read' && ' · lecture seule'}
              </p>
              {set.description && <p className="mt-2 max-w-2xl whitespace-pre-line">{set.description}</p>}
              {set.tags.length > 0 && (
                <p className="mt-2 flex flex-wrap gap-1">
                  {set.tags.map((t) => (
                    <Link key={t} to={`/sets?tag=${encodeURIComponent(t)}`} className="rounded-full bg-surface-2 px-2 text-sm text-ink-soft hover:text-ink">
                      #{t}
                    </Link>
                  ))}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {canEdit && (
                <Link to={`/sets/${set.id}/modifier`} className="btn-secondary">
                  <Icon name="edit" size={20} /> Modifier
                </Link>
              )}
              <details className="relative">
                <summary className="btn-icon list-none border border-line [&::-webkit-details-marker]:hidden" aria-label="Plus d’actions">
                  <Icon name="more" />
                </summary>
                <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-line bg-surface p-1 shadow-lift">
                  <MenuButton icon="copy" onClick={duplicate}>
                    {isOwner ? 'Dupliquer' : 'Copier dans mes sets'}
                  </MenuButton>
                  {isOwner && (
                    <MenuButton icon="share" onClick={() => setShareOpen(true)}>
                      Partager
                    </MenuButton>
                  )}
                  {canEdit && (
                    <MenuButton icon="history" onClick={() => setVersionsOpen(true)}>
                      Historique des versions
                    </MenuButton>
                  )}
                  <MenuButton icon="print" onClick={() => navigate(`/sets/${set.id}/imprimer`)}>
                    Imprimer / PDF
                  </MenuButton>
                  {(['csv', 'tsv', 'json'] as const).map((f) => (
                    <MenuButton key={f} icon="download" onClick={() => download(`/sets/${set.id}/export?format=${f}`, `set.${f}`).catch((e) => toast(e.message, 'error'))}>
                      Exporter en {f.toUpperCase()}
                    </MenuButton>
                  ))}
                  {isOwner && (
                    <MenuButton icon="trash" danger onClick={() => setConfirmDelete(true)}>
                      Supprimer
                    </MenuButton>
                  )}
                  {!isOwner && set.permission && (
                    <MenuButton
                      icon="close"
                      onClick={async () => {
                        await api(`/sets/${set.id}/shares/me`, { method: 'DELETE' });
                        navigate('/sets');
                      }}
                    >
                      Retirer de mes sets
                    </MenuButton>
                  )}
                </div>
              </details>
            </div>
          </div>
          <div className="mt-4 max-w-md">
            <ProgressBar value={mastered} max={set.cardCount} label={`${mastered} cartes maîtrisées sur ${set.cardCount}`} color={set.color} />
            <p className="mt-1 text-sm text-ink-soft">
              {mastered} maîtrisée{mastered > 1 ? 's' : ''} · {data.cards.filter((c) => c.progress && !c.progress.mastered).length} en cours ·{' '}
              {data.cards.filter((c) => !c.progress).length} jamais vue{data.cards.filter((c) => !c.progress).length > 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </header>

      {set.cardCount === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-lg">Ce set est encore vide.</p>
          {canEdit && (
            <Link to={`/sets/${set.id}/modifier`} className="btn-primary mt-4">
              Ajouter des cartes
            </Link>
          )}
        </div>
      ) : (
        <section aria-labelledby="modes-title" className="mb-8">
          <h2 id="modes-title" className="mb-3 text-2xl font-semibold">
            Étudier
          </h2>
          {dueCount > 0 && (
            <Link to={`/revision?set=${set.id}`} className="card mb-3 flex items-center gap-3 border-accent/40 bg-accent-soft p-4 text-accent hover:shadow-lift">
              <Icon name="calendar" />
              <span className="font-semibold">
                {dueCount} carte{dueCount > 1 ? 's' : ''} à réviser aujourd’hui dans ce set
              </span>
              <Icon name="arrowRight" className="ml-auto" />
            </Link>
          )}
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {Object.entries(MODE_INFO).map(([mode, info]) => (
              <li key={mode}>
                <Link to={`/sets/${set.id}/etude/${mode}`} className="card flex h-full flex-col gap-1 p-4 transition hover:-translate-y-0.5 hover:shadow-lift">
                  <span className="text-2xl" aria-hidden="true">
                    {info.emoji}
                  </span>
                  <span className="text-lg font-semibold">{info.label}</span>
                  <span className="hidden text-sm text-ink-soft sm:block">{info.desc}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {set.cardCount > 0 && (
        <section aria-labelledby="cards-title">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="cards-title" className="text-2xl font-semibold">
              Cartes
            </h2>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer les cartes">
              {[
                ['all', `Toutes (${data.cards.length})`],
                ['starred', `★ Étoilées (${starredCount})`],
                ['difficult', `Difficiles (${difficultCount})`],
              ].map(([k, label]) => (
                <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k as typeof filter)} className={`chip ${filter === k ? 'border-accent bg-accent-soft text-accent' : ''}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {cards.length === 0 ? (
            <p className="card p-6 text-center text-ink-soft">
              {filter === 'starred' ? 'Aucune carte étoilée : touche l’étoile d’une carte pour la retravailler à part.' : 'Aucune carte difficile pour l’instant. 👏'}
            </p>
          ) : (
            <ul className="relative" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((v) => {
                const c = cards[v.index];
                return (
                  <li
                    key={c.id}
                    id={`carte-${c.id}`}
                    data-index={v.index}
                    ref={virtualizer.measureElement}
                    className="absolute inset-x-0 pb-2"
                    style={{ transform: `translateY(${v.start - virtualizer.options.scrollMargin}px)` }}
                  >
                    <CardRow card={c} set={set} onStar={() => toggleStar(c)} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {isOwner && <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} detail={data} onChange={reload} />}
      {canEdit && <VersionsModal open={versionsOpen} onClose={() => setVersionsOpen(false)} setId={set.id} onRestored={reload} />}
      <ConfirmModal
        open={confirmDelete}
        title="Supprimer ce set ?"
        message={`« ${set.title} » et ses ${set.cardCount} cartes seront définitivement supprimés, ainsi que la progression associée.`}
        confirmLabel="Supprimer définitivement"
        danger
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function MenuButton({ icon, children, onClick, danger }: { icon: string; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        (e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open');
        onClick();
      }}
      className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left hover:bg-surface-2 ${danger ? 'text-danger' : ''}`}
    >
      <Icon name={icon} size={20} /> {children}
    </button>
  );
}

function CardRow({ card, set, onStar }: { card: Card; set: SetDetail['set']; onStar: () => void }) {
  const status = !card.progress ? null : card.progress.mastered ? 'Maîtrisée' : card.progress.difficult ? 'À retravailler' : 'En cours';
  return (
    <div className="card flex items-start gap-3 p-4">
      <div className="grid min-w-0 flex-1 gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:gap-4">
        <div className="min-w-0">
          <p className="font-semibold break-words" lang={set.termLang}>
            {card.term}
          </p>
          {status && (
            <span
              className={`mt-1 inline-block rounded-full px-2 text-xs font-semibold ${
                card.progress?.mastered ? 'bg-ok-soft text-ok' : card.progress?.difficult ? 'bg-warn-soft text-warn' : 'bg-surface-2 text-ink-soft'
              }`}
            >
              {status}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="break-words whitespace-pre-line" lang={set.defLang}>
            {card.definition}
          </p>
          {card.example && <p className="mt-1 text-sm text-ink-soft italic">« {card.example} »</p>}
        </div>
      </div>
      {card.image && <img src={mediaUrl(card.image)} alt="" className="size-14 shrink-0 rounded-lg object-cover" loading="lazy" />}
      <div className="flex shrink-0 flex-col sm:flex-row">
        <button type="button" className="btn-icon" onClick={() => void playCard(card.term, set.termLang, mediaUrl(card.audio))} aria-label={`Écouter « ${card.term} »`}>
          <Icon name="volume" size={20} />
        </button>
        <button type="button" className={`btn-icon ${card.starred ? 'text-accent' : ''}`} onClick={onStar} aria-pressed={card.starred} aria-label={card.starred ? 'Retirer l’étoile' : 'Marquer d’une étoile'}>
          <Icon name="star" size={20} filled={card.starred} />
        </button>
      </div>
    </div>
  );
}

function ShareModal({ open, onClose, detail, onChange }: { open: boolean; onClose: () => void; detail: SetDetail; onChange: () => void }) {
  const toast = useToast();
  const dir = useApi<{ users: { id: number; username: string; displayName: string }[] }>(open ? '/users/directory' : null);
  const [username, setUsername] = useState('');
  const [permission, setPermission] = useState<'read' | 'edit'>('read');
  const link = `${location.origin}/sets/${detail.set.id}`;
  const shared = new Set(detail.shares?.map((s) => s.username));

  const add = async () => {
    if (!username) return;
    try {
      await api(`/sets/${detail.set.id}/shares`, { body: { username, permission } });
      setUsername('');
      onChange();
      toast('Partage enregistré.', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Partager le set" size="lg">
      <div className="space-y-6">
        <section>
          <h3 className="mb-2 font-semibold">Avec une personne du site</h3>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="share-user" className="sr-only">
              Personne
            </label>
            <select id="share-user" className="input sm:flex-1" value={username} onChange={(e) => setUsername(e.target.value)}>
              <option value="">Choisir une personne…</option>
              {dir.data?.users
                .filter((u) => !shared.has(u.username))
                .map((u) => (
                  <option key={u.id} value={u.username}>
                    {u.displayName} ({u.username})
                  </option>
                ))}
            </select>
            <label htmlFor="share-perm" className="sr-only">
              Droits
            </label>
            <select id="share-perm" className="input sm:w-48" value={permission} onChange={(e) => setPermission(e.target.value as 'read' | 'edit')}>
              <option value="read">Lecture seule</option>
              <option value="edit">Modification</option>
            </select>
            <button type="button" className="btn-primary" onClick={add} disabled={!username}>
              Partager
            </button>
          </div>
          {detail.shares && detail.shares.length > 0 && (
            <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
              {detail.shares.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="flex-1">
                    {s.displayName} <span className="text-sm text-ink-soft">({s.username})</span>
                  </span>
                  <select
                    aria-label={`Droits de ${s.displayName}`}
                    className="input w-auto"
                    value={s.permission}
                    onChange={async (e) => {
                      await api(`/sets/${detail.set.id}/shares`, { body: { username: s.username, permission: e.target.value } });
                      onChange();
                    }}
                  >
                    <option value="read">Lecture seule</option>
                    <option value="edit">Modification</option>
                  </select>
                  <button
                    type="button"
                    className="btn-icon"
                    aria-label={`Retirer le partage avec ${s.displayName}`}
                    onClick={async () => {
                      await api(`/sets/${detail.set.id}/shares/${s.id}`, { method: 'DELETE' });
                      onChange();
                    }}
                  >
                    <Icon name="trash" size={20} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3 className="mb-2 font-semibold">Lien interne</h3>
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm text-ink-soft">
              Toute personne connectée à KnowList qui a ce lien peut consulter le set en lecture seule, l’étudier et en faire une copie.
            </p>
            <button
              type="button"
              role="switch"
              aria-checked={detail.set.linkAccess}
              aria-label="Activer le lien interne"
              onClick={async () => {
                await api(`/sets/${detail.set.id}`, { method: 'PATCH', body: { linkAccess: !detail.set.linkAccess } });
                onChange();
              }}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${detail.set.linkAccess ? 'bg-accent' : 'bg-line'}`}
            >
              <span className={`inline-block size-5 rounded-full bg-surface shadow transition ${detail.set.linkAccess ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          {detail.set.linkAccess && (
            <div className="mt-2 flex gap-2">
              <input className="input font-mono text-sm" readOnly value={link} aria-label="Lien du set" onFocus={(e) => e.target.select()} />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => navigator.clipboard.writeText(link).then(() => toast('Lien copié.', 'success'))}
              >
                <Icon name="link" size={20} /> Copier
              </button>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}

function VersionsModal({ open, onClose, setId, onRestored }: { open: boolean; onClose: () => void; setId: number; onRestored: () => void }) {
  const toast = useToast();
  const v = useApi<{ versions: { id: number; createdAt: string; cardCount: number; author: string | null }[] }>(open ? `/sets/${setId}/versions` : null);
  return (
    <Modal open={open} onClose={onClose} title="Historique des versions">
      <p className="mb-3 text-ink-soft">Une version est enregistrée avant chaque modification des cartes (30 dernières). Restaurer une version conserve l’état actuel dans l’historique.</p>
      {v.loading && <Spinner />}
      {v.data && v.data.versions.length === 0 && <p className="text-ink-soft">Aucune version antérieure pour l’instant.</p>}
      <ul className="divide-y divide-line">
        {v.data?.versions.map((ver) => (
          <li key={ver.id} className="flex items-center gap-3 py-2">
            <div className="flex-1">
              <p className="font-semibold">{dateTime(ver.createdAt)}</p>
              <p className="text-sm text-ink-soft">
                {ver.cardCount} cartes{ver.author ? ` · avant modification par ${ver.author}` : ''}
              </p>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={async () => {
                await api(`/sets/${setId}/versions/${ver.id}/restore`, { body: {} });
                toast('Version restaurée.', 'success');
                onClose();
                onRestored();
              }}
            >
              Restaurer
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
