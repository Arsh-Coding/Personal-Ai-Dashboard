import "dotenv/config";
import postgres from "postgres";

/**
 * The one Postgres connection this process makes, shared by Corsair and Drizzle.
 *
 * Both need a client and both can have the same one: Corsair accepts a postgres-js
 * `Sql` instance directly (its `CorsairDatabaseInput` is
 * `Pool | BetterSqlite3Database | Sql | Kysely`, and it already bundles
 * `kysely-postgres-js`), and Drizzle has a `postgres-js` adapter. Giving them
 * separate clients would double the connection count for no benefit, which matters
 * on Neon's free tier.
 */

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env and fill in the Neon " +
      "connection string (including the password).",
  );
}

/**
 * Neon's pooled endpoint is PgBouncer in transaction mode, which cannot hold
 * server-side prepared statements across checkouts — leaving postgres-js's default
 * `prepare: true` on produces intermittent "prepared statement already exists"
 * errors under concurrency rather than a clean failure at startup.
 *
 * `max` is small because Neon's pooler is doing the real pooling, but not 1: at one
 * connection every query in a request serialises, and the places that deliberately
 * fan out stop doing so. `auth.myStatus` showed this worst — it reads four key
 * fields for each of three plugins in `Promise.all`, and at `max: 1` those twelve
 * reads queued at ~266ms each before it even reached Google.
 *
 * TLS is set here rather than left to the URL's `sslmode`/`channel_binding` query
 * params: postgres-js forwards unrecognised params to the server as startup options,
 * and `channel_binding` is a libpq client-side setting the server does not know, so
 * passing the raw Neon URL through verbatim risks being rejected. Stripping the
 * query string and stating the TLS requirement explicitly is deterministic.
 */
function createClient() {
  const url = new URL(connectionString!);
  const requiresTls =
    url.searchParams.get("sslmode") !== "disable" &&
    !url.hostname.startsWith("localhost") &&
    url.hostname !== "127.0.0.1";
  url.search = "";

  return postgres(url.toString(), {
    ssl: requiresTls ? "require" : false,
    prepare: false,
    max: 8,
    idle_timeout: 20,
    connect_timeout: 15,
  });
}

/**
 * Cached across hot reloads. Next.js re-evaluates server modules on every edit in
 * dev, so without this each save would leak another connection until Neon started
 * refusing them.
 */
const globalForPg = globalThis as unknown as {
  corsairPg?: ReturnType<typeof createClient>;
};

export const sql = globalForPg.corsairPg ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPg.corsairPg = sql;
}
