/**
 * Renames the original single-tenant Corsair account rows from 'default' to a
 * named tenant, so multiple Google accounts can coexist.
 *
 * Safe to re-run: it only acts if a 'default' account row is still present, and
 * it never deletes anything. `tenant_id` is only a lookup key — the account DEK
 * is encrypted with the KEK alone and field values with the DEK, so renaming a
 * tenant does not affect decryption. Entities hang off `account_id`, which is
 * untouched, so synced data follows the account automatically.
 *
 *   node migrate-tenants.js [targetTenantId]   # defaults to 'personal'
 */
const Database = require('better-sqlite3');

const target = process.argv[2] ?? 'personal';
const db = new Database('corsair.db');

const before = db
    .prepare('SELECT tenant_id, COUNT(*) c FROM corsair_accounts GROUP BY tenant_id')
    .all();
console.log('Tenants before:', before.map((r) => `${r.tenant_id}(${r.c})`).join(', ') || '(none)');

const clash = db
    .prepare('SELECT COUNT(*) c FROM corsair_accounts WHERE tenant_id = ?')
    .get(target).c;
const pending = db
    .prepare("SELECT COUNT(*) c FROM corsair_accounts WHERE tenant_id = 'default'")
    .get().c;

if (pending === 0) {
    console.log(`Nothing to do — no 'default' account rows remain.`);
} else if (clash > 0) {
    console.error(
        `Refusing to migrate: '${target}' already has ${clash} account row(s).\n` +
        `Merging two tenants would orphan credentials. Pick another target id.`,
    );
    process.exitCode = 1;
} else {
    const res = db
        .prepare("UPDATE corsair_accounts SET tenant_id = ? WHERE tenant_id = 'default'")
        .run(target);
    console.log(`Renamed ${res.changes} account row(s): 'default' -> '${target}'`);
}

const after = db
    .prepare('SELECT tenant_id, COUNT(*) c FROM corsair_accounts GROUP BY tenant_id')
    .all();
console.log('Tenants after :', after.map((r) => `${r.tenant_id}(${r.c})`).join(', ') || '(none)');
console.log('Entities preserved:', db.prepare('SELECT COUNT(*) c FROM corsair_entities').get().c);
db.close();
