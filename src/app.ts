import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerRoutes } from "./api/routes.js";
import { loadConfig } from "./config.js";
import { GoogleOAuth } from "./auth/google-oauth.js";
import { TokenStore } from "./auth/token-store.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export async function buildApp() {
  const config = loadConfig();
  const tokenStore = new TokenStore(config.tokensPath);
  const oauth = new GoogleOAuth(config, tokenStore);

  const app = Fastify({ logger: !process.env.VERCEL });

  await app.register(cors, { origin: true });
  await registerRoutes(app, { config, oauth, tokenStore });

  const publicRoot = process.env.VERCEL
    ? resolve(process.cwd(), "public")
    : resolve(__dirname, "../public");

  await app.register(fastifyStatic, {
    root: publicRoot,
    prefix: "/",
  });

  return app;
}
