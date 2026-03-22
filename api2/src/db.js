const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      spotify_id TEXT UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS spotify_tokens (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS recommendations (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      playlist_id TEXT NOT NULL,
      playlist_name TEXT NOT NULL,
      playlist_image TEXT,
      speed TEXT,
      weather TEXT,
      time_of_day TEXT,
      spotify_uri TEXT,
      tracks_count INTEGER,
      tracks JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_played_at TIMESTAMPTZ
    );
  `);
}

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  initDb
};
