import { Router } from 'express';
import SpotifyWebApi from 'spotify-web-api-node';

const router = Router();

// Helper to get authenticated Spotify API instance
function getSpotifyApi(session) {
    if (!session.spotifyTokens) {
        throw new Error('Not authenticated with Spotify');
    }

    const spotifyApi = new SpotifyWebApi({
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET
    });

    spotifyApi.setAccessToken(session.spotifyTokens.accessToken);
    spotifyApi.setRefreshToken(session.spotifyTokens.refreshToken);

    return spotifyApi;
}

// Middleware to check Spotify auth
function requireSpotifyAuth(req, res, next) {
    if (!req.session.spotifyTokens) {
        return res.status(401).json({ error: 'Not authenticated with Spotify' });
    }
    next();
}

// Get user's playlists
router.get('/playlists', requireSpotifyAuth, async (req, res) => {
    try {
        const spotifyApi = getSpotifyApi(req.session);

        let allPlaylists = [];
        let offset = 0;
        const limit = 50;
        let hasMore = true;

        while (hasMore) {
            const response = await spotifyApi.getUserPlaylists({ limit, offset });
            allPlaylists = allPlaylists.concat(response.body.items);

            if (response.body.next) {
                offset += limit;
            } else {
                hasMore = false;
            }
        }

        const playlists = allPlaylists.map(playlist => ({
            id: playlist.id,
            name: playlist.name,
            description: playlist.description,
            trackCount: playlist.tracks.total,
            image: playlist.images?.[0]?.url,
            owner: playlist.owner.display_name
        }));

        res.json(playlists);
    } catch (err) {
        console.error('Error fetching playlists:', err);
        res.status(500).json({ error: 'Failed to fetch playlists' });
    }
});

// Get tracks from a playlist
router.get('/playlist/:id/tracks', requireSpotifyAuth, async (req, res) => {
    try {
        const spotifyApi = getSpotifyApi(req.session);
        const playlistId = req.params.id;

        let allTracks = [];
        let offset = 0;
        const limit = 100;
        let hasMore = true;

        while (hasMore) {
            const response = await spotifyApi.getPlaylistTracks(playlistId, {
                limit,
                offset,
                fields: 'items(track(id,name,artists,album,duration_ms)),next'
            });

            allTracks = allTracks.concat(response.body.items);

            if (response.body.next) {
                offset += limit;
            } else {
                hasMore = false;
            }
        }

        const tracks = allTracks
            .filter(item => item.track) // Filter out null tracks
            .map(item => ({
                id: item.track.id,
                name: item.track.name,
                artists: item.track.artists.map(a => a.name),
                album: item.track.album?.name,
                duration: item.track.duration_ms
            }));

        res.json(tracks);
    } catch (err) {
        console.error('Error fetching tracks:', err);
        res.status(500).json({ error: 'Failed to fetch tracks' });
    }
});

// Get playlist info
router.get('/playlist/:id', requireSpotifyAuth, async (req, res) => {
    try {
        const spotifyApi = getSpotifyApi(req.session);
        const response = await spotifyApi.getPlaylist(req.params.id);

        res.json({
            id: response.body.id,
            name: response.body.name,
            description: response.body.description,
            trackCount: response.body.tracks.total,
            image: response.body.images?.[0]?.url
        });
    } catch (err) {
        console.error('Error fetching playlist:', err);
        res.status(500).json({ error: 'Failed to fetch playlist' });
    }
});

export default router;
