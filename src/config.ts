import "dotenv/config";

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    // On ne jette pas d'erreur au chargement pour permettre de démarrer le
    // serveur et de voir /health avant d'avoir configuré tous les providers.
    // Chaque route OAuth vérifie elle-même ses propres variables avant usage.
    return "";
  }
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  appBaseUrl: req("APP_BASE_URL", "http://localhost:3000"),
  tokenEncryptionKey: req("TOKEN_ENCRYPTION_KEY"),

  google: {
    clientId: req("GOOGLE_CLIENT_ID"),
    clientSecret: req("GOOGLE_CLIENT_SECRET"),
  },
  microsoft: {
    clientId: req("MICROSOFT_CLIENT_ID"),
    clientSecret: req("MICROSOFT_CLIENT_SECRET"),
    tenant: req("MICROSOFT_TENANT", "common"),
  },
  hubspot: {
    clientId: req("HUBSPOT_CLIENT_ID"),
    clientSecret: req("HUBSPOT_CLIENT_SECRET"),
  },
  salesforce: {
    clientId: req("SALESFORCE_CLIENT_ID"),
    clientSecret: req("SALESFORCE_CLIENT_SECRET"),
    loginUrl: req("SALESFORCE_LOGIN_URL", "https://login.salesforce.com"),
  },
  pipedrive: {
    clientId: req("PIPEDRIVE_CLIENT_ID"),
    clientSecret: req("PIPEDRIVE_CLIENT_SECRET"),
  },
  anthropic: {
    apiKey: req("ANTHROPIC_API_KEY"),
    model: req("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
  },
  orgSenderName: req("ORG_SENDER_NAME", "L'équipe commerciale"),
  // Interrupteur de sécurité explicite : désactivé par défaut. Tant qu'il
  // n'est pas mis à "true" consciemment dans .env, /send refuse d'envoyer un
  // vrai email, même si tout le reste (token, brouillon) est prêt. Voir
  // point 13 du cahier des charges : jamais d'envoi automatique sans
  // respecter la politique configurée par l'utilisateur.
  allowRealEmailSend: (process.env.ALLOW_REAL_EMAIL_SEND ?? "false").toLowerCase() === "true",
};

export function redirectUriFor(provider: string): string {
  return `${config.appBaseUrl.replace(/\/$/, "")}/auth/${provider}/callback`;
}
