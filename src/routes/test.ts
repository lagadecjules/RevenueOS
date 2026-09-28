import { Router } from "express";
import { listRecentGmailThreads } from "../adapters/gmailAdapter";
import { listRecentOutlookMessages } from "../adapters/outlookAdapter";
import { listRecentHubSpotDeals } from "../adapters/hubspotAdapter";
import { listRecentSalesforceOpportunities } from "../adapters/salesforceAdapter";
import { listRecentPipedriveDeals } from "../adapters/pipedriveAdapter";

export const testRouter = Router();

// GET /organizations/:organizationId/test/:provider
// Tire un échantillon réel (10 éléments) depuis le provider connecté, pour
// prouver que la connexion fonctionne avant de brancher l'Opportunity Engine.
testRouter.get("/organizations/:organizationId/test/:provider", async (req, res) => {
  const { organizationId, provider } = req.params;
  try {
    switch (provider) {
      case "google":
        return res.json({ provider, sample: await listRecentGmailThreads(organizationId) });
      case "microsoft":
        return res.json({ provider, sample: await listRecentOutlookMessages(organizationId) });
      case "hubspot":
        return res.json({ provider, sample: await listRecentHubSpotDeals(organizationId) });
      case "salesforce":
        return res.json({ provider, sample: await listRecentSalesforceOpportunities(organizationId) });
      case "pipedrive":
        return res.json({ provider, sample: await listRecentPipedriveDeals(organizationId) });
      default:
        return res.status(404).json({ error: "Provider inconnu." });
    }
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});
