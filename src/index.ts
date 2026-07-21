import "dotenv/config";
import { buildApp } from "./app.js";

async function main() {
  const config = (await import("./config.js")).loadConfig();
  const app = await buildApp();
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`Brand Monitoring: http://${config.host}:${config.port}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
