-- Add migration script here
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_number VARCHAR(255) NOT NULL UNIQUE,
    total NUMERIC(10, 2) NOT NULL,
    tax NUMERIC(10, 2) NOT NULL,
    subtotal NUMERIC(10, 2) NOT NULL,
    date_time TIMESTAMPTZ NOT NULL,
    item_description TEXT NOT NULL,
    item_purchased_for VARCHAR(255),
    item_quantity INTEGER NOT NULL,
    item_tax_type VARCHAR(10),
    item_total_price NUMERIC(10, 2) NOT NULL,
    item_unit_price NUMERIC(10, 2) NOT NULL
);