import { google } from "googleapis";
import type { AppConfig } from "../config.js";

const USER_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

export interface GoogleUserProfile {
  email: string;
  name?: string;
  picture?: string;
}

export class UserGoogleAuth {
  private readonly oauth2Client;

  constructor(private readonly config: AppConfig) {
    this.oauth2Client = new google.auth.OAuth2(
      config.googleClientId,
      config.googleClientSecret,
      config.googleRedirectUri,
    );
  }

  getAuthUrl(): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: "online",
      prompt: "select_account",
      scope: USER_SCOPES,
    });
  }

  async handleCallback(code: string): Promise<GoogleUserProfile> {
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: "v2", auth: this.oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;

    if (!email) {
      throw new Error("Nie udało się odczytać adresu e-mail z konta Google");
    }

    return {
      email,
      name: userInfo.data.name ?? undefined,
      picture: userInfo.data.picture ?? undefined,
    };
  }

  isEmailAllowed(email: string): boolean {
    const allowed = this.config.allowedEmails;
    if (!allowed.length) return true;
    return allowed.includes(email.toLowerCase());
  }
}
