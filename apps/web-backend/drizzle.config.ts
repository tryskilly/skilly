import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl ?? "postgresql://localhost/skilly_web_dev",
  },
  strict: true,
  verbose: true,
});
