import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, nowIso } from '../db.js';
import { ACCESSIBLE_SETS_SQL, loadSet, type SetRow } from '../lib/access.js';
import { HttpError, getId, notFound, parse } from '../lib/http.js';
import { requireAuth } from '../lib/session.js';
import { getSettings } from '../lib/settings.js';
import { MASTERED_INTERVAL } from '../lib/srs.js';

const COLOR = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'couleur hexadécimale attendue');
const LANG = z.string().trim().min(2).max(16);
const TAGS = z.array(z.string().trim().min(1).max(32)).max(20);
const MEDIA_ID = z.string().regex(/^[a-f0-9-]{36}\.(webp|mp3|ogg|wav|webm|m4a)$/).nullable().optional();

export const cardInput = z.object({
  id: z.number().int().positive().optional(),
  term: z.string().max(2000),
  definition: z.string().max(4000),
  example: z.string().max(2000).optional().default(''),
  note: z.string().max(2000).optional().default(''),
  image: MEDIA_ID,
  audio: MEDIA_ID,
  tags: TAGS.optional().default([]),
});

const setMeta = z.object({
  title: z.string().trim().min(1, 'le titre est obligatoire').max(200),
  description: z.string().max(2000).optional().default(''),
  termLang: LANG.optional().default('fr'),
  defLang: LANG.optional().default('fr'),
  color: COLOR.optional().default('#c8603f'),
  folderId: z.number().int().positive().nullable().optional(),
  tags: TAGS.optional().default([]),
});

export function setView(s: SetRow & Record<string, any>, extra: Record<string, unknown> = {}) {
  return {
    id: s.id,
    ownerId: s.owner_id,
    ownerName: s.owner_name,
    folderId: s.folder_id,
    title: s.title,
    description: s.description,
    termLang: s.term_lang,
    defLang: s.def_lang,
    color: s.color,
    tags: JSON.parse(s.tags || '[]'),
    linkAccess: !!s.link_access,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    cardCount: s.card_count,
    ...extra,
  };
}

function checkFolder(folderId: number | null | undefined, userId: number) {
  if (folderId == null) return;
  const f = db().prepare('SELECT 1 FROM folders WHERE id = ? AND user_id = ?').get(folderId, userId);
  if (!f) throw new HttpError(400, 'Dossier introuvable.', 'validation');
}

function quotaCheck(userId: number, addedCards: number, addedSets = 0) {
  const s = getSettings();
  if (addedSets) {
    const { n } = db().prepare('SELECT COUNT(*) AS n FROM sets WHERE owner_id = ?').get(userId) as { n: number };
    if (n + addedSets > s.maxSetsPerUser) throw new HttpError(400, `Limite atteinte : ${s.maxSetsPerUser} sets par utilisateur.`, 'quota');
  }
  if (addedCards > 0) {
    const { n } = db().prepare('SELECT COUNT(*) AS n FROM cards c JOIN sets s ON s.id = c.set_id WHERE s.owner_id = ?').get(userId) as { n: number };
    if (n + addedCards > s.maxCardsPerUser) throw new HttpError(400, `Limite atteinte : ${s.maxCardsPerUser} cartes par utilisateur.`, 'quota');
  }
}

function insertCards(setId: number, cards: z.infer<typeof cardInput>[]) {
  const ins = db().prepare(
    'INSERT INTO cards (set_id, position, term, definition, example, note, image, audio, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  cards.forEach((c, i) => ins.run(setId, i, c.term, c.definition, c.example ?? '', c.note ?? '', c.image ?? null, c.audio ?? null, JSON.stringify(c.tags ?? [])));
}

export function snapshotSet(setId: number, userId: number | null) {
  const set = db().prepare('SELECT title, description, term_lang, def_lang, color, tags FROM sets WHERE id = ?').get(setId);
  const cards = db()
    .prepare('SELECT id, term, definition, example, note, image, audio, tags FROM cards WHERE set_id = ? ORDER BY position, id')
    .all(setId);
  db().prepare('INSERT INTO set_versions (set_id, user_id, snapshot, card_count) VALUES (?, ?, ?, ?)').run(
    setId,
    userId,
    JSON.stringify({ set, cards }),
    cards.length,
  );
  // On garde les 30 dernières versions.
  db()
    .prepare('DELETE FROM set_versions WHERE set_id = ? AND id NOT IN (SELECT id FROM set_versions WHERE set_id = ? ORDER BY id DESC LIMIT 30)')
    .run(setId, setId);
}

/** Remplace la liste de cartes en conservant les identifiants existants (et donc la progression). */
export function replaceCards(setId: number, cards: z.infer<typeof cardInput>[]) {
  const existing = new Set((db().prepare('SELECT id FROM cards WHERE set_id = ?').all(setId) as { id: number }[]).map((r) => r.id));
  const keep = new Set<number>();
  const upd = db().prepare(
    `UPDATE cards SET position = ?, term = ?, definition = ?, example = ?, note = ?, image = ?, audio = ?, tags = ?, updated_at = ?
     WHERE id = ? AND set_id = ?`,
  );
  const ins = db().prepare(
    'INSERT INTO cards (set_id, position, term, definition, example, note, image, audio, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const now = nowIso();
  cards.forEach((c, i) => {
    const args = [c.term, c.definition, c.example ?? '', c.note ?? '', c.image ?? null, c.audio ?? null, JSON.stringify(c.tags ?? [])];
    if (c.id && existing.has(c.id) && !keep.has(c.id)) {
      upd.run(i, ...args, now, c.id, setId);
      keep.add(c.id);
    } else {
      ins.run(setId, i, ...args);
    }
  });
  const del = db().prepare('DELETE FROM cards WHERE id = ?');
  for (const id of existing) if (!keep.has(id)) del.run(id);
  db().prepare('UPDATE sets SET updated_at = ? WHERE id = ?').run(now, setId);
}

export function cardsWithProgress(setId: number, userId: number) {
  const rows = db()
    .prepare(
      `SELECT c.*, (st.card_id IS NOT NULL) AS starred, p.due_at, p.interval_days, p.ease, p.repetitions, p.lapses, p.correct_count, p.wrong_count
       FROM cards c
       LEFT JOIN stars st ON st.card_id = c.id AND st.user_id = ?
       LEFT JOIN study_progress p ON p.card_id = c.id AND p.user_id = ?
       WHERE c.set_id = ? ORDER BY c.position, c.id`,
    )
    .all(userId, userId, setId) as any[];
  return rows.map((c) => ({
    id: c.id,
    term: c.term,
    definition: c.definition,
    example: c.example,
    note: c.note,
    image: c.image,
    audio: c.audio,
    tags: JSON.parse(c.tags || '[]'),
    starred: !!c.starred,
    progress: c.due_at
      ? {
          dueAt: c.due_at,
          intervalDays: c.interval_days,
          ease: c.ease,
          repetitions: c.repetitions,
          lapses: c.lapses,
          correct: c.correct_count,
          wrong: c.wrong_count,
          mastered: c.interval_days >= MASTERED_INTERVAL,
          difficult: c.lapses > 0 || c.wrong_count > c.correct_count || c.ease < 2.2,
        }
      : null,
  }));
}

export default async function setRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/sets', async (req) => {
    const uid = req.user!.id;
    const now = nowIso();
    const rows = db()
      .prepare(
        `SELECT s.*, u.display_name AS owner_name,
           (SELECT COUNT(*) FROM cards c WHERE c.set_id = s.id) AS card_count,
           (SELECT COUNT(*) FROM cards c JOIN study_progress p ON p.card_id = c.id AND p.user_id = ? WHERE c.set_id = s.id AND p.due_at <= ?) AS due_count,
           (SELECT COUNT(*) FROM cards c JOIN study_progress p ON p.card_id = c.id AND p.user_id = ? WHERE c.set_id = s.id AND p.interval_days >= ${MASTERED_INTERVAL}) AS mastered_count,
           (SELECT MAX(created_at) FROM study_log l WHERE l.set_id = s.id AND l.user_id = ?) AS last_studied_at,
           sh.permission AS share_permission
         FROM sets s
         JOIN users u ON u.id = s.owner_id
         LEFT JOIN shares sh ON sh.set_id = s.id AND sh.user_id = ?
         WHERE s.id IN (${ACCESSIBLE_SETS_SQL})
         ORDER BY COALESCE(last_studied_at, s.updated_at) DESC`,
      )
      .all(uid, now, uid, uid, uid, uid, uid) as any[];
    return {
      sets: rows.map((r) =>
        setView(r, {
          permission: r.owner_id === uid ? 'owner' : r.share_permission,
          dueCount: r.due_count,
          masteredCount: r.mastered_count,
          lastStudiedAt: r.last_studied_at,
          folderId: r.owner_id === uid ? r.folder_id : null,
        }),
      ),
    };
  });

  app.post('/sets', async (req) => {
    const body = parse(setMeta.extend({ cards: z.array(cardInput).max(5000).optional().default([]) }), req.body);
    const uid = req.user!.id;
    checkFolder(body.folderId, uid);
    const cards = body.cards.filter((c) => c.term.trim() || c.definition.trim());
    quotaCheck(uid, cards.length, 1);
    const id = db().transaction(() => {
      const r = db()
        .prepare('INSERT INTO sets (owner_id, folder_id, title, description, term_lang, def_lang, color, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(uid, body.folderId ?? null, body.title, body.description, body.termLang, body.defLang, body.color, JSON.stringify(body.tags));
      const setId = Number(r.lastInsertRowid);
      insertCards(setId, cards);
      return setId;
    })();
    return { id };
  });

  app.get('/sets/:id', async (req) => {
    const uid = req.user!.id;
    const { set, permission } = loadSet(getId(req), uid);
    const owner = db().prepare('SELECT display_name FROM users WHERE id = ?').get(set.owner_id) as { display_name: string };
    const cards = cardsWithProgress(set.id, uid);
    const shares =
      permission === 'owner'
        ? db()
            .prepare(
              'SELECT sh.id, sh.permission, u.id AS user_id, u.username, u.display_name FROM shares sh JOIN users u ON u.id = sh.user_id WHERE sh.set_id = ? ORDER BY u.display_name',
            )
            .all(set.id)
            .map((r: any) => ({ id: r.id, permission: r.permission, userId: r.user_id, username: r.username, displayName: r.display_name }))
        : undefined;
    return {
      set: setView({ ...set, owner_name: owner.display_name, card_count: cards.length }, { permission, folderId: permission === 'owner' ? set.folder_id : null }),
      cards,
      shares,
    };
  });

  app.patch('/sets/:id', async (req) => {
    const uid = req.user!.id;
    const { set, permission } = loadSet(getId(req), uid, 'edit');
    const body = parse(setMeta.partial().extend({ linkAccess: z.boolean().optional() }), req.body);
    if ((body.folderId !== undefined || body.linkAccess !== undefined) && permission !== 'owner')
      throw new HttpError(403, 'Seul le propriétaire peut déplacer ou partager ce set.', 'forbidden');
    checkFolder(body.folderId, uid);
    const merged = {
      title: body.title ?? set.title,
      description: body.description ?? set.description,
      term_lang: body.termLang ?? set.term_lang,
      def_lang: body.defLang ?? set.def_lang,
      color: body.color ?? set.color,
      tags: body.tags ? JSON.stringify(body.tags) : set.tags,
      folder_id: body.folderId !== undefined ? body.folderId : set.folder_id,
      link_access: body.linkAccess !== undefined ? (body.linkAccess ? 1 : 0) : set.link_access,
    };
    db()
      .prepare(
        'UPDATE sets SET title=?, description=?, term_lang=?, def_lang=?, color=?, tags=?, folder_id=?, link_access=?, updated_at=? WHERE id = ?',
      )
      .run(merged.title, merged.description, merged.term_lang, merged.def_lang, merged.color, merged.tags, merged.folder_id, merged.link_access, nowIso(), set.id);
    return { ok: true };
  });

  app.delete('/sets/:id', async (req) => {
    const { set } = loadSet(getId(req), req.user!.id, 'owner');
    db().prepare('DELETE FROM sets WHERE id = ?').run(set.id);
    return { ok: true };
  });

  app.put('/sets/:id/cards', async (req) => {
    const uid = req.user!.id;
    const { set } = loadSet(getId(req), uid, 'edit');
    const body = parse(z.object({ cards: z.array(cardInput).max(5000) }), req.body);
    const cards = body.cards.filter((c) => c.term.trim() || c.definition.trim());
    const { n } = db().prepare('SELECT COUNT(*) AS n FROM cards WHERE set_id = ?').get(set.id) as { n: number };
    quotaCheck(set.owner_id, cards.length - n);
    db().transaction(() => {
      if (n > 0) snapshotSet(set.id, uid);
      replaceCards(set.id, cards);
    })();
    return { cards: cardsWithProgress(set.id, uid) };
  });

  app.post('/sets/:id/duplicate', async (req) => {
    const uid = req.user!.id;
    const { set } = loadSet(getId(req), uid, 'read');
    const cards = db().prepare('SELECT * FROM cards WHERE set_id = ? ORDER BY position, id').all(set.id) as any[];
    quotaCheck(uid, cards.length, 1);
    const title = set.owner_id === uid ? `${set.title} (copie)` : set.title;
    const id = db().transaction(() => {
      const r = db()
        .prepare('INSERT INTO sets (owner_id, title, description, term_lang, def_lang, color, tags) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(uid, title, set.description, set.term_lang, set.def_lang, set.color, set.tags);
      const newId = Number(r.lastInsertRowid);
      insertCards(
        newId,
        cards.map((c) => ({ ...c, tags: JSON.parse(c.tags || '[]') })),
      );
      return newId;
    })();
    return { id };
  });

  app.put('/sets/:id/cards/:cardId/star', async (req) => {
    const uid = req.user!.id;
    const { set } = loadSet(getId(req), uid, 'read');
    const cardId = getId(req, 'cardId');
    const body = parse(z.object({ starred: z.boolean() }), req.body);
    const card = db().prepare('SELECT 1 FROM cards WHERE id = ? AND set_id = ?').get(cardId, set.id);
    if (!card) throw notFound('Carte');
    if (body.starred) db().prepare('INSERT OR IGNORE INTO stars (user_id, card_id) VALUES (?, ?)').run(uid, cardId);
    else db().prepare('DELETE FROM stars WHERE user_id = ? AND card_id = ?').run(uid, cardId);
    return { starred: body.starred };
  });

  // --- Partage ---
  app.post('/sets/:id/shares', async (req) => {
    const uid = req.user!.id;
    const { set } = loadSet(getId(req), uid, 'owner');
    const body = parse(z.object({ username: z.string().trim().min(1).max(64), permission: z.enum(['read', 'edit']) }), req.body);
    const target = db().prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE AND status = 'active'").get(body.username) as
      | { id: number }
      | undefined;
    if (!target) throw new HttpError(404, 'Aucun utilisateur actif avec cet identifiant.', 'not_found');
    if (target.id === uid) throw new HttpError(400, 'Tu es déjà propriétaire de ce set.', 'validation');
    db()
      .prepare('INSERT INTO shares (set_id, user_id, permission) VALUES (?, ?, ?) ON CONFLICT(set_id, user_id) DO UPDATE SET permission = excluded.permission')
      .run(set.id, target.id, body.permission);
    return { ok: true };
  });

  app.delete('/sets/:id/shares/:shareId', async (req) => {
    const uid = req.user!.id;
    const { set } = loadSet(getId(req), uid, 'read');
    const shareId = getId(req, 'shareId');
    const share = db().prepare('SELECT * FROM shares WHERE id = ? AND set_id = ?').get(shareId, set.id) as { user_id: number } | undefined;
    if (!share) throw notFound('Partage');
    // Le propriétaire retire n'importe quel partage ; un destinataire peut se retirer lui-même.
    if (set.owner_id !== uid && share.user_id !== uid) throw new HttpError(403, 'Action réservée au propriétaire.', 'forbidden');
    db().prepare('DELETE FROM shares WHERE id = ?').run(shareId);
    return { ok: true };
  });

  app.delete('/sets/:id/shares/me', async (req) => {
    const uid = req.user!.id;
    db().prepare('DELETE FROM shares WHERE set_id = ? AND user_id = ?').run(getId(req), uid);
    return { ok: true };
  });

  // --- Historique des versions ---
  app.get('/sets/:id/versions', async (req) => {
    const { set } = loadSet(getId(req), req.user!.id, 'edit');
    const rows = db()
      .prepare(
        'SELECT v.id, v.created_at, v.card_count, u.display_name FROM set_versions v LEFT JOIN users u ON u.id = v.user_id WHERE v.set_id = ? ORDER BY v.id DESC',
      )
      .all(set.id) as any[];
    return { versions: rows.map((r) => ({ id: r.id, createdAt: r.created_at, cardCount: r.card_count, author: r.display_name })) };
  });

  app.post('/sets/:id/versions/:versionId/restore', async (req) => {
    const uid = req.user!.id;
    const { set } = loadSet(getId(req), uid, 'edit');
    const v = db().prepare('SELECT snapshot FROM set_versions WHERE id = ? AND set_id = ?').get(getId(req, 'versionId'), set.id) as
      | { snapshot: string }
      | undefined;
    if (!v) throw notFound('Version');
    const snap = JSON.parse(v.snapshot) as { cards: any[] };
    db().transaction(() => {
      snapshotSet(set.id, uid);
      replaceCards(
        set.id,
        snap.cards.map((c) => ({ ...c, tags: JSON.parse(c.tags || '[]') })),
      );
    })();
    return { cards: cardsWithProgress(set.id, uid) };
  });

  // --- Export ---
  app.get('/sets/:id/export', async (req, reply) => {
    const { set } = loadSet(getId(req), req.user!.id, 'read');
    const format = parse(z.object({ format: z.enum(['csv', 'tsv', 'json']).default('json') }), req.query).format;
    const cards = db()
      .prepare('SELECT term, definition, example, note, tags FROM cards WHERE set_id = ? ORDER BY position, id')
      .all(set.id) as any[];
    const safeName = set.title.normalize('NFD').replace(/[^\w-]+/g, '_').slice(0, 60) || 'set';
    if (format === 'json') {
      reply.header('Content-Disposition', `attachment; filename="${safeName}.json"`);
      return {
        format: 'knowlist-set',
        version: 1,
        title: set.title,
        description: set.description,
        termLang: set.term_lang,
        defLang: set.def_lang,
        color: set.color,
        tags: JSON.parse(set.tags),
        cards: cards.map((c) => ({ ...c, tags: JSON.parse(c.tags || '[]') })),
      };
    }
    const sep = format === 'csv' ? ',' : '\t';
    const esc = (v: string) => {
      if (format === 'tsv') return v.replace(/[\t\r\n]+/g, ' ');
      return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    };
    const lines = [['terme', 'definition', 'exemple', 'note'].join(sep), ...cards.map((c) => [c.term, c.definition, c.example, c.note].map(esc).join(sep))];
    reply
      .header('Content-Type', format === 'csv' ? 'text/csv; charset=utf-8' : 'text/tab-separated-values; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${safeName}.${format}"`);
    return '\ufeff' + lines.join('\r\n');
  });

  // --- Annuaire pour le partage (utilisateurs actifs du site) ---
  app.get('/users/directory', async (req) => {
    const rows = db()
      .prepare("SELECT id, username, display_name FROM users WHERE status = 'active' AND id != ? ORDER BY display_name")
      .all(req.user!.id) as any[];
    return { users: rows.map((r) => ({ id: r.id, username: r.username, displayName: r.display_name })) };
  });
}
