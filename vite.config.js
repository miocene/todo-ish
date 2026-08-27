import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";

function appBasePath(value = "/") {
  const path = value.trim() || "/";
  if (!path.startsWith("/") || !path.endsWith("/")) {
    throw new Error("VITE_BASE_PATH must start and end with a slash");
  }
  return path;
}

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "");
  const catalogApiTarget = environment.CATALOG_API_PROXY_TARGET || "http://127.0.0.1:3000";
  const proxy = { "/api": { target: catalogApiTarget } };

  return {
    base: appBasePath(environment.VITE_BASE_PATH),
    plugins: [vue()],
    server: { proxy, strictPort: true },
    preview: { proxy, strictPort: true },
  };
});
