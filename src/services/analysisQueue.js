import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';

// Configuration from environment
const CACHE_PATH = resolve(process.env.CACHE_PATH || './cache');
const MAX_PLAYLIST_SIZE = parseInt(process.env.MAX_PLAYLIST_SIZE || '500', 10);
const RATE_LIMIT_DELAY_MS = parseInt(process.env.RATE_LIMIT_DELAY_MS || '2000', 10);

// Ensure cache directory exists
if (!existsSync(CACHE_PATH)) {
    mkdirSync(CACHE_PATH, { recursive: true });
}

// In-memory job cache (loaded from disk on demand)
const jobs = new Map();

/**
 * Get cache file path for a job
 */
function getJobFilePath(jobId) {
    return join(CACHE_PATH, `${jobId}.json`);
}

/**
 * Save job to disk
 */
function saveJobToDisk(job) {
    try {
        const filePath = getJobFilePath(job.id);
        writeFileSync(filePath, JSON.stringify(job, null, 2), 'utf-8');
    } catch (err) {
        console.error('Failed to save job to disk:', err.message);
    }
}

/**
 * Load job from disk
 */
function loadJobFromDisk(jobId) {
    try {
        const filePath = getJobFilePath(jobId);
        if (existsSync(filePath)) {
            const data = readFileSync(filePath, 'utf-8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('Failed to load job from disk:', err.message);
    }
    return null;
}

/**
 * Load all jobs from disk on startup
 */
function loadAllJobsFromDisk() {
    try {
        if (!existsSync(CACHE_PATH)) return;

        const files = readdirSync(CACHE_PATH).filter(f => f.endsWith('.json'));
        for (const file of files) {
            const jobId = file.replace('.json', '');
            const job = loadJobFromDisk(jobId);
            if (job) {
                jobs.set(jobId, job);
            }
        }
        console.log(`📁 Loaded ${files.length} cached jobs from ${CACHE_PATH}`);
    } catch (err) {
        console.error('Failed to load jobs from disk:', err.message);
    }
}

// Load existing jobs on module init
loadAllJobsFromDisk();

/**
 * Get max playlist size limit
 */
export function getMaxPlaylistSize() {
    return MAX_PLAYLIST_SIZE;
}

/**
 * Get rate limit delay
 */
export function getRateLimitDelay() {
    return RATE_LIMIT_DELAY_MS;
}

/**
 * Create a new analysis job
 */
export function createJob(sessionId, playlist, tracks) {
    // Check playlist size limit
    if (tracks.length > MAX_PLAYLIST_SIZE) {
        throw new Error(`Playlist exceeds maximum size of ${MAX_PLAYLIST_SIZE} tracks`);
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const job = {
        id: jobId,
        sessionId,
        playlist: {
            id: playlist.id,
            name: playlist.name,
            image: playlist.image
        },
        tracks: tracks.map(track => ({
            spotifyId: track.id,
            name: track.name,
            artists: track.artists,
            album: track.album,
            youtubeMatch: null,
            manualVideoId: null,
            status: 'pending' // pending, searching, found, not_found, manual
        })),
        status: 'pending', // pending, analyzing, complete, error
        progress: {
            current: 0,
            total: tracks.length
        },
        createdAt: Date.now(),
        completedAt: null,
        error: null
    };

    jobs.set(jobId, job);
    saveJobToDisk(job);
    return job;
}

/**
 * Get a job by ID (from memory or disk)
 */
export function getJob(jobId) {
    // Try memory first
    if (jobs.has(jobId)) {
        return jobs.get(jobId);
    }

    // Try loading from disk
    const job = loadJobFromDisk(jobId);
    if (job) {
        jobs.set(jobId, job);
    }
    return job;
}

/**
 * Get all jobs for a session
 */
export function getJobsBySession(sessionId) {
    const sessionJobs = [];
    for (const job of jobs.values()) {
        if (job.sessionId === sessionId) {
            sessionJobs.push(job);
        }
    }
    return sessionJobs.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Update job status
 */
export function updateJobStatus(jobId, status, error = null) {
    const job = jobs.get(jobId);
    if (job) {
        job.status = status;
        if (error) job.error = error;
        if (status === 'complete' || status === 'error') {
            job.completedAt = Date.now();
        }
        saveJobToDisk(job);
    }
    return job;
}

/**
 * Update track match result
 */
export function updateTrackMatch(jobId, trackIndex, youtubeMatch, status) {
    const job = jobs.get(jobId);
    if (job && job.tracks[trackIndex]) {
        job.tracks[trackIndex].youtubeMatch = youtubeMatch;
        job.tracks[trackIndex].status = status;
        job.progress.current = trackIndex + 1;

        // Save to disk periodically (every 10 tracks or on completion)
        if ((trackIndex + 1) % 10 === 0 || trackIndex === job.tracks.length - 1) {
            saveJobToDisk(job);
        }
    }
    return job;
}

/**
 * Set manual video ID for a track
 */
export function setManualVideoId(jobId, trackIndex, videoId) {
    const job = jobs.get(jobId);
    if (job && job.tracks[trackIndex]) {
        job.tracks[trackIndex].manualVideoId = videoId;
        job.tracks[trackIndex].status = 'manual';
        saveJobToDisk(job);
        return true;
    }
    return false;
}

/**
 * Clean up old jobs (older than 7 days)
 */
export function cleanupOldJobs() {
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

    for (const [jobId, job] of jobs.entries()) {
        if (now - job.createdAt > maxAge) {
            jobs.delete(jobId);

            // Delete from disk too
            try {
                const filePath = getJobFilePath(jobId);
                if (existsSync(filePath)) {
                    unlinkSync(filePath);
                }
            } catch (err) {
                console.error('Failed to delete old job file:', err.message);
            }
        }
    }
}

// Run cleanup every hour
setInterval(cleanupOldJobs, 60 * 60 * 1000);

export default {
    createJob,
    getJob,
    getJobsBySession,
    updateJobStatus,
    updateTrackMatch,
    setManualVideoId,
    getRateLimitDelay,
    getMaxPlaylistSize,
    cleanupOldJobs
};
