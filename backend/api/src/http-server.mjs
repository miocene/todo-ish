import { createServer } from "node:http";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const MAX_OFFSET = 1_000_000;
const MAX_QUERY_LENGTH = 100;

class RequestError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function integerParameter(searchParams, name, fallback, minimum, maximum) {
  const value = searchParams.get(name);
  if (value === null || value === "") return fallback;
  if (!/^\d+$/.test(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new RequestError(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return Number(value);
}

function textParameter(searchParams, name) {
  const value = searchParams.get(name)?.trim() || "";
  if (value.length > MAX_QUERY_LENGTH) {
    throw new RequestError(`${name} must be at most ${MAX_QUERY_LENGTH} characters`);
  }
  return value;
}

function pagination(searchParams) {
  return {
    limit: integerParameter(searchParams, "limit", DEFAULT_LIMIT, 1, MAX_LIMIT),
    offset: integerParameter(searchParams, "offset", 0, 0, MAX_OFFSET),
    query: textParameter(searchParams, "q"),
  };
}

function writeJson(response, statusCode, body, cacheControl = "no-store") {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "cache-control": cacheControl,
    "content-length": Buffer.byteLength(payload),
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  });
  response.end(payload);
}

export function createCatalogHttpServer(repository, logger = console) {
  const server = createServer(async (request, response) => {
    const method = request.method || "GET";

    try {
      if (method !== "GET" && method !== "HEAD") {
        response.setHeader("allow", "GET, HEAD");
        throw new RequestError("Method not allowed", 405);
      }

      const url = new URL(request.url || "/", "http://localhost");
      let body;
      let cacheControl = "no-store";

      if (url.pathname === "/healthz") {
        body = await repository.health();
      } else if (url.pathname === "/api/catalogs") {
        body = await repository.summary();
        cacheControl = "private, max-age=60";
      } else if (url.pathname === "/api/catalogs/filaments") {
        body = await repository.filaments({
          ...pagination(url.searchParams),
          family: textParameter(url.searchParams, "family"),
        });
        cacheControl = "private, max-age=60";
      } else if (url.pathname === "/api/catalogs/floss") {
        body = await repository.floss(pagination(url.searchParams));
        cacheControl = "private, max-age=60";
      } else {
        throw new RequestError("Not found", 404);
      }

      if (method === "HEAD") {
        response.writeHead(200, {
          "cache-control": cacheControl,
          "content-type": "application/json; charset=utf-8",
          "x-content-type-options": "nosniff",
        });
        response.end();
        return;
      }

      writeJson(response, 200, body, cacheControl);
    } catch (error) {
      const statusCode = error instanceof RequestError ? error.statusCode : 500;
      if (statusCode === 500) {
        logger.error({ error, method, path: request.url }, "Catalog API request failed");
      }
      writeJson(response, statusCode, {
        error: statusCode === 500 ? "Internal server error" : error.message,
      });
    }
  });

  server.headersTimeout = 5000;
  server.keepAliveTimeout = 5000;
  server.requestTimeout = 10000;

  return server;
}
