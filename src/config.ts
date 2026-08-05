import { resolve } from "node:path";
import { randomBytes } from "node:crypto";

export interface AppConfig {
  /** OAuth client for GSC server credentials (osobny projekt GCP / ten sam co GSC). */
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  /** Wspólny z SEO/GEO Login Gateway. */
  sessionSecret: string;
  /** Base URL Login Gateway, np. http://127.0.0.1:3400 */
  loginGatewayUrl: string;
  /** Publiczny origin tej appki (do return_to). */
  publicBaseUrl: string;
  port: number;
  host: string;
  tokensPath: string;
  wskzDomains: string[];
}

export function loadConfig(): AppConfig {
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!googleClientId || !googleClientSecret) {
    throw new Error(
      "GOOGLE_CLIENT_ID i GOOGLE_CLIENT_SECRET są wymagane (GSC service auth)",
    );
  }

  const sessionSecret =
    process.env.SESSION_SECRET ??
    (process.env.VERCEL ? "" : randomBytes(32).toString("hex"));

  if (!sessionSecret) {
    throw new Error("SESSION_SECRET jest wymagany na produkcji (Vercel)");
  }

  const loginGatewayUrl = (
    process.env.LOGIN_GATEWAY_URL ?? "http://127.0.0.1:3400"
  ).replace(/\/$/, "");

  const port = Number(process.env.PORT ?? 3300);
  const host = process.env.HOST ?? "127.0.0.1";

  const publicBaseUrl = (
    process.env.PUBLIC_BASE_URL ?? `http://${host}:${port}`
  ).replace(/\/$/, "");

  return {
    googleClientId,
    googleClientSecret,
    googleRedirectUri:
      process.env.GOOGLE_REDIRECT_URI ??
      `http://${host}:${port}/auth/callback`,
    sessionSecret,
    loginGatewayUrl,
    publicBaseUrl,
    port,
    host,
    tokensPath: resolve(process.env.DATA_PATH ?? "./data/tokens.json"),
    wskzDomains: (
      process.env.WSKZ_DOMAINS ??
      "wskz.pl,studia-online.pl,studia-pedagogiczne.pl,studia-wroclaw.pl"
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
