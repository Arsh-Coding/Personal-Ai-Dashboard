import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "@/server/pg";
import * as schema from "./schema";

/** Shares the single Postgres client with Corsair — see `src/server/pg.ts`. */
export const db = drizzle(sql, { schema });
