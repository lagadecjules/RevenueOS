import Database from "better-sqlite3";
import path from "node:path";
import { encryptSecret, decryptSecret } from "./crypto";

// SQLite est utilisé ici pour que ce service tourne seul, sans dépendance
// externe. Dans RevenueOS, ceci correspond à la table `Integration` du schéma
// Postgres/Prisma proposé précédemment (organizationId, provider, tokens
// chiffrés, scope, expiry) — même modèle, moteur différent pour la démo locale.

const db = new Database(path.join(__dirname, "..", "integrations.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS oauth_state (
  state TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT,
  scope TEXT,
  expires_at INTEGER,
  account_label TEXT,
  extra TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(organization_id, provider, account_label)
);
`);

export type Provider = "google" | "microsoft" | "hubspot" | "salesforce" | "pipedrive";

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  scope?: string;
  expiresAt?: number; // epoch ms
  accountLabel?: string; // ex: adresse email connectée, ou nom du compte CRM
  extra?: Record<string, unknown>; // ex: api_domain Pipedrive, instance_url Salesforce
}

export function saveState(state: string, provider: Provider, organizationId: string) {
  db.prepare(
    "INSERT INTO oauth_state (state, provider, organization_id, created_at) VALUES (?, ?, ?, ?)"
  ).run(state, provider, organizationId, Date.now());
}

export function consumeState(state: string): { provider: Provider; organizationId: string } | null {
  const row = db.prepare("SELECT * FROM oauth_state WHERE state = ?").get(state) as
    | { provider: Provider; organization_id: string; created_at: number }
    | undefined;
  if (!row) return null;
  db.prepare("DELETE FROM oauth_state WHERE state = ?").run(state);
  // le state expire après 10 minutes, contre le rejeu
  if (Date.now() - row.created_at > 10 * 60 * 1000) return null;
  return { provider: row.provider, organizationId: row.organization_id };
}

export function upsertIntegration(organizationId: string, provider: Provider, tokens: TokenSet) {
  const now = Date.now();
  const id = `${organizationId}:${provider}:${tokens.accountLabel ?? "default"}`;
  db.prepare(
    `INSERT INTO integrations
      (id, organization_id, provider, access_token_enc, refresh_token_enc, scope, expires_at, account_label, extra, created_at, updated_at)
     VALUES (@id, @organizationId, @provider, @accessTokenEnc, @refreshTokenEnc, @scope, @expiresAt, @accountLabel, @extra, @now, @now)
     ON CONFLICT(organization_id, provider, account_label) DO UPDATE SET
       access_token_enc = excluded.access_token_enc,
       refresh_token_enc = COALESCE(excluded.refresh_token_enc, integrations.refresh_token_enc),
       scope = excluded.scope,
       expires_at = excluded.expires_at,
       extra = excluded.extra,
       updated_at = @now`
  ).run({
    id,
    organizationId,
    provider,
    accessTokenEnc: encryptSecret(tokens.accessToken),
    refreshTokenEnc: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
    scope: tokens.scope ?? null,
    expiresAt: tokens.expiresAt ?? null,
    accountLabel: tokens.accountLabel ?? "default",
    extra: tokens.extra ? JSON.stringify(tokens.extra) : null,
    now,
  });
  return id;
}

export function getIntegration(organizationId: string, provider: Provider, accountLabel = "default") {
  const row = db
    .prepare(
      "SELECT * FROM integrations WHERE organization_id = ? AND provider = ? AND account_label = ?"
    )
    .get(organizationId, provider, accountLabel) as
    | {
        access_token_enc: string;
        refresh_token_enc: string | null;
        scope: string | null;
        expires_at: number | null;
        extra: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    accessToken: decryptSecret(row.access_token_enc),
    refreshToken: row.refresh_token_enc ? decryptSecret(row.refresh_token_enc) : undefined,
    scope: row.scope ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    extra: row.extra ? (JSON.parse(row.extra) as Record<string, unknown>) : undefined,
  };
}

export function updateAccessToken(
  organizationId: string,
  provider: Provider,
  accessToken: string,
  expiresAt?: number,
  accountLabel = "default"
) {
  db.prepare(
    `UPDATE integrations SET access_token_enc = ?, expires_at = ?, updated_at = ?
     WHERE organization_id = ? AND provider = ? AND account_label = ?`
  ).run(encryptSecret(accessToken), expiresAt ?? null, Date.now(), organizationId, provider, accountLabel);
}

/** Renvoie le compte connecté (ex: adresse Gmail) pour un provider donné, sans exposer de token. */
export function getConnectedAccountLabel(organizationId: string, provider: Provider): string | null {
  const row = db
    .prepare("SELECT account_label FROM integrations WHERE organization_id = ? AND provider = ? LIMIT 1")
    .get(organizationId, provider) as { account_label: string } | undefined;
  return row?.account_label ?? null;
}

export function listIntegrations(organizationId: string) {
  return db
    .prepare(
      "SELECT provider, account_label, scope, expires_at, updated_at FROM integrations WHERE organization_id = ?"
    )
    .all(organizationId) as {
    provider: Provider;
    account_label: string;
    scope: string | null;
    expires_at: number | null;
    updated_at: number;
  }[];
}
