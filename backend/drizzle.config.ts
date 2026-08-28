import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./backend/database/schema/**/*.ts",
  out: "./backend/database/migrations",
});
