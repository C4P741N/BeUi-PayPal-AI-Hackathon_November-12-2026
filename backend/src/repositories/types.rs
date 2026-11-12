use chrono::{DateTime, FixedOffset, Utc};
use serde::{Deserialize, Serialize};
use sqlx::prelude::FromRow;
use uuid::Uuid;

fn deserialize_nullable_tax_type<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Option::<String>::deserialize(deserializer)?.unwrap_or_else(|| "N".to_string()))
}

fn deserialize_nullable_tax<'de, D>(deserializer: D) -> Result<f32, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Option::<f32>::deserialize(deserializer)?.unwrap_or(0.0))
}

#[derive(Deserialize, Serialize, Clone)]
pub struct Item {
    #[serde(default = "generate_uuid")]
    pub id: Option<Uuid>,
    pub description: String,
    pub purchased_for: String,
    pub quantity: f32,
    #[serde(deserialize_with = "deserialize_nullable_tax_type")]
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
    #[serde(deserialize_with = "deserialize_nullable_tax")]
    pub tax: f32,
    pub total: f32,
    pub transaction_number: String,
}

#[cfg(test)]
mod tests {
    use super::Invoice;

    #[test]
    fn deserializes_null_tax_fields_to_receipt_defaults() {
        let invoice: Invoice = serde_json::from_str(
            r#"{
                "date_time": "2026-02-15T12:00:00+00:00",
                "items": [{
                    "quantity": 1,
                    "description": "Lorem ipsum",
                    "unit_price": 2.5,
                    "total_price": 2.5,
                    "tax_type": null,
                    "purchased_for": "John"
                }],
                "subtotal": 2.5,
                "tax": null,
                "total": 2.5,
                "transaction_number": "f3b1c2a4-9d7e-4c6b-8a2f-1e5d9c3b7a60"
            }"#,
        )
        .expect("nullable tax fields should be normalized");

        assert_eq!(invoice.tax, 0.0);
        assert_eq!(invoice.items[0].tax_type, "N");
    }
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

#[derive(Debug, FromRow)]
pub struct InvoiceItem {
    pub id: Uuid,
    pub transaction_number: String,
    pub total: f64,
    pub tax: f64,
    pub subtotal: f64,
    pub date_time: DateTime<Utc>,
    pub item_description: String,
    pub item_purchased_for: String,
    pub item_quantity: f64,
    pub item_tax_type: String,
    pub item_total_price: f64,
    pub item_unit_price: f64,
    pub item_status: String,
}

#[derive(Debug, Serialize)]
pub struct PayPalInvoicePayload {
    pub detail: PayPalInvoiceDetail,
    pub invoicer: PayPalInvoicer,
    pub primary_recipients: Vec<PayPalRecipient>,
    pub items: Vec<PayPalItem>,
}

#[derive(Debug, Serialize)]
pub struct PayPalInvoiceDetail {
    pub invoice_number: String,
    pub currency_code: String,
    pub note: String,
    pub payment_term: PayPalPaymentTerm,
}

#[derive(Debug, Serialize)]
pub struct PayPalPaymentTerm {
    pub term_type: String,
}

#[derive(Debug, Serialize)]
pub struct PayPalInvoicer {
    pub email_address: String,
    pub name: PayPalName,
}

#[derive(Debug, Serialize)]
pub struct PayPalRecipient {
    pub billing_info: PayPalBillingInfo,
}

#[derive(Debug, Serialize)]
pub struct PayPalBillingInfo {
    pub email_address: String,
    pub name: PayPalName,
}

#[derive(Debug, Serialize)]
pub struct PayPalName {
    pub given_name: String,
    pub surname: String,
}

#[derive(Debug, Serialize)]
pub struct PayPalItem {
    pub name: String,
    pub description: String,
    pub quantity: String,
    pub unit_amount: PayPalAmount,
}

#[derive(Debug, Serialize)]
pub struct PayPalAmount {
    pub currency_code: String,
    pub value: String,
}
