CREATE TABLE IF NOT EXISTS corsair_integrations (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    name TEXT NOT NULL,
    config TEXT,
    dek TEXT
);

CREATE TABLE IF NOT EXISTS corsair_accounts (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    tenant_id TEXT NOT NULL,
    integration_id TEXT NOT NULL,
    config TEXT,
    dek TEXT,
    FOREIGN KEY(integration_id) REFERENCES corsair_integrations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS corsair_entities (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    account_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT '1',
    data TEXT,
    FOREIGN KEY(account_id) REFERENCES corsair_accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS corsair_events (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    account_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload TEXT,
    status TEXT DEFAULT 'pending',
    FOREIGN KEY(account_id) REFERENCES corsair_accounts(id) ON DELETE CASCADE
);
