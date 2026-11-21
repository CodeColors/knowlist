import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { ACCESSIBLE_SETS_SQL } from '../lib/access.js';
import { parse } from '../lib/http.js';
import { requireAuth } from '../lib/session.js';

/** Transforme une saisie libre en requête FTS5 sûre : chaque mot devient un préfixe entre guillemets. */
export function toFtsQuery(input: string): string | null {
  const tokens = input
    .normalize('NFKC')
    .split(/[\s\p{P}]+/u)
    .map((t) => t.replace(/"/g, ''))
    .filter((t) => t.length > 0)
    .slice(0, 8);
  if (!tokens.length) return null;
  return tokens.map((t) => `"${t}"*`).join(' ');
}

export default async function searchRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/search', async (req) => {
    const { q } = parse(z.object({ q: z.string().max(200).default('') }), req.query);
    const fts = toFtsQuery(q);
    if (!fts) return { sets: [], cards: [] };
    const uid = req.user!.id;
    const sets = db()
      .prepare(
        `SELECT s.id, s.title, s.description, s.color, (SELECT COUNT(*) FROM cards c WHERE c.set_id = s.id) AS card_count
         FROM sets_fts f JOIN sets s ON s.id = f.rowid
         WHERE sets_fts MATCH ? AND s.id IN (${ACCESSIBLE_SETS_SQL})
         ORDER BY rank LIMIT 20`,
      )
      .all(fts, uid, uid) as any[];
    const cards = db()
      .prepare(
        `SELECT c.id, c.term, c.definition, c.set_id, s.title AS set_title, s.color
         FROM cards_fts f JOIN cards c ON c.id = f.rowid JOIN sets s ON s.id = c.set_id
         WHERE cards_fts MATCH ? AND c.set_id IN (${ACCESSIBLE_SETS_SQL})
         ORDER BY rank LIMIT 50`,
      )
      .all(fts, uid, uid) as any[];
    return {
      sets: sets.map((s) => ({ id: s.id, title: s.title, description: s.description, color: s.color, cardCount: s.card_count })),
      cards: cards.map((c) => ({ id: c.id, term: c.term, definition: c.definition, setId: c.set_id, setTitle: c.set_title, color: c.color })),
    };
  });
}
