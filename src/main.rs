mod api;
mod config;
mod image;
mod routes;

use anyhow::Context;
use axum::{Router, routing::post};
use config::AppConfig;
use routes::convert::convert_handler;
use tracing_subscriber;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let config = AppConfig::load()
        .await
        .context("failed to load application config")?;
    let port = config.port;

    let app = Router::new()
        .route("/convert", post(convert_handler))
        //        .route("/invoice", post(convert_handler))
        .with_state(config);

    let addr = format!("0.0.0.0:{}", port);
    tracing::info!("Server running on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
    
    Ok(())
}
