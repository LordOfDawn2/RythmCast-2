const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { initDb } = require('./db');
const { connectQueue } = require('./queue');

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const spotifyRoutes = require('./routes/spotifyRoutes');
app.use('/api/spotify', spotifyRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'api2-spotify' });
});

const PORT = process.env.PORT || 5002;

initDb()
  .then(async () => {
    await connectQueue();
    console.log('API2 PostgreSQL connected');
    app.listen(PORT, () => {
      console.log(`API2 running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('API2 PostgreSQL connection error:', error.message);
    process.exit(1);
  });
