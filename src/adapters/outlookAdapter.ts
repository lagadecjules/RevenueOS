import { getValidAccessToken } from "../tokenManager";

// Documentation : https://learn.microsoft.com/graph/api/user-list-messages
export async function listRecentOutlookMessages(organizationId: string, top = 10) {
  const tok = await getValidAccessToken(organizationId, "microsoft");
  if (!tok) throw new Error("Outlook n'est pas connecté pour cette organisation.");

  const url = new URL("https://graph.microsoft.com/v1.0/me/messages");
  url.searchParams.set("$top", String(top));
  url.searchParams.set("$select", "subject,from,receivedDateTime,bodyPreview");
  url.searchParams.set("$orderby", "receivedDateTime desc");

  const res = await fetch(url, { headers: { Authorization: `Bearer ${tok.accessToken}` } });
  if (!res.ok) throw new Error(`Appel Microsoft Graph échoué (${res.status}) : ${await res.text()}`);
  const data = (await res.json()) as {
    value?: { subject?: string; from?: unknown; receivedDateTime?: string; bodyPreview?: string }[];
  };
  return data.value ?? [];
}

// Documentation : https://learn.microsoft.com/graph/api/message-reply
// Répond dans le fil d'origine, en conservant sujet/destinataire/historique
// gérés nativement par Graph (contrairement à Gmail, pas besoin de
// reconstruire les en-têtes MIME à la main).
export async function sendOutlookReply(
  organizationId: string,
  messageId: string,
  body: string
): Promise<{ ok: true }> {
  const tok = await getValidAccessToken(organizationId, "microsoft");
  if (!tok) throw new Error("Outlook n'est pas connecté pour cette organisation.");

  const res = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${messageId}/reply`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ comment: body }),
  });
  if (!res.ok) throw new Error(`Réponse Outlook échouée (${res.status}) : ${await res.text()}`);
  return { ok: true };
}

// Documentation : https://learn.microsoft.com/graph/api/user-sendmail
export async function sendOutlookNew(
  organizationId: string,
  to: string,
  subject: string,
  body: string
): Promise<{ ok: true }> {
  const tok = await getValidAccessToken(organizationId, "microsoft");
  if (!tok) throw new Error("Outlook n'est pas connecté pour cette organisation.");

  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: { Authorization: `Bearer ${tok.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "Text", content: body },
        toRecipients: [{ emailAddress: { address: to } }],
      },
    }),
  });
  if (!res.ok) throw new Error(`Envoi Outlook échoué (${res.status}) : ${await res.text()}`);
  return { ok: true };
}
