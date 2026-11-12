use super::types::*;
use axum::{Json, extract::State, http::StatusCode, response::IntoResponse};
use crate::repositories::types::Invoice;

use crate::api::client::send_request;
use crate::config::AppConfig;
use crate::image::processor::{build_data_url, detect_mime, strip_prefix};
use crate::repositories::post_repository::save_invoice;

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
        Ok(text) => {
            let model_payload = match serde_json::from_str::<serde_json::Value>(&text) {
                Ok(payload) => payload,
                Err(e) => {
                    return (
                        StatusCode::UNPROCESSABLE_ENTITY,
                        Json(serde_json::json!({
                            "error": "Failed to parse extracted text to Invoice",
                            "details": e.to_string(),
                            "raw_text": text
                        })),
                    )
                        .into_response();
                }
            };

            if let Some(error_code) = model_payload.get("error").and_then(|v| v.as_str()) {
                let message = model_payload
                    .get("message")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Receipt could not be processed.");
                let status = if error_code == "INVALID_CONTACT" {
                    StatusCode::BAD_REQUEST
                } else {
                    StatusCode::UNPROCESSABLE_ENTITY
                };
                return (
                    status,
                    Json(serde_json::json!({
                        "error": error_code,
                        "message": message
                    })),
                )
                    .into_response();
            }

            let invoice = match serde_json::from_value::<Invoice>(model_payload) {
                Ok(inv) => inv,
                Err(e) => {
                    return (
                        StatusCode::UNPROCESSABLE_ENTITY,
                        Json(serde_json::json!({
                            "error": "Failed to parse extracted text to Invoice",
                            "details": e.to_string(),
                            "raw_text": text
                        })),
                    )
                        .into_response();
                }
            };

            match save_invoice(&config.database_pool, &invoice).await {
                Ok(_) => (StatusCode::OK, Json(invoice)).into_response(),
                Err(e) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({
                        "error": "Failed to save invoice",
                        "details": e.to_string(),
                    })),
                )
                    .into_response(),
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}
