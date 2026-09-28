import { config, redirectUriFor } from "../config";
import { ExchangeResult, OAuthProvider } from "./base";

// Documentation officielle : https://pipedrive.readme.io/docs/marketplace-oauth-authorization
const AUTH_URL = "https://oauth.pipedrive.com/oauth/authorize";
const TOKEN_URL = "https://oauth.pipedrive.com/oauth/token";

// Les scopes Pipedrive se configurent surtout côté "Developer Hub" au moment
// de créer l'app (case à cocher par ressource) ; ils ne sont pas systématiquement
// passés en query param comme chez Google. On les documente ici pour référence :
// deals:read, deals:write, contacts:read, activities:read, activities:write.

export class PipedriveOAuthProvider implements OAuthProvider {
  buildAuthUrl(state: string): string {
    if (!config.pipedrive.clientId) throw new Error("PIPEDRIVE_CLIENT_ID manquant dans .env");
    const params = new URLSearchParams({
      client_id: config.pipedrive.clientId,
      redirect_uri: redirectUriFor("pipedrive"),
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<ExchangeResult> {
    const basicAuth = Buffer.from(
      `${config.pipedrive.clientId}:${config.pipedrive.clientSecret}`
    ).toString("base64");
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUriFor("pipedrive"),
    });
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body,
    });
    if (!res.ok) throw new Error(`Échange de code Pipedrive échoué (${res.status}) : ${await res.text()}`);
    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      scope: string;
      expires_in: number;
      api_domain: string; // ex: https://votreentreprise.pipedrive.com — base pour tous les appels API
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      scope: data.scope,
      expiresAt: Date.now() + data.expires_in * 1000,
      accountLabel: data.api_domain,
      extra: { apiDomain: data.api_domain },
    };
  }

  async refresh(refreshToken: string): Promise<ExchangeResult | null> {
    const basicAuth = Buffer.from(
      `${config.pipedrive.clientId}:${config.pipedrive.clientSecret}`
    ).toString("base64");
    const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      api_domain: string;
    };
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      extra: { apiDomain: data.api_domain },
    };
  }
}
