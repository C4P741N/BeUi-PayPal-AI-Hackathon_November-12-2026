use serde::{Deserialize, Serialize};


#[derive(Deserialize)]
pub struct ConvertRequest {
    pub image: String,
    pub prompt: Option<String>,
}

#[derive(Serialize)]
pub struct ConvertResponse {
    pub text: String,
}