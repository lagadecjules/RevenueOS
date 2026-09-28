import { listRecentGmailThreads, getGmailThreadDetail } from "../adapters/gmailAdapter";
import { listRecentHubSpotDeals } from "../adapters/hubspotAdapter";

// Ces filtres ne coûtent aucun appel au modèle : ce sont des règles simples
// sur des données déjà structurées (dates, montants). Le LLM n'intervient
// qu'ensuite, sur les candidats déjà retenus (point 29 : ne jamais envoyer
// inutilement toutes les données au LLM).

export interface Candidate {
  type: "prospect_sans_reponse" | "deal_stagnant";
  source: "gmail" | "hubspot";
  sourceId: string;
  evidenceText: string;
  rawEvidence: Record<string, unknown>;
}

const STALE_THREAD_DAYS = 5;
const STALE_DEAL_DAYS = 10;
const CLOSED_STAGE_KEYWORDS = ["closedwon", "closedlost", "closed_won", "closed_lost"];

export async function findStaleGmailCandidates(
  organizationId: string,
  maxThreads = 15
): Promise<Candidate[]> {
  const threads = await listRecentGmailThreads(organizationId, maxThreads);
  const candidates: Candidate[] = [];

  for (const t of threads) {
    try {
      const detail = await getGmailThreadDetail(organizationId, t.id);
      // Signal réel et vérifiable : le dernier message du fil vient de nous,
      // et personne n'a répondu depuis plus de STALE_THREAD_DAYS jours.
      if (detail.lastMessageIsFromUs && detail.daysSinceLastMessage >= STALE_THREAD_DAYS) {
        const evidenceText = detail.messages
          .map(
            (m) =>
              `De: ${m.from} | Date: ${new Date(m.dateMs).toISOString().slice(0, 10)} | Extrait: "${m.snippet}"`
          )
          .join("\n");
        candidates.push({
          type: "prospect_sans_reponse",
          source: "gmail",
          sourceId: t.id,
          evidenceText: `Fil d'emails (Gmail), ${Math.round(detail.daysSinceLastMessage)} jours sans réponse :\n${evidenceText}`,
          rawEvidence: { threadId: t.id, messages: detail.messages },
        });
      }
    } catch {
      // Un thread illisible ne doit jamais faire échouer toute la détection.
      continue;
    }
  }
  return candidates;
}

export async function findStaleHubSpotCandidates(
  organizationId: string,
  maxDeals = 25
): Promise<Candidate[]> {
  const deals = await listRecentHubSpotDeals(organizationId, maxDeals);
  const candidates: Candidate[] = [];
  const now = Date.now();

  for (const d of deals) {
    const stage = (d.properties.dealstage ?? "").toLowerCase();
    if (CLOSED_STAGE_KEYWORDS.some((k) => stage.includes(k))) continue;

    const lastModified = Number(d.properties.hs_lastmodifieddate ?? 0);
    if (!lastModified) continue;
    const daysStale = (now - lastModified) / (1000 * 60 * 60 * 24);
    if (daysStale < STALE_DEAL_DAYS) continue;

    const evidenceText = [
      `Deal HubSpot : ${d.properties.dealname ?? "(sans nom)"}`,
      `Montant : ${d.properties.amount ?? "non renseigné"}`,
      `Étape actuelle : ${d.properties.dealstage ?? "inconnue"}`,
      `Dernière modification : il y a ${Math.round(daysStale)} jours`,
      `Date de clôture prévue : ${d.properties.closedate ?? "non renseignée"}`,
    ].join("\n");

    candidates.push({
      type: "deal_stagnant",
      source: "hubspot",
      sourceId: d.id,
      evidenceText,
      rawEvidence: { dealId: d.id, properties: d.properties },
    });
  }
  return candidates;
}
