use std::format;

pub fn strip_prefix(b64: &str) -> &str {
    if let Some(pos) = b64.find(',') {
        &b64[pos + 1..]
    } else {
        b64
    }
}

pub fn detect_mime(b64: &str) -> String {
    if b64.starts_with("data:") {
        if let Some(end) = b64.find(';') {
            return b64[5..end].to_string();
        }
    }
    "image/png".to_string() //default fallback
}

pub fn build_data_url(clean_64: &str, mime: &str) -> String {
    format!("data:{};base64,{}", mime, clean_64)
}
