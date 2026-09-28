# RevenueOS — Service de connexions (Gmail, Outlook, HubSpot, Salesforce, Pipedrive)

Ce service implémente les vrais flux OAuth 2.0 pour les 5 fournisseurs prioritaires
de RevenueOS. Il n'y a aucune simulation : chaque connexion redirige vers le
véritable serveur d'autorisation du fournisseur, échange le code contre des
tokens réels, les chiffre (AES-256-GCM) avant de les stocker, et sait tirer un
échantillon réel de données pour prouver que la connexion fonctionne.

Ce qu'il **ne fait pas encore** : synchronisation complète, webhooks temps réel,
écriture dans les CRM, isolation multi-tenant en production (il utilise SQLite
et un `organizationId` texte libre, à remplacer par le vrai modèle Organization
de RevenueOS une fois ce service intégré au backend principal). C'est la
brique de connexion, pas encore l'Opportunity Engine.

## 1. Installer et lancer

```bash
npm install
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# collez le résultat dans TOKEN_ENCRYPTION_KEY (.env)
npm run dev
```

Ouvrez `http://localhost:3000/?organizationId=demo-org` : une page liste les
5 boutons de connexion et un lien vers les intégrations déjà connectées.

Tant que les identifiants d'un provider ne sont pas renseignés dans `.env`,
cliquer sur son lien renvoie une erreur explicite plutôt qu'un plantage.

## 2. Exposer le service en HTTPS pour les callbacks

Google, Microsoft et HubSpot exigent un `redirect_uri` exact, enregistré à
l'avance dans chaque app, et refusent en général `http://localhost` en dehors
de leurs propres exceptions de test. Pour développer :

```bash
# exemple avec un tunnel HTTPS
cloudflared tunnel --url http://localhost:3000
# ou : ngrok http 3000
```

Mettez l'URL obtenue dans `APP_BASE_URL` (`.env`), puis utilisez
`{APP_BASE_URL}/auth/<provider>/callback` comme redirect URI dans chaque
console développeur — voir le détail par provider ci-dessous.

## 3. Configurer chaque fournisseur

### Gmail (Google)
1. https://console.cloud.google.com/apis/credentials → créez un projet.
2. Activez l'**API Gmail** (bibliothèque d'API).
3. Configurez l'écran de consentement OAuth (type Externe pour du multi-entreprise).
4. Créez un identifiant **ID client OAuth**, type **Application Web**.
5. Ajoutez `{APP_BASE_URL}/auth/google/callback` dans les URI de redirection autorisés.
6. Copiez client ID / secret dans `.env`.
7. **Important** : tant que l'app est en statut *Test*, seuls les comptes Google
   ajoutés comme testeurs peuvent se connecter. Les scopes Gmail utilisés
   (`gmail.readonly`, `gmail.send`) sont classés **restreints** par Google : pour
   dépasser 100 utilisateurs de test, l'app doit passer par la vérification
   Google, qui inclut une évaluation de sécurité tierce (cadre CASA). Prévoyez
   ce délai avant un lancement commercial.

### Outlook (Microsoft 365 / comptes personnels)
1. https://entra.microsoft.com → **App registrations** → **New registration**.
2. Type de compte : multitenant si vous visez toutes les entreprises clientes.
3. Ajoutez une plateforme **Web**, redirect URI `{APP_BASE_URL}/auth/microsoft/callback`.
4. **Certificates & secrets** → créez un secret client, copiez-le immédiatement (non ré-affichable).
5. **API permissions** → ajoutez les permissions **déléguées** Microsoft Graph :
   `Mail.Read`, `Mail.Send`, `User.Read`, `offline_access`.
6. Copiez Application (client) ID / secret dans `.env`.

### HubSpot
1. https://developers.hubspot.com → **Apps** → **Create app**.
2. Onglet **Auth** : ajoutez `{APP_BASE_URL}/auth/hubspot/callback` en redirect URL.
3. Onglet **Scopes** : cochez les scopes lecture/écriture contacts, entreprises, deals
   (ils doivent correspondre à la liste dans `src/oauth/hubspot.ts`).
4. Copiez Client ID / secret dans `.env`.
5. Testez avec un compte développeur HubSpot gratuit avant de viser un vrai portail client.

### Salesforce
1. Setup → **App Manager** → **New Connected App**.
2. Activez **Enable OAuth Settings**.
3. Callback URL : `{APP_BASE_URL}/auth/salesforce/callback`.
4. Scopes OAuth sélectionnés : `api`, `refresh_token`, `offline_access`.
5. Copiez Consumer Key / Consumer Secret dans `.env` (`SALESFORCE_CLIENT_ID` / `_SECRET`).
6. Utilisez `SALESFORCE_LOGIN_URL=https://test.salesforce.com` pour tester sur un sandbox
   avant la production (`login.salesforce.com`).

### Pipedrive
1. https://developers.pipedrive.com → **Create an app** (Developer Hub).
2. Onglet **OAuth & access scopes** : callback URL `{APP_BASE_URL}/auth/pipedrive/callback`.
3. Cochez les scopes nécessaires (deals, contacts, activités en lecture/écriture selon vos besoins).
4. Copiez Client ID / secret dans `.env`.

## 4. Tester une connexion de bout en bout

1. `npm run dev`
2. Ouvrez `http://localhost:3000/?organizationId=demo-org`, cliquez sur un provider.
3. Connectez-vous et acceptez les permissions.
4. Vous atterrissez sur une page de confirmation avec le compte connecté.
5. Vérifiez : `GET /organizations/demo-org/integrations`
6. Tirez un échantillon réel de données :
   `GET /organizations/demo-org/test/hubspot` (ou google, microsoft, salesforce, pipedrive)

Si le token est expiré, `getValidAccessToken` le rafraîchit automatiquement
avant l'appel — pas d'action manuelle nécessaire.

## 5. Sécurité déjà en place

- Tokens chiffrés individuellement (AES-256-GCM) avant écriture en base ; la
  clé vit uniquement dans `TOKEN_ENCRYPTION_KEY`, jamais dans le code.
- Paramètre `state` aléatoire, à usage unique, expirant après 10 minutes :
  protection contre le rejeu et le CSRF sur le callback OAuth.
- Aucun token, ni contenu de message, n'est jamais journalisé (`console.log`
  n'affiche que des métadonnées : provider, compte connecté, id d'intégration).
- Les endpoints de test/lecture ne renvoient jamais les tokens eux-mêmes.

## 6. Opportunity Engine

Le moteur de détection est maintenant branché. Pipeline exact :

1. **Filtres déterministes** (`src/opportunities/filters.ts`), sans coût IA :
   - Gmail : fils dont le dernier message vient de vous et qui n'ont aucune
     réponse depuis 5 jours ou plus.
   - HubSpot : deals non clôturés dont `hs_lastmodifieddate` date de 10 jours
     ou plus.
2. **Un appel modèle par candidat retenu**, avec uniquement ses preuves
   (`src/ai/prompts/opportunityDetection.ts`), via l'API Anthropic
   (`src/ai/provider.ts` — nécessite `ANTHROPIC_API_KEY` dans `.env`).
3. **Validation stricte** (`src/ai/schema.ts`) : le schéma JSON est vérifié
   (Zod), et surtout, **tout montant chiffré annoncé par le modèle doit être
   présent tel quel dans les preuves fournies** — sinon l'opportunité est
   rejetée plutôt qu'affichée. C'est le garde-fou anti-hallucination du point
   43 du cahier des charges, implémenté et testé, pas seulement documenté.
4. **Stockage** (`src/opportunities/store.ts`) : chaque opportunité acceptée
   garde son texte de preuve d'origine ; chaque rejet est tracé avec sa raison
   et la réponse brute du modèle, consultable via l'API.

### Endpoints

```
POST /organizations/:organizationId/opportunities/detect
     body optionnel : { "sources": ["gmail","hubspot"] }
GET  /organizations/:organizationId/opportunities
GET  /organizations/:organizationId/opportunities/rejections
POST /organizations/:organizationId/opportunities/:id/status
     body : { "status": "sent" | "ignored" | "new" }
```

### Tester sans connexion réelle ni clé API

```bash
npx tsx src/__tests__/detection.smoke.ts
```

Ce script rejoue le pipeline complet (validation, anti-hallucination,
stockage, rejets) avec des preuves simulées et un `FixedResponseProvider` —
aucun réseau nécessaire. C'est la preuve que le garde-fou anti-hallucination
fonctionne réellement : un montant halluciné y est explicitement rejeté.

### Tester avec de vraies données

1. Connectez Gmail et/ou HubSpot (voir section 3).
2. Ajoutez `ANTHROPIC_API_KEY` dans `.env`.
3. `POST /organizations/demo-org/opportunities/detect`
4. `GET /organizations/demo-org/opportunities`

Sans `ANTHROPIC_API_KEY`, l'endpoint répond avec le nombre de candidats
détectés par les filtres déterministes, mais génère zéro opportunité — jamais
de résultat inventé faute de modèle configuré.

## 7. Génération et envoi des relances (avec validation humaine)

### Ce que fait cette brique
1. **Génération** (`src/followups/generateFollowup.ts`) : à partir d'une
   opportunité déjà détectée, l'IA rédige un email dans l'une des 3
   stratégies (`douce`, `directe`, `valeur`), en utilisant uniquement les
   preuves de cette opportunité.
2. **Même garde-fou anti-hallucination que la détection** : si l'email généré
   mentionne un montant absent des preuves, il est rejeté avant même d'être
   proposé au commercial.
3. **Édition humaine** : le brouillon peut être modifié avant envoi
   (`PATCH /drafts/:draftId`).
4. **Envoi réel avec double verrou** :
   - Verrou 1, applicatif : rien ne part sans un appel explicite à
     `POST /drafts/:draftId/send` — jamais d'automatisation silencieuse.
   - Verrou 2, configuration : cet appel échoue systématiquement tant que
     `ALLOW_REAL_EMAIL_SEND=true` n'est pas positionné consciemment dans
     `.env`. Par défaut (`false`), l'API refuse d'envoyer un vrai email même
     si tout le reste est prêt — vérifié par test.
   - Gmail : répond dans le fil d'origine (en-têtes `In-Reply-To`/`References`
     corrects). HubSpot : résout l'email du contact associé au deal via les
     associations CRM réelles, puis envoie un nouveau message.

### Endpoints

```
POST  /organizations/:organizationId/opportunities/:opportunityId/draft
      body : { "strategy": "douce" | "directe" | "valeur" }
GET   /organizations/:organizationId/opportunities/:opportunityId/drafts
PATCH /organizations/:organizationId/drafts/:draftId
      body : { "subject"?: string, "body"?: string }
POST  /organizations/:organizationId/drafts/:draftId/send
```

### Tester sans réseau ni clé API

```bash
npx tsx src/__tests__/followup.smoke.ts
```

Ce test prouve, avec un `FixedResponseProvider`, qu'un brouillon mentionnant
un montant inventé (absent des preuves) est bien rejeté, et qu'un brouillon
honnête (sans montant chiffré) est accepté.

### Tester le verrou de sécurité d'envoi

```bash
npm run dev
curl -X POST localhost:3000/organizations/demo-org/drafts/xxx/send
# -> 403, "Envoi réel désactivé (ALLOW_REAL_EMAIL_SEND=false)"
```

C'est le comportement par défaut, volontairement strict : vous devez changer
`.env` vous-même pour qu'un premier vrai email puisse partir.

## 8. Prochaine étape

Il manque encore : l'automatisation par règles (mode Assisté/Autonome,
section 31 du cahier des charges — aujourd'hui uniquement le mode Copilote
existe), le suivi des réponses reçues après l'envoi, et le passage de la
détection à une vraie file de jobs asynchrone plutôt qu'une exécution
synchrone dans la requête HTTP.

## 9. L'interface réelle

`https://votre-service.onrender.com/` sert maintenant une vraie interface
(`public/index.html`), pas une page de test brute. Elle appelle les vraies
routes ci-dessus en `fetch()` **same-origin** (même domaine, donc aucune
restriction réseau, contrairement à une page publiée sur claude.ai).

Ce qu'elle fait réellement :
- **Onglet Connexions** : état réel de chaque provider, bouton "Connecter"
  qui lance le vrai flux OAuth.
- **Onglet Opportunités** : bouton "Analyser mes données" → lance
  `POST /opportunities/detect`, affiche les vraies opportunités trouvées avec
  leur preuve, génère un brouillon de relance par stratégie, permet de
  l'éditer, puis de l'envoyer (bloqué par `ALLOW_REAL_EMAIL_SEND` comme
  documenté plus haut) — et montre aussi les candidats rejetés par le
  garde-fou anti-hallucination, pour la transparence.

L'ancienne page technique reste disponible sur `/debug` si besoin de tester
un lien de connexion sans passer par l'interface.

**Ce qui manque encore ici** : authentification utilisateur (n'importe qui
connaissant l'URL peut taper un `organizationId` et voir ces données — très
bien pour un test solo ou une démo pilote, pas pour plusieurs clients en
parallèle), et le style est fonctionnel mais plus sobre que la démo
artifact — l'objectif ici était que **tout marche pour de vrai**, pas
l'esthétique finale.
