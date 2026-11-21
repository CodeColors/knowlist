import { db } from '../db.js';

export interface AppSettings {
  invitationDays: number;
  passwordMinLength: number;
  maxSetsPerUser: number;
  maxCardsPerUser: number;
  maxImageKb: number;
  maxAudioKb: number;
  externalServices: boolean;
  welcomeMessage: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  invitationDays: 7,
  passwordMinLength: 12,
  maxSetsPerUser: 500,
  maxCardsPerUser: 50000,
  maxImageKb: 5120,
  maxAudioKb: 5120,
  externalServices: false,
  welcomeMessage: 'Bienvenue sur KnowList !',
};

export function getSettings(): AppSettings {
  const rows = db().prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const out: AppSettings = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.key in out) {
      try {
        (out as any)[r.key] = JSON.parse(r.value);
      } catch {
        /* valeur corrompue : on garde le défaut */
      }
    }
  }
  return out;
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const stmt = db().prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  db().transaction(() => {
    for (const [k, v] of Object.entries(patch)) if (k in DEFAULT_SETTINGS && v !== undefined) stmt.run(k, JSON.stringify(v));
  })();
  return getSettings();
}
