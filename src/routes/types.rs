use serde::{Deserialize};


#[derive(Deserialize)]
pub struct ConvertRequest {
    pub image: String,
    pub prompt: Option<String>,
}