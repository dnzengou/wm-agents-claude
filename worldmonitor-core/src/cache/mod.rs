use dashmap::DashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tracing::{debug, info};

/// Cache entry with expiration
struct CacheEntry<T> {
    value: T,
    expires_at: Instant,
}

impl<T> CacheEntry<T> {
    fn new(value: T, ttl_seconds: u64) -> Self {
        Self {
            value,
            expires_at: Instant::now() + Duration::from_secs(ttl_seconds),
        }
    }

    fn is_expired(&self) -> bool {
        Instant::now() > self.expires_at
    }
}

/// In-memory cache with TTL (compatible with Edge KV API)
#[derive(Clone)]
pub struct Cache {
    data: Arc<DashMap<String, CacheEntry<Vec<u8>>>>,
    default_ttl: u64,
}

impl Cache {
    /// Create new cache with default TTL of 5 minutes
    pub fn new() -> Self {
        Self {
            data: Arc::new(DashMap::new()),
            default_ttl: 300, // 5 minutes
        }
    }

    /// Create cache with custom default TTL
    pub fn with_ttl(default_ttl_seconds: u64) -> Self {
        Self {
            data: Arc::new(DashMap::new()),
            default_ttl: default_ttl_seconds,
        }
    }

    /// Get value from cache
    pub fn get(&self, key: &str) -> Option<Vec<u8>> {
        if let Some(entry) = self.data.get(key) {
            if !entry.is_expired() {
                debug!("Cache hit for key: {}", key);
                return Some(entry.value.clone());
            }
            // Remove expired entry
            drop(entry);
            self.data.remove(key);
        }
        debug!("Cache miss for key: {}", key);
        None
    }

    /// Get and deserialize JSON value
    pub fn get_json<T: serde::de::DeserializeOwned>(&self, key: &str) -> Option<T> {
        self.get(key)
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
    }

    /// Put value in cache with default TTL
    pub fn put(&self, key: &str, value: Vec<u8>) {
        self.put_with_ttl(key, value, self.default_ttl);
    }

    /// Put value in cache with custom TTL
    pub fn put_with_ttl(&self, key: &str, value: Vec<u8>, ttl_seconds: u64) {
        let entry = CacheEntry::new(value, ttl_seconds);
        self.data.insert(key.to_string(), entry);
        debug!("Cached key: {} with TTL: {}s", key, ttl_seconds);
    }

    /// Put JSON-serializable value
    pub fn put_json<T: serde::Serialize>(&self, key: &str, value: &T) {
        if let Ok(bytes) = serde_json::to_vec(value) {
            self.put(key, bytes);
        }
    }

    /// Put JSON value with custom TTL
    pub fn put_json_with_ttl<T: serde::Serialize>(&self, key: &str, value: &T, ttl_seconds: u64) {
        if let Ok(bytes) = serde_json::to_vec(value) {
            self.put_with_ttl(key, bytes, ttl_seconds);
        }
    }

    /// Delete value from cache
    pub fn delete(&self, key: &str) {
        self.data.remove(key);
    }

    /// Clear all cache entries
    pub fn clear(&self) {
        self.data.clear();
        info!("Cache cleared");
    }

    /// Get cache statistics
    pub fn stats(&self) -> CacheStats {
        let total = self.data.len();
        let expired = self
            .data
            .iter()
            .filter(|e| e.value().is_expired())
            .count();

        CacheStats {
            total_entries: total,
            expired_entries: expired,
            valid_entries: total - expired,
        }
    }

    /// Clean up expired entries
    pub fn cleanup(&self) -> usize {
        let expired_keys: Vec<String> = self
            .data
            .iter()
            .filter(|e| e.value().is_expired())
            .map(|e| e.key().clone())
            .collect();

        let count = expired_keys.len();
        for key in expired_keys {
            self.data.remove(&key);
        }

        if count > 0 {
            debug!("Cleaned up {} expired cache entries", count);
        }
        count
    }

    /// Get cache key for intelligence data
    pub fn key_intelligence() -> &'static str {
        "intelligence:latest"
    }

    /// Get cache key for brief
    pub fn key_brief(country: &str) -> String {
        format!("brief:{}", country)
    }

    /// Get cache key for user
    pub fn key_user(user_id: &str) -> String {
        format!("user:{}", user_id)
    }

    /// Get cache key for geo data
    pub fn key_geo() -> &'static str {
        "geo:latest"
    }
}

impl Default for Cache {
    fn default() -> Self {
        Self::new()
    }
}

/// Cache statistics
#[derive(Debug, Clone, Copy)]
pub struct CacheStats {
    pub total_entries: usize,
    pub expired_entries: usize,
    pub valid_entries: usize,
}

/// Cache strategies for different data types
pub mod strategies {
    /// Intelligence data: 5 minutes
    pub const INTELLIGENCE_TTL: u64 = 300;

    /// Brief summaries: 1 hour
    pub const BRIEF_TTL: u64 = 3600;

    /// User data: 1 minute (short for streak updates)
    pub const USER_TTL: u64 = 60;

    /// Geo data: 1 hour
    pub const GEO_TTL: u64 = 3600;

    /// Static assets: 1 year
    pub const STATIC_TTL: u64 = 31536000;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_basic() {
        let cache = Cache::new();
        
        cache.put("test", vec![1, 2, 3]);
        assert_eq!(cache.get("test"), Some(vec![1, 2, 3]));
        
        cache.delete("test");
        assert_eq!(cache.get("test"), None);
    }

    #[test]
    fn test_cache_json() {
        let cache = Cache::new();
        let data = vec!["hello", "world"];
        
        cache.put_json("json_test", &data);
        let retrieved: Vec<String> = cache.get_json("json_test").unwrap();
        assert_eq!(retrieved, vec!["hello", "world"]);
    }

    #[test]
    fn test_cache_expiration() {
        let cache = Cache::with_ttl(0); // 0 second TTL
        cache.put("expire_test", vec![1, 2, 3]);
        
        // Should be expired immediately
        std::thread::sleep(Duration::from_millis(10));
        assert_eq!(cache.get("expire_test"), None);
    }
}
