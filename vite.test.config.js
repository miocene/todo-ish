import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// Browser tests use their API fixture, never local environment files or a backend proxy.
export default defineConfig({
  envFile: false,
  base: "/",
  plugins: [vue()],
  define: {
    "import.meta.env.VITE_API_ORIGIN": JSON.stringify(""),
    "import.meta.env.VITE_DEMO_DATA": JSON.stringify("true"),
  },
  optimizeDeps: { include: ["vue", "vue-router", "webauthn-polyfills"] },
  server: {
    warmup: { clientFiles: ["./index.html", "./src/pages/*.vue"] },
  },
});
