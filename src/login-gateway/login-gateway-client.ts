import { createHmac, timingSafeEqual } from "node:crypto";

export interface LoginGatewayClientOptions {
  baseUrl: string;
  sessionSecret: string;
}

export interface ExchangeResult {
  sessionToken: string;
  user: {
    email: string;
    name: string | null;
    picture: string | null;
  };
}

export interface UserSession {
  email: string;
  name?: string;
  picture?: string;
  exp: number;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function buildLoginStartUrl(
  gatewayBaseUrl: string,
  returnTo: string,
): string {
  const url = new URL("/auth/start", gatewayBaseUrl);
  url.searchParams.set("return_to", returnTo);
  return url.toString();
}

export function parseSessionToken(
  token: string | undefined,
  secret: string,
): UserSession | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  if (!safeEqual(sign(payload, secret), signature)) return null;
  try {
    const session = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf-8"),
    ) as UserSession;
    if (!session.email || typeof session.exp !== "number") return null;
    if (session.exp < Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

export class LoginGatewayClient {
  constructor(private readonly options: LoginGatewayClientOptions) {}

  getStartUrl(returnTo: string): string {
    return buildLoginStartUrl(this.options.baseUrl, returnTo);
  }

  verifySessionToken(token: string | undefined): UserSession | null {
    return parseSessionToken(token, this.options.sessionSecret);
  }

  async exchangeLoginCode(loginCode: string): Promise<ExchangeResult> {
    const response = await fetch(
      `${this.options.baseUrl.replace(/\/$/, "")}/auth/exchange`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login_code: loginCode }),
      },
    );
    const body = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!response.ok) {
      throw new Error(
        typeof body.error === "string"
          ? body.error
          : `Login Gateway exchange failed (${response.status})`,
      );
    }
    return body as unknown as ExchangeResult;
  }
}

export function getLoginGatewayEnv() {
  const baseUrl = (
    process.env.LOGIN_GATEWAY_URL ?? "http://127.0.0.1:3400"
  ).replace(/\/$/, "");
  const sessionSecret = process.env.SESSION_SECRET ?? "";
  const publicBaseUrl = (
    process.env.PUBLIC_BASE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null) ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    "http://127.0.0.1:3000"
  ).replace(/\/$/, "");

  if (!sessionSecret && process.env.VERCEL) {
    throw new Error("SESSION_SECRET is required");
  }

  return { baseUrl, sessionSecret, publicBaseUrl };
}
