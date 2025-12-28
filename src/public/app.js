// State
let authStatus = { spotify: { connected: false }, youtube: { connected: false } };
let playlists = [];
let selectedPlaylist = null;
let selectedTracks = [];
let currentJob = null;
let eventSource = null;

// Generate unique session ID
const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Elements
const loginView = document.getElementById('loginView');
const playlistView = document.getElementById('playlistView');
const analysisView = document.getElementById('analysisView');
const progressView = document.getElementById('progressView');

const spotifyLoginBtn = document.getElementById('spotifyLoginBtn');
const youtubeLoginBtn = document.getElementById('youtubeLoginBtn');
const spotifyStatus = document.getElementById('spotifyStatus');
const youtubeStatus = document.getElementById('youtubeStatus');
const continueBtn = document.getElementById('continueBtn');
const logoutBtn = document.getElementById('logoutBtn');

const playlistGrid = document.getElementById('playlistGrid');
const backFromAnalysis = document.getElementById('backFromAnalysis');
const analysisPlaylistImage = document.getElementById('analysisPlaylistImage');
const analysisPlaylistName = document.getElementById('analysisPlaylistName');
const analysisPlaylistCount = document.getElementById('analysisPlaylistCount');
const startAnalysisBtn = document.getElementById('startAnalysisBtn');

const analysisProgress = document.getElementById('analysisProgress');
const analysisStatusText = document.getElementById('analysisStatusText');
const analysisProgressBar = document.getElementById('analysisProgressBar');
const analysisCurrentTrack = document.getElementById('analysisCurrentTrack');
const analysisResults = document.getElementById('analysisResults');
const comparisonList = document.getElementById('comparisonList');
const statFound = document.getElementById('statFound');
const statNotFound = document.getElementById('statNotFound');
const startMigrationBtn = document.getElementById('startMigrationBtn');

const progressCurrent = document.getElementById('progressCurrent');
const progressTotal = document.getElementById('progressTotal');
const progressBar = document.getElementById('progressBar');
const currentTrackName = document.getElementById('currentTrackName');
const progressLog = document.getElementById('progressLog');
const migrationComplete = document.getElementById('migrationComplete');
const completeStats = document.getElementById('completeStats');
const playlistLink = document.getElementById('playlistLink');
const newMigrationBtn = document.getElementById('newMigrationBtn');

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
    await checkAuthStatus();
    setupEventListeners();
    setupSSE();
    handleUrlParams();
}

function setupEventListeners() {
    spotifyLoginBtn.addEventListener('click', () => window.location.href = '/auth/spotify');
    youtubeLoginBtn.addEventListener('click', () => window.location.href = '/auth/youtube');
    continueBtn.addEventListener('click', showPlaylistView);
    logoutBtn.addEventListener('click', logout);
    backFromAnalysis.addEventListener('click', () => showView('playlist'));
    startAnalysisBtn.addEventListener('click', startAnalysis);
    startMigrationBtn.addEventListener('click', startMigration);
    newMigrationBtn.addEventListener('click', () => {
        showView('playlist');
        loadPlaylists();
    });
}

function setupSSE() {
    eventSource = new EventSource(`/api/progress/${sessionId}`);

    eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleProgressUpdate(data);
    };

    eventSource.onerror = () => {
        console.log('SSE connection error, reconnecting...');
        setTimeout(setupSSE, 5000);
    };
}

function handleUrlParams() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error')) {
        alert('Authentication failed. Please try again.');
    }
    if (params.toString()) {
        window.history.replaceState({}, '', '/');
    }
}

// Auth
async function checkAuthStatus() {
    try {
        const response = await fetch('/auth/status');
        authStatus = await response.json();
        updateAuthUI();
    } catch (err) {
        console.error('Failed to check auth status:', err);
    }
}

function updateAuthUI() {
    const spotifyIndicator = spotifyStatus.querySelector('.status-indicator');
    const spotifyText = spotifyStatus.querySelector('.status-text');

    if (authStatus.spotify.connected) {
        spotifyIndicator.classList.add('connected');
        spotifyText.textContent = `Connected as ${authStatus.spotify.user?.name || 'User'}`;
        spotifyLoginBtn.textContent = '✓ Connected';
        spotifyLoginBtn.disabled = true;
    } else {
        spotifyIndicator.classList.remove('connected');
        spotifyText.textContent = 'Not connected';
        spotifyLoginBtn.textContent = 'Login with Spotify';
        spotifyLoginBtn.disabled = false;
    }

    const youtubeIndicator = youtubeStatus.querySelector('.status-indicator');
    const youtubeText = youtubeStatus.querySelector('.status-text');

    if (authStatus.youtube.connected) {
        youtubeIndicator.classList.add('connected');
        youtubeText.textContent = `Connected as ${authStatus.youtube.user?.name || 'User'}`;
        youtubeLoginBtn.textContent = '✓ Connected';
        youtubeLoginBtn.disabled = true;
    } else {
        youtubeIndicator.classList.remove('connected');
        youtubeText.textContent = 'Not connected';
        youtubeLoginBtn.textContent = 'Login with YouTube';
        youtubeLoginBtn.disabled = false;
    }

    if (authStatus.spotify.connected && authStatus.youtube.connected) {
        continueBtn.style.display = 'inline-flex';
        logoutBtn.style.display = 'inline-flex';
    } else {
        continueBtn.style.display = 'none';
        logoutBtn.style.display = 'none';
    }
}

async function logout() {
    try {
        await fetch('/auth/logout', { method: 'POST' });
        authStatus = { spotify: { connected: false }, youtube: { connected: false } };
        updateAuthUI();
        showView('login');
    } catch (err) {
        console.error('Logout failed:', err);
    }
}

// Views
function showView(view) {
    loginView.style.display = view === 'login' ? 'block' : 'none';
    playlistView.style.display = view === 'playlist' ? 'block' : 'none';
    analysisView.style.display = view === 'analysis' ? 'block' : 'none';
    progressView.style.display = view === 'progress' ? 'block' : 'none';
}

async function showPlaylistView() {
    showView('playlist');
    await loadPlaylists();
}

// Playlists
async function loadPlaylists() {
    playlistGrid.innerHTML = '<div class="loading-spinner">Loading playlists...</div>';

    try {
        const response = await fetch('/api/spotify/playlists');
        if (!response.ok) throw new Error('Failed to load playlists');

        playlists = await response.json();
        renderPlaylists();
    } catch (err) {
        playlistGrid.innerHTML = '<div class="loading-spinner">Failed to load playlists. Please try again.</div>';
        console.error(err);
    }
}

function renderPlaylists() {
    if (playlists.length === 0) {
        playlistGrid.innerHTML = '<div class="loading-spinner">No playlists found.</div>';
        return;
    }

    playlistGrid.innerHTML = playlists.map(playlist => `
    <div class="playlist-card" data-id="${playlist.id}">
      <img src="${playlist.image || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%2318181b" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%2352525b" font-size="40">🎵</text></svg>'}" alt="${escapeHtml(playlist.name)}">
      <h3>${escapeHtml(playlist.name)}</h3>
      <p>${playlist.trackCount} tracks</p>
    </div>
  `).join('');

    document.querySelectorAll('.playlist-card').forEach(card => {
        card.addEventListener('click', () => selectPlaylist(card.dataset.id));
    });
}

async function selectPlaylist(playlistId) {
    selectedPlaylist = playlists.find(p => p.id === playlistId);
    if (!selectedPlaylist) return;

    showView('analysis');

    analysisPlaylistImage.src = selectedPlaylist.image || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%2318181b" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%2352525b" font-size="40">🎵</text></svg>';
    analysisPlaylistName.textContent = selectedPlaylist.name;
    analysisPlaylistCount.textContent = `${selectedPlaylist.trackCount} tracks`;

    // Reset analysis UI
    analysisProgress.style.display = 'none';
    analysisResults.style.display = 'none';
    startAnalysisBtn.style.display = 'inline-flex';
    startAnalysisBtn.disabled = false;
    comparisonList.innerHTML = '';
    currentJob = null;

    // Load tracks
    try {
        const response = await fetch(`/api/spotify/playlist/${playlistId}/tracks`);
        if (!response.ok) throw new Error('Failed to load tracks');
        selectedTracks = await response.json();
    } catch (err) {
        console.error('Failed to load tracks:', err);
        selectedTracks = [];
    }
}

// Analysis
async function startAnalysis() {
    if (!selectedPlaylist || selectedTracks.length === 0) return;

    startAnalysisBtn.disabled = true;
    startAnalysisBtn.textContent = 'Analyzing...';
    analysisProgress.style.display = 'block';
    analysisResults.style.display = 'none';
    analysisProgressBar.style.width = '0%';
    analysisStatusText.textContent = 'Starting analysis...';

    try {
        const response = await fetch('/api/youtube/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                playlist: selectedPlaylist,
                tracks: selectedTracks,
                sessionId
            })
        });

        const result = await response.json();
        if (result.error) throw new Error(result.error);

        currentJob = { id: result.jobId };
    } catch (err) {
        console.error('Analysis failed:', err);
        analysisStatusText.textContent = 'Analysis failed. Please try again.';
        startAnalysisBtn.disabled = false;
        startAnalysisBtn.textContent = '🔍 Analyze Playlist';
    }
}

function handleProgressUpdate(data) {
    switch (data.type) {
        // Analysis updates
        case 'analysis_progress':
            analysisStatusText.textContent = `Searching YouTube... (${data.current}/${data.total})`;
            analysisProgressBar.style.width = `${(data.current / data.total) * 100}%`;
            analysisCurrentTrack.textContent = `${data.track.artists.join(', ')} - ${data.track.name}`;
            break;

        case 'analysis_match':
            // Update progress
            analysisProgressBar.style.width = `${(data.current / data.total) * 100}%`;
            break;

        case 'analysis_complete':
            showAnalysisResults(data.stats);
            break;

        // Migration updates
        case 'status':
            currentTrackName.textContent = data.message;
            break;

        case 'playlist_created':
            addLogItem('Playlist created on YouTube', 'success');
            break;

        case 'processing':
            currentTrackName.textContent = `${data.track.artists.join(', ')} - ${data.track.name}`;
            progressCurrent.textContent = data.current;
            progressBar.style.width = `${(data.current / data.total) * 100}%`;
            break;

        case 'track_added':
            addLogItem(`✓ ${data.track}`, 'success');
            break;

        case 'track_failed':
        case 'track_skipped':
            addLogItem(`✗ ${data.track} - Skipped`, 'not-found');
            break;

        case 'complete':
            showMigrationComplete(data);
            break;

        case 'error':
            currentTrackName.textContent = `Error: ${data.message}`;
            break;
    }
}

async function showAnalysisResults(stats) {
    analysisProgress.style.display = 'none';
    startAnalysisBtn.style.display = 'none';
    analysisResults.style.display = 'block';

    // Fetch full job data
    try {
        const response = await fetch(`/api/youtube/analysis/${currentJob.id}`);
        const job = await response.json();
        currentJob = job;

        // Update stats
        statFound.textContent = stats.found;
        statNotFound.textContent = stats.notFound;

        // Render comparison table
        renderComparisonTable(job.tracks);
    } catch (err) {
        console.error('Failed to fetch analysis results:', err);
    }
}

function renderComparisonTable(tracks) {
    comparisonList.innerHTML = tracks.map((track, index) => `
    <div class="table-row ${track.status}" data-index="${index}">
      <div class="col-spotify">
        <div class="track-name">${escapeHtml(track.name)}</div>
        <div class="track-artist">${escapeHtml(track.artists.join(', '))}</div>
      </div>
      <div class="col-status">
        ${track.status === 'found' ? '<span class="status-badge found">✓ Found</span>' :
            track.status === 'manual' ? '<span class="status-badge manual">✓ Manual</span>' :
                '<span class="status-badge not-found">✗ Not found</span>'}
      </div>
      <div class="col-youtube">
        ${track.status === 'found' && track.youtubeMatch ? `
          <div class="youtube-match">
            <img src="${track.youtubeMatch.thumbnail || ''}" alt="">
            <div class="match-info">
              <div class="match-title">${escapeHtml(track.youtubeMatch.title)}</div>
              <div class="match-channel">${escapeHtml(track.youtubeMatch.channel)}</div>
            </div>
          </div>
        ` : track.status === 'manual' && track.manualVideoId ? `
          <div class="youtube-match manual">
            <span class="manual-badge">Manual: ${track.manualVideoId}</span>
          </div>
        ` : `
          <div class="manual-input">
            <input type="text" 
                   placeholder="Paste YouTube URL or Video ID" 
                   class="manual-video-input"
                   data-index="${index}">
            <button class="btn btn-small btn-ghost save-manual-btn" data-index="${index}">Save</button>
          </div>
        `}
      </div>
    </div>
  `).join('');

    // Add event listeners for manual inputs
    document.querySelectorAll('.save-manual-btn').forEach(btn => {
        btn.addEventListener('click', () => saveManualVideo(parseInt(btn.dataset.index)));
    });

    document.querySelectorAll('.manual-video-input').forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                saveManualVideo(parseInt(input.dataset.index));
            }
        });
    });
}

async function saveManualVideo(trackIndex) {
    const input = document.querySelector(`.manual-video-input[data-index="${trackIndex}"]`);
    const videoId = input.value.trim();

    if (!videoId) return;

    try {
        const response = await fetch(`/api/youtube/analysis/${currentJob.id}/track/${trackIndex}/manual`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoId })
        });

        const result = await response.json();
        if (result.success) {
            // Update local job data
            currentJob.tracks[trackIndex].manualVideoId = result.videoId;
            currentJob.tracks[trackIndex].status = 'manual';

            // Re-render table
            renderComparisonTable(currentJob.tracks);

            // Update stats
            const found = currentJob.tracks.filter(t => t.status === 'found' || t.status === 'manual').length;
            const notFound = currentJob.tracks.filter(t => t.status === 'not_found').length;
            statFound.textContent = found;
            statNotFound.textContent = notFound;
        }
    } catch (err) {
        console.error('Failed to save manual video:', err);
    }
}

// Migration
async function startMigration() {
    if (!currentJob) return;

    showView('progress');

    progressCurrent.textContent = '0';
    progressTotal.textContent = currentJob.tracks.length;
    progressBar.style.width = '0%';
    currentTrackName.textContent = 'Starting migration...';
    progressLog.innerHTML = '';
    migrationComplete.style.display = 'none';

    // Show progress elements
    document.querySelector('.progress-stats').style.display = 'block';
    document.querySelector('.progress-bar-container').style.display = 'block';
    document.querySelector('.current-track').style.display = 'flex';

    try {
        await fetch('/api/youtube/migrate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jobId: currentJob.id,
                sessionId
            })
        });
    } catch (err) {
        console.error('Migration request failed:', err);
        currentTrackName.textContent = 'Migration failed. Please try again.';
    }
}

function addLogItem(text, type) {
    const item = document.createElement('div');
    item.className = `log-item ${type}`;
    item.textContent = text;
    progressLog.appendChild(item);
    progressLog.scrollTop = progressLog.scrollHeight;
}

function showMigrationComplete(data) {
    migrationComplete.style.display = 'block';
    completeStats.textContent = `${data.successCount} of ${data.total} tracks migrated successfully`;
    playlistLink.href = data.playlistUrl;

    document.querySelector('.progress-stats').style.display = 'none';
    document.querySelector('.progress-bar-container').style.display = 'none';
    document.querySelector('.current-track').style.display = 'none';
}

// Helpers
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
