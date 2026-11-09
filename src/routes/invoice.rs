use super::types::InvoiceRequest;
use crate::repositories::types::*;
use crate::routes::types::SendInvoiceRequest;
use axum::{Json, extract::State, http::StatusCode, response::IntoResponse};
use paypal_ai_hackathon_november_12_2026::repositories::get_repository;
use serde_json::json;

use crate::api::client::send_post_request;
use crate::config::AppConfig;

pub async fn invoice_handler(
    State(config): State<AppConfig>,
    Json(body): Json<InvoiceRequest>,
) -> impl IntoResponse {
    let transaction_number = &body.transaction_number;

    match create_paypal_invoice(&config, transaction_number).await {
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

            println!("Invoice ID created: {}", invoice_id);

            // --- NEW CODE: Send the invoice ---
            match send_paypal_invoice(&config, invoice_id).await {
                Ok(send_response) => {
                    // Both creation and sending succeeded
                    (
                        StatusCode::OK,
                        Json(json!({
                            "success": true,
                            "invoice_id": invoice_id,
                            "paypal_response": response,
                            "send_response": send_response
                        })),
                    )
                        .into_response()
                }
                Err(err) => {
                    eprintln!("Failed to send PayPal invoice {}: {}", invoice_id, err);

                    // The invoice was created, but sending failed.
                    // We return a BAD_GATEWAY but include the invoice_id so it's not lost.
                    (
                        StatusCode::BAD_GATEWAY,
                        Json(json!({
                            "success": false,
                            "error": "Invoice created but failed to send",
                            "invoice_id": invoice_id
                        })),
                    )
                        .into_response()
                }
            }
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
    transaction_number: &str,
) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
    let invoices = get_repository::fetch_invoice(&config.database_pool, transaction_number).await?;

    if invoices.is_empty() {
        return Err("Invoice not found".into());
    }

    let invoice = &invoices[0];

    let items: Vec<PayPalItem> = invoices
        .iter()
        .map(|item| PayPalItem {
            name: item.item_description.clone(),
            description: item.item_purchased_for.clone(),
            quantity: item.item_quantity.to_string(),
            unit_amount: PayPalAmount {
                currency_code: "USD".to_string(),
                value: item.item_unit_price.to_string(),
            },
        })
        .collect();

    let payload = PayPalInvoicePayload {
        detail: PayPalInvoiceDetail {
            invoice_number: invoice.transaction_number.clone(),
            invoice_date: invoice.date_time.format("%Y-%m-%d").to_string(),
            currency_code: "USD".to_string(),
            note: "Invoice generated from transaction".to_string(),
            payment_term: PayPalPaymentTerm {
                term_type: "NO_DUE_DATE".to_string(),
            },
        },

        invoicer: PayPalInvoicer {
            email_address: config.paypal_invoicer_email.clone(),
            name: PayPalName {
                given_name: config.paypal_invoicer_first_name.clone(),
                surname: config.paypal_invoicer_last_name.clone(),
            },
        },

        primary_recipients: vec![PayPalRecipient {
            billing_info: PayPalBillingInfo {
                email_address: config.paypal_recipient_email.clone(),
                name: PayPalName {
                    given_name: config.paypal_recipient_first_name.clone(),
                    surname: config.paypal_recipient_last_name.clone(),
                },
            },
        }],

        items,
    };

    let mut headers = reqwest::header::HeaderMap::new();

    headers.insert(
        "PayPal-Request-Id",
        reqwest::header::HeaderValue::from_str(&uuid::Uuid::new_v4().to_string())?,
    );

    headers.insert(
        "Prefer",
        reqwest::header::HeaderValue::from_static("return=representation"),
    );

    let response = send_post_request::<_, serde_json::Value>(
        &config.paypal_access_token,
        &config.paypal_create_invoice_route,
        &payload,
        Some(headers),
    )
    .await?;

    Ok(response)
}

async fn send_paypal_invoice(
    config: &AppConfig,
    invoice_id: &str,
) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
    let url = config.get_paypal_send_invoice_route(invoice_id);

    println!("Sending invoice to {url}");

    let payload = SendInvoiceRequest {
        send_to_invoicer: true,
        send_to_recipient: true,
        subject: "Your share of the bill".to_string(),
        note: "Settle up".to_string(),
    };

    let mut headers = reqwest::header::HeaderMap::new();

    headers.insert(
        "PayPal-Request-Id",
        reqwest::header::HeaderValue::from_str(&uuid::Uuid::new_v4().to_string())?,
    );

    let response = send_post_request::<_, serde_json::Value>(
        &config.paypal_access_token,
        &url,
        &payload,
        Some(headers),
    )
    .await?;

    Ok(response)
}
