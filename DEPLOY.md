# Déployer en 10 minutes, sans ligne de commande

## Étape 1 — Mettre le code sur GitHub (par simple glisser-déposer)

1. Créez un compte sur https://github.com si vous n'en avez pas.
2. Allez sur https://github.com/new
   - Nom du dépôt : `revenueos-integrations`
   - Laissez "Public" coché (Render gratuit exige un dépôt public)
   - Cliquez **Create repository**
3. Sur la page qui suit, cliquez le lien **uploading an existing file**.
4. Décompressez le zip que je vous ai envoyé sur votre ordinateur.
5. Glissez **tout le contenu** du dossier `revenueos-integrations` (pas le
   dossier lui-même, ce qu'il y a dedans) dans la zone d'upload GitHub.
6. En bas de page, cliquez **Commit changes**.

Votre code est en ligne. Aucune commande à taper.

## Étape 2 — Créer le service sur Render

1. Créez un compte sur https://render.com (vous pouvez vous inscrire
   directement avec votre compte GitHub, ça simplifie l'étape suivante).
2. **New +** → **Blueprint**.
3. Choisissez le dépôt `revenueos-integrations` que vous venez de créer.
4. Render détecte automatiquement le fichier `render.yaml` inclus dans le
   projet, et pré-remplit tout : nom du service, commandes, variables.
5. Cliquez **Apply**. Le premier déploiement démarre (2-3 minutes).

## Étape 3 — Récupérer votre URL et finir la configuration

1. Une fois déployé, Render affiche votre URL en haut de la page du service,
   du type `https://revenueos-integrations-xxxx.onrender.com`.
2. Allez dans l'onglet **Environment** du service, et complétez :
   - `APP_BASE_URL` = l'URL exacte que Render vient de vous donner
3. Cliquez **Save Changes** : Render redéploie automatiquement (nécessaire
   pour que cette URL soit prise en compte).

## Étape 4 — Tester que ça tourne vraiment

Ouvrez votre URL dans le navigateur : `https://votre-url.onrender.com/health`

Vous devez voir : `{"ok":true}`

C'est un vrai serveur, en ligne, accessible par n'importe qui avec le lien.
Il ne fera rien de plus tant que vous n'aurez pas ajouté les identifiants
Google/HubSpot/etc. (section 3 du README) — c'est normal et volontaire :
sans ces identifiants, il n'y a rien de réel à connecter.

## Étape 5 — Connecter un premier compte pour de vrai

Une fois qu'un provider a ses identifiants dans **Environment** (ex:
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, voir README section 3) :

`https://votre-url.onrender.com/?organizationId=demo-org`

Cette page liste les 5 boutons de connexion.

---

**Rappel important** : le plan gratuit de Render met le service en veille
après 15 minutes d'inactivité (le premier appel après une pause prend
~30 secondes à répondre), et remet le disque à zéro à chaque nouveau
déploiement — donc les connexions stockées disparaissent si vous repoussez du
code. Très bien pour une démo à un client pilote, pas pour de la production.
