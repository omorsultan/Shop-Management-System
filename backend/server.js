// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { testConnection } = require('./config/db');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Serve uploaded product images statically, e.g. http://localhost:5000/uploads/products/xyz.jpg
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check route — confirms the server is up
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Shop Management System backend is running' });
});

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/categories', require('./routes/categoryRoutes'));
app.use('/api/suppliers', require('./routes/supplierRoutes'));
app.use('/api/customers', require('./routes/customerRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/purchases', require('./routes/purchaseRoutes'));

// TODO (Phase 5+): mount remaining routers here, e.g.
// app.use('/api/sales', require('./routes/salesRoutes'));

// Multer / general error handler (catches file-type and file-size errors from uploadMiddleware)
app.use((err, req, res, next) => {
  if (err) {
    console.error('Unhandled error:', err.message);
    return res.status(400).json({ error: err.message });
  }
  next();
});

app.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  await testConnection();
});
