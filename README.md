# Spotify to YouTube Music Migration Tool

[![GitHub](https://img.shields.io/badge/GitHub-MrUnknownDE%2Fsptify2yt-blue?logo=github)](https://github.com/MrUnknownDE/sptify2yt)

A Node.js web application that migrates your Spotify playlists to YouTube Music with a preview and review workflow.

## ✨ Features

- 🔐 **OAuth Login** - Secure authentication for Spotify and YouTube
- 📋 **Playlist Browser** - View and select your Spotify playlists
- 🔍 **Analysis Queue** - Pre-analyze tracks before migration with rate limiting
- 👀 **Review & Edit** - Side-by-side comparison of matches, add manual links for missing tracks
- 🔄 **Real-time Progress** - Live updates via Server-Sent Events
- 💾 **Persistent Cache** - Search results cached to disk, survives restarts
- 📊 **Quota Optimization** - Rate limiting and caching to preserve YouTube API quota
- 🎨 **Modern UI** - Dark theme with glassmorphism design
- 🐳 **Docker Ready** - Easy deployment with Docker Compose

## 📋 Prerequisites

### 1. Spotify API Credentials

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/)
2. Create a new application
3. Add `http://localhost:3000/auth/spotify/callback` to Redirect URIs
4. Copy your **Client ID** and **Client Secret**

### 2. YouTube/Google API Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable **YouTube Data API v3**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Configure OAuth consent screen (External, add your email as test user)
6. Create OAuth client ID (Web application)
7. Add `http://localhost:3000/auth/youtube/callback` to Authorized redirect URIs
8. Copy your **Client ID** and **Client Secret**

## 🚀 Setup

### Option 1: Local Development

```bash
# Clone the repository
git clone https://github.com/MrUnknownDE/sptify2yt.git
cd sptify2yt

# Install dependencies
npm install

# Copy environment template and add your API credentials
cp .env.example .env
nano .env  # or use your preferred editor

# Start the server
npm start
```

Open http://localhost:3000 in your browser.

### Option 2: Docker

```bash
# Clone the repository
git clone https://github.com/MrUnknownDE/sptify2yt.git
cd sptify2yt

# Copy and configure environment
cp .env.example .env
nano .env

# Build and run
docker compose up -d

# View logs (optional)
docker compose logs -f
```

Open http://localhost:3000 in your browser.

To stop: `docker compose down`


## ⚙️ Configuration

All settings are configured via environment variables (`.env` file):

| Variable | Default | Description |
|----------|---------|-------------|
| `SPOTIFY_CLIENT_ID` | - | Spotify OAuth Client ID |
| `SPOTIFY_CLIENT_SECRET` | - | Spotify OAuth Client Secret |
| `YOUTUBE_CLIENT_ID` | - | Google OAuth Client ID |
| `YOUTUBE_CLIENT_SECRET` | - | Google OAuth Client Secret |
| `SESSION_SECRET` | - | Random string for session encryption |
| `PORT` | `3000` | Server port |
| `BASE_URL` | `http://localhost:3000` | Base URL for OAuth callbacks |
| `CACHE_PATH` | `./cache` | Directory for persistent cache |
| `MAX_PLAYLIST_SIZE` | `500` | Maximum tracks per playlist |
| `RATE_LIMIT_DELAY_MS` | `2000` | Delay between YouTube API calls (ms) |

## 📖 Usage

### Workflow

1. **Login** - Connect your Spotify and YouTube accounts
2. **Select Playlist** - Choose a Spotify playlist to migrate
3. **Analyze** - Click "Analyze Playlist" to search for YouTube matches
4. **Review** - View side-by-side comparison:
   - ✅ **Found** - Track matched on YouTube
   - ❌ **Not found** - Add a manual YouTube link
5. **Migrate** - Start the migration to create the YouTube playlist

### Caching

The app uses two levels of caching:

1. **Analysis Jobs** - Complete analysis results saved to `./cache/job_*.json`
2. **Search Cache** - Individual YouTube search results saved to `./cache/search_cache.json`

Search results are cached for 30 days. If you analyze the same track again (even in a different playlist), it uses the cached result without making a new API call.

## 📊 YouTube API Quota

YouTube Data API has a daily quota of **10,000 units**. Each search costs ~100 units, allowing approximately **100 searches per day**.

### How this app optimizes quota:

| Feature | Savings |
|---------|---------|
| **Search Cache** | Reuses results for duplicate tracks |
| **Rate Limiting** | 2s delay prevents burst usage |
| **Pre-Analysis** | Only searches once, migration uses cached data |
| **Manual Links** | Skip API calls for unknown tracks |

## 🗂️ Project Structure

```
sptify2yt/
├── src/
│   ├── server.js              # Express server with SSE
│   ├── routes/
│   │   ├── auth.js            # OAuth routes
│   │   ├── spotify.js         # Spotify API routes
│   │   └── youtube.js         # YouTube API + migration
│   ├── services/
│   │   ├── analysisQueue.js   # Job queue with persistence
│   │   └── searchCache.js     # YouTube search cache
│   └── public/
│       ├── index.html         # SPA frontend
│       ├── styles.css         # Dark theme styles
│       └── app.js             # Frontend logic
├── cache/                     # Persistent cache (auto-created)
├── .env.example               # Environment template
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## ⚠️ Notes

- **YouTube Music Playlists** - YouTube and YouTube Music share playlists, so migrated playlists appear in both
- **Track Matching** - Searches for "Artist - Track Name" in YouTube's Music category
- **Manual Links** - For rare/unavailable tracks, paste any YouTube video URL
- **Cache Cleanup** - Jobs older than 7 days and search results older than 30 days are automatically cleaned up

## 📄 License

MIT
