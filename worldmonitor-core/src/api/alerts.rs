use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::Json,
    Json as AxumJson,
};
use std::sync::Arc;
use tracing::{info, warn};

use crate::{
    auth::{authenticate, AuthError},
    models::{
        requests::AlertRequest,
        responses::{AlertInfo, AlertsResponse, ErrorResponse, SuccessResponse},
    },
    AppState,
};

/// POST /api/alerts - Subscribe to alerts for a country
pub async fn handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    AxumJson(request): AxumJson<AlertRequest>,
) -> Result<Json<SuccessResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user_id = headers
        .get("X-User-Id")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("anonymous");

    info!(
        "Handling POST /api/alerts for user: {}, country: {}",
        user_id, request.country
    );

    // Tier-aware alert limit: free tier is capped at MAX_ALERTS_FREE,
    // paid tiers (Pro/Enterprise) get unlimited alerts.
    let tier = match state.db.get_or_create_user(user_id).await {
        Ok(user) => user.tier(),
        Err(e) => {
            tracing::error!("Database error: {}", e);
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to load account".to_string(),
                }),
            ));
        }
    };

    if let Some(limit) = tier.max_alerts(state.config.max_alerts_free) {
        match state.db.count_alerts(user_id).await {
            Ok(count) => {
                if count >= limit as i64 {
                    warn!(
                        "User {} exceeded {} tier alert limit ({})",
                        user_id,
                        tier.as_str(),
                        limit
                    );
                    return Err((
                        StatusCode::FORBIDDEN,
                        Json(ErrorResponse {
                            error: format!(
                                "Free tier limit reached ({} alerts max). Upgrade to Pro for unlimited alerts.",
                                limit
                            ),
                        }),
                    ));
                }
            }
            Err(e) => {
                tracing::error!("Database error: {}", e);
                return Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: "Failed to check alert limit".to_string(),
                    }),
                ));
            }
        }
    }

    // Create alert
    match state
        .db
        .create_alert(user_id, &request.country, request.threshold)
        .await
    {
        Ok(_) => {
            info!(
                "Alert created for user: {}, country: {}",
                user_id, request.country
            );
            Ok(Json(SuccessResponse {
                success: true,
                message: Some(format!("Alert created for {}", request.country)),
            }))
        }
        Err(e) => {
            tracing::error!("Database error: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to create alert".to_string(),
                }),
            ))
        }
    }
}

/// GET /api/alerts - List the caller's alert subscriptions and their tier cap.
pub async fn list_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<AlertsResponse>, (StatusCode, Json<ErrorResponse>)> {
    let authed = authenticate(&state, &headers).await.map_err(auth_err)?;

    let alerts = state.db.get_alerts(&authed.user_id).await.map_err(|e| {
        tracing::error!("Database error in alerts list: {}", e);
        err(StatusCode::INTERNAL_SERVER_ERROR, "Failed to load alerts")
    })?;

    let alerts = alerts
        .into_iter()
        .map(|a| AlertInfo {
            id: a.id,
            country: a.country,
            threshold: a.threshold,
            created_at: a.created_at,
        })
        .collect();

    Ok(Json(AlertsResponse {
        alerts,
        max_alerts: authed.tier.max_alerts(state.config.max_alerts_free),
    }))
}

/// DELETE /api/alerts/:id - Remove one of the caller's alert subscriptions.
pub async fn delete_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<StatusCode, (StatusCode, Json<ErrorResponse>)> {
    let authed = authenticate(&state, &headers).await.map_err(auth_err)?;

    let removed = state
        .db
        .delete_alert(&authed.user_id, id)
        .await
        .map_err(|e| {
            tracing::error!("Database error deleting alert: {}", e);
            err(StatusCode::INTERNAL_SERVER_ERROR, "Failed to delete alert")
        })?;

    if !removed {
        return Err(err(StatusCode::NOT_FOUND, "No such alert"));
    }

    info!("Deleted alert {} for user {}", id, authed.user_id);
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
