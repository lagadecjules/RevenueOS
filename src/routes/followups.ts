import { Router } from "express";
import { config } from "../config";
import { AnthropicProvider } from "../ai/provider";
import { generateFollowupDraft } from "../followups/generateFollowup";
import { FOLLOWUP_PROMPT_VERSION } from "../followups/generateFollowup";
import {
  saveDraft,
  getDraft,
  listDraftsForOpportunity,
  markDraftSent,
  updateDraftText,
} from "../followups/store";
import { getOpportunity, updateOpportunityStatus } from "../opportunities/store";
import { sendGmailReply, sendGmailNew } from "../adapters/gmailAdapter";
import { getPrimaryContactEmailForDeal } from "../adapters/hubspotAdapter";

export const followupsRouter = Router();
const ai = new AnthropicProvider();

// POST /organizations/:organizationId/opportunities/:opportunityId/draft
// body : { "strategy": "douce" | "directe" | "valeur" }
followupsRouter.post(
  "/organizations/:organizationId/opportunities/:opportunityId/draft",
  async (req, res) => {
    const { organizationId, opportunityId } = req.params;
    const strategy = req.body?.strategy;
    if (!["douce", "directe", "valeur"].includes(strategy)) {
      return res.status(400).json({ error: "strategy doit être 'douce', 'directe' ou 'valeur'." });
    }
    const opp = getOpportunity(organizationId, opportunityId);
    if (!opp) return res.status(404).json({ error: "Opportunité introuvable." });

    try {
      const result = await generateFollowupDraft(ai, strategy, opp.company_or_person, opp.evidence_text);
      if (!result.ok || !result.draft) {
        return res.status(502).json({ error: result.rejectionReason });
      }
      const draft = saveDraft(
        organizationId,
        opportunityId,
        strategy,
        result.draft.subject,
        result.draft.body,
        FOLLOWUP_PROMPT_VERSION
      );
      res.json(draft);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

followupsRouter.get(
  "/organizations/:organizationId/opportunities/:opportunityId/drafts",
  (req, res) => {
    res.json({ drafts: listDraftsForOpportunity(req.params.organizationId, req.params.opportunityId) });
  }
);

// Édition manuelle avant envoi (le commercial garde la main sur le texte).
followupsRouter.patch("/organizations/:organizationId/drafts/:draftId", (req, res) => {
  const { organizationId, draftId } = req.params;
  const { subject, body } = req.body ?? {};
  const draft = getDraft(organizationId, draftId);
  if (!draft) return res.status(404).json({ error: "Brouillon introuvable." });
  if (draft.status !== "draft") return res.status(400).json({ error: "Ce brouillon a déjà été envoyé." });
  updateDraftText(organizationId, draftId, subject ?? draft.subject, body ?? draft.body);
  res.json(getDraft(organizationId, draftId));
});

// POST /organizations/:organizationId/drafts/:draftId/send
// C'est ICI que la validation humaine (mode Copilote) se concrétise : rien ne
// part avant cet appel explicite, et rien ne part du tout si
// ALLOW_REAL_EMAIL_SEND n'est pas à true (point 13 du cahier des charges).
followupsRouter.post("/organizations/:organizationId/drafts/:draftId/send", async (req, res) => {
  const { organizationId, draftId } = req.params;

  if (!config.allowRealEmailSend) {
    return res.status(403).json({
      error:
        "Envoi réel désactivé (ALLOW_REAL_EMAIL_SEND=false). Activez-le consciemment dans .env pour envoyer de vrais emails.",
    });
  }

  const draft = getDraft(organizationId, draftId);
  if (!draft) return res.status(404).json({ error: "Brouillon introuvable." });
  if (draft.status !== "draft") return res.status(400).json({ error: "Ce brouillon a déjà été traité." });

  const opp = getOpportunity(organizationId, draft.opportunity_id);
  if (!opp) return res.status(404).json({ error: "Opportunité associée introuvable." });

  try {
    if (opp.source === "gmail") {
      // Le fil Gmail d'origine est identifié par source_id : on répond dedans.
      await sendGmailReply(organizationId, opp.source_id, draft.body, draft.subject);
    } else if (opp.source === "hubspot") {
      const email = await getPrimaryContactEmailForDeal(organizationId, opp.source_id);
      if (!email) {
        return res.status(422).json({
          error: "Impossible de résoudre l'adresse email du contact associé à ce deal HubSpot.",
        });
      }
      await sendGmailNew(organizationId, email, draft.subject, draft.body);
    } else {
      return res.status(400).json({ error: `Envoi non supporté pour la source '${opp.source}'.` });
    }

    markDraftSent(organizationId, draftId);
    updateOpportunityStatus(organizationId, draft.opportunity_id, "sent");
    res.json({ ok: true, sentAt: Date.now() });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});
