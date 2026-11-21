import { db } from '../db.js';
import { forbidden, notFound } from './http.js';

export type Permission = 'owner' | 'edit' | 'read';

export interface SetRow {
  id: number;
  owner_id: number;
  folder_id: number | null;
  title: string;
  description: string;
  term_lang: string;
  def_lang: string;
  color: string;
  tags: string;
  link_access: number;
  created_at: string;
  updated_at: string;
}

/** Sous-requête SQL des sets visibles dans les listes d'un utilisateur (paramètre : user id ×2). */
export const ACCESSIBLE_SETS_SQL = `SELECT id FROM sets WHERE owner_id = ? UNION SELECT set_id FROM shares WHERE user_id = ?`;

export function permissionFor(set: SetRow, userId: number): Permission | null {
  if (set.owner_id === userId) return 'owner';
  const share = db().prepare('SELECT permission FROM shares WHERE set_id = ? AND user_id = ?').get(set.id, userId) as
    | { permission: 'read' | 'edit' }
    | undefined;
  if (share) return share.permission;
  if (set.link_access) return 'read';
  return null;
}

const RANK: Record<Permission, number> = { read: 1, edit: 2, owner: 3 };

/** Charge un set et vérifie que l'utilisateur a au moins le niveau demandé (contrôle côté serveur, à chaque requête). */
export function loadSet(setId: number, userId: number, needed: Permission = 'read'): { set: SetRow; permission: Permission } {
  const set = db().prepare('SELECT * FROM sets WHERE id = ?').get(setId) as SetRow | undefined;
  if (!set) throw notFound('Set');
  const permission = permissionFor(set, userId);
  if (!permission) throw notFound('Set'); // ne révèle pas l'existence du set
  if (RANK[permission] < RANK[needed]) throw forbidden(needed === 'owner' ? 'Seul le propriétaire du set peut faire cela.' : 'Tu as un accès en lecture seule à ce set.');
  return { set, permission };
}
