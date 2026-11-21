import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { migrations } from './migrations.js';

export type DB = Database.Database;

let current: DB | null = null;
let currentPath = '';

export function openDb(file: string): DB {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  current = db;
  currentPath = file;
  return db;
}

/** Accès à la connexion courante (peut changer après une restauration). */
export function db(): DB {
  if (!current) throw new Error('Base de données non initialisée');
  return current;
}

export function dbPath(): string {
  return currentPath;
}

export function closeDb(): void {
  current?.close();
  current = null;
}

export function migrate(database: DB): number[] {
  database.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`);
  const applied = new Set(
    (database.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map((r) => r.version),
  );
  const done: number[] = [];
  for (const m of migrations) {
    if (applied.has(m.version)) continue;
    database.transaction(() => {
      database.exec(m.sql);
      database.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name);
    })();
    done.push(m.version);
  }
  return done;
}

export const nowIso = () => new Date().toISOString();
