import { config, redirectUriFor } from "../config";
import { ExchangeResult, OAuthProvider } from "./base";

// Documentation officielle : https://developers.google.com/identity/protocols/oauth2/web-server
// Endpoints stables de Google, distincts du client_id/secret propres à chaque app.
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

// gmail.readonly : lire les emails. gmail.send : envoyer une relance après validation.
// Ne PAS demander gmail.modify si l'app n'a pas besoin de supprimer/archiver.
// Ces scopes sont "restricted" : Google exige une vérification de l'app
// (et une évaluation de sécurité tierce, cadre CASA) avant un usage en
// production au-delà de 100 utilisateurs de test.
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];

export class GoogleOAuthProvider implements OAuthProvider {
  buildAuthUrl(state: string): string {
    if (!config.google.clientId) throw new Error("GOOGLE_CLIENT_ID manquant dans .env");
    const params = new URLSearchParams({
      client_id: config.google.clientId,
      redirect_uri: redirectUriFor("google"),
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline", // nécessaire pour obtenir un refresh_token
      prompt: "consent", // force le renvoi du refresh_token même en reconnexion
      include_granted_scopes: "true",
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<ExchangeResult> {
    const body = new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: redirectUriFor("google"),
      grant_type: "authorization_code",
    });
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error(`Échange de code Google échoué (${res.status}) : ${await res.text()}`);
    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      scope: string;
      expires_in: number;
    };

    const who = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    const profile = who.ok ? ((await who.json()) as { email?: string }) : {};

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      scope: data.scope,
      expiresAt: Date.now() + data.expires_in * 1000,
      accountLabel: profile.email ?? "default",
    };
  }

  async refresh(refreshToken: string): Promise<ExchangeResult | null> {
    const body = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      grant_type: "refresh_token",
    });
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token: string; expires_in: number; scope: string };
    return {
      accessToken: data.access_token,
      scope: data.scope,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
  }
}
