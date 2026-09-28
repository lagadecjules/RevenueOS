import { FixedResponseProvider } from "../ai/provider";
import { parseAndValidate } from "../ai/schema";
import { buildUserPrompt } from "../ai/prompts/opportunityDetection";
import { Candidate } from "../opportunities/filters";
import { saveOpportunity, saveRejection, listOpportunities, listRejections } from "../opportunities/store";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("ÉCHEC : " + msg);
  console.log("OK   : " + msg);
}

const ORG = "test-org-" + Date.now();

// --- Cas 1 : réponse valide, montant présent dans la preuve -> doit être acceptée ---
const goodCandidate: Candidate = {
  type: "deal_stagnant",
  source: "hubspot",
  sourceId: "deal-1",
  evidenceText: "Deal HubSpot : ACME\nMontant : 4800\nÉtape actuelle : proposal\nDernière modification : il y a 12 jours",
  rawEvidence: { dealId: "deal-1" },
};
const goodResponse = JSON.stringify({
  type: "deal_stagnant",
  companyOrPerson: "ACME",
  estimatedValue: 4800,
  confidence: 85,
  reasons: ["Deal à l'étape proposal depuis 12 jours", "Montant de 4800 en jeu"],
  recommendedAction: "Relancer ACME",
  nextStep: "Envoyer un email de relance",
  missingInfo: [],
});
const r1 = parseAndValidate(goodResponse, goodCandidate.evidenceText);
assert(r1.ok === true, "une réponse valide avec un montant réel est acceptée");
if (r1.ok && r1.opportunity) {
  const id = saveOpportunity(ORG, goodCandidate, r1.opportunity, "test-v1");
  assert(id.includes("hubspot"), "l'opportunité valide est enregistrée");
}

// --- Cas 2 : montant halluciné, absent des preuves -> doit être rejetée ---
const hallucinatedResponse = JSON.stringify({
  type: "deal_stagnant",
  companyOrPerson: "ACME",
  estimatedValue: 99999, // n'apparaît nulle part dans evidenceText
  confidence: 90,
  reasons: ["Montant inventé"],
  recommendedAction: "Relancer",
  nextStep: "Envoyer un email",
  missingInfo: [],
});
const r2 = parseAndValidate(hallucinatedResponse, goodCandidate.evidenceText);
assert(r2.ok === false, "un montant halluciné (absent des preuves) est rejeté");
if (!r2.ok) {
  saveRejection(ORG, { ...goodCandidate, sourceId: "deal-2" }, r2.rejectionReason ?? "?", hallucinatedResponse);
}

// --- Cas 3 : JSON malformé -> doit être rejeté proprement, sans planter ---
const r3 = parseAndValidate("Ceci n'est pas du JSON du tout.", goodCandidate.evidenceText);
assert(r3.ok === false, "une réponse non-JSON est rejetée sans exception");

// --- Cas 4 : schéma incomplet (confidence hors bornes) -> rejeté ---
const badSchemaResponse = JSON.stringify({
  type: "deal_stagnant",
  companyOrPerson: "ACME",
  estimatedValue: null,
  confidence: 150, // hors bornes 0-100
  reasons: ["x"],
  recommendedAction: "y",
  nextStep: "z",
  missingInfo: [],
});
const r4 = parseAndValidate(badSchemaResponse, goodCandidate.evidenceText);
assert(r4.ok === false, "une confidence hors bornes (150) est rejetée par le schéma");

// --- Cas 5 : estimatedValue null (l'IA dit honnêtement qu'elle ne sait pas) -> accepté ---
const honestResponse = JSON.stringify({
  type: "prospect_sans_reponse",
  companyOrPerson: "Bluepeak",
  estimatedValue: null,
  confidence: 60,
  reasons: ["Dernier message envoyé par nous, aucune réponse depuis 6 jours"],
  recommendedAction: "Relancer",
  nextStep: "Envoyer un message de suivi",
  missingInfo: ["Montant du deal non mentionné dans le fil d'emails"],
});
const r5 = parseAndValidate(honestResponse, "Fil d'emails, 6 jours sans réponse");
assert(r5.ok === true, "une valeur null honnête (pas de montant inventé) est acceptée");

// --- Cas 6 : FixedResponseProvider fonctionne comme un vrai AIProvider ---
const provider = new FixedResponseProvider(goodResponse);
provider.complete(buildUserPrompt("test"), "test").then((text) => {
  assert(text === goodResponse, "FixedResponseProvider renvoie la réponse attendue");
});

// --- Vérification du stockage ---
const stored = listOpportunities(ORG);
assert(stored.length === 1, "exactement 1 opportunité valide stockée pour cette organisation");
assert(stored[0].company_or_person === "ACME", "l'opportunité stockée correspond bien à ACME");

const rejections = listRejections(ORG);
assert(rejections.length === 1, "exactement 1 rejet tracé (le montant halluciné)");

console.log("\nTous les tests du pipeline de détection sont passés.");
