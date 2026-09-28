import { OAuthProvider } from "./base";
import { GoogleOAuthProvider } from "./google";
import { MicrosoftOAuthProvider } from "./microsoft";
import { HubSpotOAuthProvider } from "./hubspot";
import { SalesforceOAuthProvider } from "./salesforce";
import { PipedriveOAuthProvider } from "./pipedrive";
import { Provider } from "../store";

export const providers: Record<Provider, OAuthProvider> = {
  google: new GoogleOAuthProvider(),
  microsoft: new MicrosoftOAuthProvider(),
  hubspot: new HubSpotOAuthProvider(),
  salesforce: new SalesforceOAuthProvider(),
  pipedrive: new PipedriveOAuthProvider(),
};

export function isProvider(x: string): x is Provider {
  return x in providers;
}
