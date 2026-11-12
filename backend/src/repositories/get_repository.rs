use super::types::InvoiceItem;
use sqlx::PgPool;

pub async fn fetch_invoice(
    pool: &PgPool,
    transaction_number: &str,
) -> Result<Vec<InvoiceItem>, sqlx::Error> {
    let invoice = sqlx::query_as::<_, InvoiceItem>(
        r#"
        SELECT
            id,
            transaction_number,
            total,
            tax,
            subtotal,
            date_time,
            item_description,
            item_purchased_for,
            item_quantity,
            item_tax_type,
            item_total_price,
            item_unit_price,
            item_status
        FROM invoices
        WHERE transaction_number = $1
        ORDER BY id ASC
        "#,
    )
    .bind(transaction_number)
    .fetch_all(pool)
    .await?;

    Ok(invoice)
}
