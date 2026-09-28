import { Provider, getIntegration, updateAccessToken } from "./store";
import { providers } from "./oauth/registry";

const SAFETY_MARGIN_MS = 60_000; // rafraîchit 1 minute avant l'expiration réelle

/**
 * Retourne un access token valide pour cette organisation/provider,
 * en le rafraîchissant automatiquement s'il est expiré ou proche de l'être.
 * Ne rafraîchit jamais un token encore valide (évite de gaspiller des appels).
 */
export async function getValidAccessToken(
  organizationId: string,
  provider: Provider,
  accountLabel = "default"
): Promise<{ accessToken: string; extra?: Record<string, unknown> } | null> {
  const integ = getIntegration(organizationId, provider, accountLabel);
  if (!integ) return null;

  const isExpired = integ.expiresAt !== undefined && Date.now() > integ.expiresAt - SAFETY_MARGIN_MS;
  if (!isExpired || !integ.refreshToken) {
    return { accessToken: integ.accessToken, extra: integ.extra };
  }

  const refreshed = await providers[provider].refresh(integ.refreshToken);
  if (!refreshed) return { accessToken: integ.accessToken, extra: integ.extra }; // tant pis, on retente avec l'ancien

  updateAccessToken(organizationId, provider, refreshed.accessToken, refreshed.expiresAt, accountLabel);
  return { accessToken: refreshed.accessToken, extra: refreshed.extra ?? integ.extra };
}
