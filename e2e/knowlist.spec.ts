import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const DATA = path.resolve('test-results/e2e-data');
const STRONG = 'carnet-tulipe-orage-2026';

async function login(page: Page, username: string, password: string) {
  await page.goto('/connexion');
  await page.getByLabel('Identifiant').fill(username);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

async function changePassword(page: Page, current: string, next: string) {
  await expect(page.getByRole('heading', { name: 'Choisis ton mot de passe' })).toBeVisible();
  await page.getByLabel('Mot de passe actuel').fill(current);
  await page.getByLabel('Nouveau mot de passe', { exact: true }).fill(next);
  await page.getByLabel('Confirme le nouveau mot de passe').fill(next);
  await page.getByRole('button', { name: 'Changer le mot de passe' }).click();
}

async function skipTour(page: Page) {
  const skip = page.getByRole('button', { name: 'Passer' });
  try {
    await skip.waitFor({ state: 'visible', timeout: 3000 });
    await skip.click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } catch {
    /* visite déjà vue */
  }
}

test.describe.configure({ mode: 'serial' });

test('une personne sans compte ne voit rien et ne peut pas s’inscrire', async ({ page }) => {
  await page.goto('/sets');
  await expect(page).toHaveURL(/\/connexion/);
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
  await expect(page.getByText(/inscri/i)).toHaveCount(0);
  const api = await page.request.get('/api/v1/sets');
  expect(api.status()).toBe(401);
});

test('parcours complet : admin, création d’accès, set de 20 cartes, étude', async ({ page, browser }, info) => {
  const tempAdmin = fs.readFileSync(path.join(DATA, 'admin-password.txt'), 'utf8').trim();
  const suffix = info.project.name;
  const adminPw = `${STRONG}-chef`;

  // 1. Première connexion de l'administrateur (créé en ligne de commande).
  await login(page, 'admin', info.project.name === 'desktop' ? tempAdmin : adminPw);
  if (info.project.name === 'desktop') await changePassword(page, tempAdmin, adminPw);
  await skipTour(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Admin');

  // 2. L'admin crée un accès (identifiants générés).
  const started = Date.now();
  await page.goto('/admin/comptes');
  await page.getByRole('button', { name: 'Créer un accès' }).click();
  await page.getByLabel('Nom').fill(`Élève ${suffix}`);
  await page.getByRole('button', { name: 'Créer et générer le mot de passe' }).click();
  const creds = await page.locator('pre').innerText();
  const username = /Identifiant : (\S+)/.exec(creds)![1];
  const temp = /temporaire : (\S+)/.exec(creds)![1];
  expect(username).toBe(`eleve.${suffix}`);

  // 3. Le titulaire se connecte (nouveau navigateur) en moins de 2 minutes.
  const ctx = await browser.newContext({ ...info.project.use });
  const p2 = await ctx.newPage();
  await login(p2, username, temp);
  await changePassword(p2, temp, `${STRONG}-eleve`);
  await expect(p2.getByRole('dialog')).toBeVisible();
  await p2.waitForTimeout(300);
  await p2.screenshot({ path: `test-results/shot-${suffix}-onboarding.png` });
  await skipTour(p2);
  await expect(p2.getByRole('heading', { name: /Crée ton premier set/ })).toBeVisible();
  expect(Date.now() - started).toBeLessThan(120_000);
  await p2.screenshot({ path: `test-results/shot-${suffix}-home-empty.png` });

  // 4. Création d'un set de 20 cartes par import (copier-coller), puis étude.
  await p2.goto('/sets/nouveau?importer=1');
  const list = Array.from({ length: 20 }, (_, i) => `word${i + 1}\tmot${i + 1}`).join('\n');
  await p2.getByLabel('Texte à importer').fill(list);
  await p2.getByRole('button', { name: 'Ajouter 20 cartes' }).click();
  await p2.getByLabel('Titre').fill('Anglais — test');
  await p2.screenshot({ path: `test-results/shot-${suffix}-editor.png`, fullPage: false });
  await p2.getByRole('button', { name: 'Créer le set' }).click();
  await expect(p2.getByRole('heading', { name: 'Anglais — test' })).toBeVisible();
  await expect(p2.getByText(/^20 cartes ·/)).toBeVisible();
  await p2.screenshot({ path: `test-results/shot-${suffix}-set.png` });

  // Cartes mémoire : retourner et répondre.
  await p2.getByRole('link', { name: /Cartes mémoire/ }).click();
  await expect(p2.getByText('1 / 20')).toBeVisible();
  await p2.getByRole('button', { name: /Recto/ }).click();
  await p2.screenshot({ path: `test-results/shot-${suffix}-flashcard.png` });
  for (let i = 0; i < 20; i++) {
    await p2.getByRole('button', { name: /^Je savais/ }).click();
    if (i < 19) await expect(p2.getByText(`${i + 2} / 20`)).toBeVisible();
  }
  await expect(p2.getByRole('heading', { name: 'Session terminée' })).toBeVisible();
  await p2.screenshot({ path: `test-results/shot-${suffix}-result.png` });

  // Écriture : réponse tolérante (sans accent / faute) + clavier.
  await p2.goto(p2.url().replace(/\/etude\/.*/, '/etude/write'));
  const prompt = await p2.locator('.card .text-2xl').first().innerText();
  const n = /word(\d+)/.exec(prompt)?.[1];
  await p2.getByLabel(/Écris la définition/).fill(`Mot${n}`);
  await p2.keyboard.press('Enter');
  await expect(p2.getByText(/Bonne réponse|Correct/)).toBeVisible();
  await p2.screenshot({ path: `test-results/shot-${suffix}-write.png` });
  await p2.getByRole('button', { name: /Continuer/ }).click();
  await expect(p2.getByText('2 / 20')).toBeVisible();

  // Apprendre : QCM au clavier.
  await p2.goto(p2.url().replace(/\/etude\/.*/, '/etude/learn'));
  await expect(p2.getByText('Choisis la bonne réponse')).toBeVisible();
  await p2.screenshot({ path: `test-results/shot-${suffix}-learn.png` });

  // Accueil : progression du jour enregistrée.
  await p2.goto('/');
  await expect(p2.getByRole('heading', { name: 'Objectif du jour' })).toBeVisible();
  await expect(p2.getByText(/1 jour/)).toBeVisible();
  await p2.screenshot({ path: `test-results/shot-${suffix}-home.png`, fullPage: true });
  await p2.goto('/stats');
  await expect(p2.getByRole('heading', { name: 'Calendrier d’activité' })).toBeVisible();
  // La réponse du mode Écriture a bien été enregistrée malgré le changement de page.
  await expect(p2.getByText('Écriture', { exact: true })).toBeVisible();
  await p2.screenshot({ path: `test-results/shot-${suffix}-stats.png`, fullPage: true });
  await ctx.close();

  await page.goto('/admin');
  await expect(page.getByText('Utilisateurs actifs (30 j)')).toBeVisible();
  await page.screenshot({ path: `test-results/shot-${suffix}-admin.png`, fullPage: true });
});

test('thème sombre et page de connexion', async ({ page }, info) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/connexion');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: `test-results/shot-${info.project.name}-login-dark.png` });
});

test('révision hors ligne puis synchronisation au retour du réseau', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'desktop', 'un seul passage suffit');
  await login(page, `eleve.desktop`, `${STRONG}-eleve`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Élève');
  // Le service worker s'installe et précharge l'application.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.getByRole('link', { name: /Anglais — test/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Anglais — test' })).toBeVisible();
  const setUrl = page.url();
  await page.waitForTimeout(500); // laisse le service worker finir d'écrire le set en cache

  await context.setOffline(true);
  await page.goto(`${setUrl}/etude/learn`);
  await expect(page.getByText('Choisis la bonne réponse')).toBeVisible();
  await page.keyboard.press('1');
  await page.waitForTimeout(1200);
  await page.goto(`${setUrl}/etude/flashcards`);
  await expect(page.getByText('1 / 20')).toBeVisible();
  await page.getByRole('button', { name: /^Je savais/ }).click();
  await expect(page.getByText('2 / 20')).toBeVisible();
  await page.waitForTimeout(1800);
  const pending = await page.evaluate(() => JSON.parse(localStorage.getItem('kl-pending-answers') || '[]').length);
  expect(pending).toBeGreaterThanOrEqual(1);

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('kl-pending-answers') || '[]').length), { timeout: 10_000 }).toBe(0);
});
