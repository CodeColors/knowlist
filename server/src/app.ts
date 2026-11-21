import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import type { Config } from './config.js';
import { HttpError, sendError } from './lib/http.js';
import { registerSessionHooks } from './lib/session.js';
import authRoutes from './routes/auth.js';
import setRoutes from './routes/sets.js';
import folderRoutes from './routes/folders.js';
import searchRoutes from './routes/search.js';
import studyRoutes from './routes/study.js';
import statsRoutes from './routes/stats.js';
import meRoutes from './routes/me.js';
import mediaRoutes from './routes/media.js';
import adminRoutes from './routes/admin.js';

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

/** Pages accessibles sans session (tout le reste redirige vers la connexion). */
const PUBLIC_PAGES = [/^\/connexion\/?$/, /^\/invitation\/[\w-]+\/?$/, /^\/confidentialite\/?$/];

export async function buildApp(cfg: Config, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger === false ? false : { level: cfg.logLevel },
    trustProxy: cfg.trustProxy,
    bodyLimit: 10 * 1024 * 1024,
    disableRequestLogging: process.env.NODE_ENV === 'test',
  });

  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 5 } });
  registerSessionHooks(app, cfg);

  // En-têtes de sécurité sur toutes les réponses.
  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('Content-Security-Policy', CSP);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    reply.header('X-Robots-Tag', 'noindex, nofollow, noarchive');
    if (cfg.cookieSecure) reply.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
    if (req.url.startsWith('/api/')) reply.header('Cache-Control', reply.getHeader('Cache-Control') ?? 'no-store');
    return payload;
  });

  // Protection CSRF complémentaire : toute requête modifiant l'état doit venir de notre origine.
  app.addHook('onRequest', async (req) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
    const origin = req.headers.origin;
    if (!origin) return;
    let host: string;
    try {
      host = new URL(origin).host;
    } catch {
      throw new HttpError(403, 'Origine refusée.', 'bad_origin');
    }
    const allowed = new Set([req.headers.host, new URL(cfg.publicUrl).host]);
    if (!allowed.has(host)) throw new HttpError(403, 'Origine refusée.', 'bad_origin');
  });

  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof HttpError) return sendError(reply, err);
    if (err.code === 'FST_REQ_FILE_TOO_LARGE' || err.statusCode === 413) return sendError(reply, new HttpError(413, 'Fichier ou requête trop volumineux.', 'too_large'));
    if (err.validation || err.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE' || err.statusCode === 400 || err.statusCode === 415)
      return sendError(reply, new HttpError(err.statusCode ?? 400, 'Requête invalide.', 'bad_request'));
    req.log.error(err);
    return sendError(reply, new HttpError(500, 'Oups, une erreur inattendue est survenue. Réessaie dans un instant.', 'internal'));
  });

  app.get('/robots.txt', async (_req, reply) => reply.type('text/plain').send('User-agent: *\nDisallow: /\n'));
  app.get('/healthz', async () => ({ ok: true }));

  await app.register(
    async (api) => {
      await api.register(authRoutes, { config: cfg });
      await api.register(setRoutes);
      await api.register(folderRoutes);
      await api.register(searchRoutes);
      await api.register(studyRoutes);
      await api.register(statsRoutes);
      await api.register(meRoutes, { config: cfg });
      await api.register(mediaRoutes, { config: cfg });
      await api.register(adminRoutes, { config: cfg });
    },
    { prefix: '/api/v1' },
  );

  const indexFile = path.join(cfg.webDir, 'index.html');
  const hasWeb = fs.existsSync(indexFile);
  if (hasWeb) {
    await app.register(fastifyStatic, {
      root: cfg.webDir,
      wildcard: false,
      index: false,
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else res.setHeader('Cache-Control', 'no-cache');
      },
    });
  }

  app.setNotFoundHandler(async (req, reply) => {
    const urlPath = req.url.split('?')[0];
    if (urlPath.startsWith('/api/') || req.method !== 'GET' || !hasWeb) {
      return sendError(reply, new HttpError(404, 'Page introuvable.', 'not_found'));
    }
    // Pages de l'application : sans session valide, redirection vers la connexion.
    if (!req.user && !PUBLIC_PAGES.some((re) => re.test(urlPath))) {
      const next = urlPath !== '/' ? `?suite=${encodeURIComponent(urlPath)}` : '';
      return reply.redirect(`/connexion${next}`, 302);
    }
    reply.header('Cache-Control', 'no-cache');
    return reply.type('text/html; charset=utf-8').send(fs.createReadStream(indexFile));
  });

  return app;
}
