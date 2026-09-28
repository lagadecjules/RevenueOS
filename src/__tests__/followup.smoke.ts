import { FixedResponseProvider } from "../ai/provider";
import { generateFollowupDraft } from "../followups/generateFollowup";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("ÉCHEC : " + msg);
  console.log("OK   : " + msg);
}

const evidence = "Deal HubSpot : ACME\nMontant : 4800\nÉtape actuelle : proposal\nDernière modification : il y a 12 jours";

async function main() {
  // Cas 1 : brouillon valide, montant présent dans les preuves -> accepté
  const goodProvider = new FixedResponseProvider(
    JSON.stringify({
      subject: "Suite à notre échange",
      body: "Bonjour, je reviens vers vous concernant le devis de 4800 € envoyé récemment. Bien cordialement.",
    })
  );
  const r1 = await generateFollowupDraft(goodProvider, "douce", "ACME", evidence);
  assert(r1.ok === true, "un brouillon avec un montant réel (4800) est accepté");

  // Cas 2 : brouillon avec un montant halluciné -> rejeté
  const badProvider = new FixedResponseProvider(
    JSON.stringify({
      subject: "Offre spéciale",
      body: "Bonjour, je vous propose une remise de 500 € sur votre prochaine commande. Bien cordialement.",
    })
  );
  const r2 = await generateFollowupDraft(badProvider, "valeur", "ACME", evidence);
  assert(r2.ok === false, "un montant inventé (500 €, absent des preuves) est rejeté");

  // Cas 3 : brouillon sans aucun montant -> accepté (rien à vérifier)
  const neutralProvider = new FixedResponseProvider(
    JSON.stringify({
      subject: "Petit suivi",
      body: "Bonjour, avez-vous eu l'occasion d'échanger en interne sur notre proposition ? Bien cordialement.",
    })
  );
  const r3 = await generateFollowupDraft(neutralProvider, "directe", "ACME", evidence);
  assert(r3.ok === true, "un brouillon sans montant chiffré est accepté sans vérification inutile");

  // Cas 4 : provider indisponible (pas de clé) -> rejet explicite, pas de plantage
  const noKeyProvider = { available: false, complete: async () => "" };
  const r4 = await generateFollowupDraft(noKeyProvider, "douce", "ACME", evidence);
  assert(r4.ok === false, "l'absence de clé API donne un rejet explicite, pas un brouillon vide");

  console.log("\nTous les tests de génération de relance sont passés.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
