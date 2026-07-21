let appPromise = null;

async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      const { buildApp } = await import("../dist/app.js");
      const app = await buildApp();
      await app.ready();
      return app;
    })();
  }
  return appPromise;
}

export default async function handler(req, res) {
  const app = await getApp();
  app.server.emit("request", req, res);
}
