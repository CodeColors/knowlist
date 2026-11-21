import { db } from '../db.js';

export type AuditAction =
  | 'login.success'
  | 'login.failure'
  | 'login.locked'
  | 'logout'
  | 'password.change'
  | 'password.reset'
  | 'user.create'
  | 'user.update'
  | 'user.suspend'
  | 'user.reactivate'
  | 'user.delete'
  | 'user.self_delete'
  | 'session.revoke'
  | 'invitation.create'
  | 'invitation.accept'
  | 'invitation.revoke'
  | 'totp.enable'
  | 'totp.disable'
  | 'settings.update'
  | 'backup.create'
  | 'backup.restore'
  | 'data.export';

export function audit(
  action: AuditAction,
  opts: { actorId?: number | null; actorName?: string | null; target?: string | null; ip?: string | null; details?: unknown } = {},
): void {
  db()
    .prepare('INSERT INTO audit_log (action, actor_id, actor_name, target, ip, details) VALUES (?, ?, ?, ?, ?, ?)')
    .run(
      action,
      opts.actorId ?? null,
      opts.actorName ?? null,
      opts.target ?? null,
      opts.ip ?? null,
      opts.details === undefined ? null : JSON.stringify(opts.details),
    );
}

/** Conservation 90 jours. */
export function purgeAudit(days = 90): number {
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  return db().prepare('DELETE FROM audit_log WHERE created_at < ?').run(cutoff).changes;
}
