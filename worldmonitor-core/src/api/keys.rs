//! API key management — `/api/keys`.
//!
//!   * `POST   /api/keys`      — mint a key (Enterprise only). Raw token returned once.
//!   * `GET    /api/keys`      — list the caller's keys (secrets redacted).
//!   * `DELETE /api/keys/:id`  — revoke one of the caller's keys.
//!
//! Tokens are `wm_<32 hex>` (128 bits of `getrandom` entropy via UUID v4); only
//! their SHA-256 hash is persisted. Creation is gated to Enterprise; listing and
//! revoking are available to the owner regardless of current tier (so a
//! downgraded user can still clean up).

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::Json,
    Json as AxumJson,
};
use std::sync::Arc;
use tracing::info;

use crate::{
    auth::{authenticate, hash_token, AuthError},
    models::{
        requests::CreateApiKeyRequest,
        responses::{ApiKeyCreatedResponse, ApiKeyInfo, ApiKeysResponse, ErrorResponse},
    },
    AppState,
};

/// POST /api/keys — create a new Enterprise API key.
pub async fn create_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    AxumJson(request): AxumJson<CreateApiKeyRequest>,
) -> Result<Json<ApiKeyCreatedResponse>, (StatusCode, Json<ErrorResponse>)> {
    let authed = authenticate(&state, &headers).await.map_err(auth_err)?;

    if !authed.tier.can_issue_api_keys() {
        return Err(err(
            StatusCode::FORBIDDEN,
            "API keys are an Enterprise feature. Upgrade to Enterprise to create keys.",
        ));
    }

    // wm_ + 32 hex chars (128 bits) sourced from the OS CSPRNG via UUID v4.
    let token = format!("wm_{}", uuid::Uuid::new_v4().simple());
    let prefix = token.chars().take(11).collect::<String>(); // "wm_" + 8 hex
    let key_hash = hash_token(&token);
    let id = uuid::Uuid::new_v4().to_string();
    let name = request
        .name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());

    state
        .db
        .create_api_key(&id, &authed.user_id, &key_hash, &prefix, name)
        .await
        .map_err(|e| {
            tracing::error!("Failed to create API key: {}", e);
            err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to create API key",
            )
        })?;

    info!(
        "Minted API key {} (prefix {}) for user {}",
        id, prefix, authed.user_id
    );

    Ok(Json(ApiKeyCreatedResponse {
        id,
        key: token,
        prefix,
        name: name.map(str::to_string),
    }))
}

/// GET /api/keys — list the caller's keys (no secrets).
pub async fn list_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<ApiKeysResponse>, (StatusCode, Json<ErrorResponse>)> {
    let authed = authenticate(&state, &headers).await.map_err(auth_err)?;

    let keys = state.db.list_api_keys(&authed.user_id).await.map_err(|e| {
        tracing::error!("Failed to list API keys: {}", e);
        err(StatusCode::INTERNAL_SERVER_ERROR, "Failed to list API keys")
    })?;

    let keys = keys
        .into_iter()
        .map(|k| ApiKeyInfo {
            id: k.id,
            prefix: k.prefix,
            name: k.name,
            created_at: k.created_at,
            last_used_at: k.last_used_at,
            revoked: k.revoked != 0,
        })
        .collect();

    Ok(Json(ApiKeysResponse { keys }))
}

/// DELETE /api/keys/:id — revoke one of the caller's keys.
pub async fn revoke_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    let authed = authenticate(&state, &headers).await.map_err(auth_err)?;

    let revoked = state
        .db
        .revoke_api_key(&authed.user_id, &id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to revoke API key: {}", e);
            err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to revoke API key",
            )
        })?;

    if !revoked {
        return Err(err(StatusCode::NOT_FOUND, "No such key"));
    }

    info!("Revoked API key {} for user {}", id, authed.user_id);
    Ok(StatusCode::NO_CONTENT)
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
