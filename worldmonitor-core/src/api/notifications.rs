//! Notification channels — `/api/notifications`.
//!
//!   * `GET  /api/notifications` — which channels are configured (secrets redacted).
//!   * `POST /api/notifications` — set Slack / Telegram channels (paid tiers only).
//!
//! Push *delivery* is a paid feature, so `POST` is gated to Pro/Enterprise;
//! `GET` is open so the UI can render current state and an upgrade prompt. On
//! `POST`, an absent field is left unchanged and an explicit empty string clears
//! it — letting the client patch one channel without wiping the other.

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::Json,
    Json as AxumJson,
};
use std::sync::Arc;
use tracing::info;

use crate::{
    auth::{authenticate, AuthError},
    models::{
        requests::NotificationChannelsRequest,
        responses::{ErrorResponse, NotificationChannelsResponse},
        NotificationChannels,
    },
    AppState,
};

/// GET /api/notifications — current channel status.
pub async fn get_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<NotificationChannelsResponse>, (StatusCode, Json<ErrorResponse>)> {
    let authed = authenticate(&state, &headers).await.map_err(auth_err)?;

    let channels = state
        .db
        .get_notification_channels(&authed.user_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to load notification channels: {}", e);
            err(StatusCode::INTERNAL_SERVER_ERROR, "Failed to load channels")
        })?;

    Ok(Json(to_response(channels.as_ref(), authed.tier.is_paid())))
}

/// POST /api/notifications — set channels (paid tiers only).
pub async fn post_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    AxumJson(request): AxumJson<NotificationChannelsRequest>,
) -> Result<Json<NotificationChannelsResponse>, (StatusCode, Json<ErrorResponse>)> {
    let authed = authenticate(&state, &headers).await.map_err(auth_err)?;

    if !authed.tier.is_paid() {
        return Err(err(
            StatusCode::FORBIDDEN,
            "Slack & Telegram delivery is a paid feature. Upgrade to Pro to enable it.",
        ));
    }

    // Merge onto existing: absent field = unchanged, empty string = clear.
    let existing = state
        .db
        .get_notification_channels(&authed.user_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to load notification channels: {}", e);
            err(StatusCode::INTERNAL_SERVER_ERROR, "Failed to load channels")
        })?;

    let merged = merge(existing, &request);

    state
        .db
        .set_notification_channels(
            &authed.user_id,
            merged.slack_webhook_url.as_deref(),
            merged.telegram_bot_token.as_deref(),
            merged.telegram_chat_id.as_deref(),
        )
        .await
        .map_err(|e| {
            tracing::error!("Failed to save notification channels: {}", e);
            err(StatusCode::INTERNAL_SERVER_ERROR, "Failed to save channels")
        })?;

    info!(
        "Updated notification channels for user {} (slack={}, telegram={})",
        authed.user_id,
        merged.slack_configured(),
        merged.telegram_configured()
    );

    Ok(Json(to_response(Some(&merged), true)))
}

/// Apply a patch request onto the existing (or empty) channel set.
fn merge(
    existing: Option<NotificationChannels>,
    req: &NotificationChannelsRequest,
) -> NotificationChannels {
    let mut base = existing.unwrap_or(NotificationChannels {
        user_id: String::new(),
        slack_webhook_url: None,
        telegram_bot_token: None,
        telegram_chat_id: None,
    });

    if let Some(v) = &req.slack_webhook_url {
        base.slack_webhook_url = normalize(v);
    }
    if let Some(v) = &req.telegram_bot_token {
        base.telegram_bot_token = normalize(v);
    }
    if let Some(v) = &req.telegram_chat_id {
        base.telegram_chat_id = normalize(v);
    }
    base
}

/// Trim; an empty value clears the field (stored as NULL).
fn normalize(v: &str) -> Option<String> {
    let t = v.trim();
    if t.is_empty() {
        None
    } else {
        Some(t.to_string())
    }
}

fn to_response(
    channels: Option<&NotificationChannels>,
    delivery_enabled: bool,
) -> NotificationChannelsResponse {
    match channels {
        Some(c) => NotificationChannelsResponse {
            slack_configured: c.slack_configured(),
            telegram_configured: c.telegram_configured(),
            telegram_chat_id: c.telegram_chat_id.clone().filter(|s| !s.is_empty()),
            delivery_enabled,
        },
        None => NotificationChannelsResponse {
            slack_configured: false,
            telegram_configured: false,
            telegram_chat_id: None,
            delivery_enabled,
        },
    }
}

fn auth_err(e: AuthError) -> (StatusCode, Json<ErrorResponse>) {
    match e {
        AuthError::InvalidKey => err(StatusCode::UNAUTHORIZED, "Invalid or revoked API key"),
        AuthError::Internal => err(StatusCode::INTERNAL_SERVER_ERROR, "Failed to authenticate"),
    }
}

fn err(status: StatusCode, msg: &str) -> (StatusCode, Json<ErrorResponse>) {
    (
        status,
        Json(ErrorResponse {
            error: msg.to_string(),
        }),
    )
}
