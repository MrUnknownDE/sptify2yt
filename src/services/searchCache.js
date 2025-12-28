import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

// Configuration from environment
const CACHE_PATH = resolve(process.env.CACHE_PATH || './cache');
const SEARCH_CACHE_FILE = join(CACHE_PATH, 'search_cache.json');

// Ensure cache directory exists
if (!existsSync(CACHE_PATH)) {
    mkdirSync(CACHE_PATH, { recursive: true });
}

// In-memory search cache
let searchCache = new Map();

/**
 * Load search cache from disk
 */
function loadSearchCache() {
    try {
        if (existsSync(SEARCH_CACHE_FILE)) {
            const data = readFileSync(SEARCH_CACHE_FILE, 'utf-8');
            const parsed = JSON.parse(data);
            searchCache = new Map(Object.entries(parsed));
            console.log(`🔍 Loaded ${searchCache.size} cached search results`);
        }
    } catch (err) {
        console.error('Failed to load search cache:', err.message);
        searchCache = new Map();
    }
}

/**
 * Save search cache to disk
 */
function saveSearchCache() {
    try {
        const obj = Object.fromEntries(searchCache);
        writeFileSync(SEARCH_CACHE_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (err) {
        console.error('Failed to save search cache:', err.message);
    }
}

/**
 * Generate cache key from artist and track name
 */
function generateCacheKey(artists, trackName) {
    // Normalize: lowercase, trim, sort artists
    const normalizedArtists = artists.map(a => a.toLowerCase().trim()).sort().join('|');
    const normalizedTrack = trackName.toLowerCase().trim();
    return `${normalizedArtists}::${normalizedTrack}`;
}

/**
 * Get cached search result
 */
export function getCachedSearch(artists, trackName) {
    const key = generateCacheKey(artists, trackName);
    const cached = searchCache.get(key);

    if (cached) {
        // Check if cache is still valid (30 days)
        const maxAge = 30 * 24 * 60 * 60 * 1000;
        if (Date.now() - cached.cachedAt < maxAge) {
            return cached.result;
        }
        // Expired, remove from cache
        searchCache.delete(key);
    }

    return null;
}

/**
 * Cache a search result
 */
export function cacheSearch(artists, trackName, result) {
    const key = generateCacheKey(artists, trackName);
    searchCache.set(key, {
        result,
        cachedAt: Date.now()
    });

    // Save to disk periodically (every 10 new entries)
    if (searchCache.size % 10 === 0) {
        saveSearchCache();
    }
}

/**
 * Force save cache to disk
 */
export function flushSearchCache() {
    saveSearchCache();
}

/**
 * Get cache statistics
 */
export function getSearchCacheStats() {
    return {
        entries: searchCache.size,
        path: SEARCH_CACHE_FILE
    };
}

/**
 * Clear expired entries from cache
 */
export function cleanupSearchCache() {
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    const now = Date.now();
    let removed = 0;

    for (const [key, value] of searchCache.entries()) {
        if (now - value.cachedAt > maxAge) {
            searchCache.delete(key);
            removed++;
        }
    }

    if (removed > 0) {
        saveSearchCache();
        console.log(`🧹 Cleaned up ${removed} expired search cache entries`);
    }
}

// Load cache on module init
loadSearchCache();

// Cleanup expired entries on startup and daily
cleanupSearchCache();
setInterval(cleanupSearchCache, 24 * 60 * 60 * 1000);

export default {
    getCachedSearch,
    cacheSearch,
    flushSearchCache,
    getSearchCacheStats,
    cleanupSearchCache
};
