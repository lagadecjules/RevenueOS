import { config, redirectUriFor } from "../config";
import { ExchangeResult, OAuthProvider } from "./base";

// Documentation officielle : https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_web_server_flow.htm
// loginUrl = https://login.salesforce.com en production,
// https://test.salesforce.com pour un environnement sandbox.
const authUrl = () => `${config.salesforce.loginUrl.replace(/\/$/, "")}/services/oauth2/authorize`;
const tokenUrl = () => `${config.salesforce.loginUrl.replace(/\/$/, "")}/services/oauth2/token`;

// "api" couvre les objets standard (Contact, Account, Opportunity, Task) via
// l'API REST. "refresh_token offline_access" pour la reconnexion silencieuse.
const SCOPES = ["api", "refresh_token", "offline_access"];

export class SalesforceOAuthProvider implements OAuthProvider {
  buildAuthUrl(state: string): string {
    if (!config.salesforce.clientId) throw new Error("SALESFORCE_CLIENT_ID manquant dans .env");
    const params = new URLSearchParams({
      response_type: "code",
      client_id: config.salesforce.clientId,
      redirect_uri: redirectUriFor("salesforce"),
      scope: SCOPES.join(" "),
      state,
    });
    return `${authUrl()}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<ExchangeResult> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: config.salesforce.clientId,
      client_secret: config.salesforce.clientSecret,
      redirect_uri: redirectUriFor("salesforce"),
    });
    const res = await fetch(tokenUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error(`Échange de code Salesforce échoué (${res.status}) : ${await res.text()}`);
    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      instance_url: string; // base URL propre à l'organisation Salesforce du client
      id: string; // URL d'identité, contient l'org et l'utilisateur
      scope: string;
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      scope: data.scope,
      // Salesforce ne renvoie pas de durée de vie fixe pour l'access_token ;
      // on le rafraîchit de façon proactive avant chaque appel si besoin.
      accountLabel: data.instance_url,
      extra: { instanceUrl: data.instance_url, identityUrl: data.id },
    };
  }

  async refresh(refreshToken: string): Promise<ExchangeResult | null> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.salesforce.clientId,
      client_secret: config.salesforce.clientSecret,
      refresh_token: refreshToken,
    });
    const res = await fetch(tokenUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token: string; instance_url: string; scope: string };
    return {
      accessToken: data.access_token,
      scope: data.scope,
      extra: { instanceUrl: data.instance_url },
    };
  }
}
