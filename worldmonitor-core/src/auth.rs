//! Request authentication — resolves the caller into a `(user_id, tier)` pair.
//!
//! Two mechanisms, checked in order:
//!   1. **API key** (Enterprise): `Authorization: Bearer wm_…` or `X-API-Key: wm_…`.
//!      The token is SHA-256 hashed and matched against `api_keys`; a match
//!      authenticates as the owning user at that user's tier.
//!   2. **`X-User-Id` header** (the existing browser convention): defaults to
//!      `anonymous` when absent, matching every other endpoint.
//!
//! A malformed or revoked `wm_` token is a hard 401 — we never silently fall
//! back to `X-User-Id` when the caller clearly intended key auth, so a leaked
//! key that's been revoked can't be downgraded into anonymous access.

use axum::http::{header::AUTHORIZATION, HeaderMap};
use sha2::{Digest, Sha256};

use crate::{models::Tier, AppState};

/// The resolved caller.
pub struct AuthedUser {
    pub user_id: String,
    pub tier: Tier,
    /// True when authenticated via an API key rather than `X-User-Id`.
    pub via_api_key: bool,
}

/// Why authentication failed.
pub enum AuthError {
    /// A `wm_` token was presented but is unknown or revoked.
    InvalidKey,
    /// A database error prevented resolution.
    Internal,
}

/// SHA-256 hex of a raw token — the stored form of every API key.
pub fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

/// Extract a `wm_` API token from either the `X-API-Key` header or a
/// `Authorization: Bearer …` header. Returns `None` when neither is present.
fn api_token(headers: &HeaderMap) -> Option<String> {
    if let Some(v) = headers.get("X-API-Key").and_then(|h| h.to_str().ok()) {
        let v = v.trim();
        if v.starts_with("wm_") {
            return Some(v.to_string());
        }
    }
    if let Some(v) = headers.get(AUTHORIZATION).and_then(|h| h.to_str().ok()) {
        if let Some(rest) = v.strip_prefix("Bearer ") {
            let t = rest.trim();
            if t.starts_with("wm_") {
                return Some(t.to_string());
            }
        }
    }
    None
}

/// Plain `X-User-Id` (defaults to `anonymous`), the browser convention.
fn user_id_header(headers: &HeaderMap) -> String {
    headers
        .get("X-User-Id")
        .and_then(|h| h.to_str().ok())
        .filter(|s| !s.is_empty())
        .unwrap_or("anonymous")
        .to_string()
}

/// Resolve the caller. Prefers API-key auth; falls back to `X-User-Id`.
pub async fn authenticate(state: &AppState, headers: &HeaderMap) -> Result<AuthedUser, AuthError> {
    if let Some(token) = api_token(headers) {
        let hash = hash_token(&token);
        match state.db.find_active_api_key(&hash).await {
            Ok(Some(key)) => {
                // Best-effort usage stamp; never blocks the request.
                let _ = state.db.touch_api_key(&key.id).await;
                let tier = state
                    .db
                    .get_or_create_user(&key.user_id)
                    .await
                    .map(|u| u.tier())
                    .map_err(|_| AuthError::Internal)?;
                return Ok(AuthedUser {
                    user_id: key.user_id,
                    tier,
                    via_api_key: true,
                });
            }
            Ok(None) => return Err(AuthError::InvalidKey),
            Err(_) => return Err(AuthError::Internal),
        }
    }

    let user_id = user_id_header(headers);
    let tier = state
        .db
        .get_or_create_user(&user_id)
        .await
        .map(|u| u.tier())
        .map_err(|_| AuthError::Internal)?;

    Ok(AuthedUser {
        user_id,
        tier,
        via_api_key: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_is_stable_and_hex() {
        let h = hash_token("wm_abc123");
        assert_eq!(h.len(), 64);
        assert_eq!(h, hash_token("wm_abc123"));
        assert_ne!(h, hash_token("wm_different"));
    }

    #[test]
    fn extracts_token_from_both_headers() {
        let mut h = HeaderMap::new();
        h.insert("X-API-Key", "wm_fromheader".parse().unwrap());
        assert_eq!(api_token(&h).as_deref(), Some("wm_fromheader"));

        let mut h = HeaderMap::new();
        h.insert(AUTHORIZATION, "Bearer wm_frombearer".parse().unwrap());
        assert_eq!(api_token(&h).as_deref(), Some("wm_frombearer"));

        // Non-wm bearer tokens are ignored (not our scheme).
        let mut h = HeaderMap::new();
        h.insert(AUTHORIZATION, "Bearer somejwt".parse().unwrap());
        assert!(api_token(&h).is_none());
    }

    #[test]
    fn user_id_defaults_to_anonymous() {
        let h = HeaderMap::new();
        assert_eq!(user_id_header(&h), "anonymous");

        let mut h = HeaderMap::new();
        h.insert("X-User-Id", "user-42".parse().unwrap());
        assert_eq!(user_id_header(&h), "user-42");
    }
}
