import { Pool } from "pg";
import { createAppDataRepository } from "./app-data-repository.mjs";
import { createCatalogRepository } from "./catalog-repository.mjs";
import { loadConfig } from "./config.mjs";
import { createHttpServer } from "./http-server.mjs";

const config = loadConfig();
const pool = new Pool(config.database);
const repository = {
  ...createCatalogRepository(pool),
  ...createAppDataRepository(pool),
};
const server = createHttpServer(repository);

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error", error);
});

server.listen(config.port, config.host, () => {
  console.log(`Done-ish API listening on http://${config.host}:${config.port}`);
});

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down`);
  server.close(async (error) => {
    await pool.end();
    if (error) {
      console.error("HTTP server shutdown failed", error);
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
