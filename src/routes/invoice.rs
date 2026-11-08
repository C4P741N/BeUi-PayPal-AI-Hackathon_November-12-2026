use super::types::*;
use axum::{Json, extract::State, http::StatusCode, response::IntoResponse};
use reqwest::header::{HeaderMap, HeaderValue};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::api::client::send_post_request;
use crate::config::AppConfig;

pub async fn invoice_handler(
    State(config): State<AppConfig>,
    Json(body): Json<ConvertRequest>,
) -> impl IntoResponse {
    match create_paypal_invoice(&config, &body).await {
        Ok(response) => {
            let invoice_id = match response["id"].as_str() {
                Some(id) => id,
                None => {
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "PayPal response did not contain an invoice ID"
                        })),
                    )
                        .into_response();
                }
            };

            println!("Invoice ID: {}", invoice_id);

            (
                StatusCode::OK,
                Json(json!({
                    "success": true,
                    "invoice_id": invoice_id,
                    "paypal_response": response
                })),
            )
                .into_response()
        }

        Err(err) => {
            eprintln!("PayPal invoice creation failed: {}", err);

            (
                StatusCode::BAD_GATEWAY,
                Json(json!({
                    "success": false,
                    "error": "Failed to create PayPal invoice"
                })),
            )
                .into_response()
        }
    }
}

async fn create_paypal_invoice(
    config: &AppConfig,
    body: &ConvertRequest,
) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
    // PayPal create invoice endpoint
    let url = &config.paypal_create_invoice_route;
    let paypal_access_token = &config.paypal_access_token;

    // Generate an idempotency key
    let request_id = Uuid::new_v4().to_string();

    // Request headers
    let mut headers = HeaderMap::new();

    headers.insert("PayPal-Request-Id", HeaderValue::from_str(&request_id)?);

    headers.insert("Prefer", HeaderValue::from_static("return=representation"));

    // Invoice payload
    let payload = json!({
        "detail": {
            "invoice_number": "INV-2026-001",
            "invoice_date": "2026-11-08",
            "currency_code": "USD",
            "note": "Hey! Here your share from Friday Night at Kiza",
            "payment_term": {
                "term_type": "NO_DUE_DATE"
            }
        },
        "invoicer": {
            "email_address": "sb-mk77o53121570@business.example.com",
            "name": {
                "given_name": "John",
                "surname": "Doe"
            }
        },
        "primary_recipients": [
            {
                "billing_info": {
                    "email_address": "sb-6hvql53243495@personal.example.com",
                    "name": {
                        "given_name": "Marryz",
                        "surname": "Jane"
                    }
                }
            }
        ],
        "items": [
            {
                "name": "Nyama Choma Platter",
                "quantity": "1",
                "unit_amount": {
                    "currency_code": "USD",
                    "value": "16.00"
                }
            },
            {
                "name": "Bottle Whiskey share",
                "quantity": "1",
                "unit_amount": {
                    "currency_code": "USD",
                    "value": "12.50"
                }
            }
        ]
    });

    // Send request
    let response: Value =
        send_post_request::<_, Value>(paypal_access_token, url, &payload, Some(headers)).await?;

    println!("PayPal Invoice Created: {:#?}", response);

    Ok(response)
}
