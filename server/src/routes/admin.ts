import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import { db, nowIso } from '../db.js';
import { audit } from '../lib/audit.js';
import { BACKUP_RE, createBackup, dirSize, listBackups, restoreBackup } from '../lib/backup.js';
import { HttpError, getId, notFound, parse } from '../lib/http.js';
import { generateTempPassword, hashPassword, randomToken, sha256 } from '../lib/password.js';
import { destroyUserSessions, requireAdmin } from '../lib/session.js';
import { DEFAULT_SETTINGS, getSettings, updateSettings } from '../lib/settings.js';
import { USERNAME_RE, adminUserView, getUser, getUserByUsername, suggestUsername, type UserRow } from '../lib/users.js';
import type { Config } from '../config.js';

const optionalDate = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
  .nullable()
  .optional()
  .transform((v) => (v ? new Date(v.length === 10 ? `${v}T23:59:59Z` : v).toISOString() : v));

const emailSchema = z
  .string()
  .trim()
  .max(200)
  .email('adresse e-mail invalide')
  .nullable()
  .optional()
  .or(z.literal('').transform(() => null));

function ensureNotLastAdmin(user: UserRow) {
  if (user.role !== 'admin') return;
  const { n } = db().prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active' AND id != ?").get(user.id) as { n: number };
  if (n === 0) throw new HttpError(400, 'Impossible : il doit rester au moins un administrateur actif.', 'last_admin');
}

function actor(req: { user: UserRow | null; ip: string }) {
  return { actorId: req.user!.id, actorName: req.user!.username, ip: req.ip };
}

export default async function adminRoutes(app: FastifyInstance, opts: { config: Config }) {
  const cfg = opts.config;
  app.addHook('preHandler', requireAdmin);

  // --- Tableau de bord ---
  app.get('/admin/dashboard', async () => {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const one = (sql: string, ...args: unknown[]) => (db().prepare(sql).get(...args) as { n: number }).n;
    let disk: { total: number; free: number } | null = null;
    try {
      const st = await fs.promises.statfs(cfg.dataDir);
      disk = { total: st.blocks * st.bsize, free: st.bavail * st.bsize };
    } catch {
      disk = null;
    }
    const backups = listBackups(cfg);
    return {
      users: {
        total: one('SELECT COUNT(*) AS n FROM users'),
        active30d: one('SELECT COUNT(DISTINCT user_id) AS n FROM study_log WHERE created_at >= ?', since),
        loggedIn30d: one('SELECT COUNT(*) AS n FROM users WHERE last_login_at >= ?', since),
        suspended: one("SELECT COUNT(*) AS n FROM users WHERE status = 'suspended'"),
      },
      sets: one('SELECT COUNT(*) AS n FROM sets'),
      cards: one('SELECT COUNT(*) AS n FROM cards'),
      setsLast30d: one('SELECT COUNT(*) AS n FROM sets WHERE created_at >= ?', since),
      cardsLast30d: one('SELECT COUNT(*) AS n FROM cards WHERE created_at >= ?', since),
      answers30d: one('SELECT COUNT(*) AS n FROM study_log WHERE created_at >= ?', since),
      storage: {
        database: fs.existsSync(cfg.dbPath) ? fs.statSync(cfg.dbPath).size + (fs.existsSync(cfg.dbPath + '-wal') ? fs.statSync(cfg.dbPath + '-wal').size : 0) : 0,
        uploads: dirSize(cfg.uploadsDir),
        backups: dirSize(cfg.backupsDir),
        disk,
      },
      lastBackup: backups[0] ?? null,
      pendingInvitations: one('SELECT COUNT(*) AS n FROM invitations WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at > ?', nowIso()),
    };
  });

  // --- Comptes ---
  app.get('/admin/users', async () => {
    const rows = db().prepare('SELECT * FROM users ORDER BY created_at DESC').all() as UserRow[];
    const counts = new Map(
      (db().prepare('SELECT owner_id, COUNT(*) AS n FROM sets GROUP BY owner_id').all() as { owner_id: number; n: number }[]).map((r) => [r.owner_id, r.n]),
    );
    const sessions = new Map(
      (db().prepare('SELECT user_id, COUNT(*) AS n FROM sessions GROUP BY user_id').all() as { user_id: number; n: number }[]).map((r) => [r.user_id, r.n]),
    );
    return { users: rows.map((u) => ({ ...adminUserView(u), setCount: counts.get(u.id) ?? 0, sessionCount: sessions.get(u.id) ?? 0 })) };
  });

  app.get('/admin/username-suggestion', async (req) => {
    const { name } = parse(z.object({ name: z.string().max(80) }), req.query);
    return { username: suggestUsername(name) };
  });

  app.post('/admin/users', async (req) => {
    const body = parse(
      z.object({
        displayName: z.string().trim().min(1).max(80),
        username: z.string().trim().max(32).optional(),
        email: emailSchema,
        role: z.enum(['user', 'admin']).default('user'),
        expiresAt: optionalDate,
      }),
      req.body,
    );
    const username = body.username || suggestUsername(body.displayName);
    if (!USERNAME_RE.test(username)) throw new HttpError(400, 'Identifiant invalide (2-32 caractères : lettres, chiffres, . _ -).', 'validation');
    if (getUserByUsername(username)) throw new HttpError(409, 'Cet identifiant est déjà utilisé.', 'username_taken');
    const tempPassword = generateTempPassword();
    const r = db()
      .prepare('INSERT INTO users (username, display_name, email, password_hash, role, must_change_password, expires_at) VALUES (?, ?, ?, ?, ?, 1, ?)')
      .run(username, body.displayName, body.email ?? null, await hashPassword(tempPassword), body.role, body.expiresAt ?? null);
    audit('user.create', { ...actor(req), target: username, details: { role: body.role, mode: 'generated' } });
    return { user: adminUserView(getUser(Number(r.lastInsertRowid))!), tempPassword, loginUrl: `${cfg.publicUrl}/connexion` };
  });

  app.patch('/admin/users/:id', async (req) => {
    const user = getUser(getId(req));
    if (!user) throw notFound('Compte');
    const body = parse(
      z.object({
        displayName: z.string().trim().min(1).max(80).optional(),
        email: emailSchema,
        role: z.enum(['user', 'admin']).optional(),
        expiresAt: optionalDate,
        suspended: z.boolean().optional(),
      }),
      req.body,
    );
    if (user.id === req.user!.id && (body.suspended || body.role === 'user'))
      throw new HttpError(400, 'Tu ne peux pas te suspendre ni te retirer le rôle administrateur toi-même.', 'self');
    if ((body.suspended && user.status === 'active') || (body.role === 'user' && user.role === 'admin')) ensureNotLastAdmin(user);
    const status = body.suspended === undefined ? user.status : body.suspended ? 'suspended' : 'active';
    db()
      .prepare('UPDATE users SET display_name = ?, email = ?, role = ?, expires_at = ?, status = ? WHERE id = ?')
      .run(
        body.displayName ?? user.display_name,
        body.email === undefined ? user.email : body.email,
        body.role ?? user.role,
        body.expiresAt === undefined ? user.expires_at : body.expiresAt,
        status,
        user.id,
      );
    if (status === 'suspended') destroyUserSessions(user.id);
    if (status !== user.status) audit(status === 'suspended' ? 'user.suspend' : 'user.reactivate', { ...actor(req), target: user.username });
    else audit('user.update', { ...actor(req), target: user.username, details: body });
    return { user: adminUserView(getUser(user.id)!) };
  });

  app.post('/admin/users/:id/reset-password', async (req) => {
    const user = getUser(getId(req));
    if (!user) throw notFound('Compte');
    const tempPassword = generateTempPassword();
    db().prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(await hashPassword(tempPassword), user.id);
    destroyUserSessions(user.id);
    audit('password.reset', { ...actor(req), target: user.username });
    return { tempPassword };
  });

  app.post('/admin/users/:id/logout', async (req) => {
    const user = getUser(getId(req));
    if (!user) throw notFound('Compte');
    destroyUserSessions(user.id, user.id === req.user!.id ? req.session!.id : undefined);
    audit('session.revoke', { ...actor(req), target: user.username, details: { all: true } });
    return { ok: true };
  });

  app.post('/admin/users/:id/disable-totp', async (req) => {
    const user = getUser(getId(req));
    if (!user) throw notFound('Compte');
    db().prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?').run(user.id);
    audit('totp.disable', { ...actor(req), target: user.username, details: { byAdmin: true } });
    return { ok: true };
  });

  app.delete('/admin/users/:id', async (req) => {
    const user = getUser(getId(req));
    if (!user) throw notFound('Compte');
    const { confirm } = parse(z.object({ confirm: z.string() }), req.body ?? {});
    if (confirm.toLowerCase() !== user.username.toLowerCase())
      throw new HttpError(400, "Pour confirmer, saisis exactement l'identifiant du compte.", 'confirm');
    if (user.id === req.user!.id) throw new HttpError(400, 'Supprime ton propre compte depuis ton profil.', 'self');
    ensureNotLastAdmin(user);
    db().prepare('DELETE FROM users WHERE id = ?').run(user.id);
    audit('user.delete', { ...actor(req), target: user.username });
    return { ok: true };
  });

  // --- Invitations ---
  app.get('/admin/invitations', async () => {
    const rows = db()
      .prepare('SELECT i.*, u.display_name AS created_by_name FROM invitations i LEFT JOIN users u ON u.id = i.created_by ORDER BY i.created_at DESC LIMIT 200')
      .all() as any[];
    const now = new Date();
    return {
      invitations: rows.map((i) => ({
        id: i.id,
        username: i.username,
        displayName: i.display_name,
        email: i.email,
        role: i.role,
        createdAt: i.created_at,
        createdBy: i.created_by_name,
        expiresAt: i.expires_at,
        accountExpiresAt: i.account_expires_at,
        usedAt: i.used_at,
        status: i.revoked_at ? 'revoked' : i.used_at ? 'used' : new Date(i.expires_at) <= now ? 'expired' : 'pending',
      })),
    };
  });

  app.post('/admin/invitations', async (req) => {
    const settings = getSettings();
    const body = parse(
      z.object({
        displayName: z.string().trim().min(1).max(80),
        username: z.string().trim().max(32).optional(),
        email: emailSchema,
        role: z.enum(['user', 'admin']).default('user'),
        accountExpiresAt: optionalDate,
        days: z.number().int().min(1).max(90).optional(),
      }),
      req.body,
    );
    const username = body.username || suggestUsername(body.displayName);
    if (!USERNAME_RE.test(username)) throw new HttpError(400, 'Identifiant invalide (2-32 caractères : lettres, chiffres, . _ -).', 'validation');
    if (getUserByUsername(username)) throw new HttpError(409, 'Cet identifiant est déjà utilisé.', 'username_taken');
    const token = randomToken(32);
    const days = body.days ?? settings.invitationDays;
    const expiresAt = new Date(Date.now() + days * 86400_000).toISOString();
    const r = db()
      .prepare(
        'INSERT INTO invitations (token_hash, username, display_name, email, role, account_expires_at, created_by, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(sha256(token), username, body.displayName, body.email ?? null, body.role, body.accountExpiresAt ?? null, req.user!.id, expiresAt);
    audit('invitation.create', { ...actor(req), target: username, details: { days } });
    return { id: Number(r.lastInsertRowid), username, link: `${cfg.publicUrl}/invitation/${token}`, expiresAt };
  });

  app.delete('/admin/invitations/:id', async (req) => {
    const inv = db().prepare('SELECT * FROM invitations WHERE id = ?').get(getId(req)) as any;
    if (!inv) throw notFound('Invitation');
    if (inv.used_at) throw new HttpError(400, 'Cette invitation a déjà été utilisée.', 'used');
    db().prepare('UPDATE invitations SET revoked_at = ? WHERE id = ?').run(nowIso(), inv.id);
    audit('invitation.revoke', { ...actor(req), target: inv.username });
    return { ok: true };
  });

  // --- Sessions ---
  app.get('/admin/sessions', async (req) => {
    const rows = db()
      .prepare(
        'SELECT s.id, s.created_at, s.last_seen_at, s.ip, s.user_agent, u.id AS user_id, u.username, u.display_name FROM sessions s JOIN users u ON u.id = s.user_id ORDER BY s.last_seen_at DESC',
      )
      .all() as any[];
    return {
      sessions: rows.map((r) => ({
        id: r.id.slice(0, 16),
        current: r.id === req.session!.id,
        userId: r.user_id,
        username: r.username,
        displayName: r.display_name,
        createdAt: r.created_at,
        lastSeenAt: r.last_seen_at,
        ip: r.ip,
        userAgent: r.user_agent,
      })),
    };
  });

  app.delete('/admin/sessions/:sid', async (req) => {
    const sid = String((req.params as any).sid);
    if (!/^[a-f0-9]{16}$/.test(sid)) throw notFound('Session');
    const row = db().prepare('SELECT s.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE substr(s.id, 1, 16) = ?').get(sid) as any;
    if (!row) throw notFound('Session');
    db().prepare('DELETE FROM sessions WHERE id = ?').run(row.id);
    audit('session.revoke', { ...actor(req), target: row.username });
    return { ok: true };
  });

  // --- Journal d'audit ---
  app.get('/admin/audit', async (req) => {
    const q = parse(
      z.object({ action: z.string().max(40).optional(), q: z.string().max(80).optional(), page: z.coerce.number().int().min(1).default(1) }),
      req.query,
    );
    const where: string[] = [];
    const args: unknown[] = [];
    if (q.action) {
      where.push('action LIKE ?');
      args.push(`${q.action}%`);
    }
    if (q.q) {
      where.push('(actor_name LIKE ? OR target LIKE ? OR ip LIKE ?)');
      args.push(`%${q.q}%`, `%${q.q}%`, `%${q.q}%`);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const pageSize = 50;
    const rows = db()
      .prepare(`SELECT * FROM audit_log ${w} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(...args, pageSize + 1, (q.page - 1) * pageSize) as any[];
    return {
      entries: rows.slice(0, pageSize).map((r) => ({
        id: r.id,
        createdAt: r.created_at,
        action: r.action,
        actor: r.actor_name,
        target: r.target,
        ip: r.ip,
        details: r.details ? JSON.parse(r.details) : null,
      })),
      hasMore: rows.length > pageSize,
    };
  });

  // --- Paramètres ---
  app.get('/admin/settings', async () => ({ settings: getSettings(), defaults: DEFAULT_SETTINGS }));

  app.patch('/admin/settings', async (req) => {
    const body = parse(
      z
        .object({
          invitationDays: z.number().int().min(1).max(90),
          passwordMinLength: z.number().int().min(12).max(128),
          maxSetsPerUser: z.number().int().min(1).max(100000),
          maxCardsPerUser: z.number().int().min(10).max(1000000),
          maxImageKb: z.number().int().min(50).max(20480),
          maxAudioKb: z.number().int().min(50).max(20480),
          externalServices: z.boolean(),
          welcomeMessage: z.string().max(500),
        })
        .partial(),
      req.body,
    );
    const settings = updateSettings(body);
    audit('settings.update', { ...actor(req), details: body });
    return { settings };
  });

  // --- Sauvegardes ---
  app.get('/admin/backups', async () => ({
    backups: listBackups(cfg),
    schedule: { hourUtc: cfg.backupHour, retentionDays: cfg.backupRetentionDays },
  }));

  app.post('/admin/backups', async (req) => {
    const b = await createBackup(cfg, 'manual');
    audit('backup.create', { ...actor(req), target: b.name });
    return { backup: b };
  });

  const backupFile = (name: string) => {
    if (!BACKUP_RE.test(name)) throw notFound('Sauvegarde');
    const file = path.join(cfg.backupsDir, name);
    if (!fs.existsSync(file)) throw notFound('Sauvegarde');
    return file;
  };

  app.get('/admin/backups/:name', async (req, reply) => {
    const name = String((req.params as any).name);
    const file = backupFile(name);
    reply.header('Content-Type', 'application/gzip').header('Content-Disposition', `attachment; filename="${name}"`);
    return reply.send(fs.createReadStream(file));
  });

  app.delete('/admin/backups/:name', async (req) => {
    fs.rmSync(backupFile(String((req.params as any).name)));
    return { ok: true };
  });

  app.post('/admin/backups/upload', async (req) => {
    const file = await req.file({ limits: { fileSize: 2 * 1024 ** 3, files: 1 } });
    if (!file) throw new HttpError(400, 'Aucun fichier reçu.', 'validation');
    const name = `knowlist-${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)}-uploaded.tar.gz`;
    fs.mkdirSync(cfg.backupsDir, { recursive: true });
    await pipeline(file.file, fs.createWriteStream(path.join(cfg.backupsDir, name), { mode: 0o600 }));
    return { name };
  });

  app.post('/admin/backups/:name/restore', async (req) => {
    const name = String((req.params as any).name);
    const file = backupFile(name);
    const { confirm } = parse(z.object({ confirm: z.literal('RESTAURER', { errorMap: () => ({ message: 'saisis RESTAURER pour confirmer' }) }) }), req.body);
    void confirm;
    const who = actor(req);
    const { safety } = await restoreBackup(cfg, file);
    audit('backup.restore', { ...who, target: name, details: { safetyBackup: safety?.name } });
    return { ok: true, safetyBackup: safety?.name };
  });
}
