use super::types::InvoiceRequest;
use crate::repositories::types::*;
use crate::routes::types::SendInvoiceRequest;
use axum::{Json, extract::State, http::StatusCode, response::IntoResponse};
use paypal_ai_hackathon_november_12_2026::repositories::{
    get_repository, types::InvoiceItem as RepositoryInvoiceItem,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::BTreeMap;
use std::time::Duration;

use crate::api::client::send_post_request;
use crate::config::AppConfig;

#[derive(Deserialize)]
struct PayPalInvoicePage {
    #[serde(default)]
    items: Vec<serde_json::Value>,
    #[serde(default)]
    total_pages: usize,
    #[serde(default)]
    total_items: usize,
}

#[derive(Serialize)]
struct PayPalInvoiceSummary {
    id: String,
    status: String,
    invoice_number: Option<String>,
    recipient_name: Option<String>,
    recipient_email: Option<String>,
    currency_code: Option<String>,
    amount: Option<String>,
    due_amount: Option<String>,
    invoice_date: Option<String>,
    create_time: Option<String>,
    note: Option<String>,
}

pub async fn list_invoices_handler(State(config): State<AppConfig>) -> impl IntoResponse {
    match list_paypal_invoices(&config).await {
        Ok((items, total_items)) => (
            StatusCode::OK,
            Json(json!({ "items": items, "total_items": total_items })),
        )
            .into_response(),
        Err(err) => {
            eprintln!("Failed to fetch PayPal invoices: {err}");
            let message = if err.to_string().contains("503 Service Unavailable") {
                "PayPal's invoice service is temporarily unavailable. Please try again shortly."
            } else {
                "Failed to fetch PayPal invoices"
            };
            (StatusCode::BAD_GATEWAY, Json(json!({ "error": message }))).into_response()
        }
    }
}

async fn list_paypal_invoices(
    config: &AppConfig,
) -> Result<(Vec<PayPalInvoiceSummary>, usize), Box<dyn std::error::Error + Send + Sync>> {
    let access_token = request_paypal_access_token(config).await?;
    list_paypal_invoices_with_token(config, &access_token).await
}

async fn list_paypal_invoices_with_token(
    config: &AppConfig,
    access_token: &str,
) -> Result<(Vec<PayPalInvoiceSummary>, usize), Box<dyn std::error::Error + Send + Sync>> {
    let client = reqwest::Client::new();
    let mut items = Vec::new();
    let mut total_items = 0;
    let mut total_pages = 1;

    let mut page = 1;
    while page <= total_pages {
        let mut retries: u64 = 0;
        let endpoint = config.get_paypal_invoices_route();
        tracing::info!(
            method = "GET",
            endpoint = %endpoint,
            page,
            page_size = 100,
            total_required = true,
            fields = "amount",
            "Sending PayPal invoice list request"
        );
        let response: reqwest::Response = loop {
            let response = client
                .get(&endpoint)
                .bearer_auth(access_token)
                .query(&[
                    ("page", page.to_string()),
                    ("page_size", "100".to_string()),
                    ("total_required", "true".to_string()),
                    ("fields", "amount".to_string()),
                ])
                .send()
                .await?;

            if matches!(response.status().as_u16(), 502 | 503 | 504) && retries < 2 {
                retries += 1;
                tokio::time::sleep(Duration::from_millis(250 * retries)).await;
                continue;
            }
            break response;
        };

        let status = response.status();
        let response_body = response.text().await?;
        if std::env::var("PAYPAL_HTTP_DEBUG")
            .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
            .unwrap_or(false)
        {
            eprintln!("PayPal invoice list response (page {page}, HTTP {status}): {response_body}");
        }
        if !status.is_success() {
            return Err(
                format!("PayPal invoice list request failed ({status}): {response_body}").into(),
            );
        }

        let result: PayPalInvoicePage = serde_json::from_str(&response_body)?;
        tracing::info!(
            page,
            status = %status,
            returned_items = result.items.len(),
            total_pages = result.total_pages,
            total_items = result.total_items,
            "Received PayPal invoice list response"
        );
        if page == 1 {
            total_pages = result.total_pages.max(1);
            total_items = result.total_items;
        }
        items.extend(
            result
                .items
                .into_iter()
                .filter_map(summarize_paypal_invoice),
        );
        page += 1;
    }

    Ok((items, total_items))
}

fn summarize_paypal_invoice(value: serde_json::Value) -> Option<PayPalInvoiceSummary> {
    let id = value.get("id")?.as_str()?.to_string();
    let status = value
        .get("status")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("UNKNOWN")
        .to_string();
    let recipient = value.pointer("/primary_recipients/0/billing_info");
    let name = recipient
        .and_then(|billing| billing.pointer("/name/full_name"))
        .and_then(serde_json::Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            let name = recipient?.get("name")?;
            let given = name.get("given_name")?.as_str()?;
            let surname = name
                .get("surname")
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default();
            Some(format!("{given} {surname}").trim().to_string())
        });

    Some(PayPalInvoiceSummary {
        id,
        status,
        invoice_number: value
            .pointer("/detail/invoice_number")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        recipient_name: name,
        recipient_email: recipient
            .and_then(|billing| billing.get("email_address"))
            .and_then(serde_json::Value::as_str)
            .map(str::to_string),
        currency_code: value
            .pointer("/amount/currency_code")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        amount: value
            .pointer("/amount/value")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        due_amount: value
            .pointer("/due_amount/value")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        invoice_date: value
            .pointer("/detail/invoice_date")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        create_time: value
            .pointer("/detail/metadata/create_time")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        note: value
            .pointer("/detail/note")
            .and_then(|v| v.as_str())
            .map(str::to_string),
    })
}

pub async fn invoice_handler(
    State(config): State<AppConfig>,
    Json(body): Json<InvoiceRequest>,
) -> impl IntoResponse {
    let transaction_number = &body.transaction_number;

    let invoices =
        match get_repository::fetch_invoice(&config.database_pool, transaction_number).await {
            Ok(invoices) if invoices.is_empty() => {
                return (
                    StatusCode::NOT_FOUND,
                    Json(json!({ "success": false, "error": "Invoice not found" })),
                )
                    .into_response();
            }
            Ok(invoices) => invoices,
            Err(err) => {
                eprintln!("Failed to load receipt {transaction_number}: {err}");
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "success": false, "error": "Failed to load receipt" })),
                )
                    .into_response();
            }
        };

    let debtors = build_invoice_debtors(&invoices);
    if debtors.is_empty() {
        return (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({
                "success": false,
                "error": "No named debtors were found on this receipt."
            })),
        )
            .into_response();
    }

    let access_token = match request_paypal_access_token(&config).await {
        Ok(token) => token,
        Err(err) => {
            eprintln!("Failed to get PayPal access token: {err}");
            return (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "success": false, "error": "Failed to authenticate with PayPal" })),
            )
                .into_response();
        }
    };

    let existing = match list_paypal_invoices_with_token(&config, &access_token).await {
        Ok((existing, _)) => existing,
        Err(err) => {
            eprintln!("Could not check for an existing PayPal invoice: {err}");
            return (
                StatusCode::BAD_GATEWAY,
                Json(json!({
                    "success": false,
                    "error": "Could not check PayPal for an existing invoice. No per-person invoices were sent."
                })),
            )
                .into_response();
        }
    };
    if let Some(legacy) = existing
        .into_iter()
        .find(|invoice| invoice.invoice_number.as_deref() == Some(transaction_number.as_str()))
    {
        return (
            StatusCode::CONFLICT,
            Json(json!({
                "success": false,
                "error": "A single-recipient PayPal invoice already exists for this receipt. Verify or cancel it in PayPal before creating per-person invoices.",
                "invoice_id": legacy.id,
                "invoice_status": legacy.status
            })),
        )
            .into_response();
    }

    let mut sent_invoices = Vec::new();
    let mut failures = Vec::new();
    for debtor in &debtors {
        let invoice_number = invoice_number_for_debtor(transaction_number, &debtor.recipient_key);
        match create_and_send_debtor_invoice(&config, &access_token, &invoice_number, debtor).await
        {
            Ok(result) => sent_invoices.push(result),
            Err(err) => {
                eprintln!(
                    "Failed to create or send PayPal invoice for {}: {err}",
                    debtor.recipient_name
                );
                failures.push(json!({
                    "recipient_name": debtor.recipient_name,
                    "error": err.to_string()
                }));
            }
        }
    }

    if failures.is_empty() {
        (
            StatusCode::OK,
            Json(json!({ "success": true, "invoices": sent_invoices })),
        )
            .into_response()
    } else {
        (
            StatusCode::BAD_GATEWAY,
            Json(json!({
                "success": false,
                "error": "Some per-person PayPal invoices could not be sent.",
                "invoices": sent_invoices,
                "failures": failures
            })),
        )
            .into_response()
    }
}

#[derive(Debug)]
struct InvoiceDebtor<'a> {
    recipient_key: String,
    recipient_name: String,
    items: Vec<&'a RepositoryInvoiceItem>,
    tax_share: f64,
}

#[derive(Serialize)]
struct SentInvoice {
    recipient_name: String,
    invoice_id: String,
    invoice_status: String,
    already_exists: bool,
}

fn build_invoice_debtors(invoices: &[RepositoryInvoiceItem]) -> Vec<InvoiceDebtor<'_>> {
    let mut grouped: BTreeMap<String, (String, Vec<&RepositoryInvoiceItem>)> = BTreeMap::new();
    for item in invoices {
        let key = item.item_purchased_for.trim().to_lowercase();
        if key.is_empty() {
            continue;
        }
        let group = grouped
            .entry(key)
            .or_insert_with(|| (display_recipient_name(&item.item_purchased_for), Vec::new()));
        group.1.push(item);
    }

    let total_taxable: f64 = invoices
        .iter()
        .filter(|item| item.item_tax_type.eq_ignore_ascii_case("T"))
        .map(|item| item.item_total_price)
        .sum();
    let total_tax = invoices.first().map(|item| item.tax).unwrap_or_default();

    grouped
        .into_iter()
        .filter(|(key, _)| key != "self")
        .map(|(recipient_key, (recipient_name, items))| {
            let taxable_amount: f64 = items
                .iter()
                .filter(|item| item.item_tax_type.eq_ignore_ascii_case("T"))
                .map(|item| item.item_total_price)
                .sum();
            let tax_share = if total_taxable > 0.0 {
                round_currency(total_tax * taxable_amount / total_taxable)
            } else {
                0.0
            };
            InvoiceDebtor {
                recipient_key,
                recipient_name,
                items,
                tax_share,
            }
        })
        .collect()
}

fn display_recipient_name(name: &str) -> String {
    let name = name.trim();
    if name.chars().any(char::is_uppercase) {
        return name.to_string();
    }

    name.split_whitespace()
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn paypal_name(full_name: &str) -> PayPalName {
    let mut parts = full_name.split_whitespace();
    PayPalName {
        given_name: parts.next().unwrap_or_default().to_string(),
        surname: parts.collect::<Vec<_>>().join(" "),
    }
}

fn round_currency(amount: f64) -> f64 {
    (amount * 100.0).round() / 100.0
}

fn invoice_number_for_debtor(transaction_number: &str, recipient_key: &str) -> String {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in transaction_number
        .bytes()
        .chain([0])
        .chain(recipient_key.bytes())
    {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("I{hash:016X}")
}

fn build_paypal_invoice_payload(
    config: &AppConfig,
    invoice_number: &str,
    debtor: &InvoiceDebtor<'_>,
) -> PayPalInvoicePayload {
    let first_item = debtor.items[0];
    let mut items: Vec<PayPalItem> = debtor
        .items
        .iter()
        .map(|item| PayPalItem {
            name: item.item_description.clone(),
            description: item.item_purchased_for.clone(),
            quantity: item.item_quantity.to_string(),
            unit_amount: PayPalAmount {
                currency_code: "USD".to_string(),
                value: format!("{:.2}", item.item_unit_price),
            },
        })
        .collect();

    if debtor.tax_share > 0.0 {
        items.push(PayPalItem {
            name: "Tax share".to_string(),
            description: format!("Tax share for {}", debtor.recipient_name),
            quantity: "1".to_string(),
            unit_amount: PayPalAmount {
                currency_code: "USD".to_string(),
                value: format!("{:.2}", debtor.tax_share),
            },
        });
    }

    PayPalInvoicePayload {
        detail: PayPalInvoiceDetail {
            invoice_number: invoice_number.to_string(),
            invoice_date: first_item.date_time.format("%Y-%m-%d").to_string(),
            currency_code: "USD".to_string(),
            note: format!("Invoice for {}", debtor.recipient_name),
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
                name: paypal_name(&debtor.recipient_name),
            },
        }],
        items,
    }
}

async fn create_and_send_debtor_invoice(
    config: &AppConfig,
    access_token: &str,
    invoice_number: &str,
    debtor: &InvoiceDebtor<'_>,
) -> Result<SentInvoice, Box<dyn std::error::Error + Send + Sync>> {
    let payload = build_paypal_invoice_payload(config, invoice_number, debtor);
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        "PayPal-Request-Id",
        reqwest::header::HeaderValue::from_str(&uuid::Uuid::new_v4().to_string())?,
    );
    headers.insert(
        "Prefer",
        reqwest::header::HeaderValue::from_static("return=representation"),
    );

    let (response, should_send, already_exists) = match send_post_request::<_, serde_json::Value>(
        access_token,
        &config.paypal_create_invoice_route,
        &payload,
        Some(headers),
    )
    .await
    {
        Ok(response) => (response, true, false),
        Err(error) if error.to_string().contains("DUPLICATE_INVOICE_NUMBER") => {
            let (existing_invoices, _) =
                list_paypal_invoices_with_token(config, access_token).await?;
            let existing = existing_invoices
                .into_iter()
                .find(|invoice| invoice.invoice_number.as_deref() == Some(invoice_number))
                .ok_or_else(|| {
                    format!(
                        "PayPal reports invoice number {invoice_number} as duplicate, but it was not found in the invoice list"
                    )
                })?;
            let existing_recipient_key = existing
                .recipient_name
                .as_deref()
                .map(|name| name.trim().to_lowercase());
            if existing_recipient_key.as_deref() != Some(debtor.recipient_key.as_str()) {
                return Err(format!(
                    "PayPal invoice {invoice_number} already exists for a different recipient; it was not sent."
                )
                .into());
            }
            let should_send = existing.status.eq_ignore_ascii_case("DRAFT");
            (serde_json::to_value(existing)?, should_send, true)
        }
        Err(error) => return Err(error),
    };

    let invoice_id = response
        .get("id")
        .and_then(serde_json::Value::as_str)
        .ok_or("PayPal response did not contain an invoice ID")?
        .to_string();
    let status = response
        .get("status")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("UNKNOWN")
        .to_string();

    if !should_send {
        if matches!(
            status.to_ascii_uppercase().as_str(),
            "SENT" | "PAID" | "MARKED_AS_PAID" | "PARTIALLY_PAID" | "PAYMENT_PENDING" | "SCHEDULED"
        ) {
            return Ok(SentInvoice {
                recipient_name: debtor.recipient_name.clone(),
                invoice_id,
                invoice_status: status,
                already_exists: true,
            });
        }
        return Err(format!(
            "PayPal invoice {invoice_id} exists with status {status}; it was not sent again."
        )
        .into());
    }

    send_paypal_invoice(config, &invoice_id, access_token).await?;
    Ok(SentInvoice {
        recipient_name: debtor.recipient_name.clone(),
        invoice_id,
        invoice_status: "SENT".to_string(),
        already_exists,
    })
}

async fn send_paypal_invoice(
    config: &AppConfig,
    invoice_id: &str,
    access_token: &str,
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

    let response =
        send_post_request::<_, serde_json::Value>(access_token, &url, &payload, Some(headers))
            .await?;

    Ok(response)
}

#[derive(Deserialize)]
struct PayPalAccessTokenResponse {
    access_token: String,
}

async fn request_paypal_access_token(
    config: &AppConfig,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    request_oauth_access_token(
        config,
        &config.paypal_client_id,
        &config.paypal_client_secret,
    )
    .await
}

async fn request_oauth_access_token(
    config: &AppConfig,
    client_id: &str,
    client_secret: &str,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let response = reqwest::Client::new()
        .post(&config.paypal_oauth_route)
        .basic_auth(client_id, Some(client_secret))
        .header(
            reqwest::header::CONTENT_TYPE,
            "application/x-www-form-urlencoded",
        )
        .body("grant_type=client_credentials")
        .send()
        .await?;

    let status = response.status();
    if !status.is_success() {
        let response_body = response.text().await?;
        return Err(format!(
            "PayPal OAuth token request failed. Status: {status}. Response: {response_body}"
        )
        .into());
    }

    let token: PayPalAccessTokenResponse = response.json().await?;
    if token.access_token.trim().is_empty() {
        return Err("PayPal OAuth response did not contain an access token".into());
    }

    Ok(token.access_token)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use uuid::Uuid;

    fn invoice_item(name: &str, taxable: bool, price: f64) -> RepositoryInvoiceItem {
        RepositoryInvoiceItem {
            id: Uuid::new_v4(),
            transaction_number: "receipt-1".to_string(),
            total: 200.0,
            tax: 20.0,
            subtotal: 180.0,
            date_time: Utc::now(),
            item_description: "Item".to_string(),
            item_purchased_for: name.to_string(),
            item_quantity: 1.0,
            item_tax_type: if taxable { "T" } else { "N" }.to_string(),
            item_total_price: price,
            item_unit_price: price,
            item_status: "pending".to_string(),
        }
    }

    #[test]
    fn groups_named_debtors_and_allocates_their_tax_share() {
        let rows = vec![
            invoice_item("bob", true, 20.0),
            invoice_item("Bob", true, 30.0),
            invoice_item("Alice", false, 50.0),
            invoice_item("self", true, 100.0),
        ];

        let debtors = build_invoice_debtors(&rows);

        assert_eq!(debtors.len(), 2);
        let bob = debtors
            .iter()
            .find(|debtor| debtor.recipient_key == "bob")
            .expect("Bob should receive an invoice");
        assert_eq!(bob.recipient_name, "Bob");
        assert_eq!(bob.items.len(), 2);
        assert_eq!(bob.tax_share, 6.67);
        assert!(!debtors.iter().any(|debtor| debtor.recipient_key == "self"));
    }

    #[test]
    fn debtor_invoice_numbers_are_stable_and_distinct() {
        let first = invoice_number_for_debtor("receipt-1", "alice");
        assert_eq!(first, invoice_number_for_debtor("receipt-1", "alice"));
        assert_ne!(first, invoice_number_for_debtor("receipt-1", "bob"));
        assert!(first.len() <= 25);
    }

    #[test]
    fn splits_a_prompt_name_for_paypal() {
        let name = paypal_name(&display_recipient_name("bob smith"));
        assert_eq!(name.given_name, "Bob");
        assert_eq!(name.surname, "Smith");
    }
}
