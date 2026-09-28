import { z } from "zod";

// Sortie structurée exigée du modèle (point 42 : sorties structurées, jamais
// de texte libre non validé). Toute réponse qui ne colle pas exactement à ce
// schéma est rejetée avant même la vérification anti-hallucination.
export const OpportunitySchema = z.object({
  type: z.enum(["devis_sans_reponse", "prospect_sans_reponse", "deal_stagnant"]),
  companyOrPerson: z.string().min(1),
  estimatedValue: z.number().nonnegative().nullable(),
  confidence: z.number().min(0).max(100),
  reasons: z.array(z.string().min(1)).min(1).max(6),
  recommendedAction: z.string().min(1),
  nextStep: z.string().min(1),
  missingInfo: z.array(z.string()).default([]),
});
export type OpportunityOutput = z.infer<typeof OpportunitySchema>;

export interface ValidationResult {
  ok: boolean;
  opportunity?: OpportunityOutput;
  rejectionReason?: string;
}

/**
 * Règle fondamentale (point 43 du cahier des charges) :
 * si une information n'existe pas dans les données disponibles, l'IA doit
 * dire qu'elle ne la connaît pas — jamais inventer un montant, une date, une
 * conversation. On ne peut pas vérifier le raisonnement du modèle, mais on
 * PEUT vérifier que les faits chiffrés qu'il avance existent réellement dans
 * les preuves fournies. C'est ce que fait cette fonction : elle rejette toute
 * opportunité dont le montant ne provient pas du texte source.
 */
export function parseAndValidate(rawText: string, evidenceText: string): ValidationResult {
  let json: unknown;
  try {
    // Le modèle peut entourer le JSON de texte ou de ```json ; on extrait le
    // premier bloc { ... } plutôt que d'exiger un format parfait.
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) return { ok: false, rejectionReason: "Aucun JSON trouvé dans la réponse du modèle." };
    json = JSON.parse(match[0]);
  } catch {
    return { ok: false, rejectionReason: "JSON invalide renvoyé par le modèle." };
  }

  const parsed = OpportunitySchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, rejectionReason: `Schéma invalide : ${parsed.error.message}` };
  }
  const opp = parsed.data;

  // Garde-fou anti-hallucination sur le montant : s'il annonce une valeur
  // chiffrée, ce nombre doit apparaître tel quel (à la mise en forme près)
  // dans les preuves fournies au modèle.
  if (opp.estimatedValue !== null) {
    const normalizedEvidence = evidenceText.replace(/[\s,]/g, "");
    const asInt = String(Math.round(opp.estimatedValue));
    if (!normalizedEvidence.includes(asInt)) {
      return {
        ok: false,
        rejectionReason: `Montant ${opp.estimatedValue} introuvable dans les preuves fournies : opportunité rejetée plutôt qu'affichée.`,
      };
    }
  }

  return { ok: true, opportunity: opp };
}
