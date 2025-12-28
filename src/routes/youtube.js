import { Router } from 'express';
import { google } from 'googleapis';
import { sendProgress } from '../server.js';
import * as queue from '../services/analysisQueue.js';
import * as searchCache from '../services/searchCache.js';

const router = Router();

// Helper to get authenticated YouTube API instance
function getYouTubeApi(session) {
    if (!session.youtubeTokens) {
        throw new Error('Not authenticated with YouTube');
    }

    const oauth2Client = new google.auth.OAuth2(
        process.env.YOUTUBE_CLIENT_ID,
        process.env.YOUTUBE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
        access_token: session.youtubeTokens.accessToken,
        refresh_token: session.youtubeTokens.refreshToken
    });

    return google.youtube({ version: 'v3', auth: oauth2Client });
}

// Middleware to check YouTube auth
function requireYouTubeAuth(req, res, next) {
    if (!req.session.youtubeTokens) {
        return res.status(401).json({ error: 'Not authenticated with YouTube' });
    }
    next();
}

// Search for a video on YouTube (with caching)
async function searchVideo(youtube, artists, trackName) {
    // Check cache first
    const cached = searchCache.getCachedSearch(artists, trackName);
    if (cached !== null) {
        console.log(`📦 Cache hit: ${artists.join(', ')} - ${trackName}`);
        return cached;
    }

    // Not in cache, search YouTube
    const query = `${artists.join(', ')} - ${trackName}`;
    try {
        const response = await youtube.search.list({
            part: 'snippet',
            q: query,
            type: 'video',
            videoCategoryId: '10', // Music category
            maxResults: 1
        });

        let result = null;
        if (response.data.items && response.data.items.length > 0) {
            const video = response.data.items[0];
            result = {
                id: video.id.videoId,
                title: video.snippet.title,
                channel: video.snippet.channelTitle,
                thumbnail: video.snippet.thumbnails?.default?.url
            };
        }

        // Cache the result (even if null/not found)
        searchCache.cacheSearch(artists, trackName, result);
        console.log(`🔍 API search: ${artists.join(', ')} - ${trackName} → ${result ? 'found' : 'not found'}`);

        return result;
    } catch (err) {
        console.error('Search error:', err.message);
        return null;
    }
}

// Create a playlist
async function createPlaylist(youtube, title, description) {
    const response = await youtube.playlists.insert({
        part: 'snippet,status',
        requestBody: {
            snippet: {
                title,
                description: description || `Migrated from Spotify`
            },
            status: {
                privacyStatus: 'private'
            }
        }
    });

    return response.data;
}

// Add video to playlist
async function addToPlaylist(youtube, playlistId, videoId) {
    await youtube.playlistItems.insert({
        part: 'snippet',
        requestBody: {
            snippet: {
                playlistId,
                resourceId: {
                    kind: 'youtube#video',
                    videoId
                }
            }
        }
    });
}

// ============ ANALYSIS ENDPOINTS ============

// Start analysis job
router.post('/analyze', requireYouTubeAuth, async (req, res) => {
    const { playlist, tracks, sessionId } = req.body;

    if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
        return res.status(400).json({ error: 'No tracks provided' });
    }

    if (!sessionId) {
        return res.status(400).json({ error: 'Session ID required' });
    }

    // Check playlist size limit
    const maxSize = queue.getMaxPlaylistSize();
    if (tracks.length > maxSize) {
        return res.status(400).json({
            error: `Playlist too large. Maximum ${maxSize} tracks allowed.`,
            maxSize,
            trackCount: tracks.length
        });
    }

    // Create job
    try {
        const job = queue.createJob(sessionId, playlist, tracks);

        // Start analysis in background
        analyzePlaylist(job.id, req.session).catch(err => {
            console.error('Analysis error:', err);
            queue.updateJobStatus(job.id, 'error', err.message);
        });

        res.json({
            jobId: job.id,
            status: job.status,
            trackCount: tracks.length
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Background analysis function
async function analyzePlaylist(jobId, session) {
    const job = queue.getJob(jobId);
    if (!job) return;

    queue.updateJobStatus(jobId, 'analyzing');

    const youtube = getYouTubeApi(session);
    const delay = queue.getRateLimitDelay();

    for (let i = 0; i < job.tracks.length; i++) {
        const track = job.tracks[i];

        // Update status to searching
        job.tracks[i].status = 'searching';

        // Send progress update
        sendProgress(job.sessionId, {
            type: 'analysis_progress',
            jobId,
            current: i + 1,
            total: job.tracks.length,
            track: {
                name: track.name,
                artists: track.artists
            },
            status: 'searching'
        });

        // Search YouTube (with caching)
        const match = await searchVideo(youtube, track.artists, track.name);

        if (match) {
            queue.updateTrackMatch(jobId, i, match, 'found');
            sendProgress(job.sessionId, {
                type: 'analysis_match',
                jobId,
                current: i + 1,
                total: job.tracks.length,
                track: {
                    name: track.name,
                    artists: track.artists
                },
                match,
                status: 'found'
            });
        } else {
            queue.updateTrackMatch(jobId, i, null, 'not_found');
            sendProgress(job.sessionId, {
                type: 'analysis_match',
                jobId,
                current: i + 1,
                total: job.tracks.length,
                track: {
                    name: track.name,
                    artists: track.artists
                },
                match: null,
                status: 'not_found'
            });
        }

        // Rate limiting delay (except for last item)
        if (i < job.tracks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    queue.updateJobStatus(jobId, 'complete');

    // Send completion
    const completedJob = queue.getJob(jobId);
    const stats = {
        found: completedJob.tracks.filter(t => t.status === 'found').length,
        notFound: completedJob.tracks.filter(t => t.status === 'not_found').length,
        total: completedJob.tracks.length
    };

    sendProgress(job.sessionId, {
        type: 'analysis_complete',
        jobId,
        stats
    });
}

// Get analysis job status
router.get('/analysis/:jobId', requireYouTubeAuth, (req, res) => {
    const job = queue.getJob(req.params.jobId);

    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }

    res.json(job);
});

// Update manual video ID for a track
router.post('/analysis/:jobId/track/:trackIndex/manual', requireYouTubeAuth, (req, res) => {
    const { jobId, trackIndex } = req.params;
    const { videoId } = req.body;

    if (!videoId) {
        return res.status(400).json({ error: 'Video ID required' });
    }

    // Extract video ID from URL if full URL provided
    let extractedVideoId = videoId;
    const urlMatch = videoId.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/);
    if (urlMatch) {
        extractedVideoId = urlMatch[1];
    }

    const success = queue.setManualVideoId(jobId, parseInt(trackIndex), extractedVideoId);

    if (!success) {
        return res.status(404).json({ error: 'Job or track not found' });
    }

    res.json({ success: true, videoId: extractedVideoId });
});

// ============ MIGRATION ENDPOINT ============

// Migrate with pre-analyzed data
router.post('/migrate', requireYouTubeAuth, async (req, res) => {
    const { jobId, sessionId } = req.body;

    const job = queue.getJob(jobId);

    if (!job) {
        return res.status(404).json({ error: 'Analysis job not found' });
    }

    if (job.status !== 'complete') {
        return res.status(400).json({ error: 'Analysis not complete' });
    }

    try {
        const youtube = getYouTubeApi(req.session);

        // Create the playlist
        sendProgress(sessionId, {
            type: 'status',
            message: 'Creating YouTube playlist...'
        });

        const playlist = await createPlaylist(youtube, job.playlist.name, `Migrated from Spotify`);

        sendProgress(sessionId, {
            type: 'playlist_created',
            playlistId: playlist.id,
            playlistUrl: `https://music.youtube.com/playlist?list=${playlist.id}`
        });

        // Track progress
        let successCount = 0;
        let skipCount = 0;
        const results = [];

        // Process tracks using cached matches
        for (let i = 0; i < job.tracks.length; i++) {
            const track = job.tracks[i];

            // Get video ID (manual override or matched)
            const videoId = track.manualVideoId || track.youtubeMatch?.id;

            sendProgress(sessionId, {
                type: 'processing',
                current: i + 1,
                total: job.tracks.length,
                track: {
                    name: track.name,
                    artists: track.artists
                }
            });

            if (videoId) {
                try {
                    await addToPlaylist(youtube, playlist.id, videoId);
                    successCount++;
                    results.push({
                        track: track.name,
                        status: 'success',
                        videoId
                    });

                    sendProgress(sessionId, {
                        type: 'track_added',
                        current: i + 1,
                        total: job.tracks.length,
                        track: track.name,
                        success: true
                    });
                } catch (err) {
                    results.push({
                        track: track.name,
                        status: 'error',
                        error: err.message
                    });

                    sendProgress(sessionId, {
                        type: 'track_failed',
                        current: i + 1,
                        total: job.tracks.length,
                        track: track.name,
                        error: err.message,
                        success: false
                    });
                }
            } else {
                skipCount++;
                results.push({
                    track: track.name,
                    status: 'skipped',
                    reason: 'No video ID'
                });

                sendProgress(sessionId, {
                    type: 'track_skipped',
                    current: i + 1,
                    total: job.tracks.length,
                    track: track.name
                });
            }

            // Small delay to avoid rate limiting on playlist adds
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        // Send completion
        sendProgress(sessionId, {
            type: 'complete',
            playlistId: playlist.id,
            playlistUrl: `https://music.youtube.com/playlist?list=${playlist.id}`,
            successCount,
            skipCount,
            total: job.tracks.length
        });

        res.json({
            success: true,
            playlistId: playlist.id,
            playlistUrl: `https://music.youtube.com/playlist?list=${playlist.id}`,
            successCount,
            skipCount,
            results
        });

    } catch (err) {
        console.error('Migration error:', err);

        sendProgress(sessionId, {
            type: 'error',
            message: err.message || 'Migration failed'
        });

        res.status(500).json({ error: 'Migration failed', details: err.message });
    }
});

// Get user's YouTube playlists (for reference)
router.get('/playlists', requireYouTubeAuth, async (req, res) => {
    try {
        const youtube = getYouTubeApi(req.session);

        const response = await youtube.playlists.list({
            part: 'snippet,contentDetails',
            mine: true,
            maxResults: 50
        });

        const playlists = response.data.items.map(playlist => ({
            id: playlist.id,
            name: playlist.snippet.title,
            description: playlist.snippet.description,
            trackCount: playlist.contentDetails.itemCount,
            image: playlist.snippet.thumbnails?.default?.url
        }));

        res.json(playlists);
    } catch (err) {
        console.error('Error fetching YouTube playlists:', err);
        res.status(500).json({ error: 'Failed to fetch playlists' });
    }
});

// Get configuration limits and cache stats
router.get('/config', (req, res) => {
    res.json({
        maxPlaylistSize: queue.getMaxPlaylistSize(),
        rateLimitDelayMs: queue.getRateLimitDelay(),
        searchCache: searchCache.getSearchCacheStats()
    });
});

export default router;
