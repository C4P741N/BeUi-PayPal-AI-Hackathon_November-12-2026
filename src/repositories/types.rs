use chrono::{DateTime, FixedOffset};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Deserialize, Serialize, Clone)]
pub struct Item {
    #[serde(default = "generate_uuid")]
    pub id: Option<Uuid>,
    pub description: String,
    pub purchased_for: String,
    pub quantity: f32,
    pub tax_type: String,
    pub total_price: f32,
    pub unit_price: f32,
}
fn generate_uuid() -> Option<Uuid> {
    Some(Uuid::new_v4())
}
#[derive(Deserialize, Serialize)]
pub struct Invoice {
    pub date_time: DateTime<FixedOffset>,
    pub items: Vec<Item>,
    pub subtotal: f32,
    pub tax: f32,
    pub total: f32,
    pub transaction_number: String,
}
impl Item {
    pub fn new(
        description: String,
        purchased_for: String,
        quantity: f32,
        tax_type: String,
        total_price: f32,
        unit_price: f32,
    ) -> Self {
        Self {
            id: Some(Uuid::new_v4()),
            description,
            purchased_for,
            quantity,
            tax_type,
            total_price,
            unit_price,
        }
    }
}
