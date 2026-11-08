use chrono::{DateTime, FixedOffset};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Deserialize, Serialize)]
pub struct Item {
    pub description: String,
    pub purchased_for: String,
    pub quantity: f32,
    pub tax_type: String,
    pub total_price: f32,
    pub unit_price: f32,
}

#[derive(Deserialize, Serialize)]
pub struct Invoice {
    pub id: Option<Uuid>,
    pub date_time: DateTime<FixedOffset>,
    pub items: Vec<Item>,
    pub subtotal: f32,
    pub tax: f32,
    pub total: f32,
    pub transaction_number: String,
}

impl Invoice {
    pub fn new(
        date_time: DateTime<FixedOffset>,
        items: Vec<Item>,
        subtotal: f32,
        tax: f32,
        total: f32,
        transaction_number: String,
    ) -> Self {
        Self {
            id: Some(Uuid::new_v4()),
            date_time,
            items,
            subtotal,
            tax,
            total,
            transaction_number,
        }
    }
}
