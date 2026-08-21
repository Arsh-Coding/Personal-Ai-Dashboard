/** Throwaway: does a brand-new tenant id need registering before consent? */
import 'dotenv/config';
import Database from 'better-sqlite3';
import { createCorsair } from 'corsair';
import { generateOAuthUrl } from 'corsair/oauth';
import { googlecalendar } from '@corsair-dev/googlecalendar';
import { gmail } from '@corsair-dev/gmail';
import { googlemeet } from '@corsair-dev/googlemeet';

const db = new Database('corsair.db');
const corsair = createCorsair({
  plugins: [googlecalendar(), gmail(), googlemeet()],
  database: db,
  kek: process.env.CORSAIR_KEK,
  multiTenancy: true,
});

console.log('manage.tenants.list():');
console.log(JSON.stringify(await corsair.manage.tenants.list(), null, 2));

// A tenant id that appears nowhere in the database.
const NEW_TENANT = 'probe_unregistered_tenant';
try {
  const { url } = await generateOAuthUrl(corsair, 'gmail', {
    tenantId: NEW_TENANT,
    redirectUri: 'http://localhost:3000/oauth/callback',
  });
  const u = new URL(url);
  console.log(`\ngenerateOAuthUrl for unregistered "${NEW_TENANT}": OK`);
  console.log('  host      :', u.host + u.pathname);
  console.log('  client_id :', u.searchParams.get('client_id')?.slice(0, 18) + '...');
  console.log('  scope     :', u.searchParams.get('scope'));
  console.log('  state len :', u.searchParams.get('state')?.length);
} catch (e) {
  console.log(`\ngenerateOAuthUrl for unregistered "${NEW_TENANT}": FAILED -> ${e?.message}`);
}

console.log('\ncorsair_accounts rows by tenant:');
for (const r of db
  .prepare('SELECT tenant_id, COUNT(*) c FROM corsair_accounts GROUP BY tenant_id')
  .all()) {
  console.log(`  ${r.tenant_id}: ${r.c}`);
}

console.log('\nscopes requested per plugin:');
for (const f of [gmail, googlecalendar, googlemeet]) {
  const d = f();
  console.log(`  ${d.id}:`);
  for (const s of d.oauthConfig.scopes) console.log(`    ${s}`);
}

db.close();
