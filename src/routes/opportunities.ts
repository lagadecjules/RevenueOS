import { Router } from "express";
import { AnthropicProvider } from "../ai/provider";
import { runOpportunityDetection } from "../opportunities/detectionService";
import { listOpportunities, listRejections, updateOpportunityStatus } from "../opportunities/store";

export const opportunitiesRouter = Router();
const ai = new AnthropicProvider();

// POST /organizations/:organizationId/opportunities/detect
// Body optionnel : { "sources": ["gmail","hubspot"] }
opportunitiesRouter.post("/organizations/:organizationId/opportunities/detect", async (req, res) => {
  const { organizationId } = req.params;
  const sources = Array.isArray(req.body?.sources) ? req.body.sources : ["gmail", "hubspot"];
  try {
    const summary = await runOpportunityDetection(organizationId, ai, sources);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

opportunitiesRouter.get("/organizations/:organizationId/opportunities", (req, res) => {
  const rows = listOpportunities(req.params.organizationId).map((r) => ({
    id: r.id,
    type: r.type,
    companyOrPerson: r.company_or_person,
    estimatedValue: r.estimated_value,
    confidence: r.confidence,
    reasons: JSON.parse(r.reasons),
    recommendedAction: r.recommended_action,
    nextStep: r.next_step,
    missingInfo: JSON.parse(r.missing_info),
    source: r.source,
    evidenceText: r.evidence_text,
    status: r.status,
    detectedAt: r.detected_at,
  }));
  res.json({ organizationId: req.params.organizationId, opportunities: rows });
});

// Transparence volontaire : les candidats rejetés restent consultables, pour
// prouver que le moteur préfère se taire plutôt qu'inventer (point 43).
opportunitiesRouter.get("/organizations/:organizationId/opportunities/rejections", (req, res) => {
  res.json({ rejections: listRejections(req.params.organizationId) });
});

opportunitiesRouter.post("/organizations/:organizationId/opportunities/:id/status", (req, res) => {
  const { organizationId, id } = req.params;
  const { status } = req.body ?? {};
  if (!["sent", "ignored", "new"].includes(status)) {
    return res.status(400).json({ error: "status doit être 'sent', 'ignored' ou 'new'." });
  }
  updateOpportunityStatus(organizationId, id, status);
  res.json({ ok: true });
});
