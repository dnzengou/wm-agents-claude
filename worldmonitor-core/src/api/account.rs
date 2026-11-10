//! Cross-device sign-in by handle + passphrase — `/api/account`.
//!
//!   * `GET  /status`  — is this browser's account named for sync? (+ handle)
//!   * `POST /link`    — name the current account with a handle + passphrase
//!   * `POST /signin`  — adopt the account a handle + passphrase points to
//!
//! The passphrase is never stored: we keep a PBKDF2-HMAC-SHA256 hash with a
//! per-record random salt. This is lightweight account linking, not a hardened
//! auth system — a weak passphrase is a weak account — so we enforce a minimum
//! length and rate-limit failed sign-ins. Sign-in returns the account's
//! `user_id`, which the client stores as its local identity so every endpoint
//! (tier, alerts, history, keys, channels) resolves to that account.

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::Json,
    Json as AxumJson,
};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::sync::Arc;
use tracing::{info, warn};

use crate::{
    auth::{authenticate, AuthError},
    models::{
        requests::AccountCredentials,
        responses::{AccountStatusResponse, ErrorResponse, SignInResponse, SuccessResponse},
    },
    AppState,
};

type HmacSha256 = Hmac<Sha256>;

/// PBKDF2 work factor. 100k SHA-256 iterations is a reasonable floor for a
/// self-hosted demo; not Argon2-strong, but far above a bare hash.
const PBKDF2_ITERATIONS: u32 = 100_000;
const MIN_PASSPHRASE_LEN: usize = 8;
const MAX_HANDLE_LEN: usize = 64;
const MAX_FAILED_SIGNINS: u32 = 10;
const SIGNIN_WINDOW_SECS: u64 = 900;

/// PBKDF2-HMAC-SHA256, single 32-byte output block (dkLen == hLen).
fn pbkdf2_sha256(passphrase: &[u8], salt: &[u8], iterations: u32) -> [u8; 32] {
    // U1 = PRF(pass, salt || INT_32_BE(1))
    let mut mac = HmacSha256::new_from_slice(passphrase).expect("HMAC accepts keys of any length");
    mac.update(salt);
    mac.update(&1u32.to_be_bytes());
    let mut u = [0u8; 32];
    u.copy_from_slice(&mac.finalize().into_bytes());

    let mut acc = u;
    for _ in 1..iterations.max(1) {
        let mut mac =
            HmacSha256::new_from_slice(passphrase).expect("HMAC accepts keys of any length");
        mac.update(&u);
        let mut next = [0u8; 32];
        next.copy_from_slice(&mac.finalize().into_bytes());
        u = next;
        for (a, x) in acc.iter_mut().zip(u.iter()) {
            *a ^= *x;
        }
    }
    acc
}

/// Hex PBKDF2 hash of a passphrase against a hex salt.
fn hash_passphrase(passphrase: &str, salt_hex: &str, iterations: u32) -> String {
    let salt = hex::decode(salt_hex).unwrap_or_default();
    hex::encode(pbkdf2_sha256(passphrase.as_bytes(), &salt, iterations))
}

/// Constant-time hex-digest comparison (avoids leaking the hash via timing).
fn ct_eq_hex(a: &str, b: &str) -> bool {
    match (hex::decode(a), hex::decode(b)) {
        (Ok(x), Ok(y)) if x.len() == y.len() => {
            let mut diff = 0u8;
            for (p, q) in x.iter().zip(y.iter()) {
                diff |= p ^ q;
            }
            diff == 0
        }
        _ => false,
    }
}

/// Normalize a handle: trimmed + lowercased (handles are case-insensitive).
fn normalize_handle(handle: &str) -> String {
    handle.trim().to_lowercase()
}

fn fail_key(handle: &str) -> String {
    format!("authfail:{}", handle)
}

/// GET /api/account/status — whether this browser's account is named for sync.
pub async fn status_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<AccountStatusResponse>, (StatusCode, Json<ErrorResponse>)> {
    let authed = authenticate(&state, &headers).await.map_err(auth_err)?;

    let handle = state
        .db
        .get_link_for_user(&authed.user_id)
        .await
        .map_err(|e| {
            tracing::error!("account status lookup failed: {}", e);
            err(StatusCode::INTERNAL_SERVER_ERROR, "Failed to load account")
        })?;

    Ok(Json(AccountStatusResponse {
        user_id: authed.user_id,
        linked: handle.is_some(),
        handle,
    }))
}

/// POST /api/account/link — name the current account with a handle + passphrase.
pub async fn link_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    AxumJson(req): AxumJson<AccountCredentials>,
) -> Result<Json<SuccessResponse>, (StatusCode, Json<ErrorResponse>)> {
    let authed = authenticate(&state, &headers).await.map_err(auth_err)?;

    let handle = normalize_handle(&req.handle);
    if handle.is_empty() || handle.len() > MAX_HANDLE_LEN {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "Choose a handle of 1–64 characters",
        ));
    }
    if req.passphrase.chars().count() < MIN_PASSPHRASE_LEN {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "Passphrase must be at least 8 characters",
        ));
    }

    let salt = hex::encode(uuid::Uuid::new_v4().as_bytes());
    let hash = hash_passphrase(&req.passphrase, &salt, PBKDF2_ITERATIONS);

    let created = state
        .db
        .create_account_link(
            &handle,
            &authed.user_id,
            &salt,
            &hash,
            PBKDF2_ITERATIONS as i64,
        )
        .await
        .map_err(|e| {
            tracing::error!("account link failed: {}", e);
            err(StatusCode::INTERNAL_SERVER_ERROR, "Failed to link account")
        })?;

    if !created {
        return Err(err(
            StatusCode::CONFLICT,
            "That handle is taken — sign in instead, or choose another",
        ));
    }

    info!("Linked account {} to handle {}", authed.user_id, handle);
    Ok(Json(SuccessResponse {
        success: true,
        message: Some(format!(
            "Account synced as “{}”. Sign in with this handle + passphrase on another device.",
            handle
        )),
    }))
}

/// POST /api/account/signin — adopt the account a handle + passphrase points to.
pub async fn signin_handler(
    State(state): State<Arc<AppState>>,
    AxumJson(req): AxumJson<AccountCredentials>,
) -> Result<Json<SignInResponse>, (StatusCode, Json<ErrorResponse>)> {
    let handle = normalize_handle(&req.handle);

    // Rate-limit failed attempts per handle.
    let fk = fail_key(&handle);
    if state.cache.get_json::<u32>(&fk).unwrap_or(0) >= MAX_FAILED_SIGNINS {
        warn!("Too many sign-in attempts for handle {}", handle);
        return Err(err(
            StatusCode::TOO_MANY_REQUESTS,
            "Too many attempts — try again later",
        ));
    }

    // Same error for unknown handle and wrong passphrase (no enumeration).
    let invalid = || err(StatusCode::UNAUTHORIZED, "Invalid handle or passphrase");

    let link = state.db.get_account_link(&handle).await.map_err(|e| {
        tracing::error!("account signin lookup failed: {}", e);
        err(StatusCode::INTERNAL_SERVER_ERROR, "Sign-in failed")
    })?;

    let record_failure = || {
        let n = state.cache.get_json::<u32>(&fk).unwrap_or(0) + 1;
        state.cache.put_json_with_ttl(&fk, &n, SIGNIN_WINDOW_SECS);
    };

    let Some(link) = link else {
        record_failure();
        return Err(invalid());
    };

    let computed = hash_passphrase(&req.passphrase, &link.salt, link.iterations as u32);
    if !ct_eq_hex(&computed, &link.hash) {
        record_failure();
        return Err(invalid());
    }

    state.cache.delete(&fk);
    info!("Sign-in for handle {} → account {}", handle, link.user_id);
    Ok(Json(SignInResponse {
        user_id: link.user_id,
        handle,
    }))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pbkdf2_matches_known_vector() {
        // RFC 6070-style check against a known PBKDF2-HMAC-SHA256 value for
        // ("password", "salt", 1): first 32 bytes.
        let out = pbkdf2_sha256(b"password", b"salt", 1);
        assert_eq!(
            hex::encode(out),
            "120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b"
        );
    }

    #[test]
    fn hash_roundtrip_and_ct_eq() {
        let salt = hex::encode(uuid::Uuid::new_v4().as_bytes());
        let h1 = hash_passphrase("correct horse", &salt, 2000);
        let h2 = hash_passphrase("correct horse", &salt, 2000);
        assert!(ct_eq_hex(&h1, &h2));
        // Wrong passphrase → different digest.
        let h3 = hash_passphrase("wrong horse", &salt, 2000);
        assert!(!ct_eq_hex(&h1, &h3));
    }

    #[test]
    fn handle_normalization() {
        assert_eq!(normalize_handle("  Alice  "), "alice");
        assert_eq!(normalize_handle("BOB"), "bob");
    }
}
