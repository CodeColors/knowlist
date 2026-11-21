import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { db, nowIso } from '../db.js';
import { audit } from '../lib/audit.js';
import { HttpError, parse } from '../lib/http.js';
import { checkPasswordPolicy, hashPassword, sha256, verifyPassword } from '../lib/password.js';
import { FailureLimiter } from '../lib/ratelimit.js';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  destroyUserSessions,
  requireAuth,
  setSessionCookie,
} from '../lib/session.js';
import { getSettings } from '../lib/settings.js';
import { getUser, getUserByUsername, isExpired, publicUser, type UserRow } from '../lib/users.js';
import type { Config } from '../config.js';

export const ipLimiter = new FailureLimiter();
export const accountLimiter = new FailureLimiter();

function totpFor(user: Pick<UserRow, 'username'>, secret: string) {
  return new OTPAuth.TOTP({
    issuer: 'KnowList',
    label: user.username,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

export function verifyTotp(user: Pick<UserRow, 'username'>, secret: string, code: string): boolean {
  const clean = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  return totpFor(user, secret).validate({ token: clean, window: 1 }) !== null;
}

export default async function authRoutes(app: FastifyInstance, opts: { config: Config }) {
  const cfg = opts.config;

  app.post('/auth/login', async (req, reply) => {
    const body = parse(
      z.object({ username: z.string().trim().min(1).max(64), password: z.string().min(1).max(256), totp: z.string().max(10).optional() }),
      req.body,
    );
    const ipKey = `ip:${req.ip}`;
    const accKey = `acc:${body.username.toLowerCase()}`;
    const wait = Math.max(ipLimiter.retryAfter(ipKey), accountLimiter.retryAfter(accKey));
    if (wait > 0) {
      audit('login.locked', { target: body.username, ip: req.ip });
      req.log.warn({ event: 'auth_locked', ip: req.ip }, 'knowlist auth locked');
      const secs = Math.ceil(wait / 1000);
      reply.header('Retry-After', String(secs));
      throw new HttpError(429, `Trop de tentatives. Réessaie dans ${formatWait(secs)}.`, 'rate_limited', { retryAfter: secs });
    }

    const user = getUserByUsername(body.username);
    const ok = await verifyPassword(user?.password_hash ?? null, body.password);
    const fail = (reason: string) => {
      ipLimiter.fail(ipKey);
      accountLimiter.fail(accKey);
      audit('login.failure', { actorId: user?.id ?? null, target: body.username, ip: req.ip, details: { reason } });
      // Ligne repérable par fail2ban (voir deploy/fail2ban).
      req.log.warn({ event: 'auth_failure', ip: req.ip }, `knowlist auth failure from ${req.ip}`);
    };
    if (!user || !ok) {
      fail('bad_credentials');
      throw new HttpError(401, 'Identifiant ou mot de passe incorrect.', 'bad_credentials');
    }
    if (user.status !== 'active') {
      fail('suspended');
      throw new HttpError(403, "Ce compte est suspendu. Contacte l'administrateur.", 'suspended');
    }
    if (isExpired(user)) {
      fail('expired');
      throw new HttpError(403, "L'accès de ce compte a expiré. Contacte l'administrateur.", 'expired');
    }
    if (user.totp_enabled && user.totp_secret) {
      if (!body.totp) throw new HttpError(401, 'Saisis le code de ton application d’authentification.', 'totp_required');
      if (!verifyTotp(user, user.totp_secret, body.totp)) {
        fail('bad_totp');
        throw new HttpError(401, 'Code de vérification incorrect.', 'bad_totp');
      }
    }
    ipLimiter.reset(ipKey);
    accountLimiter.reset(accKey);
    const s = createSession(user.id, req.ip, req.headers['user-agent']);
    db().prepare('UPDATE users SET last_login_at = ?, failed_logins = 0 WHERE id = ?').run(nowIso(), user.id);
    audit('login.success', { actorId: user.id, actorName: user.username, ip: req.ip });
    setSessionCookie(reply, s.token, cfg);
    return { user: publicUser(user), csrf: s.csrf };
  });

  app.post('/auth/logout', async (req, reply) => {
    if (req.session) {
      if (req.headers['x-csrf-token'] !== req.session.csrf) throw new HttpError(403, 'Jeton de sécurité invalide.', 'csrf');
      destroySession(req.session.id);
      audit('logout', { actorId: req.user!.id, actorName: req.user!.username, ip: req.ip });
    }
    clearSessionCookie(reply, cfg);
    return { ok: true };
  });

  app.get('/auth/me', async (req) => {
    if (!req.user || !req.session) throw new HttpError(401, 'Non connecté.', 'unauthenticated');
    const s = getSettings();
    return {
      user: publicUser(req.user),
      csrf: req.session.csrf,
      app: { welcomeMessage: s.welcomeMessage, externalServices: s.externalServices, passwordMinLength: Math.max(12, s.passwordMinLength) },
    };
  });

  app.post('/auth/password', { preHandler: requireAuth }, async (req) => {
    const body = parse(z.object({ currentPassword: z.string().max(256), newPassword: z.string().max(256) }), req.body);
    const user = req.user!;
    if (!(await verifyPassword(user.password_hash, body.currentPassword)))
      throw new HttpError(400, 'Le mot de passe actuel est incorrect.', 'bad_password');
    if (body.currentPassword === body.newPassword) throw new HttpError(400, 'Choisis un mot de passe différent de l’actuel.', 'same_password');
    const err = checkPasswordPolicy(body.newPassword, { minLength: getSettings().passwordMinLength }, user.username);
    if (err) throw new HttpError(400, err, 'weak_password');
    const h = await hashPassword(body.newPassword);
    db().prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(h, user.id);
    destroyUserSessions(user.id, req.session!.id);
    audit('password.change', { actorId: user.id, actorName: user.username, ip: req.ip });
    return { user: publicUser(getUser(user.id)!) };
  });

  // --- Invitations (page publique d'acceptation, protégée par le jeton) ---
  const findInvitation = (token: string) => {
    const inv = db().prepare('SELECT * FROM invitations WHERE token_hash = ?').get(sha256(token)) as any;
    if (!inv) throw new HttpError(404, 'Ce lien d’invitation est invalide.', 'invalid_invitation');
    if (inv.revoked_at) throw new HttpError(410, 'Cette invitation a été révoquée.', 'revoked');
    if (inv.used_at) throw new HttpError(410, 'Cette invitation a déjà été utilisée.', 'used');
    if (new Date(inv.expires_at) <= new Date()) throw new HttpError(410, 'Cette invitation a expiré. Demande un nouveau lien.', 'expired');
    return inv;
  };

  app.get('/auth/invitation/:token', async (req) => {
    const inv = findInvitation((req.params as any).token);
    return {
      username: inv.username,
      displayName: inv.display_name,
      expiresAt: inv.expires_at,
      passwordMinLength: Math.max(12, getSettings().passwordMinLength),
    };
  });

  app.post('/auth/invitation/:token', async (req, reply) => {
    const inv = findInvitation((req.params as any).token);
    const body = parse(z.object({ password: z.string().max(256) }), req.body);
    const err = checkPasswordPolicy(body.password, { minLength: getSettings().passwordMinLength }, inv.username);
    if (err) throw new HttpError(400, err, 'weak_password');
    if (getUserByUsername(inv.username)) throw new HttpError(409, 'Cet identifiant est déjà pris. Demande une nouvelle invitation.', 'username_taken');
    const h = await hashPassword(body.password);
    const userId = db().transaction(() => {
      const r = db()
        .prepare('INSERT INTO users (username, display_name, email, password_hash, role, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(inv.username, inv.display_name, inv.email, h, inv.role, inv.account_expires_at);
      db().prepare('UPDATE invitations SET used_at = ?, user_id = ? WHERE id = ?').run(nowIso(), r.lastInsertRowid, inv.id);
      return Number(r.lastInsertRowid);
    })();
    audit('invitation.accept', { actorId: userId, actorName: inv.username, ip: req.ip });
    const s = createSession(userId, req.ip, req.headers['user-agent']);
    setSessionCookie(reply, s.token, cfg);
    return { user: publicUser(getUser(userId)!), csrf: s.csrf };
  });

  // --- Double authentification (TOTP) ---
  app.post('/auth/totp/setup', { preHandler: requireAuth }, async (req) => {
    const user = req.user!;
    if (user.totp_enabled) throw new HttpError(400, 'La double authentification est déjà active.', 'already_enabled');
    const secret = new OTPAuth.Secret({ size: 20 }).base32;
    db().prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(secret, user.id);
    const uri = totpFor(user, secret).toString();
    const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
    return { secret, uri, qr };
  });

  app.post('/auth/totp/enable', { preHandler: requireAuth }, async (req) => {
    const body = parse(z.object({ code: z.string().max(10) }), req.body);
    const user = getUser(req.user!.id)!;
    if (!user.totp_secret) throw new HttpError(400, 'Lance d’abord la configuration.', 'no_secret');
    if (!verifyTotp(user, user.totp_secret, body.code)) throw new HttpError(400, 'Code incorrect, réessaie.', 'bad_totp');
    db().prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(user.id);
    audit('totp.enable', { actorId: user.id, actorName: user.username, ip: req.ip });
    return { user: publicUser(getUser(user.id)!) };
  });

  app.post('/auth/totp/disable', { preHandler: requireAuth }, async (req) => {
    const body = parse(z.object({ password: z.string().max(256) }), req.body);
    const user = req.user!;
    if (!(await verifyPassword(user.password_hash, body.password))) throw new HttpError(400, 'Mot de passe incorrect.', 'bad_password');
    db().prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?').run(user.id);
    audit('totp.disable', { actorId: user.id, actorName: user.username, ip: req.ip });
    return { user: publicUser(getUser(user.id)!) };
  });
}

function formatWait(secs: number) {
  if (secs < 60) return `${secs} s`;
  const m = Math.ceil(secs / 60);
  return `${m} min`;
}
