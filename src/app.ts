import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { createReadStream, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerRoutes } from "./api/routes.js";
import { loadConfig } from "./config.js";
import { GscTokenStore } from "./auth/gsc-token-store.js";
import { GscServiceAuth } from "./auth/gsc-service-auth.js";
import { createLoginGatewayAuth } from "./login-gateway/fastify-login-auth.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export async function buildApp() {
  const config = loadConfig();
  const gscTokenStore = new GscTokenStore(config.tokensPath);
  const gscAuth = new GscServiceAuth(config, gscTokenStore);
  const loginAuth = createLoginGatewayAuth({
    loginGatewayUrl: config.loginGatewayUrl,
    sessionSecret: config.sessionSecret,
    publicBaseUrl: config.publicBaseUrl,
    cookieName: "bm_session",
  });

  const app = Fastify({ logger: !process.env.VERCEL });
  const publicRoot = process.env.VERCEL
    ? resolve(process.cwd(), "public")
    : resolve(__dirname, "../public");
  // Outside public/ so Vercel does not serve the app shell as a static file (SSO bypass).
  const uiRoot = process.env.VERCEL
    ? resolve(process.cwd(), "ui")
    : resolve(__dirname, "../ui");

  await app.register(cors, { origin: true, credentials: true });
  await app.register(cookie);

  await loginAuth.registerAuthRoutes(app);

  app.get("/", async (req, reply) => {
    if (!loginAuth.getSession(req)) {
      return reply.redirect("/login.html");
    }
    const indexHtml = resolve(uiRoot, "index.html");
    if (!existsSync(indexHtml)) {
      return reply.status(404).send({ error: "index.html not found" });
    }
    reply.type("text/html; charset=utf-8");
    return reply.send(createReadStream(indexHtml));
  });

  await registerRoutes(app, {
    config,
    gscAuth,
    requireUser: loginAuth.requireUser,
    getSession: loginAuth.getSession,
  });

  await app.register(fastifyStatic, {
    root: publicRoot,
    prefix: "/",
  });

  return app;
}
