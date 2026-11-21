import { hash, verify, Algorithm } from '@node-rs/argon2';
import crypto from 'node:crypto';
import { isCommonPassword } from './common-passwords.js';

const ARGON_OPTS = { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function hashPassword(pw: string): Promise<string> {
  return hash(pw, ARGON_OPTS);
}

export async function verifyPassword(hashStr: string | null, pw: string): Promise<boolean> {
  if (!hashStr) {
    // Temps constant approximatif même sans hash (évite l'énumération de comptes).
    await hash(pw, ARGON_OPTS);
    return false;
  }
  try {
    return await verify(hashStr, pw);
  } catch {
    return false;
  }
}

export interface PasswordPolicy {
  minLength: number;
}

/** Renvoie un message d'erreur en français, ou null si le mot de passe est acceptable. */
export function checkPasswordPolicy(pw: string, policy: PasswordPolicy, username?: string): string | null {
  const min = Math.max(12, policy.minLength);
  if (pw.length < min) return `Le mot de passe doit contenir au moins ${min} caractères.`;
  if (pw.length > 256) return 'Le mot de passe est trop long (256 caractères maximum).';
  if (isCommonPassword(pw)) return 'Ce mot de passe est trop courant : choisis-en un plus personnel.';
  if (username && pw.toLowerCase().includes(username.toLowerCase()) && username.length >= 4)
    return "Le mot de passe ne doit pas contenir ton identifiant.";
  return null;
}

const WORDS = [
  'abricot', 'baleine', 'cactus', 'dauphin', 'erable', 'fougere', 'girafe', 'hibou', 'iris', 'jasmin', 'kiwi', 'lavande',
  'mangue', 'nuage', 'olive', 'papaye', 'quartz', 'radis', 'sapin', 'tulipe', 'vanille', 'wapiti', 'yaourt', 'zebre',
  'cerise', 'colibri', 'menthe', 'prairie', 'lagune', 'falaise', 'orage', 'boussole', 'lanterne', 'carnet', 'plume', 'galet',
];

/** Mot de passe temporaire robuste mais lisible : 3 mots + nombre (≈ 15-25 caractères). */
export function generateTempPassword(): string {
  const pick = () => WORDS[crypto.randomInt(WORDS.length)];
  return `${pick()}-${pick()}-${pick()}-${crypto.randomInt(100, 1000)}`;
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}
