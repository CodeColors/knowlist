# Installation et mise en production

Cible : un VPS Debian 12 ou Ubuntu 24.04 LTS, **2 vCPU, 2 Go de RAM, 40 Go de disque** (à réévaluer selon le volume d’images et d’audio).
L’application consomme environ 100 à 150 Mo de RAM au repos.

## 1. DNS

Chez le gestionnaire DNS de `hchl.fr`, ajouter pour le sous-domaine `knowlist` :

| Type | Nom | Valeur |
|---|---|---|
| `A` | `knowlist` | IPv4 du VPS |
| `AAAA` | `knowlist` | IPv6 du VPS (si disponible) |

Vérifier : `dig +short knowlist.hchl.fr`.

## 2. Préparer le VPS

En root, une seule fois :

```bash
curl -fsSLO https://raw.githubusercontent.com/<compte>/knowlist/main/deploy/setup-vps.sh   # ou copier le dépôt
bash setup-vps.sh knowlist "ssh-ed25519 AAAA… moi@portable"
```

Le script : crée l’utilisateur non-root `knowlist` (SSH par clé uniquement, root interdit), active le pare-feu `ufw` (22, 80, 443),
les mises à jour de sécurité automatiques, installe Docker + Compose, fail2ban (SSH + échecs de connexion KnowList) et borne les journaux.

> Avant de fermer la session root, vérifier dans un **autre terminal** que `ssh knowlist@<ip>` fonctionne.

## 3. Déployer

En tant que `knowlist` :

```bash
git clone https://github.com/<compte>/knowlist.git ~/knowlist && cd ~/knowlist
cp .env.example .env          # renseigner ACME_EMAIL
mkdir -p data && sudo chown 1000:1000 data   # le conteneur tourne avec l'utilisateur sans privilèges uid 1000
./deploy/deploy.sh            # construit l'image, démarre l'application et Caddy
```

Caddy obtient le certificat Let’s Encrypt au premier accès HTTPS et le renouvelle seul ; HTTP est redirigé vers HTTPS (HSTS, TLS 1.2 minimum).

## 4. Premier administrateur (ligne de commande uniquement)

```bash
docker compose exec app node server/dist/cli.js create-admin hugo --name "Hugo"
```

Un mot de passe temporaire est affiché ; il devra être changé à la première connexion. Activer ensuite la **double authentification** (Profil → Sécurité).

Vérifier :

```bash
curl -sI https://knowlist.hchl.fr/ | head -3      # → 302 vers /connexion
curl -s https://knowlist.hchl.fr/robots.txt       # → Disallow: /
```

Puis contrôler la note A sur <https://www.ssllabs.com/ssltest/> et <https://securityheaders.com/>.

## 5. Déploiement continu

Le workflow `.github/workflows/ci.yml` exécute lint, tests, build, tests de bout en bout et construction de l’image à chaque push.
`.github/workflows/deploy.yml` se déclenche après une CI verte sur `main` et lance `./deploy/deploy.sh <sha>` sur le VPS par SSH.

Secrets GitHub (environnement `production`) : `VPS_HOST`, `VPS_USER` (`knowlist`), `VPS_SSH_KEY` (clé **dédiée** au déploiement,
ajoutée à `~/.ssh/authorized_keys`), `VPS_KNOWN_HOSTS` (sortie de `ssh-keyscan knowlist.hchl.fr`).

`deploy.sh` : construit l’image étiquetée par le commit, fait une sauvegarde, redémarre l’application (les migrations de base sont appliquées
au démarrage), vérifie la santé et revient automatiquement à la version précédente en cas d’échec. Pendant la bascule (1 à 3 s), Caddy met
les requêtes en attente au lieu de renvoyer une erreur.

**Retour arrière en une commande** : `./deploy/rollback.sh` (code précédent) ou `./deploy/rollback.sh --with-data` (code + données d’avant le déploiement).

## Variables d’environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `PUBLIC_URL` | `http://localhost:3000` | URL publique (liens d’invitation, contrôle d’origine) |
| `KNOWLIST_DOMAIN` | `knowlist.hchl.fr` | domaine servi par Caddy |
| `ACME_EMAIL` | — | contact Let’s Encrypt |
| `BACKUP_HOUR` | `3` | heure UTC de la sauvegarde nocturne |
| `BACKUP_RETENTION_DAYS` | `14` | conservation locale |
| `LOG_LEVEL` | `info` | niveau de journalisation |
| `COOKIE_SECURE`, `TRUST_PROXY` | `true` en production | cookie `Secure`, IP réelle derrière Caddy |
