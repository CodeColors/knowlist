import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig, type Config } from '../src/config.js';
import { closeDb, db, openDb } from '../src/db.js';
import { hashPassword } from '../src/lib/password.js';
import { accountLimiter, ipLimiter } from '../src/routes/auth.js';

export const ADMIN_PW = 'admin-tres-solide-42';
export const USER_PW = 'utilisateur-solide-42';

export interface Ctx {
  app: FastifyInstance;
  cfg: Config;
  dir: string;
}

export async function setup(): Promise<Ctx> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowlist-test-'));
  const cfg = loadConfig({ dataDir: dir, webDir: path.join(dir, 'noweb'), publicUrl: 'http://localhost', cookieSecure: false, trustProxy: false });
  openDb(cfg.dbPath);
  const app = await buildApp(cfg, { logger: false });
  db()
    .prepare("INSERT INTO users (username, display_name, password_hash, role) VALUES ('admin', 'Admin', ?, 'admin')")
    .run(await hashPassword(ADMIN_PW));
  db()
    .prepare("INSERT INTO users (username, display_name, password_hash, role) VALUES ('alice', 'Alice', ?, 'user')")
    .run(await hashPassword(USER_PW));
  db()
    .prepare("INSERT INTO users (username, display_name, password_hash, role) VALUES ('bob', 'Bob', ?, 'user')")
    .run(await hashPassword(USER_PW));
  return { app, cfg, dir };
}

export async function teardown(ctx: Ctx) {
  await ctx.app.close();
  closeDb();
  fs.rmSync(ctx.dir, { recursive: true, force: true });
}

export function resetLimiters() {
  // @ts-expect-error accès interne pour les tests
  ipLimiter.map.clear();
  // @ts-expect-error accès interne pour les tests
  accountLimiter.map.clear();
}

/** Client HTTP minimal qui conserve le cookie de session et le jeton CSRF. */
export class Client {
  cookie = '';
  csrf = '';
  constructor(private app: FastifyInstance) {}

  async login(username: string, password: string, totp?: string) {
    const res = await this.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username, password, totp } });
    if (res.statusCode === 200) this.absorb(res);
    return res;
  }

  absorb(res: { headers: Record<string, any>; json: () => any }) {
    const set = res.headers['set-cookie'];
    const arr = Array.isArray(set) ? set : set ? [set] : [];
    for (const c of arr) {
      const [pair] = String(c).split(';');
      if (pair.startsWith('kl_session=')) this.cookie = pair;
    }
    const body = res.json();
    if (body?.csrf) this.csrf = body.csrf;
  }

  req(method: string, url: string, payload?: unknown, headers: Record<string, string> = {}) {
    return this.app.inject({
      method: method as any,
      url,
      payload: payload as any,
      headers: { cookie: this.cookie, 'x-csrf-token': this.csrf, ...headers },
    });
  }
  get(url: string) {
    return this.req('GET', url);
  }
  post(url: string, payload?: unknown) {
    return this.req('POST', url, payload ?? {});
  }
  put(url: string, payload?: unknown) {
    return this.req('PUT', url, payload);
  }
  patch(url: string, payload?: unknown) {
    return this.req('PATCH', url, payload);
  }
  del(url: string, payload?: unknown) {
    return this.req('DELETE', url, payload);
  }
}
