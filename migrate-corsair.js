const Database = require('better-sqlite3');
const fs = require('fs');

// Delete old corsair.db to start fresh
try { fs.unlinkSync('corsair.db'); } catch (e) {}

const db = new Database('corsair.db');
const migration = fs.readFileSync('migration.sql', 'utf8');

db.exec(migration);
console.log('Corsair migration successful — tables created:');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
tables.forEach(t => console.log('  ✓', t.name));
db.close();
