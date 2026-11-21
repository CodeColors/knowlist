/**
 * Outils d'administration en ligne de commande.
 *   create-admin <identifiant> [--name "Nom affiché"] [--email x@y]  → crée un administrateur (mot de passe demandé ou généré)
 *   reset-password <identifiant>                                      → génère un mot de passe temporaire
 *   backup                                                            → crée une sauvegarde
 *   restore <fichier.tar.gz>                                          → restaure une sauvegarde (serveur arrêté)
 *   seed-demo <identifiant>                                           → ajoute des sets d'exemple à un compte
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { loadConfig } from './config.js';
import { db, openDb } from './db.js';
import { audit } from './lib/audit.js';
import { createBackup, restoreBackup } from './lib/backup.js';
import { checkPasswordPolicy, generateTempPassword, hashPassword } from './lib/password.js';
import { destroyUserSessions } from './lib/session.js';
import { getSettings } from './lib/settings.js';
import { USERNAME_RE, getUserByUsername } from './lib/users.js';

const cfg = loadConfig();
const [cmd, ...rest] = process.argv.slice(2);

function flag(name: string): string | undefined {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
}

async function askPassword(): Promise<string | null> {
  if (!process.stdin.isTTY) return null;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const pw = await rl.question('Mot de passe (laisser vide pour en générer un temporaire) : ');
  rl.close();
  return pw || null;
}

async function main() {
  switch (cmd) {
    case 'create-admin': {
      openDb(cfg.dbPath);
      const username = rest[0];
      if (!username || !USERNAME_RE.test(username)) throw new Error('Usage : create-admin <identifiant> [--name "Nom"] [--email x@y]');
      if (getUserByUsername(username)) throw new Error(`L'identifiant « ${username} » existe déjà.`);
      let pw = await askPassword();
      let mustChange = 0;
      if (pw) {
        const err = checkPasswordPolicy(pw, { minLength: getSettings().passwordMinLength }, username);
        if (err) throw new Error(err);
      } else {
        pw = generateTempPassword();
        mustChange = 1;
      }
      db()
        .prepare("INSERT INTO users (username, display_name, email, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, 'admin', ?)")
        .run(username, flag('name') ?? username, flag('email') ?? null, await hashPassword(pw), mustChange);
      audit('user.create', { actorName: 'cli', target: username, details: { role: 'admin', mode: 'cli' } });
      console.log(`✔ Administrateur « ${username} » créé.`);
      if (mustChange) console.log(`  Mot de passe temporaire : ${pw}\n  (à changer à la première connexion)`);
      break;
    }
    case 'reset-password': {
      openDb(cfg.dbPath);
      const user = getUserByUsername(rest[0] ?? '');
      if (!user) throw new Error('Compte introuvable.');
      const pw = generateTempPassword();
      db().prepare('UPDATE users SET password_hash = ?, must_change_password = 1, status = ? WHERE id = ?').run(await hashPassword(pw), 'active', user.id);
      destroyUserSessions(user.id);
      audit('password.reset', { actorName: 'cli', target: user.username });
      console.log(`✔ Mot de passe temporaire pour « ${user.username} » : ${pw}`);
      break;
    }
    case 'backup': {
      openDb(cfg.dbPath);
      const b = await createBackup(cfg, 'manual');
      console.log(`✔ Sauvegarde créée : ${path.join(cfg.backupsDir, b.name)} (${(b.size / 1024).toFixed(0)} Ko)`);
      break;
    }
    case 'restore': {
      const file = rest[0];
      if (!file || !fs.existsSync(file)) throw new Error('Usage : restore <fichier.tar.gz>');
      const fresh = !fs.existsSync(cfg.dbPath);
      openDb(cfg.dbPath);
      const { safety } = await restoreBackup(cfg, path.resolve(file), { safetyBackup: !fresh });
      console.log(`✔ Restauration terminée depuis ${file}.`);
      if (safety) console.log(`  Sauvegarde de sécurité de l'état précédent : ${safety.name}`);
      break;
    }
    case 'seed-demo': {
      openDb(cfg.dbPath);
      const user = getUserByUsername(rest[0] ?? '');
      if (!user) throw new Error('Usage : seed-demo <identifiant>');
      const { seedDemo } = await import('./lib/demo.js');
      const n = seedDemo(user.id);
      console.log(`✔ ${n} sets d'exemple ajoutés à « ${user.username} ».`);
      break;
    }
    default:
      console.log('Commandes : create-admin, reset-password, backup, restore, seed-demo');
      process.exitCode = cmd ? 1 : 0;
  }
}

main().catch((e) => {
  console.error(`✖ ${(e as Error).message}`);
  process.exit(1);
});
