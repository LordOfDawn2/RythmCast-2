const api1 = window.APP_CONFIG.API1_URL;
const api2 = window.APP_CONFIG.API2_URL;

const asJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
};

document.getElementById('loadSongs').addEventListener('click', async () => {
  try {
    const data = await asJson(`${api2}/songs`);
    document.getElementById('songsOut').textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    document.getElementById('songsOut').textContent = error.message;
  }
});

document.getElementById('savePref').addEventListener('click', async () => {
  const username = document.getElementById('username').value;
  const mood = document.getElementById('mood').value;
  const song = document.getElementById('song').value;
  try {
    const data = await asJson(`${api1}/preferences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, mood, song })
    });
    document.getElementById('prefsOut').textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    document.getElementById('prefsOut').textContent = error.message;
  }
});

document.getElementById('loadPrefs').addEventListener('click', async () => {
  const username = document.getElementById('usernameFilter').value;
  try {
    const data = await asJson(`${api1}/preferences?username=${encodeURIComponent(username)}`);
    document.getElementById('prefsOut').textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    document.getElementById('prefsOut').textContent = error.message;
  }
});

document.getElementById('healthCheck').addEventListener('click', async () => {
  try {
    const [frontendHealth, api1Health, api2Health] = await Promise.all([
      asJson('/health'),
      asJson(`${api1}/health`),
      asJson(`${api2}/health`)
    ]);
    document.getElementById('healthOut').textContent = JSON.stringify({ frontendHealth, api1Health, api2Health }, null, 2);
  } catch (error) {
    document.getElementById('healthOut').textContent = error.message;
  }
});
