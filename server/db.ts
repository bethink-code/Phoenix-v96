import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set. Run via `doppler run`.");
}

// Strip channel_binding if someone missed stripping it in Doppler — belt & braces.
const connectionString = process.env.DATABASE_URL.replace(
  /[&?]channel_binding=require/,
  ""
);

export const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 10,
});

export const db = drizzle(pool, { schema });
