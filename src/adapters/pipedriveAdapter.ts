import { getValidAccessToken } from "../tokenManager";

// Documentation : https://developers.pipedrive.com/docs/api/v1/Deals#getDeals
export async function listRecentPipedriveDeals(organizationId: string, limit = 10) {
  const tok = await getValidAccessToken(organizationId, "pipedrive");
  if (!tok) throw new Error("Pipedrive n'est pas connecté pour cette organisation.");
  const apiDomain = (tok.extra?.apiDomain as string | undefined) ?? "https://api.pipedrive.com";

  const url = new URL(`${apiDomain}/api/v1/deals`);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("sort", "update_time DESC");

  const res = await fetch(url, { headers: { Authorization: `Bearer ${tok.accessToken}` } });
  if (!res.ok) throw new Error(`Appel Pipedrive échoué (${res.status}) : ${await res.text()}`);
  const data = (await res.json()) as { data?: Record<string, unknown>[] };
  return data.data ?? [];
}
