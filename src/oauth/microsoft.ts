import { config, redirectUriFor } from "../config";
import { ExchangeResult, OAuthProvider } from "./base";

// Documentation officielle : https://learn.microsoft.com/graph/auth-v2-user
// {tenant} = "common" (comptes pro + perso), "organizations" (pro uniquement)
// ou un tenant ID précis.
const tenant = () => config.microsoft.tenant || "common";
const authUrl = () => `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize`;
const tokenUrl = () => `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`;
const GRAPH_ME = "https://graph.microsoft.com/v1.0/me";

// Mail.Read / Mail.Send : accès délégué à la boîte de l'utilisateur connecté,
// pas à tout le tenant. offline_access est requis pour obtenir un refresh_token.
const SCOPES = [
  "offline_access",
  "openid",
  "profile",
  "email",
  "https://graph.microsoft.com/Mail.Read",
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/User.Read",
];

export class MicrosoftOAuthProvider implements OAuthProvider {
  buildAuthUrl(state: string): string {
    if (!config.microsoft.clientId) throw new Error("MICROSOFT_CLIENT_ID manquant dans .env");
    const params = new URLSearchParams({
      client_id: config.microsoft.clientId,
      response_type: "code",
      redirect_uri: redirectUriFor("microsoft"),
      response_mode: "query",
      scope: SCOPES.join(" "),
      state,
    });
    return `${authUrl()}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<ExchangeResult> {
    const body = new URLSearchParams({
      client_id: config.microsoft.clientId,
      client_secret: config.microsoft.clientSecret,
      code,
      redirect_uri: redirectUriFor("microsoft"),
      grant_type: "authorization_code",
      scope: SCOPES.join(" "),
    });
    const res = await fetch(tokenUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error(`Échange de code Microsoft échoué (${res.status}) : ${await res.text()}`);
    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      scope: string;
      expires_in: number;
    };

    const who = await fetch(GRAPH_ME, { headers: { Authorization: `Bearer ${data.access_token}` } });
    const profile = who.ok ? ((await who.json()) as { mail?: string; userPrincipalName?: string }) : {};

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      scope: data.scope,
      expiresAt: Date.now() + data.expires_in * 1000,
      accountLabel: profile.mail ?? profile.userPrincipalName ?? "default",
    };
  }

  async refresh(refreshToken: string): Promise<ExchangeResult | null> {
    const body = new URLSearchParams({
      client_id: config.microsoft.clientId,
      client_secret: config.microsoft.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: SCOPES.join(" "),
    });
    const res = await fetch(tokenUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
    };
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      scope: data.scope,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
  }
}
