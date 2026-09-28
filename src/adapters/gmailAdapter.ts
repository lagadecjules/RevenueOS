import { getValidAccessToken } from "../tokenManager";
import { getConnectedAccountLabel } from "../store";

export interface GmailThreadMessage {
  from: string;
  dateMs: number;
  snippet: string;
  messageId: string; // en-tête RFC "Message-Id", nécessaire pour In-Reply-To/References
}

export interface GmailThreadDetail {
  threadId: string;
  messages: GmailThreadMessage[];
  lastMessage: GmailThreadMessage;
  lastMessageIsFromUs: boolean;
  daysSinceLastMessage: number;
  contactEmail: string | null; // adresse de l'autre partie, pour répondre
  subject: string;
}

function extractEmail(fromHeader: string): string {
  const match = fromHeader.match(/<([^>]+)>/);
  return (match ? match[1] : fromHeader).trim();
}

// Documentation : https://developers.google.com/gmail/api/reference/rest/v1/users.threads/list
export async function listRecentGmailThreads(organizationId: string, maxResults = 10) {
  const tok = await getValidAccessToken(organizationId, "google");
  if (!tok) throw new Error("Gmail n'est pas connecté pour cette organisation.");

  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/threads");
  url.searchParams.set("maxResults", String(maxResults));
  // On limite d'emblée aux échanges probablement commerciaux plutôt que de
  // tout récupérer : moins de tokens envoyés au LLM plus tard, moins de
  // données sensibles transitant inutilement.
  url.searchParams.set("q", "-category:promotions -category:social");

  const res = await fetch(url, { headers: { Authorization: `Bearer ${tok.accessToken}` } });
  if (!res.ok) throw new Error(`Appel Gmail échoué (${res.status}) : ${await res.text()}`);
  const data = (await res.json()) as { threads?: { id: string; snippet?: string }[] };
  return data.threads ?? [];
}

// Documentation : https://developers.google.com/gmail/api/reference/rest/v1/users.threads/get
export async function getGmailThreadDetail(
  organizationId: string,
  threadId: string
): Promise<GmailThreadDetail> {
  const tok = await getValidAccessToken(organizationId, "google");
  if (!tok) throw new Error("Gmail n'est pas connecté pour cette organisation.");
  const connectedEmail = getConnectedAccountLabel(organizationId, "google");

  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}`);
  url.searchParams.set("format", "metadata");
  url.searchParams.append("metadataHeaders", "From");
  url.searchParams.append("metadataHeaders", "Date");
  url.searchParams.append("metadataHeaders", "Message-Id");
  url.searchParams.append("metadataHeaders", "Subject");

  const res = await fetch(url, { headers: { Authorization: `Bearer ${tok.accessToken}` } });
  if (!res.ok) throw new Error(`Appel Gmail échoué (${res.status}) : ${await res.text()}`);
  const data = (await res.json()) as {
    messages?: {
      snippet?: string;
      internalDate?: string;
      payload?: { headers?: { name: string; value: string }[] };
    }[];
  };

  const messages: GmailThreadMessage[] = (data.messages ?? []).map((m) => {
    const headers = m.payload?.headers ?? [];
    const from = headers.find((h) => h.name === "From")?.value ?? "";
    const messageId = headers.find((h) => h.name === "Message-Id" || h.name === "Message-ID")?.value ?? "";
    return {
      from,
      dateMs: Number(m.internalDate ?? "0"),
      snippet: m.snippet ?? "",
      messageId,
    };
  });
  if (messages.length === 0) throw new Error(`Thread Gmail ${threadId} vide ou inaccessible.`);

  const subjectHeader =
    data.messages?.[0]?.payload?.headers?.find((h) => h.name === "Subject")?.value ?? "(sans objet)";

  const last = messages[messages.length - 1];
  const lastMessageIsFromUs = connectedEmail
    ? last.from.toLowerCase().includes(connectedEmail.toLowerCase())
    : false;
  const daysSinceLastMessage = (Date.now() - last.dateMs) / (1000 * 60 * 60 * 24);

  // L'adresse du contact = l'expéditeur du dernier message qui ne vient pas
  // de nous, en remontant le fil si nécessaire.
  const contactMessage = [...messages].reverse().find((m) => {
    if (!connectedEmail) return true;
    return !m.from.toLowerCase().includes(connectedEmail.toLowerCase());
  });
  const contactEmail = contactMessage ? extractEmail(contactMessage.from) : null;

  return {
    threadId,
    messages,
    lastMessage: last,
    lastMessageIsFromUs,
    daysSinceLastMessage,
    contactEmail,
    subject: subjectHeader,
  };
}

// Documentation : https://developers.google.com/gmail/api/reference/rest/v1/users.messages/send
// Construit un vrai message MIME et l'envoie DANS le même thread (en-têtes
// In-Reply-To / References corrects), pour apparaître comme une réponse et
// non comme un nouvel email isolé.
export async function sendGmailReply(
  organizationId: string,
  threadId: string,
  body: string,
  subjectOverride?: string
): Promise<{ id: string; threadId: string }> {
  const tok = await getValidAccessToken(organizationId, "google");
  if (!tok) throw new Error("Gmail n'est pas connecté pour cette organisation.");
  const connectedEmail = getConnectedAccountLabel(organizationId, "google");
  if (!connectedEmail) throw new Error("Adresse Gmail connectée introuvable.");

  const detail = await getGmailThreadDetail(organizationId, threadId);
  if (!detail.contactEmail) {
    throw new Error("Impossible de déterminer l'adresse du destinataire dans ce fil.");
  }
  const replyToMessageId = detail.lastMessage.messageId;
  const subject = subjectOverride ?? (detail.subject.startsWith("Re:") ? detail.subject : `Re: ${detail.subject}`);

  const mime = [
    `From: ${connectedEmail}`,
    `To: ${detail.contactEmail}`,
    `Subject: ${subject}`,
    replyToMessageId ? `In-Reply-To: ${replyToMessageId}` : "",
    replyToMessageId ? `References: ${replyToMessageId}` : "",
    "Content-Type: text/plain; charset=UTF-8",
    "MIME-Version: 1.0",
    "",
    body,
  ]
    .filter(Boolean)
    .join("\r\n");

  const raw = Buffer.from(mime).toString("base64url");

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tok.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw, threadId }),
  });
  if (!res.ok) throw new Error(`Envoi Gmail échoué (${res.status}) : ${await res.text()}`);
  const sent = (await res.json()) as { id: string; threadId: string };
  return sent;
}

// Pour une opportunité qui ne provient pas d'un fil Gmail existant (ex: un
// deal HubSpot stagnant) : envoie un email neuf, sans en-têtes de réponse.
export async function sendGmailNew(
  organizationId: string,
  to: string,
  subject: string,
  body: string
): Promise<{ id: string; threadId: string }> {
  const tok = await getValidAccessToken(organizationId, "google");
  if (!tok) throw new Error("Gmail n'est pas connecté pour cette organisation.");
  const connectedEmail = getConnectedAccountLabel(organizationId, "google");
  if (!connectedEmail) throw new Error("Adresse Gmail connectée introuvable.");

  const mime = [
    `From: ${connectedEmail}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "MIME-Version: 1.0",
    "",
    body,
  ].join("\r\n");
  const raw = Buffer.from(mime).toString("base64url");

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${tok.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) throw new Error(`Envoi Gmail échoué (${res.status}) : ${await res.text()}`);
  return (await res.json()) as { id: string; threadId: string };
}
