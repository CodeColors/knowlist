# Conformité au cahier des charges

Légende : ✅ réalisé et testé · 🟡 partiel / à vérifier en production · ⏳ reporté (phase ultérieure du planning)

## 2. Rôles et accès privés

| Exigence | État | Où |
|---|---|---|
| Aucune inscription publique | ✅ | aucune route d’inscription ; tests API + e2e |
| Identifiants générés (mot de passe temporaire robuste, changement obligatoire) | ✅ | `/admin/comptes`, `routes/admin.ts` |
| Lien d’invitation à usage unique, 7 j réglables | ✅ | `/admin/invitations`, `/invitation/:jeton` |
| Toute page inaccessible sans session ; `noindex`, `robots.txt` | ✅ | redirection serveur vers `/connexion`, `X-Robots-Tag`, `robots.txt` |
| Révoquer, forcer la déconnexion, réinitialiser | ✅ | menu « ⋯ » des comptes |
| Date d’expiration de compte | ✅ | création / modification / invitation |

## 3. Fonctionnalités essentielles

| Exigence | État |
|---|---|
| Sets : créer, modifier, dupliquer, supprimer (titre, description, langues, couleur) | ✅ |
| Carte : terme, définition, exemple, note, image, audio, tags | ✅ |
| Édition en tableau (Tab/Entrée), glisser-déposer (+ Alt+↑/↓ au clavier), annuler/rétablir | ✅ |
| Dossiers, tags, recherche instantanée (titres, cartes : FTS5 insensible aux accents) | ✅ |
| Étoiles | ✅ |
| Cartes mémoire, Apprendre, Test, Association (classement personnel), Écriture (tolérance configurable), Écoute | ✅ |
| Options : sens, mélange, étoilées/difficiles, nombre de questions | ✅ |
| Partage : lien interne, copie, lecture seule / modification, impression PDF | ✅ |

## 4. Fonctionnalités complémentaires

| Fonction | État | Note |
|---|---|---|
| Répétition espacée (SM-2) + file « à réviser aujourd’hui » | ✅ | `server/src/lib/srs.ts`, testé |
| Objectif quotidien et série de jours | ✅ | |
| Statistiques personnelles | ✅ | maîtrisées, temps, réussite, calendrier, plus difficiles |
| Import / export | ✅ | CSV, TSV, copier-coller Quizlet, séparateurs personnalisés ; export CSV/TSV/JSON ; PDF via impression |
| Aide à la saisie (services externes) | ⏳ V2 | interrupteur d’administration présent, désactivé ; aucune donnée envoyée à des tiers |
| Mode hors ligne (PWA) | ✅ | modules préchargés, données consultées en cache, réponses mises en file puis synchronisées (test e2e) |
| Installation écran d’accueil | ✅ | manifeste, icônes, plein écran |
| Thème clair / sombre / auto | ✅ | |
| Raccourcis clavier (`?` pour l’aide) | ✅ | |
| Notifications (e-mail / push) | ⏳ V1.1 | nécessite un SMTP ou des clés VAPID : voir questions ouvertes |
| Classes / groupes | ⏳ V2 | le partage individuel couvre le besoin de base |
| Historique des versions d’un set | ✅ | 30 dernières versions, restauration |
| Interface multilingue | 🟡 | français uniquement ; anglais en V2 |
| Accessibilité | 🟡 | navigation clavier, ARIA, contrastes AA, police dyslexie ; audit lecteur d’écran manuel à faire |

## 5. Administration — ✅

Comptes (filtres actif/suspendu/expiré), invitations avec suivi, sessions et déconnexion à distance, journal d’audit 90 jours (date, IP, auteur),
tableau de bord (actifs, sets, cartes, disque, dernière sauvegarde), paramètres (invitations, mots de passe, quotas, services externes,
message d’accueil), sauvegardes (manuelle, liste, téléchargement, restauration guidée), premier administrateur en ligne de commande.

## 6. Expérience utilisateur — ✅ (à valider sur maquettes réelles)

Palette crème / terracotta / sauge + accent par set, Fraunces pour les titres, corps 16 px, retournement de carte, célébration de fin de session,
« réduire les animations » (préférence système **et** réglage), messages bienveillants et états vides utiles, accueil en 3 clics
(révisions du jour, derniers sets, série), mobile d’abord (zones de 44 px, gestes), onboarding de 4 écrans ignorable.

## 7. Architecture

| Couche | Choix | Écart éventuel |
|---|---|---|
| Front | React 19 + Vite + TypeScript + Tailwind 4 | — |
| PWA | service worker, manifeste | — |
| API | Fastify 5, REST JSON `/api/v1`, validation zod | — |
| Base | **SQLite WAL** | Le cahier recommande PostgreSQL au-delà de 50 utilisateurs. Pour 200 comptes au plus, avec des écritures brèves, SQLite WAL reste largement dimensionné (milliers de requêtes/s), simplifie les sauvegardes et économise la RAM du VPS. Si le besoin grandit, la couche SQL est isolée (`db.ts`, migrations) pour faciliter un passage à PostgreSQL. |
| Auth | sessions serveur, cookie `HttpOnly` + `Secure` + `SameSite=Lax`, Argon2id | — |
| Fichiers | disque, images redimensionnées en WebP (EXIF supprimées) | — |
| Proxy | Caddy, HTTPS automatique | — |
| Conteneurs | Docker Compose (app + proxy) | pas de conteneur de base (SQLite) |
| Recherche | FTS5 | — |

## 8. Sécurité et RGPD

| Exigence | État |
|---|---|
| Mots de passe ≥ 12, Argon2id, refus des mots de passe courants, changement après temporaire | ✅ |
| 5 échecs puis délai croissant (IP et compte) ; fail2ban | ✅ (filtre et jail fournis) |
| TOTP facultatif (recommandé à l’admin, rappel affiché) | ✅ |
| Cookie Secure/HttpOnly, expiration après 30 j d’inactivité, CSRF (jeton + contrôle d’origine) | ✅ |
| HTTPS, redirection, HSTS, TLS ≥ 1.2 | ✅ (Caddy) |
| CSP stricte, `X-Content-Type-Options`, `Referrer-Policy` | ✅ |
| Validation serveur, échappement, contrôle type/taille des fichiers | ✅ (zod, React, décodage réel des images, signatures audio) |
| Contrôle d’accès à chaque requête | ✅ (tests d’isolation entre utilisateurs) |
| SSH par clé, pare-feu 22/80/443, mises à jour auto, utilisateur sans privilèges | ✅ (`deploy/setup-vps.sh`, conteneur non-root en lecture seule) |
| RGPD : données minimales, page de confidentialité, export, suppression, aucun traceur | ✅ |

## 9. Performance et qualité

| Indicateur | Mesure actuelle |
|---|---|
| Poids de l’accueil | ≈ 160 Ko compressés (JS 115 Ko + CSS 9 Ko + police 37 Ko), < 250 Ko ✅ |
| Chargement 4G < 2 s, LCP < 2,5 s, Lighthouse ≥ 90 | 🟡 à mesurer sur le VPS (modules chargés à la demande, police unique, pas de dépendance externe) |
| API p95 < 200 ms | 🟡 requêtes SQLite indexées, à mesurer en production |
| Carte suivante instantanée | ✅ (cartes déjà en mémoire, image suivante préchargée) |
| Sets de 2 000 cartes | ✅ liste virtualisée (vue), `content-visibility` (éditeur) |
| Tests : SM-2, correction, API, e2e, analyse statique | ✅ 36 tests serveur, 16 tests web, 7 scénarios e2e (desktop + mobile) |
| Revue de sécurité avant production | 🟡 à faire |

## 10–11. Déploiement et livrables

Scripts et documentation fournis (`deploy/`, `docs/installation.md`, `docs/exploitation.md`). Le déploiement réel sur le VPS reste à faire
(fournisseur et accès DNS inconnus). Livrables : code versionné ✅, documentation d’installation et d’exploitation ✅, guide administrateur ✅,
guide utilisateur d’une page ✅, jeu de données d’exemple (`cli seed-demo`) ✅, procédure de sauvegarde/restauration testée ✅ (sur serveur vierge, en conteneur).

## 12. Questions ouvertes — décisions prises par défaut

| Question | Décision (modifiable) |
|---|---|
| VPS et DNS | Indépendant du fournisseur ; Debian/Ubuntu LTS ; enregistrements A/AAAA documentés |
| Nombre d’utilisateurs, usages | Conçu pour 200 comptes ; usages langues, cours et scolaire (expiration de compte pour les élèves) |
| Partage entre utilisateurs | Activé (par personne, lecture/modification, ou lien interne) |
| E-mail obligatoire ? | Non : facultatif ; l’admin remet les accès (copier/coller) ; aucun envoi d’e-mail |
| Services externes | Non implémentés ; désactivés par défaut (données envoyées à des tiers) |
| Langues | Interface en français ; 16 langues d’étude pour la synthèse vocale + « autre » |
| Technologies | React + Fastify + SQLite (voir §7) |

## Critères d’acceptation

| # | Critère | État |
|---|---|---|
| 1 | Sans compte : aucune donnée, pas d’inscription | ✅ e2e + API |
| 2 | Accès créé et connexion en < 2 min | ✅ e2e (mesuré) |
| 3 | Set de 20 cartes et session en < 3 min | ✅ e2e (import + cartes mémoire) |
| 4 | Six modes au clavier, au doigt, au lecteur d’écran | 🟡 clavier et tactile prévus et partiellement testés ; vérification manuelle au lecteur d’écran à faire |
| 5 | Performances sur mobile 4G | 🟡 à mesurer après déploiement |
| 6 | Restauration sur serveur vierge | ✅ testée (conteneur neuf, données vides) |
| 7 | Note A en-têtes et TLS | 🟡 configuration prévue pour A (HSTS, CSP, TLS 1.2+) ; à vérifier en production |
