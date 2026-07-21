import { resolve } from "node:path";
import { randomBytes } from "node:crypto";

export interface AppConfig {
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  sessionSecret: string;
  allowedEmails: string[];
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

  const sessionSecret =
    process.env.SESSION_SECRET ??
    (process.env.VERCEL ? "" : randomBytes(32).toString("hex"));

  if (!sessionSecret) {
    throw new Error("SESSION_SECRET jest wymagany na produkcji (Vercel)");
  }

  const port = Number(process.env.PORT ?? 3300);
  const host = process.env.HOST ?? "127.0.0.1";

  return {
    googleClientId,
    googleClientSecret,
    googleRedirectUri:
      process.env.GOOGLE_REDIRECT_URI ??
      `http://${host}:${port}/auth/callback`,
    sessionSecret,
    allowedEmails: (process.env.ALLOWED_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    port,
    host,
    tokensPath: resolve(process.env.DATA_PATH ?? "./data/tokens.json"),
    wskzDomains: (process.env.WSKZ_DOMAINS ?? "wskz.pl,studia-online.pl,studia-pedagogiczne.pl,studia-wroclaw.pl")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
