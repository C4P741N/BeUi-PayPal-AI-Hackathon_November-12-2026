use super::types::*;
use axum::{Json, extract::State, http::StatusCode, response::IntoResponse};
use serde_json::Value;

use crate::api::client::send_request;
use crate::config::AppConfig;
use crate::image::processor::{build_data_url, detect_mime, strip_prefix};

pub async fn convert_handler(
    State(config): State<AppConfig>,
    Json(body): Json<ConvertRequest>,
) -> impl IntoResponse {
    let clean_b64 = strip_prefix(&body.image);
    let mime = detect_mime(&body.image);
    let data_url = build_data_url(clean_b64, &mime);

    let prompt = body
        .prompt
        .as_deref()
        .unwrap_or("Extract all text from this image. Return only raw text, no commentary.");

    match send_request(&config, &data_url, prompt).await {
        Ok(text) => match serde_json::from_str::<Value>(&text) {
            Ok(parsed_json) => (StatusCode::OK, Json(parsed_json)).into_response(),
            Err(e) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                Json(serde_json::json!({
                    "error" : "Failed to parse exactracted text to JSON",
                    "details" : e.to_string(),
                    "raw_text" : text
                })),
            )
                .into_response(),
        },
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}
