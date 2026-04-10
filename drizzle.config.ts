import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set. Did you run via `doppler run`?");
}

// pg driver hangs indefinitely with channel_binding=require — strip it.
const url = process.env.DATABASE_URL.replace(/[&?]channel_binding=require/, "");

export default defineConfig({
  schema: "./shared/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  verbose: true,
  strict: true,
});
