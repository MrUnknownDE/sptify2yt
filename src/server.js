import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import authRoutes from './routes/auth.js';
import spotifyRoutes from './routes/spotify.js';
import youtubeRoutes from './routes/youtube.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Store SSE clients for progress updates
const clients = new Map();

// SSE endpoint for migration progress
app.get('/api/progress/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId;
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  clients.set(sessionId, res);

  req.on('close', () => {
    clients.delete(sessionId);
  });
});

// Helper to send progress updates
export function sendProgress(sessionId, data) {
  const client = clients.get(sessionId);
  if (client) {
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

// Routes
app.use('/auth', authRoutes);
app.use('/api/spotify', spotifyRoutes);
app.use('/api/youtube', youtubeRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`🎵 Spotify to YouTube Music Migration Tool`);
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
