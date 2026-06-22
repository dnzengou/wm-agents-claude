use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::Json,
    Json as AxumJson,
};
use chrono::Utc;
use std::sync::Arc;
use tracing::{debug, info};

use crate::{
    cache::{strategies::*, Cache},
    models::{requests::UserUpdateRequest, responses::{ErrorResponse, UserResponse}},
    AppState,
};

/// GET /api/user - Get user profile
pub async fn get_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<UserResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user_id = headers
        .get("X-User-Id")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("anonymous");

    info!("Handling GET /api/user for user: {}", user_id);

    // Check cache first
    let cache_key = Cache::key_user(user_id);
    if let Some(cached) = state.cache.get_json::<UserResponse>(&cache_key) {
        debug!("Returning cached user data for {}", user_id);
        return Ok(Json(cached));
    }

    // Get or create user
    match state.db.get_or_create_user(user_id).await {
        Ok(user) => {
            // Calculate streak
            let now = Utc::now();
            let last_visit = user.last_visit.unwrap_or(now);
            let diff_days = (now - last_visit).num_days();

            let new_streak = if diff_days == 1 {
                user.streak + 1
            } else if diff_days > 1 {
                0
            } else {
                user.streak
            };

            // Update streak if needed
            if diff_days >= 1 {
                let _ = state.db.update_streak(user_id, new_streak).await;
            }

            let is_new = user.last_visit.is_none();

            let response = UserResponse {
                user_id: user.id.clone(),
                streak: new_streak,
                interests: user.get_interests(),
                countries: user.get_countries(),
                is_new: if is_new { Some(true) } else { None },
            };

            // Cache the response
            state.cache.put_json_with_ttl(&cache_key, &response, USER_TTL);

            Ok(Json(response))
        }
        Err(e) => {
            tracing::error!("Database error: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to get user".to_string(),
                }),
            ))
        }
    }
}

/// POST /api/user - Update user preferences
pub async fn post_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    AxumJson(request): AxumJson<UserUpdateRequest>,
) -> Result<Json<UserResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user_id = headers
        .get("X-User-Id")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("anonymous");

    info!("Handling POST /api/user for user: {}", user_id);

    // Get user
    let mut user = match state.db.get_or_create_user(user_id).await {
        Ok(u) => u,
        Err(e) => {
            tracing::error!("Database error: {}", e);
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to get user".to_string(),
                }),
            ));
        }
    };

    // Update only provided fields
    if let Some(interests) = request.interests {
        user.set_interests(interests);
    }
    if let Some(countries) = request.countries {
        user.set_countries(countries);
    }

    // Save to database
    match state.db.update_user(&user).await {
        Ok(_) => {
            // Invalidate cache
            let cache_key = Cache::key_user(user_id);
            state.cache.delete(&cache_key);

            let response = UserResponse {
                user_id: user.id.clone(),
                streak: user.streak,
                interests: user.get_interests(),
                countries: user.get_countries(),
                is_new: None,
            };

            Ok(Json(response))
        }
        Err(e) => {
            tracing::error!("Database error: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to update user".to_string(),
                }),
            ))
        }
    }
}
