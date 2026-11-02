use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct ImageUrl {
    pub url: String,
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentPart {
    Text { text: String },
    ImageUrl { image_url: ImageUrl },
}

#[derive(Serialize)]
pub struct Message {
    pub role: String,
    pub content: Vec<ContentPart>,
}

#[derive(Serialize)]
pub struct ChatRequest {
    pub(crate) model: String,
    pub(crate) messages: Vec<Message>,
    pub(crate) max_tokens: u32,
}

#[derive(Deserialize)]
pub struct ResponseContent {
    pub(crate) content: String,
}

#[derive(Deserialize)]
pub struct ResponseMessage {
    pub(crate) message: ResponseContent,
}

#[derive(Deserialize)]
pub struct ChatResponse {
    pub(crate) choices: Vec<ResponseMessage>,
}
