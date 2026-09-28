import { AIProvider } from "../ai/provider";
import { parseAndValidate } from "../ai/schema";
import {
  OPPORTUNITY_DETECTION_SYSTEM_PROMPT,
  OPPORTUNITY_DETECTION_PROMPT_VERSION,
  buildUserPrompt,
} from "../ai/prompts/opportunityDetection";
import { Candidate, findStaleGmailCandidates, findStaleHubSpotCandidates } from "./filters";
import { saveOpportunity, saveRejection } from "./store";

export interface DetectionSummary {
  candidatesFound: number;
  opportunitiesSaved: number;
  rejected: number;
  errors: string[];
}

/**
 * Exécute le pipeline complet pour une organisation :
 * 1. filtres déterministes (aucun coût IA) → candidats
 * 2. un appel modèle par candidat, avec seulement SES preuves
 * 3. validation stricte (schéma + anti-hallucination sur les montants)
 * 4. stockage, ou rejet tracé si la validation échoue
 *
 * Le point 46 du cahier des charges demande de construire progressivement et
 * de ne rien laisser non testé : cette fonction est volontairement synchrone
 * et retourne un résumé exploitable, pour être testée simplement avant d'être
 * un jour déplacée dans une vraie file de jobs (point 30).
 */
export async function runOpportunityDetection(
  organizationId: string,
  ai: AIProvider,
  sources: ("gmail" | "hubspot")[] = ["gmail", "hubspot"]
): Promise<DetectionSummary> {
  const summary: DetectionSummary = { candidatesFound: 0, opportunitiesSaved: 0, rejected: 0, errors: [] };

  const candidates: Candidate[] = [];
  if (sources.includes("gmail")) {
    try {
      candidates.push(...(await findStaleGmailCandidates(organizationId)));
    } catch (err) {
      summary.errors.push(`Gmail : ${(err as Error).message}`);
    }
  }
  if (sources.includes("hubspot")) {
    try {
      candidates.push(...(await findStaleHubSpotCandidates(organizationId)));
    } catch (err) {
      summary.errors.push(`HubSpot : ${(err as Error).message}`);
    }
  }
  summary.candidatesFound = candidates.length;

  if (!ai.available) {
    summary.errors.push(
      "Modèle IA non configuré (ANTHROPIC_API_KEY manquant) : candidats détectés mais aucune opportunité générée."
    );
    return summary;
  }

  for (const candidate of candidates) {
    try {
      const raw = await ai.complete(
        OPPORTUNITY_DETECTION_SYSTEM_PROMPT,
        buildUserPrompt(candidate.evidenceText)
      );
      const result = parseAndValidate(raw, candidate.evidenceText);
      if (!result.ok || !result.opportunity) {
        saveRejection(organizationId, candidate, result.rejectionReason ?? "Raison inconnue", raw);
        summary.rejected += 1;
        continue;
      }
      saveOpportunity(organizationId, candidate, result.opportunity, OPPORTUNITY_DETECTION_PROMPT_VERSION);
      summary.opportunitiesSaved += 1;
    } catch (err) {
      summary.errors.push(`${candidate.source}/${candidate.sourceId} : ${(err as Error).message}`);
    }
  }

  return summary;
}
