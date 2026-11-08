use super::types::Invoice;
use sqlx::PgPool;
use uuid::Uuid;

pub async fn save_invoice(pool: &PgPool, invoice: &Invoice) 
-> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;

    for item in &invoice.items {
        sqlx::query(
            r#"
            INSERT INTO invoices 
            (id,transaction_number, total, tax, subtotal, date_time,
            item_description, item_purchased_for, item_quantity, 
            item_tax_type, item_total_price, item_unit_price, item_status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            "#,
        )
        .bind(&item.id.unwrap_or_else(Uuid::new_v4))
        .bind(&invoice.transaction_number)
        .bind(invoice.total)
        .bind(invoice.tax)
        .bind(invoice.subtotal)
        .bind(invoice.date_time)
        .bind(&item.description)
        .bind(&item.purchased_for)
        .bind(item.quantity)
        .bind(&item.tax_type)
        .bind(item.total_price)
        .bind(item.unit_price)
        .bind("NEW")
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(())
}
