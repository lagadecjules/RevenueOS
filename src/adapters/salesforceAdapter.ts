import { getValidAccessToken } from "../tokenManager";

// Documentation : https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/resources_query.htm
export async function listRecentSalesforceOpportunities(organizationId: string, limit = 10) {
  const tok = await getValidAccessToken(organizationId, "salesforce");
  if (!tok) throw new Error("Salesforce n'est pas connecté pour cette organisation.");
  const instanceUrl = tok.extra?.instanceUrl as string | undefined;
  if (!instanceUrl) throw new Error("instance_url Salesforce manquant : reconnectez le compte.");

  const soql = `SELECT Id, Name, Amount, StageName, CloseDate, LastModifiedDate FROM Opportunity ORDER BY LastModifiedDate DESC LIMIT ${limit}`;
  const url = `${instanceUrl}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${tok.accessToken}` } });
  if (!res.ok) throw new Error(`Appel Salesforce échoué (${res.status}) : ${await res.text()}`);
  const data = (await res.json()) as { records?: Record<string, unknown>[] };
  return data.records ?? [];
}
