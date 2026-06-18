#!/usr/bin/env python3
"""
Safe database migration script for PigStyle Music accounting and checkout integration.
Run this script once on each database (local and production) to apply all required schema changes.
It checks each table/column before creating/altering, so it is safe to run multiple times.
"""

import sqlite3
import os

DB_PATH = "backend/data/records.db"  # Adjust path as needed

def get_existing_tables(cursor):
    """Return a set of existing table names."""
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    return {row[0] for row in cursor.fetchall()}

def column_exists(cursor, table, column):
    """Check if a column exists in a given table."""
    cursor.execute(f"PRAGMA table_info({table})")
    return any(row[1] == column for row in cursor.fetchall())

def safe_add_column(cursor, table, column, col_type, default=None):
    """Add a column if it does not exist."""
    if column_exists(cursor, table, column):
        print(f"✓ Column '{column}' already exists in '{table}' – skipping.")
        return
    sql = f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"
    if default is not None:
        sql += f" DEFAULT {default}"
    cursor.execute(sql)
    print(f"✓ Added column '{column}' to '{table}'.")

def create_table_if_not_exists(cursor, table, create_sql):
    """Create a table if it doesn't exist."""
    cursor.execute(create_sql)
    print(f"✓ Table '{table}' created (or already exists).")

def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    print("Starting safe migration...\n")

    # -------- 1. CREATE NEW TABLES --------
    print("Creating new tables...")

    create_table_if_not_exists(cursor, "accounts", """
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            type TEXT NOT NULL
        )
    """)

    create_table_if_not_exists(cursor, "journal_entries", """
        CREATE TABLE IF NOT EXISTS journal_entries (
            id INTEGER PRIMARY KEY,
            transaction_date TEXT NOT NULL,
            description TEXT,
            source_type TEXT NOT NULL,
            source_id TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    create_table_if_not_exists(cursor, "journal_lines", """
        CREATE TABLE IF NOT EXISTS journal_lines (
            id INTEGER PRIMARY KEY,
            journal_entry_id INTEGER NOT NULL,
            account_id INTEGER NOT NULL,
            debit_amount INTEGER DEFAULT 0,
            credit_amount INTEGER DEFAULT 0,
            FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id),
            FOREIGN KEY (account_id) REFERENCES accounts(id)
        )
    """)

    create_table_if_not_exists(cursor, "payments", """
        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY,
            order_id TEXT NOT NULL,
            source TEXT NOT NULL,
            gross_amount INTEGER NOT NULL,
            transaction_date TEXT NOT NULL,
            external_transaction_id TEXT UNIQUE,
            FOREIGN KEY (order_id) REFERENCES orders(id)
        )
    """)

    create_table_if_not_exists(cursor, "fees", """
        CREATE TABLE IF NOT EXISTS fees (
            id INTEGER PRIMARY KEY,
            order_id TEXT NOT NULL,
            fee_type TEXT NOT NULL,
            amount INTEGER NOT NULL,
            source TEXT,
            external_transaction_id TEXT,
            FOREIGN KEY (order_id) REFERENCES orders(id)
        )
    """)

    create_table_if_not_exists(cursor, "shipments", """
        CREATE TABLE IF NOT EXISTS shipments (
            id INTEGER PRIMARY KEY,
            order_id TEXT NOT NULL UNIQUE,
            shipment_date TEXT,
            tracking_number TEXT,
            shipping_charged INTEGER DEFAULT 0,
            postage_cost INTEGER DEFAULT 0,
            FOREIGN KEY (order_id) REFERENCES orders(id)
        )
    """)

    create_table_if_not_exists(cursor, "bank_accounts", """
        CREATE TABLE IF NOT EXISTS bank_accounts (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            institution TEXT
        )
    """)

    create_table_if_not_exists(cursor, "bank_transactions", """
        CREATE TABLE IF NOT EXISTS bank_transactions (
            id INTEGER PRIMARY KEY,
            bank_account_id INTEGER NOT NULL,
            transaction_date TEXT NOT NULL,
            amount INTEGER NOT NULL,
            description TEXT,
            external_id TEXT UNIQUE,
            FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id)
        )
    """)

    create_table_if_not_exists(cursor, "reconciliation_matches", """
        CREATE TABLE IF NOT EXISTS reconciliation_matches (
            id INTEGER PRIMARY KEY,
            bank_transaction_id INTEGER NOT NULL,
            source_type TEXT NOT NULL,
            source_id INTEGER NOT NULL,
            matched_amount INTEGER NOT NULL,
            FOREIGN KEY (bank_transaction_id) REFERENCES bank_transactions(id)
        )
    """)

    # -------- 2. ADD MISSING COLUMNS TO EXISTING TABLES --------
    print("\nAdding missing columns to existing tables...")

    # records table
    safe_add_column(cursor, "records", "batch_id", "INTEGER")
    safe_add_column(cursor, "records", "acquisition_date", "TEXT")

    # batches table
    safe_add_column(cursor, "batches", "total_cost", "REAL")

    # orders table
    safe_add_column(cursor, "orders", "channel", "TEXT", default="'website'")
    safe_add_column(cursor, "orders", "external_order_id", "TEXT")
    safe_add_column(cursor, "orders", "is_accounted", "INTEGER", default=0)
    safe_add_column(cursor, "orders", "shipping_charged", "REAL", default=0)
    safe_add_column(cursor, "orders", "tax_total", "REAL", default=0)

    # Create unique index for external_order_id if it doesn't exist
    cursor.execute("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_orders_external_id'")
    if not cursor.fetchone():
        cursor.execute("CREATE UNIQUE INDEX idx_orders_external_id ON orders(external_order_id) WHERE external_order_id IS NOT NULL")
        print("✓ Created unique index 'idx_orders_external_id' on orders.external_order_id.")

    # -------- 3. ADD FOREIGN KEYS (if desired) – skipped for simplicity --------
    # SQLite's ALTER TABLE does not support adding foreign keys; we skip.

    # -------- 4. COMMIT AND CLOSE --------
    conn.commit()
    conn.close()

    print("\n✅ Migration completed successfully!")

if __name__ == "__main__":
    main()