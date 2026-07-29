//! GET /api/history — tier-scoped access to the event archive.
//!
//! Free callers see a 1-day window; Pro unlocks 90 days; Enterprise a year
//! (see [`crate::models::Tier::max_history_days`]). The requested `days` is
//! clamped to the caller's ceiling, and the response reports both the applied
//! window and the ceiling so the UI can prompt an upgrade when truncated.

use axum::{
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::Json,
};
use std::sync::Arc;
use tracing::info;

use crate::{
    auth::{authenticate, AuthError},
    models::{
        requests::HistoryQuery,
        responses::{ErrorResponse, HistoryResponse},
    },
    AppState,
};

const DEFAULT_DAYS: i64 = 7;
const DEFAULT_LIMIT: i64 = 500;
const MAX_LIMIT: i64 = 5000;
const MS_PER_DAY: i64 = 86_400_000;

pub async fn handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(params): Query<HistoryQuery>,
) -> Result<Json<HistoryResponse>, (StatusCode, Json<ErrorResponse>)> {
    let authed = authenticate(&state, &headers).await.map_err(|e| match e {
        AuthError::InvalidKey => err(StatusCode::UNAUTHORIZED, "Invalid or revoked API key"),
        AuthError::Internal => err(StatusCode::INTERNAL_SERVER_ERROR, "Failed to authenticate"),
    })?;

    let tier = authed.tier;
    let max_days = tier.max_history_days(state.config.history_free_days);

    // Clamp the requested window to the tier ceiling.
    let requested = params.days.unwrap_or(DEFAULT_DAYS).max(1);
    let days = requested.min(max_days);
    let truncated = requested > max_days;

    let limit = params.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    let country = params
        .country
        .as_deref()
        .map(str::trim)
        .filter(|c| !c.is_empty());

    let since_ms = chrono::Utc::now().timestamp_millis() - days * MS_PER_DAY;

    info!(
        "GET /api/history user={} tier={} days={} (max={}) country={:?} limit={}",
        authed.user_id,
        tier.as_str(),
        days,
        max_days,
        country,
        limit
    );

    let events = state
        .db
        .get_events_history(since_ms, country, limit)
        .await
        .map_err(|e| {
            tracing::error!("Database error in history handler: {}", e);
            err(StatusCode::INTERNAL_SERVER_ERROR, "Failed to load history")
        })?;

    Ok(Json(HistoryResponse {
        events,
        days,
        max_days,
        tier: tier.as_str().to_string(),
        truncated,
    }))
}

fn err(status: StatusCode, msg: &str) -> (StatusCode, Json<ErrorResponse>) {
    (
        status,
        Json(ErrorResponse {
            error: msg.to_string(),
        }),
    )
}
