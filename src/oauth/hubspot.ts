import { config, redirectUriFor } from "../config";
import { ExchangeResult, OAuthProvider } from "./base";

// Documentation officielle : https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/oauth/oauth-quickstart-guide
const AUTH_URL = "https://app.hubspot.com/oauth/authorize";
const TOKEN_URL = "https://api.hubapi.com/oauth/v1/token";
const ME_URL = "https://api.hubapi.com/oauth/v1/access-tokens"; // + /{token}

// Scopes en lecture (contacts, entreprises, deals) + écriture ciblée pour créer
// des tâches et mettre à jour un deal après une relance. Pas de scope "admin".
const SCOPES = [
  "crm.objects.contacts.read",
  "crm.objects.contacts.write",
  "crm.objects.companies.read",
  "crm.objects.deals.read",
  "crm.objects.deals.write",
  "crm.schemas.contacts.read",
];

export class HubSpotOAuthProvider implements OAuthProvider {
  buildAuthUrl(state: string): string {
    if (!config.hubspot.clientId) throw new Error("HUBSPOT_CLIENT_ID manquant dans .env");
    const params = new URLSearchParams({
      client_id: config.hubspot.clientId,
      redirect_uri: redirectUriFor("hubspot"),
      scope: SCOPES.join(" "),
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<ExchangeResult> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.hubspot.clientId,
      client_secret: config.hubspot.clientSecret,
      redirect_uri: redirectUriFor("hubspot"),
      code,
    });
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error(`Échange de code HubSpot échoué (${res.status}) : ${await res.text()}`);
    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    // récupère le portail (hub) connecté pour l'afficher comme "compte connecté"
    const meRes = await fetch(`${ME_URL}/${data.access_token}`);
    const me = meRes.ok ? ((await meRes.json()) as { hub_domain?: string; scopes?: string[] }) : {};

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      scope: (me.scopes ?? SCOPES).join(" "),
      expiresAt: Date.now() + data.expires_in * 1000,
      accountLabel: me.hub_domain ?? "default",
    };
  }

  async refresh(refreshToken: string): Promise<ExchangeResult | null> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.hubspot.clientId,
      client_secret: config.hubspot.clientSecret,
      refresh_token: refreshToken,
    });
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token: string; expires_in: number };
    return { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  }
}
