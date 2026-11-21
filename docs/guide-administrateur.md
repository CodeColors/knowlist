# Guide administrateur

L’espace d’administration est accessible depuis l’onglet **Admin** (`/admin`), réservé au rôle administrateur.
Le tout premier administrateur est créé en ligne de commande (voir `installation.md`) ; les suivants peuvent être nommés depuis l’interface.

## Donner un accès

Il n’existe **aucune inscription publique**. Deux façons de créer un accès :

1. **Identifiants générés** — *Comptes → Créer un accès* : saisir le nom (l’identifiant est proposé automatiquement, ex. `marie.dupont`),
   l’e-mail est facultatif. KnowList génère un mot de passe temporaire robuste (ex. `tulipe-orage-carnet-482`), affiché **une seule fois** :
   le copier et le remettre en main propre ou par un canal sûr. La personne devra le changer à sa première connexion.
2. **Lien d’invitation** — *Invitations → Générer une invitation* : un lien à usage unique, valable 7 jours (réglable), mène à une page où
   la personne choisit elle-même son mot de passe. Le suivi indique *Envoyée / Utilisée / Expirée / Révoquée* ; on peut révoquer un lien.

Une **date d’expiration** peut être fixée (ex. fin de trimestre pour un élève) : passé cette date, la connexion est refusée et les sessions fermées.

## Gérer les comptes

Dans *Comptes*, filtrer par statut (actif, suspendu, expiré) puis, via le menu « ⋯ » :
- **Suspendre / Réactiver** (la suspension ferme immédiatement toutes les sessions) ;
- **Réinitialiser le mot de passe** (nouveau mot de passe temporaire, sessions fermées) ;
- **Forcer la déconnexion** ; **Désactiver la 2FA** (si la personne a perdu son téléphone) ;
- **Supprimer** (saisir l’identifiant pour confirmer ; supprime aussi ses sets et sa progression — irréversible).

KnowList empêche de supprimer, suspendre ou rétrograder le **dernier administrateur actif**.

## Sessions et journal

- *Sessions* : appareils connectés par personne, déconnexion à distance.
- *Journal* : connexions, échecs, blocages, créations/suppressions de comptes, invitations, réinitialisations, sauvegardes…
  avec date, IP et auteur. Conservation 90 jours.

## Paramètres

Durée des invitations, longueur minimale des mots de passe (12 minimum ; les mots de passe courants sont toujours refusés),
quotas (sets et cartes par utilisateur, taille des images et de l’audio), message d’accueil affiché à la première connexion,
activation des services externes (désactivés par défaut).

## Sauvegardes

*Sauvegardes* : sauvegarde immédiate, liste, téléchargement, import d’une archive, **restauration guidée**. Voir `exploitation.md`.

## Bonnes pratiques

- Activer la **double authentification** sur tout compte administrateur (Profil → Sécurité).
- Vérifier régulièrement la date de la dernière sauvegarde sur le tableau de bord.
- En cas de perte totale de l’accès admin : `docker compose exec app node server/dist/cli.js reset-password <identifiant>`.
