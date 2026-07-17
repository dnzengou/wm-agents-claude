use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::Json,
    Json as AxumJson,
};
use std::sync::Arc;
use tracing::{info, warn};

use crate::{
    models::{
        requests::AlertRequest,
        responses::{ErrorResponse, SuccessResponse},
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
