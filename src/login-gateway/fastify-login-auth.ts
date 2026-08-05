/**
 * Shared Fastify helpers for SEO/GEO Login Gateway SSO.
 * Copy into consuming apps (or import from a package later).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  LoginGatewayClient,
  SESSION_MAX_AGE_SEC,
  createPkcePair,
  getPkceCookieName,
  parseSessionToken,
  type UserSession,
} from "./login-gateway-client.js";

export interface LoginGatewayAuthOptions {
  loginGatewayUrl: string;
  sessionSecret: string;
  publicBaseUrl: string;
  /** httpOnly cookie name for this app */
  cookieName: string;
  sessionMaxAgeSec?: number;
}

export function createLoginGatewayAuth(options: LoginGatewayAuthOptions) {
  const maxAge = options.sessionMaxAgeSec ?? SESSION_MAX_AGE_SEC;
  const client = new LoginGatewayClient({
    baseUrl: options.loginGatewayUrl,
    sessionSecret: options.sessionSecret,
  });
  const audience = new URL(options.publicBaseUrl).origin;

  function cookieOptions() {
    return {
      httpOnly: true,
      secure: Boolean(process.env.VERCEL),
      sameSite: "lax" as const,
      path: "/",
      maxAge,
    };
  }

  function pkceCookieOptions() {
    return {
      httpOnly: true,
      secure: Boolean(process.env.VERCEL),
      sameSite: "lax" as const,
      path: "/",
      maxAge: 15 * 60,
    };
  }

  function getSession(req: FastifyRequest): UserSession | null {
    const token = req.cookies?.[options.cookieName];
    return parseSessionToken(token, options.sessionSecret);
  }

  async function requireUser(req: FastifyRequest, reply: FastifyReply) {
    const session = getSession(req);
    if (!session) {
      return reply.status(401).send({ error: "Wymagane logowanie" });
    }
    (req as FastifyRequest & { userSession?: UserSession }).userSession =
      session;
  }

  async function registerAuthRoutes(app: FastifyInstance) {
    app.get("/api/auth/status", async (req) => {
      const session = getSession(req);
      return {
        authenticated: Boolean(session),
        email: session?.email ?? null,
      };
    });

    app.get("/auth/google", async (_req, reply) => {
      const { verifier, challenge } = createPkcePair();
      reply.setCookie(getPkceCookieName(), verifier, pkceCookieOptions());
      const returnTo = `${options.publicBaseUrl}/auth/complete`;
      return reply.redirect(client.getStartUrl(returnTo, challenge));
    });

    app.get("/auth/complete", async (req, reply) => {
      const query = req.query as { login_code?: string; error?: string };
      if (query.error) {
        return reply.redirect(
          `/login.html?error=${encodeURIComponent(query.error)}`,
        );
      }
      if (!query.login_code) {
        return reply.redirect("/login.html?error=missing_code");
      }

      const verifier = req.cookies?.[getPkceCookieName()];
      if (!verifier) {
        return reply.redirect("/login.html?error=missing_pkce");
      }

      try {
        const result = await client.exchangeLoginCode(
          query.login_code,
          audience,
          verifier,
        );
        const sessionToken = client.mintSessionToken(result.user);
        reply.clearCookie(getPkceCookieName(), { path: "/" });
        reply.setCookie(options.cookieName, sessionToken, cookieOptions());
        return reply.redirect("/");
      } catch (error) {
        req.log?.error(error);
        reply.clearCookie(getPkceCookieName(), { path: "/" });
        return reply.redirect("/login.html?error=auth_failed");
      }
    });

    app.post("/auth/logout", async (_req, reply) => {
      reply.clearCookie(options.cookieName, { path: "/" });
      return { ok: true };
    });
  }

  return {
    client,
    getSession,
    requireUser,
    registerAuthRoutes,
    cookieName: options.cookieName,
  };
}
