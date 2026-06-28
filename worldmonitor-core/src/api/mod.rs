use axum::{http::StatusCode, response::Json};

use crate::models::responses::ErrorResponse;

pub mod alerts;
pub mod billing;
pub mod brief;
pub mod geo;
pub mod intelligence;
pub mod sse;
pub mod sync;
pub mod user;

pub fn error_response(status: StatusCode, message: &str) -> (StatusCode, Json<ErrorResponse>) {
    (
        status,
        Json(ErrorResponse {
            error: message.to_string(),
        }),
    )
}
