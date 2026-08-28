import { createServer } from "node:http";
import { AppDataRevisionConflictError } from "./app-data-repository.mjs";
import { AppDataValidationError, isAppDataResource, validateAppDataResource } from "./app-data-validation.mjs";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const MAX_OFFSET = 1_000_000;
const MAX_QUERY_LENGTH = 100;
const MAX_BODY_BYTES = 1_000_000;

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

function writeJson(response, statusCode, body, cacheControl = "no-store", headers = {}) {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "cache-control": cacheControl,
    "content-length": Buffer.byteLength(payload),
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    ...headers,
  });
  response.end(payload);
}

function requireMethod(method, allowedMethods) {
  if (allowedMethods.includes(method)) return;
  const error = new RequestError("Method not allowed", 405);
  error.allowedMethods = allowedMethods;
  throw error;
}

function expectedRevision(request) {
  const value = request.headers["if-match"];
  if (typeof value !== "string") throw new RequestError("If-Match is required", 428);
  const match = /^"(\d+)"$/.exec(value.trim());
  if (!match || Number(match[1]) > 2_147_483_646) {
    throw new RequestError('If-Match must contain a revision such as "0"');
  }
  return Number(match[1]);
}

async function readJson(request) {
  const contentType = request.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") throw new RequestError("Content-Type must be application/json", 415);
  const declaredLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new RequestError("Request body is too large", 413);
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new RequestError("Request body is too large", 413);
    chunks.push(chunk);
  }
  if (size === 0) throw new RequestError("Request body is required");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestError("Request body must contain valid JSON");
  }
}

export function createHttpServer(repository, logger = console) {
  const server = createServer(async (request, response) => {
    const method = request.method || "GET";

    try {
      const url = new URL(request.url || "/", "http://localhost");
      let body;
      let cacheControl = "no-store";
      let headers = {};

      if (url.pathname === "/healthz") {
        requireMethod(method, ["GET", "HEAD"]);
        body = await repository.health();
      } else if (url.pathname === "/api/catalogs") {
        requireMethod(method, ["GET", "HEAD"]);
        body = await repository.summary();
        cacheControl = "private, max-age=60";
      } else if (url.pathname === "/api/catalogs/filaments") {
        requireMethod(method, ["GET", "HEAD"]);
        body = await repository.filaments({
          ...pagination(url.searchParams),
          family: textParameter(url.searchParams, "family"),
        });
        cacheControl = "private, max-age=60";
      } else if (url.pathname === "/api/catalogs/floss") {
        requireMethod(method, ["GET", "HEAD"]);
        body = await repository.floss(pagination(url.searchParams));
        cacheControl = "private, max-age=60";
      } else if (url.pathname === "/api/data") {
        requireMethod(method, ["GET", "HEAD"]);
        body = await repository.read();
      } else {
        const resourceMatch = /^\/api\/data\/([a-z-]+)$/.exec(url.pathname);
        if (!resourceMatch || !isAppDataResource(resourceMatch[1])) throw new RequestError("Not found", 404);
        requireMethod(method, ["PUT"]);
        const resource = resourceMatch[1];
        const data = validateAppDataResource(resource, await readJson(request));
        const revision = await repository.replace(resource, data, expectedRevision(request));
        body = { resource, revision };
        headers = { etag: `"${revision}"` };
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

      writeJson(response, 200, body, cacheControl, headers);
    } catch (error) {
      const statusCode =
        error instanceof RequestError
          ? error.statusCode
          : error instanceof AppDataValidationError
            ? 400
            : error instanceof AppDataRevisionConflictError
              ? 409
              : 500;
      if (error instanceof RequestError && error.allowedMethods) {
        response.setHeader("allow", error.allowedMethods.join(", "));
      }
      if (statusCode === 500) {
        logger.error({ error, method, path: request.url }, "API request failed");
      }
      writeJson(
        response,
        statusCode,
        error instanceof AppDataRevisionConflictError
          ? { error: error.message, currentRevision: error.currentRevision }
          : { error: statusCode === 500 ? "Internal server error" : error.message },
      );
    }
  });

  server.headersTimeout = 5000;
  server.keepAliveTimeout = 5000;
  server.requestTimeout = 10000;

  return server;
}
