import express from "express";
import path from "node:path";
import { config } from "./config";
import { authRouter } from "./routes/auth";
import { testRouter } from "./routes/test";
import { opportunitiesRouter } from "./routes/opportunities";
import { followupsRouter } from "./routes/followups";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

// L'interface réelle : servie par ce serveur, donc sans aucune restriction
// réseau (contrairement à une page publiée sur claude.ai). Elle appelle les
// vraies routes ci-dessous en fetch() same-origin.
app.use(express.static(path.join(__dirname, "..", "public")));

// Ancienne page de secours, minimale, gardée pour du débogage rapide sans JS.
app.get("/debug", (req, res) => {
  const org = String(req.query.organizationId || "demo-org");
  const providers = ["google", "microsoft", "hubspot", "salesforce", "pipedrive"];
  const items = providers
    .map((p) => `<li><a href="/auth/${p}/start?organizationId=${org}">Connecter ${p}</a></li>`)
    .join("");
  res.send(
    `<html><body style="font-family:sans-serif;padding:40px;max-width:520px">` +
      `<h1>RevenueOS — Connexions (debug)</h1>` +
      `<p>Organisation de test : <b>${org}</b></p><ul>${items}</ul>` +
      `<p><a href="/organizations/${org}/integrations">Voir les intégrations connectées (JSON)</a></p>` +
      `</body></html>`
  );
});

app.use(authRouter);
app.use(testRouter);
app.use(opportunitiesRouter);
app.use(followupsRouter);

app.listen(config.port, () => {
  console.log(`RevenueOS integrations service en écoute sur ${config.appBaseUrl}`);
  console.log(`Ouvrez ${config.appBaseUrl} pour l'interface réelle.`);
});
