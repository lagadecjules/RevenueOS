export interface ExchangeResult {
  accessToken: string;
  refreshToken?: string;
  scope?: string;
  expiresAt?: number; // epoch ms
  accountLabel?: string;
  extra?: Record<string, unknown>;
}

export interface OAuthProvider {
  /** Construit l'URL vers laquelle rediriger l'utilisateur pour donner son consentement. */
  buildAuthUrl(state: string): string;
  /** Échange le code renvoyé par le callback contre un jeu de tokens. */
  exchangeCode(code: string): Promise<ExchangeResult>;
  /** Rafraîchit un access token expiré. Retourne null si le provider ne supporte pas le refresh. */
  refresh(refreshToken: string): Promise<ExchangeResult | null>;
}
