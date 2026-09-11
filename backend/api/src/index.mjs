import { Pool } from "pg";
import { createAppDataRepository } from "./app-data-repository.mjs";
import { createAuthRepository } from "./auth-repository.mjs";
import { createAuthService } from "./auth-service.mjs";
import { createCatalogRepository } from "./catalog-repository.mjs";
import { loadConfig } from "./config.mjs";
import { createHttpServer } from "./http-server.mjs";

const config = loadConfig();
const pool = new Pool(config.database);
const repository = {
  ...createCatalogRepository(pool),
  ...createAppDataRepository(pool),
};
const authRepository = createAuthRepository(pool);
const authService = createAuthService(authRepository, config.auth);
let cleanupRunning;
const cleanExpired = () => {
  if (cleanupRunning) return;
  cleanupRunning = authRepository
    .cleanExpired()
    .catch((error) =>
      console.error("Authentication expiry cleanup failed", error),
    )
    .finally(() => {
      cleanupRunning = null;
    });
};
const cleanupTimer = setInterval(cleanExpired, 60_000);
cleanupTimer.unref();
cleanExpired();
const server = createHttpServer(repository, authService, {
  allowedOrigin: config.auth.origin,
});
const developmentServer = config.developmentPort
  ? createHttpServer(repository, authService, { authenticationBypass: true })
  : null;

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error", error);
});

server.listen(config.port, config.host, () => {
  console.log(`Done-ish API listening on http://${config.host}:${config.port}`);
});
developmentServer?.listen(config.developmentPort, config.host, () => {
  console.log(
    `Done-ish development API listening on http://${config.host}:${config.developmentPort}`,
  );
});

function closeServer(target) {
  return new Promise((resolve, reject) =>
    target.close((error) => (error ? reject(error) : resolve())),
  );
}

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down`);
  try {
    clearInterval(cleanupTimer);
    await cleanupRunning;
    await Promise.all([
      closeServer(server),
      ...(developmentServer ? [closeServer(developmentServer)] : []),
    ]);
    await pool.end();
  } catch (error) {
    console.error("HTTP server shutdown failed", error);
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
