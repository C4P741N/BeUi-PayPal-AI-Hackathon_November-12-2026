use std::time::Duration;

use crate::config::AppConfig;

use super::types::*;
use indicatif::{ProgressBar, ProgressStyle};
use reqwest::{
    Client,
    header::{ACCEPT, CONTENT_TYPE, HeaderMap},
};
use serde::{Serialize, de::DeserializeOwned};

pub async fn send_request(
    config: &AppConfig,
    data_url: &str,
    prompt: &str,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let spinner = ProgressBar::new_spinner();

    spinner.set_style(
        ProgressStyle::default_spinner()
            .tick_strings(&["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"])
            .template("{spinner} {msg}")?,
    );
    spinner.set_message("Waiting for API response...");
    spinner.enable_steady_tick(Duration::from_millis(100));

    let payload = ChatRequest {
        model: config.model_name.clone(),
        max_tokens: config.max_tokens,
        messages: vec![
            Message {
                role: "system".to_string(),
                content: vec![ContentPart::Text {
                    text: config.system_command.to_string(),
                }],
            },
            Message {
                role: "user".to_string(),
                content: vec![
                    ContentPart::ImageUrl {
                        image_url: ImageUrl {
                            url: data_url.to_string(),
                        },
                    },
                    ContentPart::Text {
                        text: format!(
                            "Receipt allocation instructions:\n{}\n\nExtract the receipt from the attached image and allocate items accordingly.",
                            prompt
                        ),
                    },
                ],
            },
        ],
    };

    //let json_payload = serde_json::to_string_pretty(&payload).expect("Failed to serialize payload");

    //print!("Generated payload: {}", json_payload);

    let client = Client::new();
    let res = client
        .post(config.model_route.clone())
        .bearer_auth(config.model_api_key.clone())
        .json(&payload)
        .send()
        .await?;

    spinner.finish_and_clear();

    if !res.status().is_success() {
        let err_body = res.text().await?;
        return Err(format!("Api error: {}", err_body).into());
    }

    let data: ChatResponse = res.json().await?;

    println!("ChatResponse >> {:#?}", data);

    Ok(data
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content)
        .unwrap_or_else(|| "No response".to_string()))
}

pub async fn send_post_request<T, R>(
    access_token: &str,
    data_url: &str,
    payload: &T,
    extra_headers: Option<HeaderMap>,
) -> Result<R, Box<dyn std::error::Error + Send + Sync>>
where
    T: Serialize + ?Sized,
    R: DeserializeOwned,
{
    let client = Client::new();

    // Default headers
    let mut headers = HeaderMap::new();

    headers.insert(CONTENT_TYPE, "application/json".parse()?);

    headers.insert(ACCEPT, "application/json".parse()?);

    // Add custom headers
    if let Some(custom_headers) = extra_headers {
        headers.extend(custom_headers);
    }

    // Execute POST request
    let response = client
        .post(data_url)
        .bearer_auth(access_token)
        .headers(headers)
        .json(payload)
        .send()
        .await?;

    let status = response.status();

    // Handle API errors
    if !status.is_success() {
        let error_body = response.text().await?;

        return Err(format!(
            "API request failed. Status: {}. Response: {}",
            status, error_body
        )
        .into());
    }

    // Deserialize response
    let result = response.json::<R>().await?;

    Ok(result)
}
