/**
 * Limitation des tentatives de connexion (par IP et par compte) :
 * 5 échecs tolérés, puis un délai croissant (doublé à chaque échec, plafonné à 1 h).
 * Le compteur en mémoire suffit pour une instance unique ; fail2ban complète côté serveur.
 */
const FREE_ATTEMPTS = 5;
const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 60 * 60_000;
const FORGET_AFTER_MS = 24 * 60 * 60_000;

interface Entry {
  failures: number;
  lockedUntil: number;
  lastFailure: number;
}

export class FailureLimiter {
  private map = new Map<string, Entry>();

  /** Millisecondes restantes avant de pouvoir réessayer (0 si libre). */
  retryAfter(key: string, now = Date.now()): number {
    const e = this.map.get(key);
    if (!e) return 0;
    if (now - e.lastFailure > FORGET_AFTER_MS) {
      this.map.delete(key);
      return 0;
    }
    return Math.max(0, e.lockedUntil - now);
  }

  fail(key: string, now = Date.now()): number {
    const e = this.map.get(key) ?? { failures: 0, lockedUntil: 0, lastFailure: now };
    e.failures += 1;
    e.lastFailure = now;
    e.lockedUntil = now + lockDelay(e.failures);
    this.map.set(key, e);
    if (this.map.size > 50_000) this.prune(now);
    return e.lockedUntil - now;
  }

  reset(key: string): void {
    this.map.delete(key);
  }

  private prune(now: number) {
    for (const [k, e] of this.map) if (now - e.lastFailure > FORGET_AFTER_MS) this.map.delete(k);
  }
}

export function lockDelay(failures: number): number {
  if (failures < FREE_ATTEMPTS) return 0;
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (failures - FREE_ATTEMPTS));
}
