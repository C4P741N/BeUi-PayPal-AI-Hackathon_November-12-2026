use sqlx::{PgPool, postgres::PgPoolOptions};

pub async fn connect_database(database_url: &str) -> Result<PgPool, sqlx::Error> {
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await?;

    println!("PostgreSQL connected!");

    Ok(pool)
}
