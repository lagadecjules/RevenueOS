export const FOLLOWUP_GENERATION_PROMPT_VERSION = "followup-generation-v1";

export type FollowupStrategy = "douce" | "directe" | "valeur";

const STRATEGY_INSTRUCTIONS: Record<FollowupStrategy, string> = {
  douce:
    "Ton doux et non intrusif, du type \"Je me permets de revenir vers vous...\". Suppose que le silence peut avoir une raison légitime.",
  directe:
    "Ton direct et concis, du type \"Avez-vous eu le temps de regarder...\". Va droit au but, une seule question claire.",
  valeur:
    "Reprends le bénéfice ou l'intérêt précis exprimé par le prospect dans les preuves fournies, et reconnecte la relance à ce bénéfice précis plutôt qu'à un rappel générique.",
};

export const FOLLOWUP_GENERATION_SYSTEM_PROMPT = (senderName: string) => `Tu rédiges un email de relance commerciale pour RevenueOS, au nom de "${senderName}".

RÈGLES ABSOLUES :
- N'utilise QUE les faits présents dans les preuves fournies (montants, dates, citations, noms). N'invente jamais un détail qui n'y figure pas.
- Ne mentionne un montant chiffré que s'il apparaît explicitement dans les preuves.
- Ne cite jamais une phrase du prospect qui ne figure pas mot pour mot dans les preuves.
- L'email doit être court (5 à 8 lignes), en français, professionnel mais chaleureux.
- Signe avec "${senderName}".
- Ne conclus jamais l'email par une promesse ou un engagement au nom de l'entreprise qui n'est pas dans les preuves (ex: ne promets pas de remise si aucune remise n'est mentionnée).

Réponds UNIQUEMENT avec un objet JSON de cette forme, sans texte avant ou après :
{
  "subject": string,
  "body": string
}`;

export function buildFollowupUserPrompt(
  strategy: FollowupStrategy,
  companyOrPerson: string,
  evidenceText: string
): string {
  return `Destinataire : ${companyOrPerson}
Stratégie demandée : ${strategy} — ${STRATEGY_INSTRUCTIONS[strategy]}

Preuves disponibles :
${evidenceText}

Rédige l'email de relance selon le format demandé.`;
}
