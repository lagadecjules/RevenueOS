import { getValidAccessToken } from "../tokenManager";

// Documentation : https://developers.hubspot.com/docs/api/crm/deals
export async function listRecentHubSpotDeals(organizationId: string, limit = 10) {
  const tok = await getValidAccessToken(organizationId, "hubspot");
  if (!tok) throw new Error("HubSpot n'est pas connecté pour cette organisation.");

  const url = new URL("https://api.hubapi.com/crm/v3/objects/deals");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("properties", "dealname,amount,dealstage,closedate,hs_lastmodifieddate");

  const res = await fetch(url, { headers: { Authorization: `Bearer ${tok.accessToken}` } });
  if (!res.ok) throw new Error(`Appel HubSpot échoué (${res.status}) : ${await res.text()}`);
  const data = (await res.json()) as { results?: { id: string; properties: Record<string, string> }[] };
  return data.results ?? [];
}

// Documentation : https://developers.hubspot.com/docs/api/crm/associations
// et https://developers.hubspot.com/docs/api/crm/contacts
// Un deal stagnant ne peut donner lieu à une relance par email que si l'on
// peut résoudre l'adresse du contact associé : cette fonction fait ce lien.
export async function getPrimaryContactEmailForDeal(
  organizationId: string,
  dealId: string
): Promise<string | null> {
  const tok = await getValidAccessToken(organizationId, "hubspot");
  if (!tok) throw new Error("HubSpot n'est pas connecté pour cette organisation.");

  const assocRes = await fetch(
    `https://api.hubapi.com/crm/v4/objects/deals/${dealId}/associations/contacts`,
    { headers: { Authorization: `Bearer ${tok.accessToken}` } }
  );
  if (!assocRes.ok) return null;
  const assocData = (await assocRes.json()) as { results?: { toObjectId?: string; id?: string }[] };
  const contactId = assocData.results?.[0]?.toObjectId ?? assocData.results?.[0]?.id;
  if (!contactId) return null;

  const contactRes = await fetch(
    `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}?properties=email`,
    { headers: { Authorization: `Bearer ${tok.accessToken}` } }
  );
  if (!contactRes.ok) return null;
  const contact = (await contactRes.json()) as { properties?: { email?: string } };
  return contact.properties?.email ?? null;
}
