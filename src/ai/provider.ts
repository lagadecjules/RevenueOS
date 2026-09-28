import { config } from "../config";

// Cette abstraction existe pour ne jamais coupler l'Opportunity Engine à un
// seul fournisseur de modèle (point 41 de l'architecture RevenueOS). Elle
// reçoit un system prompt + un prompt utilisateur, et renvoie du texte brut ;
// c'est à l'appelant de parser/valider (voir src/ai/schema.ts).

export interface AIProvider {
  complete(systemPrompt: string, userPrompt: string): Promise<string>;
  readonly available: boolean;
}

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export class AnthropicProvider implements AIProvider {
  get available(): boolean {
    return Boolean(config.anthropic.apiKey);
  }

  async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    if (!this.available) {
      throw new Error(
        "ANTHROPIC_API_KEY manquant : l'Opportunity Engine ne peut pas analyser sans modèle configuré."
      );
    }
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.anthropic.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: config.anthropic.model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!res.ok) {
      throw new Error(`Appel Anthropic échoué (${res.status}) : ${await res.text()}`);
    }
    const data = (await res.json()) as {
      content: { type: string; text?: string }[];
    };
    const text = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n");
    if (!text.trim()) throw new Error("Réponse Anthropic vide.");
    return text;
  }
}

// Utilisée uniquement par les tests : ne fait aucun appel réseau, renvoie une
// réponse fixe. Permet de valider tout le pipeline (filtres → preuve →
// validation → stockage) sans dépendre d'une clé API ou d'une connexion.
export class FixedResponseProvider implements AIProvider {
  readonly available = true;
  constructor(private response: string) {}
  async complete(_systemPrompt?: string, _userPrompt?: string): Promise<string> {
    return this.response;
  }
}
