/**
 * Migrations versionnées. Chaque entrée est appliquée une seule fois, dans l'ordre,
 * et son numéro est enregistré dans la table schema_migrations.
 * Ne jamais modifier une migration déjà livrée : en ajouter une nouvelle.
 */
export const migrations: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: 'initial',
    sql: `
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  email TEXT,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  must_change_password INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  totp_secret TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  prefs TEXT NOT NULL DEFAULT '{}',
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_login_at TEXT
);

CREATE TABLE invitations (
  id INTEGER PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  account_expires_at TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  revoked_at TEXT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE folders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX folders_user ON folders(user_id);

CREATE TABLE sets (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  term_lang TEXT NOT NULL DEFAULT 'fr',
  def_lang TEXT NOT NULL DEFAULT 'fr',
  color TEXT NOT NULL DEFAULT '#c8603f',
  tags TEXT NOT NULL DEFAULT '[]',
  link_access INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX sets_owner ON sets(owner_id);

CREATE TABLE cards (
  id INTEGER PRIMARY KEY,
  set_id INTEGER NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  term TEXT NOT NULL,
  definition TEXT NOT NULL,
  example TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  image TEXT,
  audio TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX cards_set ON cards(set_id, position);

CREATE VIRTUAL TABLE cards_fts USING fts5(term, definition, example, content='cards', content_rowid='id', tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER cards_ai AFTER INSERT ON cards BEGIN
  INSERT INTO cards_fts(rowid, term, definition, example) VALUES (new.id, new.term, new.definition, new.example);
END;
CREATE TRIGGER cards_ad AFTER DELETE ON cards BEGIN
  INSERT INTO cards_fts(cards_fts, rowid, term, definition, example) VALUES ('delete', old.id, old.term, old.definition, old.example);
END;
CREATE TRIGGER cards_au AFTER UPDATE OF term, definition, example ON cards BEGIN
  INSERT INTO cards_fts(cards_fts, rowid, term, definition, example) VALUES ('delete', old.id, old.term, old.definition, old.example);
  INSERT INTO cards_fts(rowid, term, definition, example) VALUES (new.id, new.term, new.definition, new.example);
END;

CREATE VIRTUAL TABLE sets_fts USING fts5(title, description, content='sets', content_rowid='id', tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER sets_ai AFTER INSERT ON sets BEGIN
  INSERT INTO sets_fts(rowid, title, description) VALUES (new.id, new.title, new.description);
END;
CREATE TRIGGER sets_ad AFTER DELETE ON sets BEGIN
  INSERT INTO sets_fts(sets_fts, rowid, title, description) VALUES ('delete', old.id, old.title, old.description);
END;
CREATE TRIGGER sets_au AFTER UPDATE OF title, description ON sets BEGIN
  INSERT INTO sets_fts(sets_fts, rowid, title, description) VALUES ('delete', old.id, old.title, old.description);
  INSERT INTO sets_fts(rowid, title, description) VALUES (new.id, new.title, new.description);
END;

CREATE TABLE stars (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, card_id)
);

CREATE TABLE study_progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  due_at TEXT NOT NULL,
  interval_days REAL NOT NULL DEFAULT 0,
  ease REAL NOT NULL DEFAULT 2.5,
  repetitions INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  wrong_count INTEGER NOT NULL DEFAULT 0,
  last_reviewed_at TEXT,
  PRIMARY KEY (user_id, card_id)
);
CREATE INDEX study_progress_due ON study_progress(user_id, due_at);

CREATE TABLE study_log (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id INTEGER REFERENCES cards(id) ON DELETE SET NULL,
  set_id INTEGER REFERENCES sets(id) ON DELETE SET NULL,
  mode TEXT NOT NULL,
  correct INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX study_log_user ON study_log(user_id, created_at);

CREATE TABLE match_scores (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  set_id INTEGER NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
  time_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX match_scores_set ON match_scores(user_id, set_id, time_ms);

CREATE TABLE shares (
  id INTEGER PRIMARY KEY,
  set_id INTEGER NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK (permission IN ('read','edit')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (set_id, user_id)
);

CREATE TABLE set_versions (
  id INTEGER PRIMARY KEY,
  set_id INTEGER NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  snapshot TEXT NOT NULL,
  card_count INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX set_versions_set ON set_versions(set_id, created_at);

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('image','audio')),
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  action TEXT NOT NULL,
  actor_id INTEGER,
  actor_name TEXT,
  target TEXT,
  ip TEXT,
  details TEXT
);
CREATE INDEX audit_log_date ON audit_log(created_at);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`,
  },
];
