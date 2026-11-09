use serde::{Deserialize, Serialize};


#[derive(Deserialize)]
pub struct InvoiceRequest {
    pub transaction_number: String,
}

#[derive(Deserialize)]
pub struct ConvertRequest {
    pub image: String,
    pub prompt: Option<String>,
}


#[derive(Serialize)]
pub struct SendInvoiceRequest {
    pub send_to_recipient: bool,
    pub send_to_invoicer: bool,
    pub subject: String, 
    pub note: String,
}
