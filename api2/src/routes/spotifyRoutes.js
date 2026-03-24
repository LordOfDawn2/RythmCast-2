const express = require('express');
const axios = require('axios');
const qs = require('qs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { enqueueJob, dequeueJob, queueSize, isQueueReady } = require('../queue');

const router = express.Router();

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:3000/api/spotify/callback';
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';

const LOGIN_SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
  'user-read-private',
  'user-read-email',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-top-read',
  'user-read-recently-played'
];

function createError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parseUserId(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function getUserIdFromRequest(req) {
  const rawUserId = req.query.userId || req.userId || req.body?.userId;
  const userId = parseUserId(rawUserId);
  if (!userId) {
    throw createError(400, 'Valid userId is required');
  }
  return userId;
}

function normalizeStatusFromError(error) {
  if (error.statusCode) {
    return error.statusCode;
  }

  if (error.response?.status) {
    return error.response.status;
  }

  if (error.message === 'Spotify token not found') {
    return 404;
  }

  return 500;
}

function normalizeErrorPayload(error) {
  return error.response?.data || error.message;
}

function mapTrack(track) {
  return {
    id: track.id,
    name: track.name,
    artist: track.artists?.[0]?.name,
    album: track.album?.name,
    imageUrl: track.album?.images?.[0]?.url,
    previewUrl: track.preview_url,
    spotifyUrl: track.external_urls?.spotify,
    uri: track.uri
  };
}

function mapArtist(artist) {
  return {
    id: artist.id,
    name: artist.name,
    genres: artist.genres,
    imageUrl: artist.images?.[0]?.url,
    popularity: artist.popularity,
    followers: artist.followers?.total,
    spotifyUrl: artist.external_urls?.spotify
  };
}

function dedupeById(items) {
  const seenIds = new Set();
  const unique = [];

  for (const item of items) {
    if (!item?.id || seenIds.has(item.id)) {
      continue;
    }
    seenIds.add(item.id);
    unique.push(item);
  }

  return unique;
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function appendDescription(base, segment) {
  if (!segment) {
    return base || '';
  }
  return base ? `${base} - ${segment}` : segment;
}

async function getOrCreateSpotifyUser(spotifyUser) {
  const existing = await db.query('SELECT id, name, email FROM users WHERE spotify_id = $1', [spotifyUser.id]);
  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const created = await db.query(
    `INSERT INTO users (name, email, password, spotify_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email`,
    [
      spotifyUser.display_name || 'Spotify User',
      spotifyUser.email || `spotify-${spotifyUser.id}@spotify.com`,
      'spotify-oauth',
      spotifyUser.id
    ]
  );

  return created.rows[0];
}

async function upsertSpotifyToken(userId, accessToken, refreshToken, expiresInSeconds) {
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  await db.query(
    `INSERT INTO spotify_tokens (user_id, access_token, refresh_token, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id)
     DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       expires_at = EXCLUDED.expires_at`,
    [userId, accessToken, refreshToken, expiresAt]
  );
}

async function getSpotifyToken(userId) {
  const tokenResult = await db.query(
    'SELECT user_id, access_token, refresh_token, expires_at FROM spotify_tokens WHERE user_id = $1',
    [userId]
  );

  return tokenResult.rows[0] || null;
}

async function refreshSpotifyAccessToken(refreshToken) {
  const tokenResponse = await axios.post(
    'https://accounts.spotify.com/api/token',
    qs.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: SPOTIFY_CLIENT_ID,
      client_secret: SPOTIFY_CLIENT_SECRET
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }
  );

  return {
    accessToken: tokenResponse.data.access_token,
    expiresIn: tokenResponse.data.expires_in,
    refreshToken: tokenResponse.data.refresh_token
  };
}

async function refreshTokenIfNeeded(userId) {
  const token = await getSpotifyToken(userId);
  if (!token) {
    throw new Error('Spotify token not found');
  }

  if (new Date() <= new Date(token.expires_at)) {
    return token.access_token;
  }

  const refreshed = await refreshSpotifyAccessToken(token.refresh_token);
  const newExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000);

  await db.query(
    'UPDATE spotify_tokens SET access_token = $1, refresh_token = COALESCE($2, refresh_token), expires_at = $3 WHERE user_id = $4',
    [refreshed.accessToken, refreshed.refreshToken || null, newExpiresAt, userId]
  );

  return refreshed.accessToken;
}

async function getSpotifyAccessTokenForRequest(req) {
  const userId = getUserIdFromRequest(req);
  const accessToken = await refreshTokenIfNeeded(userId);
  return { accessToken, userId };
}

router.get('/login', (req, res) => {
  const authUrl = `https://accounts.spotify.com/authorize?${qs.stringify({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: SPOTIFY_REDIRECT_URI,
    show_dialog: true,
    scope: LOGIN_SCOPES.join(' '),
    state: Math.random().toString(36).slice(2)
  })}`;

  return res.redirect(authUrl);
});

router.get('/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.status(400).json({ message: 'Spotify auth error', error });
  }

  if (!code) {
    return res.status(400).json({ message: 'No authorization code received' });
  }

  try {
    const tokenResponse = await axios.post(
      'https://accounts.spotify.com/api/token',
      qs.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: SPOTIFY_REDIRECT_URI,
        client_id: SPOTIFY_CLIENT_ID,
        client_secret: SPOTIFY_CLIENT_SECRET
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    const spotifyUserResponse = await axios.get('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const user = await getOrCreateSpotifyUser(spotifyUserResponse.data);
    await upsertSpotifyToken(user.id, access_token, refresh_token, expires_in);

    const appToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    const userAgent = req.headers['user-agent'] || '';

    if (userAgent.includes('Android')) {
      return res.redirect(`mongodb-android://callback?token=${appToken}&user_id=${user.id}`);
    }

    return res.redirect(`/analysis.html?token=${appToken}&user_id=${user.id}`);
  } catch (callbackError) {
    return res.status(normalizeStatusFromError(callbackError)).json({
      message: 'Authentication failed',
      error: normalizeErrorPayload(callbackError)
    });
  }
});

router.post('/refresh-token', async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const accessToken = await refreshTokenIfNeeded(userId);
    return res.json({ accessToken });
  } catch (error) {
    return res.status(normalizeStatusFromError(error)).json({
      message: 'Token refresh failed',
      error: normalizeErrorPayload(error)
    });
  }
});

router.get('/profile', async (req, res) => {
  try {
    const { accessToken } = await getSpotifyAccessTokenForRequest(req);
    const profileResponse = await axios.get('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    return res.json({
      profile: {
        name: profileResponse.data.display_name,
        email: profileResponse.data.email,
        country: profileResponse.data.country,
        followers: profileResponse.data.followers?.total,
        imageUrl: profileResponse.data.images?.[0]?.url,
        product: profileResponse.data.product
      }
    });
  } catch (error) {
    return res.status(normalizeStatusFromError(error)).json({
      message: 'Failed to get profile',
      error: normalizeErrorPayload(error)
    });
  }
});

router.get('/top-tracks', async (req, res) => {
  try {
    const { accessToken } = await getSpotifyAccessTokenForRequest(req);
    const tracksResponse = await axios.get('https://api.spotify.com/v1/me/top/tracks?limit=20&time_range=short_term', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    return res.json({ tracks: tracksResponse.data.items.map(mapTrack) });
  } catch (error) {
    return res.status(normalizeStatusFromError(error)).json({
      message: 'Failed to get top tracks',
      error: normalizeErrorPayload(error)
    });
  }
});

router.get('/top-artists', async (req, res) => {
  try {
    const { accessToken } = await getSpotifyAccessTokenForRequest(req);
    const artistsResponse = await axios.get('https://api.spotify.com/v1/me/top/artists?limit=10', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    return res.json({ artists: artistsResponse.data.items.map(mapArtist) });
  } catch (error) {
    return res.status(normalizeStatusFromError(error)).json({
      message: 'Failed to get top artists',
      error: normalizeErrorPayload(error)
    });
  }
});

router.get('/recently-played', async (req, res) => {
  try {
    const { accessToken } = await getSpotifyAccessTokenForRequest(req);
    const recentResponse = await axios.get('https://api.spotify.com/v1/me/player/recently-played?limit=20', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const tracks = recentResponse.data.items.map((item) => ({
      id: item.track?.id,
      name: item.track?.name,
      artist: item.track?.artists?.[0]?.name,
      album: item.track?.album?.name,
      imageUrl: item.track?.album?.images?.[0]?.url,
      playedAt: item.played_at
    }));

    return res.json({ tracks });
  } catch (error) {
    return res.status(normalizeStatusFromError(error)).json({
      message: 'Failed to get recently played',
      error: normalizeErrorPayload(error)
    });
  }
});

router.get('/generate-playlist', async (req, res) => {
  try {
    const { accessToken } = await getSpotifyAccessTokenForRequest(req);

    const [shortTermResponse, mediumTermResponse] = await Promise.all([
      axios.get('https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=short_term', {
        headers: { Authorization: `Bearer ${accessToken}` }
      }),
      axios.get('https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=medium_term', {
        headers: { Authorization: `Bearer ${accessToken}` }
      })
    ]);

    const uniqueTracks = dedupeById([
      ...shortTermResponse.data.items,
      ...mediumTermResponse.data.items
    ]);

    const tracks = shuffle(uniqueTracks).slice(0, 20).map(mapTrack);
    const currentDate = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

    return res.json({
      name: `Mes Top Morceaux - ${currentDate}`,
      description: 'Votre playlist personnalisée avec vos 20 morceaux préférés de ce mois',
      tracks
    });
  } catch (error) {
    return res.status(normalizeStatusFromError(error)).json({
      message: 'Failed to generate playlist',
      error: normalizeErrorPayload(error)
    });
  }
});

router.post('/save-playlist', async (req, res) => {
  try {
    const { accessToken, userId } = await getSpotifyAccessTokenForRequest(req);
    const { name, description, trackUris, tracks } = req.body || {};

    if (!Array.isArray(trackUris) || trackUris.length === 0) {
      return res.status(400).json({ message: 'No tracks provided' });
    }

    const profileResponse = await axios.get('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const spotifyUserId = profileResponse.data.id;
    const playlistName = name || 'Ma Playlist Personnalisée';
    const playlistDescription = description || 'Créée depuis RythmCast';

    const createPlaylistResponse = await axios.post(
      `https://api.spotify.com/v1/users/${spotifyUserId}/playlists`,
      {
        name: playlistName,
        description: playlistDescription,
        public: false
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const playlistId = createPlaylistResponse.data.id;

    await axios.post(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
      { uris: trackUris },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    await db.query(
      `INSERT INTO recommendations (
        user_id, playlist_id, playlist_name, playlist_image, tracks_count, spotify_uri, tracks
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        userId,
        playlistId,
        playlistName,
        createPlaylistResponse.data.images?.[0]?.url || null,
        trackUris.length,
        createPlaylistResponse.data.uri || null,
        JSON.stringify(tracks || [])
      ]
    );

    return res.json({
      success: true,
      playlistId,
      playlistUrl: createPlaylistResponse.data.external_urls?.spotify,
      message: 'Playlist créée et sauvegardée avec succès !'
    });
  } catch (error) {
    return res.status(normalizeStatusFromError(error)).json({
      message: 'Failed to save playlist',
      error: normalizeErrorPayload(error)
    });
  }
});

router.post('/generate-smart-playlist', async (req, res) => {
  try {
    const { accessToken } = await getSpotifyAccessTokenForRequest(req);
    const { weather, temperature, time, speed } = req.body || {};

    let energy = 0.5;
    let valence = 0.5;
    let tempo = 120;
    let playlistName = '';
    let playlistDescription = '';

    if (speed < 50) {
      energy = 0.3;
      tempo = 90;
      playlistName = 'Conduite Relaxée';
    } else if (speed < 90) {
      energy = 0.5;
      tempo = 120;
      playlistName = 'Route Tranquille';
    } else if (speed < 130) {
      energy = 0.7;
      tempo = 140;
      playlistName = 'Autoroute Dynamique';
    } else {
      energy = 0.9;
      tempo = 160;
      playlistName = 'Mode Sport';
    }

    if (weather === 'rain' || weather === 'rainy' || weather === 'drizzle') {
      valence = 0.3;
      energy = Math.max(0.3, energy - 0.2);
      playlistName = `Pluie - ${playlistName}`;
      playlistDescription = 'Mélodie pour la pluie';
    } else if (weather === 'clear' || weather === 'sunny') {
      valence = 0.8;
      playlistName = `Soleil - ${playlistName}`;
      playlistDescription = 'Vibes ensoleillées';
    } else if (weather === 'clouds' || weather === 'cloudy') {
      valence = 0.5;
      playlistName = `Nuageux - ${playlistName}`;
      playlistDescription = 'Ambiance douce';
    } else if (weather === 'snow') {
      valence = 0.6;
      energy = Math.max(0.3, energy - 0.1);
      playlistName = `Neige - ${playlistName}`;
      playlistDescription = 'Paysages hivernaux';
    } else if (weather === 'thunderstorm' || weather === 'storm') {
      valence = 0.4;
      energy = 0.8;
      playlistName = `Orage - ${playlistName}`;
      playlistDescription = 'Énergie électrique';
    }

    const hour = Number.parseInt(String(time || '').split(':')[0], 10);
    if (!Number.isNaN(hour)) {
      if (hour >= 5 && hour < 9) {
        valence = Math.min(1, valence + 0.2);
        playlistDescription = appendDescription(playlistDescription, 'Réveil en douceur');
      } else if (hour >= 9 && hour < 12) {
        energy = Math.min(1, energy + 0.1);
        playlistDescription = appendDescription(playlistDescription, 'Matinée productive');
      } else if (hour >= 12 && hour < 14) {
        valence = Math.min(1, valence + 0.1);
        playlistDescription = appendDescription(playlistDescription, 'Pause déjeuner');
      } else if (hour >= 14 && hour < 18) {
        energy = Math.min(1, energy + 0.15);
        playlistDescription = appendDescription(playlistDescription, 'Après-midi dynamique');
      } else if (hour >= 18 && hour < 22) {
        valence = 0.6;
        playlistDescription = appendDescription(playlistDescription, 'Soirée détente');
      } else {
        energy = Math.max(0.2, energy - 0.3);
        valence = 0.4;
        playlistDescription = appendDescription(playlistDescription, 'Nuit calme');
      }
    }

    if (temperature > 25) {
      valence = Math.min(1, valence + 0.1);
    } else if (temperature < 5) {
      energy = Math.max(0.2, energy - 0.1);
    }

    let timeRanges;
    if (energy < 0.4) {
      timeRanges = ['long_term', 'medium_term'];
    } else if (energy > 0.7) {
      timeRanges = ['short_term', 'medium_term'];
    } else {
      timeRanges = ['short_term', 'medium_term', 'long_term'];
    }

    const trackResponses = await Promise.all(
      timeRanges.map((range) => axios.get(`https://api.spotify.com/v1/me/top/tracks?time_range=${range}&limit=50`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      }))
    );

    const allTracks = trackResponses.flatMap((response) => response.data.items || []);
    let candidateTracks = dedupeById(allTracks);

    if (energy > 0.7) {
      candidateTracks = [...candidateTracks].sort((a, b) => b.popularity - a.popularity);
    } else if (energy < 0.4) {
      candidateTracks = [...candidateTracks].sort((a, b) => a.popularity - b.popularity);
    } else {
      candidateTracks = shuffle(candidateTracks);
    }

    if (valence < 0.4) {
      candidateTracks = [...candidateTracks.slice(0, 25), ...shuffle(candidateTracks.slice(25))];
    } else if (valence > 0.7) {
      candidateTracks = [...candidateTracks.slice(25), ...shuffle(candidateTracks.slice(0, 25))];
    }

    const selectedTracks = candidateTracks.slice(0, 20).map(mapTrack);

    return res.json({
      name: playlistName,
      description: playlistDescription,
      tracks: selectedTracks,
      parameters: {
        weather,
        temperature,
        time,
        speed,
        energy: energy.toFixed(2),
        valence: valence.toFixed(2),
        tempo
      }
    });
  } catch (error) {
    return res.status(normalizeStatusFromError(error)).json({
      message: 'Failed to generate smart playlist',
      error: normalizeErrorPayload(error)
    });
  }
});

router.post('/queue/enqueue', async (req, res) => {
  try {
    const { userId, type, payload } = req.body || {};
    if (!userId || !type) {
      return res.status(400).json({ message: 'userId and type are required' });
    }

    const job = await enqueueJob({ userId, type, payload: payload || {} });
    const size = await queueSize();
    return res.status(201).json({ queued: true, job, queueSize: size });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to enqueue job',
      error: normalizeErrorPayload(error)
    });
  }
});

router.post('/queue/dequeue', async (_req, res) => {
  try {
    const job = await dequeueJob();
    const size = await queueSize();
    return res.json({ job, queueSize: size });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to dequeue job',
      error: normalizeErrorPayload(error)
    });
  }
});

router.get('/queue/status', async (_req, res) => {
  try {
    const size = await queueSize();
    return res.json({ ready: isQueueReady(), queueSize: size });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to get queue status',
      error: normalizeErrorPayload(error)
    });
  }
});

module.exports = router;
