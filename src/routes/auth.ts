import { Router } from "express";
import crypto from "node:crypto";
import { providers, isProvider } from "../oauth/registry";
import { saveState, consumeState, upsertIntegration, listIntegrations } from "../store";

export const authRouter = Router();

// Étape 1 : l'utilisateur clique "Connecter Gmail" côté RevenueOS.
// GET /auth/:provider/start?organizationId=org_123
authRouter.get("/auth/:provider/start", (req, res) => {
  const { provider } = req.params;
  const organizationId = String(req.query.organizationId || "");
  if (!isProvider(provider)) return res.status(404).send("Provider inconnu.");
  if (!organizationId) return res.status(400).send("organizationId manquant.");

  const state = crypto.randomBytes(24).toString("hex");
  saveState(state, provider, organizationId);

  try {
    const url = providers[provider].buildAuthUrl(state);
    res.redirect(url);
  } catch (err) {
    res.status(500).send(`Configuration manquante pour ${provider} : ${(err as Error).message}`);
  }
});

// Étape 2 : le fournisseur redirige ici avec ?code=...&state=...
authRouter.get("/auth/:provider/callback", async (req, res) => {
  const { provider } = req.params;
  const { code, state, error } = req.query as Record<string, string | undefined>;
  if (!isProvider(provider)) return res.status(404).send("Provider inconnu.");

  if (error) {
    return res.status(400).send(`L'utilisateur a refusé l'accès (${error}).`);
  }
  if (!code || !state) return res.status(400).send("Paramètres OAuth manquants.");

  const parsed = consumeState(state);
  if (!parsed || parsed.provider !== provider) {
    return res.status(400).send("État OAuth invalide ou expiré. Relancez la connexion.");
  }

  try {
    const tokens = await providers[provider].exchangeCode(code);
    const id = upsertIntegration(parsed.organizationId, provider, tokens);
    res.send(
      `<html><body style="font-family:sans-serif;padding:40px">` +
        `<h2>Connexion ${provider} réussie ✅</h2>` +
        `<p>Compte connecté : <b>${tokens.accountLabel ?? "inconnu"}</b></p>` +
        `<p>Intégration enregistrée : <code>${id}</code></p>` +
        `<p>Vous pouvez fermer cette fenêtre et revenir sur RevenueOS.</p>` +
        `</body></html>`
    );
  } catch (err) {
    res.status(500).send(`Échec de la connexion : ${(err as Error).message}`);
  }
});

// Liste les intégrations connectées pour une organisation (sans jamais exposer les tokens).
authRouter.get("/organizations/:organizationId/integrations", (req, res) => {
  const rows = listIntegrations(req.params.organizationId).map((r) => ({
    provider: r.provider,
    accountLabel: r.account_label,
    scope: r.scope,
    expiresAt: r.expires_at,
    connectedAt: r.updated_at,
  }));
  res.json({ organizationId: req.params.organizationId, integrations: rows });
});
