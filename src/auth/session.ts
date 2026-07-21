import { createHmac, timingSafeEqual } from "node:crypto";

export interface UserSession {
  email: string;
  name?: string;
  picture?: string;
  exp: number;
}

const SESSION_COOKIE = "bm_session";
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 dni

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function createSessionToken(
  user: Omit<UserSession, "exp">,
  secret: string,
): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC;
  const payload = Buffer.from(
    JSON.stringify({ ...user, exp } satisfies UserSession),
  ).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
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

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: Boolean(process.env.VERCEL),
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  };
}

export function getSessionCookieName(): string {
  return SESSION_COOKIE;
}
