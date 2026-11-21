import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { getId, notFound, parse } from '../lib/http.js';
import { requireAuth } from '../lib/session.js';

export default async function folderRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);
  const nameSchema = z.object({ name: z.string().trim().min(1).max(80) });

  app.get('/folders', async (req) => {
    const rows = db()
      .prepare(
        'SELECT f.id, f.name, (SELECT COUNT(*) FROM sets s WHERE s.folder_id = f.id) AS set_count FROM folders f WHERE f.user_id = ? ORDER BY f.name COLLATE NOCASE',
      )
      .all(req.user!.id) as any[];
    return { folders: rows.map((r) => ({ id: r.id, name: r.name, setCount: r.set_count })) };
  });

  app.post('/folders', async (req) => {
    const { name } = parse(nameSchema, req.body);
    const r = db().prepare('INSERT INTO folders (user_id, name) VALUES (?, ?)').run(req.user!.id, name);
    return { id: Number(r.lastInsertRowid), name };
  });

  app.patch('/folders/:id', async (req) => {
    const { name } = parse(nameSchema, req.body);
    const r = db().prepare('UPDATE folders SET name = ? WHERE id = ? AND user_id = ?').run(name, getId(req), req.user!.id);
    if (!r.changes) throw notFound('Dossier');
    return { ok: true };
  });

  app.delete('/folders/:id', async (req) => {
    const r = db().prepare('DELETE FROM folders WHERE id = ? AND user_id = ?').run(getId(req), req.user!.id);
    if (!r.changes) throw notFound('Dossier');
    return { ok: true };
  });
}
