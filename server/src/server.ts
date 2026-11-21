import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { buildApp } from './app.js';
import { purgeAudit } from './lib/audit.js';
import { createBackup, pruneBackups } from './lib/backup.js';
import { purgeIdleSessions } from './lib/session.js';
import { cleanupOrphanMedia } from './routes/media.js';

const cfg = loadConfig();
openDb(cfg.dbPath);
const app = await buildApp(cfg);

/** Tâches périodiques : purge (sessions inactives, journal > 90 j, médias orphelins) et sauvegarde nocturne. */
let lastBackupDay = '';
async function housekeeping() {
  try {
    purgeIdleSessions(cfg.sessionIdleDays);
    purgeAudit(90);
    cleanupOrphanMedia(cfg.uploadsDir);
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    if (now.getUTCHours() === cfg.backupHour && lastBackupDay !== day) {
      lastBackupDay = day;
      const b = await createBackup(cfg, 'auto');
      const pruned = pruneBackups(cfg);
      app.log.info({ backup: b.name, pruned }, 'sauvegarde nocturne effectuée');
    }
  } catch (err) {
    app.log.error(err, 'échec des tâches périodiques');
  }
}
setInterval(housekeeping, 10 * 60_000).unref();
setTimeout(housekeeping, 5_000).unref();

const shutdown = async (signal: string) => {
  app.log.info(`${signal} reçu, arrêt propre`);
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: cfg.port, host: cfg.host });
