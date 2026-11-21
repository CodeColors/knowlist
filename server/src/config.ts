import path from 'node:path';

function bool(v: string | undefined, def: boolean): boolean {
  if (v === undefined || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  dbPath: string;
  uploadsDir: string;
  backupsDir: string;
  webDir: string;
  publicUrl: string;
  cookieSecure: boolean;
  trustProxy: boolean;
  backupHour: number;
  backupRetentionDays: number;
  sessionIdleDays: number;
  logLevel: string;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const dataDir = overrides.dataDir ?? path.resolve(process.env.KNOWLIST_DATA_DIR ?? './data');
  const base: Config = {
    port: Number(process.env.PORT ?? 3000),
    host: process.env.HOST ?? '0.0.0.0',
    dataDir,
    dbPath: path.join(dataDir, 'knowlist.db'),
    uploadsDir: path.join(dataDir, 'uploads'),
    backupsDir: path.join(dataDir, 'backups'),
    webDir: path.resolve(process.env.KNOWLIST_WEB_DIR ?? path.join(import.meta.dirname, '../../web/dist')),
    publicUrl: (process.env.PUBLIC_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
    cookieSecure: bool(process.env.COOKIE_SECURE, process.env.NODE_ENV === 'production'),
    trustProxy: bool(process.env.TRUST_PROXY, process.env.NODE_ENV === 'production'),
    backupHour: Number(process.env.BACKUP_HOUR ?? 3),
    backupRetentionDays: Number(process.env.BACKUP_RETENTION_DAYS ?? 14),
    sessionIdleDays: 30,
    logLevel: process.env.LOG_LEVEL ?? 'info',
  };
  const merged = { ...base, ...overrides };
  if (overrides.dataDir) {
    merged.dbPath = overrides.dbPath ?? path.join(dataDir, 'knowlist.db');
    merged.uploadsDir = overrides.uploadsDir ?? path.join(dataDir, 'uploads');
    merged.backupsDir = overrides.backupsDir ?? path.join(dataDir, 'backups');
  }
  return merged;
}
