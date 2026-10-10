const { Redis } = require("@upstash/redis");

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

// If the env vars are missing (e.g. local dev without Redis), caching is simply off.
const redis = url && token ? new Redis({ url, token, retry: false }) : null;

if (!redis) {
    console.warn(
    "WARNING: Upstash Redis env vars not set — caching is disabled.",
    );
}

const TIMEOUT_MS = 800;

// Never let a slow Redis make the API slow: give up after 800 ms.
const withTimeout = (promise) => {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Redis timeout")), TIMEOUT_MS);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

// Returns the cached value, or null on a miss OR any Redis error.
async function cacheGet(key) {
    if (!redis) return null;
    try {
        return await withTimeout(redis.get(key));
    } catch (err) {
        console.error(`Redis GET failed (${key}):`, err.message);
        return null;
    }
}

// Stores a value (objects/arrays are converted to JSON automatically).
async function cacheSet(key, value, ttlSeconds) {
    if (!redis) return;
    try {
        await withTimeout(redis.set(key, value, { ex: ttlSeconds }));
    } catch (err) {
        console.error(`Redis SET failed (${key}):`, err.message);
    }
}

async function cacheDel(...keys) {
    if (!redis) return;
    try {
        await withTimeout(redis.del(...keys));
    } catch (err) {
        console.error(`Redis DEL failed (${keys.join(", ")}):`, err.message);
  }
}

async function cacheIncr(key) {
  if (!redis) return;
  try {
    await withTimeout(redis.incr(key));
  } catch (err) {
    console.error(`Redis INCR failed (${key}):`, err.message);
  }
}

module.exports = { cacheGet, cacheSet, cacheDel, cacheIncr };
