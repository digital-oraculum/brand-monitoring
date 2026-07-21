import { resolve } from "node:path";

export interface AppConfig {
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  port: number;
  host: string;
  tokensPath: string;
  wskzDomains: string[];
}

export function loadConfig(): AppConfig {
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!googleClientId || !googleClientSecret) {
    throw new Error("GOOGLE_CLIENT_ID i GOOGLE_CLIENT_SECRET są wymagane");
  }

  const port = Number(process.env.PORT ?? 3300);
  const host = process.env.HOST ?? "127.0.0.1";

  return {
    googleClientId,
    googleClientSecret,
    googleRedirectUri:
      process.env.GOOGLE_REDIRECT_URI ??
      `http://${host}:${port}/auth/callback`,
    port,
    host,
    tokensPath: resolve(process.env.DATA_PATH ?? "./data/tokens.json"),
    wskzDomains: (process.env.WSKZ_DOMAINS ?? "wskz.pl,studia-online.pl,studia-pedagogiczne.pl,studia-wroclaw.pl")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
