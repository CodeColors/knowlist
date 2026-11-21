import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { db } from '../db.js';
import { ACCESSIBLE_SETS_SQL } from '../lib/access.js';
import { HttpError, notFound } from '../lib/http.js';
import { requireAuth } from '../lib/session.js';
import { getSettings } from '../lib/settings.js';
import type { Config } from '../config.js';

const AUDIO_TYPES: { ext: string; mime: string; test: (b: Buffer) => boolean }[] = [
  { ext: 'mp3', mime: 'audio/mpeg', test: (b) => b.subarray(0, 3).toString('latin1') === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
  { ext: 'ogg', mime: 'audio/ogg', test: (b) => b.subarray(0, 4).toString('latin1') === 'OggS' },
  { ext: 'wav', mime: 'audio/wav', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WAVE' },
  { ext: 'webm', mime: 'audio/webm', test: (b) => b.readUInt32BE(0) === 0x1a45dfa3 },
  { ext: 'm4a', mime: 'audio/mp4', test: (b) => b.subarray(4, 8).toString('latin1') === 'ftyp' },
];

export const MEDIA_RE = /^[a-f0-9-]{36}\.(webp|mp3|ogg|wav|webm|m4a)$/;

export default async function mediaRoutes(app: FastifyInstance, opts: { config: Config }) {
  const dir = opts.config.uploadsDir;
  fs.mkdirSync(dir, { recursive: true });
  app.addHook('preHandler', requireAuth);

  app.post('/media', async (req) => {
    const settings = getSettings();
    const file = await req.file({ limits: { fileSize: Math.max(settings.maxImageKb, settings.maxAudioKb) * 1024 + 1, files: 1 } });
    if (!file) throw new HttpError(400, 'Aucun fichier reçu.', 'validation');
    const buf = await file.toBuffer().catch(() => {
      throw new HttpError(413, 'Fichier trop volumineux.', 'too_large');
    });
    if (file.file.truncated) throw new HttpError(413, 'Fichier trop volumineux.', 'too_large');
    const uuid = crypto.randomUUID();
    const isImage = file.mimetype.startsWith('image/');
    let name: string;
    let mime: string;
    let out: Buffer;
    if (isImage) {
      if (buf.length > settings.maxImageKb * 1024) throw new HttpError(413, `Image trop lourde (max ${settings.maxImageKb} Ko).`, 'too_large');
      try {
        // Le décodage par sharp valide le contenu réel ; on ré-encode (supprime métadonnées EXIF/GPS).
        out = await sharp(buf, { limitInputPixels: 40_000_000 })
          .rotate()
          .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 78 })
          .toBuffer();
      } catch {
        throw new HttpError(415, "Ce fichier n'est pas une image valide.", 'bad_type');
      }
      name = `${uuid}.webp`;
      mime = 'image/webp';
    } else {
      if (buf.length > settings.maxAudioKb * 1024) throw new HttpError(413, `Audio trop lourd (max ${settings.maxAudioKb} Ko).`, 'too_large');
      const t = buf.length >= 12 ? AUDIO_TYPES.find((a) => a.test(buf)) : undefined;
      if (!t) throw new HttpError(415, 'Format audio non pris en charge (mp3, ogg, wav, webm, m4a).', 'bad_type');
      out = buf;
      name = `${uuid}.${t.ext}`;
      mime = t.mime;
    }
    await fs.promises.writeFile(path.join(dir, name), out);
    db().prepare('INSERT INTO media (id, owner_id, kind, mime, size) VALUES (?, ?, ?, ?, ?)').run(name, req.user!.id, isImage ? 'image' : 'audio', mime, out.length);
    return { id: name, kind: isImage ? 'image' : 'audio', size: out.length };
  });

  app.get('/media/:name', async (req, reply) => {
    const name = String((req.params as any).name);
    if (!MEDIA_RE.test(name)) throw notFound('Fichier');
    const uid = req.user!.id;
    const media = db().prepare('SELECT * FROM media WHERE id = ?').get(name) as { owner_id: number; mime: string } | undefined;
    if (!media) throw notFound('Fichier');
    let allowed = media.owner_id === uid;
    if (!allowed) {
      allowed = !!db()
        .prepare(
          `SELECT 1 FROM cards c JOIN sets s ON s.id = c.set_id WHERE (c.image = ? OR c.audio = ?)
           AND (s.link_access = 1 OR s.id IN (${ACCESSIBLE_SETS_SQL})) LIMIT 1`,
        )
        .get(name, name, uid, uid);
    }
    if (!allowed) throw notFound('Fichier');
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) throw notFound('Fichier');
    reply.header('Content-Type', media.mime).header('Cache-Control', 'private, max-age=31536000, immutable');
    return reply.send(fs.createReadStream(file));
  });
}

/** Supprime les fichiers qui ne sont plus référencés par aucune carte (après 24 h de grâce). */
export function cleanupOrphanMedia(uploadsDir: string): number {
  const cutoff = new Date(Date.now() - 86400_000).toISOString();
  const orphans = db()
    .prepare(
      `SELECT id FROM media m WHERE created_at < ? AND NOT EXISTS (SELECT 1 FROM cards c WHERE c.image = m.id OR c.audio = m.id)`,
    )
    .all(cutoff) as { id: string }[];
  for (const o of orphans) {
    fs.rmSync(path.join(uploadsDir, o.id), { force: true });
    db().prepare('DELETE FROM media WHERE id = ?').run(o.id);
  }
  // Fichiers présents sur disque sans ligne en base (ex. compte supprimé).
  if (fs.existsSync(uploadsDir)) {
    const known = new Set((db().prepare('SELECT id FROM media').all() as { id: string }[]).map((r) => r.id));
    for (const f of fs.readdirSync(uploadsDir)) {
      if (!MEDIA_RE.test(f) || known.has(f)) continue;
      const st = fs.statSync(path.join(uploadsDir, f));
      if (st.mtimeMs < Date.now() - 86400_000) fs.rmSync(path.join(uploadsDir, f), { force: true });
    }
  }
  return orphans.length;
}
