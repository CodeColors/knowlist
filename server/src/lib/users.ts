import { db } from '../db.js';

export interface UserRow {
  id: number;
  username: string;
  display_name: string;
  email: string | null;
  password_hash: string | null;
  role: 'admin' | 'user';
  status: 'active' | 'suspended';
  must_change_password: number;
  expires_at: string | null;
  totp_secret: string | null;
  totp_enabled: number;
  prefs: string;
  failed_logins: number;
  locked_until: string | null;
  created_at: string;
  last_login_at: string | null;
}

export interface UserPrefs {
  theme?: 'light' | 'dark' | 'auto';
  reduceMotion?: boolean;
  dyslexiaFont?: boolean;
  dailyGoal?: number;
  onboarded?: boolean;
  writeTolerance?: { accents: boolean; case: boolean; typos: boolean; punctuation: boolean };
}

export function getUser(id: number): UserRow | undefined {
  return db().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function getUserByUsername(username: string): UserRow | undefined {
  return db().prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username) as UserRow | undefined;
}

export function parsePrefs(raw: string): UserPrefs {
  try {
    return JSON.parse(raw) as UserPrefs;
  } catch {
    return {};
  }
}

export function isExpired(u: Pick<UserRow, 'expires_at'>, now = new Date()): boolean {
  return !!u.expires_at && new Date(u.expires_at) <= now;
}

export function userStatus(u: UserRow): 'active' | 'suspended' | 'expired' {
  if (u.status === 'suspended') return 'suspended';
  if (isExpired(u)) return 'expired';
  return 'active';
}

export function publicUser(u: UserRow) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    email: u.email,
    role: u.role,
    mustChangePassword: !!u.must_change_password,
    totpEnabled: !!u.totp_enabled,
    prefs: parsePrefs(u.prefs),
    createdAt: u.created_at,
  };
}

export function adminUserView(u: UserRow) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    email: u.email,
    role: u.role,
    status: userStatus(u),
    suspended: u.status === 'suspended',
    expiresAt: u.expires_at,
    mustChangePassword: !!u.must_change_password,
    hasPassword: !!u.password_hash,
    totpEnabled: !!u.totp_enabled,
    createdAt: u.created_at,
    lastLoginAt: u.last_login_at,
  };
}

/** Identifiant dérivé du nom : « Marie Dupont » → « marie.dupont » (+ suffixe si déjà pris). */
export function suggestUsername(displayName: string): string {
  const base =
    displayName
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 24) || 'utilisateur';
  let candidate = base;
  let n = 2;
  const taken = (name: string) =>
    !!db().prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').get(name) ||
    !!db()
      .prepare('SELECT 1 FROM invitations WHERE username = ? COLLATE NOCASE AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?')
      .get(name, new Date().toISOString());
  while (taken(candidate)) candidate = `${base}${n++}`;
  return candidate;
}

export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,31}$/i;
