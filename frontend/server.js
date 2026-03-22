const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;
const API1_URL = process.env.API1_URL || 'http://localhost:5001';
const API2_URL = process.env.API2_URL || 'http://localhost:5002';

app.use('/api/users', createProxyMiddleware({
  target: `${API1_URL}/api/users`,
  changeOrigin: true
}));

app.use('/api/spotify', createProxyMiddleware({
  target: `${API2_URL}/api/spotify`,
  changeOrigin: true
}));

app.use(express.static(path.join(__dirname, 'src')));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'index.html'));
});

app.get('/analysis.html', (_req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'analysis.html'));
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'frontend' });
});

app.listen(PORT, () => {
  console.log(`Frontend running on port ${PORT}`);
});
