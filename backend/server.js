// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { testConnection } = require('./config/db');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Health check route — confirms the server is up
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Shop Management System backend is running' });
});

app.use('/api/auth', require('./routes/authRoutes'));

// TODO (Phase 3+): mount remaining routers here, e.g.
// app.use('/api/products', require('./routes/productRoutes'));

app.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  await testConnection();
});
