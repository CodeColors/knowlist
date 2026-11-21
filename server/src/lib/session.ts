import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { db } from '../db.js';
import { randomToken, sha256 } from './password.js';
import { HttpError } from './http.js';
import { type UserRow, isExpired } from './users.js';
import type { Config } from '../config.js';

export const SESSION_COOKIE = 'kl_session';

export interface SessionInfo {
  id: string;
  csrf: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: UserRow | null;
    session: SessionInfo | null;
  }
}

export function createSession(userId: number, ip: string | undefined, userAgent: string | undefined) {
  const token = randomToken(32);
  const csrf = randomToken(24);
  const id = sha256(token);
  db()
    .prepare('INSERT INTO sessions (id, user_id, csrf_token, ip, user_agent) VALUES (?, ?, ?, ?, ?)')
    .run(id, userId, csrf, ip ?? null, (userAgent ?? '').slice(0, 300));
  return { token, id, csrf };
}

export function destroySession(id: string) {
  db().prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

export function destroyUserSessions(userId: number, exceptId?: string) {
  if (exceptId) db().prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(userId, exceptId);
  else db().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function purgeIdleSessions(idleDays: number) {
  const cutoff = new Date(Date.now() - idleDays * 86400_000).toISOString();
  return db().prepare('DELETE FROM sessions WHERE last_seen_at < ?').run(cutoff).changes;
}

export function setSessionCookie(reply: FastifyReply, token: string, cfg: Config) {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    secure: cfg.cookieSecure,
    sameSite: 'lax',
    maxAge: cfg.sessionIdleDays * 86400,
  });
}

export function clearSessionCookie(reply: FastifyReply, cfg: Config) {
  reply.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, secure: cfg.cookieSecure, sameSite: 'lax' });
}

/** Chemins autorisés tant que l'utilisateur doit changer son mot de passe temporaire. */
const ALLOWED_WHILE_MUST_CHANGE = new Set(['/api/v1/auth/me', '/api/v1/auth/password', '/api/v1/auth/logout']);

export function registerSessionHooks(app: FastifyInstance, cfg: Config) {
  app.decorateRequest('user', null);
  app.decorateRequest('session', null);

  app.addHook('onRequest', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return;
    const id = sha256(token);
    const row = db()
      .prepare(
        `SELECT s.id AS sid, s.csrf_token, s.last_seen_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
      )
      .get(id) as (UserRow & { sid: string; csrf_token: string; last_seen_at: string }) | undefined;
    if (!row) {
      clearSessionCookie(reply, cfg);
      return;
    }
    const idleMs = Date.now() - new Date(row.last_seen_at).getTime();
    if (idleMs > cfg.sessionIdleDays * 86400_000 || row.status !== 'active' || isExpired(row)) {
      destroySession(id);
      clearSessionCookie(reply, cfg);
      return;
    }
    if (idleMs > 60_000) {
      db().prepare('UPDATE sessions SET last_seen_at = ?, ip = ? WHERE id = ?').run(new Date().toISOString(), req.ip, id);
      // Prolonge le cookie (expiration glissante de 30 jours).
      setSessionCookie(reply, token, cfg);
    }
    const { sid, csrf_token, last_seen_at: _ls, ...user } = row;
    req.user = user as UserRow;
    req.session = { id: sid, csrf: csrf_token };
  });
}

/** Vérifie session + CSRF (sur les méthodes modifiant l'état) + changement de mot de passe obligatoire. */
export async function requireAuth(req: FastifyRequest) {
  if (!req.user || !req.session) throw new HttpError(401, 'Connecte-toi pour continuer.', 'unauthenticated');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const header = req.headers['x-csrf-token'];
    if (header !== req.session.csrf) throw new HttpError(403, 'Jeton de sécurité invalide, recharge la page.', 'csrf');
  }
  const path = req.url.split('?')[0];
  if (req.user.must_change_password && !ALLOWED_WHILE_MUST_CHANGE.has(path))
    throw new HttpError(403, 'Change ton mot de passe temporaire pour continuer.', 'must_change_password');
}

export async function requireAdmin(req: FastifyRequest) {
  await requireAuth(req);
  if (req.user!.role !== 'admin') throw new HttpError(403, "Réservé à l'administration.", 'forbidden');
}
