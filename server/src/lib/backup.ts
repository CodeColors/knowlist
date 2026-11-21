import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as tar from 'tar';
import Database from 'better-sqlite3';
import { closeDb, db, dbPath, openDb } from '../db.js';
import type { Config } from '../config.js';

export const BACKUP_RE = /^knowlist-\d{8}-\d{6}(-[a-z]+)?\.tar\.gz$/;

export interface BackupInfo {
  name: string;
  size: number;
  createdAt: string;
}

function stamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

/** Sauvegarde cohérente : copie en ligne de la base SQLite + fichiers envoyés, dans une archive .tar.gz. */
export async function createBackup(cfg: Config, label?: 'auto' | 'manual' | 'prerestore'): Promise<BackupInfo> {
  fs.mkdirSync(cfg.backupsDir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'knowlist-backup-'));
  try {
    await db().backup(path.join(tmp, 'knowlist.db'));
    const uploadsLink = path.join(tmp, 'uploads');
    fs.mkdirSync(uploadsLink);
    if (fs.existsSync(cfg.uploadsDir)) {
      for (const f of fs.readdirSync(cfg.uploadsDir)) fs.copyFileSync(path.join(cfg.uploadsDir, f), path.join(uploadsLink, f));
    }
    const versions = (db().prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number }).v;
    fs.writeFileSync(
      path.join(tmp, 'manifest.json'),
      JSON.stringify({ app: 'knowlist', schemaVersion: versions, createdAt: new Date().toISOString() }, null, 2),
    );
    let name = `knowlist-${stamp()}${label && label !== 'manual' ? `-${label}` : ''}.tar.gz`;
    let i = 0;
    while (fs.existsSync(path.join(cfg.backupsDir, name))) name = `knowlist-${stamp(new Date(Date.now() + ++i * 1000))}${label && label !== 'manual' ? `-${label}` : ''}.tar.gz`;
    const dest = path.join(cfg.backupsDir, name);
    await tar.create({ gzip: true, file: dest, cwd: tmp, portable: true }, ['manifest.json', 'knowlist.db', 'uploads']);
    fs.chmodSync(dest, 0o600);
    const st = fs.statSync(dest);
    return { name, size: st.size, createdAt: st.mtime.toISOString() };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export function listBackups(cfg: Config): BackupInfo[] {
  if (!fs.existsSync(cfg.backupsDir)) return [];
  return fs
    .readdirSync(cfg.backupsDir)
    .filter((f) => BACKUP_RE.test(f))
    .map((name) => {
      const st = fs.statSync(path.join(cfg.backupsDir, name));
      return { name, size: st.size, createdAt: st.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function pruneBackups(cfg: Config): number {
  const cutoff = Date.now() - cfg.backupRetentionDays * 86400_000;
  let n = 0;
  for (const b of listBackups(cfg)) {
    if (new Date(b.createdAt).getTime() < cutoff) {
      fs.rmSync(path.join(cfg.backupsDir, b.name), { force: true });
      n++;
    }
  }
  return n;
}

/** Vérifie une archive et en extrait le contenu dans un dossier temporaire. */
export async function extractBackup(file: string): Promise<string> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'knowlist-restore-'));
  try {
    await tar.extract({
      file,
      cwd: tmp,
      strict: true,
      filter: (p) => {
        const norm = path.normalize(p);
        return !norm.startsWith('..') && !path.isAbsolute(norm) && (norm === 'manifest.json' || norm === 'knowlist.db' || norm.startsWith('uploads'));
      },
    });
    const manifest = JSON.parse(fs.readFileSync(path.join(tmp, 'manifest.json'), 'utf8'));
    if (manifest.app !== 'knowlist') throw new Error('manifest invalide');
    const test = new Database(path.join(tmp, 'knowlist.db'), { readonly: true });
    try {
      const check = test.pragma('integrity_check', { simple: true });
      if (check !== 'ok') throw new Error(`base corrompue (${check})`);
      test.prepare('SELECT COUNT(*) FROM users').get();
    } finally {
      test.close();
    }
    return tmp;
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw new Error(`Archive de sauvegarde invalide : ${(e as Error).message}`);
  }
}

/** Restaure une archive : sauvegarde de sécurité, remplacement de la base et des fichiers, réouverture + migrations. */
export async function restoreBackup(cfg: Config, file: string, opts: { safetyBackup?: boolean } = {}): Promise<{ safety?: BackupInfo }> {
  const extracted = await extractBackup(file);
  try {
    const safety = opts.safetyBackup !== false ? await createBackup(cfg, 'prerestore') : undefined;
    const target = dbPath() || cfg.dbPath;
    closeDb();
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(target + suffix, { force: true });
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(extracted, 'knowlist.db'), target);
    fs.rmSync(cfg.uploadsDir, { recursive: true, force: true });
    fs.mkdirSync(cfg.uploadsDir, { recursive: true });
    const up = path.join(extracted, 'uploads');
    if (fs.existsSync(up)) for (const f of fs.readdirSync(up)) fs.copyFileSync(path.join(up, f), path.join(cfg.uploadsDir, f));
    openDb(target);
    return { safety };
  } finally {
    fs.rmSync(extracted, { recursive: true, force: true });
  }
}

export function dirSize(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return total;
}
