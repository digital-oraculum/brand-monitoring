import { google } from "googleapis";
import type { AppConfig } from "../config.js";
import { TokenStore } from "./token-store.js";
import type { StoredTokens } from "../types.js";

const SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"];

export class GoogleOAuth {
  private readonly oauth2Client;

  constructor(
    private readonly config: AppConfig,
    private readonly tokenStore: TokenStore,
  ) {
    this.oauth2Client = new google.auth.OAuth2(
      config.googleClientId,
      config.googleClientSecret,
      config.googleRedirectUri,
    );
  }

  getAuthUrl(): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: SCOPES,
    });
  }

  async handleCallback(code: string): Promise<StoredTokens> {
    const { tokens } = await this.oauth2Client.getToken(code);

    const stored: StoredTokens = {
      accessToken: tokens.access_token ?? "",
      refreshToken: tokens.refresh_token ?? "",
      expiryDate: tokens.expiry_date ?? null,
      updatedAt: new Date().toISOString(),
    };

    this.oauth2Client.setCredentials(tokens);

    try {
      const oauth2 = google.oauth2({ version: "v2", auth: this.oauth2Client });
      const userInfo = await oauth2.userinfo.get();
      stored.email = userInfo.data.email ?? undefined;
    } catch {
      // email is optional
    }

    this.tokenStore.save(stored);
    return stored;
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

  logout(): void {
    this.tokenStore.clear();
  }
}
