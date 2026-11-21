import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { audit } from '../lib/audit.js';
import { HttpError, notFound, parse } from '../lib/http.js';
import { verifyPassword } from '../lib/password.js';
import { clearSessionCookie, requireAuth } from '../lib/session.js';
import { getUser, parsePrefs, publicUser } from '../lib/users.js';
import type { Config } from '../config.js';

const prefsSchema = z
  .object({
    theme: z.enum(['light', 'dark', 'auto']),
    reduceMotion: z.boolean(),
    dyslexiaFont: z.boolean(),
    dailyGoal: z.number().int().min(1).max(1000),
    onboarded: z.boolean(),
    writeTolerance: z.object({ accents: z.boolean(), case: z.boolean(), typos: z.boolean(), punctuation: z.boolean() }),
  })
  .partial();

export default async function meRoutes(app: FastifyInstance, opts: { config: Config }) {
  app.addHook('preHandler', requireAuth);

  app.patch('/me', async (req) => {
    const body = parse(
      z.object({
        displayName: z.string().trim().min(1).max(80).optional(),
        email: z.string().trim().email().max(200).nullable().optional().or(z.literal('')),
        prefs: prefsSchema.optional(),
      }),
      req.body,
    );
    const u = req.user!;
    const prefs = body.prefs ? { ...parsePrefs(u.prefs), ...body.prefs } : parsePrefs(u.prefs);
    db()
      .prepare('UPDATE users SET display_name = ?, email = ?, prefs = ? WHERE id = ?')
      .run(body.displayName ?? u.display_name, body.email === undefined ? u.email : body.email || null, JSON.stringify(prefs), u.id);
    return { user: publicUser(getUser(u.id)!) };
  });

  app.get('/me/sessions', async (req) => {
    const rows = db()
      .prepare('SELECT id, created_at, last_seen_at, ip, user_agent FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC')
      .all(req.user!.id) as any[];
    return {
      sessions: rows.map((r) => ({
        id: r.id.slice(0, 16),
        current: r.id === req.session!.id,
        createdAt: r.created_at,
        lastSeenAt: r.last_seen_at,
        ip: r.ip,
        userAgent: r.user_agent,
      })),
    };
  });

  app.delete('/me/sessions/:sid', async (req) => {
    const sid = String((req.params as any).sid);
    if (!/^[a-f0-9]{16}$/.test(sid)) throw notFound('Session');
    const r = db().prepare("DELETE FROM sessions WHERE user_id = ? AND substr(id, 1, 16) = ? AND id != ?").run(req.user!.id, sid, req.session!.id);
    if (!r.changes) throw notFound('Session');
    return { ok: true };
  });

  /** RGPD : export de toutes les données personnelles. */
  app.get('/me/export', async (req, reply) => {
    const uid = req.user!.id;
    const u = getUser(uid)!;
    const sets = db().prepare('SELECT * FROM sets WHERE owner_id = ?').all(uid) as any[];
    const data = {
      exportedAt: new Date().toISOString(),
      profile: {
        username: u.username,
        displayName: u.display_name,
        email: u.email,
        role: u.role,
        createdAt: u.created_at,
        lastLoginAt: u.last_login_at,
        prefs: parsePrefs(u.prefs),
      },
      folders: db().prepare('SELECT id, name, created_at FROM folders WHERE user_id = ?').all(uid),
      sets: sets.map((s) => ({
        ...s,
        tags: JSON.parse(s.tags),
        cards: db().prepare('SELECT id, term, definition, example, note, image, audio, tags FROM cards WHERE set_id = ? ORDER BY position').all(s.id),
      })),
      stars: db().prepare('SELECT card_id FROM stars WHERE user_id = ?').all(uid),
      progress: db().prepare('SELECT * FROM study_progress WHERE user_id = ?').all(uid),
      studyLog: db().prepare('SELECT card_id, set_id, mode, correct, duration_ms, created_at FROM study_log WHERE user_id = ?').all(uid),
      sharesReceived: db().prepare('SELECT set_id, permission, created_at FROM shares WHERE user_id = ?').all(uid),
      sessions: db().prepare('SELECT created_at, last_seen_at, ip, user_agent FROM sessions WHERE user_id = ?').all(uid),
      auditLog: db().prepare('SELECT created_at, action, ip FROM audit_log WHERE actor_id = ?').all(uid),
    };
    audit('data.export', { actorId: uid, actorName: u.username, ip: req.ip });
    reply.header('Content-Disposition', `attachment; filename="knowlist-${u.username}-donnees.json"`);
    return data;
  });

  /** RGPD : suppression du compte à la demande. */
  app.delete('/me', async (req, reply) => {
    const body = parse(z.object({ password: z.string().max(256) }), req.body);
    const u = req.user!;
    if (!(await verifyPassword(u.password_hash, body.password))) throw new HttpError(400, 'Mot de passe incorrect.', 'bad_password');
    if (u.role === 'admin') {
      const { n } = db().prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'").get() as { n: number };
      if (n <= 1) throw new HttpError(400, 'Tu es le dernier administrateur : nomme un autre administrateur avant de supprimer ton compte.', 'last_admin');
    }
    db().prepare('DELETE FROM media WHERE owner_id = ?').run(u.id);
    db().prepare('DELETE FROM users WHERE id = ?').run(u.id);
    audit('user.self_delete', { actorId: null, actorName: u.username, target: u.username, ip: req.ip });
    clearSessionCookie(reply, opts.config);
    return { ok: true };
  });

}
