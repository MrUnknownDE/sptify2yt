import { Router } from 'express';
import SpotifyWebApi from 'spotify-web-api-node';
import { google } from 'googleapis';

const router = Router();

// Spotify OAuth configuration
const spotifyApi = new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri: `${process.env.BASE_URL || 'http://localhost:3000'}/auth/spotify/callback`
});

// YouTube OAuth configuration
const oauth2Client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    `${process.env.BASE_URL || 'http://localhost:3000'}/auth/youtube/callback`
);

// Spotify scopes needed
const SPOTIFY_SCOPES = [
    'user-read-private',
    'user-read-email',
    'playlist-read-private',
    'playlist-read-collaborative'
];

// YouTube scopes needed
const YOUTUBE_SCOPES = [
    'https://www.googleapis.com/auth/youtube',
    'https://www.googleapis.com/auth/youtube.force-ssl'
];

// Check auth status
router.get('/status', (req, res) => {
    res.json({
        spotify: {
            connected: !!req.session.spotifyTokens,
            user: req.session.spotifyUser || null
        },
        youtube: {
            connected: !!req.session.youtubeTokens,
            user: req.session.youtubeUser || null
        }
    });
});

// Spotify OAuth - Initiate
router.get('/spotify', (req, res) => {
    const authorizeURL = spotifyApi.createAuthorizeURL(SPOTIFY_SCOPES, 'spotify-auth');
    res.redirect(authorizeURL);
});

// Spotify OAuth - Callback
router.get('/spotify/callback', async (req, res) => {
    const { code, error } = req.query;

    if (error) {
        return res.redirect('/?error=spotify_auth_failed');
    }

    try {
        const data = await spotifyApi.authorizationCodeGrant(code);

        req.session.spotifyTokens = {
            accessToken: data.body.access_token,
            refreshToken: data.body.refresh_token,
            expiresAt: Date.now() + data.body.expires_in * 1000
        };

        // Get user info
        spotifyApi.setAccessToken(data.body.access_token);
        const userInfo = await spotifyApi.getMe();
        req.session.spotifyUser = {
            id: userInfo.body.id,
            name: userInfo.body.display_name,
            email: userInfo.body.email,
            image: userInfo.body.images?.[0]?.url
        };

        res.redirect('/?spotify=connected');
    } catch (err) {
        console.error('Spotify auth error:', err);
        res.redirect('/?error=spotify_auth_failed');
    }
});

// YouTube OAuth - Initiate
router.get('/youtube', (req, res) => {
    const authorizeURL = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: YOUTUBE_SCOPES,
        prompt: 'consent'
    });
    res.redirect(authorizeURL);
});

// YouTube OAuth - Callback
router.get('/youtube/callback', async (req, res) => {
    const { code, error } = req.query;

    if (error) {
        return res.redirect('/?error=youtube_auth_failed');
    }

    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        req.session.youtubeTokens = {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: tokens.expiry_date
        };

        // Get user info
        const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
        const channelResponse = await youtube.channels.list({
            part: 'snippet',
            mine: true
        });

        const channel = channelResponse.data.items?.[0];
        req.session.youtubeUser = {
            id: channel?.id,
            name: channel?.snippet?.title,
            image: channel?.snippet?.thumbnails?.default?.url
        };

        res.redirect('/?youtube=connected');
    } catch (err) {
        console.error('YouTube auth error:', err);
        res.redirect('/?error=youtube_auth_failed');
    }
});

// Logout
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.json({ success: true });
    });
});

export default router;
