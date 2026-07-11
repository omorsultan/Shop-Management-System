// frontend/js/main.js
// Simple sanity check: confirms frontend can reach the backend API.

const API_BASE_URL = 'http://localhost:5000/api';

async function checkBackendHealth() {
  const statusEl = document.getElementById('health-status');
  try {
    const res = await fetch(`${API_BASE_URL}/health`);
    const data = await res.json();
    statusEl.textContent = data.message;
    statusEl.style.color = 'green';
  } catch (err) {
    statusEl.textContent = 'Backend not reachable. Is the server running?';
    statusEl.style.color = 'red';
  }
}

document.addEventListener('DOMContentLoaded', checkBackendHealth);
