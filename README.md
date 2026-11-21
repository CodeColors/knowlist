# KnowList

Application web **privée** d’apprentissage de vocabulaire, inspirée de Quizlet : sans publicité, sans abonnement, données hébergées chez soi.
Accès créés uniquement par un administrateur. Destinée à `knowlist.hchl.fr`.

- **Sets et cartes** : terme, définition, exemple, note, image, audio, tags ; édition rapide en tableau (Tab/Entrée), glisser-déposer, annuler/rétablir, historique des versions, dossiers, étoiles, recherche plein texte instantanée.
- **Six modes d’étude** : Cartes mémoire, Apprendre (adaptatif), Test (vrai/faux, QCM, saisie, association), Association chronométrée, Écriture (tolérance configurable), Écoute (dictée par synthèse vocale du navigateur).
- **Répétition espacée** (SM-2) avec file « à réviser aujourd’hui », objectif quotidien, série de jours, statistiques.
- **Partage** entre utilisateurs (lecture seule ou modification), lien interne, copie, import CSV/TSV/copier-coller Quizlet, export CSV/TSV/JSON, impression PDF.
- **Administration** (`/admin`) : comptes (identifiants générés ou lien d’invitation à usage unique), suspension, expiration, sessions, journal d’audit (90 j), tableau de bord, paramètres, sauvegardes et restauration guidée.
- **PWA** installable avec révision hors ligne, thème clair/sombre/auto, raccourcis clavier, police adaptée à la dyslexie, « réduire les animations », double authentification TOTP.

## Pile technique

| Couche | Choix |
|---|---|
| Front-end | React 19 + Vite + TypeScript + Tailwind CSS 4, PWA (service worker maison) |
| API | Node.js 22 + Fastify 5, REST JSON versionnée (`/api/v1`), validation zod |
| Base | SQLite en mode WAL (FTS5 pour la recherche), migrations versionnées |
| Authentification | sessions serveur (cookie `HttpOnly`, `Secure`, `SameSite=Lax`), Argon2id, CSRF, TOTP |
| Fichiers | images redimensionnées/compressées en WebP (sharp), audio contrôlé, sur disque |
| Déploiement | Docker Compose (application + Caddy, HTTPS automatique Let’s Encrypt) |

## Démarrage en développement

```bash
npm install
npm run build -w server
KNOWLIST_DATA_DIR=./data npm run cli -w server -- create-admin moi --name "Moi"   # mot de passe temporaire affiché
KNOWLIST_DATA_DIR=./data npm run cli -w server -- seed-demo moi                  # sets d'exemple (facultatif)
KNOWLIST_DATA_DIR=../data npm run dev -w server   # API sur :3000
npm run dev -w web                               # interface sur http://localhost:5173
```

## Qualité

```bash
npm run lint     # ESLint + TypeScript strict (serveur et web)
npm test         # tests unitaires (SM-2, correction des réponses, import, file hors ligne, sécurité) + intégration de l'API
npm run build
npm run e2e      # Playwright : connexion, création d'accès, set de 20 cartes, session d'étude (desktop + mobile)
```

## Documentation

- [Installation sur le VPS et mise en production](docs/installation.md)
- [Exploitation : sauvegardes, restauration, supervision, mises à jour](docs/exploitation.md)
- [Guide administrateur](docs/guide-administrateur.md)
- [Guide utilisateur (une page)](docs/guide-utilisateur.md)
- [Conformité au cahier des charges](docs/conformite.md)

## Structure

```
server/   API Fastify (src/routes, src/lib), CLI d'administration (src/cli.ts), tests (test/)
web/      Application React (src/pages, src/components, src/lib) et fichiers PWA (public/)
e2e/      Tests de bout en bout Playwright
deploy/   Caddyfile, scripts VPS (préparation, déploiement, retour arrière, copie hors site), fail2ban
docs/     Documentation
```
