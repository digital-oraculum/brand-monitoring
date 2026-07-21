import { google } from "googleapis";
import type { AppConfig } from "../config.js";
import { GscTokenStore } from "./gsc-token-store.js";

/** Stałe poświadczenia GSC (serwer) — niezależne od logowania użytkowników. */
export class GscServiceAuth {
  private readonly oauth2Client;

  constructor(
    private readonly config: AppConfig,
    private readonly tokenStore: GscTokenStore,
  ) {
    this.oauth2Client = new google.auth.OAuth2(
      config.googleClientId,
      config.googleClientSecret,
      config.googleRedirectUri,
    );
  }

  isConfigured(): boolean {
    return this.tokenStore.isAuthenticated();
  }

  getAuthenticatedClient() {
    const stored = this.tokenStore.load();
    if (!stored?.refreshToken) {
      return null;
    }

    this.oauth2Client.setCredentials({
      access_token: stored.accessToken,
      refresh_token: stored.refreshToken,
      expiry_date: stored.expiryDate ?? undefined,
    });

    this.oauth2Client.on("tokens", (tokens) => {
      const current = this.tokenStore.load();
      if (!current) return;

      this.tokenStore.save({
        ...current,
        accessToken: tokens.access_token ?? current.accessToken,
        refreshToken: tokens.refresh_token ?? current.refreshToken,
        expiryDate: tokens.expiry_date ?? current.expiryDate,
        updatedAt: new Date().toISOString(),
      });
    });

    return this.oauth2Client;
  }
}
