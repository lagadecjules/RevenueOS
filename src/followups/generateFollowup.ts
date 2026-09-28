import { z } from "zod";
import { AIProvider } from "../ai/provider";
import { config } from "../config";
import {
  FOLLOWUP_GENERATION_SYSTEM_PROMPT,
  FOLLOWUP_GENERATION_PROMPT_VERSION,
  FollowupStrategy,
  buildFollowupUserPrompt,
} from "../ai/prompts/followupGeneration";

const DraftSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
});
export type Draft = z.infer<typeof DraftSchema>;

export interface DraftResult {
  ok: boolean;
  draft?: Draft;
  rejectionReason?: string;
}

/** Extrait tous les montants numériques mentionnés dans un texte (ex: "4 800 €", "4800€"). */
function extractAmounts(text: string): string[] {
  const matches = text.match(/(\d[\d\s]{0,10}\d|\d)\s?€/g) ?? [];
  return matches.map((m) => m.replace(/[^\d]/g, ""));
}

export async function generateFollowupDraft(
  ai: AIProvider,
  strategy: FollowupStrategy,
  companyOrPerson: string,
  evidenceText: string
): Promise<DraftResult> {
  if (!ai.available) {
    return { ok: false, rejectionReason: "ANTHROPIC_API_KEY manquant : impossible de générer un brouillon." };
  }

  const raw = await ai.complete(
    FOLLOWUP_GENERATION_SYSTEM_PROMPT(config.orgSenderName),
    buildFollowupUserPrompt(strategy, companyOrPerson, evidenceText)
  );

  let json: unknown;
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { ok: false, rejectionReason: "Aucun JSON trouvé dans la réponse du modèle." };
    json = JSON.parse(match[0]);
  } catch {
    return { ok: false, rejectionReason: "JSON invalide renvoyé par le modèle." };
  }

  const parsed = DraftSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, rejectionReason: `Schéma invalide : ${parsed.error.message}` };
  }

  // Même garde-fou que l'Opportunity Engine : tout montant chiffré mentionné
  // dans l'email doit provenir des preuves, jamais d'une invention du modèle.
  const bodyAmounts = extractAmounts(parsed.data.subject + " " + parsed.data.body);
  const evidenceAmounts = new Set(extractAmounts(evidenceText.replace(/[\s,]/g, " ")));
  const normalizedEvidence = evidenceText.replace(/[\s,]/g, "");
  for (const amount of bodyAmounts) {
    if (!evidenceAmounts.has(amount) && !normalizedEvidence.includes(amount)) {
      return {
        ok: false,
        rejectionReason: `Le brouillon mentionne un montant (${amount}) absent des preuves : rejeté plutôt qu'envoyé.`,
      };
    }
  }

  return { ok: true, draft: parsed.data };
}

export const FOLLOWUP_PROMPT_VERSION = FOLLOWUP_GENERATION_PROMPT_VERSION;
