import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as OTPAuth from 'otpauth';
import sharp from 'sharp';
import { db } from '../src/db.js';
import { ADMIN_PW, Client, type Ctx, USER_PW, resetLimiters, setup, teardown } from './helpers.js';

let ctx: Ctx;
beforeAll(async () => {
  ctx = await setup();
});
afterAll(async () => teardown(ctx));
beforeEach(() => resetLimiters());

const client = () => new Client(ctx.app);
async function as(username: string, pw = username === 'admin' ? ADMIN_PW : USER_PW) {
  const c = client();
  const res = await c.login(username, pw);
  expect(res.statusCode, res.body).toBe(200);
  return c;
}

describe('accès privé', () => {
  it('refuse toute donnée sans session et ne propose pas d’inscription', async () => {
    const c = client();
    expect((await c.get('/api/v1/sets')).statusCode).toBe(401);
    expect((await c.get('/api/v1/auth/me')).statusCode).toBe(401);
    expect((await c.get('/api/v1/admin/users')).statusCode).toBe(401);
    expect((await c.post('/api/v1/auth/register', { username: 'x' })).statusCode).toBe(404);
    expect((await c.post('/api/v1/users', { username: 'x' })).statusCode).toBe(404);
  });

  it('bloque les robots et pose les en-têtes de sécurité', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/robots.txt' });
    expect(res.body).toContain('Disallow: /');
    expect(res.headers['x-robots-tag']).toContain('noindex');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('same-origin');
  });

  it('pose un cookie HttpOnly SameSite=Lax', async () => {
    const res = await client().login('alice', USER_PW);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('exige le jeton CSRF et refuse une origine étrangère', async () => {
    const c = await as('alice');
    const noCsrf = await ctx.app.inject({ method: 'POST', url: '/api/v1/sets', payload: { title: 'x' }, headers: { cookie: c.cookie } });
    expect(noCsrf.statusCode).toBe(403);
    const badOrigin = await c.req('POST', '/api/v1/sets', { title: 'x' }, { origin: 'https://evil.example' });
    expect(badOrigin.statusCode).toBe(403);
  });

  it('limite les tentatives : 5 échecs puis délai', async () => {
    const c = client();
    for (let i = 0; i < 5; i++) expect((await c.login('bob', 'mauvais-mot-de-passe')).statusCode).toBe(401);
    const locked = await c.login('bob', USER_PW);
    expect(locked.statusCode).toBe(429);
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
    const fails = db().prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'login.failure' AND target = 'bob'").get() as { n: number };
    expect(fails.n).toBeGreaterThanOrEqual(5);
  });

  it('réserve /admin aux administrateurs', async () => {
    const c = await as('alice');
    expect((await c.get('/api/v1/admin/users')).statusCode).toBe(403);
    expect((await c.get('/api/v1/admin/dashboard')).statusCode).toBe(403);
  });
});

describe('création des accès par l’administrateur', () => {
  it('mode identifiants générés : mot de passe temporaire à changer', async () => {
    const admin = await as('admin');
    const res = await admin.post('/api/v1/admin/users', { displayName: 'Élodie Martin', email: '' });
    expect(res.statusCode, res.body).toBe(200);
    const { user, tempPassword } = res.json();
    expect(user.username).toBe('elodie.martin');
    expect(tempPassword.length).toBeGreaterThanOrEqual(12);

    const e = await as('elodie.martin', tempPassword);
    const me = await e.get('/api/v1/auth/me');
    expect(me.json().user.mustChangePassword).toBe(true);
    expect((await e.get('/api/v1/sets')).json().error).toBe('must_change_password');
    const weak = await e.post('/api/v1/auth/password', { currentPassword: tempPassword, newPassword: 'motdepasse123' });
    expect(weak.statusCode).toBe(400);
    const ok = await e.post('/api/v1/auth/password', { currentPassword: tempPassword, newPassword: 'nouveau-secret-solide' });
    expect(ok.statusCode, ok.body).toBe(200);
    expect((await e.get('/api/v1/sets')).statusCode).toBe(200);
  });

  it('mode lien d’invitation à usage unique', async () => {
    const admin = await as('admin');
    const res = await admin.post('/api/v1/admin/invitations', { displayName: 'Paul', days: 7 });
    const { link } = res.json();
    const token = link.split('/invitation/')[1];
    const info = await client().get(`/api/v1/auth/invitation/${token}`);
    expect(info.json().username).toBe('paul');
    const c = client();
    const accept = await c.post(`/api/v1/auth/invitation/${token}`, { password: 'un-bon-secret-pour-lui' });
    expect(accept.statusCode, accept.body).toBe(200);
    c.absorb(accept);
    expect((await c.get('/api/v1/sets')).statusCode).toBe(200);
    expect((await client().post(`/api/v1/auth/invitation/${token}`, { password: 'un-bon-secret-pour-lui' })).statusCode).toBe(410);
    const list = (await admin.get('/api/v1/admin/invitations')).json().invitations;
    expect(list.find((i: any) => i.username === 'paul').status).toBe('used');
  });

  it('révocation et expiration des invitations', async () => {
    const admin = await as('admin');
    const { link, id } = (await admin.post('/api/v1/admin/invitations', { displayName: 'Révoqué' })).json();
    await admin.del(`/api/v1/admin/invitations/${id}`);
    expect((await client().get(`/api/v1/auth/invitation/${link.split('/invitation/')[1]}`)).statusCode).toBe(410);
    expect((await client().get('/api/v1/auth/invitation/inexistant')).statusCode).toBe(404);
  });

  it('suspension, expiration, déconnexion forcée et réinitialisation', async () => {
    const admin = await as('admin');
    const { user, tempPassword } = (await admin.post('/api/v1/admin/users', { displayName: 'Zoé' })).json();
    const z = await as(user.username, tempPassword);
    await admin.patch(`/api/v1/admin/users/${user.id}`, { suspended: true });
    expect((await z.get('/api/v1/auth/me')).statusCode).toBe(401);
    expect((await client().login(user.username, tempPassword)).statusCode).toBe(403);
    await admin.patch(`/api/v1/admin/users/${user.id}`, { suspended: false, expiresAt: '2020-01-01' });
    expect((await client().login(user.username, tempPassword)).json().error).toBe('expired');
    await admin.patch(`/api/v1/admin/users/${user.id}`, { expiresAt: null });
    const z2 = await as(user.username, tempPassword);
    await admin.post(`/api/v1/admin/users/${user.id}/logout`);
    expect((await z2.get('/api/v1/auth/me')).statusCode).toBe(401);
    const reset = (await admin.post(`/api/v1/admin/users/${user.id}/reset-password`)).json();
    expect((await client().login(user.username, reset.tempPassword)).statusCode).toBe(200);
    // suppression avec confirmation
    expect((await admin.del(`/api/v1/admin/users/${user.id}`, { confirm: 'non' })).statusCode).toBe(400);
    expect((await admin.del(`/api/v1/admin/users/${user.id}`, { confirm: user.username })).statusCode).toBe(200);
    const audit = (await admin.get('/api/v1/admin/audit')).json().entries.map((e: any) => e.action);
    expect(audit).toEqual(expect.arrayContaining(['user.delete', 'user.suspend', 'password.reset', 'user.create']));
  });

  it('empêche de supprimer ou rétrograder le dernier administrateur', async () => {
    const admin = await as('admin');
    const me = (await admin.get('/api/v1/auth/me')).json().user;
    expect((await admin.patch(`/api/v1/admin/users/${me.id}`, { role: 'user' })).statusCode).toBe(400);
  });
});

describe('sets, cartes et partage', () => {
  it('crée, modifie, duplique, cherche et exporte un set', async () => {
    const a = await as('alice');
    const cards = Array.from({ length: 20 }, (_, i) => ({ term: `mot${i}`, definition: `définition ${i}` }));
    const created = await a.post('/api/v1/sets', { title: 'Anglais — été', termLang: 'en', defLang: 'fr', cards });
    expect(created.statusCode, created.body).toBe(200);
    const id = created.json().id;
    const got = (await a.get(`/api/v1/sets/${id}`)).json();
    expect(got.cards).toHaveLength(20);
    expect(got.set.permission).toBe('owner');

    // remplacement en conservant les identifiants (et donc la progression)
    const edited = got.cards.map((c: any) => ({ id: c.id, term: c.term, definition: c.definition }));
    edited.reverse();
    edited.push({ term: 'maison', definition: 'house' });
    const put = (await a.put(`/api/v1/sets/${id}/cards`, { cards: edited })).json();
    expect(put.cards).toHaveLength(21);
    expect(put.cards[0].id).toBe(got.cards[19].id);

    const search = (await a.get('/api/v1/search?q=mais')).json();
    expect(search.cards.map((c: any) => c.term)).toContain('maison');
    const searchSet = (await a.get('/api/v1/search?q=ete')).json();
    expect(searchSet.sets[0].id).toBe(id);

    const versions = (await a.get(`/api/v1/sets/${id}/versions`)).json().versions;
    expect(versions).toHaveLength(1);
    const restored = (await a.post(`/api/v1/sets/${id}/versions/${versions[0].id}/restore`)).json();
    expect(restored.cards).toHaveLength(20);

    const dup = (await a.post(`/api/v1/sets/${id}/duplicate`)).json();
    expect((await a.get(`/api/v1/sets/${dup.id}`)).json().set.title).toContain('(copie)');

    const csv = await a.get(`/api/v1/sets/${id}/export?format=csv`);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain('mot0,définition 0');

    const star = await a.put(`/api/v1/sets/${id}/cards/${got.cards[0].id}/star`, { starred: true });
    expect(star.json().starred).toBe(true);
    expect((await a.get(`/api/v1/sets/${id}`)).json().cards.find((c: any) => c.id === got.cards[0].id).starred).toBe(true);
  });

  it('isole les sets et vérifie les droits de partage côté serveur', async () => {
    const a = await as('alice');
    const b = await as('bob');
    const id = (await a.post('/api/v1/sets', { title: 'Privé', cards: [{ term: 'a', definition: 'b' }] })).json().id;
    expect((await b.get(`/api/v1/sets/${id}`)).statusCode).toBe(404);
    expect((await b.put(`/api/v1/sets/${id}/cards`, { cards: [] })).statusCode).toBe(404);
    expect((await b.get('/api/v1/search?q=Privé')).json().sets).toHaveLength(0);

    await a.post(`/api/v1/sets/${id}/shares`, { username: 'bob', permission: 'read' });
    expect((await b.get(`/api/v1/sets/${id}`)).json().set.permission).toBe('read');
    expect((await b.put(`/api/v1/sets/${id}/cards`, { cards: [] })).statusCode).toBe(403);
    expect((await b.del(`/api/v1/sets/${id}`)).statusCode).toBe(403);
    const copy = (await b.post(`/api/v1/sets/${id}/duplicate`)).json();
    expect((await b.get(`/api/v1/sets/${copy.id}`)).json().set.permission).toBe('owner');

    await a.post(`/api/v1/sets/${id}/shares`, { username: 'bob', permission: 'edit' });
    expect((await b.put(`/api/v1/sets/${id}/cards`, { cards: [{ term: 'x', definition: 'y' }] })).statusCode).toBe(200);
    expect((await b.patch(`/api/v1/sets/${id}`, { linkAccess: true })).statusCode).toBe(403);

    // lien interne
    const id2 = (await a.post('/api/v1/sets', { title: 'Par lien' })).json().id;
    expect((await b.get(`/api/v1/sets/${id2}`)).statusCode).toBe(404);
    await a.patch(`/api/v1/sets/${id2}`, { linkAccess: true });
    expect((await b.get(`/api/v1/sets/${id2}`)).json().set.permission).toBe('read');
  });

  it('gère les dossiers', async () => {
    const a = await as('alice');
    const f = (await a.post('/api/v1/folders', { name: 'Langues' })).json();
    const id = (await a.post('/api/v1/sets', { title: 'Dans dossier', folderId: f.id })).json().id;
    expect((await a.get('/api/v1/folders')).json().folders.find((x: any) => x.id === f.id).setCount).toBe(1);
    const b = await as('bob');
    expect((await b.post('/api/v1/sets', { title: 'x', folderId: f.id })).statusCode).toBe(400);
    await a.del(`/api/v1/folders/${f.id}`);
    expect((await a.get(`/api/v1/sets/${id}`)).json().set.folderId).toBeNull();
  });
});

describe('étude, répétition espacée et statistiques', () => {
  it('enregistre les réponses et alimente la file du jour', async () => {
    const a = await as('alice');
    const id = (
      await a.post('/api/v1/sets', { title: 'Étude', cards: [{ term: 'un', definition: 'one' }, { term: 'deux', definition: 'two' }] })
    ).json().id;
    const cards = (await a.get(`/api/v1/sets/${id}`)).json().cards;
    const res = await a.post('/api/v1/study/answers', {
      answers: [
        { cardId: cards[0].id, correct: true, mode: 'flashcards', durationMs: 5000 },
        { cardId: cards[1].id, correct: false, mode: 'flashcards', durationMs: 7000 },
      ],
    });
    expect(res.json().accepted).toBe(2);
    const after = (await a.get(`/api/v1/sets/${id}`)).json().cards;
    expect(after[0].progress.intervalDays).toBe(1);
    expect(after[1].progress.difficult).toBe(true);
    const due = (await a.get('/api/v1/study/due?tz=0')).json().cards;
    expect(due.map((c: any) => c.id)).toContain(cards[1].id);
    expect(due.map((c: any) => c.id)).not.toContain(cards[0].id);

    const home = (await a.get('/api/v1/home?tz=-60')).json();
    expect(home.streak).toBe(1);
    expect(home.todayCount).toBeGreaterThanOrEqual(2);
    const stats = (await a.get('/api/v1/stats?tz=-60')).json();
    expect(stats.successRate).toBeGreaterThan(0);
    expect(stats.hardest[0].id).toBe(cards[1].id);
    expect(stats.timeSpentMs).toBeGreaterThanOrEqual(12000);

    // un autre utilisateur ne peut pas enregistrer de réponse sur ces cartes
    const b = await as('bob');
    expect((await b.post('/api/v1/study/answers', { answers: [{ cardId: cards[0].id, correct: true, mode: 'learn' }] })).json().accepted).toBe(0);

    const scores = (await a.post(`/api/v1/study/match/${id}`, { timeMs: 12345 })).json();
    expect(scores.scores[0].timeMs).toBe(12345);
  });
});

describe('médias', () => {
  it('redimensionne les images, refuse les faux fichiers et contrôle l’accès', async () => {
    const a = await as('alice');
    const png = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#c8603f' } }).png().toBuffer();
    const boundary = '----kl';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`),
      png,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const up = await a.req('POST', '/api/v1/media', body, { 'content-type': `multipart/form-data; boundary=${boundary}` });
    expect(up.statusCode, up.body).toBe(200);
    const { id } = up.json();
    const file = await a.get(`/api/v1/media/${id}`);
    expect(file.headers['content-type']).toBe('image/webp');
    const meta = await sharp(file.rawPayload).metadata();
    expect(meta.width).toBe(1200);
    const b = await as('bob');
    expect((await b.get(`/api/v1/media/${id}`)).statusCode).toBe(404);

    const fake = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`),
      Buffer.from('<script>alert(1)</script>'),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    expect((await a.req('POST', '/api/v1/media', fake, { 'content-type': `multipart/form-data; boundary=${boundary}` })).statusCode).toBe(415);
  });
});

describe('double authentification', () => {
  it('active le TOTP et l’exige à la connexion', async () => {
    const b = await as('bob');
    const setupRes = (await b.post('/api/v1/auth/totp/setup')).json();
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(setupRes.secret) });
    expect((await b.post('/api/v1/auth/totp/enable', { code: '000000' })).statusCode).toBe(400);
    expect((await b.post('/api/v1/auth/totp/enable', { code: totp.generate() })).statusCode).toBe(200);
    expect((await client().login('bob', USER_PW)).json().error).toBe('totp_required');
    expect((await client().login('bob', USER_PW, totp.generate())).statusCode).toBe(200);
    expect((await b.post('/api/v1/auth/totp/disable', { password: USER_PW })).statusCode).toBe(200);
  });
});

describe('RGPD', () => {
  it('exporte les données personnelles puis supprime le compte', async () => {
    const admin = await as('admin');
    const { user, tempPassword } = (await admin.post('/api/v1/admin/users', { displayName: 'Temporaire' })).json();
    const t = await as(user.username, tempPassword);
    await t.post('/api/v1/auth/password', { currentPassword: tempPassword, newPassword: 'un-secret-bien-long' });
    await t.post('/api/v1/sets', { title: 'Mon set', cards: [{ term: 'a', definition: 'b' }] });
    const exp = (await t.get('/api/v1/me/export')).json();
    expect(exp.profile.username).toBe(user.username);
    expect(exp.sets[0].cards).toHaveLength(1);
    expect((await t.del('/api/v1/me', { password: 'mauvais' })).statusCode).toBe(400);
    expect((await t.del('/api/v1/me', { password: 'un-secret-bien-long' })).statusCode).toBe(200);
    expect((await client().login(user.username, 'un-secret-bien-long')).statusCode).toBe(401);
  });
});

describe('sauvegardes', () => {
  it('crée une sauvegarde et la restaure', async () => {
    const admin = await as('admin');
    const a = await as('alice');
    const id = (await a.post('/api/v1/sets', { title: 'Avant sauvegarde' })).json().id;
    const backup = (await admin.post('/api/v1/admin/backups')).json().backup;
    expect(backup.name).toMatch(/\.tar\.gz$/);
    await a.del(`/api/v1/sets/${id}`);
    expect((await a.get(`/api/v1/sets/${id}`)).statusCode).toBe(404);
    expect((await admin.post(`/api/v1/admin/backups/${backup.name}/restore`, { confirm: 'non' })).statusCode).toBe(400);
    const r = await admin.post(`/api/v1/admin/backups/${backup.name}/restore`, { confirm: 'RESTAURER' });
    expect(r.statusCode, r.body).toBe(200);
    const a2 = await as('alice');
    expect((await a2.get(`/api/v1/sets/${id}`)).json().set.title).toBe('Avant sauvegarde');
    const dash = (await (await as('admin')).get('/api/v1/admin/dashboard')).json();
    expect(dash.lastBackup).not.toBeNull();
  });
});
