import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * Drizzle owns `app_user` and `meeting_note`. The `corsair_*` tables are Corsair's
 * and are created by `scripts/init-corsair-schema.ts`, so they are deliberately out
 * of scope — pointing drizzle-kit at them would make it offer to drop tables it has
 * no schema definition for.
 *
 * Every Drizzle-owned table must be listed in `tablesFilter`. A table defined in
 * the schema but missing from the filter is invisible during introspection, so
 * drizzle-kit concludes it does not exist and tries to CREATE it on every push.
 */
export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  tablesFilter: ["app_user", "meeting_note", "sync_restore_buffer"],
});
