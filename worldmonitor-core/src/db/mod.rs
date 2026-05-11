use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    Pool, Sqlite,
};
use std::str::FromStr;
use tracing::info;

use crate::models::{Alert, IntelEvent, User};

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
                domain TEXT NOT NULL DEFAULT 'geopolitical'
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // ALTER TABLE migration for existing DBs that pre-date the domain column.
        // SQLite does not support ADD COLUMN IF NOT EXISTS, so we ignore the error.
        let _ = sqlx::query(
            "ALTER TABLE events ADD COLUMN domain TEXT NOT NULL DEFAULT 'geopolitical'",
        )
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

        // Create users table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                interests TEXT DEFAULT '[]',
                countries TEXT DEFAULT '[]',
                alert_threshold INTEGER DEFAULT 5,
                streak INTEGER DEFAULT 0,
                last_visit DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            "#,
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

        info!("Database migrations completed successfully");
        Ok(())
    }

    // ==================== Event Operations ====================

    /// Insert or update an event
    pub async fn upsert_event(&self, event: &IntelEvent) -> anyhow::Result<()> {
        sqlx::query(
            r#"
            INSERT OR REPLACE INTO events (id, country, lat, lon, severity, headline, source, timestamp, domain)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                INSERT OR IGNORE INTO events (id, country, lat, lon, severity, headline, source, timestamp, domain)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            SELECT id, country, lat, lon, severity, headline, source, timestamp, created_at, domain
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
            SELECT id, country, lat, lon, severity, headline, source, timestamp, created_at, domain
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
            SELECT id, country, lat, lon, severity, headline, source, timestamp, created_at, domain
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

    /// Clean up old events (keep 30 days)
    pub async fn cleanup_old_events(&self) -> anyhow::Result<u64> {
        let result = sqlx::query(
            r#"
            DELETE FROM events 
            WHERE timestamp < strftime('%s', 'now', '-30 days') * 1000
            "#,
        )
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected())
    }

    // ==================== User Operations ====================

    /// Get or create user
    pub async fn get_or_create_user(&self, user_id: &str) -> anyhow::Result<User> {
        let user: Option<User> = sqlx::query_as(
            r#"
            SELECT id, interests, countries, alert_threshold, streak, last_visit, created_at
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
                    INSERT INTO users (id, interests, countries, alert_threshold, streak, last_visit, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    "#,
                )
                .bind(&new_user.id)
                .bind(&new_user.interests)
                .bind(&new_user.countries)
                .bind(new_user.alert_threshold)
                .bind(new_user.streak)
                .bind(new_user.last_visit)
                .bind(new_user.created_at)
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

    // ==================== Alert Operations ====================

    /// Create alert
    pub async fn create_alert(&self, user_id: &str, country: &str, threshold: i32) -> anyhow::Result<()> {
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
    pub async fn cache_brief(&self, country: &str, summary: &str, event_count: i32) -> anyhow::Result<()> {
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
}
