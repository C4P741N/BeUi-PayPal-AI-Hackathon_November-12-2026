mod api;
mod config;
mod database;
mod image;
mod repositories;
mod routes;

use anyhow::Context;
use axum::{
    Router,
    routing::{get, post},
};
use config::AppConfig;
use routes::convert::convert_handler;
use tracing_subscriber;

use crate::routes::invoice::{invoice_handler, list_invoices_handler};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let config = AppConfig::load()
        .await
        .context("failed to load application config")?;
    sqlx::migrate!("./migrations")
        .run(&config.database_pool)
        .await
        .context("failed to run database migrations")?;
    let port = config.port;

    let app = Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/convert", post(convert_handler))
        .route("/invoice", post(invoice_handler))
        .route("/invoices", get(list_invoices_handler))
        .with_state(config);

    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .with_context(|| format!("failed to bind {addr}; another process may already use this port"))?;
    tracing::info!("Server running on {}", addr);

    axum::serve(listener, app)
        .await
        .context("HTTP server stopped unexpectedly")?;

    Ok(())
}
