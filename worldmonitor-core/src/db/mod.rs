use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    Pool, Sqlite,
};
use std::str::FromStr;
use tracing::info;

use crate::models::{Alert, ApiKey, IntelEvent, NotificationChannels, User};

/// Database wrapper for SQLite/D1 operations
#[derive(Clone)]
pub struct Database {
    pool: Pool<Sqlite>,
}

impl Database {
    /// Create new database connection pool.
    /// Uses create_if_missing so fresh containers start cleanly without pre-existing .db file.
    pub async fn new(database_url: &str) -> anyhow::Result<Self> {
        let opts = SqliteConnectOptions::from_str(database_url)?.create_if_missing(true);
        let pool = SqlitePoolOptions::new()
            .max_connections(10)
            .connect_with(opts)
            .await?;

        Ok(Self { pool })
    }

    /// Run database migrations
    pub async fn run_migrations(&self) -> anyhow::Result<()> {
        info!("Running database migrations");

        // Create events table (includes domain column from v2)
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                country TEXT NOT NULL,
                lat REAL NOT NULL,
                lon REAL NOT NULL,
                severity INTEGER NOT NULL CHECK(severity BETWEEN 1 AND 10),
                headline TEXT NOT NULL,
                source TEXT CHECK(source IN ('gdelt', 'rss', 'manual')),
                timestamp INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                domain TEXT NOT NULL DEFAULT 'geopolitical',
                link TEXT
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Safe migrations for existing DBs — ignore errors when columns already exist.
        let _ = sqlx::query(
            "ALTER TABLE events ADD COLUMN domain TEXT NOT NULL DEFAULT 'geopolitical'",
        )
        .execute(&self.pool)
        .await;
        let _ = sqlx::query("ALTER TABLE events ADD COLUMN link TEXT")
            .execute(&self.pool)
            .await;

        // Create indexes for events
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)")
            .execute(&self.pool)
            .await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_events_country ON events(country)")
            .execute(&self.pool)
            .await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_events_location ON events(lat, lon)")
            .execute(&self.pool)
            .await?;

        // Create users table (includes monetization columns from v13)
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                interests TEXT DEFAULT '[]',
                countries TEXT DEFAULT '[]',
                alert_threshold INTEGER DEFAULT 5,
                streak INTEGER DEFAULT 0,
                last_visit DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                tier TEXT NOT NULL DEFAULT 'free',
                stripe_customer_id TEXT
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Safe migrations for existing DBs — ignore errors when columns already exist.
        let _ = sqlx::query("ALTER TABLE users ADD COLUMN tier TEXT NOT NULL DEFAULT 'free'")
            .execute(&self.pool)
            .await;
        let _ = sqlx::query("ALTER TABLE users ADD COLUMN stripe_customer_id TEXT")
            .execute(&self.pool)
            .await;
        // Map a Stripe customer back to its user when a subscription is cancelled.
        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id)",
        )
        .execute(&self.pool)
        .await?;

        // Create alerts table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                country TEXT NOT NULL,
                threshold INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Create corrections table (for crowdsourced accuracy)
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS corrections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id TEXT NOT NULL,
                lat REAL NOT NULL,
                lon REAL NOT NULL,
                weight INTEGER DEFAULT 1,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Create briefs cache table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS briefs_cache (
                country TEXT PRIMARY KEY,
                summary TEXT NOT NULL,
                event_count INTEGER NOT NULL,
                generated_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // API keys — programmatic Enterprise access. Only the SHA-256 hash of
        // each token is stored; the raw key is shown once at creation.
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS api_keys (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                key_hash TEXT NOT NULL UNIQUE,
                prefix TEXT NOT NULL,
                name TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_used_at DATETIME,
                revoked INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
            "#,
        )
        .execute(&self.pool)
        .await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)")
            .execute(&self.pool)
            .await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id)")
            .execute(&self.pool)
            .await?;

        // Per-user Slack / Telegram delivery channels.
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS notification_channels (
                user_id TEXT PRIMARY KEY,
                slack_webhook_url TEXT,
                telegram_bot_token TEXT,
                telegram_chat_id TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Idempotency guard: at most one push per (user, event). The dispatcher
        // inserts here before sending, so a re-fused event never double-notifies.
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS alert_notifications (
                user_id TEXT NOT NULL,
                event_id TEXT NOT NULL,
                sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, event_id)
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        info!("Database migrations completed successfully");
        Ok(())
    }

    // ==================== Event Operations ====================

    /// Insert or update an event
    pub async fn upsert_event(&self, event: &IntelEvent) -> anyhow::Result<()> {
        sqlx::query(
            r#"
            INSERT OR REPLACE INTO events (id, country, lat, lon, severity, headline, source, timestamp, domain, link)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&event.id)
        .bind(&event.country)
        .bind(event.lat)
        .bind(event.lon)
        .bind(event.severity)
        .bind(&event.headline)
        .bind(&event.source)
        .bind(event.timestamp)
        .bind(&event.domain)
        .bind(event.link.as_deref())
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Batch insert events
    pub async fn batch_insert_events(&self, events: &[IntelEvent]) -> anyhow::Result<usize> {
        if events.is_empty() {
            return Ok(0);
        }

        let mut tx = self.pool.begin().await?;
        let mut count = 0;

        for event in events {
            sqlx::query(
                r#"
                INSERT OR IGNORE INTO events (id, country, lat, lon, severity, headline, source, timestamp, domain, link)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                "#,
            )
            .bind(&event.id)
            .bind(&event.country)
            .bind(event.lat)
            .bind(event.lon)
            .bind(event.severity)
            .bind(&event.headline)
            .bind(&event.source)
            .bind(event.timestamp)
            .bind(&event.domain)
            .bind(event.link.as_deref())
            .execute(&mut *tx)
            .await?;
            count += 1;
        }

        tx.commit().await?;
        Ok(count)
    }

    /// Get recent events (last 24 hours)
    pub async fn get_recent_events(&self, limit: i32) -> anyhow::Result<Vec<IntelEvent>> {
        let events = sqlx::query_as::<_, IntelEvent>(
            r#"
            SELECT id, country, lat, lon, severity, headline, source, timestamp, created_at, domain, link
            FROM events
            WHERE timestamp > strftime('%s', 'now', '-24 hours') * 1000
            ORDER BY severity DESC, timestamp DESC
            LIMIT ?
            "#,
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(events)
    }

    /// Get events by country (last 24 hours)
    pub async fn get_events_by_country(&self, country: &str) -> anyhow::Result<Vec<IntelEvent>> {
        let events = sqlx::query_as::<_, IntelEvent>(
            r#"
            SELECT id, country, lat, lon, severity, headline, source, timestamp, created_at, domain, link
            FROM events
            WHERE country = ? AND timestamp > strftime('%s', 'now', '-24 hours') * 1000
            ORDER BY severity DESC, timestamp DESC
            LIMIT 10
            "#,
        )
        .bind(country)
        .fetch_all(&self.pool)
        .await?;

        Ok(events)
    }

    /// Get events since timestamp (for differential sync)
    pub async fn get_events_since(&self, since: i64) -> anyhow::Result<Vec<IntelEvent>> {
        let events = sqlx::query_as::<_, IntelEvent>(
            r#"
            SELECT id, country, lat, lon, severity, headline, source, timestamp, created_at, domain, link
            FROM events
            WHERE timestamp > ?
            ORDER BY timestamp DESC
            LIMIT 100
            "#,
        )
        .bind(since)
        .fetch_all(&self.pool)
        .await?;

        Ok(events)
    }

    /// Historical events for the paid-tier archive query.
    ///
    /// Returns events with `timestamp >= since_ms`, newest first, optionally
    /// filtered by country. The lookback window is enforced by the caller
    /// against the user's tier; this method just runs the bounded query.
    pub async fn get_events_history(
        &self,
        since_ms: i64,
        country: Option<&str>,
        limit: i64,
    ) -> anyhow::Result<Vec<IntelEvent>> {
        let events = match country {
            Some(c) => {
                sqlx::query_as::<_, IntelEvent>(
                    r#"
                    SELECT id, country, lat, lon, severity, headline, source, timestamp, created_at, domain, link
                    FROM events
                    WHERE timestamp >= ? AND country = ?
                    ORDER BY timestamp DESC
                    LIMIT ?
                    "#,
                )
                .bind(since_ms)
                .bind(c)
                .bind(limit)
                .fetch_all(&self.pool)
                .await?
            }
            None => {
                sqlx::query_as::<_, IntelEvent>(
                    r#"
                    SELECT id, country, lat, lon, severity, headline, source, timestamp, created_at, domain, link
                    FROM events
                    WHERE timestamp >= ?
                    ORDER BY timestamp DESC
                    LIMIT ?
                    "#,
                )
                .bind(since_ms)
                .bind(limit)
                .fetch_all(&self.pool)
                .await?
            }
        };

        Ok(events)
    }

    /// Clean up events older than the configured retention window. Defaults to
    /// 90 days so the Pro history query always has data to read. The modifier is
    /// bound as a parameter (not string-interpolated) to keep the query safe.
    pub async fn cleanup_old_events(&self, retention_days: i64) -> anyhow::Result<u64> {
        let modifier = format!("-{} days", retention_days.max(1));
        let result = sqlx::query(
            r#"
            DELETE FROM events
            WHERE timestamp < strftime('%s', 'now', ?) * 1000
            "#,
        )
        .bind(&modifier)
        .execute(&self.pool)
        .await?;

        // Bound the idempotency guard too — keep 7 days beyond the newest
        // possible re-fuse window; older rows can never match a live event.
        let _ = sqlx::query(
            "DELETE FROM alert_notifications WHERE sent_at < datetime('now', '-30 days')",
        )
        .execute(&self.pool)
        .await;

        Ok(result.rows_affected())
    }

    // ==================== User Operations ====================

    /// Get or create user
    pub async fn get_or_create_user(&self, user_id: &str) -> anyhow::Result<User> {
        let user: Option<User> = sqlx::query_as(
            r#"
            SELECT id, interests, countries, alert_threshold, streak, last_visit, created_at, tier, stripe_customer_id
            FROM users WHERE id = ?
            "#,
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?;

        match user {
            Some(u) => Ok(u),
            None => {
                let new_user = User::new(user_id);
                sqlx::query(
                    r#"
                    INSERT INTO users (id, interests, countries, alert_threshold, streak, last_visit, created_at, tier, stripe_customer_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    "#,
                )
                .bind(&new_user.id)
                .bind(&new_user.interests)
                .bind(&new_user.countries)
                .bind(new_user.alert_threshold)
                .bind(new_user.streak)
                .bind(new_user.last_visit)
                .bind(new_user.created_at)
                .bind(&new_user.tier)
                .bind(&new_user.stripe_customer_id)
                .execute(&self.pool)
                .await?;
                Ok(new_user)
            }
        }
    }

    /// Update user
    pub async fn update_user(&self, user: &User) -> anyhow::Result<()> {
        sqlx::query(
            r#"
            UPDATE users 
            SET interests = ?, countries = ?, alert_threshold = ?, streak = ?, last_visit = ?
            WHERE id = ?
            "#,
        )
        .bind(&user.interests)
        .bind(&user.countries)
        .bind(user.alert_threshold)
        .bind(user.streak)
        .bind(user.last_visit)
        .bind(&user.id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Update user streak
    pub async fn update_streak(&self, user_id: &str, streak: i32) -> anyhow::Result<()> {
        sqlx::query(
            r#"
            UPDATE users 
            SET streak = ?, last_visit = CURRENT_TIMESTAMP
            WHERE id = ?
            "#,
        )
        .bind(streak)
        .bind(user_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    // ==================== Billing / Tier Operations ====================

    /// Promote/demote a user to a tier and record their Stripe customer id.
    /// Creates the user row first if it doesn't exist yet (checkout can fire
    /// for an id we haven't persisted preferences for).
    pub async fn set_user_tier(
        &self,
        user_id: &str,
        tier: &str,
        stripe_customer_id: Option<&str>,
    ) -> anyhow::Result<()> {
        // Ensure the row exists so the UPDATE always lands.
        self.get_or_create_user(user_id).await?;

        sqlx::query(
            r#"
            UPDATE users
            SET tier = ?,
                stripe_customer_id = COALESCE(?, stripe_customer_id)
            WHERE id = ?
            "#,
        )
        .bind(tier)
        .bind(stripe_customer_id)
        .bind(user_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Reset whichever user owns this Stripe customer back to the free tier.
    /// Returns the affected user id (if any) for logging. Used by the
    /// `customer.subscription.deleted` webhook.
    pub async fn downgrade_by_stripe_customer(
        &self,
        stripe_customer_id: &str,
    ) -> anyhow::Result<Option<String>> {
        let user_id: Option<(String,)> =
            sqlx::query_as("SELECT id FROM users WHERE stripe_customer_id = ?")
                .bind(stripe_customer_id)
                .fetch_optional(&self.pool)
                .await?;

        if let Some((id,)) = &user_id {
            sqlx::query("UPDATE users SET tier = 'free' WHERE id = ?")
                .bind(id)
                .execute(&self.pool)
                .await?;
        }

        Ok(user_id.map(|(id,)| id))
    }

    // ==================== Alert Operations ====================

    /// Create alert
    pub async fn create_alert(
        &self,
        user_id: &str,
        country: &str,
        threshold: i32,
    ) -> anyhow::Result<()> {
        sqlx::query(
            r#"
            INSERT INTO alerts (user_id, country, threshold)
            VALUES (?, ?, ?)
            "#,
        )
        .bind(user_id)
        .bind(country)
        .bind(threshold)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Count alerts for user
    pub async fn count_alerts(&self, user_id: &str) -> anyhow::Result<i64> {
        let count: (i64,) = sqlx::query_as(
            r#"
            SELECT COUNT(*) FROM alerts WHERE user_id = ?
            "#,
        )
        .bind(user_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(count.0)
    }

    /// Get alerts for user
    pub async fn get_alerts(&self, user_id: &str) -> anyhow::Result<Vec<Alert>> {
        let alerts = sqlx::query_as::<_, Alert>(
            r#"
            SELECT id, user_id, country, threshold, created_at
            FROM alerts WHERE user_id = ?
            ORDER BY created_at DESC
            "#,
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(alerts)
    }

    /// Every alert across all users — the dispatcher's fan-out source.
    pub async fn get_all_alerts(&self) -> anyhow::Result<Vec<Alert>> {
        let alerts = sqlx::query_as::<_, Alert>(
            r#"
            SELECT id, user_id, country, threshold, created_at
            FROM alerts
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(alerts)
    }

    /// Idempotency guard for delivery: record that `event_id` has been pushed to
    /// `user_id`. Returns `true` only the first time (insert landed), so callers
    /// send exactly once even when the same event is re-fused across cycles.
    pub async fn mark_event_notified(&self, user_id: &str, event_id: &str) -> anyhow::Result<bool> {
        let result = sqlx::query(
            "INSERT OR IGNORE INTO alert_notifications (user_id, event_id) VALUES (?, ?)",
        )
        .bind(user_id)
        .bind(event_id)
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected() == 1)
    }

    // ==================== API Key Operations ====================

    /// Persist a freshly minted API key. Only the hash is stored.
    pub async fn create_api_key(
        &self,
        id: &str,
        user_id: &str,
        key_hash: &str,
        prefix: &str,
        name: Option<&str>,
    ) -> anyhow::Result<()> {
        // Ensure the owning user row exists (FK + tier lookups rely on it).
        self.get_or_create_user(user_id).await?;

        sqlx::query(
            r#"
            INSERT INTO api_keys (id, user_id, key_hash, prefix, name)
            VALUES (?, ?, ?, ?, ?)
            "#,
        )
        .bind(id)
        .bind(user_id)
        .bind(key_hash)
        .bind(prefix)
        .bind(name)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// List a user's keys (including revoked), newest first. Secrets are never
    /// stored in plaintext, so this is safe to surface directly.
    pub async fn list_api_keys(&self, user_id: &str) -> anyhow::Result<Vec<ApiKey>> {
        let keys = sqlx::query_as::<_, ApiKey>(
            r#"
            SELECT id, user_id, key_hash, prefix, name, created_at, last_used_at, revoked
            FROM api_keys WHERE user_id = ?
            ORDER BY created_at DESC
            "#,
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(keys)
    }

    /// Look up an active (non-revoked) key by its hash. `None` = no such live key.
    pub async fn find_active_api_key(&self, key_hash: &str) -> anyhow::Result<Option<ApiKey>> {
        let key = sqlx::query_as::<_, ApiKey>(
            r#"
            SELECT id, user_id, key_hash, prefix, name, created_at, last_used_at, revoked
            FROM api_keys WHERE key_hash = ? AND revoked = 0
            "#,
        )
        .bind(key_hash)
        .fetch_optional(&self.pool)
        .await?;

        Ok(key)
    }

    /// Stamp `last_used_at` on a key. Best-effort; failures are non-fatal.
    pub async fn touch_api_key(&self, id: &str) -> anyhow::Result<()> {
        sqlx::query("UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Revoke a key the caller owns. Returns `true` if a row was affected —
    /// scoping by `user_id` stops one user revoking another's key.
    pub async fn revoke_api_key(&self, user_id: &str, id: &str) -> anyhow::Result<bool> {
        let result = sqlx::query("UPDATE api_keys SET revoked = 1 WHERE id = ? AND user_id = ?")
            .bind(id)
            .bind(user_id)
            .execute(&self.pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }

    // ==================== Notification Channel Operations ====================

    /// Fetch a user's configured Slack / Telegram channels, if any.
    pub async fn get_notification_channels(
        &self,
        user_id: &str,
    ) -> anyhow::Result<Option<NotificationChannels>> {
        let channels = sqlx::query_as::<_, NotificationChannels>(
            r#"
            SELECT user_id, slack_webhook_url, telegram_bot_token, telegram_chat_id
            FROM notification_channels WHERE user_id = ?
            "#,
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(channels)
    }

    /// Upsert a user's notification channels. Callers pass the fully merged set
    /// (absent-means-unchanged is resolved in the handler before this call).
    pub async fn set_notification_channels(
        &self,
        user_id: &str,
        slack_webhook_url: Option<&str>,
        telegram_bot_token: Option<&str>,
        telegram_chat_id: Option<&str>,
    ) -> anyhow::Result<()> {
        self.get_or_create_user(user_id).await?;

        sqlx::query(
            r#"
            INSERT INTO notification_channels
                (user_id, slack_webhook_url, telegram_bot_token, telegram_chat_id, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET
                slack_webhook_url = excluded.slack_webhook_url,
                telegram_bot_token = excluded.telegram_bot_token,
                telegram_chat_id = excluded.telegram_chat_id,
                updated_at = CURRENT_TIMESTAMP
            "#,
        )
        .bind(user_id)
        .bind(slack_webhook_url)
        .bind(telegram_bot_token)
        .bind(telegram_chat_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    // ==================== Brief Cache Operations ====================

    /// Get cached brief
    pub async fn get_cached_brief(&self, country: &str) -> anyhow::Result<Option<(String, i32)>> {
        let result: Option<(String, i32)> = sqlx::query_as(
            r#"
            SELECT summary, event_count
            FROM briefs_cache
            WHERE country = ? AND expires_at > strftime('%s', 'now') * 1000
            "#,
        )
        .bind(country)
        .fetch_optional(&self.pool)
        .await?;

        Ok(result)
    }

    /// Cache brief
    pub async fn cache_brief(
        &self,
        country: &str,
        summary: &str,
        event_count: i32,
    ) -> anyhow::Result<()> {
        let now = chrono::Utc::now().timestamp_millis();
        let expires = now + (24 * 60 * 60 * 1000); // 24 hours

        sqlx::query(
            r#"
            INSERT OR REPLACE INTO briefs_cache (country, summary, event_count, generated_at, expires_at)
            VALUES (?, ?, ?, ?, ?)
            "#,
        )
        .bind(country)
        .bind(summary)
        .bind(event_count)
        .bind(now)
        .bind(expires)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Clear expired briefs
    pub async fn clear_expired_briefs(&self) -> anyhow::Result<u64> {
        let result = sqlx::query(
            r#"
            DELETE FROM briefs_cache 
            WHERE expires_at < strftime('%s', 'now') * 1000
            "#,
        )
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_database_operations() {
        let db = Database::new("sqlite::memory:").await.unwrap();
        db.run_migrations().await.unwrap();

        // Test event insertion
        let event = IntelEvent::new("Ukraine", 48.0, 31.0, 8, "Test conflict", "gdelt");
        db.upsert_event(&event).await.unwrap();

        let events = db.get_recent_events(10).await.unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].country, "Ukraine");
    }

    #[tokio::test]
    async fn test_tier_upgrade_and_downgrade() {
        let db = Database::new("sqlite::memory:").await.unwrap();
        db.run_migrations().await.unwrap();

        // New users start on the free tier.
        let user = db.get_or_create_user("u1").await.unwrap();
        assert_eq!(user.tier(), crate::models::Tier::Free);
        assert!(user.stripe_customer_id.is_none());

        // A completed checkout promotes them and records the Stripe customer.
        db.set_user_tier("u1", "pro", Some("cus_123"))
            .await
            .unwrap();
        let user = db.get_or_create_user("u1").await.unwrap();
        assert_eq!(user.tier(), crate::models::Tier::Pro);
        assert_eq!(user.stripe_customer_id.as_deref(), Some("cus_123"));

        // A subscription cancellation maps the customer back to free.
        let downgraded = db.downgrade_by_stripe_customer("cus_123").await.unwrap();
        assert_eq!(downgraded.as_deref(), Some("u1"));
        let user = db.get_or_create_user("u1").await.unwrap();
        assert_eq!(user.tier(), crate::models::Tier::Free);

        // Unknown customer is a no-op.
        let none = db
            .downgrade_by_stripe_customer("cus_missing")
            .await
            .unwrap();
        assert!(none.is_none());
    }

    #[tokio::test]
    async fn test_api_key_lifecycle() {
        let db = Database::new("sqlite::memory:").await.unwrap();
        db.run_migrations().await.unwrap();

        db.create_api_key("k1", "u1", "hash_abc", "wm_1a2b3c4d", Some("ci"))
            .await
            .unwrap();

        // Active lookup by hash resolves to the owner.
        let found = db.find_active_api_key("hash_abc").await.unwrap().unwrap();
        assert_eq!(found.user_id, "u1");
        assert_eq!(found.revoked, 0);

        // Revoking someone else's key is a no-op; the owner's succeeds.
        assert!(!db.revoke_api_key("intruder", "k1").await.unwrap());
        assert!(db.revoke_api_key("u1", "k1").await.unwrap());

        // Revoked keys no longer authenticate.
        assert!(db.find_active_api_key("hash_abc").await.unwrap().is_none());

        // Still visible in the owner's listing (as revoked).
        let list = db.list_api_keys("u1").await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].revoked, 1);
    }

    #[tokio::test]
    async fn test_notification_channels_upsert() {
        let db = Database::new("sqlite::memory:").await.unwrap();
        db.run_migrations().await.unwrap();

        assert!(db.get_notification_channels("u1").await.unwrap().is_none());

        db.set_notification_channels("u1", Some("https://hooks.slack/x"), None, None)
            .await
            .unwrap();
        let c = db.get_notification_channels("u1").await.unwrap().unwrap();
        assert_eq!(
            c.slack_webhook_url.as_deref(),
            Some("https://hooks.slack/x")
        );
        assert!(c.telegram_bot_token.is_none());

        // Upsert overwrites with the merged set.
        db.set_notification_channels("u1", Some("https://hooks.slack/x"), Some("tok"), Some("42"))
            .await
            .unwrap();
        let c = db.get_notification_channels("u1").await.unwrap().unwrap();
        assert!(c.telegram_configured());
    }

    #[tokio::test]
    async fn test_notification_idempotency_and_history() {
        let db = Database::new("sqlite::memory:").await.unwrap();
        db.run_migrations().await.unwrap();

        // First mark wins; the repeat is suppressed.
        assert!(db.mark_event_notified("u1", "e1").await.unwrap());
        assert!(!db.mark_event_notified("u1", "e1").await.unwrap());
        // Different user is independent.
        assert!(db.mark_event_notified("u2", "e1").await.unwrap());

        // History query honours the since bound.
        let event = IntelEvent::new("Ukraine", 48.0, 31.0, 9, "Historic", "gdelt");
        db.upsert_event(&event).await.unwrap();
        let all = db.get_events_history(0, None, 100).await.unwrap();
        assert_eq!(all.len(), 1);
        let future = db
            .get_events_history(chrono::Utc::now().timestamp_millis() + 1000, None, 100)
            .await
            .unwrap();
        assert!(future.is_empty());
    }
}
