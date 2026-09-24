use tauri_plugin_sql::{Migration, MigrationKind};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: r#"
-- categories
CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'IN', 'OUT', 'BOTH'
    color TEXT,
    icon TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- entities
CREATE TABLE entities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'Customer', 'Supplier', 'Employee', 'Transporter', 'Other'
    phone TEXT,
    address TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- products
CREATE TABLE products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    description TEXT,
    unit TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- transactions
CREATE TABLE transactions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL, -- 'IN', 'OUT'
    amount REAL NOT NULL,
    date DATETIME NOT NULL,
    category_id TEXT NOT NULL,
    entity_id TEXT,
    product_id TEXT,
    quantity REAL,
    description TEXT,
    notes TEXT,
    reference TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(category_id) REFERENCES categories(id),
    FOREIGN KEY(entity_id) REFERENCES entities(id),
    FOREIGN KEY(product_id) REFERENCES products(id)
);

-- custom_field_definitions
CREATE TABLE custom_field_definitions (
    id TEXT PRIMARY KEY,
    target_type TEXT NOT NULL, -- 'transaction', 'entity', 'product'
    name TEXT NOT NULL,
    field_type TEXT NOT NULL, -- 'text', 'number', 'currency', 'date', 'boolean', 'dropdown', 'multiselect'
    options TEXT, -- JSON array of options for dropdown/multiselect
    is_required BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- custom_field_values
CREATE TABLE custom_field_values (
    id TEXT PRIMARY KEY,
    definition_id TEXT NOT NULL,
    target_id TEXT NOT NULL, -- ID of the transaction, entity, or product
    value TEXT NOT NULL, -- String representation, serialized if necessary
    FOREIGN KEY(definition_id) REFERENCES custom_field_definitions(id)
);

-- settings
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
            "#,
            kind: MigrationKind::Up,
        }
    ];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:plywood.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
