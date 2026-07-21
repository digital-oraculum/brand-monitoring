import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerRoutes } from "./api/routes.js";
import { loadConfig } from "./config.js";
import { UserGoogleAuth } from "./auth/user-google-auth.js";
import { GscTokenStore } from "./auth/gsc-token-store.js";
import { GscServiceAuth } from "./auth/gsc-service-auth.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export async function buildApp() {
  const config = loadConfig();
  const gscTokenStore = new GscTokenStore(config.tokensPath);
  const userAuth = new UserGoogleAuth(config);
  const gscAuth = new GscServiceAuth(config, gscTokenStore);

  const app = Fastify({ logger: !process.env.VERCEL });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(cookie);
  await registerRoutes(app, { config, userAuth, gscAuth });

  const publicRoot = process.env.VERCEL
    ? resolve(process.cwd(), "public")
    : resolve(__dirname, "../public");

  await app.register(fastifyStatic, {
    root: publicRoot,
    prefix: "/",
  });

  return app;
}
