use std::time::Duration;

use crate::config::AppConfig;

use super::types::*;
use indicatif::{ProgressBar, ProgressStyle};
use reqwest::Client;

pub async fn send_request(
    config: &AppConfig,
    data_url: &str,
    prompt: &str,
) -> Result<String, Box<dyn std::error::Error>> {
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
